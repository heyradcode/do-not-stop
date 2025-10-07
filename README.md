# Do Not Stop

A full-stack Web3 app with React frontend, Node.js backend, and multi-blockchain smart contracts. Supports both Ethereum and Solana with a unified wallet experience.

## Quick Start

```bash
# Install everything
pnpm install

# Start the entire stack
pnpm dev
```

That's it! The app will be running at http://localhost:5173

## What You Get

- **Unified Wallet Experience** - Connect to Ethereum or Solana with one interface
- **Multi-Chain Support** - Ethereum, Polygon, BSC, Arbitrum, and Solana
- **CryptoZombies** - NFT collection with breeding and battles
- **Modern Stack** - React 19, TypeScript, Wagmi v2, Solana Web3.js
- **One-Command Setup** - Everything starts with a single command

## Project Structure

```
do-not-stop/
├── frontend/           # React + Vite
├── backend/            # Node.js + Express + TypeScript
├── contracts/
│   ├── ethereum/       # Hardhat + Solidity
│   └── solana/         # Anchor + Rust + Docker
└── scripts/            # Deployment automation
```

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start everything (Ethereum + Solana + Backend + Frontend) |
| `pnpm dev:no-deploy` | Start everything except contract deployment |
| `pnpm dev:frontend` | Frontend only |
| `pnpm dev:backend` | Backend only |
| `pnpm dev:contracts` | Ethereum contracts only |
| `pnpm dev:solana` | Solana validator only |
| `pnpm solana:start` | Start Solana validator |
| `pnpm solana:stop` | Stop Solana validator |
| `pnpm build` | Build everything |

## Environment Setup

The app works out of the box, but you can customize these files:

- `backend/.env` - JWT secret, port
- `contracts/ethereum/.env` - Sepolia RPC, private key
- `frontend/.env.local` - API URL, contract address (auto-generated)

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, Wagmi v2, Solana Web3.js, Tailwind CSS

**Backend:** Node.js, Express, TypeScript, JWT auth

**Ethereum:** Solidity 0.8.24, Hardhat v3, OpenZeppelin v5

**Solana:** Rust, Anchor framework, Docker validator

## Development

For detailed development info, see [DEVELOPMENT.md](./DEVELOPMENT.md)

## Learn More

- [Hardhat Docs](https://hardhat.org/docs)
- [Wagmi Docs](https://wagmi.sh)
- [Solana Docs](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)