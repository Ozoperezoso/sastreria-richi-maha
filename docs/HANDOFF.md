# Entrega: qué está hecho y qué falta

Estado al 31/10/2026. Rama `build/v1`, todavía no unida a `main`.
Especificación: `docs/superpowers/specs/2026-10-31-sastreria-app-design.md`. Plan: `docs/superpowers/plans/2026-10-31-sastreria-app.md` (15 tareas).

## Dónde estamos

| Tarea del plan | Estado |
|---|---|
| 1–14: base del proyecto, base de datos, reglas de seguridad, funciones RPC, función `admin-users`, importador, todas las pantallas, pruebas | **Hecho**, en local |
| Revisión final de toda la rama | **Sin hacer**: se inició y se detuvo antes de dar resultados |
| 15: configuración de producción, importación y publicación | **Sin empezar**: espera la autorización de Rodrigo |

En la última ejecución pasaron todas las pruebas: base de datos (pgTAP) 47, unitarias 53, integración 15, de extremo a extremo 13.
Todavía no hay nada en la nube. Las cuentas de Supabase y Cloudflare están conectadas, pero no se ha creado ningún proyecto.

## Cómo ejecutarlo en local

Requisitos: Node 22 o superior, Docker Desktop **abierto y en ejecución**.

```bash
npm install
npm run db:start        # la primera vez descarga las imágenes de Supabase
cp .env.example .env.local
npx supabase status -o env   # copia API_URL, PUBLISHABLE_KEY (o ANON_KEY) y SERVICE_ROLE_KEY en .env.local
npm run dev             # http://localhost:5173
```

Usuarios de prueba de `supabase/seed.sql` (solo en local), todos con contraseña `test1234`:
- `alexander` y `claudia`: sastres.
- `rodrigo`: administrador.
- `inactivo`: un sastre desactivado.

Para ver los datos reales en local, importa la hoja. El CSV **no** está en el repositorio; pídeselo a Rodrigo.

```bash
node scripts/import/run.js "Arreglos Modisteria - BD_Registros.csv" --dry-run
node scripts/import/run.js "Arreglos Modisteria - BD_Registros.csv" --commit
```

Pruebas:

```bash
npm run db:reset && npm run db:test   # reglas de la base de datos (necesita solo los datos de prueba)
npm test                               # unitarias
npm run test:int                       # integración (usa la base de datos local)
npm run test:e2e                       # navegador, tamaño de teléfono
```

**Cuidado:**
- `npm run test:e2e` y `npm run db:reset` **borran la base de datos local** y la dejan solo con los datos de prueba. Si necesitas los datos reales, vuelve a importar la hoja.
- Si agregas una nueva función Edge, ejecuta `npx supabase stop && npx supabase start`. El servidor local de funciones solo ve las carpetas de funciones que existían cuando arrancó.

## Lo que falta

### 1. Revisión final (hazla primero)

Revisa `git diff 5a91df3..build/v1`, sin `package-lock.json`, comparándolo con la especificación. Lo más importante es la **seguridad**: la sección 4 de la especificación dice que los permisos los aplica *la base de datos*, no las pantallas. Intenta romperlo haciéndote pasar por un sastre que llama a la API directamente, por ejemplo:
- cambiar columnas restringidas en el arreglo del otro sastre;
- editar `profiles`, por ejemplo para volverte administrador;
- usar mal `create_ticket`, que es `SECURITY DEFINER`;
- obtener acceso como usuario inactivo o anónimo.

Revisa también los cinco puntos de "Review Focus" del plan.

Las reglas están en:
- `supabase/migrations/0002_rules.sql`
- `supabase/migrations/0003_security.sql`
- `supabase/migrations/0004_rpc.sql`
- `supabase/functions/admin-users/index.ts`

Corrige cualquier problema serio escribiendo primero una prueba que falle y luego la corrección.

### 2. Tarea 15 del plan: publicar (solo con la autorización de Rodrigo)

