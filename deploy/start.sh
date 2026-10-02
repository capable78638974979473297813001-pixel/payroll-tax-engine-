#!/bin/sh
# Starts the site, and the Python email verifier alongside it when
# VERIFIER_SECRET is set. If the verifier ever dies it is restarted; while it
# is down the site refuses verification codes (it fails closed).
set -eu

mkdir -p "${SITE_DB_DIR:-/var/data/site}"

if [ -n "${VERIFIER_SECRET:-}" ]; then
  export VERIFIER_URL="${VERIFIER_URL:-http://127.0.0.1:4390}"
  mkdir -p "$(dirname "${VERIFIER_DB:-/var/data/verifier.sqlite3}")"
  (
    while true; do
      python3 verifier/email_verifier.py serve || true
      echo "[start] verifier exited; restarting in 2s" >&2
      sleep 2
    done
  ) &
fi

exec node site/server.ts
