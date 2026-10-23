-- ═══════════════════════════════════════════════════════════════════
-- 002_provision_public_user.sql — mirror Managed Better Auth identities
-- into public."user" so every user-scoped FK resolves
-- Task t_749fcf79 (steel) · follow-up to R1-5 finding (t_6ad12e2e)
--
-- WHAT THIS FILE IS
--   The single provisioning path for the FK target of the whole schema.
--   Eleven FK columns across ten tables reference public."user"(id):
--     lesson_completion.user_id      read_progress.user_id
--     quiz_attempt.user_id           quiz_run.user_id
--     user_profiles.user_id          completion_events.user_id
--     subscriptions.user_id          user_entitlements.user_id
--     user_entitlements.granted_by   user_roles.user_id
--     admin_audit_log.actor_user_id
--
--   Managed Better Auth (neon_auth schema, role `neon_auth`) owns sign-up and
--   writes only neon_auth."user". It knows nothing about public."user", and
--   the Data API's `authenticated` role has no INSERT there (001_rls.sql
--   REVOKEs ALL on public."user" — that posture is kept). So a brand-new
--   account's first write died with
--     ERROR 23503: insert or update on table "lesson_completion" violates
--     foreign key constraint ... Key is not present in table "user".
--   measured live by R1-5.
--
-- TWO TRIGGERS, ONE FUNCTION (no per-table workaround):
--   1. EAGER — AFTER INSERT OR UPDATE on neon_auth."user" calls
--      public.provision_public_user(id). Every future sign-up has its
--      public."user" row before the auth transaction commits.
--   2. LAZY HEAL — BEFORE INSERT OR UPDATE on *every table that has an FK to
--      public."user"*, attached by a catalog-driven loop (pg_constraint), so
--      a future user-scoped table is covered on re-apply without editing this
--      file. It reads the caller's id from request.jwt.claims->>'sub' and
--      provisions the missing row *inside the same transaction*, before
--      Postgres runs the FK check (FK checks are AFTER ROW triggers). This
--      covers accounts that predate the trigger, a row deleted during a data
--      fix, and any sign-up the auth service performs while the trigger is
--      temporarily absent. Both paths call the same function, so there is one
--      definition of "provisioned".
--   3. PROVIDER — AFTER INSERT OR UPDATE on neon_auth.account refreshes
--      public."user".provider (see §1: `provider` is a new, nullable column;
--      public."user" had no place to carry the provider identity).
--
-- SAFETY (the trigger MUST NEVER break authentication):
--   * public.provision_public_user() is SECURITY DEFINER, owned by
--     neondb_owner (owner of public."user", member of neon_auth), so the
--     `neon_auth` service role and `authenticated` can both cause the write
--     without holding INSERT on public."user" themselves.
--   * It swallows exceptions (RAISE WARNING) — a duplicate email from the
--     Supabase-era import must not roll back a sign-up.
--   * Idempotent and race-safe: INSERT ... ON CONFLICT (id) DO UPDATE, so
--     concurrent first requests cannot 500 or duplicate.
--   * SECURITY DEFINER functions carry `SET search_path = public, pg_catalog`
--     and are REVOKEd from PUBLIC/authenticated/anonymous. Trigger invocation
--     does not consult EXECUTE ACLs, so the triggers still fire; a client can
--     never call the function over the Data API.
--   * No FK constraint and no RLS policy is weakened. Cross-user writes are
--     still rejected by RLS (provisioning the caller's own row does not make
--     someone else's id exist).
--
-- `provider` column: providerId of the user's first non-credential account
--   (e.g. 'google', 'github'), else 'credential' for email+password. It comes
--   from neon_auth.account, whose INSERT lands after neon_auth."user"'s, hence
--   the third trigger.
--
-- IDEMPOTENCY / ATOMICITY: same contract as 001_rls.sql — every object is
--   guarded (CREATE OR REPLACE, DROP TRIGGER IF EXISTS, ADD COLUMN IF NOT
--   EXISTS), the whole file is one transaction, and §5 verifies the invariant
--   so a partial apply fails loudly.
--
-- HOW TO APPLY (after 001_rls.sql)
--   psql "$DATABASE_URL_UNPOOLED" -X -v ON_ERROR_STOP=1 --single-transaction \
--     -f supabase/migrations/neon/002_provision_public_user.sql
--   Verify with: scripts/verify-user-provisioning.py
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. public."user" gains the provider identity column
--    Additive and nullable: existing rows and inserts that do not know a
--    provider keep working, and no NOT-NULL column of public."user" is ever
--    left without a value (id/name/email/emailverified/createdat/updatedat
--    are all supplied by the provisioning function).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS provider text;

-- Re-assert the reviewed posture (001_rls.sql §4, t_77f4d97e): RLS ENABLED with
-- ZERO policies = default-deny for every non-owner role. Adding a column must
-- never become the thing that lets a client role reach the auth table, and the
-- Neon Data API has been observed toggling this flag, so it is set explicitly
-- here rather than inherited from the previous apply.
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 2. The one provisioning function
--    Copies the identity row out of neon_auth."user" (email, name,
--    emailVerified, image, timestamps) and the provider identity out of
--    neon_auth.account. ON CONFLICT (id) DO UPDATE keeps it idempotent,
--    race-safe, and able to re-sync a changed name/verification flag.
--    Exceptions are swallowed on purpose — see SAFETY above.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_public_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id        uuid;
  v_name      text;
  v_email     text;
  v_verified  boolean;
  v_image     text;
  v_created   timestamptz;
  v_updated   timestamptz;
  v_provider  text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT u.id, u.name, u.email, u."emailVerified", u.image, u."createdAt", u."updatedAt"
    INTO v_id, v_name, v_email, v_verified, v_image, v_created, v_updated
    FROM neon_auth."user" u
   WHERE u.id = p_user_id;

  -- Not a Managed Better Auth identity (fixture, service account, typo):
  -- nothing to mirror. The FK check will produce the real error.
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  -- Provider identity: prefer a real provider over the password account.
  SELECT a."providerId"
    INTO v_provider
    FROM neon_auth.account a
   WHERE a."userId" = p_user_id
   ORDER BY (a."providerId" = 'credential'), a."createdAt"
   LIMIT 1;

  INSERT INTO public."user"
    (id, name, email, emailverified, image, createdat, updatedat, provider)
  VALUES
    (v_id,
     coalesce(nullif(v_name, ''), v_email),   -- name is NOT NULL in public."user"
     v_email,
     coalesce(v_verified, false),
     v_image,
     coalesce(v_created, now()),
     coalesce(v_updated, now()),
     v_provider)
  ON CONFLICT (id) DO UPDATE
     SET name         = excluded.name,
         email        = excluded.email,
         emailverified = excluded.emailverified,
         image        = excluded.image,
         provider     = coalesce(excluded.provider, public."user".provider),
         updatedat    = excluded.updatedat;
EXCEPTION
  WHEN others THEN
    -- Never break the caller (sign-up, auth callback, first Data API write).
    -- The lazy trigger (below) retries on the next statement; a permanent
    -- failure shows up as the FK error it really is.
    RAISE WARNING 'provision_public_user(%): % (%)', p_user_id, SQLERRM, SQLSTATE;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. EAGER trigger — every Managed Better Auth identity insert/update
--    fires the provisioning function. Creating a trigger on the
--    neon_auth-owned table works because neondb_owner is a member of the
--    `neon_auth` role (verified live: has_table_privilege(
--    'neondb_owner','neon_auth."user"','TRIGGER') = true).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.neon_auth_user_provisioned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM public.provision_public_user(NEW.id);
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'neon_auth."user" provisioning trigger: % (%)', SQLERRM, SQLSTATE;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS provision_public_user ON neon_auth."user";
CREATE TRIGGER provision_public_user
  AFTER INSERT OR UPDATE OF email, name, "emailVerified", image
  ON neon_auth."user"
  FOR EACH ROW
  EXECUTE FUNCTION public.neon_auth_user_provisioned();

-- Provider identity lands in neon_auth.account *after* the user row, so the
-- provider column is refreshed separately.
CREATE OR REPLACE FUNCTION public.neon_auth_account_provisioned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public."user"
     SET provider  = CASE
                       WHEN provider IS NULL OR provider = 'credential' THEN NEW."providerId"
                       ELSE provider
                     END,
         updatedat = now()
   WHERE id = NEW."userId"
     AND NEW."providerId" <> 'credential';
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'neon_auth.account provisioning trigger: % (%)', SQLERRM, SQLSTATE;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS provision_public_user_provider ON neon_auth.account;
CREATE TRIGGER provision_public_user_provider
  AFTER INSERT OR UPDATE OF "providerId"
  ON neon_auth.account
  FOR EACH ROW
  EXECUTE FUNCTION public.neon_auth_account_provisioned();

-- ─────────────────────────────────────────────────────────────────────
-- 4. LAZY HEAL trigger — attached to every table with an FK to
--    public."user", discovered from the catalog (not hand-listed), so the
--    class of failure cannot come back through a table added later.
--    Reads the caller's identity from the JWT claims the Data API sets.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_public_user_from_jwt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_sub text;
BEGIN
  v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';

  -- No JWT (server-side owner connection, background job) or a non-uuid
  -- subject: leave it to the FK / RLS layer, exactly as before.
  IF v_sub IS NULL OR v_sub !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."user" WHERE id = v_sub::uuid) THEN
    PERFORM public.provision_public_user(v_sub::uuid);
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'ensure_public_user_from_jwt: % (%)', SQLERRM, SQLSTATE;
    RETURN NEW;