Sigue la tarea 15 del plan. Tres piezas **todavía no existen** y hay que escribirlas:
- `scripts/bootstrap-admin.js`: crea el primer administrador (`rodrigo`) en producción. Pide la contraseña en la terminal; la contraseña nunca debe ir en el código ni en el chat.
- `docs/OPERACION.md`: una guía corta **en español** para el administrador: cómo entrar, crear usuarios, exportar el CSV cada semana y reactivar un proyecto de Supabase pausado.
- `.env.production.local`: las claves de producción, ignorado por git. Pásalo al importador con `--env .env.production.local`.

Configuración de producción:
- Supabase en la región `us-east-1`, plan gratuito.
- **Desactiva** los registros (sign-ups) en la configuración de Auth. Las cuentas se crean solo desde la pantalla de administración.
- Cloudflare Pages: comando de compilación `npm run build`, carpeta de salida `dist`, variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, Node 22 o superior.
- Haz primero la **simulación** de la importación (`--dry-run`) y muéstrale el resumen a Rodrigo antes de ejecutar `--commit`.

### 3. Pregunta pendiente para Rodrigo sobre los datos

8 arreglos de la hoja tienen la fecha de entrega anterior a la de recibido: **613, 885, 1092, 1199, 1858, 1932, 1947, 2536**. Seguramente son errores de digitación. Se importan tal como están; si Rodrigo quiere corregirlos, hay que arreglar la hoja antes.

## Decisiones tomadas durante la construcción que cambian o amplían el plan

Léelas antes de modificar el código relacionado:
- **`create_ticket` es `SECURITY DEFINER`** (el plan decía invoker). El sastre que recibe la prenda tiene que poder agregar prendas a un arreglo asignado al otro sastre, y las reglas de las prendas lo impedirían. La función verifica por sí misma que el usuario esté activo, y un trigger (`tickets_assignee_check`) asegura que los arreglos solo se asignen a sastres activos.
- **Desactivar un usuario** lo bloquea en Auth y además le oculta todos los datos mediante RLS. La app revisa la sesión en cada cambio de pantalla y muestra "Usuario inactivo".
- **Importador:**
  - Lee las fechas que Google Sheets guarda como número de serie (por ejemplo, `46225` = 22/07/2026); 1.111 fechas de entrega venían así.
  - En los arreglos que no están pagados por completo, el pago final se suma al `deposit` (abono), para que el saldo muestre lo que realmente se debe.
  - No es transaccional; volver a ejecutarlo es seguro porque salta los números de arreglo que ya existen.
- **Precio al entregar:** si hay una sola prenda, cambia su valor. Si hay varias, se agrega una línea "Ajuste" por la diferencia. Para bajar un precio se usa "Editar".
- **El CSV exportado usa `;`** porque Excel configurado en español (Colombia) lo espera así, y empieza con un BOM UTF-8 para que las tildes se vean bien.
- **La búsqueda de la lista** (número, nombre o teléfono) ignora los filtros "Mis arreglos/Todos" y de estado, para que el arreglo de un cliente siempre aparezca al momento de entregarlo.
- **Clientes:** cualquier usuario activo puede corregir el nombre o teléfono de un cliente.
- **Los arreglos en garantía** muestran total y saldo en $0, aunque tengan abono.
- Las migraciones `0001`–`0005` se editaron directamente durante la construcción. No hay problema porque nunca se publicaron; una vez en producción, solo se deben agregar migraciones nuevas.

## Reglas de este repositorio

- El repositorio es **público**. Nunca subas archivos CSV, archivos `.env*` (excepto `.env.example`), exportaciones ni nada con nombres o teléfonos de clientes. El `.gitignore` los cubre; de todas formas, revisa `git status` antes de cada commit.
- Los textos de la app van solo en español. El dinero es en pesos colombianos sin decimales, mostrado como `$10.000`. Las fechas se muestran como `d/mm/aaaa`.
