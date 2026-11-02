import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { url, publishableKey, signedIn, deleteUserByUsername } from './env.js';

async function call(client, body) {
  const { data, error } = await client.functions.invoke('admin-users', { body });
  if (!error) return { status: 200, body: data };
  const res = error.context;
  return { status: res?.status, body: res ? await res.json() : null };
}

describe('admin-users function', () => {
  let admin;
  let pruebaId;

  beforeAll(async () => {
    await deleteUserByUsername('prueba');
    admin = await signedIn('admin');
  });
  afterAll(() => deleteUserByUsername('prueba'));

  test('a tailor gets 403', async () => {
    const res = await call(await signedIn('alexander'), {
      action: 'create', username: 'otro', full_name: 'Otro', role: 'tailor', password: 'secreta123',
    });
    expect(res).toEqual({ status: 403, body: { error: 'Solo administrador' } });
  });

  test('a request without a session gets 401', async () => {
    const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
    const res = await call(anon, { action: 'create' });
    expect(res.status).toBe(401);
  });

  test('admin creates a tailor who can then sign in', async () => {
    const res = await call(admin, {
      action: 'create', username: 'prueba', full_name: 'Usuario Prueba', role: 'tailor', password: 'secreta123',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    pruebaId = res.body.user_id;
    const prueba = await signedIn('prueba', 'secreta123');
    const { data } = await prueba.from('profiles').select('username, role, active').eq('id', pruebaId).single();
    expect(data).toEqual({ username: 'prueba', role: 'tailor', active: true });
  });

  test('duplicate username is rejected', async () => {
    const res = await call(admin, {
      action: 'create', username: 'prueba', full_name: 'Otra vez', role: 'tailor', password: 'secreta123',
    });
    expect(res).toEqual({ status: 400, body: { error: 'Ese usuario ya existe' } });
  });

  test('short password is rejected', async () => {
    const res = await call(admin, {
      action: 'create', username: 'corta', full_name: 'Corta', role: 'tailor', password: '1234',
    });
    expect(res).toEqual({ status: 400, body: { error: 'La contraseña debe tener al menos 8 caracteres' } });
  });

  test('invalid username is rejected', async () => {
    const res = await call(admin, {
      action: 'create', username: 'Mala Palabra', full_name: 'X', role: 'tailor', password: 'secreta123',
    });
    expect(res).toEqual({ status: 400, body: { error: 'Usuario inválido' } });
  });

  test('admin resets a password', async () => {
    const res = await call(admin, { action: 'reset_password', user_id: pruebaId, password: 'nueva12345' });
    expect(res.status).toBe(200);
    await expect(signedIn('prueba', 'nueva12345')).resolves.toBeTruthy();
  });

  test('deactivated user loses data access and cannot sign in again', async () => {
    const prueba = await signedIn('prueba', 'nueva12345');
    const res = await call(admin, { action: 'set_active', user_id: pruebaId, active: false });
    expect(res.status).toBe(200);
    const { data } = await prueba.from('tickets').select('id');
    expect(data).toEqual([]);
    await expect(signedIn('prueba', 'nueva12345')).rejects.toMatchObject({ code: 'user_banned' });
  });

  test('admin cannot deactivate themselves', async () => {
    const { data: { user } } = await admin.auth.getUser();
    const res = await call(admin, { action: 'set_active', user_id: user.id, active: false });
    expect(res).toEqual({ status: 400, body: { error: 'No puedes desactivarte a ti mismo' } });
  });
});
