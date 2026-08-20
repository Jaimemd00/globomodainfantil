/* Pruebas de humo de la API. Ejecutar con el servidor arrancado: node pruebas.mjs */

const B = process.env.BASE || 'http://localhost:3000';
let ok = 0;
let fallos = 0;

async function llamar(ruta, opciones = {}) {
  const r = await fetch(B + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
  const cuerpo = await r.json().catch(() => ({}));
  return { estado: r.status, cuerpo };
}

function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    ok++;
    console.log(`  ok   ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLO ${nombre} ${detalle}`);
  }
}

const azar = Date.now().toString().slice(-6);

/* Catálogo */
const salud = await llamar('/api/salud');
comprobar('salud responde', salud.cuerpo.ok === true);

const cats = await llamar('/api/categorias');
comprobar('hay 7 categorías', cats.cuerpo.categorias?.length === 7);
comprobar('las categorías traen la edad', !!cats.cuerpo.categorias?.[0]?.edad);

const filtrados = await llamar('/api/productos?categoria=ceremonia');
comprobar('el filtro por categoría devuelve resultados', filtrados.cuerpo.total > 0);

const listado = await llamar('/api/productos?porPagina=20');
const SLUG = listado.cuerpo.productos.find((p) => p.stock_total > 3)?.slug;
comprobar('hay un artículo con stock para las pruebas', !!SLUG, 'ejecuta npm run reset');
const ficha = await llamar(`/api/productos/${SLUG}`);
comprobar('la ficha trae variantes', ficha.cuerpo.producto?.variantes?.length > 0);

const inexistente = await llamar('/api/productos/no-existe-esto');
comprobar('404 en ficha inexistente', inexistente.estado === 404);

/* Cuentas */
const registro = await llamar('/api/auth/registro', {
  method: 'POST',
  body: JSON.stringify({ nombre: 'Ana Prueba', email: `ana${azar}@test.es`, password: 'prueba123' })
});
comprobar('registro de cliente', registro.estado === 201 && !!registro.cuerpo.token);
const token = registro.cuerpo.token;

const corto = await llamar('/api/auth/registro', {
  method: 'POST',
  body: JSON.stringify({ nombre: 'X', email: `b${azar}@test.es`, password: '123' })
});
comprobar('rechaza contraseña corta', corto.estado === 400);

const yo = await llamar('/api/auth/yo', { headers: { Authorization: `Bearer ${token}` } });
comprobar('lee el perfil con token', yo.cuerpo.usuario?.rol === 'cliente');

const sinToken = await llamar('/api/pedidos');
comprobar('el historial exige sesión', sinToken.estado === 401);

/* Pedido */
const producto = ficha.cuerpo.producto;
const talla = producto.variantes.find((v) => v.stock > 1);
const stockAntes = talla.stock;

const pedido = await llamar('/api/pedidos', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    nombre: 'Ana Prueba',
    email: `ana${azar}@test.es`,
    direccion: 'Calle Falsa 1',
    ciudad: 'Marbella',
    cp: '29601',
    provincia: 'Málaga',
    items: [{ producto_id: producto.id, talla: talla.talla, cantidad: 2 }]
  })
});
comprobar('crea el pedido', pedido.estado === 201, JSON.stringify(pedido.cuerpo).slice(0, 120));

const o = pedido.cuerpo.pedido;
comprobar('el código tiene el formato GLB-', /^GLB-\d{6}-[0-9A-F]{6}$/.test(o?.codigo || ''), o?.codigo);
comprobar('el total suma subtotal y envío', Math.abs(o.total - (o.subtotal + o.envio)) < 0.001);
comprobar('registra el primer evento', o.eventos.length === 1 && o.eventos[0].estado === 'pendiente');

const trasPedido = await llamar(`/api/productos/${SLUG}`);
const stockDespues = trasPedido.cuerpo.producto.variantes.find((v) => v.talla === talla.talla).stock;
comprobar('descuenta el stock', stockDespues === stockAntes - 2, `${stockAntes} → ${stockDespues}`);

const cpMalo = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    nombre: 'X', email: 'x@test.es', direccion: 'C 1', ciudad: 'M', cp: '123', provincia: 'M',
    items: [{ producto_id: producto.id, talla: talla.talla, cantidad: 1 }]
  })
});
comprobar('valida el código postal', cpMalo.estado === 400);

