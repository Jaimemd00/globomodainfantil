/* Pruebas de la firma del webhook.
   Requiere el servidor arrancado con la pasarela en modo stripe:

     PAGO_PROVEEDOR=stripe STRIPE_SECRET_KEY=sk_test_falsa \
     STRIPE_WEBHOOK_SECRET=whsec_prueba node server/index.js

   No llama a Stripe: solo comprueba que el webhook acepta lo que viene
   firmado con el secreto correcto y rechaza todo lo demás. Es la parte que
   impide que alguien marque pedidos como pagados enviando un aviso falso. */

import crypto from 'crypto';

const B = process.env.BASE || 'http://localhost:3000';
const SECRETO = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_prueba';
let ok = 0;
let fallos = 0;

function comprobar(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`); }
  else { fallos++; console.log(`  FALLO ${nombre} ${detalle}`); }
}

/** Firma un cuerpo igual que lo haría Stripe. */
function firmar(cuerpo, secreto = SECRETO, marca = Math.floor(Date.now() / 1000)) {
  const firma = crypto.createHmac('sha256', secreto).update(`${marca}.${cuerpo}`).digest('hex');
  return `t=${marca},v1=${firma}`;
}

async function enviarWebhook(cuerpo, cabecera) {
  const r = await fetch(`${B}/api/pagos/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cabecera ? { 'Stripe-Signature': cabecera } : {}) },
    body: cuerpo
  });
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
}

async function llamar(ruta, opciones = {}) {
  const r = await fetch(B + ruta, { ...opciones, headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
}

console.log('\n  Firma del webhook\n');

const conf = await llamar('/api/pagos/estado');
if (conf.cuerpo.proveedor !== 'stripe') {
  console.log('  Arranca el servidor con PAGO_PROVEEDOR=stripe para ejecutar estas pruebas.\n');
  process.exit(1);
}
comprobar('la pasarela está en modo stripe', conf.cuerpo.simulacion === false);

/* Se crea un pedido real al que apuntarán los avisos. */
const azar = Date.now().toString().slice(-6);
const email = `firma${azar}@test.es`;
const listado = await llamar('/api/productos?porPagina=20');
const SLUG = listado.cuerpo.productos.find((p) => p.stock_total > 3)?.slug;
const ficha = await llamar(`/api/productos/${SLUG}`);
const producto = ficha.cuerpo.producto;
const talla = producto.variantes.find((v) => v.stock > 1);

const pedidoR = await llamar('/api/pedidos', {
  method: 'POST',
  body: JSON.stringify({
    nombre: 'Prueba Firma', email,
    direccion: 'Calle Falsa 1', ciudad: 'Écija', cp: '41400', provincia: 'Sevilla',
    items: [{ producto_id: producto.id, talla: talla.talla, cantidad: 1 }]
  })
});
const codigo = pedidoR.cuerpo.pedido.codigo;
comprobar('crea el pedido de prueba', !!codigo);

const evento = (tipo, id) => JSON.stringify({
  id, type: tipo,
  data: { object: { id: 'cs_test_123', payment_status: 'paid', metadata: { codigo } } }
});

/* ------------------------------ Rechazos ---------------------------------- */

const sinFirma = await enviarWebhook(evento('checkout.session.completed', 'evt_1'), null);
comprobar('rechaza un aviso sin firma', sinFirma.estado === 400, sinFirma.cuerpo.error);

const firmaMala = await enviarWebhook(evento('checkout.session.completed', 'evt_2'), 't=1,v1=deadbeef');
comprobar('rechaza una firma inventada', firmaMala.estado === 400, firmaMala.cuerpo.error);

const otroSecreto = await enviarWebhook(
  evento('checkout.session.completed', 'evt_3'),
  firmar(evento('checkout.session.completed', 'evt_3'), 'whsec_otro_distinto')
);
comprobar('rechaza una firma hecha con otro secreto', otroSecreto.estado === 400, otroSecreto.cuerpo.error);

const cuerpoA = evento('checkout.session.completed', 'evt_4');
const cuerpoB = evento('checkout.session.completed', 'evt_5');
const manipulado = await enviarWebhook(cuerpoB, firmar(cuerpoA));
comprobar('rechaza un cuerpo alterado tras firmarlo', manipulado.estado === 400, manipulado.cuerpo.error);

const viejo = evento('checkout.session.completed', 'evt_6');
const caducada = await enviarWebhook(viejo, firmar(viejo, SECRETO, Math.floor(Date.now() / 1000) - 3600));
comprobar('rechaza una firma vieja (protege de reenvíos)', caducada.estado === 400, caducada.cuerpo.error);

const sinPagar = await llamar('/api/seguimiento', { method: 'POST', body: JSON.stringify({ codigo, email }) });
comprobar('ningún aviso falso ha tocado el pedido', sinPagar.cuerpo.pedido.estado === 'pendiente');

/* ------------------------------ Aceptación -------------------------------- */

const bueno = evento('checkout.session.completed', 'evt_bueno_1');
const aceptado = await enviarWebhook(bueno, firmar(bueno));
comprobar('acepta el aviso bien firmado', aceptado.estado === 200, JSON.stringify(aceptado.cuerpo));
comprobar('y lo aplica', aceptado.cuerpo.hecho === 'pagado', JSON.stringify(aceptado.cuerpo));

const trasPago = await llamar('/api/seguimiento', { method: 'POST', body: JSON.stringify({ codigo, email }) });
comprobar('el pedido queda pagado', trasPago.cuerpo.pedido.estado === 'pagado');

const dosVeces = await enviarWebhook(bueno, firmar(bueno));
comprobar('el mismo evento repetido se ignora', dosVeces.cuerpo.hecho === 'repetido', JSON.stringify(dosVeces.cuerpo));

const eventosPago = trasPago.cuerpo.pedido.eventos.filter((e) => e.estado === 'pagado').length;
comprobar('sin eventos de pago duplicados', eventosPago === 1, `hay ${eventosPago}`);

const irrelevante = JSON.stringify({ id: 'evt_otro', type: 'payment_intent.created', data: { object: { metadata: { codigo } } } });
const ignorado = await enviarWebhook(irrelevante, firmar(irrelevante));
comprobar('los eventos que no interesan se ignoran sin error', ignorado.estado === 200 && ignorado.cuerpo.hecho === 'ignorado');

console.log(`\n  ${ok} correctas · ${fallos} fallidas\n`);
process.exit(fallos ? 1 : 0);
