# image-generator

Standalone microservice that renders pet NFT art. A pet's DNA is decoded into
visual traits, those traits build a fixed prompt, and Cloudflare Workers AI
turns the prompt into an image. See
[`docs/plan-future-features-roadmap.md`](../docs/plan-future-features-roadmap.md) §9
for the design rationale.

## The one hard constraint: generate once, then never again

DNA -> traits -> prompt is exact integer math and reproducible forever. The
diffusion step is not: the same prompt and seed give the same image only for one
model version on one provider, so a model deprecation or a silent weights update
would change what an already-minted NFT looks like. Every generated image must
therefore be written to immutable content-addressed storage on first request and
served from there afterwards. Regenerating on cache miss is a correctness bug,
not a performance one.

That also happens to fit the free allocation: Workers AI bills per request, so
one image per pet for the lifetime of the pet keeps a collection's cost bounded
by the number of pets rather than by traffic.

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
- [x] Traits -> deterministic prompt and seed (`src/prompt.ts`)
- [x] Cloudflare Workers AI client and `pnpm generate` CLI (`src/workersAi.ts`)
- [x] Immutable image store: R2, filesystem, memory (`src/store.ts`, `src/r2Store.ts`)
- [x] Generate-once pipeline with in-flight dedupe (`src/pipeline.ts`)
- [ ] HTTP surface: `/health`, `/image/:chain/:tokenId.png`, `/metadata/:chain/:tokenId`
- [ ] On-chain reads: tokenId -> dna/rarity/speciesId
- [ ] Deployment (Dockerfile / Render service)

The Workers AI and R2 request/response shapes are written against Cloudflare's
documented contracts and covered by mocked tests only. The first live
`pnpm generate` against a real bucket is what actually validates them.

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

## Storage

`IMAGE_STORE` selects the backend: `r2` (production), `filesystem` (dev), or
`memory` (tests and one-shot CLI runs; never persists). All three implement the
same two-method `ImageStore` interface, so an IPFS or Arweave pin can be added
later without touching the pipeline.

**The key is derived from a pet's art identity — `(dna, rarity, speciesId)` —
not from the prompt.** That distinction is the whole point. Keying on the prompt
would mean any wording tweak in `prompt.ts` becomes a cache miss and a brand-new
image for a pet somebody already owns. Keying on identity means an existing pet
keeps its art however much the prompt table later evolves. Pets with identical
dna, rarity, and species are identical by construction, so they share a key and
one generation covers both.

Regenerating art for existing pets is therefore an explicit decision: bump
`ART_VERSION` in `src/store.ts`. Keys are namespaced by version, so old art stays
readable and a bump can be rolled back. Every owner sees their pet change, which
makes it a product call, not a refactor.

Each image is written alongside a JSON manifest recording the traits, model,
prompt, seed, and timestamp that produced it. Once a model version moves on, that
manifest is the only record of how a given pet came to look the way it does.

Concurrent first-ever requests for the same pet are collapsed into one
generation, so a pet's page open in two tabs bills one inference rather than two.
The dedupe is per process; with several instances the race is still possible, and
the honest bound is that R2 resolves it last-write-wins and the pet is stable
from then on. A shared lock is only worth adding if that shows up in practice.

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

# One-shot generation. Prints traits, seed, and prompt before it needs
# credentials, so prompt wording can be iterated on with no token set.
cp env.example .env   # then fill in CF_ACCOUNT_ID / CF_API_TOKEN
pnpm generate --dna=7934056188134207 --rarity=3 --out=pet.png

# Defaults to the filesystem store, so running the same pet twice serves the
# second from cache and bills nothing. --store=memory forces a fresh inference.
pnpm generate --dna=7934056188134207 --rarity=3 --store=memory
```

## Model choice

Default is `@cf/bytedance/stable-diffusion-xl-lightning`. It takes an explicit
`seed`, so a pet's image is re-derivable from its DNA, and it is tuned for 4-8
steps, which keeps free-allocation usage low.
`@cf/black-forest-labs/flux-1-schnell` also works via `CF_IMAGE_MODEL`: it
returns base64 in a JSON envelope instead of raw PNG bytes and rejects SDXL's
extra knobs, and the client handles both. No LLM is involved anywhere; prompts
come from a lookup table, because an LLM would add nondeterminism and a second
inference cost to something a table does exactly.

## License

PolyForm Noncommercial 1.0.0, the root [`LICENSE`](../LICENSE), same as every
non-contract package in this repo.
