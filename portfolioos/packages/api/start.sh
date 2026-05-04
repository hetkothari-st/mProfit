#!/bin/sh
set -e
echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy --schema ./packages/api/prisma/schema.prisma
echo "Starting API server..."
exec node packages/api/dist/index.js
