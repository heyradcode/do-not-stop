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
2. Set **Root Directory** to `website`.
3. Framework: **Next.js** (install/build commands come from `website/vercel.json`).
4. Add environment variable **`NEXT_PUBLIC_APP_URL`** (production + preview) pointing at your deployed app, e.g. `https://app.example.com`.

### 2. Link the project for CI

From `website/` with the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npx vercel@54.2.0 link
```

This creates `.vercel/project.json` locally (gitignored). For CI, copy IDs from the Vercel dashboard → Project → Settings → General.

### 3. GitHub secrets and variables

| Name | Type | Description |
|------|------|-------------|
| `VERCEL_TOKEN` | Secret | Same token as frontend deploys |
| `VERCEL_ORG_ID` | Secret | Team/user ID |
| `VERCEL_WEBSITE_PROJECT_ID` | Secret | This website project’s ID |
| `NEXT_PUBLIC_APP_URL` | Variable | Public URL of the `frontend` app |

Workflow: [`.github/workflows/website.yml`](../.github/workflows/website.yml)

- **PRs** → Vercel preview + comment with URL  
- **push to `main`** → production deploy (when `website/` or lockfile changes)

Deploys use **remote builds on Vercel** (not `vercel deploy --prebuilt`), because pnpm monorepos often break prebuilt artifacts with missing `next` server paths.

Set `NEXT_PUBLIC_APP_URL` in the Vercel project dashboard **and** as the GitHub Actions variable so production builds get the correct app link.
