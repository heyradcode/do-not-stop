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

### v2 battle data

Settled battles carry the round-based combat-sim outputs `indexer-go` now emits —
`loserPetId, seed (0x-hex), rounds, winnerHpRemaining, xpWin, xpLoss`. These flow
through the live `StreamLiveBattles` chain-truth feed (the `seed` re-runs the sim
client-side for blow-by-blow replay) and are persisted on `battle_history`; the
AI battle dialogue uses `rounds`/HP/XP to flavor its narration.

### Relevant environment variables

| Var | Purpose |
| --- | --- |
| `INDEXER_GRPC_ADDR` | indexer-go gRPC link (e.g. `localhost:50051`). Unset = stream + `winEstimate` off; roster falls back to Postgres. |
| `ROSTER_READ_SOURCE` | `grpc` to read matchmaking from indexer-go's cache (Postgres fallback); `postgres` (default) for Prisma only. |
| `INDEXER_PROTO_PATH` | Override path to `proto/cryptopets.proto` (defaults to `../proto`). |

> **Migration prerequisite:** the v2 `pet_roster` / `battle_history` columns ship
> in `prisma/schema.prisma`; run `pnpm prisma:migrate` then `pnpm prisma:generate`
> before indexer-go writes the new columns. All new columns are defaulted, so v1
> rows and the dialogue client-report write path stay valid.