END
$$;

DO $$
DECLARE
  r    record;
  cnt  int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT c.conrelid::regclass::text AS child
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'public."user"'::regclass
       AND c.conrelid <> 'public."user"'::regclass
     ORDER BY 1
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS provision_public_user_row ON %s', r.child);
    EXECUTE format(
      'CREATE TRIGGER provision_public_user_row '
      'BEFORE INSERT OR UPDATE ON %s '
      'FOR EACH ROW EXECUTE FUNCTION public.ensure_public_user_from_jwt()',
      r.child);
    cnt := cnt + 1;
  END LOOP;

  IF cnt = 0 THEN
    RAISE EXCEPTION 'no FK to public."user" found — schema is not the expected shape';
  END IF;
  RAISE NOTICE 'provisioning triggers attached to % tables referencing public."user"', cnt;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Lock the functions down: trigger invocation does not need EXECUTE,
--    so no client role may call them directly.
-- ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.provision_public_user(uuid)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.neon_auth_user_provisioned()         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.neon_auth_account_provisioned()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_public_user_from_jwt()        FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.provision_public_user(uuid) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_public_user_from_jwt() FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.provision_public_user(uuid) FROM anonymous';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_public_user_from_jwt() FROM anonymous';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Backfill: every identity that already exists in neon_auth gets its
--    mirror row now (idempotent — the function is ON CONFLICT DO UPDATE).
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r      record;
  made   int := 0;
  before bigint;
  after  bigint;
