#!/usr/bin/env python3
"""RLS isolation check for the Neon database (task t_ce10555b, reused by R1-4/R1-5).

Proves, against the live Neon database, that:
  1. the policy inventory on Neon is complete — 34 policies over the same 14
     public tables as the Supabase origin, checked by name AND command, so a
     dropped or renamed policy fails here even if it happens not to leak;
  2. every user-scoped table has RLS enabled and at least one policy;
  3. user A cannot read user B's rows on any of the ten user-scoped tables;
  4. cross-user writes are rejected, and the legitimate own-user writes the
     product depends on still succeed (a policy set that blocks everything
     would pass a leak test while breaking the app);
  5. the client-forge guards still deny quiz_attempt / quiz_run writes;
  6. an anonymous caller (no JWT) reads zero user rows but still reads the
     genuinely public catalog tables;
  7. `public."user"` (the auth user table) is not readable by either role.

It never mutates persistent state: everything runs in ONE transaction that is
rolled back, so it is safe to run against the shared dev branch and safe to
re-run. Exit 0 = clean; exit 1 = a policy is missing/loosened or a leak exists.

Usage:
    python3 scripts/rls-isolation-check.py
    DATABASE_URL_UNPOOLED=postgres://... python3 scripts/rls-isolation-check.py

Connection string resolution: $DATABASE_URL_UNPOOLED, then .env.local in the
repo root. Never prints the connection string.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"

# (table, column that carries the owner) for the ten user-scoped tables.
USER_SCOPED = [
    ("lesson_completion", "user_id"),
    ("read_progress", "user_id"),
    ("quiz_attempt", "user_id"),
    ("quiz_run", "user_id"),
    ("user_profiles", "user_id"),
    ("completion_events", "user_id"),
    ("user_roles", "user_id"),
    ("subscriptions", "user_id"),
    ("user_entitlements", "user_id"),
    ("admin_audit_log", "actor_user_id"),
]

# The authoritative inventory of the Supabase origin, read from
# pg_policies on zrggxfdyptiahskogwnn on 2026-10-23 (34 policies, 14 tables).
EXPECTED_POLICIES = [
    ("admin_audit_log", "audit_insert_admin", "INSERT"),
    ("admin_audit_log", "audit_select_admin", "SELECT"),
    ("catalog_groups", "groups_admin_write", "ALL"),
    ("catalog_groups", "groups_select_public", "SELECT"),
    ("catalog_sections", "sections_admin_write", "ALL"),
    ("catalog_sections", "sections_select_public", "SELECT"),
    ("completion_events", "completion_events_insert_own", "INSERT"),
    ("completion_events", "completion_events_select_own", "SELECT"),
    ("course_prerequisites", "prereqs_admin_write", "ALL"),
    ("course_prerequisites", "prereqs_select_public", "SELECT"),
    ("courses", "courses_admin_write", "ALL"),
    ("courses", "courses_select_live_or_admin", "SELECT"),
    ("lesson_completion", "Users can delete their own lesson completion", "DELETE"),
    ("lesson_completion", "Users can insert their own lesson completion", "INSERT"),
    ("lesson_completion", "Users can update their own lesson completion", "UPDATE"),
    ("lesson_completion", "Users can view their own lesson completion", "SELECT"),
    ("quiz_attempt", "Users can view their own quiz attempts", "SELECT"),
    ("quiz_attempt", "quiz_attempt deny client delete", "DELETE"),
    ("quiz_attempt", "quiz_attempt deny client insert", "INSERT"),
    ("quiz_attempt", "quiz_attempt deny client update", "UPDATE"),
    ("quiz_run", "Users can view their own quiz runs", "SELECT"),
    ("quiz_run", "quiz_run deny client insert", "INSERT"),
    ("read_progress", "Users can delete their own read progress", "DELETE"),
    ("read_progress", "Users can insert their own read progress", "INSERT"),
    ("read_progress", "Users can update their own read progress", "UPDATE"),
    ("read_progress", "Users can view their own read progress", "SELECT"),
    ("subscriptions", "subscriptions_select_own_or_admin", "SELECT"),
    ("user_entitlements", "entitlements_admin_write", "ALL"),
    ("user_entitlements", "entitlements_select_own_or_admin", "SELECT"),
    ("user_profiles", "users select own profile", "SELECT"),
    ("user_profiles", "users update own profile", "UPDATE"),
    ("user_profiles", "users upsert own profile", "INSERT"),
    ("user_roles", "user_roles_admin_write", "ALL"),
    ("user_roles", "user_roles_select_own", "SELECT"),
]

EXPECTED_POLICY_COUNT = len(EXPECTED_POLICIES)

ASSERTION_HELPERS = """
create function pg_temp.eq(label text, actual bigint, expected bigint) returns text
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: got %, expected %', label, actual, expected;
  end if;
  return 'PASS ' || label || ' got=' || actual;
