# API Documentation

## Base URL
```
http://localhost:3001
```

> **Note**: The backend runs on port 3001, not 3000. This is configured in the backend's `src/server.ts` file (TypeScript).

## 🚀 Quick Start

The backend is part of the automated development workflow. From the project root:

```bash
# Start everything (backend + frontend + contracts)
pnpm dev:full

# Or start backend only (TypeScript with hot reload)
pnpm dev:backend
```

> **Backend Features**: This backend is built with TypeScript, includes hot reload for development, and provides type-safe API routes.

## Endpoints

### Root
```http
GET /
```
Returns API information and available endpoints.

**Response:**
```json
{
  "message": "Web3 Authentication API",
  "version": "1.0.0",
  "endpoints": {
    "auth": "/api/auth",
    "protected": "/api/protected",
    "health": "/api/health"
  }
}
```

### Authentication

#### Get Nonce
```http
GET /api/auth/nonce
```
Gets a unique nonce for message signing.

**Response:**
```json
{
  "nonce": "abc123def456"
}
```

#### Verify Signature
```http
POST /api/auth/verify
```
Verifies signature and issues JWT token.

**Request Body:**
```json
{
  "address": "0x...",
  "signature": "0x...",
  "nonce": "abc123def456"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "address": "0x...",
    "createdAt": "2025-01-27T...",
    "lastLogin": "2025-01-27T..."
  }
}
```

### Protected Routes

All protected routes require JWT token in Authorization header:
```
Authorization: Bearer <jwt-token>
```

#### Get User Profile
```http
GET /api/protected/profile
```

**Response:**
```json
{
  "success": true,
  "user": {
    "address": "0x...",
    "createdAt": "2025-01-27T...",
    "lastLogin": "2025-01-27T..."
  }
}
```

#### Get All Users
```http
GET /api/protected/users
```

**Response:**
```json
{
  "success": true,
  "users": [...],
  "total": 5
}
```

### Health Check

#### Server Status
```http
GET /api/health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-01-27T...",
  "users": 3
}
```

## GraphQL — Game data (v2)

```http
POST /graphql
Authorization: Bearer <jwt-token>
```

Single JWT-protected endpoint. The authenticated wallet becomes the `caller`
context — matchmaking uses it to exclude the player's own pets. Body:
`{ "query": "...", "variables": { ... } }`.

Roster and battle data are **read** from what `indexer-go` writes (the backend no
longer decodes contract events). Roster reads are served from indexer-go's RAM
cache when `ROSTER_READ_SOURCE=grpc`, with automatic Postgres fallback; the
matchmaking response shape is identical on both paths.

### `opponents` — battle-ready matchmaking

```graphql
query($chain: String!, $minLevel: Int, $page: Int, $pageSize: Int) {
  opponents(chain: $chain, minLevel: $minLevel, page: $page, pageSize: $pageSize) {
    opponents {
      id chain owner name dna level rarity winCount lossCount readyAt
      # v2 pet fields:
      xp generation parent1Id parent2Id breedCount speciesId
      spouseId breedReadyAt trainReadyAt asset
    }
    total page pageSize
  }
}
```

v2 `OpponentPet` fields (all served from the v2 `pet_roster` columns):

| Field | Type | Notes |
| --- | --- | --- |
| `xp` | Int | XP toward the next level |
| `generation` | Int | 0 = minted (gen-0); else `max(parents)+1` |
| `parent1Id`, `parent2Id` | String | breeding lineage pet ids as decimal strings; `"0"` = none |
| `breedCount` | Int | times used as a breeding parent |
| `speciesId` | Int | resolved at mint from DNA + rarity; 0 until species pools land |
| `spouseId` | String | marriage spouse pet id as a decimal string; `"0"` = unmarried |
| `breedReadyAt`, `trainReadyAt` | Float | unix seconds next breed/train-ready (Float for 64-bit safety, like `readyAt`) |
| `asset` | String | Metaplex Core asset pubkey (Solana only); `""` on EVM |

### `pet` — single pet detail (nullable)

```graphql
query($chain: String!, $id: String!) {
  pet(chain: $chain, id: $id) {
    id chain owner name dna level rarity winCount lossCount readyAt
    xp generation parent1Id parent2Id breedCount speciesId
    spouseId breedReadyAt trainReadyAt asset
  }
}
```

