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

Minio, api and web join the same compose file as they are built.

## Demo accounts

Migrations and the demo data go in with one command, and it can be run again
as often as you like: migrations apply only what is pending and the seed
upserts, so a second run changes nothing.

```bash
pnpm db:setup
```

To rewrite just the demo rows, for instance after changing `SEED_PASSWORD`:

```bash
pnpm db:seed
```

Three accounts, one per role, all sharing the password in `SEED_PASSWORD`:

| Role | Email |
| :--- | :--- |
| Manager | `manager@porter.test` |
| Technician | `technician@porter.test` |
| Resident | `resident@porter.test` |

The seed also creates a second building with its own manager and resident.
They are not here to be logged into: they exist so that "a manager of one
building cannot see the other" is something the test suite can fail on rather
than something this README claims.

## Tests

The integration suite runs over HTTP against a real Postgres, so it needs its
own database. It keeps its data in memory, listens on another port and is
truncated between tests, and the suite refuses to start if `DATABASE_URL`
points anywhere else.

```bash
pnpm db:test:up
```

```bash
pnpm test
```
