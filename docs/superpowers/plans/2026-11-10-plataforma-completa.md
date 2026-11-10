# Platform admin: consult, edit and delete shops — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The platform user can see every shop with its usage, open a shop to see its contact details, monthly tickets and users, edit the shop and its users, and delete a deactivated shop by typing its name.

**Architecture:** Reads come from platform-only `SECURITY DEFINER` database functions that return counts, never customer or ticket text. Writes go through new actions in the existing `admin-users` Edge Function, which uses the service role. Two Svelte screens: the existing Plataforma list, reworked, and a new shop page at `#/plataforma/<id>`.

**Tech Stack:** Supabase (Postgres, RLS, pgTAP, Deno Edge Function), Svelte 5 + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-plataforma-completa-design.md`

## Global Constraints

- All new SQL goes in `supabase/migrations/0008_platform_admin.sql`. Never edit `0001`–`0007`.
- Every new database function: `set search_path = ''`, fully qualified names (`public.…`, `auth.…`).
- The platform never receives customer names, phones, ticket text or money. Functions return counts and user rows only.
- UI text in Spanish only. Dates `d/mm/aaaa`. Counts with `.` thousands separator (`2.690`), matching `src/lib/format.js`.
- Error messages are exactly the Spanish strings in spec §4, for example `'Solo la plataforma'`, `'Primero desactiva la sastrería'`, `'El nombre no coincide'`, `'Sastrería no encontrada'`, `'No se pudo borrar todo; intenta otra vez'`.
- Screens follow `docs/UI-BRIEF.md`: paño `#23453A`, 44–54 px targets, loading / empty / error states, phone and computer layouts.
- Public repo: no real customer data in tests or seed.
- After changing `supabase/functions/admin-users/index.ts`, the local edge runtime picks it up; after adding files under `supabase/functions/`, run `npx supabase stop && npx supabase start`.

## Review Focus

1. **Month boundary in Bogotá time:** a ticket received on the last day of a month at 23:00 in Bogotá counts in that month, not the next. Months are computed from `received_on` (a date) and `public.today_bogota()`, never `now()` in UTC. Test in Task 1.
2. **Shop name typed with surrounding spaces or different case:** `confirm_name` is trimmed but compared case-sensitively and accent-sensitively (`'sastrería la unión'` ≠ `'Sastrería La Unión'`). Test in Task 2.
3. **Deleting must never touch another shop:** after deleting a shop, the other shop's ticket, customer and user counts are unchanged. Test in Task 2.
4. **A shop admin sending `shop_id`:** `create` ignores it and adds the user to the admin's own shop. Test in Task 3.
5. **A shop with no tickets and no sign-ins:** the list shows "Sin uso" for last activity and `0` for counts, and the 6-month bars render as empty, not broken. Tests in Task 1 (null) and Task 5 (render).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0008_platform_admin.sql` (create) | `shop_contacts`, `platform_shop_stats()`, `platform_shop_users(uuid)`, `delete_shop_data(uuid)` |
| `supabase/tests/platform.test.sql` (create) | pgTAP for everything in 0008 |
| `supabase/functions/admin-users/index.ts` (modify) | New actions `update_shop`, `rename_user`, `delete_shop`; platform allowed in `create`, `set_active` |
| `tests/integration/platform.test.js` (create) | Integration tests for the new and changed actions |
| `src/lib/api.js` (modify) | `platformShopStats`, `platformShopUsers`, `getShopContact`, `getShop` |
| `src/lib/format.js` (modify) | `relativeDays(date)` for "hace 3 días" / "Sin uso" |
| `src/lib/router.svelte.js` (modify) | Route `plataforma` (`#/plataforma/<uuid>`), flag `platform: true` |
| `src/App.svelte` (modify) | Platform users get list or shop page by route; others are sent away from platform routes |
| `src/routes/Plataforma.svelte` (modify) | List with totals and usage per shop; create form stays |
| `src/routes/Sastreria.svelte` (create) | Shop page: header, usage, contact, users, edit dialog, delete zone |
| `src/components/MonthBars.svelte` (create) | The 6-month bar row |
| `tests/unit/format.test.js` (modify) | Tests for `relativeDays` |
| `tests/e2e/platform.spec.js` (create) | Platform flows on phone size |
| `docs/OPERACION.md`, `docs/HANDOFF.md` (modify) | Describe the new screens and decisions |

