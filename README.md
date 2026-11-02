# El Sastre

Web app for logging the shop's clothing repairs. Tailors record jobs from their phones; the admin supervises.
Spec: `docs/superpowers/specs/2026-10-31-sastreria-app-design.md`

**¿Vas a continuar el trabajo? Empieza por [`docs/HANDOFF.md`](docs/HANDOFF.md)**: qué está hecho, qué falta y cómo ejecutarlo.

## Requirements

- Node 22+
- Docker Desktop, running (for the local Supabase database)

## Setup

```bash
npm install
npm run db:start          # starts local Supabase and prints its URL and keys
cp .env.example .env.local
```

Fill `.env.local` with the values from `npx supabase status`:
`VITE_SUPABASE_PUBLISHABLE_KEY` = "Publishable" (or anon) key; `SUPABASE_SERVICE_ROLE_KEY` = "Secret" (service_role) key.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | App at http://localhost:5173 |
| `npm run build` / `npm run preview` | Production build in `dist/` / preview it |
| `npm test` | Unit tests (Vitest) |
| `npm run test:int` | Integration tests against local Supabase |
| `npm run test:e2e` | End-to-end tests (Playwright, phone viewport) |
| `npm run db:start` | Start local Supabase |
| `npm run db:reset` | Recreate the local database from migrations + seed |
| `npm run db:test` | Database tests (pgTAP) |

Local test users (seed): `alexander`, `claudia`, `admin` (administrador), `inactivo` — password `test1234`.

## Data privacy

The repo is public. Never commit CSV files, `.env*` files, or exports — `.gitignore` blocks them.
