# Development Guide

## Getting Started

```bash
# Install dependencies
pnpm install

# Start everything
pnpm dev
```

This starts:
- Ethereum local network (Hardhat)
- Solana validator (Docker)
- Backend API server
- Frontend development server
- Auto-deploys contracts

## Available Commands

### Development
- `pnpm dev` - Start everything (Ethereum + Solana + Backend + Frontend)
- `pnpm dev:no-deploy` - Start everything except contract deployment
- `pnpm dev:frontend` - Frontend only
- `pnpm dev:backend` - Backend only
- `pnpm dev:contracts` - Ethereum contracts only
- `pnpm dev:solana` - Solana validator only

### Building
- `pnpm build` - Build everything
- `pnpm compile` - Compile contracts only

### Ethereum Contracts
- `pnpm deploy:local` - Deploy to local network
- `pnpm deploy:sepolia` - Deploy to Sepolia testnet
- `pnpm test` - Run contract tests

### Solana
- `pnpm solana:start` - Start Solana validator (detached)
- `pnpm solana:stop` - Stop Solana validator
- `pnpm solana:logs` - View Solana logs
- `pnpm dev:solana` - Start Solana validator with logs

### Utilities
- `pnpm clean` - Clean build artifacts
- `pnpm reset` - Clean and reinstall everything

## Project Structure

```
do-not-stop/
├── frontend/           # React + Vite frontend
├── backend/            # Node.js + Express + TypeScript
├── contracts/
│   ├── ethereum/       # Hardhat + Solidity contracts
│   └── solana/         # Anchor + Rust + Docker
└── scripts/            # Deployment automation
```

## Development Workflow

1. **First time:**
   ```bash
   pnpm install
   pnpm dev
   ```

2. **Daily development:**
   ```bash
   pnpm dev
   ```

3. **Access your app:**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001
   - Ethereum RPC: http://localhost:8545
   - Solana RPC: http://localhost:8899

## Configuration Files

- **Frontend:** `frontend/vite.config.ts`
- **Backend:** `backend/src/server.ts`
- **Ethereum:** `contracts/ethereum/hardhat.config.ts`
- **Solana:** `contracts/solana/docker-compose.yml`

## Environment Variables

### Backend (`backend/.env`)
```bash
JWT_SECRET=your-super-secret-jwt-key-here
PORT=3001
```

### Ethereum Contracts (`contracts/ethereum/.env`)
```bash
SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here
```

### Frontend (`frontend/.env.local`)
```bash
VITE_API_URL=http://localhost:3001
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

> The contract address is automatically injected when you run `pnpm dev`

## Solana Development

The Solana validator runs in Docker for consistency with quiet logging:

- **Image:** `tchambard/solana-test-validator:latest`
- **RPC Port:** 8899
- **WebSocket:** 8900
- **Metrics:** 9900
- **Logging:** Quiet mode (verbose logs suppressed)

### Solana Commands
```bash
pnpm solana:start    # Start validator (detached, quiet)
pnpm solana:stop     # Stop validator
pnpm solana:logs     # View logs
pnpm dev:solana      # Start validator with logs visible
```

## Notes

- Contract deployment has a 5-second delay to ensure Hardhat is ready
- Solana validator uses Docker volumes for data persistence
- All services restart automatically if they fail
- Use `Ctrl+C` to stop everything
- Backend uses TypeScript with hot reload via `tsx watch`