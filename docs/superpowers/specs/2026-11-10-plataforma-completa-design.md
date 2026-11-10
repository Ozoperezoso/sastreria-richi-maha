# Platform admin: consult, edit and delete shops — Design spec

Date: 2026-11-10 · Status: approved in conversation (approach A), pending written review

## 1. Purpose and success

El Sastre hosts several small tailoring shops. The platform user (`role = 'platform'`, Plataforma screen) already creates shops and switches them on and off. This change completes it so whoever runs El Sastre can support the shops.

- **Main use:** know which shops are active and in use; manage their users and passwords; help with resets.
- **Later, not now:** billing by usage, such as tickets per month or number of tailors. The numbers in this design are the ones that billing would need, but no billing is built.
- **Success:** from the Plataforma screen, the platform user can see every shop with its usage, open a shop to see its contact details, monthly tickets and all its users, edit the shop and its users, and delete a shop that was deactivated first.

**Privacy rule (unchanged):** the platform never sees customer names, phone numbers, ticket details or money. It only gets counts. The database enforces this, not the screen.

**Out of scope:**
- Money totals per shop. Dropped on purpose: billing by usage does not need them, and they are the most sensitive number about a business.
- Billing and invoices.
- Changing a shop's code (`slug`). The importer and the shop's identity depend on it.
- Usernames per shop. Today they are unique across the whole platform. That is a separate change, done right after this one.

## 2. Architecture (approach A)

| Need | Where it lives | Why |
|---|---|---|
| Usage numbers (reads) | New `SECURITY DEFINER` database functions, callable only when `is_platform_admin()` | Counts come from tables the platform cannot read; the function returns numbers only, so the privacy rule stays in the database |
| Contact details | New table `shop_contacts`, readable only by the platform | Shop users can read their own `shops` row, so private notes cannot live there |
| Edits, users, passwords, delete (writes) | New actions in the existing `admin-users` Edge Function (service role) | Same place that already creates shops and switches them; auth users can only be managed with the service role |
| Bulk delete of a shop's rows | New `SECURITY DEFINER` function, `service_role` only, called by the Edge Function | Deletes tickets and customers in one transaction |

Everything new goes in migration `0008_platform_admin.sql`. Migrations `0001`–`0007` are not edited (production exists).

## 3. Data

### 3.1 `shop_contacts` (new)

| Column | Type | Notes |
|---|---|---|
| `shop_id` | uuid, PK, references `shops (id)` on delete cascade | One row per shop, created on first save |
| `contact_name` | text, nullable | Owner or person to call |
| `contact_phone` | text, nullable | |
| `contact_email` | text, nullable | Free text, not validated beyond trimming |
| `notes` | text, nullable | Private notes of the platform about the shop |
| `updated_at` | timestamptz, default now() | |

RLS on, one policy: `select` to `authenticated` using `is_platform_admin()`. No write policies; writes go through `admin-users`.

### 3.2 `platform_shop_stats()` (new, read)

`returns table (...)`, `language sql stable security definer set search_path = ''`. Raises `'Solo la plataforma'` unless `public.is_platform_admin()`. Granted to `authenticated` only.

One row per shop:

| Column | Meaning |
|---|---|
| `shop_id` | |
| `users_total` | All profiles of the shop |
| `users_active` | Active profiles |
| `tailors_active` | Active profiles with role `tailor` (a likely billing unit) |
| `tickets_total` | All tickets of the shop |
| `customers_total` | All customers of the shop (a count only; used by the delete dialog) |
| `tickets_this_month` | Tickets whose `received_on` falls in the current month in Bogotá time (`today_bogota()`) |
| `months` | `jsonb` array of the last 6 months, oldest first: `[{"month": "2026-06", "tickets": 120}, …]`, months without tickets included as 0 |
| `last_activity_at` | The latest of: any ticket's `updated_at`, and any of its users' `auth.users.last_sign_in_at`. Null if neither exists |

Months are counted by `received_on`, not `created_at`, so imported history lands in its real month instead of the import day.

### 3.3 `platform_shop_users(p_shop uuid)` (new, read)

Same guard as above. Returns every profile of that shop: `id, username, full_name, role, active, created_at, last_sign_in_at` (from `auth.users`). This adds the last sign-in, which `profiles` alone cannot give.

### 3.4 `delete_shop_data(p_shop uuid)` (new, service role only)

`security definer`, `revoke execute … from public, anon, authenticated; grant … to service_role`.

1. Raises if the shop does not exist or is still active.
2. Deletes the shop's tickets (`ticket_items` go with them by cascade), then its customers.
3. Returns the ids of the shop's profiles, so the Edge Function can delete their auth users.

It is safe to call twice: a second run finds nothing to delete and returns the remaining profile ids.

## 4. Edge Function `admin-users`: new and changed actions

All platform actions check `isPlatform` first and answer `403 'Solo la plataforma'` otherwise. Errors are in Spanish and say how to fix the input.

