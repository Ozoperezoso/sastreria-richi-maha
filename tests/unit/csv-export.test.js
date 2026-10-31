import { test, expect } from 'vitest';
import { toCSV, CSV_HEADER } from '../../src/lib/csv-export.js';

const row = (overrides = {}) => ({
  display_number: '2712', customer_name: 'José Muñoz', customer_phone: '3115550000',
  received_on: '2026-10-31', due_on: '2026-11-04', delivered_on: null,
  items_summary: 'Jean, Blusa', fixes_summary: 'Ruedo, Costados', assigned_name: 'Alexander Rengifo',
  status: 'en_proceso', location: null, total: 24000, deposit: 5000, balance: 19000,
  paid_in_full: false, warranty: false, picked_up_by: null, notes: null, ...overrides,
});

test('starts with a UTF-8 BOM so Excel shows accents', () => {
  expect(toCSV([]).startsWith('﻿')).toBe(true);
});

test('uses semicolons, which Spanish-locale Excel expects', () => {
  const [header] = toCSV([]).slice(1).split('\r\n');
  expect(header).toBe(CSV_HEADER.join(';'));
  expect(CSV_HEADER[0]).toBe('Numero');
  expect(CSV_HEADER).toContain('Sastre');
});

test('writes dates as d/mm/yyyy, money as plain integers and Spanish labels', () => {
  const line = toCSV([row()]).slice(1).split('\r\n')[1];
  expect(line).toBe(
    '2712;José Muñoz;3115550000;31/10/2026;4/11/2026;;Jean, Blusa;Ruedo, Costados;Alexander Rengifo;En proceso;;24000;5000;19000;No;No;;');
});

test('quotes fields containing separators, quotes or newlines', () => {
  const line = toCSV([row({ customer_name: 'Ana "La Costurera"; Pérez', notes: 'línea 1\nlínea 2' })]).slice(1);
  expect(line).toContain('"Ana ""La Costurera""; Pérez"');
  expect(line).toContain('"línea 1\nlínea 2"');
});

test('location and yes/no flags use readable labels', () => {
  const line = toCSV([row({ location: 'CAJON', paid_in_full: true, warranty: true, status: 'listo' })]).slice(1).split('\r\n')[1];
  expect(line.split(';').slice(9, 16)).toEqual(['Listo para entregar', 'Cajón', '24000', '5000', '19000', 'Sí', 'Sí']);
});
