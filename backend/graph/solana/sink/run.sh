#!/usr/bin/env bash
set -euo pipefail

# Drives substreams-sink-sql for the Solana CryptoPets pipeline.
#
#   ./run.sh setup   # one-time: create the `pet` + `cursors` tables (from schema.sql)
#   ./run.sh run     # stream db_out into Postgres (long-running)
#
# Required env:
#   SINK_DSN              psql://<user>:<pass>@<host>:5432/cryptopets?schemaName=solana&sslmode=disable
#                         (same instance as the backend DATABASE_URL; note the psql:// scheme
#                          and the dedicated `solana` schema)
#   SUBSTREAMS_ENDPOINT   a Solana devnet Substreams/Firehose provider (host:port)  [run only]
#   SUBSTREAMS_API_TOKEN  auth token for that endpoint, if it requires one (read automatically)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPKG="$SCRIPT_DIR/../substreams/substreams.spkg"

if ! command -v substreams-sink-sql >/dev/null 2>&1; then
    echo "substreams-sink-sql not found. Install it: https://github.com/streamingfast/substreams-sink-sql" >&2
    exit 1
fi
if [[ ! -f "$SPKG" ]]; then
    echo "Missing $SPKG — build it first:" >&2
    echo "  cd ../substreams && cargo build --target wasm32-unknown-unknown --release \\" >&2
    echo "    && substreams pack -o substreams.spkg substreams.yaml" >&2
    exit 1
fi

: "${SINK_DSN:?set SINK_DSN (psql://...?schemaName=solana)}"

# libpq URL for psql (strip psql:// scheme and sink-only schemaName param).
sink_dsn_to_pg_url() {
    local url="${1/psql:\/\//postgresql:\/\/}"
    if [[ "$url" != *"?"* ]]; then
        echo "$url"
        return
    fi
    local base="${url%%\?*}"
    local qs="${url#*\?}"
    local kept=""
    local IFS='&'
    for param in $qs; do
        [[ "$param" == schemaName=* ]] && continue
        kept+="${kept:+&}${param}"
    done
    if [[ -n "$kept" ]]; then
        echo "${base}?${kept}"
    else
        echo "$base"
    fi
}

schema_name_from_dsn() {
    if [[ "$1" =~ schemaName=([^&]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "solana"
    fi
}

ensure_postgres_schema() {
    local pg_url schema
    pg_url="$(sink_dsn_to_pg_url "$SINK_DSN")"
    schema="$(schema_name_from_dsn "$SINK_DSN")"
    if ! command -v psql >/dev/null 2>&1; then
        echo "psql not found — create the schema manually:" >&2
        echo "  CREATE SCHEMA IF NOT EXISTS ${schema};" >&2
        return 0
    fi
    psql "$pg_url" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS \"${schema}\";"
}

case "${1:-}" in
    setup)
        ensure_postgres_schema
        substreams-sink-sql setup "$SINK_DSN" "$SPKG"
        ;;
    run)
        : "${SUBSTREAMS_ENDPOINT:?set SUBSTREAMS_ENDPOINT (Solana devnet provider host:port)}"
        substreams-sink-sql run "$SINK_DSN" "$SPKG" -e "$SUBSTREAMS_ENDPOINT"
        ;;
    *)
        echo "usage: $0 {setup|run}" >&2
        exit 1
        ;;
esac
