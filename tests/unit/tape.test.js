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
