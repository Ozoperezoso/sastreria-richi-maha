# El Sastre — Brief de interfaz

Fecha: 2026-11-02 · Maqueta: https://claude.ai/artifact/8KEtZytQPsD3sw7cgHX98V (página "Diseño final")

## Para quién y para qué
- **Sastres (Alexander, Claudia):** en su teléfono, de pie en el mostrador, y en el computador compartido del taller.
- **Tarea principal:** registrar un arreglo en menos de un minuto y copiar el número a la boleta de papel.
- **Lo que más importa:** qué hago ahora, qué está vencido, qué está listo para entregar y cuánto se cobra.
- **Admin (Rodrigo):** plata por semana/mes y por sastre, atrasados, descargar CSV, usuarios.

## Dirección visual: paño verde y cinta métrica
- Bloques principales en verde paño; el acento es el amarillo de la cinta métrica.
- **La cinta métrica es el elemento propio de la app:** una franja amarilla con marcas que mide el tiempo en días. Hoy es el 0, lo vencido es negativo (−5) y lo próximo positivo (+2). En "Por entregar" mide los días que la prenda lleva esperando en el estante.
- Inicio abre con "Lo siguiente en tu mesa": el arreglo más urgente en grande, con Abrir arreglo y Llamar.
- La cola se divide por lo que hay que hacer: **Por terminar** y **Por entregar**. En el teléfono son pestañas; en el computador van lado a lado.
- Letra: **Archivo** (variable). Versión angosta (`font-stretch: 68%`) para números de boleta, días y plata; normal para el texto. En la app real se incluye la letra en el paquete, sin descargarla de internet.

## Colores
| Uso | Color |
|---|---|
| Paño (bloques principales, botón principal) | `#23453A` |
| Texto | `#1C2B25` |
| Texto secundario | `#56665F` |
| Fondo | `#EEF1EF` |
| Tarjeta | `#FFFFFF`, borde `#DCE2DF` |
| Cinta métrica | `#F2C230` (vencido `#F5B83A`), marcas `#262318` |
| Vencido / hoy en la cinta / eliminar | `#C8281E`, fondo `#FDF0EE` |
| Estante (ubicación A–E, Cajón, Bodega) | `#235E3C`, fondo `#F1F6F2` |
| Avisos | texto `#4A3800`, fondo `#FFF6DC`, borde `#E8C860` |

## Un diseño para teléfono y computador
- Cada pantalla es una sola: se acomoda al ancho con `flex-wrap` y container queries (corte en 720 px).
- Computador: barra superior con marca, búsqueda, Míos / Todo el taller, Nuevo arreglo y Salir. El admin tiene pestañas Panel, Arreglos y Usuarios arriba.
- Teléfono: encabezado corto con volver; el admin tiene la barra de pestañas abajo.
- Ventanas (Marcar listo, Entregar): en el teléfono salen desde abajo; en el computador, centradas.
- La tabla de "Todos los arreglos" se vuelve lista en el teléfono.
- Computador compartido: "Salir" siempre visible.

## Reglas
- Botones y campos de 44–54 px de alto.
- Plata en COP: `$43.000`, sin decimales. Teclado numérico en precios y teléfono.
- Vencido y "hoy" siempre con texto o número, no solo color.
- Los botones dicen lo que hacen: "Marcar listo en C", "Entregar y cobrar $15.000", "Eliminar N° 2640".
- Lo que un sastre no puede editar en el arreglo del otro se ve, pero bloqueado, con explicación.
- Foco visible con teclado (borde amarillo).

## Estados obligatorios
- **Cargando:** filas grises del mismo tamaño.
- **Vacío:** "No hay arreglos" + Nuevo arreglo.
- **Error de red:** aviso con "Reintentar"; el formulario no se borra.
- **Sesión expirada / usuario inactivo:** vuelve a Entrar con el motivo.
- **Guardado:** número gigante sobre la cinta para copiarlo a la boleta.
- **Errores de formulario:** debajo del campo, diciendo cómo arreglarlo.

## Pantallas (página "Diseño final")
1. Entrar · 2. Inicio · 3. Nuevo arreglo · 4. Arreglo guardado · 5. Detalle · 6. Marcar listo · 7. Entregar · 8. Admin, panel · 9. Admin, todos los arreglos · 10. Admin, usuarios.

Los clientes y montos de la maqueta son de ejemplo.
