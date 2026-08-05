# Contributing to do-not-stop

Thanks for your interest in contributing! This is a monorepo covering the
frontend, backend, mobile app, website, and Ethereum/Solana contracts for the
cryptopets project. This guide covers how to get set up and how to submit
changes.

Before contributing, please read our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting Started

See [DEVELOPMENT.md](./DEVELOPMENT.md) for full setup instructions, available
commands, and local blockchain configuration (Ethereum + Solana). The short
version:

```bash
pnpm install
pnpm dev
```

For testing strategy see [docs/](./docs); for the component map and data flow
see [CLAUDE.md](./CLAUDE.md#architecture).

## Workflow

1. Fork the repo and create a feature branch off `main`:
   ```bash
   git checkout -b feat/short-description
   ```
2. Make your changes, keeping them focused on a single concern.
3. Add or update tests for any behavior change.
4. Run linting and tests locally before opening a PR:
   ```bash
   pnpm lint
   pnpm test
   ```
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
   style (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.) — this keeps
   history and changelogs readable.
6. Push your branch and open a pull request against `main`, filling out the PR
   template.

## Pull Request Guidelines

- Keep PRs scoped to one change; large unrelated changes are harder to review
  and slower to merge.
- Describe *why* the change is needed, not just what changed.
- Link any related issues.
- Make sure CI (lint, tests, coverage) passes before requesting review.
- Be responsive to review feedback — most PRs go through a round or two of
  comments before merging.

## Reporting Bugs & Requesting Features

Use the appropriate [issue template](./.github/ISSUE_TEMPLATE) when opening a
new issue. Search existing issues first to avoid duplicates.

## Security Issues

Please do **not** open a public issue for security vulnerabilities. See
[SECURITY.md](./SECURITY.md) for how to report them responsibly.

## Questions?

Open a [discussion](../../discussions) or issue, or email
[code@radcrew.org](mailto:code@radcrew.org).
