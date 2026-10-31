import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { login } from './helpers.js';

test('admin sees the panel with money per period and overdue tickets', async ({ page }) => {
  await login(page, 'rodrigo');
  await page.getByRole('link', { name: 'Panel' }).click();
  await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Este mes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Atrasados/ })).toBeVisible();
  await expect(page.locator('.money table').first()).toContainText('Alexander Rengifo');
});

test('admin exports the filtered tickets as a CSV for Excel', async ({ page }) => {
  await login(page, 'rodrigo');
  await page.getByRole('link', { name: 'Todos los arreglos' }).click();
  await expect(page.locator('a.tag').first()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^arreglos-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text.startsWith('﻿Numero;Cliente;')).toBe(true);
  expect(text).toContain('MARÍA MUÑOZ');
});
