# contracts/solana

Moved out of the root `CLAUDE.md` so it loads only when working in this directory.
Universal rules and the cross-chain non-negotiables stay in the root file and `AGENTS.md`.

## Solana local setup
`contracts/solana/docker-compose.yml` runs two services: `solana-dev` (the validator itself, ports 8899/8900/9900) and an **ngrok tunnel** service exposing the local RPC (needs `NGROK_AUTHTOKEN`, ngrok web UI on 4040). This is how mobile/on-device testing reaches a local validator (`pnpm sol:inject-ngrok`), and it isn't documented in `DEVELOPMENT.md`.
