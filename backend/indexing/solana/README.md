# CryptoPets — Solana indexing

Indexes `PetAccount` state from the Solana program
(`78AXV46ks5oFoJHkukvbsfZTJixdj2MeStzuC6thiUry`) into the backend's `pet_roster`
table (Supabase/Postgres), so the frontend can discover Solana opponents the
same way it does EVM ones.

Unlike EVM (an event-handler subgraph on The Graph), Solana is indexed **inside
the existing backend** — there is no separate indexer service, no Substreams,
and no Hasura. [Helius](https://helius.dev) pushes updates to a webhook on the
backend, and a periodic RPC scan reconciles anything missed.

> Previously this used Substreams → Postgres (`substreams-sink-sql`) → Hasura.
> That was dropped: Substreams' account-foundational stream requires an
> expensive plan. Helius RPC + webhooks cover the same need far more cheaply, and
> Supabase's built-in `pg_graphql` replaces Hasura for any GraphQL the frontend
> needs.

## Data flow

```
Helius webhook  (fires on txs touching the program)
        │  POST /api/webhooks/helius   (transaction, not account state)
        ▼
webhooks.service  extract touched account addresses
        ▼
Helius RPC  getMultipleAccounts → decode PetAccount → upsert pet_roster
        ▲
        │  (safety net / backfill)
periodic indexer scan  getProgramAccounts → decode all → upsert pet_roster
        (indexing/solana/indexer, runs on the existing 30s tick)
```

Both paths share the same decoder (`indexer/decode.ts`) and RPC client
(`indexer/rpc.ts`). The webhook gives near-real-time updates; the scan guarantees
eventual consistency if a delivery is missed.

## Code

This code lives outside `src/` but is **compiled and run in-process by the
backend** (the backend `tsconfig` includes `indexing/solana`, and it's reached
via the `@solana/*` path alias). It is not a separate service — unlike
`indexing/evm/subgraph`, which is an off-process subgraph deployed to The Graph.

| Location (under `backend/indexing/solana/`) | Role                                          |
| ------------------------------------------- | --------------------------------------------- |
| `indexer/decode.ts`                         | Decode raw `PetAccount` bytes → roster row.   |
| `indexer/rpc.ts`                            | Helius JSON-RPC client (program + account reads).|
| `indexer/index.ts`                          | `scanSolanaRoster` — periodic reconciliation. |
| `webhooks/`                                 | `POST /api/webhooks/helius` push handler.     |

The orchestrator (`src/indexer/index.ts`) and the upsert repository
(`src/repositories/roster.repository.ts`) stay in `src/` and call into this
module via `@solana/indexer`.

## Configuration

In `backend/.env` (see `backend/env.example`):

```
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=<your-helius-key>
SOLANA_PROGRAM_ID=78AXV46ks5oFoJHkukvbsfZTJixdj2MeStzuC6thiUry
HELIUS_WEBHOOK_SECRET=<random-long-string>   # optional but recommended in prod
```

Solana indexing is a no-op unless `HELIUS_RPC_URL` and `SOLANA_PROGRAM_ID` are
both set. Use the `mainnet.helius-rpc.com` host for mainnet. In production
`HELIUS_WEBHOOK_SECRET` is **required** when `HELIUS_RPC_URL` is set — the server
refuses to boot without it, so the webhook can't be left open.

## Setting up the Helius webhook

Create the webhook once (Helius dashboard, or the Webhooks API), pointed at the
deployed backend:

- **Webhook URL:** `https://<your-backend>/api/webhooks/helius`
- **Type:** `enhanced` (or `raw`) — both are handled.
- **Account addresses:** the program id above (Helius fires when it appears in a
  transaction).
- **Authorization Header:** the same value as `HELIUS_WEBHOOK_SECRET`.

The backend re-reads account state over RPC on each delivery, so the webhook
type/parsing doesn't matter — it's only a "something changed" trigger.

## Keeping decode in sync

`decodePetAccount` reads the account by byte offset. If `PetAccount` in
`contracts/solana/cryptopets/programs/cryptopets/src/state.rs` changes, update
the discriminator, `PET_ACCOUNT_LEN`, and the offsets in `indexer/decode.ts`.
