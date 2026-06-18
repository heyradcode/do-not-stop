# Testing

How tests and coverage are organized across the monorepo. Each package runs its
own suite with the toolchain native to its stack.

## Per-package suites

| Package | Tool | Command |
| --- | --- | --- |
| backend | Vitest | `pnpm --filter backend test` |
| shared (`@shared/core`) | Vitest | `pnpm --filter @shared/core test` |
| frontend | Vitest | `pnpm --filter frontend test` |
| contracts/ethereum | Hardhat | `pnpm test` (root) |
| indexer-go | `go test` | `go test ./...` (in `indexer-go`) |

> Postgres-backed Go tests are env-gated and TRUNCATE tables — point
> `TEST_DATABASE_URL` at a scratch DB only. See
> [indexer-go/README.md](../indexer-go/README.md).

## Coverage

TS packages use Vitest with the V8 coverage provider. **`@vitest/coverage-v8`
must match the installed `vitest` major** (v4) — a mismatched pin crashes
coverage collection across the repo. Coverage output lands in each package's
`coverage/` directory.

## Branch-per-test-type workflow

Test work is landed on dedicated branches (e.g. `test/frontend-modules`), one
per test type / area, rather than mixed into feature branches. Report coverage
after each change so the trend is visible in review.

## Linting

```bash
pnpm lint        # frontend + shared + website + mobile
pnpm lint:fix    # autofix
```
