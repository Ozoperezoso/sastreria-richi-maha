import { describe, test, expect } from 'vitest';
import {
  formatCOP, parseCOPInput, formatDate, displayNumber, statusLabel, locationLabel, todayISO, relativeDays,
} from '../../src/lib/format.js';

describe('formatCOP', () => {
  test('uses dot thousands separators and no decimals', () => {
    expect(formatCOP(24000)).toBe('$24.000');
    expect(formatCOP(1250000)).toBe('$1.250.000');
    expect(formatCOP(0)).toBe('$0');
  });
  test('shows negatives with a leading minus', () => {
    expect(formatCOP(-6000)).toBe('-$6.000');
  });
});

describe('parseCOPInput', () => {
  test('accepts dots, a dollar sign, spaces or plain digits', () => {
    expect(parseCOPInput('10.000')).toBe(10000);
    expect(parseCOPInput('$10.000')).toBe(10000);
    expect(parseCOPInput(' 10000 ')).toBe(10000);
  });
  test('treats an empty field as zero', () => {
    expect(parseCOPInput('')).toBe(0);
  });
  test('rejects decimals and letters', () => {
    expect(() => parseCOPInput('10,5')).toThrow('Valor inválido');
    expect(() => parseCOPInput('abc')).toThrow('Valor inválido');
    expect(() => parseCOPInput('-5000')).toThrow('Valor inválido');
  });
});

describe('dates and labels', () => {
  test('formatDate shows d/mm/yyyy like the sheet', () => {
    expect(formatDate('2026-10-31')).toBe('31/10/2026');
    expect(formatDate('2026-04-09')).toBe('9/04/2026');
    expect(formatDate(null)).toBe('');
  });
  test('todayISO uses Bogota time', () => {
    // 2026-11-01 03:00 UTC is still Oct 31 in Bogota (UTC-5)
    expect(todayISO(new Date('2026-11-01T03:00:00Z'))).toBe('2026-10-31');
  });
  test('displayNumber appends the suffix only when present', () => {
    expect(displayNumber({ number: 136, suffix: 'B' })).toBe('136-B');
    expect(displayNumber({ number: 2712, suffix: '' })).toBe('2712');
  });
  test('status and location labels are Spanish', () => {
    expect(statusLabel('listo')).toBe('Listo para entregar');
    expect(statusLabel('en_proceso')).toBe('En proceso');
    expect(locationLabel('CAJON')).toBe('Cajón');
    expect(locationLabel('B')).toBe('B');
  });
});

import { startOfWeek, startOfMonth } from '../../src/lib/format.js';

describe('period starts', () => {
  test('weeks start on Monday', () => {
    expect(startOfWeek('2026-10-31')).toBe('2026-10-26'); // Saturday → Monday
    expect(startOfWeek('2026-10-26')).toBe('2026-10-26'); // Monday stays
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the week that started Monday
  });
  test('months start on the 1st', () => {
    expect(startOfMonth('2026-10-31')).toBe('2026-10-01');
  });
});

describe('relativeDays', () => {
  const now = new Date('2026-11-10T20:00:00Z');
  test('null means never used', () => {
    expect(relativeDays(null)).toBe('Sin uso');
  });
  test('today, yesterday and days', () => {
    expect(relativeDays('2026-11-10T15:00:00Z', now)).toBe('hoy');
    expect(relativeDays('2026-11-09T15:00:00Z', now)).toBe('ayer');
    expect(relativeDays('2026-11-07T15:00:00Z', now)).toBe('hace 3 días');
  });
  test('30 days or more counts in months', () => {
    expect(relativeDays('2026-08-01T15:00:00Z', now)).toBe('hace 3 meses');
    expect(relativeDays('2026-10-11T15:00:00Z', now)).toBe('hace 1 mes');
  });
  test('compares Bogotá calendar days', () => {
    expect(relativeDays('2026-11-10T15:00:00Z', new Date('2026-11-11T03:00:00Z'))).toBe('hoy');
  });
});
