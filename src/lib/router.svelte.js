// Hash router: #/, #/nuevo, #/arreglo/:id, #/admin, #/admin/todos, #/admin/usuarios, #/plataforma/:id
const ROUTES = [
  { name: 'inicio', pattern: /^\/$/ },
  { name: 'nuevo', pattern: /^\/nuevo$/ },
  { name: 'detalle', pattern: /^\/arreglo\/([0-9a-f-]{36})$/, keys: ['id'] },
  { name: 'panel', pattern: /^\/admin$/, admin: true },
  { name: 'todos', pattern: /^\/admin\/todos$/, admin: true },
  { name: 'usuarios', pattern: /^\/admin\/usuarios$/, admin: true },
  { name: 'plataforma', pattern: /^\/plataforma\/([0-9a-f-]{36})$/, keys: ['id'], platform: true },
];

export const router = $state({ name: 'inicio', params: {}, admin: false, platform: false, path: '/' });

function resolve() {
  const path = window.location.hash.replace(/^#/, '') || '/';
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) {
      const params = Object.fromEntries((route.keys ?? []).map((key, i) => [key, match[i + 1]]));
      Object.assign(router, { name: route.name, params, admin: !!route.admin, platform: !!route.platform, path });
      return;
    }
  }
  navigate('/');
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) resolve();
  else window.location.hash = path;
}

export function startRouter(onChange) {
  window.addEventListener('hashchange', () => { resolve(); onChange?.(); });
  resolve();
}
