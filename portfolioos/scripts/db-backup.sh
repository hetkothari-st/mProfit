#!/usr/bin/env bash
# Encrypted logical backup of the PortfolioOS / EveryPaisa Postgres database.
#
#   DATABASE_URL=postgresql://...  BACKUP_PASSPHRASE=...  scripts/db-backup.sh [out-dir]
#
# Writes <out-dir>/everypaisa-<UTC timestamp>.dump.enc and a .sha256 beside it.
# The dump is pg_dump custom format (-Fc), encrypted with AES-256 (openssl,
# PBKDF2, 200k iterations) before it touches disk, so no plaintext copy of
# users' data is ever written. Use the owner connection (DIRECT_URL), not the
# RLS-restricted app role, or the dump will be missing rows.
#
# pg_dump runs from the official Postgres image so the client is never older
# than the server (PG_IMAGE, default postgres:17). Requires docker + openssl.
#
# Keep the passphrase somewhere other than the backups (password manager), and
# remember: these files also contain the wrapped per-user data keys, so
# APP_ENCRYPTION_KEY must be backed up separately for a restore to be usable.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL (use the owner / DIRECT_URL connection)}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
OUT_DIR="${1:-./backups}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"
mkdir -p "$OUT_DIR"

# Inside a container, "localhost" is the container itself.
URL="${DATABASE_URL/@localhost/@host.docker.internal}"
URL="${URL/@127.0.0.1/@host.docker.internal}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/everypaisa-$STAMP.dump.enc"

echo "Dumping with $PG_IMAGE -> $FILE"
docker run --rm --add-host=host.docker.internal:host-gateway "$PG_IMAGE" \
  pg_dump --format=custom --no-owner --no-acl --dbname="$URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE"

if command -v sha256sum >/dev/null; then
  (cd "$OUT_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256")
else
  (cd "$OUT_DIR" && shasum -a 256 "$(basename "$FILE")" > "$(basename "$FILE").sha256")
fi
echo "Done: $(du -h "$FILE" | cut -f1)  $(cut -d' ' -f1 "$FILE.sha256")"
