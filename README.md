# Globo — Moda Infantil · tienda online

*Versión esencial: catálogo, pedidos, portal de cliente, panel de gestión y cobro con tarjeta.*

Tienda de **Globo Moda Infantil**, Plaza Giles y Rubio, Écija (Sevilla). Tel. 626 34 70 20.

Tienda online completa con catálogo gestionable, carrito, pedidos, seguimiento de envíos,
**recogida gratuita en la tienda física** y doble portal (cliente y administración).

El diseño está pensado para quien compra ropa de niño: madres, padres, abuelas y tías.
Tipografía grande, botones amplios, un solo camino claro hasta la compra y la edad
siempre visible en las categorías, porque es como se busca de verdad.

Todo funciona sin servicios externos: base de datos en fichero, imágenes generadas en SVG
y cero dependencias de front. Arranca en menos de un minuto.

---

## Arrancar en local

Necesitas **Node.js 18 o superior** (recomendado 22 o superior).

```bash
npm install      # instala dependencias
npm run seed     # crea la base de datos y carga el catálogo
npm start        # arranca en http://localhost:3000
```

**Si ya tenías la tienda instalada de una versión anterior**, `npm run seed` no toca
nada: solo carga si la base está vacía. Para reemplazar el catálogo antiguo por el
actual, hay que vaciarla:

```bash
npm run reset    # borra TODO (catálogo, pedidos y clientes) y carga el catálogo real
```

El propio `npm run seed` avisa cuando detecta un catálogo que no es el de esta versión,
que es justo lo que pasa al actualizar.

Para vaciar y recargar los datos de ejemplo: `npm run reset`.

### Si algo no se ve bien

Abre <strong>http://localhost:3000/revision.html</strong> en el mismo navegador donde
falla. Esa página comprueba desde tu navegador si el HTML es el nuevo, si el servidor
responde, si hay catálogo cargado, si las fotos existen y si el JavaScript está
actualizado, y dice qué comando arregla cada cosa.

### Si actualizas la tienda y no ves los cambios

No debería pasar: cada enlace a CSS y JavaScript lleva una **huella de su contenido**
en la URL (`estilos.css?v=4929a327`), y se recalcula sola cada vez que arrancas con
`npm start`. Si cambias un archivo, cambia la huella y el navegador descarga la
versión nueva sin que tengas que hacer nada.

Si aun así ves algo antiguo, fuerza el sellado a mano:

```bash
npm run version-assets
```

### Si no puedes entrar en el panel

El acceso está en la propia página `/admin`. Si las credenciales no funcionan —porque la
base viene de una instalación anterior o se perdió la contraseña—, hay una herramienta:

```bash
npm run admin                       # ver qué cuentas existen y de qué tipo
npm run admin -- --reset            # restablecer la contraseña del administrador
npm run admin -- --email tu@correo.es --password TuClave    # crear una cuenta nueva
npm run admin -- --promover cliente@ejemplo.es              # convertir un cliente en admin
```

Si la página no reacciona, el desplegable *No consigo entrar* del formulario tiene un botón
para limpiar la sesión guardada en el navegador: un token de una instalación anterior puede
quedarse en el almacenamiento local y confundir a la página.

### Cuentas de prueba

| Perfil | Correo | Contraseña | Entra en |
|---|---|---|---|
| Administración | `admin@modamodaglobo.es` | `admin1234` | `/admin` |
| Cliente | `cliente@ejemplo.es` | `cliente1234` | `/cuenta` |

