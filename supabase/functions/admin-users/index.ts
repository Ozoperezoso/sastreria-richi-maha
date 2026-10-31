// Admin-only user management (spec §4). Holds the service-role key; never exposed to browsers.
// POST body: {action:'create', username, full_name, role, password}
//          | {action:'reset_password', user_id, password}
//          | {action:'set_active', user_id, active}
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const BANNED_FOREVER = '876000h'; // ~100 years; 'none' lifts it

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function passwordError(password: unknown) {
  return typeof password !== 'string' || password.length < 8
    ? 'La contraseña debe tener al menos 8 caracteres'
    : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json(401, { error: 'Sesión inválida' });

  const { data: callerProfile } = await admin
    .from('profiles').select('role, active').eq('id', caller.id).maybeSingle();
  if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.active) {
    return json(403, { error: 'Solo administrador' });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== 'string') return json(400, { error: 'Solicitud inválida' });

  if (body.action === 'create') {
    const username = String(body.username ?? '').trim();
    const fullName = String(body.full_name ?? '').trim();
    if (!USERNAME_RE.test(username)) return json(400, { error: 'Usuario inválido' });
    if (!fullName) return json(400, { error: 'Escribe el nombre completo' });
    if (body.role !== 'admin' && body.role !== 'tailor') return json(400, { error: 'Rol inválido' });
    const pwError = passwordError(body.password);
    if (pwError) return json(400, { error: pwError });

    const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
    if (existing) return json(400, { error: 'Ese usuario ya existe' });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `${username}@sastreria.local`,
      password: body.password,
      email_confirm: true,
    });
    if (createError || !created.user) return json(400, { error: 'Ese usuario ya existe' });

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id, username, full_name: fullName, role: body.role, active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(500, { error: 'No se pudo crear el usuario' });
    }
    return json(200, { ok: true, user_id: created.user.id });
  }

  if (body.action === 'reset_password') {
    const pwError = passwordError(body.password);
    if (pwError) return json(400, { error: pwError });
    const { error } = await admin.auth.admin.updateUserById(String(body.user_id), { password: body.password });
    if (error) return json(400, { error: 'Usuario no encontrado' });
    return json(200, { ok: true });
  }

  if (body.action === 'set_active') {
    const active = body.active === true;
    if (!active && body.user_id === caller.id) return json(400, { error: 'No puedes desactivarte a ti mismo' });
    const { data: updated, error } = await admin
      .from('profiles').update({ active }).eq('id', String(body.user_id)).select('id');
    if (error || !updated?.length) return json(400, { error: 'Usuario no encontrado' });
    // Banning blocks new sign-ins and token refreshes; RLS already blocks data access.
    await admin.auth.admin.updateUserById(String(body.user_id), { ban_duration: active ? 'none' : BANNED_FOREVER });
    return json(200, { ok: true });
  }

  return json(400, { error: 'Acción desconocida' });
});
