// User and shop management. Holds the service-role key; never exposed to browsers.
// A shop's admin manages the users of their own shop. The platform (El Sastre) creates and switches shops.
// POST body:
//   shop admin: {action:'create', username, full_name, role, password}
//               | {action:'reset_password', user_id, password} | {action:'set_active', user_id, active}
//   platform:   {action:'create_shop', name, slug, city?, admin_username, admin_full_name, admin_password}
//               | {action:'set_shop_active', shop_id, active} | {action:'reset_password', user_id, password}
//               | {action:'delete_shop', shop_id, confirm_name}   (shop must be deactivated first)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const SLUG_RE = /^[a-z0-9-]{3,30}$/;
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
    .from('profiles').select('role, active, shop_id, shops(active)').eq('id', caller.id).maybeSingle();
  const isPlatform = callerProfile?.role === 'platform' && callerProfile.active;
  const isShopAdmin = callerProfile?.role === 'admin' && callerProfile.active
    && (callerProfile.shops as { active?: boolean } | null)?.active === true;
  if (!isPlatform && !isShopAdmin) return json(403, { error: 'Solo administrador' });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== 'string') return json(400, { error: 'Solicitud inválida' });

  /** Creates the auth user and its profile; removes the auth user again if the profile fails. */
  async function createUser(username: string, fullName: string, role: string, password: unknown, shopId: string) {
    if (!USERNAME_RE.test(username)) return { error: 'Usuario inválido: usa minúsculas, números o _ (3 a 20)' };
    if (!fullName) return { error: 'Escribe el nombre completo' };
    if (role !== 'admin' && role !== 'tailor') return { error: 'Rol inválido' };
    const pwError = passwordError(password);
    if (pwError) return { error: pwError };

    const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
    if (existing) return { error: 'Ese usuario ya existe' };

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `${username}@sastreria.local`,
      password: password as string,
      email_confirm: true,
    });
    if (createError || !created.user) return { error: 'Ese usuario ya existe' };

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id, username, full_name: fullName, role, active: true, shop_id: shopId,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { error: 'No se pudo crear el usuario' };
    }
    return { userId: created.user.id };
  }

  /** The target user, if the caller may manage it: same shop for a shop admin, any shop user for the platform. */
  async function manageableUser(userId: string) {
    const { data: target } = await admin.from('profiles').select('id, role, shop_id').eq('id', userId).maybeSingle();
    if (!target || target.role === 'platform') return null;
    if (isShopAdmin && target.shop_id !== callerProfile!.shop_id) return null;
    return target;
  }

  // ---------- Shop admin ----------
  if (body.action === 'create') {
    if (!isShopAdmin) return json(403, { error: 'Solo el administrador de la sastrería' });
    const result = await createUser(String(body.username ?? '').trim(), String(body.full_name ?? '').trim(),
      body.role, body.password, callerProfile!.shop_id);
    if (result.error) return json(400, { error: result.error });
    return json(200, { ok: true, user_id: result.userId });
  }

  if (body.action === 'reset_password') {
    const pwError = passwordError(body.password);
    if (pwError) return json(400, { error: pwError });
    if (!(await manageableUser(String(body.user_id)))) return json(400, { error: 'Usuario no encontrado' });
    const { error } = await admin.auth.admin.updateUserById(String(body.user_id), { password: body.password });
    if (error) return json(400, { error: 'Usuario no encontrado' });
    return json(200, { ok: true });
  }

  if (body.action === 'set_active') {
    if (!isShopAdmin) return json(403, { error: 'Solo el administrador de la sastrería' });
    const active = body.active === true;
    if (!active && body.user_id === caller.id) return json(400, { error: 'No puedes desactivarte a ti mismo' });
    if (!(await manageableUser(String(body.user_id)))) return json(400, { error: 'Usuario no encontrado' });
    const { data: updated, error } = await admin
      .from('profiles').update({ active }).eq('id', String(body.user_id)).select('id');
    if (error || !updated?.length) return json(400, { error: 'Usuario no encontrado' });
    // Banning blocks new sign-ins and token refreshes; RLS already blocks data access.
    await admin.auth.admin.updateUserById(String(body.user_id), { ban_duration: active ? 'none' : BANNED_FOREVER });
    return json(200, { ok: true });
  }

  // ---------- Platform ----------
  if (body.action === 'create_shop') {
    if (!isPlatform) return json(403, { error: 'Solo la plataforma' });
    const name = String(body.name ?? '').trim();
    const slug = String(body.slug ?? '').trim();
    const city = String(body.city ?? '').trim();
    if (!name) return json(400, { error: 'Escribe el nombre de la sastrería' });
    if (!SLUG_RE.test(slug)) return json(400, { error: 'Código inválido: usa minúsculas, números o guiones (3 a 30)' });
    const { data: taken } = await admin.from('shops').select('id').eq('slug', slug).maybeSingle();
    if (taken) return json(400, { error: 'Ya existe una sastrería con ese código' });

    const { data: shop, error: shopError } = await admin.from('shops')
      .insert({ name, slug, city: city || null }).select('id').single();
    if (shopError || !shop) return json(500, { error: 'No se pudo crear la sastrería' });

    const result = await createUser(String(body.admin_username ?? '').trim(), String(body.admin_full_name ?? '').trim(),
      'admin', body.admin_password, shop.id);
    if (result.error) {
      await admin.from('shops').delete().eq('id', shop.id);
      return json(400, { error: result.error });
    }
    return json(200, { ok: true, shop_id: shop.id, user_id: result.userId });
  }

  if (body.action === 'set_shop_active') {
    if (!isPlatform) return json(403, { error: 'Solo la plataforma' });
    const { data: updated, error } = await admin.from('shops')
      .update({ active: body.active === true }).eq('id', String(body.shop_id)).select('id');
    if (error || !updated?.length) return json(400, { error: 'Sastrería no encontrada' });
    return json(200, { ok: true });
  }

  if (body.action === 'delete_shop') {
    if (!isPlatform) return json(403, { error: 'Solo la plataforma' });
    const shopId = String(body.shop_id);
    const { data: shop } = await admin.from('shops').select('name, active').eq('id', shopId).maybeSingle();
    if (!shop) return json(400, { error: 'Sastrería no encontrada' });
    if (shop.active) return json(400, { error: 'Primero desactiva la sastrería' });
    if (String(body.confirm_name ?? '').trim() !== shop.name) return json(400, { error: 'El nombre no coincide' });

    // Every step is safe to repeat, so a failed run is finished by running it again.
    const { data: profileIds, error: dataError } = await admin.rpc('delete_shop_data', { p_shop: shopId });
    if (dataError) {
      const known = ['Sastrería no encontrada', 'Primero desactiva la sastrería'].includes(dataError.message);
      return known ? json(400, { error: dataError.message }) : json(500, { error: 'No se pudo borrar todo; intenta otra vez' });
    }
    for (const id of (profileIds ?? []) as string[]) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json(500, { error: 'No se pudo borrar todo; intenta otra vez' });
    }
    const { error: shopError } = await admin.from('shops').delete().eq('id', shopId);
    if (shopError) return json(500, { error: 'No se pudo borrar todo; intenta otra vez' });
    return json(200, { ok: true });
  }

  return json(400, { error: 'Acción desconocida' });
});