const sinStock = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    nombre: 'X', email: 'x@test.es', direccion: 'C 1', ciudad: 'M', cp: '29601', provincia: 'M',
    items: [{ producto_id: producto.id, talla: talla.talla, cantidad: 999 }]
  })
});
comprobar('rechaza pedir más unidades que el stock', sinStock.estado === 409);

/* Recogida en tienda: sin dirección y sin gastos de envío.
   Se relee el stock porque las pruebas anteriores ya han consumido unidades. */
const refresco = await llamar(`/api/productos/${SLUG}`);
const tallaLibre = refresco.cuerpo.producto.variantes.find((v) => v.stock > 0);
comprobar('queda stock para seguir probando', !!tallaLibre, 'reinicia con npm run reset');

const recogida = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    metodo_envio: 'recogida',
    nombre: 'Abuela Prueba',
    email: `abuela${azar}@test.es`,
    telefono: '600 000 111',
    items: [{ producto_id: producto.id, talla: tallaLibre.talla, cantidad: 1 }]
  })
});
comprobar('crea pedido de recogida sin dirección', recogida.estado === 201, JSON.stringify(recogida.cuerpo).slice(0, 120));
comprobar('la recogida no cobra envío', recogida.cuerpo.pedido?.envio === 0);
comprobar('la recogida apunta a la tienda', /Écija/.test(recogida.cuerpo.pedido?.ciudad || ''));
comprobar('la recogida se marca como tal', recogida.cuerpo.pedido?.metodo_envio === 'recogida');

const sinDireccion = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    metodo_envio: 'domicilio',
    nombre: 'X', email: 'x@test.es',
    items: [{ producto_id: producto.id, talla: talla.talla, cantidad: 1 }]
  })
});
comprobar('el envío a domicilio sí exige dirección', sinDireccion.estado === 400);

/* Seguimiento */
const rastreo = await llamar('/api/seguimiento', {
  method: 'POST',
  body: JSON.stringify({ codigo: o.codigo, email: `ana${azar}@test.es` })
});
comprobar('el seguimiento público funciona', rastreo.cuerpo.pedido?.codigo === o.codigo);

const rastreoMalo = await llamar('/api/seguimiento', {
  method: 'POST',
  body: JSON.stringify({ codigo: o.codigo, email: 'otro@test.es' })
});
comprobar('el seguimiento exige el correo correcto', rastreoMalo.estado === 404);

/* Administración */
const login = await llamar('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@modaglobo.es', password: 'admin1234' })
});
comprobar('acceso de administrador', login.cuerpo.usuario?.rol === 'admin');
const admin = { Authorization: `Bearer ${login.cuerpo.token}` };

const clienteEnAdmin = await llamar('/api/admin/resumen', { headers: { Authorization: `Bearer ${token}` } });
comprobar('un cliente no entra en la trastienda', clienteEnAdmin.estado === 403);

const resumen = await llamar('/api/admin/resumen', { headers: admin });
comprobar('el resumen trae métricas', typeof resumen.cuerpo.ingresos === 'number' && resumen.cuerpo.pedidos > 0);

const nuevo = await llamar('/api/admin/productos', {
  method: 'POST',
  headers: admin,
  body: JSON.stringify({
    nombre: `Prenda de prueba ${azar}`,
    sku: `TEST-${azar}`,
    categoria_id: 'nino',
    precio: 19.9,
    descripcion: 'Creada por la prueba automática.',
    variantes: [{ talla: '4-5A', stock: 5 }]
  })
});
comprobar('el admin crea artículos', nuevo.estado === 201, JSON.stringify(nuevo.cuerpo).slice(0, 120));

const editado = await llamar(`/api/admin/productos/${nuevo.cuerpo.producto.id}`, {
  method: 'PUT',
  headers: admin,
  body: JSON.stringify({ precio: 24.9 })
});
comprobar('el admin edita el precio', editado.cuerpo.producto?.precio === 24.9);

const estado = await llamar(`/api/admin/pedidos/${o.codigo}/estado`, {
  method: 'PUT',
  headers: admin,
  body: JSON.stringify({ estado: 'enviado', transportista: 'SEUR', seguimiento_ext: '123456' })
});
comprobar('el admin cambia el estado', estado.cuerpo.pedido?.estado === 'enviado');
comprobar('el cambio deja rastro en el historial', estado.cuerpo.pedido.eventos.length === 2);

const estadoMalo = await llamar(`/api/admin/pedidos/${o.codigo}/estado`, {
  method: 'PUT',
  headers: admin,
  body: JSON.stringify({ estado: 'inventado' })
});
comprobar('rechaza estados inexistentes', estadoMalo.estado === 400);

