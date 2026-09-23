#!/bin/sh
set -eu

cd "$(dirname "$0")"

if ! grep -q '^DEMO_RESET_ENABLED=true$' .env; then
  echo "demo-reset: DEMO_RESET_ENABLED=true is not set in deploy/.env; refusing to wipe data" >&2
  exit 1
fi

docker compose down --volumes
docker compose up -d --wait --wait-timeout 180
docker compose exec -T api node dist/seed.js
echo "demo-reset: $(date -u +%Y-%m-%dT%H:%M:%SZ) accesscore wiped and reseeded"
