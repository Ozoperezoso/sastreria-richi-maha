import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { login } from './helpers.js';

test('admin sees the panel with money per period and overdue tickets', async ({ page }) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Panel' }).click();
  await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Este mes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Atrasados/ })).toBeVisible();
  await expect(page.locator('.money table').first()).toContainText('Alexander Rengifo');
});

test('admin exports the filtered tickets as a CSV for Excel', async ({ page }) => {
  await login(page, 'admin');
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

test('admin creates a user, who loses access once deactivated', async ({ page, browser }) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await page.getByLabel('Usuario', { exact: true }).fill('prueba');
  await page.getByLabel('Nombre completo').fill('Usuario Prueba');
  await page.getByLabel('Contraseña inicial').fill('secreta123');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Usuario Prueba' })).toBeVisible();

  const other = await browser.newContext({ ...test.info().project.use });
  const tailorPage = await other.newPage();
  await login(tailorPage, 'prueba', 'secreta123');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('listitem').filter({ hasText: 'Usuario Prueba' }).getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Usuario Prueba' })).toContainText('Inactivo');

  await tailorPage.reload();
  await expect(tailorPage.getByText('Usuario inactivo')).toBeVisible();
  await other.close();
});

test('admin sees the function error when the username exists', async ({ page }) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await page.getByLabel('Usuario', { exact: true }).fill('claudia');
  await page.getByLabel('Nombre completo').fill('Otra Claudia');
  await page.getByLabel('Contraseña inicial').fill('secreta123');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByText('Ese usuario ya existe')).toBeVisible();
});
