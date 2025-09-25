# Smart Contracts - ZombieFactory

This directory contains the Hardhat project with Solidity smart contracts for the Do Not Stop Web3 application.

## 🏗️ Project Structure

```
contracts/
├── src/                    # Solidity source files
│   └── ZombieFactory.sol  # Main contract
├── test/                   # Contract tests
│   └── ZombieFactory.test.js
├── artifacts/              # Compiled contracts
├── cache/                  # Hardhat cache
├── ignition/               # Deployment scripts
│   └── modules/
│       └── ZombieFactory.ts
├── hardhat.config.ts       # Hardhat configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Contract dependencies
```

## 🚀 Quick Start

### Automated (Recommended)
From the project root:
```bash
# Install all dependencies and start everything
pnpm install
pnpm dev:full
```

### Manual Setup
```bash
# Install dependencies
pnpm install

# Compile contracts
pnpm compile

# Run tests
pnpm test

# Start local network
pnpm node

# Deploy to local network
pnpm deploy:local
```

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `pnpm compile` | Compile Solidity contracts |
| `pnpm test` | Run contract tests |
| `pnpm node` | Start Hardhat local network |
| `pnpm deploy:local` | Deploy to local network |
| `pnpm deploy:sepolia` | Deploy to Sepolia testnet |
| `pnpm deploy:status` | Check deployment status |
| `pnpm deploy:visualize` | Visualize deployment plan |

## 🧟‍♂️ ZombieFactory Contract

The main contract implements a zombie factory with the following features:

- **Create Zombies**: Users can create zombies with random DNA
- **Zombie Breeding**: Two zombies can breed to create a new zombie
- **Random DNA Generation**: Uses block properties for randomness
- **ERC-721 Compatible**: NFT standard for zombie ownership

### Key Functions

- `createRandomZombie(string memory _name)` - Create a new zombie
- `feedOnKitty(uint256 _zombieId, uint256 _kittyId)` - Feed zombie on CryptoKitties
- `changeName(uint256 _zombieId, string memory _newName)` - Change zombie name
- `changeDna(uint256 _zombieId, uint256 _newDna)` - Change zombie DNA
- `getZombiesByOwner(address _owner)` - Get zombies owned by address

## 🌐 Networks

### Local Development
- **Network**: Hardhat Local
- **RPC URL**: http://localhost:8545
- **Chain ID**: 31337
- **Deploy Command**: `pnpm deploy:local`

### Testnet
- **Network**: Sepolia
- **RPC URL**: Set in `.env` file
- **Chain ID**: 11155111
- **Deploy Command**: `pnpm deploy:sepolia`

## 🔧 Configuration

### Hardhat Config
- **Solidity Version**: 0.8.24
- **Optimizer**: Enabled for production
- **Networks**: Hardhat, localhost, sepolia
- **Plugins**: Hardhat Toolbox with Viem

### Environment Variables
Create `.env` file in the `contracts/` directory:
```bash
SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests with gas reporting
pnpm test --gas-report

# Run specific test file
npx hardhat test test/ZombieFactory.test.js
```

## 📦 Deployment

### Local Network
```bash
# Start local network
pnpm node

# Deploy contracts
pnpm deploy:local
```

### Sepolia Testnet
```bash
# Deploy to Sepolia
pnpm deploy:sepolia

# Check deployment status
pnpm deploy:status
```

## 🔍 Contract Addresses

After deployment, contract addresses are stored in:
- `ignition/deployments/chain-31337/deployed_addresses.json` (local)
- `ignition/deployments/chain-11155111/deployed_addresses.json` (sepolia)

## 📚 Learn More

- [Hardhat Documentation](https://hardhat.org/docs)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Hardhat Ignition](https://hardhat.org/ignition)
