#!/bin/sh
# Applies pending migrations, then starts the API. `prisma migrate deploy` only applies
# committed migrations (never resets nor generates), so it is safe on every start.
# Set SKIP_MIGRATIONS=true when migrations run as a separate release step.
set -e
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  npx --no-install prisma migrate deploy
fi
exec "$@"