---

### Task 1: Database — contacts table and platform read functions

**Files:**
- Create: `supabase/migrations/0008_platform_admin.sql` (first part)
- Create: `supabase/tests/platform.test.sql`

**Interfaces:**
- Produces:
  - Table `public.shop_contacts (shop_id uuid pk → shops on delete cascade, contact_name text, contact_phone text, contact_email text, notes text, updated_at timestamptz default now())`, RLS on, one `select` policy for `authenticated` using `public.is_platform_admin()`.
  - `public.platform_shop_stats() returns table (shop_id uuid, users_total int, users_active int, tailors_active int, tickets_total int, customers_total int, tickets_this_month int, months jsonb, last_activity_at timestamptz)`. `months` = 6 objects `{"month":"YYYY-MM","tickets":N}`, oldest first, ending with the current Bogotá month.
  - `public.platform_shop_users(p_shop uuid) returns table (id uuid, username text, full_name text, role text, active boolean, created_at timestamptz, last_sign_in_at timestamptz)`, ordered by `full_name`.
  - Both raise `'Solo la plataforma'` unless `public.is_platform_admin()`. Execute revoked from `public, anon`, granted to `authenticated`.

- [ ] **Step 1: Write the failing pgTAP tests in `supabase/tests/platform.test.sql`**

Same structure as `security.test.sql` (`begin; select plan(N); … select * from finish(); rollback;`, switching users with `set local request.jwt.claims` / `set local role authenticated`). Seed ids: La Unión `…a001`, Prueba Norte `…b002`, admin `3333…`, alexander `1111…`, plataforma `6666…`.

```sql
-- as admin (3333…), alexander (1111…) and anon:
select throws_ok($$ select * from public.platform_shop_stats() $$, 'P0001', 'Solo la plataforma', 'a shop admin cannot read platform stats');
select throws_ok($$ select * from public.platform_shop_users('00000000-0000-0000-0000-00000000a001') $$, 'P0001', 'Solo la plataforma', 'a tailor cannot list shop users');
select throws_ok($$ select * from public.platform_shop_stats() $$, '42501', null, 'anon cannot call platform stats');
select is((select count(*)::int from public.shop_contacts), 0, 'shop users see no shop_contacts');  -- after inserting one La Unión row as postgres

-- as plataforma (6666…):
select is((select array[users_total, users_active, tailors_active, tickets_total, customers_total] from public.platform_shop_stats()
           where shop_id = '00000000-0000-0000-0000-00000000a001'), array[4, 3, 2, 2, 2], 'La Unión counts');
select is((select tickets_this_month from public.platform_shop_stats() where shop_id = '…a001'),
          (select count(*)::int from public.tickets where shop_id = '…a001'
             and date_trunc('month', received_on) = date_trunc('month', public.today_bogota())),
          'tickets_this_month counts received_on in the current Bogotá month');
select is((select jsonb_array_length(months) from public.platform_shop_stats() where shop_id = '…a001'), 6, 'six months');
select is((select months -> 5 ->> 'month' from public.platform_shop_stats() where shop_id = '…a001'),
          to_char(public.today_bogota(), 'YYYY-MM'), 'last month is the current one');
select is((select (months -> 5 ->> 'tickets')::int from public.platform_shop_stats() where shop_id = '…a001'),
          (select tickets_this_month from public.platform_shop_stats() where shop_id = '…a001'), 'last bar equals this month');
select is((select (months -> 0 ->> 'tickets')::int from public.platform_shop_stats() where shop_id = '…a001'), 0, 'empty months are 0');
select is((select count(*)::int from public.platform_shop_users('…a001')), 4, 'all La Unión users, active or not');
select is((select count(*)::int from public.shop_contacts), 1, 'the platform reads shop_contacts');
-- Review Focus 1: as postgres, insert a ticket with received_on = first day of the current Bogotá month;
-- as plataforma, tickets_this_month went up by exactly 1. Insert one with received_on = that day - 1: it did not.
-- Review Focus 5: insert a shop with no users and no tickets; its row has 0 counts and last_activity_at is null.
-- no customer data: see the column check below
```

