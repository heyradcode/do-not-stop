# 🚀 Development Guide

## Quick Start

```bash
# Install all dependencies (root + all sub-projects)
pnpm install

# Start everything (Hardhat node + contract deployment + backend + frontend)
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
├── contracts/         # Hardhat + Solidity contracts
│   ├── src/          # Solidity source files
│   ├── test/         # Contract tests
│   └── ...
└── scripts/          # Automation scripts
```

## 🛠️ Available Commands

### Installation & Setup
- `pnpm install` - Installs all dependencies (root + sub-projects)
- `pnpm setup` - Install all dependencies + compile contracts
- `pnpm reset` - Clean everything and reinstall

### Development
- `pnpm dev:full` - **Full stack development** (Hardhat + contracts + backend + frontend)
- `pnpm dev:full:no-deploy` - Full stack without contract deployment
- `pnpm dev:frontend` - Frontend only
- `pnpm dev:backend` - Backend only  
- `pnpm dev:contracts` - Hardhat node only

### Building
- `pnpm build:all` - Build everything
- `pnpm build:frontend` - Build frontend
- `pnpm build:backend` - Build backend
- `pnpm compile` - Compile contracts

### Contract Management
- `pnpm deploy:local` - Deploy to local Hardhat network
- `pnpm deploy:sepolia` - Deploy to Sepolia testnet
- `pnpm test` - Run contract tests
- `pnpm deploy:status` - Check deployment status

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
   - Start backend API server
   - Start frontend development server

3. **Access your app:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - Hardhat Network: http://localhost:8545

## 🔧 Configuration

- **Frontend**: `frontend/vite.config.ts`
- **Backend**: `backend/src/server.ts` (TypeScript)
- **Backend Config**: `backend/tsconfig.json`
- **Contracts**: `contracts/hardhat.config.ts`

## 📝 Notes

- The `dev:full` command uses colored output to distinguish between services
- Contract deployment has a 5-second delay to ensure Hardhat node is ready
- **Contract address is automatically injected** into frontend `.env.local` file (required for frontend to work)
- All services run concurrently and will restart if any fail
- Backend uses TypeScript with hot reload via `tsx watch`
- Use `Ctrl+C` to stop all services at once
