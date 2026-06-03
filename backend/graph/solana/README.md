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

- A Substreams API token (`SUBSTREAMS_API_TOKEN`). The endpoint itself is derived
  from `SOLANA_NETWORK` (see below) — you do **not** hardcode it.

  > **Important — use the *accounts* Firehose host.** This pipeline reads the
  > foundational `AccountBlock` stream, which is only served by the
  > `accounts.<network>.sol.streamingfast.io` hosts. The plain block hosts
  > (`devnet.sol.streamingfast.io` / `mainnet.sol.streamingfast.io`) reject it
  > with `input source "sf.solana.type.v1.AccountBlock" not supported`. This is
  > why pointing devnet at the plain block host fails while mainnet (already on
  > the accounts host) worked. Devnet also only streams AccountBlocks from block
  > **455457500** onward.

- `substreams` + `substreams-sink-sql` and `docker` installed.
- Reuses the backend Postgres (`DATABASE_URL`) under a dedicated `solana` schema.

## Network selection

One variable, `SOLANA_NETWORK` (in `sink/.env`), drives everything — `run.sh`
derives the endpoint, the start block, and the `--network` passed to the sink:

| `SOLANA_NETWORK` | endpoint                                   | start block |
| ---------------- | ------------------------------------------ | ----------- |
| `devnet`         | `accounts.devnet.sol.streamingfast.io:443`  | 455457500   |
| `mainnet`        | `accounts.mainnet.sol.streamingfast.io:443` | module init |

A single `substreams.spkg` serves both: its `networks:` block carries each
network's `initialBlock` overrides, and `substreams-sink-sql run --network`
selects between them. Override the derived defaults with `SUBSTREAMS_ENDPOINT` /
`SUBSTREAMS_START_BLOCK` if needed.

## Build & run

```bash
# 0. Pick the network (sink/.env): SOLANA_NETWORK=devnet  (or mainnet)
cp sink/.env.example sink/.env   # set SOLANA_NETWORK, SINK_DSN, SUBSTREAMS_API_TOKEN, Hasura vars

# 1. Build + pack the Substreams package (schema.sql is embedded into the spkg)
cd sink
./run.sh pack          # cargo build (wasm) + substreams pack

# 2. Sink: create tables, then stream
./run.sh setup         # one-time: creates solana.pet + cursors
./run.sh run           # long-running: streams db_out into Postgres

# 3. Hasura GraphQL over the same Postgres (reuses the sink/.env from step 0)
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