Cambia ambas antes de publicar nada. Se definen en `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

### Pedidos de ejemplo para probar el seguimiento

Entra en `/seguimiento` con el correo `cliente@ejemplo.es` y cualquiera de estos códigos:

- `GLB-260714-8A21F3` — entregado
- `GLB-260802-C1D4E7` — en camino, con transportista y número externo
- `GLB-260808-B72A09` — preparando

---

## Qué incluye

**Tienda**
- Portada con collage de producto, banda de familias por edad y tres carruseles.
- **El collage y las portadas de familia salen del propio catálogo**: no hay imágenes fijas que mantener. Cuando la tienda cambia el escaparate o sube fotos nuevas, la portada se renueva sola.
- Catálogo con filtros combinables (familia, talla con stock real, precio, novedades, rebajas), orden y paginación. Los filtros viven en la URL, así que la vista se puede compartir.
- Ficha de producto con tallas por stock, control de unidades, composición y relacionados.
- Buscador en la cabecera.
- Cesta persistente en el navegador, con reglas de envío gratuito.
- Tramitación como invitado o con cuenta.

**Pedidos y seguimiento**
- Código legible por humanos: `GLB-AAMMDD-XXXXXX`.
- Descuento de stock en transacción: si una talla se queda sin unidades a mitad de la operación, no se cobra ni se crea el pedido a medias.
- Historial de eventos por pedido, con línea de tiempo visual.
- Seguimiento público sin cuenta: número de pedido + correo.

**Portal de cliente** (`/cuenta`)
- Registro y acceso con contraseña cifrada (bcrypt) y sesión por token JWT.
- Historial completo con estado y acceso directo al seguimiento.
- Edición de datos de envío y cambio de contraseña.

**Panel de administración** (`/admin`)
- Métricas: ingresos, pedidos, artículos activos, clientes y pedidos por día.
- Aviso de stock bajo.
- Pedidos: búsqueda, filtro por estado, cambio de estado con transportista, número de seguimiento y mensaje al cliente.
- Catálogo: alta, edición, tallas y stock, destacados, novedades y baja lógica (los pedidos antiguos no se rompen).
- Listado de clientes con gasto acumulado.

**Gestión de imágenes**
- Subida por arrastre desde el panel, varias a la vez, con galería y portada intercambiable.
- Validación por contenido real del archivo, no por extensión. Recorte a 4:5, conversión a WebP y miniatura automática.
- Al borrar la portada, la siguiente imagen asciende sola.

**Recogida en tienda**
- Opción gratuita al finalizar el pedido: si el cliente recoge, no se le pide dirección y el envío pasa a 0 €.
- El seguimiento cambia los textos: «Listo para recoger» en vez de «En camino».
- El panel avisa al gestor de que ese pedido es de recogida.

**Pasarela de pago**
- Circuito completo: el pedido nace pendiente, se abre la pasarela y solo pasa a pagado cuando ella lo confirma.
- **El importe lo calcula siempre el servidor** leyendo la base de datos. Manipular la petición desde la consola no sirve de nada, y hay una prueba automática que lo verifica.
- **La confirmación llega por webhook**, no al volver el cliente al navegador: si cierra la pestaña justo después de pagar, el pedido se confirma igual.
- **Idempotencia**: los avisos repetidos (las pasarelas reintentan) no duplican eventos ni descuentan stock dos veces.
- Si el pago se cancela o caduca, el stock reservado **vuelve al catálogo solo**.
- Proveedor intercambiable: `simulacion` (local, sin coste) o `stripe` (tarjeta y Bizum).

**Contenido de tienda real**
- Páginas de ayuda (envíos, devoluciones, guía de tallas, contacto) y legales (aviso legal, privacidad, cookies, condiciones de compra) adaptadas a la normativa española.
- `robots.txt`, `sitemap.xml`, página 404 propia.

---

## Arquitectura

```
globo/
├── server/
│   ├── index.js              Servidor Express: API + estáticos
│   ├── db.js                 Esquema SQLite y estados de pedido
│   ├── seed.js               Datos iniciales
│   ├── imagenes.js           Generador de las ilustraciones SVG
│   ├── middleware/auth.js    JWT, sesión opcional, sesión obligatoria, rol admin
│   └── routes/
│       ├── auth.js           Registro, acceso, perfil
│       ├── productos.js      Catálogo público
│       ├── pedidos.js        Alta de pedido, historial, seguimiento
│       └── admin.js          Trastienda
├── public/
│   ├── *.html                Páginas
│   ├── assets/css/           Hoja de estilos única
│   ├── assets/js/            Un módulo por página + comun.js
│   └── img/productos/        Ilustraciones generadas
├── data/globo.db          Base de datos (se crea sola, no se versiona)
└── pruebas.mjs               38 pruebas de humo de la API
```

**Decisiones y por qué**

- *SQLite en fichero*: una tienda de este tamaño no necesita un servidor de base de datos. Al crecer, cambiar a PostgreSQL toca solo `db.js` y las consultas.
- *Motor de base de datos intercambiable*: `db.js` usa `better-sqlite3` si está compilado y, si no, recurre al módulo `node:sqlite` que Node 22 incluye de serie. Por eso `better-sqlite3` figura como dependencia **opcional**: si tu máquina no puede compilarlo, la instalación no falla y la tienda arranca igual. Al arrancar verás qué motor está en uso.
- *Sin framework de front*: HTML, CSS y JavaScript nativo. Nada que compilar, nada que actualizar cada seis meses, carga inmediata. Si más adelante quieres React o Astro, la API ya está lista.
- *Precios recalculados en el servidor*: el navegador manda identificadores y cantidades; el importe lo calcula el backend leyendo la base. Manipular el carrito desde la consola no sirve de nada.
- *Baja lógica de productos*: se ocultan, no se borran, para que los pedidos antiguos conserven su contenido.

---

## API

Todas las rutas cuelgan de `/api`. Las marcadas con 🔒 exigen token; las marcadas con 🛡 exigen rol de administrador.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/categorias` | Familias con número de artículos |
| GET | `/productos` | Catálogo. Filtros: `categoria`, `q`, `talla`, `min`, `max`, `orden`, `pagina`, `porPagina`, `destacado`, `novedad`, `rebaja` |
| GET | `/productos/:slug` | Ficha con variantes y relacionados |
| GET | `/tallas` | Tallas con stock, para los filtros |
| GET | `/envio` | Reglas de envío vigentes |
| POST | `/auth/registro` | Alta de cliente → token |
| POST | `/auth/login` | Acceso → token |
| GET | `/auth/yo` 🔒 | Perfil |
| PUT | `/auth/yo` 🔒 | Actualizar datos de envío |
| PUT | `/auth/password` 🔒 | Cambiar contraseña |
| POST | `/pedidos` | Crear pedido (invitado o cliente) |
| GET | `/pedidos` 🔒 | Historial del cliente |
| GET | `/pedidos/:codigo` 🔒 | Detalle de un pedido propio |
| POST | `/seguimiento` | Rastreo público: `codigo` + `email` |
| GET | `/admin/resumen` 🛡 | Métricas del panel |
| GET | `/admin/pedidos` 🛡 | Pedidos con filtros |
| PUT | `/admin/pedidos/:codigo/estado` 🛡 | Cambiar estado y avisar |
| GET/POST | `/admin/productos` 🛡 | Listar y crear |
| PUT/DELETE | `/admin/productos/:id` 🛡 | Editar y ocultar |
| GET | `/admin/clientes` 🛡 | Clientes con gasto acumulado |
| GET/POST | `/admin/productos/:id/imagenes` 🛡 | Galería de un artículo · subida multipart |
| PUT/DELETE | `/admin/imagenes/:id` 🛡 | Marcar como portada · quitar |