Use full UUIDs where `…a001` is written. The column check uses `pg_get_function_result('public.platform_shop_stats()'::regprocedure)` and `…platform_shop_users(uuid)…` and asserts they do not match `'(customer_name|customer_phone|phone|garment|fix|notes|items|balance|deposit|cost)'`. Counts such as `customers_total` and `tickets_total` are allowed, and so is `full_name` (user names).

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `platform.test.sql` FAILS (functions and table do not exist); the other three files still pass.

- [ ] **Step 3: Implement the first part of `0008_platform_admin.sql`**

`last_activity_at` = `greatest(max(tickets.updated_at), max(auth.users.last_sign_in_at))` for that shop's rows (`greatest` ignores nulls; both null → null). `months`: `generate_series(date_trunc('month', today_bogota()) - interval '5 months', date_trunc('month', today_bogota()), interval '1 month')` left-joined to ticket counts by `date_trunc('month', received_on)`, aggregated with `jsonb_agg(… order by month)`. Shops come from `public.shops`, so a shop with no users or tickets still has a row.

- [ ] **Step 4: Run to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: `All tests successful.`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_platform_admin.sql supabase/tests/platform.test.sql
git commit -m "feat(db): platform-only shop stats, users and contacts"
```

---

### Task 2: Delete a shop — database function and `delete_shop` action

**Files:**
- Modify: `supabase/migrations/0008_platform_admin.sql` (append)
- Modify: `supabase/tests/platform.test.sql`
- Modify: `supabase/functions/admin-users/index.ts`
- Create: `tests/integration/platform.test.js`

**Interfaces:**
- Consumes: `shop_contacts` (Task 1, deleted by cascade).
- Produces:
  - `public.delete_shop_data(p_shop uuid) returns setof uuid` (the shop's profile ids). Execute only for `service_role`. Raises `'Sastrería no encontrada'` if missing and `'Primero desactiva la sastrería'` if active. Deletes the shop's `tickets` (items by cascade), then its `customers`. Safe to repeat.
  - `admin-users` action `delete_shop` with body `{ shop_id, confirm_name }` → `200 { ok: true }`, following spec §4 steps 1–5 and messages.
  - `tests/integration/platform.test.js` with helper `call(client, body)` (same as `admin-users.test.js`) and `throwawayShop(platform, slug)`. That helper creates a shop via `create_shop` with admin `adm_<slug>`, adds one customer, ticket and item with the service client, and returns `{ shopId, adminId }`.

- [ ] **Step 1: Write the failing tests**

pgTAP, appended to `platform.test.sql`:
```sql
select throws_ok($$ select public.delete_shop_data('00000000-0000-0000-0000-00000000b002') $$, '42501', null, 'authenticated cannot run delete_shop_data');  -- as plataforma
-- as postgres (service role equivalent):
select throws_ok($$ select public.delete_shop_data('00000000-0000-0000-0000-00000000b002') $$, 'P0001', 'Primero desactiva la sastrería', 'refuses an active shop');
-- deactivate b002, run it, then:
select is((select count(*)::int from public.tickets where shop_id = '…b002'), 0, 'its tickets are gone');
select is((select count(*)::int from public.customers where shop_id = '…b002'), 0, 'its customers are gone');
select is((select count(*)::int from public.tickets where shop_id = '…a001'), 2, 'La Unión keeps its tickets');
select is((select count(*)::int from public.delete_shop_data('…b002')), 1, 'running again is safe and returns the remaining profile');
```

Integration, `tests/integration/platform.test.js`:
```js
test('delete_shop refuses an active shop', …) // → { status: 400, body: { error: 'Primero desactiva la sastrería' } }
test('delete_shop refuses a wrong name', …)    // name typed in lower case → 'El nombre no coincide'
test('delete_shop accepts the name with spaces around it', …) // `  ${name}  ` → 200
test('delete_shop erases tickets, customers, users, logins and contacts, and nothing else', …)
  // before: count La Unión tickets/customers/profiles with the service client
  // after: throwaway shop row gone; its tickets, customers, profiles and shop_contacts rows 0;
  //        admin.auth.admin.getUserById(adminId) returns an error (user gone); La Unión counts unchanged
