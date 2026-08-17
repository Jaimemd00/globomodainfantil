/* Pruebas de la pasarela de pago. Requiere el servidor arrancado. */

import crypto from 'crypto';

const B = process.env.BASE || 'http://localhost:3000';
let ok = 0;
let fallos = 0;

function comprobar(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`); }
  else { fallos++; console.log(`  FALLO ${nombre} ${detalle}`); }
}

async function llamar(ruta, opciones = {}, token = null) {
  const cabeceras = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  const r = await fetch(B + ruta, { ...opciones, headers: cabeceras });
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
}

const azar = Date.now().toString().slice(-6);

/** Crea un pedido pendiente y devuelve el pedido y la talla usada. */
async function crearPedido(email) {
  const listado = await llamar('/api/productos?porPagina=20');
const SLUG = listado.cuerpo.productos.find((p) => p.stock_total > 3)?.slug;
comprobar('hay un artículo con stock para las pruebas', !!SLUG, 'ejecuta npm run reset');
const ficha = await llamar(`/api/productos/${SLUG}`);
  const producto = ficha.cuerpo.producto;
  const talla = producto.variantes.find((v) => v.stock > 2);
  const r = await llamar('/api/pedidos', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Prueba Pago', email,
      direccion: 'Calle Falsa 1', ciudad: 'Écija', cp: '41400', provincia: 'Sevilla',
      metodo_pago: 'tarjeta',
      items: [{ producto_id: producto.id, talla: talla.talla, cantidad: 2 }]
    })
  });
  return { pedido: r.cuerpo.pedido, slug: producto.slug, talla: talla.talla, estado: r.estado };
}

const stockDe = async (slug, talla) => {
  const f = await llamar(`/api/productos/${slug}`);
  return f.cuerpo.producto.variantes.find((v) => v.talla === talla).stock;
};

console.log('\n  Pasarela de pago\n');

/* ------------------------------ Configuración ----------------------------- */

const estado = await llamar('/api/pagos/estado');
comprobar('informa del proveedor de pago', !!estado.cuerpo.proveedor, JSON.stringify(estado.cuerpo));
comprobar('arranca en modo simulación', estado.cuerpo.simulacion === true);
comprobar('se declara configurado', estado.cuerpo.configurado === true);

/* ---------------------------- Pago correcto ------------------------------- */

const emailA = `pagoA${azar}@test.es`;
const a = await crearPedido(emailA);
comprobar('crea el pedido pendiente', a.estado === 201 && a.pedido.estado === 'pendiente');

const stockTrasPedido = await stockDe(a.slug, a.talla);

const sesion = await llamar('/api/pagos/sesion', {
  method: 'POST',
  body: JSON.stringify({ codigo: a.pedido.codigo, email: emailA })
});
comprobar('crea la sesión de pago', sesion.estado === 200 && !!sesion.cuerpo.url, JSON.stringify(sesion.cuerpo).slice(0, 120));
comprobar('la sesión devuelve una referencia', !!sesion.cuerpo.referencia);

const ajeno = await llamar('/api/pagos/sesion', {
  method: 'POST',
  body: JSON.stringify({ codigo: a.pedido.codigo, email: 'otro@test.es' })
});
comprobar('no crea sesión con un correo que no es el del pedido', ajeno.estado === 404);

const confirmado = await llamar('/api/pagos/simulado', {
  method: 'POST',
  body: JSON.stringify({ codigo: a.pedido.codigo, referencia: sesion.cuerpo.referencia, accion: 'pagar' })
});
comprobar('el pago marca el pedido como pagado', confirmado.cuerpo.estado === 'pagado', JSON.stringify(confirmado.cuerpo));

const seguimiento = await llamar('/api/seguimiento', {
  method: 'POST', body: JSON.stringify({ codigo: a.pedido.codigo, email: emailA })
});
comprobar('el cliente ve el estado actualizado', seguimiento.cuerpo.pedido?.estado === 'pagado');
comprobar('queda registrado el evento de pago', seguimiento.cuerpo.pedido.eventos.some((e) => e.estado === 'pagado'));

/* ------------------------------ Idempotencia ------------------------------ */

const repetido = await llamar('/api/pagos/simulado', {
  method: 'POST',
  body: JSON.stringify({ codigo: a.pedido.codigo, referencia: sesion.cuerpo.referencia, accion: 'pagar' })
});
comprobar('repetir el aviso no rompe nada', repetido.estado === 200);
comprobar('el aviso repetido se detecta como tal', repetido.cuerpo.hecho === 'repetido', JSON.stringify(repetido.cuerpo));

const trasRepetir = await llamar('/api/seguimiento', {
  method: 'POST', body: JSON.stringify({ codigo: a.pedido.codigo, email: emailA })
});
const eventosPago = trasRepetir.cuerpo.pedido.eventos.filter((e) => e.estado === 'pagado').length;
comprobar('no duplica el evento de pago', eventosPago === 1, `hay ${eventosPago}`);

const sesionPagado = await llamar('/api/pagos/sesion', {
  method: 'POST', body: JSON.stringify({ codigo: a.pedido.codigo, email: emailA })
});
comprobar('no deja pagar dos veces el mismo pedido', sesionPagado.estado === 409);

/* --------------------------- Pago fallido y stock ------------------------- */

const emailB = `pagoB${azar}@test.es`;
const b = await crearPedido(emailB);
const stockReservado = await stockDe(b.slug, b.talla);

const sesionB = await llamar('/api/pagos/sesion', {
  method: 'POST', body: JSON.stringify({ codigo: b.pedido.codigo, email: emailB })
});

const fallido = await llamar('/api/pagos/simulado', {
  method: 'POST',
  body: JSON.stringify({ codigo: b.pedido.codigo, referencia: sesionB.cuerpo.referencia, accion: 'cancelar' })
});
comprobar('el pago fallido cancela el pedido', fallido.cuerpo.estado === 'cancelado', JSON.stringify(fallido.cuerpo));

const stockDevuelto = await stockDe(b.slug, b.talla);
comprobar('el stock reservado vuelve al catálogo', stockDevuelto === stockReservado + 2, `${stockReservado} → ${stockDevuelto}`);

/* ---------------------- Cancelación desde la trastienda ------------------- */

const emailC = `pagoC${azar}@test.es`;
const c = await crearPedido(emailC);
const stockC = await stockDe(c.slug, c.talla);

const login = await llamar('/api/auth/login', {
  method: 'POST', body: JSON.stringify({ email: 'admin@modaglobo.es', password: 'admin1234' })
});
const admin = login.cuerpo.token;

await llamar(`/api/admin/pedidos/${c.pedido.codigo}/estado`, {
  method: 'PUT', body: JSON.stringify({ estado: 'cancelado', mensaje: 'Prueba' })
}, admin);

const stockTrasCancelar = await stockDe(c.slug, c.talla);
comprobar('cancelar desde el panel repone el stock', stockTrasCancelar === stockC + 2, `${stockC} → ${stockTrasCancelar}`);

const doblecancelar = await llamar(`/api/admin/pedidos/${c.pedido.codigo}/estado`, {
  method: 'PUT', body: JSON.stringify({ estado: 'cancelado' })
}, admin);
const stockFinal = await stockDe(c.slug, c.talla);
comprobar('cancelar dos veces no duplica el stock', stockFinal === stockTrasCancelar, `${stockTrasCancelar} → ${stockFinal}`);

/* ------------------------------ Webhook real ------------------------------ */

const webhookSimulacion = await fetch(`${B}/api/pagos/webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
});
comprobar('el webhook está cerrado en modo simulación', webhookSimulacion.status === 400);

