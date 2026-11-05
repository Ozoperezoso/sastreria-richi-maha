import { describe, test, expect } from 'vitest';
import { daysBetween, weekdayShort, longDate, tapeMark } from '../../src/lib/format.js';

describe('daysBetween', () => {
  test('counts whole days, negative when the second date is earlier', () => {
    expect(daysBetween('2026-11-02', '2026-11-04')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-10-28')).toBe(-5);
    expect(daysBetween('2026-11-02', '2026-11-02')).toBe(0);
  });
  test('ignores the time part of timestamps', () => {
    expect(daysBetween('2026-10-29T21:15:00Z', '2026-11-02')).toBe(4);
  });
});

describe('Spanish dates', () => {
  test('short weekday and long date', () => {
    expect(weekdayShort('2026-11-04')).toBe('mié');
    expect(longDate('2026-11-02')).toBe('lunes 2 de noviembre');
  });
});

describe('tapeMark', () => {
  test('late, today, and upcoming with weekday', () => {
    expect(tapeMark(-5)).toEqual({ mark: '−5', unit: 'días' });
    expect(tapeMark(-1)).toEqual({ mark: '−1', unit: 'día' });
    expect(tapeMark(0)).toEqual({ mark: 'Hoy', unit: '' });
    expect(tapeMark(2, { iso: '2026-11-04' })).toEqual({ mark: '+2', unit: 'mié' });
  });
  test('days waiting on the shelf, and no date', () => {
    expect(tapeMark(4, { future: 'count' })).toEqual({ mark: '4', unit: 'días' });
    expect(tapeMark(null)).toEqual({ mark: '—', unit: 'sin fecha' });
  });
});

import { STALE_DAYS, readySince, isStale, dueText } from '../../src/lib/format.js';

describe('stale backlog', () => {
  const today = '2026-11-02';
  test('ready since: the last change, or the promised date for tickets imported from the sheet', () => {
    expect(readySince({ updated_at: '2026-10-30T10:00:00Z', legacy: null })).toBe('2026-10-30');
    expect(readySince({ updated_at: '2026-11-02T10:00:00Z', legacy: { Consecutivo: '30' }, due_on: '2026-05-01', received_on: '2026-04-20' })).toBe('2026-05-01');
    expect(readySince({ updated_at: '2026-11-02T10:00:00Z', legacy: {}, due_on: null, received_on: '2026-04-20' })).toBe('2026-04-20');
  });
  test(`more than ${STALE_DAYS} days late, or waiting on the shelf, goes to "Por revisar"`, () => {
    expect(isStale({ status: 'en_proceso', due_on: '2026-10-02' }, today)).toBe(true);
    expect(isStale({ status: 'en_proceso', due_on: '2026-10-03' }, today)).toBe(false);
    expect(isStale({ status: 'recibido', due_on: null }, today)).toBe(false);
    expect(isStale({ status: 'listo', due_on: '2026-05-01', legacy: {}, updated_at: '2026-11-02' }, today)).toBe(true);
    expect(isStale({ status: 'listo', due_on: '2026-05-01', legacy: null, updated_at: '2026-10-20' }, today)).toBe(false);
  });
});

describe('dueText', () => {
  test('says the promise in words, as on the tape', () => {
    expect(dueText(null)).toBe('Sin fecha de entrega');
    expect(dueText('2026-11-02', '2026-11-02')).toBe('Se entrega hoy');
    expect(dueText('2026-10-28', '2026-11-02')).toBe('Atrasado 5 días');
    expect(dueText('2026-11-01', '2026-11-02')).toBe('Atrasado 1 día');
    expect(dueText('2026-11-03', '2026-11-02')).toBe('Se entrega mañana');
    expect(dueText('2026-11-06', '2026-11-02')).toBe('Se entrega en 4 días, viernes 6 de noviembre');
  });
});