Estados de un pedido: `pendiente` → `pagado` → `preparando` → `enviado` → `entregado`, más `cancelado`.

---

## Pruebas

Con el servidor arrancado en otra terminal:

```bash
npm test        # las tres baterías: tienda, imágenes y pagos
```

O por separado:

```bash
node pruebas.mjs            # catálogo, cuentas, pedidos, recogida, trastienda
node pruebas-imagenes.mjs   # subida, validación, galería, portada
node pruebas-pagos.mjs      # sesión, cobro, idempotencia, cancelación, webhook
```

Comprueba catálogo, filtros, registro, permisos, alta de pedido, descuento de stock,
validaciones, seguimiento público, trastienda y respuesta de todas las páginas.

---

## Personalizar la tienda

**Marca y colores.** Todo el sistema visual está en las variables del principio de
`public/assets/css/estilos.css`. La paleta sale directamente del logotipo: se muestrearon
los tres globos y la brocha del archivo original, y cada uno se abre en tres tonos pastel.

**La tienda es clara por diseño y así se declara.** El CSS lleva `color-scheme: light only`
y cada página el meta correspondiente. Sin eso, Chrome aplica su modo oscuro automático e
invierte toda la paleta: el rosa pastel sale burdeo y la menta, verde botella. Hay además un
bloque `@media (prefers-color-scheme: dark)` que repite los mismos valores, por si alguna
extensión lo intenta igualmente. No quites ninguna de las dos cosas.

