// Integration tests talk to the local Supabase stack; keys come from .env.local (see README).
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export const url = process.env.SUPABASE_URL;
export const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const serviceClient = () => createClient(url, serviceKey, noSession);

export async function signedIn(username, password = 'test1234') {
  const client = createClient(url, publishableKey, noSession);
  const { error } = await client.auth.signInWithPassword({ email: `${username}@sastreria.local`, password });
  if (error) throw error;
  return client;
}

export async function deleteUserByUsername(username) {
  const admin = serviceClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users.find((u) => u.email === `${username}@sastreria.local`);
  if (user) await admin.auth.admin.deleteUser(user.id);
}
