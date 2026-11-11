'use strict';

/**
 * Comprobación de los códigos de descuento con la configuración real.
 *
 *   npm run probar-cupon                → revisa .env y los códigos (no llama a Stripe)
 *   npm run probar-cupon -- --stripe    → además crea UNA sesión de pago real de
 *                                         prueba con el descuento, para verla en Stripe
 *   npm run probar-cupon -- --stripe --codigo=BLACKFRIDAY
 *
 * No crea pedidos, no gasta ningún código, no toca stock y no cobra nada: la
 * sesión de prueba no corresponde a ningún pedido (el webhook la ignora) y
 * caduca sola en 24 h si no se paga. Basta con abrirla, ver la línea de
 * descuento y cerrarla. NO LA PAGUES: sería un cobro real.
 */

require('dotenv').config();

const args = process.argv.slice(2);
const conStripe = args.includes('--stripe');
const codigo = (args.find((a) => a.startsWith('--codigo=')) || '--codigo=BIENVENIDA10').split('=')[1].toUpperCase();

const { db } = require('./db');
const { buscarCuponUsable, importeDescuento } = require('./routes/cupones');
const pasarela = require('./pagos/proveedores');

const bien = (t) => console.log(`  ✓ ${t}`);
const mal = (t) => console.log(`  ✗ ${t}`);
const nota = (t) => console.log(`    ${t}`);
let problemas = 0;

(async () => {
  console.log('\n1) Configuración');
  const proveedor = process.env.PAGO_PROVEEDOR || 'simulacion';
  const clave = process.env.STRIPE_SECRET_KEY || '';
  const tipoClave = clave.startsWith('sk_live_') ? 'sk_live (producción, permisos completos)'
    : clave.startsWith('sk_test_') ? 'sk_test (modo pruebas)'
    : clave.startsWith('rk_') ? 'rk (restringida: necesita escritura en Coupons y Checkout Sessions)'
    : clave ? 'formato desconocido' : 'sin clave';
  if (proveedor === 'stripe') bien(`Pasarela: stripe`);
  else { mal(`Pasarela: ${proveedor} (para cobrar con tarjeta debe ser PAGO_PROVEEDOR=stripe)`); problemas++; }
  if (clave.startsWith('sk_')) bien(`Clave de Stripe: ${tipoClave}`);
  else { mal(`Clave de Stripe: ${tipoClave}`); problemas++; }
  if (process.env.STRIPE_WEBHOOK_SECRET) bien('Secreto del webhook configurado');
  else { mal('Falta STRIPE_WEBHOOK_SECRET: los pagos no se confirmarían solos'); problemas++; }

  console.log('\n2) Códigos en la base de datos');
  for (const c of db.prepare("SELECT * FROM cupones WHERE codigo IN ('BIENVENIDA10','BLACKFRIDAY') ORDER BY codigo").all()) {
    const caducado = c.caduca_en && c.caduca_en < new Date().toISOString().slice(0, 10);
    const estado = !c.activo ? 'DESACTIVADO' : caducado ? `CADUCADO (${c.caduca_en})` : 'activo';
    const linea = `${c.codigo}: ${c.valor} % · ${c.solo_precio_normal ? 'solo precio normal' : 'todo el carrito'} · ${c.usos_por_cliente} uso por cliente${c.caduca_en ? ` · hasta ${c.caduca_en}` : ''} → ${estado}`;
    if (estado === 'activo') bien(linea); else { mal(linea); if (c.codigo === codigo) problemas++; }
    const usos = db.prepare('SELECT COUNT(*) n FROM cupones_usados WHERE codigo = ?').get(c.codigo).n;
    nota(`usado ${usos} ${usos === 1 ? 'vez' : 'veces'} en pedidos`);
  }

  const { cupon, motivo } = buscarCuponUsable(codigo, `prueba-${Date.now()}@modaglobo.invalid`, null);
  if (!cupon) { mal(`${codigo} no se puede usar: ${motivo}`); process.exit(1); }

  console.log(`\n3) Cálculo con un artículo a precio normal`);
  const p = db
    .prepare(
      `SELECT p.* FROM productos p
       WHERE p.activo = 1 AND p.precio_antes IS NULL
         AND EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.stock > 0)
       ORDER BY p.precio DESC LIMIT 1`
    )
    .get();
  if (!p) { mal('No hay ningún artículo a precio normal con stock para probar'); process.exit(1); }
  const descuento = importeDescuento(cupon, Number(p.precio));
  const total = Math.round((p.precio - descuento) * 100) / 100;
  bien(`${p.nombre}: ${p.precio.toFixed(2)} € − ${descuento.toFixed(2)} € (${codigo}) = ${total.toFixed(2)} €`);

  if (!conStripe) {
    console.log(`\n${problemas ? '  Hay cosas que revisar arriba.' : '  Todo en orden.'} Para probar con Stripe de verdad (sin cobrar):`);
    console.log('    npm run probar-cupon -- --stripe\n');
    process.exit(problemas ? 1 : 0);
  }

  console.log('\n4) Sesión de pago real en Stripe (sin pedido detrás)');
  if (proveedor !== 'stripe') { mal('PAGO_PROVEEDOR no es stripe: no se puede probar'); process.exit(1); }
  const pedido = {
    id: 0,
    codigo: `PRUEBA-${Date.now()}`,
    email: '',
    subtotal: Number(p.precio),
    descuento,
    cupon: codigo,
    envio: 0,
    total
  };
  try {
    const base = (process.env.SITIO_URL || 'https://modaglobo.com').replace(/\/+$/, '');
    const sesion = await pasarela.crearSesion({
      pedido,
      lineas: [{ nombre: p.nombre, talla: 'prueba', precio: Number(p.precio), cantidad: 1 }],
      base
    });
    bien('Stripe ha aceptado el descuento y ha creado la sesión de pago');
    console.log(`\n  Abre este enlace: debe salir "${p.nombre}" ${p.precio.toFixed(2)} €, la línea`);
    console.log(`  "Descuento ${codigo}" −${descuento.toFixed(2)} € y un total de ${total.toFixed(2)} €.`);
    console.log('  Ciérralo SIN PAGAR (sería un cobro real). Caduca solo en 24 h.\n');
    console.log(`  ${sesion.url}\n`);
  } catch (e) {
    mal(`Stripe ha rechazado la prueba: ${e.message}`);
    nota('El detalle técnico de Stripe aparece justo encima.');
    process.exit(1);
  }
})();
