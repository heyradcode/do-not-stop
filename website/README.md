# CryptoPets marketing site

Next.js landing page (`website/`). The playable app lives in `frontend/`.

## Local development

```bash
# From repo root
pnpm dev:web
```

Copy `env.example` to `.env.local` and set `NEXT_PUBLIC_APP_URL` to your local or deployed app URL.

## Deploy to Vercel (GitHub Actions)

Use a **separate Vercel project** from the Vite `frontend/` app.

### 1. Create the Vercel project

1. [New project](https://vercel.com/new) → import this GitHub repo.
2. Set **Root Directory** to **`website`** (required — the repo root has no `next` dependency).
3. Framework: **Next.js** (install/build commands come from `website/vercel.json`).
4. Add environment variable **`NEXT_PUBLIC_APP_URL`** (production + preview) pointing at your deployed app, e.g. `https://app.example.com`.

If Root Directory is left at `.`, deploys fail with *“No Next.js version detected”*.

### 2. Link the project for CI

From the **repository root** (not `website/`):

```bash
node scripts/vercel-website-link.mjs   # VERCEL_PROJECT_ID + VERCEL_ORG_ID in env
npx vercel@54.2.0 link
```

CI runs `vercel pull` / `vercel deploy` from the monorepo root so `pnpm-lock.yaml` and the workspace are available. Do **not** run `vercel deploy` only inside `website/` — that uploads ~60 files and breaks `cd .. && pnpm install`.

### 3. GitHub secrets and variables

| Name | Type | Description |
|------|------|-------------|
| `VERCEL_TOKEN` | Secret | Same token as frontend deploys |
| `VERCEL_ORG_ID` | Secret | Team/user ID |
| `VERCEL_WEBSITE_PROJECT_ID` | Secret | This website project’s ID |
| `NEXT_PUBLIC_APP_URL` | Variable | Public URL of the `frontend` app |

Workflow: none. `.github/workflows/website.yml` was removed in 49c5e63, and the
secrets table above plus the triggers below describe that workflow. They have
not been revisited since, so confirm how this actually deploys before relying on
them.

- **PRs** → Vercel preview + comment with URL  
- **push to `main`** → production deploy (when `website/` or lockfile changes)

Deploys use **remote builds on Vercel** from the **repo root** with `rootDirectory: website` (not `vercel deploy --prebuilt`, and not `cd website && vercel deploy`).

Set `NEXT_PUBLIC_APP_URL` in the Vercel project dashboard **and** as the GitHub Actions variable so production builds get the correct app link.
