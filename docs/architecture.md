# Architecture

A high-level map of the `do-not-stop` monorepo. Each section links to the
package that owns the detail; this file only covers how the pieces connect.

## Components

| Component | Stack | Role |
| --- | --- | --- |
| [frontend](../frontend) | React 19, Vite, Wagmi, Viem, TanStack Query | Web app with wallet integration |
| [backend](../backend) | Node.js, Express, TypeScript, Prisma, JWT | REST + GraphQL + gRPC API server |
| [mobile](../mobile) | React Native, TypeScript | Cross-platform mobile client |
| [website](../website) | Next.js | Marketing / docs site |
| [indexer-go](../indexer-go) | Go | Cross-chain indexer (EVM pull + Solana push) |
| [contracts/ethereum](../contracts/ethereum) | Solidity, Hardhat | EVM contracts + subgraph |
| [contracts/solana](../contracts/solana) | Rust, Anchor | Solana programs |
| [shared](../shared) | TypeScript (`@shared/core`) | Common utils/types across TS packages |
| [proto](../proto) | Protobuf / Buf | gRPC contract between Go indexer and backend |

## How data flows

```
        on-chain events                       reads/writes
Ethereum ───────────────┐                 ┌──────────────── frontend / mobile
(Hardhat/Sepolia)       │                 │   REST + GraphQL
                        ▼                 ▼
                   ┌─────────┐        ┌─────────┐
Solana ──────────► │ indexers│ ─────► │ backend │ ◄──── website
(validator)        └─────────┘ Postgres└─────────┘
                        ▲   StreamLiveBattles (gRPC)
                        └──────────────┘
```

- **Indexing.** Both the backend's Node `RosterIndexer` and the optional Go
  `indexer-go` mirror chain state — EVM via subgraph watermark polling, Solana
  via WebSocket push + backfill — into the Prisma-owned Postgres
  (`pet_roster`, `battle_history`). The Go indexer is optional in local dev; the
  Node indexers cover everything until it is promoted. See
  [indexer-go/ARCHITECTURE.md](../indexer-go/ARCHITECTURE.md).
- **gRPC contract.** [proto/cryptopets.proto](../proto/cryptopets.proto) defines
  `GameDataService` (`StreamLiveBattles`, `GetPetState`, `ListReadyOpponents`,
  `EstimateWin`). The Go indexer streams settled battles to the backend over
  `StreamLiveBattles`.
- **Client APIs.** Frontend, mobile, and website talk to the backend over REST
  and GraphQL. See [backend/API.md](../backend/API.md).

## Local topology

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Ethereum RPC | http://localhost:8545 |
| Solana RPC | http://localhost:8899 |

See [DEVELOPMENT.md](../DEVELOPMENT.md) for the commands that bring these up.
