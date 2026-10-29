'use strict';

/**
 * Pasarelas de pago.
 *
 * Todos los proveedores exponen las
 * mismas dos funciones, así que cambiar de pasarela es cambiar una variable
 * de entorno. Se elige con PAGO_PROVEEDOR:
 *
 *   simulacion  (por defecto)  abre una página local que imita la pasarela.
 *                              Sin claves, sin salir a internet, sin cobrar.
 *                              Sirve para probar el circuito entero.
 *   stripe                     Stripe Checkout (tarjeta y Bizum).
 *
 * La integración usa la API HTTP de Stripe directamente con fetch y verifica
 * la firma con crypto, sin librerías externas: son unas pocas llamadas y así
 * el proyecto no arrastra una dependencia que la mayoría no va a usar.
 */

const crypto = require('crypto');

const PROVEEDOR = process.env.PAGO_PROVEEDOR || 'simulacion';
const CLAVE = process.env.STRIPE_SECRET_KEY || '';
const FIRMA_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET || '';
const METODOS = (process.env.STRIPE_METODOS || 'card').split(',').map((m) => m.trim()).filter(Boolean);

/* Margen de tolerancia de la marca de tiempo de la firma, en segundos.
   Protege frente a reenvíos de un aviso capturado hace horas. */
const TOLERANCIA = 300;

const centimos = (euros) => Math.round(Number(euros) * 100);

/* ------------------------------- Simulación ------------------------------- */

function crearSesionSimulada({ pedido, base }) {
  const referencia = `sim_${crypto.randomBytes(10).toString('hex')}`;
  return {
    referencia,
    url: `${base}/pago-simulado?ref=${referencia}&codigo=${encodeURIComponent(pedido.codigo)}`
  };
}

/* --------------------------------- Stripe --------------------------------- */

/**
 * Crea una sesión de Stripe Checkout.
 * Los importes salen del pedido guardado en la base, nunca de lo que mande
 * el navegador: es la regla que impide que alguien se rebaje el total.
 */
async function crearSesionStripe({ pedido, lineas, base }) {
  if (!CLAVE) throw new Error('Falta STRIPE_SECRET_KEY en el archivo .env.');

  const cuerpo = new URLSearchParams();
  cuerpo.set('mode', 'payment');
  cuerpo.set('client_reference_id', pedido.codigo);
  cuerpo.set('customer_email', pedido.email);
  cuerpo.set('success_url', `${base}/seguimiento?codigo=${pedido.codigo}&email=${encodeURIComponent(pedido.email)}&nuevo=1`);
  cuerpo.set('cancel_url', `${base}/carrito?pago=cancelado`);
  cuerpo.set('locale', 'es');
  cuerpo.set('metadata[codigo]', pedido.codigo);
  cuerpo.set('metadata[pedido_id]', String(pedido.id));

  METODOS.forEach((m, i) => cuerpo.set(`payment_method_types[${i}]`, m));

  lineas.forEach((l, i) => {
    cuerpo.set(`line_items[${i}][quantity]`, String(l.cantidad));
    cuerpo.set(`line_items[${i}][price_data][currency]`, 'eur');
    cuerpo.set(`line_items[${i}][price_data][unit_amount]`, String(centimos(l.precio)));
    cuerpo.set(`line_items[${i}][price_data][product_data][name]`, `${l.nombre} · talla ${l.talla}`);
  });

  /* El envío viaja como una línea más, para que el total de Stripe cuadre
     exactamente con el total del pedido guardado. */
  if (pedido.envio > 0) {
    const i = lineas.length;
    cuerpo.set(`line_items[${i}][quantity]`, '1');
    cuerpo.set(`line_items[${i}][price_data][currency]`, 'eur');
    cuerpo.set(`line_items[${i}][price_data][unit_amount]`, String(centimos(pedido.envio)));
    cuerpo.set(`line_items[${i}][price_data][product_data][name]`, 'Gastos de envío');
  }

  /* Descuento (cupón). Stripe no admite líneas en negativo, así que se crea
     un cupón de un solo uso por el importe exacto y se adjunta a la sesión.
     Así lo que cobra la pasarela sigue cuadrando al céntimo con pedido.total. */
  if (Number(pedido.descuento) > 0) {
    const cuerpoCupon = new URLSearchParams();
    cuerpoCupon.set('amount_off', String(centimos(pedido.descuento)));
    cuerpoCupon.set('currency', 'eur');
    cuerpoCupon.set('duration', 'once');
    cuerpoCupon.set('name', pedido.cupon ? `Descuento ${pedido.cupon}` : 'Descuento');

    const rc = await fetch('https://api.stripe.com/v1/coupons', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLAVE}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `cupon_${pedido.codigo}`
      },
      body: cuerpoCupon
    });
    const datosCupon = await rc.json();
    if (!rc.ok) throw new Error(datosCupon.error?.message || 'No se pudo aplicar el descuento en la pasarela.');
    cuerpo.set('discounts[0][coupon]', datosCupon.id);
  }

  const respuesta = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLAVE}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      /* Si la petición se reintenta, Stripe devuelve la misma sesión
         en lugar de crear una segunda. */
      'Idempotency-Key': `pedido_${pedido.codigo}`
    },
    body: cuerpo
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos.error?.message || 'La pasarela ha rechazado la petición.');
  }
  return { referencia: datos.id, url: datos.url };
}

