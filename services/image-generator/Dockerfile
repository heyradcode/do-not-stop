# Multi-stage build. Deliberately does not copy the monorepo: this service is not
# a pnpm workspace member, so its lockfile is self-contained and the build
# context is just this directory. That is what makes the image small and the
# build independent of every other package in the repo.

FROM node:22-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@9.15.9

# --ignore-workspace matters even here: without it pnpm looks for a workspace
# root, finds none in the container, and resolves differently than it does
# locally.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --ignore-workspace --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --ignore-workspace --frozen-lockfile --prod \
    && pnpm store prune

COPY --from=build /app/dist ./dist

# Runs unprivileged. The filesystem store would need a writable volume, but
# production uses R2 (IMAGE_STORE=r2), so the container needs no write access.
USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
