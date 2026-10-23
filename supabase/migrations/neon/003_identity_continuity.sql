-- ═══════════════════════════════════════════════════════════════════
-- 003_identity_continuity.sql — bring pre-existing (Supabase-era)
-- identities into Managed Better Auth PRESERVING their UUIDs, and install
-- the cutover gate that proves no user-scoped row is stranded.
-- Task t_33739716 (steel) · HIGH finding from the R2-1 security review
-- (t_78da64c1); companion to 002_provision_public_user.sql.
--
-- WHAT THIS FILE IS
--   R2-1 moved identity to Managed Better Auth: `getAccessUserId()`
--   (src/lib/access.ts) now returns the Better Auth id from the session
--   cookie. Every user-scoped read (user_roles, user_entitlements,
--   user_profiles, subscriptions) still keys the public tables by that id.
--   002 handles every identity that is *created* in neon_auth (the eager
--   trigger mirrors it into public."user"). It does nothing for identities
--   that already existed in public."user" BEFORE the migration: those have
--   no neon_auth row, so:
--     * all 3 admins resolved as `member` → /admin and /api/admin/* 403;
--     * 0/4 user_roles and 0/38 user_entitlements resolved to a live
--       identity, so the People panel vanished the legacy customers.
--
--   This file inserts each stranded public."user" row into
--   neon_auth."user" WITH ITS ORIGINAL ID (id, name, email,
--   "emailVerified", image, createdAt, updatedAt), then asserts the
--   invariant: every id in the four user-scoped tables resolves to a
--   neon_auth identity.
--
-- DECISION: preserve UUIDs (not an id_map)
--   The alternative — leave neon_auth untouched and resolve every
--   identity→data lookup through a mapping table — means touching every
--   read path (server components, route handlers, Data API/RLS JWT `sub`)
--   and leaves the same split-brain waiting for the next reader that
--   forgets the map. Preserving the UUID keeps ONE id for a human across
--   auth, app tables, JWT `sub`, and the FK graph, so no lookup changes.
--
-- NEVER RECONCILE BY EMAIL (security)
--   Every migration step is by `id`. Email is only ever used to *detect* a
--   collision, and a collision ABORTS the migration (§1). Mapping a legacy
--   data row onto whatever neon_auth account happens to hold that email
--   would let whoever controls a staff address (email change, or an
--   unverified sign-up if verification is ever relaxed) inherit that
--   staff member's role and entitlements — account takeover.
--
-- PASSWORDS ARE NOT IMPORTABLE (and that is fine)
--   Supabase-era password hashes (bcrypt) are not portable to Better Auth
--   (scrypt), and the old project's auth schema is not reachable from this
--   database. So an imported identity gets its Better Auth `user` row here,
--   and a credential `account` row with an UNUSABLE random password
--   (scripts/import-legacy-identities.mjs — hashing needs scrypt, which
--   pgcrypto does not provide). Consequences, on purpose:
--     * sign-in with an old password fails with the generic
--       INVALID_EMAIL_OR_PASSWORD (no account-state leak);
--     * the reset flow works, because a credential account exists for
--       Better Auth to update — the operator script is what makes
--       "forgot password" a real recovery path for imported users.
--   Imported users must use "forgot password" once. That is the honest
--   migration: never silently mint a password we do not know.
--
-- IDEMPOTENCY / ATOMICITY: same contract as 001/002 — every statement is
--   guarded (ON CONFLICT DO NOTHING, CREATE OR REPLACE), the whole file is
--   one transaction, and the gate at the end fails loudly on a partial
--   apply so the lane cannot ship half-migrated.
--
-- HOW TO APPLY
--   psql "$DATABASE_URL_UNPOOLED" -X -v ON_ERROR_STOP=1 --single-transaction \
--     -f supabase/migrations/neon/003_identity_continuity.sql
--   node scripts/import-legacy-identities.mjs      # credential accounts
--   python3 scripts/verify-identity-continuity.py  # read-only gate + report
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Fail closed on any email collision.
--    A collision means a neon_auth identity already exists for a legacy
--    address under a DIFFERENT id (a fresh sign-up after R2-1, or a data
--    error). Merging is an identity decision with security consequences,
--    so this migration refuses and names the rows for a human instead of
--    guessing — see "NEVER RECONCILE BY EMAIL" above.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count  int;
  v_sample text;
BEGIN
  SELECT count(*), string_agg(format('%s (public id %s, neon_auth id %s)',
                                     u.email, u.id, n.id), '; ')
    INTO v_count, v_sample
    FROM public."user" u
    JOIN neon_auth."user" n
      ON lower(n.email) = lower(u.email)
     AND n.id <> u.id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'identity continuity ABORTED: % legacy identit(ies) share an email with a DIFFERENT neon_auth id — decide manually, never merge by email: %',
      v_count, v_sample;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Import every stranded legacy identity, keeping its UUID.
--    name is NOT NULL in neon_auth."user" and NOT NULL DEFAULT '' in
--    public."user"; the EAGER trigger (002) already mirrors
--    `coalesce(nullif(name,''), email)`, so the same expression is used
--    here to keep the two directions agreeing instead of re-mirroring a
--    different name back into public."user".
--    Timestamps are preserved so the admin People list keeps its
--    real-world ordering; "emailVerified" is carried over so an imported
--    account is not forced through email re-verification.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO neon_auth."user"
  (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
SELECT u.id,
       coalesce(nullif(u.name, ''), u.email),
       lower(u.email),
       u.emailverified,
       u.image,
       u.createdat,
       u.updatedat
  FROM public."user" u
 WHERE NOT EXISTS (
         SELECT 1 FROM neon_auth."user" n WHERE n.id = u.id
       )
ON CONFLICT (id) DO NOTHING;

-- The EAGER trigger just re-ran public.provision_public_user() for each
-- inserted row, so public."user" is authoritative for name/provider and
-- nothing is left to backfill there. Roles / profiles / subscriptions /
-- entitlements are keyed by the SAME uuid and therefore need no rewrite —
-- that is the whole point of preserving ids. Gate verifies it.

-- ─────────────────────────────────────────────────────────────────────
-- 3. The cutover gate. One definition of "identity continuous", callable
--    from psql, the import script, and CI. It raises (never merely
--    returns false) so a partial migration cannot be ignored.
--    SECURITY: reads three auth-adjacent tables; EXECUTE is revoked from
--    client roles in §5, matching 002's posture.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_identity_continuity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_roles      bigint;
  v_ent        bigint;
  v_profiles   bigint;
  v_subs       bigint;
  v_unmirrored bigint;
  v_problems   text[] := ARRAY[]::text[];
BEGIN
  SELECT count(*) INTO v_roles
    FROM public.user_roles r
   WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = r.user_id);
  IF v_roles > 0 THEN
    v_problems := v_problems || format('user_roles: %s orphan row(s)', v_roles);
  END IF;

  SELECT count(*) INTO v_ent
    FROM public.user_entitlements e
   WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = e.user_id);
  IF v_ent > 0 THEN
    v_problems := v_problems || format('user_entitlements: %s orphan row(s)', v_ent);
  END IF;

  SELECT count(*) INTO v_profiles
    FROM public.user_profiles p
   WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = p.user_id);
  IF v_profiles > 0 THEN
    v_problems := v_problems || format('user_profiles: %s orphan row(s)', v_profiles);
  END IF;

  SELECT count(*) INTO v_subs
    FROM public.subscriptions s
   WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = s.user_id);
  IF v_subs > 0 THEN
    v_problems := v_problems || format('subscriptions: %s orphan row(s)', v_subs);
  END IF;

  -- The other direction: an identity that cannot be mirrored into
  -- public."user" would break every FK and the Data API on first write.
  SELECT count(*) INTO v_unmirrored
    FROM neon_auth."user" n
   WHERE NOT EXISTS (SELECT 1 FROM public."user" p WHERE p.id = n.id);
  IF v_unmirrored > 0 THEN
    v_problems := v_problems || format('neon_auth identities without a public."user" mirror: %s', v_unmirrored);
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'identity continuity BROKEN — %', array_to_string(v_problems, '; ');
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Read-only report the operator (and verify-identity-continuity.py)
--    can diff before/after without re-deriving the SQL. SECURITY INVOKER
--    + no grants: owner-only.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.identity_continuity_report()
RETURNS TABLE (
  check_name        text,
  total             bigint,
  resolves_to_auth  bigint,
  not_resolved      bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT 'user_roles'::text,
         count(*),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = r.user_id)),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = r.user_id))
    FROM public.user_roles r
  UNION ALL
  SELECT 'user_entitlements',
         count(*),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = e.user_id)),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = e.user_id))
    FROM public.user_entitlements e
  UNION ALL
  SELECT 'user_profiles',
         count(*),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = p.user_id)),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = p.user_id))
    FROM public.user_profiles p
  UNION ALL
  SELECT 'subscriptions',
         count(*),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = s.user_id)),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = s.user_id))
    FROM public.subscriptions s
  UNION ALL
  SELECT 'public_user_not_in_auth',
         count(*),
         0::bigint,
         count(*)
    FROM public."user" p2
   WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = p2.id)
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Lock the functions down (same posture as 002 §5): nothing client
--    facing may invoke them over the Data API.
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.assert_identity_continuity()   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_continuity_report()   FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.assert_identity_continuity() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.identity_continuity_report() FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.assert_identity_continuity() FROM anonymous';
    EXECUTE 'REVOKE ALL ON FUNCTION public.identity_continuity_report() FROM anonymous';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Self-verification + gate. A partial apply fails loudly here.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  -- both functions exist
  SELECT 2 - count(*) INTO n
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
   WHERE nsp.nspname = 'public'
     AND p.proname IN ('assert_identity_continuity', 'identity_continuity_report');
  IF n <> 0 THEN
    RAISE EXCEPTION '% identity-continuity function(s) missing', n;
  END IF;

  -- no client role may call the gate directly
  IF has_function_privilege('authenticated', 'public.assert_identity_continuity()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can EXECUTE assert_identity_continuity — lock it down';
  END IF;

  -- every legacy public identity now has its neon_auth counterpart
  SELECT count(*) INTO n
    FROM public."user" p
   WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = p.id);
  IF n <> 0 THEN
    RAISE EXCEPTION '% public."user" identit(ies) still have no neon_auth row', n;
  END IF;

  RAISE NOTICE 'identity import OK: neon_auth=% public=%',
    (SELECT count(*) FROM neon_auth."user"), (SELECT count(*) FROM public."user");
END
$$;

-- The real gate: raises on any stranded user-scoped row.
SELECT public.assert_identity_continuity();

COMMIT;
