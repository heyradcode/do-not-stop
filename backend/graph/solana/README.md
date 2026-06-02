# CryptoPets — Solana indexing

Indexes `PetAccount` state from the Solana program
(`78AXV46ks5oFoJHkukvbsfZTJixdj2MeStzuC6thiUry`) into a Graph subgraph, so the
backend can query Pets the same way it does on EVM.

Unlike EVM (event-handler subgraph), Solana exposes account *state* rather than
logs, so this side uses **Substreams** to stream and decode accounts, then feeds
the result straight into a subgraph as entity changes.

```
substreams/   Rust → wasm. Filters program-owned accounts, decodes PetAccount,
              emits graph entity changes (substreams.spkg).
subgraph/     Thin substreams-powered subgraph that sinks those entity changes
              into the `Pet` table. No AssemblyScript mappings.
```

## Data flow

```
solana-accounts-foundational (filtered_accounts, owner:<programId>)
        │  FilteredAccounts
        ▼
map_pets        decode PetAccount → cryptopets.v1.Pets
        ▼
graph_out       Pets → EntityChanges
        ▼
subgraph (substreams/graph-entities)  →  Pet entity
```

## Build & deploy (devnet)

```bash
# 1. Build the Substreams package
cd substreams
cargo build --target wasm32-unknown-unknown --release
substreams pack -o substreams.spkg substreams.yaml

# 2. Build & deploy the subgraph (consumes ../substreams/substreams.spkg)
cd ../subgraph
pnpm install
SUBGRAPH_NETWORK=solana-devnet pnpm build
pnpm deploy:studio
```

## Regenerating protobuf code (`substreams/src/pb`)

`src/pb` is generated from `proto/` via `buf`. We define only the messages we
consume — our `cryptopets.proto` plus a vendored subset of the foundational
`Account` / `FilteredAccounts` types — so codegen stays to four small files
instead of the full system-proto dump.

```bash
cd substreams
buf generate          # rewrites src/pb from proto/
```

## Keeping decode in sync

`map_pets` decodes the raw account by byte offset. If `PetAccount` in
`contracts/solana/cryptopets/programs/cryptopets/src/state.rs` changes, update
`PET_ACCOUNT_LEN`, the discriminator, and the offsets in
`substreams/src/lib.rs`.
