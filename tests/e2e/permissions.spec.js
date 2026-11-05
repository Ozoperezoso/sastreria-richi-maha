import { test, expect } from '@playwright/test';
import { login, seedTicket } from './helpers.js';

test('other tailor can change status but not edit or delete', async ({ page }) => {
  await login(page, 'claudia');
  await page.getByRole('button', { name: 'Todos' }).click();
  await page.locator('a.tag', { hasText: 'MARÍA MUÑOZ' }).click();
  await expect(page.getByRole('heading', { name: 'MARÍA MUÑOZ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Marcar listo' }).click();
  await page.getByRole('radio', { name: 'A', exact: true }).check();
  await page.getByRole('button', { name: 'Guardar ubicación' }).click();
  await expect(page.locator('.head')).toContainText('Listo para entregar');
});

test('tailors see no admin links and are sent away from admin pages', async ({ page }) => {
  await login(page, 'claudia');
  await expect(page.getByRole('navigation', { name: 'Administración' })).toHaveCount(0);
  await page.goto('/#/admin');
  await expect(page).toHaveURL(/#\/$/);
});

test('assigned tailor edits dates and garments', async ({ page }) => {
  await login(page, 'alexander');
  // Opened directly: the test above marks this ticket ready, which moves it to the "Por entregar" tab.
  await page.goto('/#/arreglo/aaaaaaaa-0000-0000-0000-000000000001');
  await expect(page.getByRole('heading', { name: 'MARÍA MUÑOZ' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('button', { name: '+ Agregar prenda' }).click();
  await page.locator('input[name=garment]').nth(2).fill('Falda');
  await page.locator('input[name=fix]').nth(2).fill('Ruedo');
  await page.locator('input[name=cost]').nth(2).fill('6.000');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('.items')).toContainText('Falda');
  await expect(page.locator('.money')).toContainText('$30.000');
});

test('admin can delete a ticket', async ({ page }) => {
  const id = await seedTicket('PARA BORRAR');
  await login(page, 'admin');
  await page.goto(`/#/arreglo/${id}`);
  await expect(page.getByRole('heading', { name: 'PARA BORRAR' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goto(`/#/arreglo/${id}`);
  await expect(page.getByText('Este arreglo no existe o fue eliminado.')).toBeVisible();
});
