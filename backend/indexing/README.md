# CryptoPets — roster indexing (EVM + Solana)

How on-chain pets become rows the PvP matchmaker can query. Both chains feed one
table, `pet_roster`, through one repository, so the API and frontend never care
which chain a pet came from.

- **EVM** → an event-handler **subgraph** on The Graph (`indexing/evm`).
- **Solana** → **Helius** webhook + RPC scan, run in-process by the backend
  (`indexing/solana/scanner`, `indexing/solana/webhooks`). See
  [`solana/README.md`](./solana/README.md) for the Solana-only detail.

## The shared interface (what makes the chains interchangeable)

Everything downstream of ingestion is chain-agnostic:

| Layer            | Location                                  | Role                                            |
| ---------------- | ----------------------------------------- | ----------------------------------------------- |
| Store            | `pet_roster` (`prisma/schema.prisma`)     | One row per pet, keyed `(chain, petId)`.        |
| Repository       | `src/repositories/roster.repository.ts`   | `upsertPet` (writes), `findReadyOpponents` (reads). |
| Orchestrator     | `src/indexer/index.ts`                    | Runs each configured source on a 30s tick.      |
| API              | `POST /graphql  { opponents(chain: ...) }`               | Reads the roster; identical for both chains.    |

Every source — no matter the chain — ends by calling `upsertPet` with the **same
shape**:

```ts
upsertPet({
  chain,        // 'evm' | 'solana'  → part of the primary key
  petId, owner, name, dna,
  level, rarity, winCount, lossCount,
  readyAt,      // bigint, unix seconds the pet is next battle-ready
});
```

The upsert is keyed on `(chain, petId)`, so re-emitting a pet (an EVM block
re-org, a Solana reconciliation pass) is idempotent and transfers just update
`owner` in place.

## Data flow (both chains → one table)

```
EVM                                   SOLANA
────────────────────────────         ─────────────────────────────────────────
CryptoPets / Battle / Inventory       CryptoPets program (PetAccount state)
 events                                       │
   │                                          ├── Helius webhook (push, real-time)
   ▼                                          │      POST /api/webhooks/helius
The Graph subgraph                            │      → RPC re-read touched accounts
 (handlers build Pet entities)                │
   │  GraphQL                                 └── periodic RPC scan (safety net)
   ▼                                                 getProgramAccounts (30s tick)
backend polls every 30s                              │
 src/indexer/subgraph.ts                       decode PetAccount → roster row
 (keyset pagination over id)                    indexing/solana/scanner/decode.ts
   │                                                 │
   └──────────────► upsertPet() ◄──────────────────┘
                         │
                   pet_roster  (Supabase / Postgres)
                         │
              POST /graphql  { opponents(chain: ...) }
                         │
                   frontend matchmaking
```

## EVM vs Solana, side by side

| Aspect              | EVM                                          | Solana                                                |
| ------------------- | -------------------------------------------- | ----------------------------------------------------- |
| What's indexed      | Contract **events** (`Transfer`, `NewPet`, `FightResult`, …) | **Account state** (`PetAccount`)              |
| Indexing model      | Event-driven; the subgraph derives `Pet` entities | State snapshot; we read & decode the account directly |
| Infra               | The Graph (hosted Studio / decentralized net) | Helius (RPC + webhooks) — no separate indexer service |
| Ingestion into backend | **Pull**: poll the subgraph's GraphQL every 30s | **Push** (webhook, real-time) **+ pull** (RPC scan, reconcile) |
| Decode location     | Subgraph mappings (`indexing/evm/src/*.ts`, AssemblyScript) | Backend TS (`indexing/solana/scanner/decode.ts`)   |
| Freshness mechanism | Each poll re-reads everything `id_gt` cursor | Webhook = low latency; 30s scan = backfill/safety net |
| `owner` format      | EVM address, **lowercased** on ingest         | base58 pubkey (matches the wallet / auth storageKey)  |
| Source files        | `indexing/evm/`, `src/indexer/subgraph.ts` | `indexing/solana/scanner/`, `indexing/solana/webhooks/` |

### Why the two approaches differ

The Graph indexes EVM event logs cleanly, and the EVM contracts already emit the
events the matchmaker needs — so a subgraph is the natural fit there. Solana has
no equivalent hosted event-indexer for this program's account model, and the
Substreams path that would cover it requires an expensive plan. Helius gives the
same result cheaply: webhooks push changes in near-real-time, and a periodic
`getProgramAccounts` scan guarantees eventual consistency if a delivery is
missed. Crucially, **both still converge on `upsertPet` / `pet_roster`** — the
difference is confined to ingestion.

## Configuration

A source only runs when its env is set (see `backend/env.example`):

| Chain  | Enable with                                  |
| ------ | -------------------------------------------- |
| EVM    | `SUBGRAPH_URL_EVM` (subgraph GraphQL URL)    |
| Solana | `HELIUS_RPC_URL` + `SOLANA_PROGRAM_ID` (and `HELIUS_WEBHOOK_SECRET`, required in production) |

Shared knobs: `INDEXER_ENABLED` (default `true`), `INDEXER_INTERVAL_MS` (default
`30000`). With neither chain configured the indexer is a no-op and logs that it
isn't starting.

## Keeping the pet shape in sync

The `Pet` entity, the decoder, and `pet_roster` must agree field-for-field:

- EVM: `indexing/evm/schema.graphql`
- Solana: `indexing/solana/scanner/decode.ts` (byte offsets — mirror
  `contracts/solana/cryptopets/programs/cryptopets/src/state.rs`)
- Store: `prisma/schema.prisma` (`PetRoster`)

See [`../../PVP_BATTLE.md`](../../PVP_BATTLE.md) for the broader matchmaking
design and the rationale behind the pluggable-source model.
