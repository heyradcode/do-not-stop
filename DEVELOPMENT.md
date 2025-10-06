# 🚀 Development Guide

## Quick Start

```bash
# Install all dependencies (root + all sub-projects)
pnpm install

# Start everything (Hardhat node + contract deployment + backend + frontend + Solana)
pnpm dev:full

# Or use the shorter alias
pnpm start
```

## 📁 Project Structure

```
do-not-stop/
├── backend/           # Node.js + TypeScript API server
│   ├── src/          # TypeScript source files
│   ├── dist/         # Compiled JavaScript
│   └── tsconfig.json # TypeScript configuration
├── frontend/          # React + Vite frontend
├── contracts/         # Multi-blockchain smart contracts
│   ├── ethereum/     # Ethereum contracts (Hardhat + Solidity)
│   │   ├── src/      # Solidity source files
│   │   ├── test/     # Contract tests
│   │   └── ...
│   └── solana/       # Solana contracts (Anchor + Rust)
│       ├── hello-world/ # Solana program example
│       ├── config/   # Solana configuration
│       └── docker-compose.yml # Solana Docker setup
└── scripts/          # Automation scripts
```

## 🛠️ Available Commands

### Installation & Setup
- `pnpm install` - Installs all dependencies (root + sub-projects)
- `pnpm setup` - Install all dependencies + compile contracts
- `pnpm reset` - Clean everything and reinstall

### Development
- `pnpm dev:full` - **Full stack development** (Hardhat + contracts + backend + frontend + Solana)
- `pnpm dev:full:no-deploy` - Full stack without contract deployment
- `pnpm dev:frontend` - Frontend only
- `pnpm dev:backend` - Backend only  
- `pnpm dev:contracts` - Hardhat node only
- `pnpm dev:solana` - Solana validator only

### Building
- `pnpm build:all` - Build everything
- `pnpm build:frontend` - Build frontend
- `pnpm build:backend` - Build backend
- `pnpm compile` - Compile contracts

### Contract Management
#### Ethereum
- `pnpm deploy:local` - Deploy to local Hardhat network
- `pnpm deploy:sepolia` - Deploy to Sepolia testnet
- `pnpm test` - Run contract tests
- `pnpm deploy:status` - Check deployment status

#### Solana
- `pnpm solana:start` - Start Solana validator
- `pnpm solana:stop` - Stop Solana validator
- `pnpm solana:logs` - View Solana logs
- `pnpm solana:reset` - Reset Solana validator
- `pnpm solana:cli` - Access Solana CLI

### Utilities
- `pnpm status` - Show project status
- `pnpm clean` - Clean build artifacts
- `pnpm reset` - Full reset

## 🎯 Development Workflow

1. **First time setup:**
   ```bash
   pnpm install
   ```

2. **Daily development:**
   ```bash
   pnpm dev:full
   ```
   This will:
   - Start Hardhat local network
   - Deploy contracts automatically
   - **Inject contract address into frontend** (creates/updates `.env.local`)
   - Start Solana validator in Docker
   - Start backend API server
   - Start frontend development server

3. **Access your app:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - Hardhat Network: http://localhost:8545
   - Solana RPC: http://localhost:8899

## 🔧 Configuration

- **Frontend**: `frontend/vite.config.ts`
- **Backend**: `backend/src/server.ts` (TypeScript)
- **Backend Config**: `backend/tsconfig.json`
- **Ethereum Contracts**: `contracts/ethereum/hardhat.config.ts`
- **Solana Contracts**: `contracts/solana/docker-compose.yml`

## 📝 Notes

- The `dev:full` command uses colored output to distinguish between services
- Contract deployment has a 5-second delay to ensure Hardhat node is ready
- **Contract address is automatically injected** into frontend `.env.local` file (required for frontend to work)
- Solana validator runs in Docker for consistent cross-platform development
- All services run concurrently and will restart if any fail
- Backend uses TypeScript with hot reload via `tsx watch`
- Use `Ctrl+C` to stop all services at once

## 🐳 Solana Docker Setup

The Solana validator runs in Docker for consistent development across platforms:

- **Docker Image**: `solanalabs/solana:v1.18.4`
- **RPC Port**: 8899
- **WebSocket Port**: 8900
- **Metrics Port**: 9900
- **Data Persistence**: Docker volumes for ledger data
- **Configuration**: `contracts/solana/config/config.yml`

### Solana Development Workflow

1. **Start Solana validator:**
   ```bash
   pnpm solana:start
   ```

2. **Access Solana CLI:**
   ```bash
   pnpm solana:cli
   ```

3. **Check Solana logs:**
   ```bash
   pnpm solana:logs
   ```

4. **Reset Solana validator:**
   ```bash
   pnpm solana:reset
   ```
