// Who is signed in. Usernames map to synthetic emails (<usuario>@sastreria.local) that nobody sees.
import { supabase } from './supabase.js';

export const session = $state({ user: null, profile: null, loading: true, error: '' });

const emailFor = (username) => `${username.trim().toLowerCase()}@sastreria.local`;

async function clear(error = '') {
  await supabase.auth.signOut({ scope: 'local' });
  session.user = null;
  session.profile = null;
  session.error = error;
  session.loading = false;
}

async function applyUser(user) {
  if (!user) return clear(session.error);
  // An inactive profile is invisible through RLS, so a missing row also means "inactive".
  const { data: profile } = await supabase
    .from('profiles').select('id, username, full_name, role, active').eq('id', user.id).maybeSingle();
  if (!profile?.active) {
    await clear('Usuario inactivo');
    return false;
  }
  session.user = user;
  session.profile = profile;
  session.error = '';
  session.loading = false;
  return true;
}

export async function initSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) await recheck();
  else session.loading = false;
}

export async function signIn(username, password) {
  session.error = '';
  const { data, error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password });
  if (error) {
    session.error = error.code === 'user_banned' ? 'Usuario inactivo' : 'Usuario o contraseña incorrectos';
    return false;
  }
  return applyUser(data.user);
}

/** Runs on every screen change and when the tab regains focus (Review Focus 3). */
export async function recheck() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    await clear(error?.code === 'user_banned' ? 'Usuario inactivo' : session.user ? 'Sesión expirada' : '');
    return false;
  }
  return applyUser(data.user);
}

export const signOut = () => clear();