const borrado = await llamar(`/api/admin/productos/${nuevo.cuerpo.producto.id}`, { method: 'DELETE', headers: admin });
comprobar('la baja de artículo es lógica', borrado.cuerpo.ok === true);

/* Páginas */
for (const ruta of ['/', '/tienda', '/producto', '/carrito', '/checkout', '/seguimiento', '/cuenta', '/admin', '/ayuda', '/legal', '/img/logo.svg', '/assets/css/estilos.css', '/assets/js/comun.js']) {
  const r = await fetch(B + ruta);
  comprobar(`la página ${ruta} responde`, r.status === 200, String(r.status));
}
const perdida = await fetch(B + '/esto-no-existe');
comprobar('la página 404 responde con 404', perdida.status === 404);

/* ------------------- La ficha tiene todo lo que pinta ---------------------- */

/* Esta comprobación existe porque una vez se perdió la línea que rellena la
   galería y TODAS las fichas de producto dejaron de abrirse. */
const fichaCompleta = await llamar(`/api/productos/${SLUG}`);
const prod = fichaCompleta.cuerpo.producto;
comprobar('la ficha trae su galería de imágenes', Array.isArray(prod.imagenes) && prod.imagenes.length > 0);
comprobar('cada imagen tiene su ruta', prod.imagenes.every((i) => typeof i.ruta === 'string' && i.ruta.length > 4));
comprobar('la portada del artículo apunta a un archivo', /\.(webp|jpg|png|svg)$/.test(prod.imagen || ''));
comprobar('los relacionados también traen imagen',
  fichaCompleta.cuerpo.relacionados.every((r) => !!r.imagen));

/* ------------------- Rectificar una talla la reemplaza de verdad ---------- */

/* Existía un fallo real: corregir el texto de una talla (ej. un fallo de
   tecleo) daba de alta la nueva SIN borrar la vieja, así que la tienda
   seguía enseñando y vendiendo la talla que se creía corregida. */
const nuevoArt = await llamar('/api/admin/productos', {
  method: 'POST', headers: admin,
  body: JSON.stringify({
    nombre: 'Prueba de tallas', categoria_id: 'complementos', precio: 9.95,
    variantes: [{ talla: '0M', stock: 5 }]
  })
});
comprobar('crea el artículo de prueba con una talla', nuevoArt.estado === 201, JSON.stringify(nuevoArt.cuerpo).slice(0,120));
const idPrueba = nuevoArt.cuerpo.producto.id;

await llamar(`/api/admin/productos/${idPrueba}`, {
  method: 'PUT', headers: admin, body: JSON.stringify({ variantes: [{ talla: 'RN', stock: 5 }] })
});
const trasRenombrar = await llamar(`/api/admin/productos`, { headers: admin });
const prodTallas = trasRenombrar.cuerpo.productos.find((p) => p.id === idPrueba);
comprobar('renombrar una talla no deja la vieja huérfana', prodTallas?.variantes.length === 1 && prodTallas.variantes[0].talla === 'RN',
  JSON.stringify(prodTallas?.variantes));

await llamar(`/api/admin/productos/${idPrueba}`, { method: 'PUT', headers: admin, body: JSON.stringify({ variantes: [] }) });
const trasVaciar = await llamar(`/api/admin/productos`, { headers: admin });
comprobar('quitar todas las tallas las borra de verdad',
  trasVaciar.cuerpo.productos.find((p) => p.id === idPrueba).variantes.length === 0);

await llamar(`/api/admin/productos/${idPrueba}`, { method: 'DELETE', headers: admin });

/* --------- El CSS crítico de las fotos no se ha perdido en el camino ------ */

/* Esta regla concreta ya se ha perdido dos veces en el camino entre las dos
   versiones del proyecto (esencial y completa) al copiar el CSS de una a
   otra. Sin object-fit, las fotos de la ficha de producto se ven estiradas
   y deformadas, sobre todo en móvil. Se comprueba aquí para que un despiste
   al copiar archivos no vuelva a colarse hasta producción sin que salte
   ninguna alarma. */
const css = await (await fetch(`${B}/assets/css/estilos.css`)).text();
comprobar('la foto de la ficha tiene object-fit (no se estira)',
  /\.producto__medio\s*img\s*\{[^}]*object-fit\s*:\s*contain/.test(css));
comprobar('el marco de la foto reserva su proporción 4:5',
  /\.producto__medio\s*\{[^}]*aspect-ratio\s*:\s*4\s*\/\s*5/.test(css));
