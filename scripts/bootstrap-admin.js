// Crea el usuario de la plataforma El Sastre, o el primer administrador de una sastrería.
// Uso:
//   node scripts/bootstrap-admin.js --platform [--username plataforma]        → la plataforma (crea y maneja sastrerías)
//   node scripts/bootstrap-admin.js --shop la-union [--username admin]        → administrador de esa sastrería
//   [--env .env.production.local]
// Las sastrerías nuevas se crean después desde la pantalla Plataforma de la app.
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

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const platform = process.argv.includes('--platform');
const shopSlug = arg('--shop');
if (platform === Boolean(shopSlug)) {
  console.error('Indica --platform o --shop <código>, uno de los dos.');
  process.exit(1);
}
const USERNAME = arg('--username') ?? (platform ? 'plataforma' : 'admin');
const FULL_NAME = platform ? 'El Sastre' : 'Administrador';
if (!/^[a-z0-9_]{3,20}$/.test(USERNAME)) {
  console.error('Usuario inválido: usa minúsculas, números o _ (3 a 20).');
  process.exit(1);
}

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
  console.log(`El usuario "${USERNAME}" ya existe. No se hizo nada.`);
  process.exit(0);
}

let shopId = null;
if (shopSlug) {
  const { data: shop } = await db.from('shops').select('id').eq('slug', shopSlug).maybeSingle();
  if (!shop) {
    console.error(`No existe una sastrería con el código "${shopSlug}".`);
    process.exit(1);
  }
  shopId = shop.id;
}

const password = await askHidden(`Contraseña para "${USERNAME}" (mínimo 8 caracteres): `);
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
  id: created.user.id, username: USERNAME, full_name: FULL_NAME, role: platform ? 'platform' : 'admin', active: true,
  shop_id: shopId,
});
if (profileError) {
  await db.auth.admin.deleteUser(created.user.id);
  console.error(`No se pudo crear el perfil: ${profileError.message}`);
  process.exit(1);
}

console.log(`Listo: entra a la app con el usuario "${USERNAME}" y la contraseña que escribiste.`);
console.log(platform ? 'Desde la pantalla Plataforma crea las sastrerías.' : 'Desde Usuarios crea las cuentas de los sastres.');
