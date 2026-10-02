#!/bin/sh
# Starts the site, and the Python email verifier beside it.
#
# The verifier is what sends every sign-up and sign-in code. It starts whenever
# a mail provider is configured (RESEND_API_KEY, or SMTP_HOST). Its two secrets
# are generated on first boot and kept on the persistent disk, so there is
# nothing to invent or paste; set VERIFIER_SECRET / VERIFIER_PEPPER yourself
# only if you want to choose them. If the verifier ever exits it is restarted;
# while it is down the site refuses verification codes (it fails closed).
#
# With no mail provider the site falls back to printing codes to this log, which
# is fine for a first test and must not be left that way for real customers.
set -eu

mkdir -p "${SITE_DB_DIR:-/var/data/site}"

if [ -n "${RESEND_API_KEY:-}" ] || [ -n "${SMTP_HOST:-}" ]; then
  SECRETS_FILE="${VERIFIER_SECRETS_FILE:-/var/data/verifier-secrets.env}"
  if [ -z "${VERIFIER_SECRET:-}" ] || [ -z "${VERIFIER_PEPPER:-}" ]; then
    if [ ! -s "$SECRETS_FILE" ]; then
      mkdir -p "$(dirname "$SECRETS_FILE")"
      umask 077
      {
        echo "VERIFIER_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
        echo "VERIFIER_PEPPER=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
      } > "$SECRETS_FILE"
      chmod 600 "$SECRETS_FILE"
      echo "[start] generated verifier secrets in $SECRETS_FILE" >&2
    fi
    set -a
    # shellcheck disable=SC1090
    . "$SECRETS_FILE"
    set +a
  fi
  export VERIFIER_URL="${VERIFIER_URL:-http://127.0.0.1:${VERIFIER_PORT:-4390}}"
  mkdir -p "$(dirname "${VERIFIER_DB:-/var/data/verifier.sqlite3}")"
  (
    while true; do
      python3 verifier/email_verifier.py serve || true
      echo "[start] verifier exited; restarting in 2s" >&2
      sleep 2
    done
  ) &
  echo "[start] email verifier on, sending through ${RESEND_API_KEY:+Resend}${SMTP_HOST:+SMTP}" >&2
else
  echo "[start] NO MAIL PROVIDER: set RESEND_API_KEY (or SMTP_HOST). Until then sign-up and sign-in codes are printed in this log instead of emailed." >&2
fi

exec node site/server.ts
