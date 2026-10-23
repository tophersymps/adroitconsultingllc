#!/usr/bin/env python3
"""Offline checks for the CWE-214 DSN fix in the sibling DB harnesses.

Run from the repo root:
    python3 -m unittest scripts/test_psql_dsn_argv.py -v

Covers scripts/verify-session-bridge.py, scripts/verify-user-provisioning.py and
scripts/rls-isolation-check.py: the owner DSN password must leave psql argv and
travel in PGPASSWORD instead. No network, no database, no live credentials.
"""
import importlib.util
import os
import unittest
from unittest import mock

SCRIPTS = os.path.dirname(os.path.abspath(__file__))


def _load(filename, module_name):
    path = os.path.join(SCRIPTS, filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


session_bridge = _load("verify-session-bridge.py", "verify_session_bridge")
user_provisioning = _load("verify-user-provisioning.py", "verify_user_provisioning")
rls_check = _load("rls-isolation-check.py", "rls_isolation_check")

HARNESSES = (
    ("verify-session-bridge.py", session_bridge),
    ("verify-user-provisioning.py", user_provisioning),
    ("rls-isolation-check.py", rls_check),
)

URL_DSN = "postgresql://owner:s3cr3t@ep-x.aws.neon.tech/neondb?sslmode=require"
ENCODED_DSN = "postgres://owner:p%40ss%2Fword@host:5432/db"
KEYWORD_DSN = "host=db user=owner password=s3cr3t dbname=x"
PASSWORD = "s3cr3t"


class SplitDsnTest(unittest.TestCase):
    def test_url_dsn_password_is_extracted(self):
        for name, harness in HARNESSES:
            with self.subTest(script=name):
                target, password = harness.split_dsn(URL_DSN)
                self.assertEqual(password, PASSWORD)
                self.assertNotIn(PASSWORD, target)
                self.assertEqual(
                    target,
                    "postgresql://owner@ep-x.aws.neon.tech/neondb?sslmode=require",
                )

    def test_url_encoded_password_is_decoded_for_pgpassword(self):
        for name, harness in HARNESSES:
            with self.subTest(script=name):
                target, password = harness.split_dsn(ENCODED_DSN)
                self.assertEqual(password, "p@ss/word")
                self.assertNotIn("p%40ss", target)
                self.assertIn("@host:5432/db", target)

    def test_passwordless_dsn_is_unchanged(self):
        dsn = "postgresql://owner@host/db?sslmode=require"
        for name, harness in HARNESSES:
            with self.subTest(script=name):
                self.assertEqual(harness.split_dsn(dsn), (dsn, None))

    def test_keyword_dsn_password_is_extracted(self):
        for name, harness in HARNESSES:
            with self.subTest(script=name):
                target, password = harness.split_dsn(KEYWORD_DSN)
                self.assertEqual(password, PASSWORD)
                self.assertNotIn("password=", target)
                self.assertNotIn(PASSWORD, target)


class _Proc:
    returncode = 0
    stdout = ""
    stderr = ""


def _capture_run(captured):
    def fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["env"] = kwargs.get("env") or {}
        return _Proc()

    return fake_run


class SessionBridgePsqlArgvTest(unittest.TestCase):
    def test_psql_never_puts_the_password_in_argv(self):
        session_bridge.configure_db(URL_DSN)
        captured = {}
        with mock.patch.object(session_bridge.subprocess, "run", _capture_run(captured)):
            session_bridge.psql("select 1;")
        joined = " ".join(captured["argv"])
        self.assertNotIn(PASSWORD, joined, "password must not be a psql argv element")
        self.assertEqual(captured["env"].get("PGPASSWORD"), PASSWORD)
        self.assertIn("ON_ERROR_STOP=1", captured["argv"])

    def test_psql_explicit_dsn_is_also_split(self):
        captured = {}
        with mock.patch.object(session_bridge.subprocess, "run", _capture_run(captured)):
            session_bridge.psql("select 1;", ENCODED_DSN)
        self.assertNotIn("p%40ss", " ".join(captured["argv"]))
        self.assertEqual(captured["env"].get("PGPASSWORD"), "p@ss/word")


class UserProvisioningPsqlArgvTest(unittest.TestCase):
    def test_sql_never_puts_the_password_in_argv(self):
        user_provisioning.configure_db(URL_DSN)
        captured = {}
        with mock.patch.object(user_provisioning.subprocess, "run", _capture_run(captured)):
            user_provisioning.sql("select 1;", db_url=URL_DSN)
        joined = " ".join(captured["argv"])
        self.assertNotIn(PASSWORD, joined, "password must not be a psql argv element")
        self.assertEqual(captured["env"].get("PGPASSWORD"), PASSWORD)
        self.assertIn("ON_ERROR_STOP=1", captured["argv"])

    def test_keyword_dsn_env_carries_the_password(self):
        target, env = user_provisioning.psql_target_and_env(KEYWORD_DSN)
        self.assertNotIn(PASSWORD, target)
        self.assertEqual(env.get("PGPASSWORD"), PASSWORD)

    def test_check_function_script_psql_never_sees_the_password(self):
        captured = {}
        with mock.patch.object(user_provisioning.subprocess, "run", _capture_run(captured)), \
             mock.patch.object(user_provisioning, "record", lambda *a, **k: None):
            user_provisioning.check_function(
                URL_DSN, "8c39c9aa-1111-4222-8333-444455556666")
        self.assertNotIn(PASSWORD, " ".join(captured["argv"]))
        self.assertEqual(captured["env"].get("PGPASSWORD"), PASSWORD)


class RlsIsolationArgvTest(unittest.TestCase):
    def test_configure_db_returns_a_password_free_argv(self):
        target, env = rls_check.configure_db(URL_DSN)
        self.assertNotIn(PASSWORD, target)
        self.assertEqual(env.get("PGPASSWORD"), PASSWORD)
        self.assertEqual(env.get("PGAPPNAME"), "rls-isolation-check")

    def test_main_passes_the_password_free_target_to_psql(self):
        captured = {}

        def fake_run(argv, **kwargs):
            captured["argv"] = argv
            captured["env"] = kwargs.get("env") or {}
            return mock.Mock(returncode=0, stdout="RLS ISOLATION CHECK COMPLETE\n", stderr="")

        with mock.patch.object(rls_check, "load_database_url", lambda: URL_DSN), \
             mock.patch.object(rls_check, "build_sql", lambda: "select 1;"), \
             mock.patch.object(rls_check.subprocess, "run", fake_run), \
             mock.patch("builtins.print", lambda *a, **k: None):
            verdict = rls_check.main()
        self.assertEqual(verdict, 0)
        self.assertNotIn(PASSWORD, " ".join(captured["argv"]))
        self.assertEqual(captured["env"].get("PGPASSWORD"), PASSWORD)
        self.assertIn("ON_ERROR_STOP=1", captured["argv"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