Backed by indexer-go's `GetPetState` RPC. Returns the same `OpponentPet` shape
(all v2 fields) for a single pet, or `null` when no such pet exists. Reads the
indexer cache first when `ROSTER_READ_SOURCE=grpc`, with automatic Postgres
fallback — so it answers even when the indexer link is down.

### `winEstimate` — pre-fight odds (nullable)

```graphql
query($chain: String!, $a: String!, $b: String!) {
  winEstimate(chain: $chain, petId1: $a, petId2: $b) {
    winProbability  # pet1's win probability in [0,1]
    samples         # seeds the combat sim actually ran
  }
}
```

Runs indexer-go's round-based combat sim over the warm roster cache and returns
pet1's win probability. **Returns `null`** (not an error) when the estimate is
unavailable — indexer link off, breaker open, or the cache still cold — so the
matchup UI degrades to "odds unavailable". Intended for a single confirmed
matchup, not per opponents row. Optional `samples` arg overrides the server
default (clamped to 10,000).

### Battle data

`battle_history` carries `loserPetId, seed (0x-hex), rounds, winnerHpRemaining,
xpWin, xpLoss` for every settled battle. The battle worker writes the row from the
signed receipt, in the receipt's own transaction, so a battle cannot be recorded
without its receipt. The AI battle dialogue reads `rounds`/HP/XP to flavor its
narration, and head-to-head/recent form for rivalry context.

There is no chain-truth feed behind this any more: `indexer-go` stopped decoding
settle events when battles left the chain, and its `StreamLiveBattles` push is
gone. `foughtAt` is unix seconds.

### Settle keeper

`backend/src/features/settle-keeper/` settles EVM `GameLogic` **breed and mint**
requests (the `requestX` → Pyth Entropy reveals → `settleX` flow) from a
backend-held wallet once entropy reveals, so the player only signs the request
transaction — `settleX` is permissionless and needed no special authorization,
it was just being sent from the player's wallet by default. Off unless
`KEEPER_ENABLED=true`. See `docs/plan-realtime-battle-ux.md` /
`docs/plan-realtime-battle-impl.md` for the design and threat model.

Battles are **not** settled here any more (§L Phase 6). `requestBattle`/`settleBattle`
were removed from the contracts entirely, along with the Solana settle keeper and shadow
mode; battles run through the backend-authoritative path below.

### Backend-authoritative battles (v2)

`backend/src/routes/battle.ts` — the workflow described in
`docs/plan-backend-battle-architecture.md`. Submission and consent require a JWT
(the wallet signature inside the body is what actually authorizes the action,
per §D); the reads below require nothing, because every value they return is
either already public on chain or is itself a signed artifact anyone is meant
to check independently.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
The four write routes are gated on `BATTLE_BACKEND_MODE_ENABLED` and return **503
`backend-battle-mode-disabled`** when it is off. Every read below stays served regardless:
switching the mode off stops new battles, it does not retract receipts already issued.
`DELETE /authorizations` is ungated too, since withdrawing consent must keep working.

| POST | `/api/battle/intents` | JWT | Submit a signed battle intent (§D). |
| POST | `/api/battle/intents/:intentHash/accept` | JWT | Freeze the snapshot, commit to a future drand round, sign the commitment, and return it synchronously (§E). |
| POST | `/api/battle/authorizations` | JWT | Submit a signed standing defence authorization (§D). |
| DELETE | `/api/battle/authorizations?chainId=` | JWT | Revoke every live authorization for the caller on one chain. No wallet signature required — refusing battles is never the dangerous direction. |
| GET | `/api/battle/config` | none | The `deploymentId`, served `chainIds`, and active ruleset a client needs *before* it can build a signable intent. None of it is derivable client-side, and guessing it fails only after the wallet prompt: a wrong deployment is refused as `wrong-deployment`, a wrong ruleset produces an authorization no battle matches. |
| GET | `/api/battle/:battleId` | none | Battle state summary: state, failure reason, both pets, ruleset hash. |
| GET | `/api/battle/:battleId/commitment` | none | The signed commitment, exactly as delivered at accept time — the re-fetch path if a client's local copy was lost. |
| GET | `/api/battle/:battleId/receipt` | none | The signed receipt, once signing completes. |
| GET | `/api/battle/:battleId/combat-log` | none | The per-strike log plus its hash, served separately from the receipt per §G. |
| GET | `/api/battle/signing-keys` | none | Every signing key this process currently publishes, active and retired (§G). |
| GET | `/api/battle/rulesets` | none | Metadata for every published ruleset bundle. |
| GET | `/api/battle/rulesets/:rulesetHash` | none | One ruleset's full bundle, for replaying against it. |
| POST | `/api/battle/verify-receipt` | none | Body `{ receiptHash }`. Checks the stored signature against a published key and that the payload is well-formed — §A's "operator signature, verified against a published key" row, nothing more. It does **not** re-run the fight, check the drand BLS signature, or recompute progression; that is the standalone verifier's job (§H), which runs with no backend access so its answer cannot depend on this process telling the truth. Passing this check is necessary, not sufficient. |

