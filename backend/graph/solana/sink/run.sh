#!/usr/bin/env bash
set -euo pipefail

# Drives substreams-sink-sql for the Solana CryptoPets pipeline.
#
#   ./run.sh pack    # build wasm + pack substreams.spkg for the active network
#   ./run.sh setup   # one-time: create the `pet` + `cursors` tables (from schema.sql)
#   ./run.sh run     # stream db_out into Postgres (long-running)
#
# Config: copy sink/.env.example → sink/.env (run.sh sources it automatically).
#   SOLANA_NETWORK         devnet | mainnet — selects endpoint, start block, pack --network
#   SINK_DSN               psql://<user>:<pass>@<host>:5432/cryptopets?schemaName=solana&sslmode=disable
#   SUBSTREAMS_ENDPOINT    override the network's default provider host:port  [optional]
#   SUBSTREAMS_START_BLOCK override the network's default start block          [optional]
#   SUBSTREAMS_API_TOKEN   auth token for that endpoint  [run only]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBSTREAMS_DIR="$SCRIPT_DIR/../substreams"
SPKG="$SUBSTREAMS_DIR/substreams.spkg"

# Load sink/.env when present (SINK_DSN, SUBSTREAMS_*, Hasura vars for compose).
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

# Resolve the active network and its defaults (endpoint + first streamable block).
# SUBSTREAMS_ENDPOINT / SUBSTREAMS_START_BLOCK in .env still win when set.
SOLANA_NETWORK="${SOLANA_NETWORK:-devnet}"
case "$SOLANA_NETWORK" in
    devnet)
        SUBSTREAMS_NETWORK="solana-devnet"
        DEFAULT_ENDPOINT="accounts.devnet.sol.streamingfast.io:443"
        # Devnet's hosted AccountBlock Firehose only streams from here onward.
        DEFAULT_START_BLOCK="455457500"
        ;;
    mainnet|mainnet-beta)
        SUBSTREAMS_NETWORK="solana-mainnet"
        DEFAULT_ENDPOINT="accounts.mainnet.sol.streamingfast.io:443"
        DEFAULT_START_BLOCK=""  # let the server resolve from the module initialBlock
        ;;
    *)
        echo "Unknown SOLANA_NETWORK='$SOLANA_NETWORK' (expected devnet|mainnet)" >&2
        exit 1
        ;;
esac

require_spkg() {
    if [[ ! -f "$SPKG" ]]; then
        echo "Missing $SPKG — build it first:  ./run.sh pack" >&2
        exit 1
    fi
}

if [[ "${1:-}" == "pack" ]]; then
    if ! command -v substreams >/dev/null 2>&1; then
        echo "substreams CLI not found. Install it: https://substreams.streamingfast.io" >&2
        exit 1
    fi
    # One spkg serves both networks: the manifest's `networks:` block carries
    # per-network initialBlocks, and `run` selects with `--network`. (pack has
    # no --network flag; the active network is chosen at run time.)
    ( cd "$SUBSTREAMS_DIR" \
        && cargo build --target wasm32-unknown-unknown --release \
        && substreams pack -o substreams.spkg substreams.yaml )
    echo "Packed $SPKG (active network at run: $SUBSTREAMS_NETWORK)"
    exit 0
fi

if ! command -v substreams-sink-sql >/dev/null 2>&1; then
    echo "substreams-sink-sql not found. Install it: https://github.com/streamingfast/substreams-sink-sql" >&2
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
        require_spkg
        ensure_postgres_schema
        substreams-sink-sql setup "$SINK_DSN" "$SPKG"
        ;;
    run)
        require_spkg
        endpoint="${SUBSTREAMS_ENDPOINT:-$DEFAULT_ENDPOINT}"
        start_block="${SUBSTREAMS_START_BLOCK:-$DEFAULT_START_BLOCK}"
        echo "Streaming $SUBSTREAMS_NETWORK from ${start_block:-<module initialBlock>} via $endpoint" >&2
        args=(run "$SINK_DSN" "$SPKG" -e "$endpoint" --network "$SUBSTREAMS_NETWORK")
        [[ -n "$start_block" ]] && args+=(-s "$start_block")
        substreams-sink-sql "${args[@]}"
        ;;
    *)
        echo "usage: $0 {pack|setup|run}" >&2
        exit 1
        ;;
esac