comprobar('las líneas de la cesta tampoco se estiran',
  /\.linea\s*img\s*\{[^}]*object-fit\s*:\s*contain/.test(css));

/* ------------------- Borrado definitivo de artículos y clientes ----------- */

/* Un artículo nunca vendido se borra sin más ceremonia. */
const paraBorrar = await llamar('/api/admin/productos', {
  method: 'POST', headers: admin,
  body: JSON.stringify({ nombre: 'Prueba borrado limpio', categoria_id: 'complementos', precio: 9.95 })
});
const idBorrar = paraBorrar.cuerpo.producto.id;
const borradoLimpio = await llamar(`/api/admin/productos/${idBorrar}/eliminar`, { method: 'DELETE', headers: admin });
comprobar('borra sin pedir confirmación un artículo nunca vendido', borradoLimpio.estado === 200 && borradoLimpio.cuerpo.pedidos_afectados === 0);

const listaTrasBorrar = await llamar('/api/admin/productos', { headers: admin });
comprobar('el artículo borrado desaparece del listado',
  !listaTrasBorrar.cuerpo.productos.some((p) => p.id === idBorrar));

/* Un artículo CON ventas exige confirmación explícita, y el pedido conserva
   su propia copia de los datos aunque el producto deje de existir. */
const conVentas = await llamar('/api/admin/productos', {
  method: 'POST', headers: admin,
  body: JSON.stringify({ nombre: 'Prueba con ventas', categoria_id: 'complementos', precio: 20, variantes: [{ talla: 'Única', stock: 5 }] })
});
const idVentas = conVentas.cuerpo.producto.id;
const pedidoDePrueba = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    nombre: 'Compradora', email: `compra${azar}@test.es`, direccion: 'C 1', ciudad: 'Écija', cp: '41400', provincia: 'Sevilla',
    metodo_pago: 'transferencia', items: [{ producto_id: idVentas, talla: 'Única', cantidad: 1 }]
  })
});

const sinConfirmar = await llamar(`/api/admin/productos/${idVentas}/eliminar`, { method: 'DELETE', headers: admin });
comprobar('rechaza borrar un artículo vendido sin confirmar', sinConfirmar.estado === 409 && sinConfirmar.cuerpo.pedidos_afectados === 1);

const conConfirmar = await llamar(`/api/admin/productos/${idVentas}/eliminar?confirmar=1`, { method: 'DELETE', headers: admin });
comprobar('borra el artículo vendido al confirmar', conConfirmar.estado === 200);

const seguimientoTrasBorrar = await llamar('/api/seguimiento', {
  method: 'POST', body: JSON.stringify({ codigo: pedidoDePrueba.cuerpo.pedido.codigo, email: `compra${azar}@test.es` })
});
comprobar('el pedido conserva nombre y precio aunque el producto ya no exista',
  seguimientoTrasBorrar.cuerpo.pedido.lineas[0].nombre === 'Prueba con ventas' && seguimientoTrasBorrar.cuerpo.pedido.lineas[0].precio === 20);

/* Un cliente sin pedidos se borra sin más; nunca se puede borrar un admin
   por esta vía, aunque se fuerce su id. */
await llamar('/api/auth/registro', {
  method: 'POST', body: JSON.stringify({ nombre: 'Cliente Prueba', email: `clientep${azar}@test.es`, password: 'clave1234' })
});
const listaClientes = await llamar('/api/admin/clientes', { headers: admin });
const idClientePrueba = listaClientes.cuerpo.clientes.find((c) => c.email === `clientep${azar}@test.es`).id;
const borradoCliente = await llamar(`/api/admin/clientes/${idClientePrueba}`, { method: 'DELETE', headers: admin });
comprobar('borra sin pedir confirmación un cliente sin pedidos', borradoCliente.estado === 200);

const intentoAdmin = await llamar('/api/admin/clientes/1', { method: 'DELETE', headers: admin });
comprobar('nunca se puede borrar la cuenta de administración por esta vía', intentoAdmin.estado === 404);
const loginTrasIntento = await llamar('/api/auth/login', {
  method: 'POST', body: JSON.stringify({ email: 'admin@modaglobo.es', password: 'admin1234' })
});
comprobar('la cuenta de administración sigue intacta', loginTrasIntento.estado === 200);

console.log(`\n  ${ok} correctas · ${fallos} fallidas\n`);
process.exit(fallos ? 1 : 0);