### Battle room WebSocket (v2)

```
ws(s)://<host>/ws/battle-room?roomId=<roomId>
```

Notification-only, per-room channel for backend-authoritative battles (§J).
Connecting without a `roomId` query parameter closes the socket immediately
(code `1008`). Every message is the same small shape:

```json
{ "type": "battle-updated", "battleId": "btl_...", "state": "signed" }
```

The payload never carries battle content, only "this battle changed state, go
re-fetch it" from the read routes above — a client that never connected, or
missed a message, gets the exact same information by polling those same
endpoints; this socket only makes that faster, never more authoritative. A
battle only has a `roomId` if it was accepted with one (`POST
/api/battle/intents/:intentHash/accept` takes an optional `roomId` in its
body); a battle accepted without one still runs through every state normally,
it just has no spectator link to push a notification through.

This is now the only battle WebSocket. It was added as a second channel
alongside `backend/src/ws/liveBattleSocket.ts`, which broadcast every message to
every connected client for the on-chain settle-keeper flow and was filtered
client-side by `(chainId, requestId)`. That socket was removed once battles
stopped being resolved from chain state, so there is no longer a second channel
and nothing left to filter.

### Public receipt corpus (v2)

`backend/src/routes/receipts.ts` — the paginated export §H item 3 calls for.
No authentication on any route here, deliberately: public replay only works if
anyone can *get* the receipts to replay, not just verify a signature over one
they already have. Every route is cursor-paginated; a response's
`nextCursor`/`nextAfter` is `null` once there is nothing further to fetch, so a
client can stop after the first short page instead of making one guaranteed-
empty extra request.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/receipts/by-pet/:chainId/:petId?cursor=&limit=` | Every receipt naming this pet as attacker or defender, oldest first. This is the export a per-pet chain walk (§G) starts from — proving a pet was really level 12 means replaying the receipts that got it there. |
| GET | `/api/receipts/by-wallet/:wallet?cursor=&limit=` | Every receipt where this wallet owned either side, oldest first. Matched case-insensitively against the ledger's owner columns (the receipt table itself has no owner field, only pet ids). |
| GET | `/api/receipts?signingKeyId=&after=&limit=` | Receipts under one signing key, strictly in `sequence` order — the order the *global* hash chain requires. `signingKeyId` is required; this is the endpoint for walking one key's whole chain end to end, not for a general receipt search. |
| GET | `/api/receipts/:receiptHash/inclusion-proof` | The Merkle proof that this receipt is in its anchored batch (§I). Returns `{ receiptHash, batchNumber, merkleRoot, proof }`. **404 `not-batched`** when the receipt is unknown *or* exists but has not been batched yet — the latter is normal and temporary, while an unbatched receipt past the inclusion SLO is operator failure, so a client needs to be able to tell those apart from a receipt that never existed. |

`limit` defaults to 100 and is clamped to 500 on every route. The by-pet and
by-wallet exports order by `(createdAt, receiptHash)`, since two receipts can
share a `createdAt` (concurrent battles resolving in the same second) and an
order that isn't fully deterministic makes cursor pagination silently skip or
repeat rows at a page boundary.

`GET /api/battle/signing-keys` is backed by the `battle_signing_key` table, so a rotated
key keeps being published across restarts and deploys. The in-memory copy is a cache that
keeps the lookup synchronous on the receipt-verification path; the durable list is reloaded
at startup, and any key that is not the one currently signing is reported as rotated —
so an operator who swapped keys without registering the old one explicitly still gets the
old key published. Rows are never deleted: dropping a key would make its receipts
*unverifiable* rather than invalid, which is a different and worse outcome (§H item 4).

### Reward seasons (v2)

`backend/src/routes/rewards.ts` — the claim-proof half of §I. Unauthenticated, like the
receipt corpus: a claim proof only ever pays the wallet bound inside its leaf, so publishing
one lets a third party sponsor someone's gas rather than take their reward.

Read-only by design. Building a season and opening it on chain are operator actions with
real money attached; they belong behind an owner key and a deliberate command, not an HTTP
route reachable by anything holding a token.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/rewards/seasons/:seasonId` | Season metadata: the receipt `sequence` range it covers, the distributor and token its leaves bind to, the root, the total, and the rates it was computed from. The range and rates are the reproducibility contract — they say exactly which slice of the corpus to replay to arrive at this root. |
| GET | `/api/rewards/seasons/:seasonId/claim/:wallet` | The wallet's `amount`, its Merkle `proof`, and the `breakdown` behind the number. **404 `no-entitlement`** covers both an unknown season and a wallet that earned nothing — the answer to "what can I claim" is the same either way, and distinguishing them would leak which wallets participated to anyone enumerating. |