BEGIN
  SELECT count(*) INTO before FROM public."user";

  FOR r IN SELECT id FROM neon_auth."user" LOOP
    PERFORM public.provision_public_user(r.id);
  END LOOP;

  SELECT count(*) INTO after FROM public."user";
  made := after - before;
  RAISE NOTICE 'backfill: % new public."user" rows (public=% neon_auth=%)',
    made, after, (SELECT count(*) FROM neon_auth."user");
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Self-verification — a partial apply must fail loudly, not silently.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  missing int;
  expected_fk int;
  covered int;
  n int;
BEGIN
  -- column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'provider'
  ) THEN
    RAISE EXCEPTION 'public."user".provider is missing';
  END IF;

  -- functions
  SELECT 3 - count(*) INTO missing
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
   WHERE nsp.nspname = 'public'
     AND p.proname IN ('provision_public_user', 'neon_auth_user_provisioned',
                       'ensure_public_user_from_jwt');
  IF missing <> 0 THEN
    RAISE EXCEPTION '% provisioning function(s) missing', missing;
  END IF;

  -- eager triggers
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'neon_auth."user"'::regclass
                    AND tgname = 'provision_public_user' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'eager trigger on neon_auth."user" is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'neon_auth.account'::regclass
                    AND tgname = 'provision_public_user_provider' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'provider trigger on neon_auth.account is missing';
  END IF;

  -- lazy triggers cover every FK child table
  SELECT count(DISTINCT conrelid) INTO expected_fk
    FROM pg_constraint
   WHERE contype = 'f' AND confrelid = 'public."user"'::regclass
     AND conrelid <> 'public."user"'::regclass;

  SELECT count(DISTINCT t.tgrelid) INTO covered
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE t.tgname = 'provision_public_user_row'
     AND NOT t.tgisinternal
     AND nsp.nspname = 'public';

  IF covered <> expected_fk THEN
    RAISE EXCEPTION 'lazy provisioning triggers on % tables, % FK children expected',
      covered, expected_fk;
  END IF;

  -- no client role can invoke the functions directly
  IF has_function_privilege('authenticated', 'public.provision_public_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can EXECUTE provision_public_user — lock it down';
  END IF;

  -- the auth table is still default-deny for client roles (t_77f4d97e posture)
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public' AND c.relname = 'user' AND c.relrowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'public."user" lost RLS — it must stay default-deny';
  END IF;
  SELECT count(*) INTO n
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user';
  IF n <> 0 THEN
    RAISE EXCEPTION 'public."user" has % policy/policies — default-deny requires zero', n;
  END IF;

  -- nothing in neon_auth is left without a public mirror
  SELECT count(*) INTO n
    FROM neon_auth."user" au
   WHERE NOT EXISTS (SELECT 1 FROM public."user" pu WHERE pu.id = au.id);
  IF n <> 0 THEN
    RAISE EXCEPTION '% neon_auth identities still have no public."user" row', n;
  END IF;

  RAISE NOTICE 'user provisioning OK: % FK tables covered, 0 identities unmirrored, client EXECUTE denied',
    covered;
END
$$;

COMMIT;
