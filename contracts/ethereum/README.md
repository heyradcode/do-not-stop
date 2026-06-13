# Smart Contracts - CryptoPets

This directory contains the Hardhat project with Solidity smart contracts for the Do Not Stop Web3 application.

## 🏗️ Project Structure

```
contracts/
├── src/                    # Solidity sources (flat)
│   ├── CryptoPets.sol
│   ├── Inventory.sol
│   ├── Battle.sol
│   ├── Breeding.sol
│   └── Utils.sol
├── test/                   # Contract tests
│   └── CryptoPets.test.ts
├── artifacts/              # Compiled contracts
├── cache/                  # Hardhat cache
├── ignition/               # Deployment scripts
│   └── modules/
│       └── CryptoPets.ts
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


| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm compile`   | Compile Solidity contracts                       |
| `pnpm test`      | Run contract tests                               |
| `pnpm node`      | Start Hardhat local network                      |
| `pnpm vrf:watch` | Fulfill local VRF mock requests (breeding)       |
| `pnpm clean`     | Clean build artifacts                            |


## CryptoPets contract

The main contract implements pet collection and gameplay with the following features:

- **Create pets**: Starter pet with random DNA
- **Breeding**: Two pets can breed to create a new one
- **Battles**: Pets can battle each other
- **Levels**: Pay to level up; name/DNA changes at higher levels
- **ERC-721**: NFT standard for ownership (collection name **CryptoPets**, symbol **PETS**)
- **Composition**: `Inventory`, `Battle`, `Breeding`, `Utils`

### Key Functions

- `createRandom(string memory _name)` - Create starter pet
- `battle(uint256 _id1, uint256 _id2)` - Battle two pets
- `attack(uint256 _petId, uint256 _targetId)` - Attack another pet
- `requestCreateFromDNA(...)` - Request breeding (Chainlink VRF fulfills asynchronously on testnet/mainnet; locally run `pnpm vrf:watch` or use `fe:eth:local`, which runs `scripts/vrf-fulfill-watcher.ts` to call the VRF mock)
- `levelUp(uint256 _tokenId)` - Level up (fee)
- `changeName` - Cosmetic upgrade above level threshold
- `getById` - Full on-chain struct
- `getTotalCount` - Total pets in data layer
- `getStats` / `getBattleStats` - Views
- `getByOwner` - Token IDs for an address

## 🌐 Networks

### Local Development

- **Network**: Hardhat Local
- **RPC URL**: [http://localhost:8545](http://localhost:8545)
- **Chain ID**: 31337
- **Deploy Command**: `pnpm dev` (from root)
- **VRF mock**: Breeding needs `pnpm vrf:watch` (from `contracts/ethereum`) or root `pnpm eth:vrf:watch` so `BreedRandomnessRequested` is fulfilled on the coordinator mock. This is started for you in `pnpm fe:eth:local` / `pnpm mobile:eth:local`.

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
pnpm hh test test/CryptoPets.test.ts
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

- `ignition/deployments/chain-31337/deployed_addresses.json` (local; key `CryptoPetsModule#CryptoPets`)
- Contract address is automatically injected into `frontend/.env.local`

## 📚 Learn More

- [Hardhat Documentation](https://hardhat.org/docs)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Hardhat Ignition](https://hardhat.org/ignition)

