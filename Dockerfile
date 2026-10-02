# Omnia.tax site + (optional) Python email verifier, one container.
# Node 22.18+ runs the TypeScript sources directly; no build step.
FROM node:22.22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY api ./api
COPY geocode ./geocode
COPY data ./data
COPY site ./site
COPY verifier/email_verifier.py ./verifier/email_verifier.py
COPY scripts/check-stripe.ts scripts/meter-queue.ts ./scripts/
COPY deploy/start.sh ./deploy/start.sh
RUN chmod +x deploy/start.sh

ENV NODE_ENV=production \
    SITE_DB_DIR=/var/data/site \
    VERIFIER_DB=/var/data/verifier.sqlite3

# The host mounts a persistent disk at /var/data. PORT is set by the host.
EXPOSE 10000
CMD ["./deploy/start.sh"]
