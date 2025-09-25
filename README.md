# Do Not Stop - Full Stack Web3 App

A modern full-stack Web3 application with React frontend, Node.js backend, and Solidity smart contracts. Features automated development workflow with one-command setup and deployment.

## 🏗️ Project Structure

```
do-not-stop/
├── frontend/           # React + Vite frontend
│   ├── src/           # React components and logic
│   ├── public/        # Static assets
│   ├── package.json   # Frontend dependencies
│   └── vite.config.ts # Vite configuration
├── backend/           # Node.js + Express API
│   ├── routes/        # API routes
│   ├── package.json   # Backend dependencies
│   └── README.md      # Backend documentation
├── contracts/         # Hardhat + Solidity contracts
│   ├── src/           # Solidity source files
│   ├── test/          # Contract tests
│   ├── artifacts/     # Compiled contracts
│   ├── cache/         # Hardhat cache
│   ├── ignition/      # Deployment scripts
│   ├── hardhat.config.*
│   └── package.json   # Contract dependencies
├── scripts/           # Automation scripts
│   └── deploy-with-delay.js
└── package.json       # Root workspace management
```

## 🚀 Quick Start

### One-Command Setup
```bash
# Install all dependencies (root + all sub-projects)
pnpm install

# Start everything (Hardhat + contracts + backend + frontend)
pnpm dev:full
```

### Individual Services
```bash
# Start everything with one command
pnpm start              # Alias for dev:full

# Or start individually:
pnpm dev:frontend       # React frontend (http://localhost:5173)
pnpm dev:backend        # Node.js API (http://localhost:3001)
pnpm dev:contracts      # Hardhat local network (http://localhost:8545)
```

### Smart Contracts

```bash
# Compile contracts
pnpm compile

# Run tests
pnpm test

# Deploy to local network
pnpm deploy:local

# Deploy to Sepolia testnet
pnpm deploy:sepolia

# Check deployment status
pnpm deploy:status
```

## 🧟‍♂️ Features

- **🚀 One-Command Development** - Start entire stack with `pnpm dev:full`
- **🔐 Web3 Authentication** - MetaMask integration with JWT
- **🧟‍♂️ CryptoZombies** - NFT collection with breeding and battles
- **🌐 Multi-chain Support** - Ethereum, Polygon, BSC, Arbitrum, etc.
- **⚡ Modern Tech Stack** - React 19, Wagmi v2, Viem, Hardhat v3
- **🔒 TypeScript** - Full type safety across the stack
- **🎨 Automated Deployment** - Contracts deploy automatically
- **🛠️ Workspace Management** - Organized monorepo structure

## 🛠️ Tech Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- Wagmi v2 + Viem (Web3)
- React Query (data fetching)
- Tailwind CSS (styling)

### Backend
- Node.js + Express
- JWT authentication
- CORS enabled

### Smart Contracts
- Solidity 0.8.24
- Hardhat v3
- OpenZeppelin v5
- ERC-721 NFT standard

## 📝 Environment Variables

Create `.env` files in the appropriate directories:

### Contracts `.env` (in `contracts/` directory)
```bash
SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here
```

### Backend `.env` (in `backend/` directory)
```bash
JWT_SECRET=your-super-secret-jwt-key-here
PORT=3001
```

### Frontend `.env` (in `frontend/` directory)
```bash
VITE_API_URL=http://localhost:3001
```

## 🎯 Development Workflow

### Automated (Recommended)
```bash
# One command to rule them all
pnpm dev:full
```

### Manual (if needed)
1. **Start local blockchain**: `pnpm dev:contracts`
2. **Deploy contracts**: `pnpm deploy:local`
3. **Start backend**: `pnpm dev:backend`
4. **Start frontend**: `pnpm dev:frontend`
5. **Test contracts**: `pnpm test`

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies (root + sub-projects) |
| `pnpm dev:full` | **Full stack development** (everything running) |
| `pnpm start` | Alias for `dev:full` |
| `pnpm dev:frontend` | Frontend only (http://localhost:5173) |
| `pnpm dev:backend` | Backend only (http://localhost:3001) |
| `pnpm dev:contracts` | Hardhat node only (http://localhost:8545) |
| `pnpm compile` | Compile smart contracts |
| `pnpm test` | Run contract tests |
| `pnpm deploy:local` | Deploy to local network |
| `pnpm deploy:sepolia` | Deploy to Sepolia testnet |
| `pnpm build:all` | Build everything |
| `pnpm status` | Show project status |
| `pnpm reset` | Clean everything and reinstall |

## 📚 Learn More

- [Hardhat Documentation](https://hardhat.org/docs)
- [Wagmi Documentation](https://wagmi.sh)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Detailed development guide