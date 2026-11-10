import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { signedIn, serviceClient } from './env.js';

const LA_UNION = '00000000-0000-0000-0000-00000000a001';
const PREFIX = 'prueba-borrar-';

async function call(client, body) {
  const { data, error } = await client.functions.invoke('admin-users', { body });
  if (!error) return { status: 200, body: data };
  const res = error.context;
  return { status: res?.status, body: res ? await res.json() : null };
}

/** Creates a shop with an admin, one customer, one ticket and one item. Names are fake. */
async function throwawayShop(platform, slug) {
  const username = 'adm_' + slug.replaceAll('-', '_');
  const res = await call(platform, {
    action: 'create_shop', name: `Sastrería ${slug}`, slug,
    admin_username: username, admin_full_name: 'Admin Prueba', admin_password: 'secreta123',
  });
  expect(res.status).toBe(200);
  const { shop_id: shopId, user_id: adminId } = res.body;

  const service = serviceClient();
  const { data: customer } = await service.from('customers')
    .insert({ shop_id: shopId, name: 'CLIENTE PRUEBA', phone: '3000000000' }).select('id').single();
  const { data: ticket } = await service.from('tickets').insert({
    shop_id: shopId, number: 1, customer_id: customer.id, assigned_to: adminId,
    received_on: new Date().toISOString().slice(0, 10), status: 'recibido',
  }).select('id').single();
  await service.from('ticket_items').insert({ ticket_id: ticket.id, garment: 'Jean', fix: 'Ruedo', cost: 1000 });
  await service.from('shop_contacts').insert({ shop_id: shopId, contact_name: 'Contacto Prueba' });
  return { shopId, adminId };
}

const countOf = async (table, shopId) => {
  const { count } = await serviceClient().from(table).select('*', { count: 'exact', head: true }).eq('shop_id', shopId);
  return count;
};

describe('platform shop deletion', () => {
  let platform;
  let n = 0;
  const nextSlug = () => `${PREFIX}${++n}`;

  async function cleanup() {
    const service = serviceClient();
    const { data: shops } = await service.from('shops').select('id, slug').like('slug', `${PREFIX}%`);
    for (const shop of shops ?? []) {
      // The function refuses an active shop, so leftovers are deactivated first.
      await service.from('shops').update({ active: false }).eq('id', shop.id);
      const { data: profileIds } = await service.rpc('delete_shop_data', { p_shop: shop.id });
      for (const id of profileIds ?? []) await service.auth.admin.deleteUser(id);
      await service.from('shops').delete().eq('id', shop.id);
    }
  }

  beforeAll(async () => {
    platform = await signedIn('plataforma');
    await cleanup();
  });
  afterAll(cleanup);

  test('delete_shop refuses an active shop', async () => {
    const { shopId } = await throwawayShop(platform, nextSlug());
    const res = await call(platform, { action: 'delete_shop', shop_id: shopId, confirm_name: 'x' });
    expect(res).toEqual({ status: 400, body: { error: 'Primero desactiva la sastrería' } });
  });

  test('delete_shop refuses a missing shop', async () => {
    const res = await call(platform, {
      action: 'delete_shop', shop_id: '00000000-0000-0000-0000-0000000000ff', confirm_name: 'x',
    });
    expect(res).toEqual({ status: 400, body: { error: 'Sastrería no encontrada' } });
  });

  test('delete_shop refuses a wrong name', async () => {
    const slug = nextSlug();
    const { shopId } = await throwawayShop(platform, slug);
    await call(platform, { action: 'set_shop_active', shop_id: shopId, active: false });
    const res = await call(platform, {
      action: 'delete_shop', shop_id: shopId, confirm_name: `sastrería ${slug}`,
    });
    expect(res).toEqual({ status: 400, body: { error: 'El nombre no coincide' } });
    expect(await countOf('tickets', shopId)).toBe(1);
  });

  test('delete_shop accepts the name with spaces around it', async () => {
    const slug = nextSlug();
    const { shopId } = await throwawayShop(platform, slug);
    await call(platform, { action: 'set_shop_active', shop_id: shopId, active: false });
    const res = await call(platform, {
      action: 'delete_shop', shop_id: shopId, confirm_name: `  Sastrería ${slug}  `,
    });
    expect(res).toEqual({ status: 200, body: { ok: true } });
  });

  test('delete_shop erases tickets, customers, users, logins and contacts, and nothing else', async () => {
    const slug = nextSlug();
    const { shopId, adminId } = await throwawayShop(platform, slug);
    const before = {
      tickets: await countOf('tickets', LA_UNION),
      customers: await countOf('customers', LA_UNION),
      profiles: await countOf('profiles', LA_UNION),
    };
    await call(platform, { action: 'set_shop_active', shop_id: shopId, active: false });
    const res = await call(platform, { action: 'delete_shop', shop_id: shopId, confirm_name: `Sastrería ${slug}` });
    expect(res).toEqual({ status: 200, body: { ok: true } });

    const service = serviceClient();
    const { data: shop } = await service.from('shops').select('id').eq('id', shopId).maybeSingle();
    expect(shop).toBeNull();
    for (const table of ['tickets', 'customers', 'profiles', 'shop_contacts']) {
      expect(await countOf(table, shopId)).toBe(0);
    }
    const { error } = await service.auth.admin.getUserById(adminId);
    expect(error).not.toBeNull();
    expect({
      tickets: await countOf('tickets', LA_UNION),
      customers: await countOf('customers', LA_UNION),
      profiles: await countOf('profiles', LA_UNION),
    }).toEqual(before);
  });

  test('a shop admin cannot delete shops', async () => {
    const res = await call(await signedIn('admin'), {
      action: 'delete_shop', shop_id: LA_UNION, confirm_name: 'Sastrería La Unión',
    });
    expect(res).toEqual({ status: 403, body: { error: 'Solo la plataforma' } });
  });
});
