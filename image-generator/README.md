# image-generator

Standalone microservice that renders pet NFT art. Given a pet's DNA it produces
deterministic SVG art plus ERC-721 metadata, procedurally: no stored images, no
generative-AI call per pet, no database. See
[`docs/plan-future-features-roadmap.md`](../docs/plan-future-features-roadmap.md) §9
for the design rationale.

## Why it is a separate package

It shares no code with `backend`, `frontend`, or `shared`, and nothing in the
monorepo imports it. That is deliberate: the service is deployable and testable
on its own, and work here does not touch files other branches are editing. The
one thing it re-implements is `digitPair` (two-digit decimal slicing of DNA,
canonically `contracts/ethereum/src/DnaLib.sol`); it is not combat math, so
there is no golden-vector obligation and nothing to drift.

## Status

Built incrementally. Done so far:

- [x] DNA -> visual trait derivation (`src/traits.ts`)
- [ ] Element palettes and the procedural SVG renderer
- [ ] HTTP surface: `/health`, stateless `/image.svg?dna=&rarity=&speciesId=`
- [ ] On-chain reads: `/metadata/:chain/:tokenId` and `/image/:chain/:tokenId.svg`
- [ ] PNG rasterization and cache headers
- [ ] Deployment (Dockerfile / Render service)

## Traits

Every visual trait comes from its own DNA digit pair, so changing one look does
not disturb another:

| Trait | Source | Range |
| --- | --- | --- |
| `element` | pair 0 % 6 | 6 palette families |
| `body` | `speciesId % 8`, else pair 6 % 8 | 8 silhouettes, aligned to the 8 skill archetypes |
| `pattern` | pair 7 % 5 | 5 coats |
| `eyes` | pair 7 / 5 % 4 | 4 eye styles |
| `marking` | pair 7 / 20 % 5 | 5 face markings |
| `aura` | rarity - 1 | 5 frame/glow tiers |
| `build` | HP gene (pair 1) | 0-99 body girth |
| `spark` | INT gene (pair 4) | 0-99 eye/aura intensity |

Cosmetic pair 7 decomposes exactly (5 x 4 x 5 = 100), so all 100 of its values
map to a distinct pattern/eye/marking combination. Pair 6 is already spent on
species at mint time (`PetCore._resolveSpecies`), so the HP and INT genes supply
the remaining per-pet variation. Art reads DNA and never feeds back into combat.

## Commands

Run from this directory. The service is deliberately *not* a member of the root
`pnpm-workspace.yaml`, so it keeps its own `pnpm-lock.yaml` and needs
`--ignore-workspace` on install; a plain `pnpm install` here walks up to the
monorepo root and installs that instead, leaving this package with no
`node_modules`. `pnpm --filter` from the repo root does not reach it either.

```bash
pnpm install --ignore-workspace
pnpm test          # vitest
pnpm lint          # eslint
pnpm build         # tsc -> dist/
```

## License

PolyForm Noncommercial 1.0.0, the root [`LICENSE`](../LICENSE), same as every
non-contract package in this repo.