end $$;

create function pg_temp.is_(label text, actual text, expected text) returns text
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: got %, expected %', label, actual, expected;
  end if;
  return 'PASS ' || label || ' got=' || actual;
end $$;

-- Runs a statement as the CURRENT role and reports the outcome instead of
-- aborting the transaction, so denied/forbidden writes can be asserted.
create function pg_temp.try_sql(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'allowed';
exception when others then
  return 'denied:' || sqlstate;
end $$;

-- Same, but reports how many rows the statement touched: an UPDATE/DELETE that
-- RLS filters out SUCCEEDS with 0 rows (it is not an error), so "no leak" on a
-- write has to be asserted as row count, not as an exception.
create function pg_temp.try_rows(stmt text) returns text
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return 'rows:' || n;
exception when others then
  return 'denied:' || sqlstate;
end $$;
"""


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if url:
        return url
    env_path = os.path.join(REPO_ROOT, ".env.local")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("DATABASE_URL_UNPOOLED="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(
        "FAIL: no DATABASE_URL_UNPOOLED in the environment and none found in "
        f"{env_path}"
    )


def build_sql() -> str:
    policy_values = ",\n    ".join(
        "('%s','%s','%s')" % (t.replace("'", "''"), p.replace("'", "''"), c)
        for t, p, c in EXPECTED_POLICIES
    )
    tables_sql = ", ".join("'%s'" % t for t, _ in USER_SCOPED)

    seed = []
    for uid in (USER_A, USER_B):
        seed.append(
            f"""insert into public."user"(id, name, email) values
      ('{uid}', 'rls-check {uid[-2:]}', 'rls-check-{uid[-2:]}@rls-isolation.test');"""
        )
        seed.append(
            f"insert into public.lesson_completion(user_id, lesson_slug) values ('{uid}', 'rls-check');"
        )
        seed.append(
            f"insert into public.read_progress(user_id, content_type, content_slug) values ('{uid}', 'blog', 'rls-check');"
        )
        seed.append(
            f"""insert into public.quiz_attempt(user_id, quiz_name, question_index,
        correct_answer_index, user_answer_index, is_correct)
      values ('{uid}', 'rls-check', 0, 1, 1, true);"""
        )
        seed.append(
            f"""insert into public.quiz_run(user_id, quiz_name, correct, total, score)
      values ('{uid}', 'rls-check', 1, 1, 100);"""
        )
        seed.append(
            f"insert into public.user_profiles(user_id, display_name) values ('{uid}', 'rls-check');"
        )
        seed.append(
            f"insert into public.user_roles(user_id, role) values ('{uid}', 'member');"
        )
        seed.append(
            f"insert into public.subscriptions(user_id) values ('{uid}');"
        )
        seed.append(
            f"""insert into public.user_entitlements(user_id, course_id, source)
      select '{uid}', c.id, 'granted' from public.courses c
      order by c.series_slug limit 1;"""
        )
        seed.append(
            f"""insert into public.completion_events(user_id, event_type, lesson, lesson_slug)
      values ('{uid}', 'lesson', 1, 'rls-check');"""
        )
        # admin_audit_log is GENERATED ALWAYS AS IDENTITY and its sequence is
        # BEHIND the imported data on the Neon branch (max(id)=82,
        # last_value=2 — see the NOTE the script prints), so a plain insert
        # collides on the primary key. Override the id here rather than
        # touching the sequence: this check must not depend on, or repair,
        # unrelated environment state.
        seed.append(
            f"""insert into public.admin_audit_log(id, actor_user_id, action, target_type)
      overriding system value
      select coalesce((select max(id) from public.admin_audit_log), 0) + 1,
             '{uid}', 'rls-check', 'rls-isolation-check';"""
        )

    def phase_body(uid: str, other: str, expect_col: str) -> str:
        out = [
            "set local role authenticated;",
            f"-- the JWT the Data API would have validated for this user",
            "select pg_temp.is_("
            f"'{uid[-2:]}.claims.sub_is_me', "
            f"set_config('request.jwt.claims', '{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}', true)::jsonb ->> 'sub', "
            f"'{uid}');",
            f"select pg_temp.is_('{uid[-2:]}.auth_uid_matches', auth.uid()::text, '{uid}');",
            "",
            "-- own rows visible, other user's rows invisible",
        ]
        for table, col in USER_SCOPED:
            # admin_audit_log is admin-only: a non-admin sees 0 rows even for
            # rows it acted on. Every other table shows exactly the caller's
            # own rows (pg_temp.expect was computed from the seeded data).
            if table == "admin_audit_log":
                exp_expr = "0"
            else:
                exp_expr = f"(select {expect_col} from pg_temp.expect where tbl = '{table}')"
            out.append(
                f"select pg_temp.eq('{uid[-2:]}.{table}.rows_of_other_user', "
                f"(select count(*) from public.{table} where {col} = '{other}'), 0);"
            )
            out.append(
                f"select pg_temp.eq('{uid[-2:]}.{table}.visible_rows', "
                f"(select count(*) from public.{table}), {exp_expr});"
            )

        out += [
            "",
            "-- legitimate own-user writes must still work",
            f"select pg_temp.is_('{uid[-2:]}.lesson_completion.insert_own', pg_temp.try_sql("
            f"'insert into public.lesson_completion(user_id, lesson_slug) values (''{uid}'',''rls-check-own-write'')'), 'allowed');",
            f"select pg_temp.is_('{uid[-2:]}.read_progress.update_own', pg_temp.try_rows("
            f"'update public.read_progress set read_at = now() where user_id = ''{uid}'' and content_slug = ''rls-check'''), 'rows:1');",
            f"select pg_temp.is_('{uid[-2:]}.user_profiles.update_own', pg_temp.try_rows("
            f"'update public.user_profiles set display_name = ''rls-check-2'' where user_id = ''{uid}'''), 'rows:1');",
            "",
            "-- cross-user writes must be rejected",
            f"select pg_temp.is_('{uid[-2:]}.lesson_completion.insert_other_denied', pg_temp.try_sql("
            f"'insert into public.lesson_completion(user_id, lesson_slug) values (''{other}'',''rls-check-leak'')'), 'denied:42501');",
            f"select pg_temp.is_('{uid[-2:]}.read_progress.insert_other_denied', pg_temp.try_sql("
            f"'insert into public.read_progress(user_id, content_type, content_slug) values (''{other}'',''blog'',''rls-leak'')'), 'denied:42501');",
            f"select pg_temp.is_('{uid[-2:]}.user_profiles.insert_other_denied', pg_temp.try_sql("
            f"'insert into public.user_profiles(user_id, display_name) values (''{other}'',''leak'')'), 'denied:42501');",
            f"select pg_temp.is_('{uid[-2:]}.user_profiles.update_other_zero_rows', pg_temp.try_rows("
            f"'update public.user_profiles set display_name = ''leak'' where user_id = ''{other}'''), 'rows:0');",
            f"select pg_temp.is_('{uid[-2:]}.read_progress.delete_other_zero_rows', pg_temp.try_rows("
            f"'delete from public.read_progress where user_id = ''{other}'''), 'rows:0');",
            "",
            "-- client-forge guards (server-write-only tables)",
            f"select pg_temp.is_('{uid[-2:]}.quiz_attempt.insert_denied', pg_temp.try_sql("
            f"'insert into public.quiz_attempt(user_id, quiz_name, question_index, correct_answer_index, user_answer_index, is_correct) values (''{uid}'',''q'',1,1,1,true)'), 'denied:42501');",
            f"select pg_temp.is_('{uid[-2:]}.quiz_run.insert_denied', pg_temp.try_sql("
            f"'insert into public.quiz_run(user_id, quiz_name, correct, total, score) values (''{uid}'',''q'',1,1,100)'), 'denied:42501');",
            "",
            "-- admin-only surfaces",
            f"select pg_temp.is_('{uid[-2:]}.user_roles.write_denied', pg_temp.try_sql("
            f"'insert into public.user_roles(user_id, role) values (''{uid}'',''admin'')'), 'denied:42501');",
            f"select pg_temp.is_('{uid[-2:]}.courses.write_denied', pg_temp.try_sql("
            f"'insert into public.courses(series_slug, title) values (''rls-leak'',''leak'')'), 'denied:42501');",
            f"select pg_temp.is_('{uid[-2:]}.audit_log.insert_denied', pg_temp.try_sql("
            f"'insert into public.admin_audit_log(actor_user_id, action, target_type) values (''{uid}'',''x'',''y'')'), 'denied:42501');",
            "",
            "-- auth user table is not exposed to the Data API roles",
            f"select pg_temp.is_('{uid[-2:]}.user_table.read_denied', pg_temp.try_sql("
            f"'select count(*) from public.\"user\"'), 'denied:42501');",
            "reset role;",
            "",
        ]
        return "\n".join(out)

    script = [
        "\\set ON_ERROR_STOP 1",
        "begin;",
        ASSERTION_HELPERS,
        "",
        "-- ── 1. policy inventory vs the Supabase origin ────────────────────",
        "create temp table expected_policies (tbl text, pol text, cmd text) on commit drop;",
        "insert into expected_policies(tbl, pol, cmd) values",
        "    " + policy_values + ";",
        "select pg_temp.eq('policy.total_count', (select count(*) from pg_policies where schemaname = 'public'), "
        f"{EXPECTED_POLICY_COUNT});",
        "select pg_temp.eq('policy.missing_from_neon', (",
        "  select count(*) from expected_policies e where not exists (",
        "    select 1 from pg_policies p where p.schemaname = 'public'",
        "      and p.tablename = e.tbl and p.policyname = e.pol and p.cmd = e.cmd)), 0);",
        "select pg_temp.eq('policy.unexpected_on_neon', (",
        "  select count(*) from pg_policies p where p.schemaname = 'public' and not exists (",
        "    select 1 from expected_policies e where p.tablename = e.tbl",
        "      and p.policyname = e.pol and p.cmd = e.cmd)), 0);",
        f"select pg_temp.eq('policy.tables_with_rls', (select count(*) from pg_class c "
        f"join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' "
        f"and c.relkind = 'r' and c.relname in ({tables_sql}) and c.relrowsecurity), "
        f"{len(USER_SCOPED)});",
        f"select pg_temp.eq('policy.tables_without_any_policy', (select count(*) from pg_class c "
        f"join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' "
        f"and c.relkind = 'r' and c.relname in ({tables_sql}) and not exists ("
        f"select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)), 0);",
        "",
        "-- ── 2. seed two users + one row each for every user-scoped table ──",
        *seed,
        "",
        "-- expected visible row counts per table (owner view; RLS bypassed)",
        "create temp table expect (tbl text primary key, n_a bigint, n_b bigint) on commit drop;",
        "insert into expect(tbl, n_a, n_b)",
        "\n  union all ".join(
            f"select '{t}', count(*) filter (where {c} = '{USER_A}'), "
            f"count(*) filter (where {c} = '{USER_B}') from public.{t}"
            for t, c in USER_SCOPED
        )
        + ";",
        "-- admin_audit_log is admin-only, so a non-admin sees none of its own rows",
        "update expect set n_a = 0, n_b = 0 where tbl = 'admin_audit_log';",
        "-- the temp bookkeeping tables must be readable by the simulated roles",
        "grant select on expect to authenticated, anonymous;",
        "",
        "-- ── 3. user A, then user B, simulated through SET ROLE + JWT claims ──",
        f"-- phase: user A ({USER_A})",
        phase_body(USER_A, USER_B, "n_a"),
        f"-- phase: user B ({USER_B})",
        phase_body(USER_B, USER_A, "n_b"),
        "",
        "-- ── 4. authenticated role with NO claims (missing JWT) ────────────",
        "set local role authenticated;",
        "select pg_temp.is_('noclaims.claims_cleared', "
        "coalesce(nullif(set_config('request.jwt.claims', '', true), ''), 'empty'), 'empty');",
        "select pg_temp.is_('noclaims.auth_uid_is_null', coalesce(auth.uid()::text, 'null'), 'null');",
        "".join(
            f"select pg_temp.eq('noclaims.{t}.rows', (select count(*) from public.{t}), 0);\n"
            for t, _ in USER_SCOPED
        ),
        "reset role;",
        "",
        "-- ── 5. anonymous (no JWT): no user rows, public catalog still readable ──",
        "set local role anonymous;",
        "select pg_temp.is_('anonymous.claims_cleared', "
        "coalesce(nullif(set_config('request.jwt.claims', '', true), ''), 'empty'), 'empty');",
        "".join(
            f"select pg_temp.eq('anonymous.{t}.rows', (select count(*) from public.{t}), 0);\n"
            for t, _ in USER_SCOPED
        ),
        "select pg_temp.eq('anonymous.courses.live_rows_visible', "
        "(select count(*) from public.courses), "
        "(select count(*) from public.courses where status = 'live'));",
        "select pg_temp.is_('anonymous.catalog_sections.readable', "
        "case when (select count(*) from public.catalog_sections) > 0 then 'yes' else 'no' end, 'yes');",
        "select pg_temp.is_('anonymous.catalog_groups.readable', "
        "case when (select count(*) from public.catalog_groups) > 0 then 'yes' else 'no' end, 'yes');",
        "select pg_temp.is_('anonymous.course_prerequisites.readable', "
        "case when (select count(*) from public.course_prerequisites) > 0 then 'yes' else 'no' end, 'yes');",
        "select pg_temp.eq('anonymous.courses.pending_hidden', "
        "(select count(*) from public.courses where status <> 'live'), 0);",
        "select pg_temp.is_('anonymous.read_progress.write_denied', pg_temp.try_sql("
        f"'insert into public.read_progress(user_id, content_type, content_slug) values (''{USER_A}'',''blog'',''anon'')'), 'denied:42501');",
        "select pg_temp.is_('anonymous.catalog_sections.write_denied', pg_temp.try_sql("
        "'insert into public.catalog_sections(slug, name) values (''rls-leak'',''leak'')'), 'denied:42501');",
        "select pg_temp.is_('anonymous.user_table.read_denied', pg_temp.try_sql("
        "'select count(*) from public.\"user\"'), 'denied:42501');",
        "reset role;",
        "",
        "-- ── 6. owner path keeps working (server-side privileged connection) ──",
        "-- the privileged server path bypasses RLS: the owner sees BOTH users'",
        "-- rows, which is what keeps the Next.js direct-SQL path working",
        "select pg_temp.eq('owner.lesson_completion.distinct_users_visible', "
        "(select count(distinct user_id) from public.lesson_completion "
        f"where user_id in ('{USER_A}','{USER_B}')), 2);",
        "select pg_temp.is_('owner.quiz_attempt.insert_allowed', pg_temp.try_sql("
        f"'insert into public.quiz_attempt(user_id, quiz_name, question_index, correct_answer_index, user_answer_index, is_correct) values (''{USER_A}'',''owner-write'',0,1,1,true)'), 'allowed');",
        "",
        "-- informational: an identity sequence behind the imported data breaks",
        "-- server-side inserts from a DIFFERENT cause than RLS. Reported, never",
        "-- repaired here (setval is not transactional).",
        "select 'NOTE admin_audit_log identity sequence last_value=' || "
        "coalesce((select last_value::text from pg_sequences where sequencename = 'admin_audit_log_id_seq'), '?') || "
        "' max(id)=' || coalesce((select max(id)::text from public.admin_audit_log), '0') || "
        "case when coalesce((select last_value from pg_sequences where sequencename = 'admin_audit_log_id_seq'), 0) "
        "< coalesce((select max(id) from public.admin_audit_log), 0) "
        "then ' -> SEQUENCE BEHIND DATA: server inserts will collide' else ' -> sequence in sync' end;",
        "",
        "rollback;",
        "select 'RLS ISOLATION CHECK COMPLETE' as done;",
    ]
    return "\n".join(script)


def main() -> int:
    url = load_database_url()
    sql = build_sql()

    env = dict(os.environ)
    env["PGAPPNAME"] = "rls-isolation-check"
    proc = subprocess.run(
        ["psql", url, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        input=sql,
        capture_output=True,
        text=True,
        env=env,
    )

    stdout_lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    passes = [ln for ln in stdout_lines if ln.startswith("PASS ")]
    for line in passes:
        print(line)
    for line in stdout_lines:
        if not line.startswith("PASS "):
            print(f"    {line}")

    if proc.returncode != 0 or "RLS ISOLATION CHECK COMPLETE" not in proc.stdout:
        print("\nRLS ISOLATION CHECK: FAIL", file=sys.stderr)
        error = re.sub(re.escape(url), "<redacted-db-url>", proc.stderr.strip())
        print(error, file=sys.stderr)
        return 1

    print(f"\nRLS ISOLATION CHECK: PASS ({len(passes)} assertions)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
