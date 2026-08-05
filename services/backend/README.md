# Backend - Web3 Authentication API (TypeScript)

This is the Node.js + TypeScript backend for the Web3 authentication demo. Part of the Do Not Stop full-stack Web3 application.

## Features

- **Nonce Generation**: Generates unique nonces for message signing
- **Signature Verification**: Verifies Ethereum signatures using ethers.js
- **JWT Authentication**: Issues JWT tokens upon successful verification
- **Protected Routes**: Example protected endpoints that require JWT
- **User Management**: Simple in-memory user storage (use database in production)
- **CORS Enabled**: Cross-origin requests from frontend
- **Health Monitoring**: Health check endpoints for monitoring
- **TypeScript**: Full type safety with strict configuration
- **Hot Reload**: Automatic restart on file changes with tsx
- **Type-safe Routes**: Express routes with proper TypeScript types

## API Endpoints

### Root
- `GET /` - API information and available endpoints

### Authentication (`/api/auth`)
- `GET /api/auth/nonce` - Get a nonce for signing
- `POST /api/auth/verify` - Verify signature and get JWT token

### Protected Routes (`/api/protected`)
- `GET /api/protected/profile` - Get user profile (requires JWT)
- `GET /api/protected/users` - Get all users (requires JWT)

### Health Check (`/api/health`)
- `GET /api/health` - Server health status

### GraphQL game data (`/graphql`)
- `POST /graphql` - JWT-protected roster/battle reads (the v2 `opponents`
  matchmaking query and the `winEstimate` pre-fight odds query). Reads what
  `indexer-go` writes; see [API.md](./API.md#graphql--game-data-v2) for the
  schema, the v2 pet fields, and the `INDEXER_GRPC_ADDR` / `ROSTER_READ_SOURCE`
  env vars + the Prisma migration prerequisite.

## Setup

### Automated (Recommended)
From the project root:
```bash
# Install all dependencies and start everything
pnpm install
pnpm dev
```

### Manual Setup
1. **Install dependencies**:
   ```bash
   cd services/backend
   pnpm install
   ```

2. **Set environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your JWT secret
   ```

3. **Start the server**:
   ```bash
   # Development (TypeScript with hot reload)
   pnpm dev
   
   # Production (compiled JavaScript)
   pnpm start
   
   # Build TypeScript
   pnpm build
   ```

The server will run on `http://localhost:3001`

### From Project Root
```bash
# Start backend only
pnpm dev:be

# Or start everything
pnpm dev
```

## Environment Variables

- `JWT_SECRET`: Secret key for JWT signing (required)
- `PORT`: Server port (default: 3001; Render sets this automatically)
- `CORS_ORIGIN`: Optional comma-separated allowed origins for production CORS

See [`env.example`](./env.example) for the full list (indexer link, AI dialogue,
Helius webhooks, the settle keeper's `KEEPER_*` vars — see
[API.md](./API.md#relevant-environment-variables)).

## Deploy to Render

This repo includes a [`render.yaml`](../render.yaml) blueprint at the monorepo root.

### Option A — Blueprint (recommended)

1. Push the repo to GitHub/GitLab.
2. In [Render](https://render.com), click **New → Blueprint** and connect the repo.
3. Render creates a **Web Service** named `do-not-stop-api` with:
   - **Build:** `pnpm install --frozen-lockfile && pnpm --filter backend build`
   - **Start:** `pnpm --filter backend start`
   - **Health check:** `/api/health`
4. `JWT_SECRET` is auto-generated; override it in the service **Environment** tab if needed.
5. Copy the service URL (e.g. `https://do-not-stop-api.onrender.com`) into your frontend:
   ```bash
   VITE_API_URL=https://do-not-stop-api.onrender.com
   ```
6. Optional: set `CORS_ORIGIN` on Render to your frontend URL(s).

### Option B — Manual Web Service

| Setting | Value |
|--------|--------|
| Root Directory | *(leave empty — monorepo root)* |
| Runtime | Node |
| Build Command | `HUSKY=0 pnpm install --frozen-lockfile --filter backend... && pnpm --filter backend build` |
| Start Command | `pnpm --filter backend start` |
| Health Check Path | `/api/health` |

Add environment variables: `JWT_SECRET` (required), `NODE_ENV=production`, and optionally `CORS_ORIGIN`.

### Verify

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
```

### Troubleshooting

| Symptom | Fix |
|--------|-----|
| `tsc` / `@types/*` not found | Remove `NODE_ENV=production` from Render **Environment** (it skips devDependencies during install). Use the updated `render.yaml` — `NODE_ENV` is only set at **start**, not build. |
| `pnpm: command not found` | Ensure root `package.json` has `"packageManager": "pnpm@9.15.9"` — Render installs pnpm via Corepack automatically. Do **not** run `corepack prepare` in the build command (Render's `/usr/bin` is read-only). |
| `husky` / `prepare` script failed | Set `HUSKY=0` in Render environment (included in `render.yaml`). |
| Lockfile errors | Ensure `pnpm-lock.yaml` is committed at the repo root. |
| Wrong root | **Root Directory** must be empty (repo root), not `backend`. |

## How It Works

1. Frontend requests a nonce from `/api/auth/nonce`
2. User signs a message containing the nonce
3. Frontend sends address, signature, and nonce to `/api/auth/verify`
4. Backend verifies the signature matches the address
5. If valid, backend issues a JWT token
6. Frontend uses JWT token for authenticated requests
