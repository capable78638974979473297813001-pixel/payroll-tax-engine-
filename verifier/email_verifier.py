#!/usr/bin/env python3
"""Omnia email-verification service.

Issues a short-lived 6-digit code to an address and later checks it. Standard
library only, like the rest of this repo.

Security properties
  * Codes come from `secrets` (CSPRNG), never `random`.
  * Only an HMAC-SHA256 of (email, code), keyed with VERIFIER_PEPPER, is stored.
    A copy of the database does not reveal a live code, and a hash cannot be
    replayed against another address.
  * Codes are compared in constant time, expire (default 10 min), and are
    single use. A code is burned after MAX_ATTEMPTS wrong guesses.
  * Wrong guesses are also capped per address per hour across codes, so asking
    for a new code does not hand out fresh guesses.
  * Issuing is cooled down per address and capped per hour, so the service
    cannot be used to spam an inbox.
  * Every failed check returns the same answer (unknown address, expired,
    wrong, burned), so it cannot be used to learn who has signed up.
  * The service only ever binds to loopback unless told otherwise, and every
    request needs `Authorization: Bearer $VERIFIER_SECRET`.
  * The code is never returned over HTTP and never logged, except in
    development (VERIFIER_DEV=1 with no mail transport configured).

Run
  python3 verifier/email_verifier.py serve            # the HTTP service
  python3 verifier/email_verifier.py issue a@b.com    # CLI, for testing
  python3 verifier/email_verifier.py check a@b.com 123456

Configuration (environment)
  VERIFIER_SECRET   required. Shared bearer secret, >= 32 chars.
  VERIFIER_PEPPER   required. Keys the stored code hashes, >= 32 chars.
                    Rotating it invalidates outstanding codes (they last minutes).
  VERIFIER_DB       sqlite path (default verifier/.data/verifier.sqlite3)
  VERIFIER_HOST / VERIFIER_PORT   default 127.0.0.1 / 4390
  VERIFIER_COOLDOWN_SECONDS       minimum gap between codes to one address (default 30)
  Mail transport, first one configured wins:
    RESEND_API_KEY [RESEND_FROM]
    SMTP_HOST [SMTP_PORT=587] [SMTP_USER SMTP_PASS] SMTP_FROM
"""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import sys
import time
import urllib.error
import urllib.request
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, Optional

CODE_TTL_SECONDS = 10 * 60
COOLDOWN_SECONDS = 30
MAX_ATTEMPTS = 5            # wrong guesses per issued code
MAX_GUESSES_PER_HOUR = 15   # wrong guesses per address across codes
MAX_ISSUES_PER_HOUR = 6     # codes per address
HOUR = 3600
MAX_BODY_BYTES = 4096
MIN_SECRET_LEN = 32

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# The one message for every failed check. Do not specialise it.
INVALID = "That code is incorrect or has expired. Request a new one if needed."


class ConfigError(RuntimeError):
    pass


def normalise_email(raw: object) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    email = raw.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        return None
    return email


