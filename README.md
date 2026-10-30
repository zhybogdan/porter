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

The rest is not wired up yet. Target: `docker compose up` brings up postgres,
minio, api and web; migrations and demo seed run with a single command.
