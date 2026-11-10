import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { signedIn, serviceClient, deleteUserByUsername } from './env.js';

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

  test('delete_shop accepts the confirmation name in decomposed unicode form', async () => {
    const slug = nextSlug();
    const { shopId } = await throwawayShop(platform, slug);
    await call(platform, { action: 'set_shop_active', shop_id: shopId, active: false });
    const name = `Sastrería ${slug}`;
    expect(name.normalize('NFD')).not.toBe(name);
    const res = await call(platform, { action: 'delete_shop', shop_id: shopId, confirm_name: name.normalize('NFD') });
    expect(res).toEqual({ status: 200, body: { ok: true } });
  });

  test('a shop admin cannot delete shops', async () => {
    const res = await call(await signedIn('admin'), {
      action: 'delete_shop', shop_id: LA_UNION, confirm_name: 'Sastrería La Unión',
    });
    expect(res).toEqual({ status: 403, body: { error: 'Solo la plataforma' } });
  });
});

describe('platform edits shops and manages their users', () => {
  let platform;
  let n = 10; // distinct from the deletion tests' slugs
  const nextSlug = () => `${PREFIX}${++n}`;
  const strays = [];

  async function cleanup() {
    const service = serviceClient();
    const { data: shops } = await service.from('shops').select('id').like('slug', `${PREFIX}%`);
    for (const shop of shops ?? []) {
      await service.from('shops').update({ active: false }).eq('id', shop.id);
      const { data: profileIds } = await service.rpc('delete_shop_data', { p_shop: shop.id });
      for (const id of profileIds ?? []) await service.auth.admin.deleteUser(id);
      await service.from('shops').delete().eq('id', shop.id);
    }
    for (const username of strays) await deleteUserByUsername(username);
  }

  beforeAll(async () => {
    platform = await signedIn('plataforma');
    await cleanup();
  });
  afterAll(cleanup);

  test('the platform updates a shop and its contact details', async () => {
    const { shopId } = await throwawayShop(platform, nextSlug());
    const res = await call(platform, {
      action: 'update_shop', shop_id: shopId, name: 'Sastrería Prueba Editada', city: 'Cali',
      contact_name: 'Dueña Prueba', contact_phone: '3001234567', contact_email: 'a@b.co',
      notes: 'Paga el 5', slug: 'otro',
    });
    expect(res).toEqual({ status: 200, body: { ok: true } });

    const service = serviceClient();
    const { data: shop, error: shopError } = await service.from('shops')
      .select('name, city, slug').eq('id', shopId).single();
    expect(shopError).toBeNull();
    expect(shop.name).toBe('Sastrería Prueba Editada');
    expect(shop.city).toBe('Cali');
    expect(shop.slug).toMatch(new RegExp(`^${PREFIX}`));
    const { data: contact, error: contactError } = await service.from('shop_contacts')
      .select('*').eq('shop_id', shopId).single();
    expect(contactError).toBeNull();
    expect(contact).toMatchObject({
      contact_name: 'Dueña Prueba', contact_phone: '3001234567', contact_email: 'a@b.co', notes: 'Paga el 5',
    });
  });

  test('empty contact fields are stored as null', async () => {
    const { shopId } = await throwawayShop(platform, nextSlug());
    const res = await call(platform, {
      action: 'update_shop', shop_id: shopId, name: 'Sastrería Vacía', city: '  ',
      contact_name: '', contact_phone: ' ', notes: '',
    });
    expect(res.status).toBe(200);
    const service = serviceClient();
    const { data: shop } = await service.from('shops').select('city').eq('id', shopId).single();
    expect(shop.city).toBeNull();
    const { data: contact, error } = await service.from('shop_contacts').select('*').eq('shop_id', shopId).single();
    expect(error).toBeNull();
    expect(contact).toMatchObject({ contact_name: null, contact_phone: null, contact_email: null, notes: null });
  });

  test('update_shop needs a name and an existing shop', async () => {
    const { shopId } = await throwawayShop(platform, nextSlug());
    expect(await call(platform, { action: 'update_shop', shop_id: shopId, name: ' ' }))
      .toEqual({ status: 400, body: { error: 'Escribe el nombre de la sastrería' } });
    expect(await call(platform, {
      action: 'update_shop', shop_id: '00000000-0000-0000-0000-0000000000ff', name: 'X',
    })).toEqual({ status: 400, body: { error: 'Sastrería no encontrada' } });
  });

  test('a shop admin cannot update shops', async () => {
    const res = await call(await signedIn('admin'), { action: 'update_shop', shop_id: LA_UNION, name: 'Hack' });
    expect(res).toEqual({ status: 403, body: { error: 'Solo la plataforma' } });
  });

  test('the platform adds a tailor to another shop', async () => {
    const { shopId } = await throwawayShop(platform, nextSlug());
    const res = await call(platform, {
      action: 'create', shop_id: shopId, username: 'sas_prueba_1', full_name: 'Sastre Prueba',
      role: 'tailor', password: 'secreta123',
    });
    expect(res.status).toBe(200);
    const { data: profile, error } = await serviceClient().from('profiles')
      .select('shop_id, role').eq('id', res.body.user_id).single();
    expect(error).toBeNull();
    expect(profile).toEqual({ shop_id: shopId, role: 'tailor' });
  });

  test('the platform cannot add a user to a missing shop', async () => {
    const base = { action: 'create', username: 'sas_prueba_2', full_name: 'X', role: 'tailor', password: 'secreta123' };
    const expected = { status: 400, body: { error: 'Sastrería no encontrada' } };
    expect(await call(platform, base)).toEqual(expected);
    expect(await call(platform, { ...base, shop_id: '00000000-0000-0000-0000-0000000000ff' })).toEqual(expected);
  });

  test('a shop admin sending shop_id still creates in their own shop', async () => {
    const { shopId } = await throwawayShop(platform, nextSlug());
    strays.push('sas_prueba_3');
    const res = await call(await signedIn('admin'), {
      action: 'create', shop_id: shopId, username: 'sas_prueba_3', full_name: 'Sastre Prueba',
      role: 'tailor', password: 'secreta123',
    });
    expect(res.status).toBe(200);
    const { data: profile, error } = await serviceClient().from('profiles')
      .select('shop_id').eq('id', res.body.user_id).single();
    expect(error).toBeNull();
    expect(profile.shop_id).toBe(LA_UNION);
  });

  test('the platform deactivates and reactivates a shop user', async () => {
    const { adminId } = await throwawayShop(platform, nextSlug());
    const service = serviceClient();
    const activeOf = async () => (await service.from('profiles').select('active').eq('id', adminId).single()).data.active;

    expect(await call(platform, { action: 'set_active', user_id: adminId, active: false }))
      .toEqual({ status: 200, body: { ok: true } });
    expect(await activeOf()).toBe(false);
    expect(await call(platform, { action: 'set_active', user_id: adminId, active: true }))
      .toEqual({ status: 200, body: { ok: true } });
    expect(await activeOf()).toBe(true);
  });

  test('the platform cannot deactivate itself', async () => {
    const { data: { user } } = await platform.auth.getUser();
    const res = await call(platform, { action: 'set_active', user_id: user.id, active: false });
    expect(res).toEqual({ status: 400, body: { error: 'No puedes desactivarte a ti mismo' } });
  });

  test('rename_user changes the full name, not the username', async () => {
    const { adminId } = await throwawayShop(platform, nextSlug());
    const res = await call(platform, { action: 'rename_user', user_id: adminId, full_name: '  Nombre Nuevo  ' });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const { data: profile, error } = await serviceClient().from('profiles')
      .select('full_name, username').eq('id', adminId).single();
    expect(error).toBeNull();
    expect(profile.full_name).toBe('Nombre Nuevo');
    expect(profile.username).toMatch(/^adm_prueba_borrar_/);
    expect(await call(platform, { action: 'rename_user', user_id: adminId, full_name: ' ' }))
      .toEqual({ status: 400, body: { error: 'Escribe el nombre completo' } });
  });

  test('a shop admin cannot rename a user of another shop', async () => {
    const { adminId } = await throwawayShop(platform, nextSlug());
    const res = await call(await signedIn('admin'), { action: 'rename_user', user_id: adminId, full_name: 'Hack' });
    expect(res).toEqual({ status: 400, body: { error: 'Usuario no encontrado' } });
  });
});
