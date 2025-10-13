# Smart Contracts - CryptoZombies

This directory contains the Hardhat project with Solidity smart contracts for the Do Not Stop Web3 application.

## 🏗️ Project Structure

```
contracts/
├── src/                    # Solidity source files
│   ├── CryptoZombies.sol   # Main contract
│   ├── data/               # Data management
│   │   └── ZombieData.sol
│   ├── features/           # Feature contracts
│   │   ├── ZombieBattle.sol
│   │   └── ZombieBreeding.sol
│   └── utils/              # Utility functions
│       └── ZombieUtils.sol
├── test/                   # Contract tests
│   └── CryptoZombies.test.ts
├── artifacts/              # Compiled contracts
├── cache/                  # Hardhat cache
├── ignition/               # Deployment scripts
│   └── modules/
│       └── CryptoZombies.ts
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
pnpm dev
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

# Deploy to local network (from root)
pnpm dev
```

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `pnpm compile` | Compile Solidity contracts |
| `pnpm test` | Run contract tests |
| `pnpm node` | Start Hardhat local network |
| `pnpm clean` | Clean build artifacts |

## 🧟‍♂️ CryptoZombies Contract

The main contract implements a zombie game with the following features:

- **Create Zombies**: Users can create zombies with random DNA
- **Zombie Breeding**: Two zombies can breed to create a new zombie
- **Zombie Battles**: Zombies can battle each other
- **Level System**: Zombies can level up and gain abilities
- **ERC-721 Compatible**: NFT standard for zombie ownership
- **Clean Architecture**: Uses composition instead of deep inheritance

### Key Functions

- `createRandomZombie(string memory _name)` - Create a new zombie
- `battleZombies(uint256 _zombieId1, uint256 _zombieId2)` - Battle two zombies
- `attack(uint256 _zombieId, uint256 _targetId)` - Attack another zombie
- `createZombieFromDNA(uint256 _zombieId1, uint256 _zombieId2, string memory _name)` - Breed zombies
- `levelUp(uint256 _zombieId)` - Level up a zombie (requires fee)
- `changeName(uint256 _zombieId, string memory _newName)` - Change zombie name
- `changeDna(uint256 _zombieId, uint256 _newDna)` - Change zombie DNA
- `getZombiesByOwner(address _owner)` - Get zombies owned by address

## 🌐 Networks

### Local Development
- **Network**: Hardhat Local
- **RPC URL**: http://localhost:8545
- **Chain ID**: 31337
- **Deploy Command**: `pnpm dev` (from root)

## 🔧 Configuration

### Hardhat Config
- **Solidity Version**: 0.8.24
- **Optimizer**: Enabled for production
- **Networks**: Hardhat, localhost, sepolia
- **Plugins**: Hardhat Toolbox with Viem

### Environment Variables
Create `.env` file in the `contracts/ethereum/` directory:
```bash
# Optional: For testnet deployment
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
npx hardhat test test/CryptoZombies.test.ts
```

## 📦 Deployment

### Local Network
```bash
# Start everything including deployment (from root)
pnpm dev

# Or manually:
pnpm node
# Then run deployment script from root
```

## 🔍 Contract Addresses

After deployment, contract addresses are stored in:
- `ignition/deployments/chain-31337/deployed_addresses.json` (local)
- Contract address is automatically injected into `frontend/.env.local`

## 📚 Learn More

- [Hardhat Documentation](https://hardhat.org/docs)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Hardhat Ignition](https://hardhat.org/ignition)
