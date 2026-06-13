# Test-validator program fixtures

`anchor test` loads these programs into the local validator at genesis (see the
`[[test.genesis]]` entries in `Anchor.toml`) instead of cloning them live from
devnet — the Switchboard On-Demand program is ~10 MB and the public devnet RPC
times out cloning it on every run.

The `*.so` files are **git-ignored** (large binaries) and must be dumped before
running the tests for the first time, or after the on-chain programs change:

```bash
solana program dump CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d \
  tests/fixtures/mpl_core.so --url devnet
solana program dump SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv \
  tests/fixtures/switchboard_on_demand.so --url devnet
```

- `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` — Metaplex Core (mpl-core)
- `SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv` — Switchboard On-Demand
  (`ON_DEMAND_MAINNET_PID`; what the program expects when built without the
  switchboard-on-demand crate's `devnet` feature)
