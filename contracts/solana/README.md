# Solana Contracts 🔗

Rust-based Solana programs built with **Anchor** framework for blockchain interaction on the Solana network.

## 🛠️ Tech Stack

- **Rust** - Systems programming language
- **Anchor** - Solana program framework
- **Solana SDK** - Core Solana development tools
- **Docker** - Local validator environment

## 📦 Prerequisites

- Rust 1.70+
- Solana CLI
- Anchor CLI
- Docker & Docker Compose (for local validator)

## 🚀 Getting Started

### Installation

```bash
# From root directory
pnpm install

# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Local Validator Setup

Start Solana validator in Docker:

```bash
# From root directory
pnpm sol:docker

# Or from this directory
docker-compose up -d
```

The validator will:
- Run on RPC: `http://localhost:8899`
- WebSocket: `ws://localhost:8900`
- Metrics: `http://localhost:9900`

## 📁 Project Structure

```
contracts/solana/
├── cryptopets/              # Main Solana program
│   ├── programs/
│   │   └── cryptopets/
│   │       ├── src/
│   │       │   ├── lib.rs
│   │       │   └── instructions/
│   │       └── Cargo.toml
│   ├── tests/               # Integration tests
│   └── Anchor.toml
├── docker-compose.yml       # Local validator config
└── env.example
```

## 🔨 Development Commands

```bash
# Build programs
anchor build

# Run tests
anchor test

# Deploy to local validator
anchor deploy

# Start local validator (via Docker)
docker-compose up -d

# View validator logs
docker-compose logs -f

# Stop validator
docker-compose down

# View validator status
solana cluster-info --url localhost:8899
```

## 📝 Program Structure

Each program follows the Anchor framework pattern:

- **Instructions** - Solana program operations
- **State** - Account structures and PDAs
- **Events** - Emitted program events
- **Errors** - Custom error handling

### Example Program Interaction

```bash
# View deployed programs
solana program show <PROGRAM_ID> --url localhost:8899

# View account state
solana account <ACCOUNT_ADDRESS> --url localhost:8899
```

## 🧪 Testing

```bash
# Run all tests
anchor test

# Run specific test file
anchor test -- --test-thread=1
```

## 🔌 Environment Configuration

Create `.env` file from `env.example`:

```bash
cp env.example .env
```

Configure:
- `ANCHOR_PROVIDER_URL` - Solana RPC endpoint
- `ANCHOR_WALLET` - Keypair path for deployment

## 📤 Deployment

### Development (Localnet)
```bash
# Ensure local validator is running
pnpm sol:docker

# Build and deploy
anchor deploy --provider.cluster localnet
```

### Testnet
```bash
# Build
anchor build

# Deploy to Devnet
anchor deploy --provider.cluster devnet
```

## 🐛 Debugging

```bash
# View program logs
solana logs <PROGRAM_ID> --url localhost:8899

# View transaction logs
solana logs <TRANSACTION_SIGNATURE> --url localhost:8899

# Check account details
solana account <ACCOUNT_ADDRESS> --url localhost:8899
```

## 📚 Resources

- [Anchor Documentation](https://book.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Solana Program Examples](https://github.com/solana-labs/solana-program-library)

## 🤝 Contributing

See [DEVELOPMENT.md](../../DEVELOPMENT.md) for overall project guidelines.

---

For issues or questions, refer to the [main README](../../README.md).
