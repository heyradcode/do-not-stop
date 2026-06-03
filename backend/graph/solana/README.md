# CryptoPets — Solana indexing

Indexes `PetAccount` state from the Solana program
(`78AXV46ks5oFoJHkukvbsfZTJixdj2MeStzuC6thiUry`) into Postgres, exposed over
GraphQL by Hasura, so the backend can sync Solana pets into `pet_roster` the
same way it polls the EVM subgraph.

Unlike EVM (event-handler subgraph on The Graph), The Graph's hosted Studio
doesn't reliably index Solana substreams-powered subgraphs — so Solana uses the
StreamingFast SQL pattern instead: **Substreams → Postgres (`substreams-sink-sql`)
→ Hasura**. Hasura auto-generates the GraphQL the backend indexer consumes.

```
substreams/   Rust → wasm. Filters program-owned accounts, decodes PetAccount,
              emits DatabaseChanges (substreams.spkg). Embeds the sink config.
sink/         schema.sql (the `pet` table), run.sh (substreams-sink-sql
              setup/run), docker-compose.yml + apply-metadata.sh (Hasura).
```

## Data flow

```
solana-accounts-foundational (filtered_accounts, owner:<programId>)
        │  FilteredAccounts
        ▼
map_pets   decode PetAccount → cryptopets.v1.Pets
        ▼
db_out     Pets → DatabaseChanges (upsert per pet)
        ▼
substreams-sink-sql  →  Postgres  solana.pet
        ▼
Hasura  (GraphQL `pets`)  →  backend indexer (src/indexer/hasura.ts)  →  pet_roster
```

## Prerequisites

- A Solana **devnet** Substreams/Firehose provider endpoint + API token
  (`SUBSTREAMS_ENDPOINT`, `SUBSTREAMS_API_TOKEN`). This is the same hosted-network
  caveat as before — if no devnet provider is available, point the sink at a
  self-hosted Firehose or mainnet-beta.
- `substreams-sink-sql` and `docker` installed.
- Reuses the backend Postgres (`DATABASE_URL`) under a dedicated `solana` schema.

## Build & run (devnet)

```bash
# 1. Build the Substreams package (schema.sql is embedded into the spkg)
cd substreams
cargo build --target wasm32-unknown-unknown --release
substreams pack -o substreams.spkg substreams.yaml

# 2. Sink: create tables, then stream (see sink/run.sh for the env it needs)
cd ../sink
chmod +x test-db.sh
./test-db.sh 192.168.5.1          # find working Windows host IP first
export SINK_DSN='psql://<user>:<pass>@<host>:5432/cryptopets?schemaName=solana&sslmode=disable'
export SUBSTREAMS_ENDPOINT='<solana-devnet-substreams-endpoint>'
export SUBSTREAMS_API_TOKEN='<token>'
./run.sh setup        # one-time: creates solana.pet + cursors
./run.sh run          # long-running: streams db_out into Postgres

# 3. Hasura GraphQL over the same Postgres
cp .env.example .env  # fill HASURA_GRAPHQL_DATABASE_URL + HASURA_GRAPHQL_ADMIN_SECRET
docker compose up -d
./apply-metadata.sh   # tracks solana.pet, names its select root field `pets`
```

Then point the backend at Hasura (`backend/.env`):

```
HASURA_URL_SOLANA=http://localhost:8080/v1/graphql
HASURA_ADMIN_SECRET=<same as HASURA_GRAPHQL_ADMIN_SECRET>
```

The indexer (`backend/src/indexer`) polls this `pets` query and upserts into
`pet_roster` with `chain='solana'`.

## Regenerating protobuf code (`substreams/src/pb`)

`src/pb` is generated from `proto/` via `buf` — only the messages we consume
(`cryptopets.proto` + a vendored subset of the foundational `Account` /
`FilteredAccounts` types), so codegen stays to four small files. The
`DatabaseChanges` proto is vendored separately under `proto-imports/` (used by
`substreams pack` for the `db_out` output type, kept out of `proto/` so `buf`
doesn't regenerate it — we use the `substreams-database-change` crate's types).

```bash
cd substreams
buf generate          # rewrites src/pb from proto/
```

## Keeping decode in sync

`map_pets` decodes the raw account by byte offset. If `PetAccount` in
`contracts/solana/cryptopets/programs/cryptopets/src/state.rs` changes, update
`PET_ACCOUNT_LEN`, the discriminator, and the offsets in `substreams/src/lib.rs`,
and the column list in both `db_out` and `sink/schema.sql`.
