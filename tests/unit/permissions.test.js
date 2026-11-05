import { test, expect } from 'vitest';
import { isAdmin, canEditCore, canDelete } from '../../src/lib/permissions.js';

const admin = { id: 'r', role: 'admin', active: true };
const alex = { id: 'a', role: 'tailor', active: true };
const claudia = { id: 'c', role: 'tailor', active: true };
const ticketOfAlex = { assigned_to: 'a' };

test('isAdmin is true only for admins', () => {
  expect(isAdmin(admin)).toBe(true);
  expect(isAdmin(alex)).toBe(false);
  expect(isAdmin(null)).toBe(false);
});

test('canEditCore: admin and the assigned tailor only', () => {
  expect(canEditCore(admin, ticketOfAlex)).toBe(true);
  expect(canEditCore(alex, ticketOfAlex)).toBe(true);
  expect(canEditCore(claudia, ticketOfAlex)).toBe(false);
});

test('canDelete: admin only', () => {
  expect(canDelete(admin)).toBe(true);
  expect(canDelete(alex)).toBe(false);
});