class Verifier:
    def __init__(
        self,
        db_path: str,
        pepper: str,
        send: Callable[[str, str, str, int], None],
        clock: Callable[[], float] = time.time,
        cooldown_seconds: float = COOLDOWN_SECONDS,
    ) -> None:
        if len(pepper) < MIN_SECRET_LEN:
            raise ConfigError(f"VERIFIER_PEPPER must be at least {MIN_SECRET_LEN} characters.")
        self._pepper = pepper.encode()
        self._send = send
        self._now = clock
        self._cooldown = cooldown_seconds
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS codes (
                email TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL,
                issued_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS events (
                kind TEXT NOT NULL,      -- 'issue' | 'guess'
                email TEXT NOT NULL,
                at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS events_idx ON events (kind, email, at);
            """
        )
        if db_path != ":memory:":
            try:
                os.chmod(db_path, 0o600)
            except OSError:
                pass

    # -- internals ---------------------------------------------------------

    def _hash(self, email: str, code: str) -> str:
        return hmac.new(self._pepper, f"{email}\x00{code}".encode(), hashlib.sha256).hexdigest()

    def _count(self, kind: str, email: str, since: float) -> int:
        row = self._db.execute(
            "SELECT COUNT(*) FROM events WHERE kind=? AND email=? AND at>=?", (kind, email, since)
        ).fetchone()
        return int(row[0])

    def _record(self, kind: str, email: str, at: float) -> None:
        self._db.execute("INSERT INTO events (kind, email, at) VALUES (?,?,?)", (kind, email, at))

    def prune(self) -> None:
        now = self._now()
        self._db.execute("DELETE FROM codes WHERE expires_at < ?", (now,))
        self._db.execute("DELETE FROM events WHERE at < ?", (now - HOUR,))

    # -- public ------------------------------------------------------------

    def issue(self, email_raw: object, name: str = "") -> dict:
        email = normalise_email(email_raw)
        if email is None:
            return {"ok": False, "status": 400, "error": "A valid email is required."}
        now = self._now()
        self.prune()

        row = self._db.execute("SELECT issued_at FROM codes WHERE email=?", (email,)).fetchone()
        if row and now - row[0] < self._cooldown:
            # Already sent moments ago. Same shape as success: no signal either way.
            return {"ok": True, "sent": False, "cooldown": True}
        if self._count("issue", email, now - HOUR) >= MAX_ISSUES_PER_HOUR:
            return {
                "ok": False, "status": 429, "error": "Too many codes requested. Try again later.",
                "retryAfter": HOUR,
            }

        code = f"{secrets.randbelow(900000) + 100000}"
        self._db.execute(
            "INSERT INTO codes (email, code_hash, issued_at, expires_at, attempts) VALUES (?,?,?,?,0) "
            "ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, issued_at=excluded.issued_at, "
            "expires_at=excluded.expires_at, attempts=0",
            (email, self._hash(email, code), now, now + CODE_TTL_SECONDS),
        )
        self._record("issue", email, now)

        try:
            self._send(email, name, code, CODE_TTL_SECONDS // 60)
            sent = True
        except Exception as exc:  # delivery failure must not leak the code
            reason = str(exc).replace("\n", " ")[:300] or type(exc).__name__
            print(f"[verifier] mail delivery failed: {type(exc).__name__}: {reason}", file=sys.stderr)
            sent = False
        return {"ok": True, "sent": sent, "cooldown": False}

    def check(self, email_raw: object, code_raw: object) -> dict:
        email = normalise_email(email_raw)
        code = code_raw.strip() if isinstance(code_raw, str) else ""
        if email is None or not re.fullmatch(r"\d{6}", code):
            return {"ok": False, "status": 401, "error": INVALID}
        now = self._now()

        if self._count("guess", email, now - HOUR) >= MAX_GUESSES_PER_HOUR:
            return {"ok": False, "status": 401, "error": INVALID}

        row = self._db.execute(
            "SELECT code_hash, expires_at, attempts FROM codes WHERE email=?", (email,)
        ).fetchone()
        # Hash even when there is nothing to compare to, so timing doesn't
        # separate "unknown address" from "wrong code".
        candidate = self._hash(email, code)
        live = bool(row) and now <= row[1] and row[2] < MAX_ATTEMPTS
        expected = row[0] if row else "0" * 64
        match = hmac.compare_digest(candidate, expected)

        if live and match:
            self._db.execute("DELETE FROM codes WHERE email=?", (email,))  # single use
            return {"ok": True}

        self._record("guess", email, now)
        if row:
            attempts = row[2] + 1
            if attempts >= MAX_ATTEMPTS:
                self._db.execute("DELETE FROM codes WHERE email=?", (email,))  # burned
            else:
                self._db.execute("UPDATE codes SET attempts=? WHERE email=?", (attempts, email))
        return {"ok": False, "status": 401, "error": INVALID}


# ---------------------------------------------------------------------------
# mail transports
# ---------------------------------------------------------------------------

def _message_parts(name: str, code: str, minutes: int) -> tuple[str, str, str]:
    first = (name.split() or [""])[0]
    hello = f"Hi {first}, " if first else ""
    subject = f"{code} is your Omnia verification code"
    text = (
        f"{hello}your Omnia verification code is {code}. It expires in {minutes} minutes.\n\n"
        "If you didn't start a signup, ignore this email. Nothing happens without the code."
    )
    body = (
        '<div style="font-family:Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:32px 8px;color:#0a0a0a">'
        '<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b;margin:0 0 18px">Omnia.tax</p>'
        f'<h1 style="font-size:22px;margin:0 0 12px">Confirm your email{", " + html.escape(first) if first else ""}</h1>'
        f'<p style="font-size:15px;line-height:1.6;color:#4a4a4a;margin:0 0 22px">Enter this code to verify your address. '
        f"It expires in {minutes} minutes.</p>"
        f'<div style="font-family:Menlo,Consolas,monospace;font-size:30px;letter-spacing:.34em;background:#0a0a0a;color:#fff;'
        f'text-align:center;padding:18px 8px;margin-bottom:22px">{html.escape(code)}</div>'
        '<p style="font-size:12.5px;color:#6b6b6b;margin:0;border-top:1px solid #ddd;padding-top:12px">'
        "Didn&#39;t start a signup? Ignore this. Nothing happens without the code.</p></div>"
    )
    return subject, text, body


def resend_sender(api_key: str, sender: str) -> Callable[[str, str, str, int], None]:
    base = os.environ.get("RESEND_API_BASE", "https://api.resend.com")

    def send(email: str, name: str, code: str, minutes: int) -> None:
        subject, text, body = _message_parts(name, code, minutes)
        req = urllib.request.Request(
            f"{base}/emails",
            data=json.dumps({"from": sender, "to": [email], "subject": subject, "text": text, "html": body}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status >= 300:
                    raise RuntimeError(f"Resend responded {resp.status}")
        except urllib.error.HTTPError as err:
            # Resend says why in the body ("domain is not verified", "API key is
            # invalid", ...). It never contains the code, so it is safe to log.
            detail = err.read(400).decode("utf-8", "replace").replace("\n", " ")
            raise RuntimeError(f"Resend answered {err.code}: {detail}") from None
        except urllib.error.URLError as err:
            raise RuntimeError(f"could not reach Resend: {err.reason}") from None

    return send


def smtp_sender(
    host: str, port: int, user: str, password: str, sender: str
) -> Callable[[str, str, str, int], None]:
    def send(email: str, name: str, code: str, minutes: int) -> None:
        subject, text, body = _message_parts(name, code, minutes)
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = sender, email, subject
        msg.set_content(text)
        msg.add_alternative(body, subtype="html")
        ctx = ssl.create_default_context()  # verifies the server certificate
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=10) as s:
                if user:
                    s.login(user, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=10) as s:
                s.starttls(context=ctx)  # refuse to send in the clear
                if user:
                    s.login(user, password)
                s.send_message(msg)

    return send


def dev_sender(email: str, name: str, code: str, minutes: int) -> None:
    print(f"[verifier dev] {email}: {code} (expires in {minutes} min)", file=sys.stderr)


def sender_from_env() -> Callable[[str, str, str, int], None]:
    if os.environ.get("RESEND_API_KEY"):
        return resend_sender(
            os.environ["RESEND_API_KEY"], os.environ.get("RESEND_FROM", "Omnia <onboarding@resend.dev>")
        )
    if os.environ.get("SMTP_HOST"):
        sender = os.environ.get("SMTP_FROM")
        if not sender:
            raise ConfigError("SMTP_FROM is required with SMTP_HOST.")
        return smtp_sender(
            os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")),
            os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASS", ""), sender,
        )
    if os.environ.get("VERIFIER_DEV") == "1":
        return dev_sender
    raise ConfigError(
        "No mail transport configured. Set RESEND_API_KEY or SMTP_HOST, or VERIFIER_DEV=1 for local development."
    )


# ---------------------------------------------------------------------------
# HTTP service
# ---------------------------------------------------------------------------

def make_handler(verifier: Verifier, secret: str) -> type[BaseHTTPRequestHandler]:
    secret_b = secret.encode()

    class Handler(BaseHTTPRequestHandler):
        server_version = "omnia-verifier"
        sys_version = ""

        def log_message(self, *_args: object) -> None:  # no request logging: bodies hold addresses
            pass

        def _json(self, status: int, payload: dict) -> None:
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            if status == 429 and "retryAfter" in payload:
                self.send_header("Retry-After", str(payload["retryAfter"]))
            self.end_headers()
            self.wfile.write(data)

        def _authorised(self) -> bool:
            header = self.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return False
            return hmac.compare_digest(header[7:].encode(), secret_b)

        def do_GET(self) -> None:
            if self.path == "/healthz":
                self._json(200, {"ok": True})
            else:
                self._json(404, {"error": "Not found."})

        def do_POST(self) -> None:
            if not self._authorised():
                self._json(401, {"error": "Unauthorised."})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if length < 0 or length > MAX_BODY_BYTES:
                self._json(413, {"error": "Request body too large."})
                return
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                if not isinstance(body, dict):
                    raise ValueError
            except ValueError:
                self._json(400, {"error": "Body must be a JSON object."})
                return

            if self.path == "/issue":
                name = body.get("name") if isinstance(body.get("name"), str) else ""
                result = verifier.issue(body.get("email"), name[:200])
            elif self.path == "/check":
                result = verifier.check(body.get("email"), body.get("code"))
            else:
                self._json(404, {"error": "Not found."})
                return
            status = result.pop("status", 200)
            self._json(status, result)

    return Handler


def require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if len(value) < MIN_SECRET_LEN:
        raise ConfigError(
            f"{name} must be set to at least {MIN_SECRET_LEN} characters "
            "(try: python3 -c \"import secrets; print(secrets.token_urlsafe(48))\")."
        )
    return value


def build_from_env() -> tuple[Verifier, str]:
    secret = require_env("VERIFIER_SECRET")
    pepper = require_env("VERIFIER_PEPPER")
    db = os.environ.get("VERIFIER_DB", str(Path(__file__).parent / ".data" / "verifier.sqlite3"))
    cooldown = float(os.environ.get("VERIFIER_COOLDOWN_SECONDS", COOLDOWN_SECONDS))
    return Verifier(db, pepper, sender_from_env(), cooldown_seconds=cooldown), secret


def load_dotenv() -> None:
    """Read <repo root>/.env without overriding the real environment."""
    path = Path(__file__).resolve().parent.parent / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def main(argv: list[str]) -> int:
    load_dotenv()
    cmd = argv[1] if len(argv) > 1 else "serve"
    try:
        verifier, secret = build_from_env()
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if cmd == "serve":
        host = os.environ.get("VERIFIER_HOST", "127.0.0.1")
        port = int(os.environ.get("VERIFIER_PORT", "4390"))
        if host not in ("127.0.0.1", "::1", "localhost"):
            print(f"warning: binding {host}; put TLS in front of this service.", file=sys.stderr)
        server = ThreadingHTTPServer((host, port), make_handler(verifier, secret))
        print(f"omnia verifier listening on http://{host}:{port}", file=sys.stderr)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        return 0
    if cmd == "issue" and len(argv) >= 3:
        print(json.dumps(verifier.issue(argv[2], argv[3] if len(argv) > 3 else "")))
        return 0
    if cmd == "check" and len(argv) >= 4:
        result = verifier.check(argv[2], argv[3])
        print(json.dumps(result))
        return 0 if result["ok"] else 1
    print(__doc__, file=sys.stderr)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))
