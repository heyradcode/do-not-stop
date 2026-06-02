#!/usr/bin/env bash
set -euo pipefail

# Tracks the `solana.pet` table in Hasura and names its select root field
# `pets`, so the backend indexer can query `{ pets(...) { ... } }`.
# Idempotent: a re-track ("already-tracked") response is ignored.
#
# Run once after `docker compose up`. Reads sink/.env for HASURA_ENDPOINT and
# HASURA_GRAPHQL_ADMIN_SECRET.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/.env" ]] && set -a && . "$SCRIPT_DIR/.env" && set +a

ENDPOINT="${HASURA_ENDPOINT:-http://localhost:8080}"
: "${HASURA_GRAPHQL_ADMIN_SECRET:?set HASURA_GRAPHQL_ADMIN_SECRET (sink/.env)}"

resp=$(curl -s -X POST "$ENDPOINT/v1/metadata" \
    -H "Content-Type: application/json" \
    -H "x-hasura-admin-secret: $HASURA_GRAPHQL_ADMIN_SECRET" \
    -d '{
      "type": "pg_track_table",
      "args": {
        "source": "default",
        "table": { "schema": "solana", "name": "pet" },
        "configuration": {
          "custom_root_fields": {
            "select": "pets",
            "select_by_pk": "pet",
            "select_aggregate": "pets_aggregate"
          }
        }
      }
    }')

if echo "$resp" | grep -q '"already-tracked"'; then
    echo "solana.pet already tracked — nothing to do."
elif echo "$resp" | grep -q '"message":"success"'; then
    echo "Tracked solana.pet (select root field: pets)."
else
    echo "Unexpected response: $resp" >&2
    exit 1
fi