Only **anchored** receipts count toward a season. An unanchored receipt is signed and public,
but its batch root is not yet immutable, so rewarding it would mean paying against a history
that could still be reorganised.

### Relevant environment variables

| Var | Purpose |
| --- | --- |
| `INDEXER_GRPC_ADDR` | indexer-go gRPC link (e.g. `localhost:50051`). Unset = stream + `winEstimate` off; roster falls back to Postgres. |
| `ROSTER_READ_SOURCE` | `grpc` to read matchmaking from indexer-go's cache (Postgres fallback); `postgres` (default) for Prisma only. |
| `INDEXER_PROTO_PATH` | Override path to `proto/cryptopets.proto` (defaults to `../proto`). |
| `KEEPER_ENABLED` | Turns the settle keeper on (breed and mint only — battles are settled by the backend, §L Phase 6). Off by default. |
| `KEEPER_RPC_URL` / `KEEPER_PRIVATE_KEY` / `KEEPER_CHAIN_ID` / `KEEPER_GAME_LOGIC_ADDRESS` | Required once enabled; keeper logs and no-ops if any are missing rather than crashing the server. |
| `KEEPER_BACKFILL_BLOCKS` | How far back to scan on boot for requests never settled (default 5000). |
| `KEEPER_MOCK_REVEAL` | Local dev only: keeper also acts as the Entropy provider (`MockEntropy.mockReveal`). Only takes effect when `KEEPER_CHAIN_ID=31337`. |
| `BATTLE_BACKEND_MODE_ENABLED` | Backend-authoritative battle mode (§L Phase 3). Off by default; gates the write routes, the outbox worker, and the signer requirement. Reads stay served either way. |
| `BATTLE_BATCH_MIN_SIZE` / `BATTLE_BATCH_MAX_SIZE` | Smallest run worth anchoring, and the cap on one batch (§I). |
| `BATTLE_ANCHOR_RPC_URL` / `BATTLE_ANCHOR_PRIVATE_KEY` / `BATTLE_ANCHOR_REGISTRY_ADDRESS` / `BATTLE_ANCHOR_CHAIN_ID` | Anchoring batch roots in `BattleBatchRegistry`. Required together; with any missing, batches are built but never anchored. The wallet needs the registry's publisher role. |
| `BATTLE_ANCHOR_INTERVAL_MS` | How often to build and anchor (default 60000). Latency only — both halves are idempotent. |

> **Migration prerequisite:** the v2 `pet_roster` / `battle_history` columns ship
> in `prisma/schema.prisma`; run `pnpm prisma:migrate` then `pnpm prisma:generate`
> before indexer-go writes the new columns. All new columns are defaulted, so v1
> rows and the dialogue client-report write path stay valid.
