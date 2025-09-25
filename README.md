# Do Not Stop - Full Stack Web3 App

A modern full-stack Web3 application with React frontend, Node.js backend, and Solidity smart contracts.

## 🏗️ Project Structure

```
do-not-stop/
├── frontend/           # React + Vite frontend
│   ├── src/           # React components and logic
│   ├── package.json   # Frontend dependencies
│   └── vite.config.ts # Vite configuration
├── backend/           # Node.js + Express API
│   ├── routes/        # API routes
│   └── package.json   # Backend dependencies
├── contracts/         # Solidity smart contracts
│   └── ZombieFactory.sol
├── scripts/           # Deployment scripts
│   └── deploy.js
├── test/              # Smart contract tests
│   └── ZombieFactory.test.js
├── hardhat.config.js  # Hardhat configuration
└── package.json       # Root package.json (orchestration)
```

## 🚀 Quick Start

### Install Dependencies
```bash
# Install root dependencies (Hardhat, etc.)
pnpm install

# Install frontend dependencies
pnpm --prefix frontend install

# Install backend dependencies
pnpm --prefix backend install
```

### Development

```bash
# Start everything (frontend + backend + contracts)
pnpm dev:full

# Or start individually:
pnpm dev:frontend    # React frontend
pnpm dev:backend     # Node.js API
pnpm dev:contracts   # Hardhat local network
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
```

## 🧟‍♂️ Features

- **Web3 Authentication** - MetaMask integration with JWT
- **CryptoZombies** - NFT collection with breeding and battles
- **Multi-chain Support** - Ethereum, Polygon, BSC, Arbitrum, etc.
- **Modern Tech Stack** - React 19, Wagmi v2, Viem, Hardhat v3
- **TypeScript** - Full type safety across the stack

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

### Root `.env`
```bash
SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here
```

### Backend `.env`
```bash
JWT_SECRET=your-super-secret-jwt-key-here
PORT=3001
```

### Frontend `.env`
```bash
VITE_API_URL=http://localhost:3001
```

## 🎯 Development Workflow

1. **Start local blockchain**: `pnpm dev:contracts`
2. **Deploy contracts**: `pnpm deploy:local`
3. **Start backend**: `pnpm dev:backend`
4. **Start frontend**: `pnpm dev:frontend`
5. **Test contracts**: `pnpm test`

## 📚 Learn More

- [Hardhat Documentation](https://hardhat.org/docs)
- [Wagmi Documentation](https://wagmi.sh)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)