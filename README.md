# Porter

Maintenance requests and amenity booking for managed apartment buildings.
One API, three surfaces: a Flutter app for residents and technicians, a web
console for managers.

> Work in progress. This README is a stub; the real one is a deliverable of
> the last milestone and must carry the demo URL, the three demo accounts, an
> architecture diagram, a "decisions and why" section and an explicit list of
> what is deliberately out of scope.

## Layout

```
apps/api        NestJS + Postgres
apps/web        Next.js
apps/mobile     Flutter (offline-first, own pubspec)
packages/
  contract      openapi.json + generated TypeScript client
  config        shared eslint / tsconfig
```

## Local development

Node is pinned in `.nvmrc`, pnpm in the `packageManager` field. Corepack
installs the exact pnpm version from that field, so nothing is installed
globally:

```bash
corepack enable pnpm
pnpm install
```

Postgres runs in docker. Copy the env file first: compose has no fallback
credentials and will refuse to start without it.

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

Minio, api and web join the same compose file as they are built. Migrations
and the demo seed will run with a single command.
