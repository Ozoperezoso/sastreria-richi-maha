// UI-side mirror of the database rules (spec §4). The database is the real enforcement.

export const isAdmin = (profile) => profile?.role === 'admin' && profile?.active === true;

/** El Sastre itself: creates and switches shops, never sees tickets or customers. */
export const isPlatform = (profile) => profile?.role === 'platform' && profile?.active === true;

/** Garments, prices, dates, assignment, notes, warranty: admin or the assigned tailor. */
export const canEditCore = (profile, ticket) => isAdmin(profile) || (!!profile && ticket?.assigned_to === profile.id);

export const canDelete = (profile) => isAdmin(profile);
