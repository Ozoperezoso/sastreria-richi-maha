# Handoff: what's done and what's left

Status on 2026-10-31. Branch `build/v1`, not merged to `main`.
Spec: `docs/superpowers/specs/2026-10-31-sastreria-app-design.md`. Plan: `docs/superpowers/plans/2026-10-31-sastreria-app.md` (15 tasks).

## Where things stand

| Plan task | State |
|---|---|
| 1–14: scaffold, database, security rules, RPCs, `admin-users` function, importer, all screens, test suite | **Done**, locally |
| Final whole-branch review | **Not done**: it was started and stopped before it reported |
| 15: production setup, import, deploy | **Not started**: waiting for Rodrigo's go-ahead |

Every test passed at the last run: database (pgTAP) 47, unit 53, integration 15, end-to-end 13.
Nothing exists in the cloud yet. Supabase and Cloudflare accounts are connected, but no project has been created.

## Run it locally

Requirements: Node 22+, Docker Desktop **running**.

```bash
npm install
npm run db:start        # first run downloads the Supabase images
cp .env.example .env.local
npx supabase status -o env   # copy API_URL, PUBLISHABLE_KEY (or ANON_KEY) and SERVICE_ROLE_KEY into .env.local
npm run dev             # http://localhost:5173
```

Test users from `supabase/seed.sql` (local only), all with password `test1234`:
- `alexander` and `claudia`: tailors.
- `rodrigo`: admin.
- `inactivo`: a deactivated tailor.

To see real data locally, import the sheet. The CSV is **not** in the repo; ask Rodrigo for it.

```bash
node scripts/import/run.js "Arreglos Modisteria - BD_Registros.csv" --dry-run
node scripts/import/run.js "Arreglos Modisteria - BD_Registros.csv" --commit
```

Tests:

```bash
npm run db:reset && npm run db:test   # database rules (needs seed-only data)
npm test                               # unit
npm run test:int                       # integration (local stack)
npm run test:e2e                       # browser, phone viewport
```

**Watch out:**
- `npm run test:e2e` and `npm run db:reset` **wipe the local database** back to the seed. Re-import afterwards if you need the real data.
- If you add a new Edge Function, run `npx supabase stop && npx supabase start`. The local function server only sees function folders that existed when it started.

## Remaining work

### 1. Final review (do this first)

Review `git diff 5a91df3..build/v1`, excluding `package-lock.json`, against the spec. Highest priority is **security**: spec §4 says the *database* enforces permissions, not the UI. Try to break that as a tailor calling the API directly, for example:
- changing restricted columns on the other tailor's ticket;
- editing `profiles`, such as making yourself admin;
- misusing `create_ticket`, which is `SECURITY DEFINER`;
- getting access as an inactive or anonymous user.

Also check the plan's five "Review Focus" items.

Rules live in:
- `supabase/migrations/0002_rules.sql`
- `supabase/migrations/0003_security.sql`
- `supabase/migrations/0004_rpc.sql`
- `supabase/functions/admin-users/index.ts`

Fix anything serious with a failing test first, then the fix.

### 2. Plan Task 15: go live (only with Rodrigo's OK)

Follow plan Task 15. Three pieces in it **don't exist yet** and must be written:
- `scripts/bootstrap-admin.js`: creates the first admin (`rodrigo`) in production. It prompts for the password in the terminal; the password must never go in code or chat.
- `docs/OPERACION.md`: a short **Spanish** guide for the admin covering logging in, creating users, the weekly CSV export, and restoring a paused Supabase project.
- `.env.production.local`: production keys, git-ignored. Pass it to the importer with `--env .env.production.local`.

Production settings:
- Supabase region `us-east-1`, free plan.
- Turn **off** sign-ups in Auth settings. Accounts are created only through the admin screen.
- Cloudflare Pages: build `npm run build`, output `dist`, environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, Node 22+.
- Run the import **dry run first** and show the summary to Rodrigo before running `--commit`.

### 3. Open data question for Rodrigo

8 tickets in the sheet have a delivery date earlier than their received date: **613, 885, 1092, 1199, 1858, 1932, 1947, 2536**. They're probably typos. They import as they are; correct the sheet first if Rodrigo wants them fixed.

## Decisions made during the build that differ from or add to the plan

Read these before changing related code:
- **`create_ticket` is `SECURITY DEFINER`** (the plan said invoker). The tailor who receives a garment must be able to add items to a ticket assigned to the other tailor, and item RLS would block that. It checks for an active user itself; a trigger (`tickets_assignee_check`) makes sure tickets go only to active tailors.
- **Deactivating a user** bans them in Auth and also hides all data through RLS. The app checks the session on every screen change and shows "Usuario inactivo".
- **Importer:**
  - Reads Google Sheets serial dates (e.g. `46225` = 22/07/2026); 1,111 delivery dates were stored that way.
  - For tickets not fully paid, the final payment is folded into `deposit`, so the balance shows what's really owed.
  - It isn't transactional; re-running it is safe because existing ticket numbers are skipped.
- **Price at delivery:** with one garment, its cost changes. With several, an "Ajuste" line is added for the increase. Lowering a price goes through "Editar".
- **CSV export uses `;`** because Excel set to Spanish (Colombia) expects it, and starts with a UTF-8 BOM so accents display correctly.
- **List search** (number, name or phone) ignores the "Mis arreglos/Todos" and status filters, so a customer's ticket is always found at pickup.
- **Customers:** any active user can correct a customer's name or phone.
- **Warranty tickets** show total and balance $0, even when they have a deposit.
- Migrations `0001`–`0005` were edited in place during the build. That's fine because they were never deployed; once in production, only add new migrations.

## Rules for this repo

- The repo is **public**. Never commit CSVs, `.env*` files (except `.env.example`), exports, or anything with customer names or phones. `.gitignore` covers these; check `git status` before every commit anyway.
- UI text is Spanish only. Money is COP with no decimals, shown as `$10.000`. Dates show as `d/mm/yyyy`.
