#!/usr/bin/env bash
set -euo pipefail

# Push the local ClickHouse market-data tables to ClickHouse Cloud.
#
# One-shot mirror: run it after creating your ClickHouse Cloud service, and
# again whenever you re-sync data locally and want prod refreshed. It creates
# each table on Cloud (if missing), TRUNCATEs it, then streams the local rows
# over the native secure port. Cloud = an exact copy of local each run.
#
# Required env (from the ClickHouse Cloud console → Connect):
#   CLOUD_HOST=xxxxxxxx.<region>.<cloud>.clickhouse.cloud
#   CLOUD_USER=default
#   CLOUD_PASSWORD=...
# Optional:
#   CLOUD_DB=ticker_house        # default
#   CLOUD_PORT=9440              # native secure, default
#   LOCAL_CONTAINER=ticker-house-clickhouse
#
# Local ClickHouse creds are read from web/.env. All queries run through the
# local container's clickhouse-client, so you need nothing else installed.
#
# Usage:
#   CLOUD_HOST=... CLOUD_USER=default CLOUD_PASSWORD=... ./deploy/push-clickhouse.sh

: "${CLOUD_HOST:?set CLOUD_HOST to your ClickHouse Cloud host}"
: "${CLOUD_USER:?set CLOUD_USER}"
: "${CLOUD_PASSWORD:?set CLOUD_PASSWORD}"
CLOUD_DB="${CLOUD_DB:-ticker_house}"
CLOUD_PORT="${CLOUD_PORT:-9440}"

# clickhouse-client --host wants a bare hostname. Tolerate a pasted
# https://host:port URL by stripping the scheme, any path, and any :port.
CLOUD_HOST="${CLOUD_HOST#*://}"
CLOUD_HOST="${CLOUD_HOST%%/*}"
CLOUD_HOST="${CLOUD_HOST%%:*}"
CONTAINER="${LOCAL_CONTAINER:-ticker-house-clickhouse}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT/web/.env"; set +a
LOCAL_DB="${CLICKHOUSE_DB:-ticker_house}"

# Market-data tables only. App data (users, chats, watchlist, briefings) lives
# in Postgres and is NOT copied — prod starts with a fresh app database.
TABLES=(securities daily_prices financial_facts financial_periods financial_segments filings)

loc()   { docker exec -i "$CONTAINER" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" -d "$LOCAL_DB" "$@"; }
cloud() { docker exec -i "$CONTAINER" clickhouse-client --host "$CLOUD_HOST" --port "$CLOUD_PORT" --secure --user "$CLOUD_USER" --password "$CLOUD_PASSWORD" "$@"; }

echo "==> ensuring database $CLOUD_DB on Cloud"
cloud -q "CREATE DATABASE IF NOT EXISTS \`$CLOUD_DB\`"

for t in "${TABLES[@]}"; do
  echo "==> $t: create on Cloud (if missing)"
  # SHOW CREATE gives the local DDL; retarget the DB and make it idempotent.
  # ReplacingMergeTree is transparently converted to SharedMergeTree on Cloud.
  ddl="$(loc -q "SHOW CREATE TABLE \`$LOCAL_DB\`.\`$t\`" --format TabSeparatedRaw)"
  ddl="${ddl/CREATE TABLE $LOCAL_DB./CREATE TABLE IF NOT EXISTS $CLOUD_DB.}"
  cloud --multiquery -q "$ddl"

  echo "==> $t: truncate + push"
  cloud -q "TRUNCATE TABLE IF EXISTS \`$CLOUD_DB\`.\`$t\`"
  # SELECT ... FINAL so only deduplicated rows cross the wire: these are
  # ReplacingMergeTree tables and repeated local syncs leave stale row versions.
  loc -q "INSERT INTO FUNCTION remoteSecure('$CLOUD_HOST:$CLOUD_PORT', '$CLOUD_DB.$t', '$CLOUD_USER', '$CLOUD_PASSWORD') SELECT * FROM \`$LOCAL_DB\`.\`$t\` FINAL"

  # Compare deduplicated counts — raw count() is meaningless mid-merge here.
  ln="$(loc   -q "SELECT count() FROM \`$LOCAL_DB\`.\`$t\` FINAL")"
  cn="$(cloud -q "SELECT count() FROM \`$CLOUD_DB\`.\`$t\` FINAL")"
  echo "    $t: local=$ln cloud=$cn"
  [ "$ln" = "$cn" ] || echo "    WARNING: deduplicated counts differ for $t"
done

echo "==> done. Point the app + Trigger at CLICKHOUSE_URL=https://$CLOUD_HOST:8443"
