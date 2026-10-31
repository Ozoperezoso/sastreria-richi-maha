import { expect } from '@playwright/test';

export async function login(page, username, password = 'test1234') {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

/** Fills garment line `index` (0-based) of the ticket form. */
export async function fillItem(page, index, { garment, fix, cost }) {
  await page.locator('input[name=garment]').nth(index).fill(garment);
  await page.locator('input[name=fix]').nth(index).fill(fix);
  if (cost !== undefined) await page.locator('input[name=cost]').nth(index).fill(cost);
}
