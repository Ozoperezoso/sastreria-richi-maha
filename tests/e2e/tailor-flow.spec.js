import { test, expect } from '@playwright/test';
import { login, fillItem } from './helpers.js';

test('tailor creates a ticket for a new customer with two garments', async ({ page }) => {
  await login(page, 'alexander');
  await page.getByRole('link', { name: '+ Nuevo arreglo' }).click();

  await page.getByLabel('Cliente').fill('José Muñoz');
  await page.getByRole('button', { name: /Nuevo cliente/ }).click();
  await page.getByLabel('Teléfono (opcional)').fill('311 555 0000');

  await fillItem(page, 0, { garment: 'Jean', fix: 'Ruedo', cost: '10.000' });
  await page.getByRole('button', { name: '+ Agregar prenda' }).click();
  await fillItem(page, 1, { garment: 'Blusa', fix: 'Costados', cost: '14000' });
  await page.getByLabel('Abono').fill('5.000');
  await expect(page.locator('.money')).toContainText('$24.000');
  await expect(page.locator('.money')).toContainText('$19.000');

  await page.getByRole('button', { name: 'Guardar arreglo' }).click();
  await expect(page.getByText('Arreglo guardado')).toBeVisible();
  await expect(page.locator('.bignumber .num')).toHaveText(/^\d+$/);
  await expect(page.getByText('Total $24.000, saldo $19.000')).toBeVisible();
});

test('a returning customer is found without typing accents', async ({ page }) => {
  await login(page, 'claudia');
  await page.goto('/#/nuevo');
  await page.getByLabel('Cliente').fill('maria munoz');
  await page.getByRole('button', { name: /MARÍA MUÑOZ/ }).click();
  await expect(page.locator('.chosen')).toContainText('3112345678');
});

test('a due date before the received date shows a warning', async ({ page }) => {
  await login(page, 'alexander');
  await page.goto('/#/nuevo');
  await page.getByLabel('Recibido').fill('2026-10-31');
  await page.getByLabel('Entrega estimada').fill('2026-10-30');
  await expect(page.getByText('La fecha de entrega es anterior a la de recibido')).toBeVisible();
});

test('saving with missing data points at the fields to fix', async ({ page }) => {
  await login(page, 'alexander');
  await page.goto('/#/nuevo');
  await page.getByRole('button', { name: 'Guardar arreglo' }).click();
  await expect(page.getByText('Elige o escribe el cliente')).toBeVisible();
  await expect(page.getByText('Escribe la prenda')).toBeVisible();
});

test('tailor takes a ticket from received to delivered', async ({ page }) => {
  await login(page, 'claudia');
  await page.locator('a.tag', { hasText: 'LAURA CIRO' }).click();
  await expect(page.getByRole('heading', { name: 'LAURA CIRO' })).toBeVisible();

  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.head')).toContainText('En proceso');

  await page.getByRole('button', { name: 'Marcar listo' }).click();
  await page.getByRole('radio', { name: 'B', exact: true }).check();
  await page.getByRole('button', { name: 'Guardar ubicación' }).click();
  await expect(page.locator('.head')).toContainText('Listo para entregar');
  await expect(page.getByText('Ubicación B')).toBeVisible();

  await page.getByRole('button', { name: 'Entregar' }).click();
  await page.getByLabel('¿Quién recogió? (opcional)').fill('Laura');
  await page.getByLabel('Valor final').fill('15.000');
  await expect(page.locator('dialog[open]').getByLabel('Pagado completo')).toBeChecked();
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();

  await expect(page.locator('.head')).toContainText('Entregado');
  await expect(page.getByText('Recogió Laura')).toBeVisible();
  await expect(page.locator('.money')).toContainText('$15.000');
  await expect(page.locator('.money')).toContainText('Pagado');
});
