import contextlib
import io
import json
import os
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import email_verifier as ev

PEPPER = "p" * 40
SECRET = "s" * 40


class Clock:
    def __init__(self) -> None:
        self.t = 1_000_000.0

    def __call__(self) -> float:
        return self.t


class VerifierTest(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = Clock()
        self.sent: list[tuple[str, str, str, int]] = []
        self.v = ev.Verifier(":memory:", PEPPER, lambda *a: self.sent.append(a), self.clock)

    def code(self) -> str:
        return self.sent[-1][2]

    def test_issue_then_check_succeeds_once(self) -> None:
        self.assertTrue(self.v.issue("A@B.com", "Ann Lee")["sent"])
        self.assertEqual(self.sent[-1][0], "a@b.com")
        self.assertRegex(self.code(), r"^\d{6}$")
        self.assertTrue(self.v.check("a@b.com", self.code())["ok"])
        self.assertFalse(self.v.check("a@b.com", self.code())["ok"])  # single use

    def test_code_is_stored_hashed_not_plain(self) -> None:
        self.v.issue("a@b.com")
        rows = self.v._db.execute("SELECT code_hash FROM codes").fetchall()
        self.assertNotIn(self.code(), rows[0][0])
        self.assertEqual(len(rows[0][0]), 64)

    def test_hash_is_bound_to_the_address(self) -> None:
        self.assertNotEqual(self.v._hash("a@b.com", "123456"), self.v._hash("c@d.com", "123456"))

    def test_expiry(self) -> None:
        self.v.issue("a@b.com")
        self.clock.t += ev.CODE_TTL_SECONDS + 1
        self.assertFalse(self.v.check("a@b.com", self.code())["ok"])

    def test_code_burns_after_max_wrong_guesses(self) -> None:
        self.v.issue("a@b.com")
        good = self.code()
        wrong = "000000" if good != "000000" else "111111"
        for _ in range(ev.MAX_ATTEMPTS):
            self.assertFalse(self.v.check("a@b.com", wrong)["ok"])
        self.assertFalse(self.v.check("a@b.com", good)["ok"])  # burned, even with the right code

    def test_new_code_does_not_reset_hourly_guess_cap(self) -> None:
        wrong = "000000"
        for round_ in range(ev.MAX_GUESSES_PER_HOUR // ev.MAX_ATTEMPTS):
            self.v.issue("a@b.com")
            self.clock.t += ev.COOLDOWN_SECONDS + 1
            if wrong == self.code():
                wrong = "111111"
            for _ in range(ev.MAX_ATTEMPTS):
                self.v.check("a@b.com", wrong)
        self.v.issue("a@b.com")
        self.assertFalse(self.v.check("a@b.com", self.code())["ok"])  # right code, cap spent

    def test_failures_are_indistinguishable(self) -> None:
        self.v.issue("real@x.com")
        unknown = self.v.check("nobody@x.com", "123456")
        wrong = self.v.check("real@x.com", "000000" if self.code() != "000000" else "111111")
        malformed = self.v.check("real@x.com", "abc")
        self.assertEqual(unknown, wrong)
        self.assertEqual(wrong, malformed)

    def test_cooldown_does_not_send_again(self) -> None:
        self.v.issue("a@b.com")
        again = self.v.issue("a@b.com")
        self.assertEqual(len(self.sent), 1)
        self.assertTrue(again["cooldown"])

    def test_issue_cap_per_hour(self) -> None:
        for _ in range(ev.MAX_ISSUES_PER_HOUR):
            self.assertTrue(self.v.issue("a@b.com")["ok"])
            self.clock.t += ev.COOLDOWN_SECONDS + 1
        blocked = self.v.issue("a@b.com")
        self.assertFalse(blocked["ok"])
        self.assertEqual(blocked["status"], 429)

    def test_rejects_bad_email(self) -> None:
        self.assertEqual(self.v.issue("not-an-email")["status"], 400)
        self.assertEqual(self.sent, [])

    def test_delivery_failure_is_reported_without_the_code(self) -> None:
        def boom(*_a: object) -> None:
            raise OSError("smtp down")

        v = ev.Verifier(":memory:", PEPPER, boom, self.clock)
        result = v.issue("a@b.com")
        self.assertFalse(result["sent"])
        self.assertNotIn("code", json.dumps(result))

    def test_short_pepper_refused(self) -> None:
        with self.assertRaises(ev.ConfigError):
            ev.Verifier(":memory:", "short", lambda *a: None)

    def test_email_html_escapes_name(self) -> None:
        _, _, body = ev._message_parts('<script>x</script> Bob', "123456", 10)
        self.assertNotIn("<script>", body)


class ResendFailureTest(unittest.TestCase):
    """When Resend refuses, the log says why, and never contains the code."""

    def test_refusal_reason_is_logged_without_the_code(self) -> None:
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                body = json.dumps({"statusCode": 403, "message": "The omniatax.io domain is not verified."}).encode()
                self.send_response(403)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_a: object) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            os.environ["RESEND_API_BASE"] = f"http://127.0.0.1:{server.server_port}"
            v = ev.Verifier(":memory:", PEPPER, ev.resend_sender("re_x", "Omnia.tax <verify@omniatax.io>"))
            log = io.StringIO()
            with contextlib.redirect_stderr(log):
                result = v.issue("a@b.com", "Ada")
            self.assertFalse(result["sent"])
            text = log.getvalue()
            self.assertIn("403", text)
            self.assertIn("domain is not verified", text)
            row = v._db.execute("SELECT code_hash FROM codes").fetchone()
            self.assertTrue(row)  # a code was minted, but is not in the log
            self.assertNotRegex(text, r"\b\d{6}\b")
        finally:
            os.environ.pop("RESEND_API_BASE", None)
            server.shutdown()


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sent: list[tuple[str, str, str, int]] = []
        tmp = tempfile.mkdtemp()
        cls.v = ev.Verifier(str(Path(tmp) / "v.sqlite3"), PEPPER, lambda *a: cls.sent.append(a))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ev.make_handler(cls.v, SECRET))
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()

    def post(self, path: str, body: object, token: str | None = SECRET) -> tuple[int, dict]:
        headers = {"Content-Type": "application/json"}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_requires_bearer_secret(self) -> None:
        self.assertEqual(self.post("/issue", {"email": "a@b.com"}, token=None)[0], 401)
        self.assertEqual(self.post("/issue", {"email": "a@b.com"}, token="x" * 40)[0], 401)

    def test_round_trip_and_code_never_in_response(self) -> None:
        status, body = self.post("/issue", {"email": "http@x.com", "name": "H"})
        self.assertEqual(status, 200)
        code = self.sent[-1][2]
        self.assertNotIn(code, json.dumps(body))
        self.assertEqual(self.post("/check", {"email": "http@x.com", "code": "000000" if code != "000000" else "111111"})[0], 401)
        self.assertEqual(self.post("/check", {"email": "http@x.com", "code": code}), (200, {"ok": True}))

    def test_rejects_oversize_and_bad_json(self) -> None:
        self.assertEqual(self.post("/issue", {"email": "a@b.com", "pad": "x" * 10_000})[0], 413)
        req = urllib.request.Request(
            self.base + "/check", data=b"[1]", headers={"Authorization": f"Bearer {SECRET}"}, method="POST"
        )
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code, 400)

    def test_db_file_is_private(self) -> None:
        mode = Path(self.v._db.execute("PRAGMA database_list").fetchone()[2]).stat().st_mode & 0o777
        self.assertEqual(mode & 0o077, 0)


if __name__ == "__main__":
    unittest.main()