test('a shop admin cannot delete shops', …)    // signedIn('admin') → 403 'Solo la plataforma'
```
Each test builds its own shop with `throwawayShop`, and `afterAll` removes any leftovers by slug prefix `prueba-borrar-`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase db reset && npx supabase test db && npx vitest run tests/integration/platform.test.js`
Expected: pgTAP delete tests FAIL (function missing); integration tests FAIL with `'Acción desconocida'`.

- [ ] **Step 3: Implement `delete_shop_data` in 0008 and the `delete_shop` action**

The action compares `String(body.confirm_name ?? '').trim() === shop.name`. It calls `admin.rpc('delete_shop_data', { p_shop })`, deletes each returned id with `admin.auth.admin.deleteUser` (stopping with the 500 message on the first failure), then deletes the `shops` row.

- [ ] **Step 4: Run to verify it passes**

Run: `npx supabase db reset && npx supabase test db && npm run test:int`
Expected: all pgTAP and integration tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_platform_admin.sql supabase/tests/platform.test.sql supabase/functions/admin-users/index.ts tests/integration/platform.test.js
git commit -m "feat: delete a deactivated shop by typing its name"
```

---

### Task 3: Edit shops and users from the platform — `admin-users` actions

**Files:**
- Modify: `supabase/functions/admin-users/index.ts`
- Modify: `tests/integration/platform.test.js`

**Interfaces:**
- Consumes: `shop_contacts` (Task 1), `call` and `throwawayShop` (Task 2).
- Produces (spec §4):
  - `update_shop { shop_id, name, city?, contact_name?, contact_phone?, contact_email?, notes? }` → `200 { ok: true }`. Name required (`'Escribe el nombre de la sastrería'`), empty strings → null, `slug` ignored, upsert into `shop_contacts` with `updated_at = now()`.
  - `create`: platform allowed with `shop_id` (must exist and not be the platform; else `'Sastrería no encontrada'`). For a shop admin, `body.shop_id` is ignored.
  - `set_active`: platform allowed for any non-platform user via `manageableUser`. The self-deactivation check stays.
  - `rename_user { user_id, full_name }` → `200 { ok: true }`. Shop admin or platform, `manageableUser` check, `'Escribe el nombre completo'` when empty.

- [ ] **Step 1: Write the failing integration tests**

```js
test('the platform updates a shop and its contact details', …)
  // update_shop with name 'Sastrería Prueba Editada', city 'Cali', contact_phone '3001234567', notes 'Paga el 5'
  // → service client reads shops.name/city and shop_contacts row with those values; slug unchanged even if 'slug: "otro"' sent
