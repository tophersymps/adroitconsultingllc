#!/usr/bin/env python3
"""Offline checks for scripts/data-api-isolation-check.py (no network, no DB).

Run from the repo root:
    python3 -m unittest scripts/test_data_api_isolation_check.py -v

Covers the security-hardening fixes:
  * the owner DSN password leaves argv and travels in PGPASSWORD
  * no QA password is accepted from argv; QA_R15_PASSWORD is required
  * UUIDs are validated and string literals escaped before interpolation
  * JWT-shaped values are redacted whatever the key name is
  * a normal run revokes the QA identities (teardown wiring)
"""
import importlib.util
import os
import subprocess
import sys
import unittest
from unittest import mock

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data-api-isolation-check.py")

_spec = importlib.util.spec_from_file_location("data_api_isolation_check", SCRIPT)
harness = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(harness)

UUID_A = "8c39c9aa-1111-4222-8333-444455556666"


class SplitDsnTest(unittest.TestCase):
    def test_url_dsn_password_is_extracted(self):
        target, password = harness.split_dsn(
            "postgresql://owner:s3cr3t@ep-x.aws.neon.tech/neondb?sslmode=require"
        )
        self.assertEqual(password, "s3cr3t")
        self.assertNotIn("s3cr3t", target)
        self.assertEqual(target, "postgresql://owner@ep-x.aws.neon.tech/neondb?sslmode=require")

    def test_url_encoded_password_is_decoded_for_pgpassword(self):
        target, password = harness.split_dsn("postgres://owner:p%40ss%2Fword@host:5432/db")
        self.assertEqual(password, "p@ss/word")
        self.assertNotIn("p%40ss", target)
        self.assertIn("@host:5432/db", target)

    def test_passwordless_dsn_is_unchanged(self):
        dsn = "postgresql://owner@host/db?sslmode=require"
        self.assertEqual(harness.split_dsn(dsn), (dsn, None))

    def test_keyword_dsn_password_is_extracted(self):
        target, password = harness.split_dsn("host=db user=owner password=s3cr3t dbname=x")
        self.assertEqual(password, "s3cr3t")
        self.assertNotIn("password=", target)
        self.assertNotIn("s3cr3t", target)


class PsqlArgvTest(unittest.TestCase):
    def test_sql_never_puts_the_password_in_argv(self):
        harness.configure_db("postgresql://owner:s3cr3t@host:5432/db?sslmode=require")
        captured = {}

        class Proc:
            returncode = 0
            stdout = ""
            stderr = ""

        def fake_run(argv, **kwargs):
            captured["argv"] = argv
            captured["env"] = kwargs.get("env") or {}
            return Proc()

        with mock.patch.object(harness.subprocess, "run", fake_run):
            harness.sql("select 1;")

        joined = " ".join(captured["argv"])
        self.assertNotIn("s3cr3t", joined, "password must not be a psql argv element")
        self.assertEqual(captured["env"].get("PGPASSWORD"), "s3cr3t")
        self.assertIn("ON_ERROR_STOP=1", captured["argv"])


class InterpolationTest(unittest.TestCase):
    def test_sql_literal_doubles_quotes(self):
        self.assertEqual(harness.sql_literal("o'brien"), "'o''brien'")

    def test_assert_uuid_rejects_non_uuid(self):
        with self.assertRaises(SystemExit):
            harness.assert_uuid("1 or 1=1")

    def test_sql_id_list_rejects_injection(self):
        with self.assertRaises(SystemExit):
            harness.sql_id_list([UUID_A, "'||pg_sleep(5)||'"])

    def test_mirror_users_escapes_the_email(self):
        seen = {}
        with mock.patch.object(harness, "sql", lambda query: seen.setdefault("q", query)):
            harness.mirror_users([(UUID_A, "qa'o@example.com")])
        self.assertIn("qa''o@example.com", seen["q"])
        self.assertNotIn("qa'o@", seen["q"])

    def test_seed_owner_rows_guards_the_jwt_sub(self):
        harness.USER_A_ID = "' or 1=1; --"
        harness.USER_B_ID = UUID_A
        with mock.patch.object(harness, "sql", lambda query: None):
            with self.assertRaises(SystemExit):
                harness.seed_owner_rows()


class ScrubTest(unittest.TestCase):
    JWT = ("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0."
           "c2lnbmF0dXJlc2lnbmF0dXJl")

    def test_jwt_is_redacted_under_any_key(self):
        out = harness._scrub({"access": self.JWT, "nested": {"value": self.JWT},
                              "list": [self.JWT], "token": "plain"})
        self.assertNotIn(self.JWT, str(out))
        self.assertTrue(out["access"].startswith("«redacted:"))
        self.assertTrue(out["nested"]["value"].startswith("«redacted:"))
        self.assertTrue(out["list"][0].startswith("«redacted:"))
        self.assertTrue(out["token"].startswith("«redacted:"))


class CliTest(unittest.TestCase):
    def test_missing_env_password_exits_before_any_network_call(self):
        env = {k: v for k, v in os.environ.items()
               if k not in ("QA_R15_PASSWORD", "DATABASE_URL", "DATABASE_URL_UNPOOLED",
                            "NEON_AUTH_BASE_URL", "NEON_DATA_API_URL", "BWS_ACCESS_TOKEN")}
        proc = subprocess.run([sys.executable, SCRIPT, "--help"], capture_output=True,
                              text=True, env=env, timeout=60)
        self.assertEqual(proc.returncode, 0)
        self.assertNotIn("--password", proc.stdout, "argv password flag must be gone")
        self.assertIn("--keep-users", proc.stdout)

        proc = subprocess.run([sys.executable, SCRIPT], capture_output=True,
                              text=True, env=env, timeout=60)
        self.assertEqual(proc.returncode, 2)
        self.assertIn("QA_R15_PASSWORD", proc.stderr)
        self.assertIn("environment variable only", proc.stderr)


class TeardownWiringTest(unittest.TestCase):
    def test_teardown_deletes_every_layer(self):
        seen = {}
        with mock.patch.object(harness, "sql",
                               lambda query: seen.setdefault("queries", []).append(query)):
            harness.remove_qa_users([UUID_A])
        joined = " ".join(seen["queries"])
        for fragment in ('public.user_roles', 'public."user"', "neon_auth.session",
                         "neon_auth.account", 'neon_auth."user"'):
            self.assertIn(fragment, joined)


if __name__ == "__main__":
    unittest.main(verbosity=2)
