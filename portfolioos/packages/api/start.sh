#!/bin/sh
set -e
echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy --schema ./packages/api/prisma/schema.prisma
# Derived data that a migration cannot rebuild: holdings are only rewritten
# when a transaction for that asset is written, so a change to how cost is
# computed never reaches an untouched holding. The script marks itself done in
# AppSetting, so this is a no-op on every later boot. A failure here must not
# keep the API down — holdings still rebuild on the next write.
echo "Rebuilding derived holdings (once)..."
node packages/api/dist/scripts/recomputeHoldings.js || echo "WARNING: holdings recompute failed; continuing to start the API"

echo "Starting API server..."
exec node packages/api/dist/index.js
