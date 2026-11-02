# El Sastre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Spanish, mobile-first web app where 2 tailors log repair tickets and 1 admin supervises, replacing the Google Form/Sheet and importing its 2,698-row history.

**Architecture:** A Svelte 5 + Vite single-page app talks directly to Supabase (Postgres + Auth). All permission rules live in the database (RLS policies + `BEFORE` triggers); the browser only holds the publishable key. Admin user management runs in one Edge Function holding the service-role key. A local Node importer loads the CSV history. The app is hosted on Cloudflare Pages.

**Tech Stack:** Svelte 5.57 (runes), Vite 8, @supabase/supabase-js 2.118, Supabase CLI 2.122 (local stack via Docker), pgTAP (`supabase test db`), Vitest 5, Playwright 1.64, Node 26, plain JavaScript (ES modules, JSDoc where helpful; no TypeScript), Wrangler 4 for Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-31-sastreria-app-design.md`

## Global Constraints

- UI copy is Spanish only. Currency is COP: integers only, displayed as `$10.000` (dot thousands separator, no decimals).
- Dates display as `d/mm/yyyy`, matching the sheet. Stored as SQL `date`. "Today" is America/Bogota time.
- Statuses (DB values → labels): `recibido` → Recibido, `en_proceso` → En proceso, `listo` → Listo para entregar, `entregado` → Entregado, `cancelado` → Cancelado.
- Locations: `A`, `B`, `C`, `D`, `E`, `CAJON` (label Cajón), `BODEGA` (label Bodega).
- Usernames: `alexander` (Alexander Rengifo, tailor), `claudia` (Claudia Alvarez, tailor), `rodrigo` (Rodrigo, admin). Auth email = `<username>@sastreria.local`.
- New ticket numbers start at max imported number + 1 (expected 2712).
- No runtime CDN requests: every script, style and font is bundled. Use the system font stack.
- The service-role key never appears in front-end code, git, or logs. `*.csv`, `.env*` and `exports/` stay git-ignored.
- Git identity: Ricardo Osorio <98488928+Ozoperezoso@users.noreply.github.com> (already set repo-locally).
- Docker Desktop must be running for any `supabase` local command.

## Review Focus

1. **Accents and case in search:** "munoz" and "MUÑOZ" both find "Muñoz", and a phone search ignores spaces, dashes and a `+57` prefix → tests in Task 2 (`search_customers`) and Task 7 (`normalizePhone`).
2. **Money typed with separators:** a tailor typing `10.000`, `10000` or `$10.000` stores 10000; `10,5` or letters are rejected with a Spanish message → test in Task 8 (`parseCOPInput`).
3. **Deactivated or expired session:** a user deactivated mid-session gets an empty or failed response on the next request and is sent to login with "Usuario inactivo" → pgTAP in Task 3, e2e in Task 14.
4. **Two tickets created at the same moment:** numbers come from a sequence inside `create_ticket`; never computed client-side → pgTAP in Task 4 asserts the number comes from the sequence and that a duplicate (`number`, `suffix`) is rejected.
5. **Due date before received date:** allowed (imported data contains it), but the form shows a warning "La fecha de entrega es anterior a la de recibido" → component logic in Task 10, e2e in Task 14.

---

## File Structure

```
el-sastre/
├── package.json, vite.config.js, svelte.config.js, playwright.config.js, index.html, .env.example
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_schema.sql          # enums, tables, sequence, indexes, view
│   │   ├── 0002_rules.sql           # audit + status triggers
│   │   ├── 0003_security.sql        # helper fns, RLS policies, column-guard trigger
│   │   ├── 0004_rpc.sql             # create_ticket, search_customers, admin_totals
│   ├── seed.sql                     # local-only test users and tickets
│   ├── tests/*.test.sql             # pgTAP
│   └── functions/admin-users/index.ts
├── scripts/import/
│   ├── csv.js       # parseCSV(text) -> string[][]
│   ├── parse.js     # parseDate, parseMoney, normalizeName, normalizePhone
│   ├── map.js       # mapRows(rows, tailorIds) -> { customers, tickets, problems }
│   └── run.js       # CLI: --dry-run | --commit [--since <number>]
├── src/
│   ├── main.js, App.svelte, app.css
│   ├── lib/
│   │   ├── supabase.js      # client singleton
│   │   ├── session.svelte.js# auth state (runes)
│   │   ├── router.svelte.js # hash router
│   │   ├── format.js        # formatCOP, parseCOPInput, formatDate, displayNumber, statusLabel, locationLabel
│   │   ├── permissions.js   # canEditCore, canDelete, isAdmin
│   │   └── api.js           # all Supabase calls
│   ├── components/  (TicketCard, StatusBadge, CustomerPicker, ItemLines, LocationPicker, Modal)
│   └── routes/      (Login, Inicio, NuevoArreglo, Detalle, AdminPanel, AdminTodos, AdminUsuarios)
└── tests/
    ├── unit/*.test.js       # Vitest (format, permissions, import)
    ├── integration/*.test.js# Vitest against local Supabase (importer commit, admin-users)
    └── e2e/*.spec.js        # Playwright
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.js`, `svelte.config.js`, `index.html`, `src/main.js`, `src/App.svelte`, `src/app.css`, `playwright.config.js`, `.env.example`, `README.md`, `supabase/config.toml` (via `supabase init`)
- Test: `tests/unit/smoke.test.js`

**Interfaces:**
- Produces npm scripts: `dev`, `build`, `preview`, `test` (vitest run tests/unit), `test:int` (vitest run tests/integration), `test:e2e` (playwright test), `db:start` (supabase start), `db:reset` (supabase db reset), `db:test` (supabase test db).
- `.env.example` keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (importer/tests only).

- [ ] **Step 1:** Scaffold with `npm create vite@latest . -- --template svelte` (JavaScript). Pin `svelte@^5.57`, `vite@^8.3`, `@supabase/supabase-js@^2.118`; dev deps `vitest@^5`, `@playwright/test@^1.64`, `supabase@^2.122`. Run `npx supabase init`.
- [ ] **Step 2:** Write `tests/unit/smoke.test.js` asserting `1 + 1 === 2`; run `npm test`. Expected: PASS.
- [ ] **Step 3:** Run `npm run build`. Expected: `dist/` produced; `grep -r "https://" dist/assets` finds no CDN URLs except the Supabase URL placeholder.
- [ ] **Step 4:** `README.md`: setup (Docker running, `npm i`, `npm run db:start`, copy `.env.example` to `.env.local` with values printed by `supabase status`), and every script.
- [ ] **Step 5:** Commit `chore: scaffold Svelte + Vite + Supabase project`.

### Task 2: Database schema

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/tests/schema.test.sql`

**Interfaces:**
- Produces:
  - enums `ticket_status`, `storage_location`.
  - tables `profiles`, `customers`, `tickets`, `ticket_items` with the exact columns in spec §3.
  - `sequence ticket_number_seq`.
  - unique (`number`, `suffix`).
  - extensions `unaccent` and `pg_trgm`, plus a generated column `customers.search_text` (lowercased, unaccented name + digits-only phone) with a trigram index.
  - view `ticket_overview` (`security_invoker = true`) with columns: all ticket columns, `display_number` text, `customer_name`, `customer_phone`, `assigned_name`, `items_summary` (garments joined with `, `), `total` int, `balance` int, `overdue` bool.
  - function `public.today_bogota() returns date`.

- [ ] **Step 1: Write failing pgTAP tests** in `schema.test.sql`:
  - `has_table` for the 4 tables.
  - `col_not_null('customers','name')`.
  - Inserting two tickets with the same (`number`, `suffix`) throws `23505`.
  - `ticket_overview` for items costing 10000 + 14000 with deposit 5000 gives total 24000 and balance 19000; with `paid_in_full` balance is 0; with `warranty` total and balance are 0.
  - `overdue` is true when `due_on = today_bogota() - 1` and status is `en_proceso`, and false for `entregado`.
- [ ] **Step 2:** `npm run db:reset && npm run db:test`. Expected: FAIL (relations missing).
- [ ] **Step 3:** Write `0001_schema.sql`. Money columns are `integer not null default 0 check (>= 0)`; `due_on` and `delivered_on` are nullable; `suffix text not null default ''`.
- [ ] **Step 4:** `npm run db:reset && npm run db:test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): schema, overview view`.

### Task 3: Security — RLS, column guard, audit and status rules

**Files:**
- Create: `supabase/migrations/0002_rules.sql`, `supabase/migrations/0003_security.sql`, `supabase/seed.sql`, `supabase/tests/security.test.sql`

**Interfaces:**
- Produces:
  - `is_active_user() returns bool`, `is_admin() returns bool` (security definer, reading `profiles` for `auth.uid()`).
  - triggers `tickets_audit` (sets `updated_by`/`updated_at`; sets `created_by` on insert), `tickets_status_rules`, `tickets_column_guard`, and `ticket_items_guard`.
  - seed users (local only): `alexander`, `claudia`, `rodrigo` (password `test1234`) and `inactivo` (an inactive tailor), plus 2 tickets, one assigned to each tailor.
- Rules:
  - SELECT on all tables requires `is_active_user()`.
  - INSERT on tickets, items and customers requires an active user.
  - DELETE on tickets requires `is_admin()`.
  - UPDATE on tickets requires an active user, then the guard checks columns. If the editor isn't admin and isn't `assigned_to`, only `status`, `location`, `deposit`, `paid_in_full`, `picked_up_by` and `delivered_on` may change, otherwise raise `'Solo puedes cambiar estado y pago en arreglos de otra persona'`.
  - `ticket_items` insert, update and delete require admin or the assigned tailor.
  - `profiles` writes are admin-only (the Edge Function uses the service role).
  - Status rules: entering `listo` with null `location` raises `'Elige la ubicación de la prenda'`; entering `entregado` sets `delivered_on = today_bogota()` when null.

- [ ] **Step 1: Write failing pgTAP tests** (use `set local role authenticated` + `set local request.jwt.claims` to impersonate each seed user):
  - claudia sees alexander's ticket.
  - claudia `delete` of a ticket affects 0 rows; rodrigo's delete affects 1.
  - claudia updating `status`/`paid_in_full` on alexander's ticket succeeds; updating `due_on` on it throws the guard message.
  - claudia inserting a `ticket_items` row on alexander's ticket is rejected.
  - alexander's full edit of his own ticket succeeds.
  - `inactivo` selects 0 tickets.
  - status `listo` without location throws `'Elige la ubicación de la prenda'`.
  - `entregado` fills `delivered_on`.
  - `updated_by` equals the acting user.
- [ ] **Step 2:** `npm run db:reset && npm run db:test`. Expected: FAIL.
- [ ] **Step 3:** Implement the migrations and seed.
- [ ] **Step 4:** `npm run db:reset && npm run db:test`. Expected: PASS (Task 2 tests still pass).
- [ ] **Step 5:** Commit `feat(db): RLS, column guard, status rules`.

### Task 4: RPCs — create_ticket, search_customers, admin_totals

**Files:**
- Create: `supabase/migrations/0004_rpc.sql`, `supabase/tests/rpc.test.sql`

**Interfaces:**
- Produces:
  - `create_ticket(p_customer_id uuid, p_customer_name text, p_customer_phone text, p_received_on date, p_due_on date, p_assigned_to uuid, p_deposit int, p_warranty bool, p_notes text, p_items jsonb) returns ticket_overview`. Uses the existing customer when `p_customer_id` is set, otherwise creates one. `number = nextval('ticket_number_seq')`. `p_items` is `[{garment, fix, notes, cost}]` and must be non-empty, otherwise raise `'Agrega al menos una prenda'`. `p_assigned_to` must be an active tailor. Runs as the caller (security invoker), so RLS applies.
  - `search_customers(q text) returns setof customers`, at most 8 rows. Matches unaccented, case-insensitive name with `%q%`, or a digits-only phone with `%digits%`. Ordered by trigram similarity.
  - `admin_totals(p_from date, p_to date) returns table(tailor_id uuid, tailor_name text, money_received int, delivered_count int, warranty_count int, open_count int, overdue_count int)`. Raises `'Solo administrador'` unless `is_admin()`. `money_received` = sum of `deposit` where `received_on` falls in range, plus sum of (`total − deposit`) for `entregado` and `paid_in_full` tickets where `delivered_on` falls in range.

- [ ] **Step 1: Write failing pgTAP tests:**
  - `create_ticket` with 2 items returns a row whose `number` = previous `currval` + 1 and `total` = sum.
  - Empty items throws `'Agrega al menos una prenda'`.
  - Assigning to an admin throws.
  - `search_customers('munoz')` finds "MUÑOZ"; `search_customers('311 234')` finds phone `3112345678`.
  - `admin_totals` as a tailor throws `'Solo administrador'`.
  - For a fixture with deposit 5000 received in range and balance 19000 delivered in range, `money_received` = 24000.
- [ ] **Step 2:** Run `npm run db:test`. Expected: FAIL.
- [ ] **Step 3:** Implement `0004_rpc.sql`.
- [ ] **Step 4:** `npm run db:reset && npm run db:test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): create_ticket, search, admin totals`.

### Task 5: Edge Function `admin-users`

**Files:**
- Create: `supabase/functions/admin-users/index.ts`, `tests/integration/admin-users.test.js`

**Interfaces:**
- Produces: `POST /functions/v1/admin-users` with the caller's JWT. Body is one of:
  - `{action:'create', username, full_name, role, password}`
  - `{action:'reset_password', user_id, password}`
  - `{action:'set_active', user_id, active}`

  Responses: `200 {ok:true, user_id?}`, `403 {error:'Solo administrador'}`, `400 {error:<Spanish message>}`.
- Rules:
  - Verify the caller via `auth.getUser(jwt)`, then `profiles.role='admin' and active`.
  - Username must match `^[a-z0-9_]{3,20}$`, otherwise `'Usuario inválido'`. Password must be at least 8 characters, otherwise `'La contraseña debe tener al menos 8 caracteres'`.
  - Create the auth user with email `<username>@sastreria.local` and `email_confirm: true`, then insert the profile.
  - `set_active false` also signs out the user's sessions.
- Consumes: the service-role key from the function environment (provided automatically by Supabase).

- [ ] **Step 1: Write failing integration tests** (local stack; sign in seed users with supabase-js):
  - alexander's call returns 403.
  - rodrigo creates `prueba` → can sign in with that password.
  - Duplicate username → 400.
  - Short password → 400 with that message.
  - `set_active false` → `prueba`'s next `select` on tickets returns 0 rows.
- [ ] **Step 2:** `npm run test:int`. Expected: FAIL (404).
- [ ] **Step 3:** Implement the function (Deno, `npm:@supabase/supabase-js@2`).
- [ ] **Step 4:** `npm run db:reset && npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: admin-users edge function`.

### Task 6: Importer — parsing and mapping (pure)

**Files:**
- Create: `scripts/import/csv.js`, `scripts/import/parse.js`, `scripts/import/map.js`, `tests/unit/import.test.js`

**Interfaces:**
- Produces:
  - `parseCSV(text: string) -> string[][]`: handles quoted fields, embedded newlines and `""`.
  - `parseDate('d/mm/yyyy' | 'd/mm/yyyy h:mm:ss') -> 'yyyy-mm-dd' | null`.
  - `parseMoney(' $24.000' | '- $6.000' | '') -> number | null` (returns -6000 for the negative).
  - `normalizeName(s) -> string` (trim, collapse spaces, uppercase).
  - `normalizePhone(s) -> string` (digits only, strip leading `57` when 12 digits).
  - `mapRows(rows: string[][], tailorIds: {'Alexander Rengifo': uuid, 'Claudia Alvarez': uuid}) -> {customers: Customer[], tickets: Ticket[], problems: string[], summary: {...}}`.
    - `Customer = {key, name, phone}`.
    - `Ticket = {number, suffix, customerKey, assigned_to, received_on, due_on, delivered_on, status, location, picked_up_by, deposit, paid_in_full, warranty, notes, created_at, legacy, items:[{garment, fix, notes, cost}]}`.
- Mapping rules: exactly spec §6. The customer key is `normalizeName + '|' + normalizePhone`.

- [ ] **Step 1: Write failing tests** with inline fixture rows copied from the real sheet's shape (fabricated names):
  - Negative saldo row: Valor 10000, Abono Final 16000 → item cost 16000, `paid_in_full` true, status `entregado`.
  - `Estado='-'` without delivery date → `en_proceso`; `'Listo'` without delivery → `listo` with location `B`.
  - `'-'` location → null; `'No Registra'` → `picked_up_by` null.
  - `'GRANTIA'` in Notas → `warranty` true.
  - Duplicate 136: same customer twice → one ticket with 2 items; a different customer → suffix `B`.
  - An unparseable date `'31/02/2026'` → an entry in `problems` and the row skipped.
  - `summary` includes counts by status and per tailor, and `maxNumber`.
  - `parseCSV` keeps a quoted newline inside Notas.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the three modules.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(import): CSV parsing and row mapping`.

### Task 7: Importer — CLI with dry run and commit

**Files:**
- Create: `scripts/import/run.js`, `tests/integration/import.test.js`, fixture `tests/fixtures/sample.csv` (fabricated, 10 rows, committed; matches the BD_Registros header)

**Interfaces:**
- Consumes: `mapRows` (Task 6); env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `node scripts/import/run.js <file.csv> --dry-run | --commit [--since <number>]`.
  - The dry run prints the summary plus problems and writes nothing.
  - Commit upserts customers by key, inserts tickets and items in batches of 200 (skipping existing (`number`, `suffix`)), then runs `select setval('ticket_number_seq', max(number))`.
  - `--since N` imports only rows with number > N (for switch day).
  - Exit code 1 if any problems exist and `--allow-problems` isn't passed.

- [ ] **Step 1: Write failing integration tests:**
  - Dry run on the fixture writes 0 rows.
  - Commit inserts the expected ticket count.
  - Running commit twice doesn't duplicate.
  - After commit, `create_ticket` returns max+1.
  - `--since` imports only newer rows.
- [ ] **Step 2:** `npm run test:int`. Expected: FAIL.
- [ ] **Step 3:** Implement `run.js`.
- [ ] **Step 4:** `npm run db:reset && npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Run the dry run on the real `Arreglos Modisteria - BD_Registros.csv` against the local stack. Expected: ~2,692 tickets, max number 2711, problems listed. Save the output to `exports/dry-run.txt` (git-ignored) for the user review in Task 15.
- [ ] **Step 6:** Commit `feat(import): CLI with dry-run and incremental commit`.

### Task 8: Front-end foundation — client, session, router, formatting, login

**Files:**
- Create: `src/lib/supabase.js`, `src/lib/session.svelte.js`, `src/lib/router.svelte.js`, `src/lib/format.js`, `src/lib/permissions.js`, `src/routes/Login.svelte`; modify `src/App.svelte`, `src/app.css`
- Test: `tests/unit/format.test.js`, `tests/unit/permissions.test.js`

**Interfaces:**
- Produces:
  - `supabase` client singleton.
  - `session`: a runes object `{user, profile, loading, error}` plus `signIn(username, password)`, `signOut()` and `recheck()`.
    - `signIn` maps the username to `<username>@sastreria.local` and loads the profile. Bad credentials → `'Usuario o contraseña incorrectos'`.
    - `recheck()` re-reads the profile. It runs on every route change and when the tab regains focus. A missing or inactive profile, or an expired session → `signOut()`, `error = 'Usuario inactivo'` (or `'Sesión expirada'`), then go to Login, which shows `error` (Review Focus 3).
  - `router`: `{path, params}`, `navigate(path)`. Routes:
    - `#/` (Inicio)
    - `#/nuevo`
    - `#/arreglo/:id`
    - `#/admin`
    - `#/admin/todos`
    - `#/admin/usuarios`

    Admin routes redirect non-admins to `#/`.
  - `format.js`:
    - `formatCOP(24000) -> '$24.000'`
    - `parseCOPInput('10.000'|'$10.000'|'10000') -> 10000`, otherwise throws `'Valor inválido'`
    - `formatDate('2026-10-31') -> '31/10/2026'`
    - `displayNumber({number, suffix}) -> '136-B'|'2712'`
    - `statusLabel(status)`, `locationLabel(loc)`
  - `permissions.js`: `isAdmin(profile)`, `canEditCore(profile, ticket)` (admin or `ticket.assigned_to === profile.id`), `canDelete(profile)`.
- Layout: top bar with the shop name "El Sastre", the user's name and "Salir"; admin links visible only to the admin; at most 640px wide, centred; tap targets at least 44px.

- [ ] **Step 1: Write failing unit tests** for every `format.js` and `permissions.js` example above, including `parseCOPInput('10,5')` and `parseCOPInput('abc')` throwing `'Valor inválido'`.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the libs, `Login.svelte` and the `App.svelte` shell. Before building screens, use the frontend-design skill to set the visual direction.
- [ ] **Step 4:** `npm test` → PASS. Manually: `npm run dev`, log in as `alexander`/`test1234`, see the empty Inicio placeholder; log in as `inactivo` → "Usuario inactivo".
- [ ] **Step 5:** Commit `feat(ui): app shell, login, formatting`.

### Task 9: Inicio — list, search, filters

**Files:**
- Create: `src/routes/Inicio.svelte`, `src/components/TicketCard.svelte`, `src/components/StatusBadge.svelte`; modify `src/lib/api.js`

**Interfaces:**
- Produces `api.listTickets({q, mine, statuses, userId}) -> ticket_overview[]`:
  - `q` numeric → exact `number` match.
  - Otherwise matches the customer name or phone via `search_customers` ids.
  - Default statuses: `recibido`, `en_proceso`, `listo`.
  - Order by `due_on` with nulls last, then `number`.
  - Limit 100.
- UI: search box debounced 300 ms; chips "Mis arreglos/Todos" and the statuses; cards with a red border when `overdue`, amber when `due_on = today`; the balance is shown only when > 0. Empty state: "No hay arreglos".

- [ ] **Step 1:** Implement against the seed data.
- [ ] **Step 2:** Manually, with `npm run dev` as `claudia`: Todos shows both seed tickets; Mis arreglos shows one; searching "munoz" finds the seeded "MUÑOZ" customer; searching `2` finds by number.
- [ ] **Step 3:** Commit `feat(ui): ticket list with search and filters`.
  (Automated coverage for this screen is in Task 14.)

### Task 10: Nuevo arreglo

**Files:**
- Create: `src/routes/NuevoArreglo.svelte`, `src/components/CustomerPicker.svelte`, `src/components/ItemLines.svelte`; modify `src/lib/api.js`

**Interfaces:**
- Consumes: `create_ticket` (Task 4), `parseCOPInput` (Task 8).
- Produces `api.searchCustomers(q)` and `api.createTicket(form) -> ticket_overview`.
- UI:
  - The customer picker shows matches after 2 characters, plus "Nuevo cliente: <texto>".
  - Received date defaults to today; due date is blank; the assigned tailor defaults to the current user (the admin must pick).
  - Item lines start with 1 row and an "+ Agregar prenda" button; each row has a remove ✕ (disabled when only 1 row).
  - Running total; deposit field; Garantía checkbox (when ticked, costs show $0 and are disabled).
  - Due date < received date → inline warning (Review Focus 5).
  - On success, a full-screen panel shows "Arreglo N° 2712" in large digits with "Ver arreglo" and "Nuevo arreglo" buttons.
  - Errors from the DB are shown verbatim (already in Spanish).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Manually: create a ticket with 2 garments and a $5.000 deposit; check the number and the balance; create one with a new customer and confirm it appears in a later search.
- [ ] **Step 3:** Commit `feat(ui): new ticket form`.

### Task 11: Detalle — view, status actions, edit

**Files:**
- Create: `src/routes/Detalle.svelte`, `src/components/LocationPicker.svelte`, `src/components/Modal.svelte`; modify `src/lib/api.js`

**Interfaces:**
- Produces:
  - `api.getTicket(id) -> {ticket: ticket_overview, items}`.
  - `api.updateTicket(id, patch)`.
  - `api.replaceItems(id, items)` (deletes then inserts in one RPC-free sequence; RLS enforces the assigned tailor).
- UI:
  - Header with the number, status badge and assigned tailor; customer with a `tel:` link; items; money block (total, deposit, balance); dates; location; who picked it up; created/updated by.
  - Action button by status:
    - recibido → "Empezar" (→ en_proceso)
    - en_proceso → "Marcar listo" (modal LocationPicker, required)
    - listo → "Entregar" (modal: "¿Quién recogió?" optional; "Valor final" prefilled with the total and editable only if `canEditCore`; "Pagado completo" checked by default)
  - "Cancelar arreglo" behind a confirmation.
  - "Editar" (only if `canEditCore`) opens an inline edit of items, dates, assignment, notes and warranty, reusing `ItemLines`.
  - The payment fields (deposit, paid) are always editable by any tailor.
  - "Eliminar" is visible only to the admin, with confirmation "¿Eliminar el arreglo N° X? Esta acción no se puede deshacer."

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Manually as `claudia` on alexander's ticket: "Editar" is hidden; "Marcar listo" works; DevTools shows a direct `due_on` update rejected with the guard message.
- [ ] **Step 3:** Commit `feat(ui): ticket detail with status workflow`.

### Task 12: Admin — Panel and Todos with CSV export

**Files:**
- Create: `src/routes/AdminPanel.svelte`, `src/routes/AdminTodos.svelte`, `src/lib/csv-export.js`, `tests/unit/csv-export.test.js`; modify `src/lib/api.js`

**Interfaces:**
- Consumes: `admin_totals` (Task 4), `listTickets` (Task 9).
- Produces:
  - `toCSV(rows: ticket_overview[]) -> string`. Header: `Numero,Cliente,Telefono,Recibido,Entrega estimada,Entregado,Prendas,Arreglos,Tailor,Estado,Ubicacion,Total,Abono,Saldo,Pagado,Garantia,Quien recogio,Notas`. Uses `;`-safe quoting, a UTF-8 BOM so Excel shows accents, dates in `d/mm/yyyy`, and plain integers for money.
  - `api.adminTotals(from, to)`.
  - `api.listAllTickets({tailor, statuses, from, to})` (paged, 500 per page, for export).
- Panel:
  - Cards: "Esta semana" (Monday to today) and "Este mes", total and per tailor.
  - Counts by status; overdue list (links to Detalle); warranty count per tailor.
- Todos: filters; table/cards; "Exportar CSV" downloads `arreglos-YYYY-MM-DD.csv`.

- [ ] **Step 1: Write failing unit tests** for `toCSV`:
  - The BOM is present.
  - A customer name containing `,` and `"` is quoted correctly.
  - `ñ` survives.
  - Money 24000 → `24000`.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: PASS. Manually: the panel totals match the pgTAP fixture expectations on seed data; the export opens in Excel with accents intact.
- [ ] **Step 5:** Commit `feat(ui): admin panel and export`.

### Task 13: Admin — Usuarios

**Files:**
- Create: `src/routes/AdminUsuarios.svelte`; modify `src/lib/api.js`

**Interfaces:**
- Consumes: the `admin-users` function (Task 5).
- Produces:
  - `api.adminUsers(action, payload)`.
  - `api.listProfiles()`.
- UI: list of users with role and active state; a "Nuevo usuario" form (usuario, nombre completo, rol, contraseña); "Cambiar contraseña"; "Desactivar"/"Activar" with confirmation. The function's Spanish error messages are shown inline.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Manually: create `prueba`, sign in as it in a private window, deactivate it from the admin window, then confirm the private window shows "Usuario inactivo" on its next action.
- [ ] **Step 3:** Commit `feat(ui): user management`.

### Task 14: End-to-end tests

**Files:**
- Create: `tests/e2e/helpers.js` (`login(page, username)`), `tests/e2e/tailor-flow.spec.js`, `tests/e2e/permissions.spec.js`, `tests/e2e/admin.spec.js`

**Interfaces:**
- Consumes: seed users (Task 3).
- `playwright.config.js`: the `iPhone 13` device (Chromium); `webServer: npm run dev`; `globalSetup` runs `supabase db reset`.

- [ ] **Step 1: Write the specs:**
  - **tailor-flow:**
    - alexander creates a ticket for a new customer "José Muñoz" with 2 garments (10.000 + 14.000) and deposit 5.000 → sees the number and balance `$19.000`.
    - Searches "jose munoz" → finds it.
    - Empezar → Marcar listo with location B → Entregar with paid → status Entregado, balance hidden.
    - Due date before received date shows the warning.
  - **permissions:**
    - claudia opens alexander's seed ticket → no Editar button; can Marcar listo.
    - No admin links are visible.
    - Navigating to `#/admin` redirects to `#/`.
  - **admin:**
    - rodrigo sees the panel totals.
    - Creates user `prueba`, then deactivates it; a second browser context logged in as `prueba` gets "Usuario inactivo" after a reload.
    - Exports CSV: the download filename matches `arreglos-\d{4}-\d{2}-\d{2}\.csv`.
    - Deletes a ticket.
- [ ] **Step 2:** `npm run test:e2e`. Expected: all PASS. Fix the app (not the tests) where they fail.
- [ ] **Step 3:** Commit `test: end-to-end flows on mobile viewport`.

### Task 15: Production setup, import and deploy

This task is mostly account setup. For each step, the executor does it via tools when the connected account allows it; otherwise it gives the user these exact instructions and waits. (User preference: either route is fine, but the instructions are always given.)

**Files:**
- Create: `docs/OPERACION.md` (Spanish admin guide: login, creating users, weekly export, restoring a paused project)

- [ ] **Step 1: Supabase project.** Create the project "el-sastre" in org Ozoperezoso, region `us-east-1`, free plan (Supabase MCP `create_project`, or dashboard → New project). Then:
  - `npx supabase link --project-ref <ref>`
  - `npx supabase db push`
  - `npx supabase functions deploy admin-users`

  Under Auth settings: disable sign-ups and email confirmations.
- [ ] **Step 2: Real users.** Create `scripts/bootstrap-admin.js`: run locally with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.production.local`; it prompts for the password in the terminal (the user types it, never in chat); it creates auth user `rodrigo@sastreria.local` and the profile `{username:'rodrigo', full_name:'Rodrigo', role:'admin', active:true}`; it exits if `rodrigo` already exists. Rodrigo then creates `alexander` and `claudia` in the app.
- [ ] **Step 3: Import.** Run `node scripts/import/run.js "<BD_Registros.csv>" --dry-run` against production (`.env.production.local`). Show the user the summary and problems, and **wait for their OK**, then run `--commit`. Spot-check 5 tickets in the app against the sheet with the user.
- [ ] **Step 4: Cloudflare Pages.** Create a Pages project connected to GitHub `Ozoperezoso/el-sastre` (dashboard: Workers & Pages → Create → Pages → Connect to Git). Settings:
  - Build command `npm run build`, output `dist`.
  - Env `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
  - Node version 22 or higher.

  Confirm `https://el-sastre.pages.dev` loads and login works on a phone.
- [ ] **Step 5:** Run Playwright `tailor-flow` against the production URL with a temporary test user, then delete that user and its tickets.
- [ ] **Step 6:** Write `docs/OPERACION.md`; commit `docs: operation guide`; push. Confirm Cloudflare redeploys.
- [ ] **Step 7: Switch day (scheduled with the user, after the 2–3 day trial):** fresh export, then `--commit --since <last imported number>`, and the form is retired.