/* ----------------------------- Firma del aviso ---------------------------- */

/**
 * Verifica la firma de un webhook de Stripe.
 *
 * Sin esto, cualquiera que conozca la URL podría enviar un aviso falso
 * diciendo que un pedido está pagado. Es la parte crítica de la integración.
 *
 * @param {Buffer} cuerpoCrudo el cuerpo tal cual llegó, sin parsear
 * @param {string} cabecera    valor de Stripe-Signature
 * @returns {object} el evento ya verificado
 */
function verificarFirmaStripe(cuerpoCrudo, cabecera) {
  if (!FIRMA_WEBHOOK) throw new Error('Falta STRIPE_WEBHOOK_SECRET en el archivo .env.');
  if (!cabecera) throw new Error('El aviso llegó sin firma.');

  const partes = Object.fromEntries(
    String(cabecera)
      .split(',')
      .map((p) => p.split('='))
      .filter((p) => p.length === 2)
  );

  const marca = partes.t;
  const firmaRecibida = partes.v1;
  if (!marca || !firmaRecibida) throw new Error('La firma del aviso no tiene el formato esperado.');

  const antiguedad = Math.abs(Math.floor(Date.now() / 1000) - Number(marca));
  if (!Number.isFinite(antiguedad) || antiguedad > TOLERANCIA) {
    throw new Error('El aviso está fuera de la ventana de tiempo admitida.');
  }

  const esperada = crypto
    .createHmac('sha256', FIRMA_WEBHOOK)
    .update(`${marca}.${cuerpoCrudo.toString('utf8')}`)
    .digest('hex');

  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from(firmaRecibida, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('La firma del aviso no es válida.');
  }

  return JSON.parse(cuerpoCrudo.toString('utf8'));
}

/* --------------------------------- Fachada -------------------------------- */

const CREADORES = { simulacion: crearSesionSimulada, stripe: crearSesionStripe };

/** @returns {Promise<{referencia: string, url: string}>} */
async function crearSesion(opciones) {
  const fn = CREADORES[PROVEEDOR];
  if (!fn) throw new Error(`La pasarela "${PROVEEDOR}" no está configurada.`);
  return fn(opciones);
}

/** Normaliza el evento de cada proveedor a un formato común. */
function interpretarEvento(evento) {
  if (PROVEEDOR === 'stripe') {
    const objeto = evento.data?.object || {};
    const codigo = objeto.metadata?.codigo || objeto.client_reference_id;
    if (evento.type === 'checkout.session.completed' && objeto.payment_status === 'paid') {
      return { id: evento.id, accion: 'pagado', codigo, referencia: objeto.id };
    }
    if (evento.type === 'checkout.session.expired') {
      return { id: evento.id, accion: 'caducado', codigo, referencia: objeto.id };
    }
    if (evento.type === 'charge.refunded') {
      return { id: evento.id, accion: 'devuelto', codigo, referencia: objeto.id };
    }
    return { id: evento.id, accion: 'ignorar', codigo, referencia: objeto.id };
  }
  return evento;
}

module.exports = {
  PROVEEDOR,
  METODOS,
  crearSesion,
  verificarFirmaStripe,
  interpretarEvento,
  esSimulacion: () => PROVEEDOR === 'simulacion',
  configurado: () => PROVEEDOR === 'simulacion' || (!!CLAVE && !!FIRMA_WEBHOOK)
};
