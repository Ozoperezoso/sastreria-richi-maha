// Crea el primer administrador (usuario "admin") en un proyecto de Supabase.
// Uso: node scripts/bootstrap-admin.js [--env .env.production.local]
// Pide la contraseña en la terminal, sin mostrarla. La contraseña nunca va en el código ni en archivos.
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const envFlag = process.argv.indexOf('--env');
const envFile = envFlag > -1 ? process.argv[envFlag + 1] : '.env.production.local';
if (!existsSync(envFile)) {
  console.error(`No existe ${envFile}.`);
  process.exit(1);
}
process.loadEnvFile(envFile);

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(`Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en ${envFile}.`);
  process.exit(1);
}

const USERNAME = 'admin';
const FULL_NAME = 'Administrador';

/** Reads a line without echoing what is typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: existing, error: lookupError } = await db.from('profiles').select('id').eq('username', USERNAME).maybeSingle();
if (lookupError) {
  console.error(`No se pudo consultar la base de datos: ${lookupError.message}`);
  process.exit(1);
}
if (existing) {
  console.log('El usuario "admin" ya existe. No se hizo nada.');
  process.exit(0);
}

const password = await askHidden('Contraseña para "admin" (mínimo 8 caracteres): ');
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}
if ((await askHidden('Repite la contraseña: ')) !== password) {
  console.error('Las contraseñas no coinciden.');
  process.exit(1);
}

const { data: created, error: createError } = await db.auth.admin.createUser({
  email: `${USERNAME}@sastreria.local`, password, email_confirm: true,
});
if (createError) {
  console.error(`No se pudo crear el usuario: ${createError.message}`);
  process.exit(1);
}

const { error: profileError } = await db.from('profiles').insert({
  id: created.user.id, username: USERNAME, full_name: FULL_NAME, role: 'admin', active: true,
});
if (profileError) {
  await db.auth.admin.deleteUser(created.user.id);
  console.error(`No se pudo crear el perfil: ${profileError.message}`);
  process.exit(1);
}

console.log('Listo: entra a la app con el usuario "admin" y la contraseña que escribiste.');
console.log('Desde Usuarios crea las cuentas de los sastres.');
