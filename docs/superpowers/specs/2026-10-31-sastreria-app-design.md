# Sastrería Richi-Maha — Design spec

Date: 2026-10-31 · Status: approved in conversation, pending written review

## 1. Purpose and success

A lightweight web app that replaces the shop's Google Form + Sheet for logging clothing repair jobs.

- **Users:** 1 admin (Rodrigo, supervises only) and 2 tailors (Alexander Rengifo, Claudia Alvarez). One shop.
- **Success:** every new job is logged in the app from the tailors' phones; the admin can see all work, money and overdue jobs; the full history from the sheet is in the app; running cost is $0/month.
- **Out of scope for now:** customer SMS/WhatsApp notifications, printed receipts, garment photos, offline mode, multiple shops.

## 2. Architecture

| Piece | Choice |
|---|---|
| Front end | Svelte + Vite single-page app, Spanish UI, mobile-first, bundled with no runtime CDN dependencies |
| Backend | Supabase (free plan, region us-east-1): Postgres, Auth, row-level security (RLS), one Edge Function |
| Hosting | Cloudflare Pages, free `*.pages.dev` address, auto-deploy on push to `main` |
| Code | Public GitHub repo `Ozoperezoso/sastreria-richi-maha` |
| Local dev | Supabase CLI local stack (Docker) for development and tests |

**Secrets:** the Supabase service-role key exists only in Supabase (for the Edge Function) and in a local untracked `.env` (for the importer). The browser uses only the publishable/anon key; security comes from RLS. Source CSVs and any exports are git-ignored, because the repo is public.

## 3. Data model

**profiles** (one row per auth user)
- `id` (= auth user id), `username` (unique), `full_name`, `role` (`admin` | `tailor`), `active` (bool).
- Auth email is synthetic: `<username>@sastreria.local`. Users never see it.

**customers**
- `id`, `name` (required), `phone` (optional), `created_at`.
- Search by name (case- and accent-insensitive) or phone.

**tickets**
- `id`
- `number` (int) and `suffix` (text, default `''`). Displayed as `number` or `number-suffix`; unique on (`number`, `suffix`). New tickets take `number` from a Postgres sequence starting after the highest imported number (2712) with `suffix` `''`. Suffixes exist only for imported duplicates.
- `customer_id`, `assigned_to` (profile id, a tailor)
- `received_on` (date), `due_on` (date, nullable), `delivered_on` (date, nullable)
- `status`: `recibido` | `en_proceso` | `listo` | `entregado` | `cancelado`
- `location` (nullable): `A` | `B` | `C` | `D` | `E` | `CAJON` | `BODEGA`
- `picked_up_by` (text, nullable)
- `deposit` (int COP, default 0), `paid_in_full` (bool), `warranty` (bool)
- `notes` (text)
- `created_by`, `created_at`, `updated_by`, `updated_at`
- `legacy` (jsonb, nullable): the original sheet row, for imported tickets.

**ticket_items**
- `id`, `ticket_id`, `garment` (free text), `fix` (free text), `notes`, `cost` (int COP), `position`.

**Derived values (a view or computed in queries)**
- `total` = sum of item costs (0 when `warranty`).
- `balance` = 0 when `paid_in_full`, otherwise `total − deposit`.
- `overdue` = `due_on < today` and status not in (`entregado`, `cancelado`).

**Status rules (enforced by trigger)**
- Moving to `listo` requires `location`.
- Moving to `entregado` sets `delivered_on = today` if empty; `picked_up_by` is optional.

## 4. Permissions (enforced in the database)

| Action | Admin | Assigned tailor | Other tailor |
|---|---|---|---|
| Read all tickets, items, customers, tailor names | ✅ | ✅ | ✅ |
| Create tickets and customers | ✅ | ✅ | ✅ |
| Edit items, prices, dates, assignment, notes, warranty, customer | ✅ | ✅ | ❌ |
| Change status, location, deposit, paid_in_full, picked_up_by | ✅ | ✅ | ✅ |
| Delete tickets | ✅ | ❌ | ❌ |
| Manage users, admin dashboard, CSV export | ✅ | ❌ | ❌ |

