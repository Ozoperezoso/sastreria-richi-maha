// El Sastre is the platform; each signed-in user belongs to one shop (or to the platform itself).
export const APP_NAME = 'El Sastre';

/** Short shop name for the top bar: 'Sastrería La Unión' → 'La Unión'. */
export function shopLabel(profile) {
  if (profile?.role === 'platform') return 'Plataforma';
  return String(profile?.shops?.name ?? '').replace(/^Sastrer[ií]a\s+/i, '');
}