| Action | Who | Body | Behaviour |
|---|---|---|---|
| `update_shop` | platform | `shop_id, name, city?, contact_name?, contact_phone?, contact_email?, notes?` | Updates `shops.name`, `shops.city`; upserts `shop_contacts`. Empty strings become null. Name is required. `slug` is ignored if sent |
| `create` | shop admin (unchanged) **or platform** | as today, plus `shop_id` when the caller is the platform | The platform can add a user (admin or tailor) to any shop. A shop admin still only adds to their own shop, and a `shop_id` they send is ignored |
| `set_active` | shop admin (unchanged) **or platform** | `user_id, active` | Same checks as today (`manageableUser`); the platform may target any non-platform user |
| `rename_user` | shop admin or platform | `user_id, full_name` | Updates `profiles.full_name`. Same `manageableUser` check. The username does not change |
| `reset_password` | unchanged | | |
| `delete_shop` | platform | `shop_id, confirm_name` | See below |

**`delete_shop`:**
1. Load the shop. If not found: `400 'Sastrería no encontrada'`.
2. If active: `400 'Primero desactiva la sastrería'`.
3. If `confirm_name.trim()` is not exactly `shop.name`: `400 'El nombre no coincide'`.
4. Call `delete_shop_data(shop_id)`, then delete each returned auth user (`profiles` go by cascade), then delete the `shops` row (`shop_contacts` go by cascade).
5. If any auth user fails to delete, stop and answer `500 'No se pudo borrar todo; intenta otra vez'`. Running the action again finishes the job, because every step is safe to repeat.

## 5. Screens

Both screens are only for the platform user; the router sends anyone else to their own start page.

### 5.1 Plataforma (list), `#/`

- Totals at the top: active shops, tickets this month across all shops.
- One row per shop: name and city, active or deactivated, active tailors / users, tickets this month, last activity ("hace 3 días", or "Sin uso" when null), created date. Tapping a row opens the shop page.
- "Nueva sastrería" form stays as it is today.

### 5.2 Shop page, `#/plataforma/<shop id>` (new)

- **Header:** name, city, code, status, created date. Buttons: Editar, Desactivar / Activar. The Desactivar dialog reminds that the shop's users lose access at once, so its admin should export the CSV first.
- **Uso:** tickets this month, total tickets, active tailors, last activity, and a simple bar row of the last 6 months of tickets.
- **Contacto:** contact name, phone (tap to call), email, notes. Empty fields say "Sin dato".
- **Usuarios:** every user with name, username, role, active or not, last sign-in. Per user: Cambiar nombre, Cambiar contraseña, Desactivar / Activar. A "Nuevo usuario" button with the same fields as the shop admin's form.
- **Editar** opens a dialog with name, city and the contact fields. The code is shown but cannot be changed.
- **Eliminar sastrería** sits at the bottom in a danger zone. It is only enabled while the shop is deactivated; otherwise it explains "Desactívala primero". The dialog says what will be erased, with counts ("2.690 arreglos, 2.139 clientes, 5 usuarios"), asks to type the exact shop name, and keeps the button disabled until the name matches. After deleting, it returns to the list with a toast.

Both screens follow `docs/UI-BRIEF.md` (paño green, Archivo, 44–54 px targets, loading/empty/error states) and work on phone and computer.

## 6. Testing

- **pgTAP:**
  - `platform_shop_stats` and `platform_shop_users` raise for a shop admin, a tailor and anon, and work for the platform.
  - The counts are right for the seed shops, including a month with 0 tickets.
  - Neither function returns customer or ticket text columns.
  - `shop_contacts` is invisible to shop users.
  - `delete_shop_data` cannot be executed by `authenticated`, refuses an active shop, and leaves the other shop's rows untouched.
- **Integration (`admin-users`):**
  - `update_shop` works for the platform and is refused for a shop admin.
  - The platform can create a user in another shop; a shop admin's `shop_id` is ignored.
  - `rename_user` works and is limited to the caller's shop for a shop admin.
  - `delete_shop` refuses an active shop and a wrong name. On a deactivated shop it removes the tickets, customers, profiles, auth users, contacts and the shop row, and the other shop is unchanged.
- **End to end (phone size):**
  - The platform opens a shop, edits its contact details, adds a tailor and resets a password.
  - The platform deactivates and then deletes a test shop by typing its name.
  - A shop admin is sent away from `#/plataforma/<id>`.

## 7. Decisions

- Money totals are not shown to the platform (see section 1).
- Platform notes live in `shop_contacts`, not in `shops`, because shop users can read their own `shops` row.
- Months are counted by `received_on`.
- Deleting is permanent; there is no recycle bin. The two steps (deactivate, then type the name) are the protection. A deactivated shop's users cannot sign in, so a shop that wants its data must export the CSV from Todos los arreglos **before** it is deactivated. The Desactivar dialog says so.
