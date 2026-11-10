import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Tests run in order (workers: 1) and the DB is reset once per run: the ones that read the seed
// counts go first, the one that creates a shop goes last.

const LA_UNION_ID = '00000000-0000-0000-0000-00000000a001';

const shopRow = (page, name) => page.getByRole('link').filter({ hasText: name });

test('the platform sees each shop with its usage', async ({ page }) => {
  await login(page, 'plataforma');
  await expect(page.getByText('2 activas')).toBeVisible();
  const row = shopRow(page, 'Sastrería La Unión');
  await expect(row).toContainText('2 sastres');
  await expect(row).toContainText(/hoy|ayer|hace \d+ (días|mes|meses)/);
});

test('the platform opens a shop and edits its contact details', async ({ page }) => {
  await login(page, 'plataforma');
  await shopRow(page, 'Sastrería La Unión').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sastrería La Unión' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Contacto' })).toContainText('Sin dato');

  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Teléfono').fill('3001234567');
  await dialog.getByLabel('Notas').fill('Paga el 5');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toBeHidden();

  const contact = page.getByRole('region', { name: 'Contacto' });
  await expect(contact).toContainText('3001234567');
  await expect(contact).toContainText('Paga el 5');
  await expect(contact.getByRole('link', { name: '3001234567' })).toHaveAttribute('href', 'tel:3001234567');

  await page.reload();
  await expect(contact).toContainText('3001234567');
  await expect(contact).toContainText('Paga el 5');
  await expect(page.getByRole('heading', { level: 1, name: 'Sastrería La Unión' })).toBeVisible();
});

test('the platform adds a tailor and resets a password', async ({ page }) => {
  await login(page, 'plataforma');
  await shopRow(page, 'Sastrería La Unión').click();
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Usuario', { exact: true }).fill('sastre_e2e');
  await dialog.getByLabel('Nombre completo').fill('Sastre Prueba');
  await dialog.getByLabel('Rol').selectOption({ label: 'Sastre' });
  await dialog.getByLabel('Contraseña inicial').fill('secreta123');
  await dialog.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole('listitem').filter({ hasText: 'Sastre Prueba' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('sastre_e2e');
  await expect(row).toContainText('Nunca ha entrado');

  await row.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await page.getByRole('dialog').getByLabel('Contraseña nueva').fill('otraclave123');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('Contraseña de sastre_e2e cambiada.')).toBeVisible();
});

test('a shop admin is sent away from a shop page', async ({ page }) => {
  await login(page, 'admin');
  await page.goto(`/#/plataforma/${LA_UNION_ID}`);
  await expect(page).toHaveURL(/#\/$/);
});

test('a shop that no longer exists says so', async ({ page }) => {
  await login(page, 'plataforma');
  await page.goto('/#/plataforma/00000000-0000-0000-0000-0000000000ff');
  await expect(page.getByText('Esta sastrería ya no existe.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Volver a la lista de sastrerías' })).toBeVisible();
});

test('delete is disabled while the shop is active', async ({ page }) => {
  await login(page, 'plataforma');
  await page.goto(`/#/plataforma/${LA_UNION_ID}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Sastrería La Unión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eliminar sastrería' })).toBeDisabled();
  await expect(page.getByText('Desactívala primero')).toBeVisible();
});

test('a shop with no usage shows Sin uso and empty bars', async ({ page }) => {
  await login(page, 'plataforma');
  await page.getByLabel('Nombre', { exact: true }).fill('Sastrería Vacía');
  await page.getByLabel('Nombre completo').fill('Admin Vacía');
  await page.getByLabel(/^Usuario/).fill('admin_vacia');
  await page.getByLabel('Contraseña inicial').fill('secreta123');
  await page.getByRole('button', { name: 'Crear sastrería' }).click();

  const row = shopRow(page, 'Sastrería Vacía');
  await expect(row).toContainText('Sin uso');
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sastrería Vacía' })).toBeVisible();
  const bars = page.getByRole('list', { name: 'Arreglos por mes' });
  await expect(bars.getByRole('listitem')).toHaveCount(6);
  await expect(bars.locator('.count')).toHaveText(['0', '0', '0', '0', '0', '0']);
});

test('the platform deactivates and deletes a shop by typing its name', async ({ page }) => {
  await login(page, 'plataforma');
  await page.getByLabel('Nombre', { exact: true }).fill('Sastrería Para Borrar');
  await page.getByLabel('Nombre completo').fill('Admin Borrar');
  await page.getByLabel(/^Usuario/).fill('admin_borrar');
  await page.getByLabel('Contraseña inicial').fill('secreta123');
  await page.getByRole('button', { name: 'Crear sastrería' }).click();
  await shopRow(page, 'Sastrería Para Borrar').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sastrería Para Borrar' })).toBeVisible();

  await page.getByRole('button', { name: 'Desactivar', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desactivar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'Eliminar sastrería' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Se borrarán para siempre 0 arreglos, 0 clientes y 1 usuario.');
  const confirm = dialog.getByRole('button', { name: 'Eliminar Sastrería Para Borrar' });
  await dialog.getByLabel('Nombre de la sastrería').fill('sastrería para borrar');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Nombre de la sastrería').fill('Sastrería Para Borrar');
  await confirm.click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText('Sastrería Para Borrar eliminada.')).toBeVisible();
  await expect(shopRow(page, 'Sastrería Para Borrar')).toHaveCount(0);
});
