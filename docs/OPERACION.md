# Guía de operación

Para el administrador de la sastrería. Las partes marcadas **(técnico)** las hace quien maneja las cuentas de Supabase y Cloudflare.

## Entrar

- Dirección de la app: **https://el-sastre.mahalaksmya.workers.dev**
- Se entra con **usuario y contraseña**. No se usa correo.
- En el computador del taller, toca **Salir** al terminar, para que la siguiente persona no quede con tu cuenta.

## Usuarios

En **Usuarios**:

- **Crear usuario:** escribe el usuario (minúsculas, números o `_`, de 3 a 20 letras), el nombre completo, el rol (Sastre o Administrador) y una contraseña inicial de al menos 8 caracteres. Dale la contraseña a la persona en el taller, no por chat.
- El usuario es **único en toda la plataforma**: si otra sastrería ya usa `claudia`, escoge otro, por ejemplo `claudia_union`.
- **Cambiar contraseña:** cuando alguien la olvida. Pon una nueva y dásela en persona.
- **Desactivar:** cuando alguien deja de trabajar en el taller. Pierde el acceso de inmediato y sus arreglos siguen guardados. **Activar** se lo devuelve.
- No puedes desactivarte a ti mismo.

## Copia de seguridad cada semana

1. Abre **Todos los arreglos**.
2. Deja los filtros sin cambiar, para que salgan todos.
3. Toca **Exportar CSV**. Se descarga `arreglos-AAAA-MM-DD.csv`.
4. Guárdalo en una carpeta privada (por ejemplo, tu Google Drive). **No lo compartas**: tiene nombres y teléfonos de clientes.

El archivo se abre directo en Excel, con las tildes bien.

## Arreglos viejos sin cerrar

En Inicio, los arreglos atrasados o en el estante por más de 30 días se agrupan en **Por revisar**. El administrador puede marcar varios a la vez como entregados (con la fecha prometida como fecha de entrega) o como cancelados. Los cancelados siguen guardados y se ven en Todos los arreglos.

## La app no carga los datos (técnico)

El plan gratuito de Supabase **pausa el proyecto después de 7 días sin uso**, por ejemplo en vacaciones. La app abre pero no carga arreglos ni deja entrar.

1. Entra a https://supabase.com/dashboard con la cuenta dueña del proyecto `el-sastre`.
2. Abre el proyecto y toca **Restore project**.
3. Espera unos minutos y vuelve a cargar la app. No se pierde ningún dato.

## Sastrerías (técnico)

El usuario de plataforma (`plataforma`) entra a la pantalla **Plataforma**. Ahí ve la lista de sastrerías con su uso (arreglos del mes, sastres activos, última actividad). No ve arreglos ni clientes, solo cifras.

- **Crear:** **Nueva sastrería**, con el nombre, un código (por ejemplo `el-boton`) y su primer administrador.
- **Página de la sastrería:** toca una fila. Muestra el uso de los últimos 6 meses, el contacto y los usuarios.
- **Editar:** nombre, ciudad, persona de contacto, teléfono, correo y notas. El código no cambia.
- **Usuarios:** **Nuevo usuario**, **Cambiar nombre**, **Cambiar contraseña** y **Desactivar / Activar**. La contraseña se comparte en persona.
- **Desactivar:** sus usuarios pierden el acceso de inmediato y los datos quedan guardados. **Antes, pide al administrador de la sastrería que exporte el CSV** (Todos los arreglos): después ya no podrán entrar.
- **Eliminar:** solo con la sastrería desactivada, y es para siempre. Se hace en dos pasos: desactivar, y luego **Eliminar sastrería** escribiendo el nombre exacto. Se borran sus arreglos, clientes y usuarios.

Si hay que crear el usuario de plataforma o un administrador desde cero:

```bash
node scripts/bootstrap-admin.js --platform --env .env.production.local
node scripts/bootstrap-admin.js --shop la-union --env .env.production.local
```

El script pide la contraseña en la terminal y no la muestra. `.env.production.local` tiene las claves de producción y nunca se sube al repositorio.
