#!/usr/bin/env bash
set -euo pipefail

# Drives substreams-sink-sql for the Solana CryptoPets pipeline.
#
#   ./run.sh setup   # one-time: create the `pet` + `cursors` tables (from schema.sql)
#   ./run.sh run     # stream db_out into Postgres (long-running)
#
# Config: copy sink/.env.example → sink/.env (run.sh sources it automatically).
#   SINK_DSN              psql://<user>:<pass>@<host>:5432/cryptopets?schemaName=solana&sslmode=disable
#   SUBSTREAMS_ENDPOINT   Solana devnet provider host:port  [run only]
#   SUBSTREAMS_API_TOKEN    auth token for that endpoint  [run only]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPKG="$SCRIPT_DIR/../substreams/substreams.spkg"

# Load sink/.env when present (SINK_DSN, SUBSTREAMS_*, Hasura vars for compose).
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

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

# Parse psql://user:pass@host:port/db?... from SINK_DSN into env vars for psql.
parse_sink_dsn() {
    local dsn="$1"
    dsn="${dsn#psql://}"
    if [[ "$dsn" =~ ^([^:]+):([^@]+)@([^:/]+):([0-9]+)/([^?]+) ]]; then
        SINK_PGUSER="${BASH_REMATCH[1]}"
        SINK_PGPASSWORD="${BASH_REMATCH[2]}"
        SINK_PGHOST="${BASH_REMATCH[3]}"
        SINK_PGPORT="${BASH_REMATCH[4]}"
        SINK_PGDATABASE="${BASH_REMATCH[5]}"
        return 0
    fi
    echo "Could not parse SINK_DSN — expected psql://user:pass@host:port/db?..." >&2
    return 1
}

schema_name_from_dsn() {
    if [[ "$1" =~ schemaName=([^&]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "solana"
    fi
}

ensure_postgres_schema() {
    local schema
    schema="$(schema_name_from_dsn "$SINK_DSN")"
    if ! command -v psql >/dev/null 2>&1; then
        echo "psql not found — create the schema manually:" >&2
        echo "  CREATE SCHEMA IF NOT EXISTS ${schema};" >&2
        return 0
    fi
    parse_sink_dsn "$SINK_DSN"
    PGPASSWORD="$SINK_PGPASSWORD" psql \
        -h "$SINK_PGHOST" -p "$SINK_PGPORT" -U "$SINK_PGUSER" -d "$SINK_PGDATABASE" \
        -v ON_ERROR_STOP=1 \
        -c "CREATE SCHEMA IF NOT EXISTS \"${schema}\";"
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
