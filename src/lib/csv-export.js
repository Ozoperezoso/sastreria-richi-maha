// CSV backup/export for Excel in Spanish (Colombia): ';' separator, UTF-8 BOM, CRLF lines.
import { formatDate, statusLabel, locationLabel } from './format.js';

export const CSV_HEADER = [
  'Numero', 'Cliente', 'Telefono', 'Recibido', 'Entrega estimada', 'Entregado', 'Prendas', 'Arreglos',
  'Sastre', 'Estado', 'Ubicacion', 'Total', 'Abono', 'Saldo', 'Pagado', 'Garantia', 'Quien recogio', 'Notas',
];

const yesNo = (value) => (value ? 'Sí' : 'No');

function cell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** @param {object[]} rows  ticket_overview rows */
export function toCSV(rows) {
  const lines = rows.map((t) => [
    t.display_number, t.customer_name, t.customer_phone, formatDate(t.received_on), formatDate(t.due_on),
    formatDate(t.delivered_on), t.items_summary, t.fixes_summary, t.assigned_name, statusLabel(t.status),
    locationLabel(t.location), t.total, t.deposit, t.balance, yesNo(t.paid_in_full), yesNo(t.warranty),
    t.picked_up_by, t.notes,
  ].map(cell).join(';'));
  return `﻿${[CSV_HEADER.join(';'), ...lines].join('\r\n')}`;
}

export function downloadCSV(rows, filename) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
