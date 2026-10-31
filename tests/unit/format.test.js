import { describe, test, expect } from 'vitest';
import {
  formatCOP, parseCOPInput, formatDate, displayNumber, statusLabel, locationLabel, todayISO,
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
