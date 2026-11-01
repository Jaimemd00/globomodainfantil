'use strict';

/**
 * Cupones de descuento.
 *
 * Toda la lógica de "cuánto se descuenta" vive aquí y la usan dos sitios:
 *   - POST /api/cupones/validar  → para que el checkout enseñe el descuento
 *                                   antes de confirmar (solo informa).
 *   - routes/pedidos.js          → al crear el pedido, que es donde el
 *                                   descuento se calcula DE VERDAD y se guarda.
 *
 * Regla de oro, igual que con los pagos: el importe final se calcula siempre
 * en el servidor a partir del catálogo real. Nada de lo que mande el
 * navegador decide lo que se descuenta.
 */

const express = require('express');
const { db } = require('../db');
const { opcional } = require('../middleware/auth');
const { limitar } = require('../middleware/limites');

const router = express.Router();

const euros = (n) => Math.round(n * 100) / 100;

/* Tope del cupón por IP: aunque se cambie de correo en cada pedido, una misma
   conexión solo puede aprovechar el descuento un número limitado de veces en
   una ventana de días. Configurable por .env. Ventana (no de por vida) para
   no castigar para siempre a conexiones compartidas (CGNAT, un colegio…). */
const MAX_POR_IP = Number(process.env.CUPON_MAX_POR_IP || 5);
const IP_DIAS = Number(process.env.CUPON_IP_DIAS || 30);

const limiteCupon = limitar({
  accion: 'cupon',
  ventanaMs: 60 * 60 * 1000,
  max: Number(process.env.CUPON_VALIDAR_MAX || 40),
  mensaje: 'Has comprobado demasiados códigos seguidos. Espera un momento.'
});

/** ¿La prenda está ya rebajada? (tiene precio_antes y es mayor que el actual) */
function estaRebajada(producto) {
  return producto.precio_antes != null && Number(producto.precio_antes) > Number(producto.precio);
}

/**
 * Busca un cupón y comprueba que este cliente puede usarlo.
 * Devuelve { cupon } si es usable, o { motivo } con el porqué si no lo es.
 */
function buscarCuponUsable(codigo, email, ip) {
  const clave = String(codigo || '').trim().toUpperCase();
  if (!clave) return { motivo: null }; // sin cupón, sin descuento (no es un error)

  const cupon = db.prepare('SELECT * FROM cupones WHERE codigo = ?').get(clave);
  if (!cupon || !cupon.activo) return { motivo: 'Ese código no es válido.' };

  if (cupon.caduca_en && cupon.caduca_en < new Date().toISOString().slice(0, 10)) {
    return { motivo: 'Ese código ya ha caducado.' };
  }

  /* Límite de usos por cliente (el de bienvenida es 1). Se mira por correo,
     que es lo que identifica al cliente tanto si compra con cuenta como sin
     ella. Si todavía no hay correo (lo valida antes de escribirlo), se deja
     pasar y el control real se hace al confirmar el pedido. */
  const correo = String(email || '').trim().toLowerCase();
  if (correo && cupon.usos_por_cliente > 0) {
    const usos = db
      .prepare('SELECT COUNT(*) AS n FROM cupones_usados WHERE codigo = ? AND LOWER(email) = ?')
      .get(cupon.codigo, correo).n;
    if (usos >= cupon.usos_por_cliente) {
      return { motivo: 'Este código ya lo has usado. Es de un solo uso por cliente.' };
    }
  }

  /* Tope por IP: frena el farmeo con correos nuevos desde la misma conexión.
     Solo aplica a cupones limitados (los de bienvenida), y en una ventana de
     días para que una conexión compartida no quede bloqueada para siempre. */
  if (ip && cupon.usos_por_cliente > 0) {
    const usosIp = db
      .prepare(
        `SELECT COUNT(*) AS n FROM cupones_usados
         WHERE codigo = ? AND ip = ? AND usado_en >= datetime('now', ?)`
      )
      .get(cupon.codigo, ip, `-${IP_DIAS} days`).n;
    if (usosIp >= MAX_POR_IP) {
      return { motivo: 'Este descuento ya se ha usado el máximo de veces desde tu conexión.' };
    }
  }

  return { cupon };
}

/**
 * Base sobre la que se aplica el descuento a partir de una cesta en crudo
 * [{ producto_id, talla, cantidad }]. Si el cupón es "solo precio normal",
 * las prendas ya rebajadas no suman. Devuelve el importe elegible en euros.
 */
function baseElegible(items, cupon) {
  let base = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const cantidad = Math.max(1, Math.min(20, parseInt(item.cantidad, 10) || 1));
    const producto = db.prepare('SELECT precio, precio_antes FROM productos WHERE id = ? AND activo = 1').get(item.producto_id);
    if (!producto) continue;
    if (cupon.solo_precio_normal && estaRebajada(producto)) continue;
    base += Number(producto.precio) * cantidad;
  }
  return euros(base);
}

/** Importe a descontar de una base, respetando el mínimo de compra. */
function importeDescuento(cupon, base) {
  if (base <= 0) return 0;
  if (cupon.minimo && base < cupon.minimo) return 0;
  if (cupon.tipo === 'fijo') return euros(Math.min(cupon.valor, base));
  return euros(base * (cupon.valor / 100)); // porcentaje
}

/**
 * Cálculo completo a partir de una cesta en crudo. Lo usa el endpoint de
 * validación. No registra nada: solo informa.
 */
function calcularDescuento({ items, codigo, email, ip }) {
  const { cupon, motivo } = buscarCuponUsable(codigo, email, ip);
  if (!cupon) return { valido: false, descuento: 0, motivo };

  const base = baseElegible(items, cupon);
  const descuento = importeDescuento(cupon, base);

  if (descuento <= 0) {
    const porRebajas = cupon.solo_precio_normal
      ? ' Solo se aplica sobre prendas a precio normal, y en tu cesta no hay ninguna ahora mismo.'
      : '';
    const porMinimo = cupon.minimo && base < cupon.minimo ? ` Necesitas un mínimo de ${cupon.minimo} € en prendas que cuenten.` : '';
    return { valido: false, descuento: 0, motivo: `Este código no aplica a tu cesta.${porMinimo}${porRebajas}`.trim() };
  }

  return {
    valido: true,
    descuento,
    cupon: cupon.codigo,
    etiqueta: cupon.descripcion || cupon.codigo,
    base,
    motivo: null
  };
}

// POST /api/cupones/validar — el checkout pregunta cuánto descuenta un código
router.post('/cupones/validar', limiteCupon, opcional, (req, res) => {
  const email = String(req.body.email || req.usuario?.email || '').trim().toLowerCase();
  const resultado = calcularDescuento({
    items: req.body.items,
    codigo: req.body.codigo,
    email,
    ip: req.ip
  });
  res.json(resultado);
});

module.exports = router;
module.exports.buscarCuponUsable = buscarCuponUsable;
module.exports.importeDescuento = importeDescuento;
module.exports.estaRebajada = estaRebajada;
