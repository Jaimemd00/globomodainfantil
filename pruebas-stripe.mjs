/**
 * Pruebas del cobro con Stripe cuando hay código de descuento.
 *
 * No llama a Stripe de verdad ni necesita el servidor: sustituye fetch por una
 * Stripe simulada y comprueba qué se le enviaría. Así se verifica que un
 * pedido con BIENVENIDA10 o BLACKFRIDAY se cobra exactamente por su total,
 * sin tener que dar de alta ningún cupón en el panel de Stripe.
 */
import { createRequire } from 'module';

process.env.PAGO_PROVEEDOR = 'stripe';
process.env.STRIPE_SECRET_KEY = 'sk_test_prueba';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_prueba';

const require = createRequire(import.meta.url);
const pasarela = require('./server/pagos/proveedores.js');

let ok = 0;
let fallos = 0;
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}

let llamadas = [];
let rechazarCupon = false;
global.fetch = async (url, opciones) => {
  const cuerpo = Object.fromEntries(new URLSearchParams(opciones.body.toString()));
  llamadas.push({ url, cuerpo });
  if (url.endsWith('/v1/coupons')) {
    if (rechazarCupon) {
      return { ok: false, status: 403, json: async () => ({ error: { message: "The provided key 'rk_live_***' does not have the required permissions" } }) };
    }
    return { ok: true, json: async () => ({ id: 'cupon_de_prueba' }) };
  }
  return { ok: true, json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }) };
};

const lineas = [{ nombre: 'Peto paño', talla: '6M', precio: 39.95, cantidad: 2 }];
const cobrado = (ll) => {
  const s = ll.find((l) => l.url.endsWith('/checkout/sessions')).cuerpo;
  let total = 0;
  for (let i = 0; s[`line_items[${i}][quantity]`]; i++) {
    total += Number(s[`line_items[${i}][price_data][unit_amount]`]) * Number(s[`line_items[${i}][quantity]`]);
  }
  const cupon = ll.find((l) => l.url.endsWith('/v1/coupons'));
  return (total - (cupon ? Number(cupon.cuerpo.amount_off) : 0)) / 100;
};

console.log('\nStripe con código de descuento');

/* 1. Pedido con descuento y envío */
llamadas = [];
const conDescuento = { id: 1, codigo: 'GLB-T1', email: 'c@t.es', subtotal: 79.9, descuento: 7.99, cupon: 'BIENVENIDA10', envio: 4.95, total: 76.86 };
await pasarela.crearSesion({ pedido: conDescuento, lineas, base: 'https://modaglobo.com' });
const cupon = llamadas.find((l) => l.url.endsWith('/v1/coupons'));
const sesion = llamadas.find((l) => l.url.endsWith('/checkout/sessions'));
comprobar('crea en Stripe un descuento por el importe exacto (7,99 € = 799 céntimos)', cupon?.cuerpo.amount_off === '799' && cupon?.cuerpo.currency === 'eur');
comprobar('el descuento es de un solo uso (duration=once)', cupon?.cuerpo.duration === 'once');
comprobar('la sesión de pago lleva ese descuento adjunto', sesion?.cuerpo['discounts[0][coupon]'] === 'cupon_de_prueba');
comprobar('Stripe cobra exactamente el total del pedido (envío incluido)', Math.abs(cobrado(llamadas) - conDescuento.total) < 0.001, `cobra ${cobrado(llamadas)} vs ${conDescuento.total}`);

/* 2. Pedido sin descuento: no se crea cupón */
llamadas = [];
const sinDescuento = { id: 2, codigo: 'GLB-T2', email: 'c@t.es', subtotal: 79.9, descuento: 0, cupon: null, envio: 0, total: 79.9 };
await pasarela.crearSesion({ pedido: sinDescuento, lineas, base: 'https://modaglobo.com' });
comprobar('sin código no se crea ningún descuento en Stripe', !llamadas.some((l) => l.url.endsWith('/v1/coupons')));
comprobar('sin código se cobra el total normal', Math.abs(cobrado(llamadas) - 79.9) < 0.001);

/* 3. Stripe rechaza crear el descuento (clave sin permisos): aviso claro, sin datos de la clave */
rechazarCupon = true;
llamadas = [];
const errorOriginal = console.error;
console.error = () => {};
let mensaje = '';
try {
  await pasarela.crearSesion({ pedido: { ...conDescuento, codigo: 'GLB-T3' }, lineas, base: 'https://modaglobo.com' });
} catch (e) {
  mensaje = e.message;
}
console.error = errorOriginal;
comprobar('si Stripe rechaza el descuento, la clienta ve un aviso claro', /código de descuento/i.test(mensaje), mensaje);
comprobar('ese aviso no expone nada de la clave de Stripe', !/rk_|sk_|key/i.test(mensaje));
comprobar('y no llega a crear una sesión de pago a precio completo', !llamadas.some((l) => l.url.endsWith('/checkout/sessions')));

console.log(`\n  ${ok} correctas · ${fallos} fallidas\n`);
process.exit(fallos ? 1 : 0);