RLS handles row access. A `BEFORE UPDATE` trigger rejects changes to restricted columns when the editor is a tailor who isn't assigned to the ticket. Inactive users are blocked from all access.

**Edge Function `admin-users`** (callable only by an active admin): create user, reset password, activate or deactivate.

## 5. Screens (Spanish UI)

1. **Login:** username + password; the session persists on the device.
2. **Inicio:** "+ Nuevo arreglo"; one search box (ticket number, name, phone); filters Mis arreglos/Todos and status (default: not delivered or cancelled); sorted by `due_on`; overdue in red, due today highlighted. Cards show number, customer, garments, due date, status, tailor, balance.
3. **Nuevo arreglo:** customer typeahead (pick a match or create new); received (default today), due (blank), assigned tailor (default self); item lines with "+ Agregar prenda"; deposit; Garantía. After saving, the ticket number is shown in large digits.
4. **Detalle:** all fields; actions Empezar → Marcar listo (location picker) → Entregar (picked up by, mark paid, optional final cost update); Editar only when permitted; created/updated by.
5. **Admin · Panel:** money received this week and month, total and per tailor (deposits counted on `received_on`, remaining balances on `delivered_on`); counts by status; overdue list; warranty count per tailor.
6. **Admin · Todos los arreglos:** filters (tailor, status, date range), Exportar CSV, Eliminar with confirmation.
7. **Admin · Usuarios:** create, reset password, activate or deactivate.

## 6. Import from `Arreglos Modisteria - BD_Registros.csv`

A one-off Node script run locally with the service-role key. It has a dry-run mode that prints a summary, and a commit mode.

| Sheet column | App field |
|---|---|
| Consecutivo | `number` (+ `suffix` for duplicates) |
| Nombre Cliente, Telefono | customer (matched on normalized name + phone) |
| Fecha | `received_on` |
| Fecha Estimada de Entrega | `due_on` |
| Tipo de Prenda, Tipo de Arreglo | one item: `garment`, `fix` |
| Notas | `notes`; contains GARANTIA, GRANTIA or GRANTRIA → `warranty = true` |
| Realizado por | `assigned_to` |
| Fecha Real de entrega | `delivered_on` |
| Estado + delivery date | delivery date filled → `entregado`; else "Listo" → `listo`; else → `en_proceso` |
| Abono | `deposit` |
| Valor del Arreglo, Abono Final | item `cost` = max(Valor, Abono + Abono Final) |
| Saldo Pendiente | not stored; balance is recomputed (checked against the sheet in the dry run) |
| Quien Recogio? | `picked_up_by` ("No Registra" → null) |
| Ubicación de la Prenda | `location` ("-" → null) |
| Marca temporal | `created_at` |
| Valor Real Arreglo, mes, Valor Arreglo 2.0 | ignored (redundant or empty) |

- **Duplicates:** same number and same customer → merged into one ticket with several items. Different customers → the later row gets suffix `B`, `C`, and so on.
- **Fully paid:** imported delivered tickets with a computed balance ≤ 0 get `paid_in_full = true`.
- **Dates:** parsed as `d/mm/yyyy`; unparseable values are reported in the dry run, never guessed silently.
- **Sequence:** set to the maximum imported number + 1.

## 7. Testing

- **Database tests (local stack):** RLS and trigger behaviour per role, including a tailor deleting a ticket, changing restricted fields on the other tailor's ticket, inactive users, the `listo` rule requiring a location, and number uniqueness under concurrent inserts.
- **Importer unit tests (Vitest):** date and money parsing, negative balances, duplicate merging and suffixing, warranty detection, status mapping.
- **End-to-end tests (Playwright, phone viewport):** login; create a ticket with 2 items; start, mark ready with a location, deliver; a tailor's restricted edit attempt; the admin creating a user and exporting CSV.

## 8. Launch

1. Deploy, run the import dry run, review the summary with the admin, then import for real.
2. The admin sets passwords; tailors use the app alongside the form for 2–3 days.
3. Switch day: fresh export, re-run the import for rows newer than the last import, and retire the form.

**Operations:** weekly CSV export by the admin as a backup. Free-plan pause after 7 inactive days isn't expected with daily use; restore it from the Supabase dashboard if it happens.
