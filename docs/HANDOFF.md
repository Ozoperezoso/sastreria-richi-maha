# Entrega: qué está hecho y qué falta

Estado al 5/11/2026. Todo está en `main`: `build/v1` y la rama de Mahalaksmy (`diseno-el-sastre`, PR #1) ya se unieron.
Especificación: `docs/superpowers/specs/2026-10-31-sastreria-app-design.md`. Plan: `docs/superpowers/plans/2026-10-31-sastreria-app.md`. Diseño: `docs/UI-BRIEF.md`. Guía para el administrador: `docs/OPERACION.md`.

## Dónde estamos

| Parte | Estado |
|---|---|
| Tareas 1–14 del plan: base de datos, reglas, RPC, `admin-users`, importador, pantallas, pruebas | **Hecho** |
| Revisión de seguridad (incluida la de varias sastrerías) | **Hecho**: `0006_hardening.sql`; 0007 y `admin-users` revisados sin huecos |
| Diseño nuevo "El Sastre" (paño verde y cinta métrica) | **Hecho** |
| Varias sastrerías en una sola app (`0007_multi_shop.sql`) | **Hecho**: La Unión es la primera |
| Tarea 15: producción | **Publicado** (detalles abajo) |

En la última ejecución pasaron todas las pruebas: base de datos (pgTAP) 56, unitarias 62, integración 15, de extremo a extremo 13. GitHub Actions las corre en cada PR y en cada push a `main` (`.github/workflows/tests.yml`).

## Producción

- App: **https://el-sastre.mahalaksmya.workers.dev** (Cloudflare Workers).
- Base de datos: proyecto de Supabase `el-sastre`, con las migraciones 0001–0007 y la función `admin-users`.
- Datos de La Unión importados: 2.693 arreglos y 2.143 clientes. El próximo número es el 2717.
- **Las dos cuentas (Supabase y Cloudflare) son personales de Mahalaksmy.** La configuración de la publicación en Cloudflare no está en el repositorio.
- Desde que existe producción, **las migraciones 0001–0007 no se vuelven a editar**: todo cambio va en una migración nueva (`0008_…`).

## Cómo ejecutarlo en local

Requisitos: Node 22 o superior, Docker Desktop **abierto y en ejecución**.

```bash
npm install
npm run db:start        # la primera vez descarga las imágenes de Supabase
cp .env.example .env.local
npx supabase status -o env   # copia API_URL, PUBLISHABLE_KEY y SERVICE_ROLE_KEY en .env.local
npm run dev             # http://localhost:5173
```

Usuarios de prueba de `supabase/seed.sql` (solo en local), todos con contraseña `test1234`:
- `alexander` y `claudia`: sastres de La Unión.
- `admin`: administrador de La Unión.
- `inactivo`: un sastre desactivado.
- `norte`: sastre de una segunda sastrería de prueba ("Prueba Norte"); no debe ver nada de La Unión.
- `plataforma`: El Sastre; crea y desactiva sastrerías y no ve arreglos ni clientes.

Para ver los datos reales en local, importa la hoja. El CSV **no** está en el repositorio.

```bash
node scripts/import/run.js "Arreglos Modisteria - BD_Registros.csv" --shop la-union --dry-run
node scripts/import/run.js "Arreglos Modisteria - BD_Registros.csv" --shop la-union --commit
```

Pruebas:

```bash
npm run db:reset && npm run db:test   # reglas de la base de datos
npm test                               # unitarias
npm run test:int                       # integración (usa la base de datos local)
npm run test:e2e                       # navegador, tamaño de teléfono
```

**Cuidado:**
- `npm run test:e2e` y `npm run db:reset` **borran la base de datos local** y la dejan solo con los datos de prueba.
- Si agregas una nueva función Edge o cambias `supabase/config.toml`, ejecuta `npx supabase stop && npx supabase start`.

## Lo que falta

1. **Decidir de quién son las cuentas de producción.** Supabase, Cloudflare y la dirección `*.mahalaksmya.workers.dev` están en cuentas personales, y la base de datos tiene nombres y teléfonos de clientes. Opciones: pasarlas a una cuenta de la sastrería o dejarlas documentadas con Mahalaksmy.
2. **Nombres de usuario en varias sastrerías.** Hoy son únicos en toda la plataforma y la pantalla de entrada no pregunta la sastrería. Con una sola sastrería no importa; antes de sumar la segunda, decidir si se entra como `usuario@sastreria` o con un campo de sastrería.
3. **Publicación desde el repositorio.** Agregar la configuración de Cloudflare (por ejemplo `wrangler.jsonc`) para que cualquiera pueda volver a publicar, no solo desde el computador de Mahalaksmy.
4. **Revisar en el panel de Supabase de producción** que "Allow new users to sign up" esté apagado y el proveedor "Email" encendido (ver la decisión sobre `config.toml` abajo).

## Decisiones tomadas que cambian o amplían el plan

Léelas antes de modificar el código relacionado:
- **`create_ticket` es `SECURITY DEFINER`** (el plan decía invoker). El sastre que recibe la prenda tiene que poder agregar prendas a un arreglo asignado al otro sastre. La función toma la sastrería del usuario que llama, nunca de la solicitud, y comprueba que el cliente sea de esa sastrería. Un trigger (`tickets_assignee_check`) asegura que los arreglos solo se asignen a sastres activos de la misma sastrería.
- **Los arreglos solo se crean con `create_ticket`.** No hay regla de inserción directa en `tickets`; el importador y las pruebas usan la clave de servicio.
- **Solo el administrador cambia el número, el sufijo o la fila importada** de un arreglo.
- **Varias sastrerías:** cada usuario, cliente y arreglo tiene `shop_id`, y RLS solo muestra la sastrería propia. Cada sastrería numera sus arreglos (`shops.next_ticket_number`). Nada pasa de una sastrería a otra. Una sastrería desactivada deja a sus usuarios sin acceso. El rol `platform` maneja sastrerías y no ve arreglos ni clientes.
- **Desactivar un usuario** lo bloquea en Auth y además le oculta todos los datos mediante RLS. La app revisa la sesión en cada cambio de pantalla y muestra "Usuario inactivo".
- **Entrada sin correo:** el usuario `claudia` es por dentro `claudia@sastreria.local`; nadie lo ve.
- **`supabase/config.toml`:** `[auth] enable_signup = false` bloquea los registros públicos. `[auth.email] enable_signup` **debe seguir en `true`**: a pesar del nombre, apaga todo el proveedor de correo, incluido el inicio de sesión.
- **Importador:**
  - Exige `--shop <código>`.
  - Lee las fechas que Google Sheets guarda como número de serie (por ejemplo, `46225` = 22/07/2026).
  - En los arreglos que no están pagados por completo, el pago final se suma al `deposit` (abono), para que el saldo muestre lo que realmente se debe.
  - Omite y lista los arreglos entregados antes de recibidos (8 en la hoja: 613, 885, 1092, 1199, 1858, 1932, 1947, 2536).
  - No es transaccional; volver a ejecutarlo es seguro porque salta los números que ya existen.
- **"Por revisar":** los arreglos atrasados o en el estante por más de 30 días salen de la cola diaria. Al cerrarlos en grupo como entregados, la fecha de entrega es la prometida, para que los totales semanales no se inflen.
- **Precio al entregar:** si hay una sola prenda, cambia su valor. Si hay varias, se agrega una línea "Ajuste" por la diferencia. Para bajar un precio se usa "Editar".
- **El CSV exportado usa `;`** porque Excel configurado en español (Colombia) lo espera así, y empieza con un BOM UTF-8 para que las tildes se vean bien.
- **La búsqueda de la lista** (número, nombre o teléfono) ignora los filtros "Mis arreglos/Todos" y de estado, para que el arreglo de un cliente siempre aparezca al momento de entregarlo.
- **Clientes:** cualquier usuario activo puede corregir el nombre o teléfono de un cliente de su sastrería.
- **Los arreglos en garantía** muestran total y saldo en $0, aunque tengan abono.
- **La letra Archivo va incluida en la app**; no se descarga de internet.

## Reglas de este repositorio

- El repositorio es **público**. Nunca subas archivos CSV, archivos `.env*` (excepto `.env.example`), exportaciones ni nada con nombres o teléfonos de clientes. El `.gitignore` los cubre; de todas formas, revisa `git status` antes de cada commit.
- Los textos de la app van solo en español. El dinero es en pesos colombianos sin decimales, mostrado como `$10.000`. Las fechas se muestran como `d/mm/aaaa`.
