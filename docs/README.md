# Documentation

Central index for the `do-not-stop` monorepo. Cross-cutting docs live here;
package-specific docs live next to their code and are linked below.

## Start here

- [Architecture overview](./architecture.md) — how the services fit together
- [Testing strategy](./testing.md) — how tests and coverage are organized
- [Development guide](../DEVELOPMENT.md) — setup, commands, env vars, local chains

## Package docs

| Area | Doc |
| --- | --- |
| Backend API | [backend/API.md](../backend/API.md), [backend/README.md](../backend/README.md) |
| Go indexer | [services/indexer-go/ARCHITECTURE.md](../indexer-go/ARCHITECTURE.md), [services/indexer-go/README.md](../indexer-go/README.md) |
| Contract upgrade plan | [contracts/plan-contract-upgrade.md](../contracts/plan-contract-upgrade.md) |
| gRPC contract | [proto/cryptopets.proto](../proto/cryptopets.proto) |

## Conventions

- Keep **package-specific** docs in the package (its own `README.md`); link them
  from here rather than copying.
- Put **cross-cutting** docs (architecture, testing, decisions that span
  packages) in this directory.
- When a doc goes stale, fix or delete it — a wrong doc is worse than none.
