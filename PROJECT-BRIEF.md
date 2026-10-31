# Sastrería Richi-Maha — Project brief

Status: **on hold** (decisions captured 2026-10-31). Nothing built yet.

## Goal
Lightweight web app for a single tailor shop: tailors log incoming repair jobs from their phones; one admin supervises.

## Users
- 1 admin (supervises only, does not take jobs). Creates tailor accounts (username + password).
- 2 tailors. Mostly on their own phones; a shared PC is used by logging out/in.

## Stack (planned)
- Supabase free plan: Postgres, auth, row-level security.
- Static front end, mobile-first, hosted on Netlify or Cloudflare Pages (free).
- Public GitHub repo under github.com/Ozoperezoso (no secrets or customer data in the repo).
- Expected cost: $0/month (optional domain ~US$12/year).
- UI language: Spanish only. Currency: Colombian pesos (COP).

## Data
**Customer:** name, phone (phone optional: historic data has gaps). Search returning customers by name or phone.

**Ticket** (one per drop-off, can hold several garments):
- Ticket number: sequential and shared across the shop; continue from the current shop-wide last number.
- Customer, date received, estimated return date, actual delivery date.
- Assigned tailor: picked from the tailor list by whoever receives the garment.
- Status: Recibido → En proceso → Listo para entregar → Entregado, plus Cancelado.
- Payment: total (sum of line costs), deposit (anticipo), balance (saldo), "pagado completo".

**Garment line:** garment (free text), type of fix (free text), notes, cost.

## Permissions
- Tailors: create, edit and update any ticket. Can see the full job list and who each job is assigned to. Cannot delete. Cannot see admin totals.
- Admin: everything, including deleting tickets and managing users.

## Admin screen
All tickets with filters (tailor, status, dates); money totals per week/month and per tailor; overdue list; CSV/Excel export (backup, since the free plan has no automatic backups).

## Out of scope for now
Customer SMS/WhatsApp notifications (future), garment photos, offline mode.

## Import of existing logs
Source: Google Forms/Sheets export, e.g. `Arreglos Modisteria - Pendientes Alex.csv` (Alexander Rengifo's pending jobs; ticket numbers 21–2711).

Columns: N° Arreglo, Marca temporal, Nombre Cliente, Telefono, Fecha Ingreso, Fecha Estimada de Entrega, Tipo de Prenda, Tipo de Arreglo, Notas, Fecha Real de entrega, Realizado por, Saldo Pendiente, Estado.

Open questions before importing are listed in the conversation and below.

## Decisions (2026-10-31, resumed)
- Hosting: Cloudflare Pages, free `*.pages.dev` address. Netlify dropped.
- Import: pending **and** delivered history, from all sheets (user will add the CSVs to this folder). Ticket numbering continues from the highest number found.
- Estado mapping: "Listo" → Listo para entregar; "-" → En proceso. Overdue "-" rows are genuinely pending (tailor behind schedule): import as-is.
- "Saldo Pendiente" = balance owed. Negative = customer overpaid. Blank = unknown.
- Tailors: full edit on their own tickets; on the other tailor's tickets only status and payment.
- Receipt: none. The app shows the ticket number prominently; the tailor writes it on paper.
- Payments: one deposit (anticipo) field; balance = total − anticipo; "Pagado completo" checkbox.
- Phone: optional.
- Estimated return date: blank by default; the tailor picks it.

- Front end: Svelte + Vite (approach A), bundled with no runtime CDN dependencies.
- People: tailors Alexander Rengifo and Claudia Alvarez; admin Rodrigo.
- Storage location (A, B, C, D, E, Cajón, Bodega): required when marking "Listo para entregar".
- "Quién recogió": optional text when marking "Entregado".
- Price changes: the tailor can update the cost at pickup. On import, price = max(recorded price, deposit + final payment).
- Warranty: a "Garantía" checkbox per ticket (cost $0); the admin sees a count per tailor.

## Source data (findings 2026-10-31)
`Arreglos Modisteria - BD_Registros.csv` is the master: 2,698 rows, tickets 20–2711. The "Pendientes" sheets are filtered views of it, so import from BD_Registros only.

- Realizado por: Alexander Rengifo 1,987, Claudia Alvarez 711.
- Estado is only "Listo" or "-"; delivery is known from "Fecha Real de entrega" (2,352 filled).
  Mapping: delivery date filled → Entregado; else "Listo" → Listo para entregar; else → En proceso.
- Money: Saldo = Valor del Arreglo − Abono − Abono Final (holds for every row with all values). Valor is blank in 1,268 rows where Abono Final is filled. Valor Real Arreglo and Valor Arreglo 2.0 are redundant or empty. "mes" is derived.
- Ubicación de la Prenda: A–E, CAJON, BODEGA, or "-" (not ready).
- Quien Recogio?: free text; "No Registra" = unknown.
- Notas: almost empty; "GARANTIA" and its misspellings (GRANTIA, GRANTRIA) → Garantía flag.
- Garments are comma-joined text in one cell → import as one garment line per ticket.
- Duplicate numbers: 136 (×3), 137 (×4), 1191 (×2). Same number + same customer → merge into one ticket; different customers → keep the number with a suffix (136-B…).
- Phone missing in 269 rows; several numbers have fewer than 10 digits. Import as-is.
