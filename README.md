# Do Not Stop - Full Stack Web3 App

A modern full-stack Web3 application with React frontend, Node.js backend, and multi-blockchain smart contracts. Features automated development workflow with one-command setup and deployment for both Ethereum and Solana blockchains.

## 🏗️ Project Structure

```
do-not-stop/
├── frontend/           # React + Vite frontend
│   ├── src/           # React components and logic
│   ├── public/        # Static assets
│   ├── package.json   # Frontend dependencies
│   └── vite.config.ts # Vite configuration
├── backend/           # Node.js + Express API (TypeScript)
│   ├── src/           # TypeScript source files
│   │   ├── server.ts  # Main server file
│   │   └── routes/    # API routes (TypeScript)
│   ├── dist/          # Compiled JavaScript
│   ├── tsconfig.json  # TypeScript configuration
│   ├── package.json   # Backend dependencies
│   └── README.md      # Backend documentation
├── contracts/         # Multi-blockchain smart contracts
│   ├── ethereum/      # Ethereum contracts (Hardhat + Solidity)
│   │   ├── src/       # Solidity source files
│   │   ├── test/      # Contract tests
│   │   ├── artifacts/ # Compiled contracts
│   │   └── ...
│   └── solana/        # Solana contracts (Anchor + Rust)
│       ├── hello-world/ # Solana program example
│       ├── config/    # Solana configuration
│       └── docker-compose.yml # Solana Docker setup
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
pnpm dev:backend        # TypeScript API (http://localhost:3001)
pnpm dev:contracts      # Hardhat local network (http://localhost:8545)
pnpm dev:solana        # Solana local validator (http://localhost:8899)
```


### Smart Contracts

```bash
# Ethereum contracts
pnpm compile          # Compile contracts
pnpm test             # Run tests
pnpm deploy:local     # Deploy to local network
pnpm deploy:sepolia   # Deploy to Sepolia testnet

# Solana contracts
pnpm solana:start     # Start Solana validator
pnpm solana:stop      # Stop Solana validator
pnpm solana:logs      # View Solana logs
pnpm solana:reset     # Reset Solana validator
pnpm solana:cli       # Access Solana CLI
```

## 🧟‍♂️ Features

- **🚀 One-Command Development** - Start entire stack with `pnpm dev:full`
- **🔐 Multi-Blockchain Authentication** - MetaMask (Ethereum) + Solana wallet support
- **🧟‍♂️ CryptoZombies** - NFT collection with breeding and battles
- **🌐 Multi-chain Support** - Ethereum, Polygon, BSC, Arbitrum, Solana
- **⚡ Modern Tech Stack** - React 19, Wagmi v2, Viem, Hardhat v3, Solana Web3.js
- **🔒 TypeScript** - Full type safety across frontend and backend
- **🎨 Automated Deployment** - Contracts deploy automatically
- **🐳 Docker Integration** - Solana local validator in Docker
- **🛠️ Workspace Management** - Organized monorepo structure

## 🛠️ Tech Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- Wagmi v2 + Viem (Ethereum Web3)
- Solana Web3.js + Wallet Adapter (Solana)
- React Query (data fetching)
- Tailwind CSS (styling)

### Backend
- Node.js + Express + TypeScript
- JWT authentication
- CORS enabled
- Hot reload with tsx
- Type-safe API routes

### Smart Contracts
#### Ethereum
- Solidity 0.8.24
- Hardhat v3
- OpenZeppelin v5
- ERC-721 NFT standard

#### Solana
- Rust + Anchor framework
- Docker-based local validator
- Solana Web3.js integration
- Multi-wallet support

## 📝 Environment Variables

Create `.env` files in the appropriate directories:

### Ethereum Contracts `.env` (in `contracts/ethereum/` directory)
```bash
SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here
```

### Backend `.env` (in `backend/` directory)
```bash
JWT_SECRET=your-super-secret-jwt-key-here
PORT=3001
```

### Frontend `.env.local` (in `frontend/` directory)
```bash
VITE_API_URL=http://localhost:3001
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

> **Note**: The `VITE_CONTRACT_ADDRESS` is **automatically injected** by the deployment script when you run `pnpm dev:full`. The frontend will throw an error if this environment variable is missing, ensuring you always use the correct deployed contract address.

### Solana Configuration
Solana uses Docker for local development. No additional environment variables needed - the Docker setup handles all configuration automatically.

## 🎯 Quick Development

```bash
# One command to start everything
pnpm dev:full
```

> **📖 For detailed development workflow, see [DEVELOPMENT.md](./DEVELOPMENT.md)**

## 🛠️ Key Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev:full` | **Start everything** (Ethereum + Solana + Backend + Frontend) |
| `pnpm start` | Alias for `dev:full` |
| `pnpm solana:start` | Start Solana validator |
| `pnpm solana:stop` | Stop Solana validator |
| `pnpm build:all` | Build everything |
| `pnpm status` | Show project status |

> **📖 For complete command reference, see [DEVELOPMENT.md](./DEVELOPMENT.md)**

## 📚 Learn More

- [Hardhat Documentation](https://hardhat.org/docs)
- [Wagmi Documentation](https://wagmi.sh)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Detailed development guide