test('empty contact fields are stored as null', …)
test('a shop admin cannot update shops', …)              // → 403 'Solo la plataforma'
test('the platform adds a tailor to another shop', …)    // create { shop_id, role: 'tailor', … } → profile.shop_id === shopId
test('a shop admin sending shop_id still creates in their own shop', …) // Review Focus 4: profile.shop_id === La Unión
test('the platform deactivates and reactivates a shop user', …)
test('rename_user changes the full name, not the username', …)
test('a shop admin cannot rename a user of another shop', …) // → 400 'Usuario no encontrado'
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/platform.test.js`
Expected: the new tests FAIL (`'Acción desconocida'` or 403).

- [ ] **Step 3: Implement the actions in `admin-users/index.ts`**

Update the header comment listing the actions.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:int`
Expected: all integration tests pass, including the existing `admin-users.test.js`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-users/index.ts tests/integration/platform.test.js
git commit -m "feat: platform edits shops and manages their users"
```

---

### Task 4: Front-end data and routing

**Files:**
- Modify: `src/lib/api.js`, `src/lib/format.js`, `src/lib/router.svelte.js`, `src/App.svelte`
- Modify: `tests/unit/format.test.js`

**Interfaces:**
- Consumes: SQL functions (Task 1), actions (Tasks 2–3).
- Produces:
  - `platformShopStats(): Promise<Array<{shop_id, users_total, users_active, tailors_active, tickets_total, customers_total, tickets_this_month, months, last_activity_at}>>`
  - `platformShopUsers(shopId): Promise<Array<{id, username, full_name, role, active, created_at, last_sign_in_at}>>`
  - `getShop(shopId): Promise<{id, slug, name, city, active, created_at}>`
  - `getShopContact(shopId): Promise<{contact_name, contact_phone, contact_email, notes} | null>`
  - `adminUsers` JSDoc action list adds `'update_shop'|'rename_user'|'delete_shop'`.
  - `relativeDays(value: string|Date|null, today?: Date): string` → `'Sin uso'` for null, `'hoy'`, `'ayer'`, `'hace N días'` (N < 30), `'hace N meses'` otherwise (Bogotá dates).
  - Route `{ name: 'plataforma', pattern: /^\/plataforma\/([0-9a-f-]{36})$/, keys: ['id'], platform: true }`; `router.platform` boolean.
  - `App.svelte`: platform user → `Sastreria` when `router.name === 'plataforma'`, else `Plataforma`. Non-platform user on a `platform` route → `navigate('/')`.

- [ ] **Step 1: Write the failing unit tests for `relativeDays`**

```js
expect(relativeDays(null)).toBe('Sin uso');
expect(relativeDays('2026-11-10T15:00:00Z', new Date('2026-11-10T20:00:00Z'))).toBe('hoy');
expect(relativeDays('2026-11-09T15:00:00Z', new Date('2026-11-10T20:00:00Z'))).toBe('ayer');
expect(relativeDays('2026-11-07T15:00:00Z', new Date('2026-11-10T20:00:00Z'))).toBe('hace 3 días');
expect(relativeDays('2026-08-01T15:00:00Z', new Date('2026-11-10T20:00:00Z'))).toBe('hace 3 meses');
// 2026-11-11T03:00Z is still 10 Nov in Bogotá (UTC-5):
expect(relativeDays('2026-11-10T15:00:00Z', new Date('2026-11-11T03:00:00Z'))).toBe('hoy');
```

- [ ] **Step 2: Run to verify it fails** — `npm test` → FAIL (`relativeDays` not exported).

- [ ] **Step 3: Implement `relativeDays`, the API functions, the route and the App switch.** Create `src/routes/Sastreria.svelte` as a placeholder showing the shop name from `getShop`, so the route renders. Task 5 fills it in.

- [ ] **Step 4: Run to verify it passes** — `npm test && npm run build` → all unit tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.js src/lib/format.js src/lib/router.svelte.js src/App.svelte src/routes/Sastreria.svelte tests/unit/format.test.js
git commit -m "feat(ui): platform data helpers and shop page route"
```

---

### Task 5: Screens — shop list, shop page, edit and users

**Files:**
- Modify: `src/routes/Plataforma.svelte`
- Modify: `src/routes/Sastreria.svelte`
- Create: `src/components/MonthBars.svelte`
- Create: `tests/e2e/platform.spec.js`

**Interfaces:**
- Consumes: everything from Task 4; existing `Modal.svelte`, `toast.svelte.js`, `formatDate`/number helpers in `format.js`.
- Produces: `MonthBars` with props `{ months: Array<{month: string, tickets: number}> }`. It renders 6 labelled bars (month abbreviation `nov`, count). Bar height is relative to the largest month; when all are 0, every bar shows at minimum height with `0`.

Content per spec §5.1 and §5.2. In the list, the whole row is a link to `#/plataforma/<id>`. The existing Desactivar/Activar and Cambiar contraseña controls move from the list to the shop page. The Desactivar dialog text adds: "Si quieren guardar sus datos, su administrador debe exportar el CSV antes."

- [ ] **Step 1: Write the failing e2e tests in `tests/e2e/platform.spec.js`**