Hay una regla que conviene no romper al tocarla: **el color solo rellena; el texto siempre
va en gris neutro**. No existe ningún tono saturado ni oscuro de color en la página — ni
burdeos, ni verde botella, ni morado fuerte. Si hace falta destacar algo, se destaca con un
fondo pastel, nunca tiñendo la letra. Así los fondos pueden aclararse cuanto se quiera sin
que nada deje de leerse. Todas las combinaciones de texto sobre fondo superan el 4.5:1 que
pide la WCAG en nivel AA.

**El escaparate de la portada lo controla la tienda.** La foto grande del hero va
rotando entre los artículos marcados como **Novedad** en el panel: basta marcar o
desmarcar esa casilla para cambiar lo que se enseña, sin tocar código. Los carruseles
de más abajo usan la casilla **Destacado** igual.

**El catálogo es real.** Los 156 artículos salen de los catálogos PDF de los
proveedores (Básicos, Canastilla y Popys), con sus referencias, nombres y tallas
originales. Las fotos se extrajeron de esos PDF, se recortaron sobre el fondo de la
marca y se convirtieron a WebP.

Dos avisos importantes antes de publicar:

- **60 artículos de ceremonia llevan nombre provisional** (`Modelo 32465`), porque el
  catálogo del proveedor no los nombra: solo los numera. La tienda debe ponerles nombre
  comercial y precio desde el panel.
- **Los precios son una propuesta de partida** calculada por tipo de prenda. Hay que
  revisarlos con las tarifas reales antes de abrir.

**Sobre la nitidez de las fotos.** Los catálogos de proveedor traen imágenes pequeñas
(unos 210 px de lado en el de básicos). Para que no salgan blandas, el procesado:
parte del original a resolución nativa y escala **una sola vez**, no amplía más de
2,6 veces, sube en dos pasos con realce intermedio cuando el salto es grande, y
**adapta el lienzo al tamaño de la prenda** en vez de forzar uno fijo. Así la imagen
tiene justo los píxeles que hacen falta. El resultado es un 34 % más nítido que
estirándolas a un tamaño fijo.

Si algún día llegan fotos de más resolución, basta con sustituir los archivos desde
el panel: la calidad la manda el original.

Para regenerar el catálogo desde los PDF: `node server/construir-catalogo.js`

**Catálogo.** Lo normal es gestionarlo desde `/admin`. Si prefieres cargar un catálogo
inicial distinto, edita el array `CATALOGO` de `server/seed.js` y ejecuta `npm run reset`.

**Fotografía real.** Las ilustraciones SVG son un sustituto. Desde el panel, abre cualquier
artículo y arrastra las fotos sobre la zona de subida: el servidor las recorta a 4:5, las
convierte a WebP y genera la miniatura. No hace falta tocar el servidor por FTP.

**Textos legales.** `public/legal.html` y `public/ayuda.html` son plantillas de trabajo:
sustituye razón social, CIF, dirección, plazos y costes reales, y revísalos con un asesor.

---

## Antes de abrir al público

Están detallados en `DESPLIEGUE.md`, pero en resumen:

1. Registrar el dominio y apuntar los DNS.
2. Cambiar `JWT_SECRET` y las contraseñas de administración.
3. Integrar una pasarela de pago real (ahora el pago es simulado).
4. Configurar el envío de correos de confirmación.
5. Poner HTTPS y copias de seguridad de la base de datos.
6. Revisar los textos legales y el registro en la AEPD si procede.

---

Hecho con Node.js, Express y SQLite. Licencia MIT.
"# globomodainfantil" 
