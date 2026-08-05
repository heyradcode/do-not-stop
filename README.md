# do-not-stop 🚀

A continuously evolving Web3 playground built with modern technologies, designed to grow, adapt, and experiment with the latest advancements in Ethereum/Solana development and contemporary React patterns.

**Live Demo:** https://cryptopets.vercel.app

## 📁 Project Structure

This is a monorepo containing multiple interconnected projects:

### Applications
- **[Frontend](./frontend)** - React + Vite web application with wallet integration
- **[Backend](./backend)** - Node.js + Express API server
- **[Mobile](./mobile)** - React Native cross-platform mobile app
- **[Website](./website)** - Next.js marketing/documentation site

### Smart Contracts & Blockchain
- **[Ethereum Contracts](./contracts/ethereum)** - Solidity smart contracts with Hardhat
- **[Solana Programs](./contracts/solana)** - Rust-based Solana programs with Anchor

### Shared Code
- **[Shared Core](./shared)** - Common utilities and types used across projects

## 📖 Documentation

See [docs/](./docs) for testing strategy and an index of all package-level docs.
The component map and data flow live in
[CLAUDE.md](./CLAUDE.md#architecture).

## 🛠️ Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for:
- Setup instructions
- Available development commands
- Environment configuration
- Local blockchain setup (Ethereum + Solana)
- Building and testing procedures

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start everything
pnpm dev
```

For detailed setup and commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## 📚 Tech Stack

**Frontend:** React 19, TypeScript, Vite, Wagmi, Viem, TanStack Query

**Backend:** Node.js, Express.js, TypeScript, JWT, Ethers.js, TweetNaCl

**Mobile:** React Native, TypeScript

**Blockchain:** 
- Ethereum: Solidity, Hardhat
- Solana: Rust, Anchor

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, workflow, and pull request
guidelines. Please also review our [Code of Conduct](./CODE_OF_CONDUCT.md).

## 🔒 Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

## 📄 License

This monorepo uses two licenses depending on the package:

| Package(s) | License |
| --- | --- |
| `contracts/ethereum`, `contracts/solana`, `services/indexer-go`, `proto`, `protocol`, `verifier` | [MIT](./contracts/LICENSE) — fully permissive |
| `frontend`, `backend`, `mobile`, `website`, `shared` (and anything else) | [PolyForm Noncommercial 1.0.0](./LICENSE) — free for any noncommercial purpose; commercial use requires permission |

Each package's `package.json` / `go.mod` directory points at the license that
applies to it. For commercial licensing of the app layer, contact
[code@radcrew.org](mailto:code@radcrew.org).

---

**Built with ❤️ by the radcrew team**