/* La verificación de firma se prueba aparte, arrancando el servidor con
   PAGO_PROVEEDOR=stripe. Se comprueba desde pruebas-firma.mjs. */

/* --------------- Que el navegador no pueda fijar el importe --------------- */

const listado = await llamar('/api/productos?porPagina=20');
const SLUG = listado.cuerpo.productos.find((p) => p.stock_total > 3)?.slug;
comprobar('hay un artículo con stock para las pruebas', !!SLUG, 'ejecuta npm run reset');
const ficha = await llamar(`/api/productos/${SLUG}`);
const libre = ficha.cuerpo.producto.variantes.find((v) => v.stock > 0);

/* Se manda un total ridículo junto al pedido: el servidor debe ignorarlo y
   recalcular a partir del precio guardado. Es la defensa que impide que
   alguien se rebaje la compra manipulando la petición desde la consola. */
const manipulado = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    nombre: 'Listillo', email: `listo${azar}@test.es`,
    direccion: 'C 1', ciudad: 'Écija', cp: '41400', provincia: 'Sevilla',
    metodo_pago: 'tarjeta', total: 0.01, subtotal: 0.01, envio: 0,
    items: [{ producto_id: ficha.cuerpo.producto.id, talla: libre.talla, cantidad: 1 }]
  })
});
comprobar('ignora el total que manda el navegador',
  manipulado.cuerpo.pedido?.total >= ficha.cuerpo.producto.precio,
  `total resultante: ${manipulado.cuerpo.pedido?.total}`);
comprobar('el total cuadra con subtotal más envío',
  Math.abs(manipulado.cuerpo.pedido.total - (manipulado.cuerpo.pedido.subtotal + manipulado.cuerpo.pedido.envio)) < 0.001);

/* ------------------------- Los otros métodos de pago ---------------------- */

/* Se relee el stock: las comprobaciones anteriores ya han consumido unidades
   de la talla que se eligió al principio. */
const ficha2 = await llamar(`/api/productos/${SLUG}`);
const libre2 = ficha2.cuerpo.producto.variantes.find((v) => v.stock > 0);
comprobar('queda stock para la última comprobación', !!libre2, 'ejecuta npm run reset');

const transferencia = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    nombre: 'Transferencia', email: `trans${azar}@test.es`,
    direccion: 'C 1', ciudad: 'Écija', cp: '41400', provincia: 'Sevilla',
    metodo_pago: 'transferencia',
    items: [{ producto_id: ficha2.cuerpo.producto.id, talla: libre2.talla, cantidad: 1 }]
  })
});
comprobar('la transferencia funciona sin pasar por la pasarela', transferencia.estado === 201);
comprobar('y queda pendiente hasta confirmarla a mano', transferencia.cuerpo.pedido.estado === 'pendiente');

const pagina = await fetch(`${B}/pago-simulado`);
comprobar('la página de pago de prueba responde', pagina.status === 200);

console.log(`\n  ${ok} correctas · ${fallos} fallidas\n`);
process.exit(fallos ? 1 : 0);
