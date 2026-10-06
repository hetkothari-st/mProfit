#!/usr/bin/env bash
# Prove a backup restores: decrypt it into a throwaway Postgres container,
# restore, and compare every table's row count with the source database.
#
#   BACKUP_PASSPHRASE=...  scripts/db-restore-verify.sh <file.dump.enc> [SOURCE_URL]
#
# With SOURCE_URL (the owner connection the backup was taken from) each
# table's count is compared and any difference fails the run. Without it the
# script only proves the file decrypts and restores, and prints the counts.
# Rows written to the source after the backup was taken show up as
# differences, so compare against a quiet database or read them as "newer".
#
# The scratch container is removed at the end, whatever happens; no decrypted
# file is written to disk (the stream goes straight into pg_restore).
# Requires docker + openssl. PG_IMAGE defaults to postgres:17.
set -euo pipefail

FILE="${1:?usage: db-restore-verify.sh <file.dump.enc> [SOURCE_URL]}"
SOURCE_URL="${2:-}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"
NAME="everypaisa-restore-verify-$$"

if [ -f "$FILE.sha256" ]; then
  echo "Checking checksum"
  (cd "$(dirname "$FILE")" && { sha256sum -c "$(basename "$FILE").sha256" 2>/dev/null || shasum -a 256 -c "$(basename "$FILE").sha256"; })
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting scratch Postgres ($PG_IMAGE)"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=restore "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d restore >/dev/null 2>&1 && break
  sleep 1
done
# The schema's grants and policies name this role; create it so they apply.
docker exec "$NAME" psql -U postgres -d restore -qc "CREATE ROLE portfolioos_app NOLOGIN NOBYPASSRLS" >/dev/null

echo "Decrypting and restoring"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
  | docker exec -i "$NAME" pg_restore --no-owner --no-acl --exit-on-error -U postgres -d restore

COUNT_SQL="SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"

docker exec "$NAME" psql -U postgres -d restore -At -F ' ' -c "$COUNT_SQL" > "/tmp/$NAME.restored"
TABLES=$(wc -l < "/tmp/$NAME.restored" | tr -d ' ')
ROWS=$(awk '{s+=$2} END {print s+0}' "/tmp/$NAME.restored")
echo "Restored $TABLES tables, $ROWS rows"

STATUS=0
if [ -n "$SOURCE_URL" ]; then
  URL="${SOURCE_URL/@localhost/@host.docker.internal}"
  URL="${URL/@127.0.0.1/@host.docker.internal}"
  docker run --rm --add-host=host.docker.internal:host-gateway "$PG_IMAGE" \
    psql "$URL" -At -F ' ' -c "$COUNT_SQL" > "/tmp/$NAME.source"
  if diff -u "/tmp/$NAME.source" "/tmp/$NAME.restored" > "/tmp/$NAME.diff"; then
    echo "OK: every table's row count matches the source"
  else
    echo "MISMATCH (source -> restored):"
    grep -E '^[-+][^-+]' "/tmp/$NAME.diff" || true
    STATUS=1
  fi
fi
rm -f "/tmp/$NAME.restored" "/tmp/$NAME.source" "/tmp/$NAME.diff"
exit $STATUS