```js
test('the platform sees each shop with its usage', …)
  // login plataforma → 'Sastrería La Unión' row shows '2 sastres' (tailors_active) and a last-activity text; totals show '2 activas'
test('the platform opens a shop and edits its contact details', …)
  // click La Unión → heading 'Sastrería La Unión'; Editar → contact_phone '3001234567', notes 'Paga el 5' → Guardar
  // → page shows '3001234567' and 'Paga el 5'; reload keeps them
test('the platform adds a tailor and resets a password', …)
  // Nuevo usuario: 'sastre_e2e', 'Sastre Prueba', Sastre, 'secreta123' → row 'Sastre Prueba' appears;
  // Cambiar contraseña on it → toast/notice 'Contraseña de sastre_e2e cambiada.'
test('a shop admin is sent away from a shop page', …)
  // login admin, goto '/#/plataforma/00000000-0000-0000-0000-00000000a001' → URL ends with '#/'
test('a shop with no usage shows Sin uso and empty bars', …) // Review Focus 5
  // create a shop through the form; its row shows 'Sin uso'; its page shows 6 bars all '0'
```

- [ ] **Step 2: Run to verify it fails** — `npx playwright test tests/e2e/platform.spec.js` → FAIL.

- [ ] **Step 3: Implement `MonthBars.svelte`, the reworked `Plataforma.svelte` and `Sastreria.svelte`** (without the delete zone, which is Task 6).

- [ ] **Step 4: Run to verify it passes** — `npm run test:e2e` → all e2e tests pass, including the existing 13.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Plataforma.svelte src/routes/Sastreria.svelte src/components/MonthBars.svelte tests/e2e/platform.spec.js
git commit -m "feat(ui): shop list with usage and a page per shop"
```

---

### Task 6: Delete zone on the shop page, and docs

**Files:**
- Modify: `src/routes/Sastreria.svelte`
- Modify: `tests/e2e/platform.spec.js`
- Modify: `docs/OPERACION.md`, `docs/HANDOFF.md`

**Interfaces:**
- Consumes: `delete_shop` action (Task 2), `platformShopStats` counts (Task 1).

Spec §5.2 "Eliminar sastrería". The dialog's counts come from the stats row: `tickets_total` arreglos, `customers_total` clientes and `users_total` usuarios; the text is "Se borrarán para siempre 2.690 arreglos, 2.139 clientes y 5 usuarios." (numbers formatted with `.`). The confirm button reads `Eliminar <shop name>` and stays disabled until the typed name, trimmed, equals `shop.name`.

- [ ] **Step 1: Write the failing e2e tests**

```js
test('delete is disabled while the shop is active', …)
  // La Unión page → button 'Eliminar sastrería' disabled, text 'Desactívala primero'
test('the platform deactivates and deletes a shop by typing its name', …)
  // create shop 'Sastrería Para Borrar' via form → open it → Desactivar → confirm
  // → Eliminar sastrería → type 'sastrería para borrar' → button still disabled
  // → type 'Sastrería Para Borrar' → click → back on '#/', toast 'Sastrería Para Borrar eliminada.', row gone
```

- [ ] **Step 2: Run to verify it fails** — `npx playwright test tests/e2e/platform.spec.js` → the 2 new tests FAIL.

- [ ] **Step 3: Implement the delete zone and dialog in `Sastreria.svelte`**

- [ ] **Step 4: Update the docs.** In `OPERACION.md`, the "Sastrerías nuevas (técnico)" section becomes "Sastrerías (técnico)": list, shop page, edit, users, deactivate (export the CSV first), delete in two steps. In `HANDOFF.md`, add 0008 to the production list as "pending to apply", add the decisions from spec §7, and keep "usernames per shop" under Lo que falta.

- [ ] **Step 5: Run every suite**

Run: `npx supabase db reset && npx supabase test db && npm test && npm run test:int && npm run test:e2e && npm run build`
Expected: all pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Sastreria.svelte tests/e2e/platform.spec.js docs/OPERACION.md docs/HANDOFF.md
git commit -m "feat(ui): delete a deactivated shop; docs for the platform screens"
```

---

## After the plan

Production is not touched by this plan. Applying `0008` and deploying `admin-users` and the front end to Maha's Supabase and Cloudflare is a separate step that needs the account owner.
