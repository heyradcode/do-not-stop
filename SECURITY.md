# Security Policy

## Supported Versions

This project is under active development on the `main` branch. Only the code
currently deployed from `main` (frontend, backend, and the latest deployed
contract addresses) is supported with security fixes. There are no maintained
release branches at this time.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

This includes, but is not limited to:

- Smart contract vulnerabilities (Ethereum contracts under `contracts/ethereum`
  or Solana programs under `contracts/solana`) that could lead to loss of
  funds, unauthorized minting, access-control bypass, or manipulation of game
  outcomes (e.g. VRF/randomness handling).
- Authentication, session, or wallet-signature handling issues in the backend
  or frontend.
- Any other issue that could compromise user funds, data, or accounts.

Instead, email **[code@radcrew.org](mailto:code@radcrew.org)** with:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a proof-of-concept if available.
- The affected component (frontend, backend, mobile, contracts/ethereum,
  contracts/solana, indexer-go, etc.) and, for contracts, the network/address
  if relevant.

We aim to acknowledge reports within 5 business days. Please give us
reasonable time to investigate and address the issue before any public
disclosure.

## Scope

This project involves deployed smart contracts and live testnets/mainnets.
Please avoid testing against production infrastructure in ways that could
disrupt other users (e.g. spamming transactions, draining testnet faucets, or
denial-of-service testing). Prefer testing against a local Hardhat network or
local Solana validator as described in [DEVELOPMENT.md](./DEVELOPMENT.md).

Thank you for helping keep cryptopets and its users safe.
