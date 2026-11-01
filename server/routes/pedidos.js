'use strict';

const crypto = require('crypto');
const express = require('express');
const { db, ESTADOS_TEXTO } = require('../db');
const { opcional, requerido } = require('../middleware/auth');
const { buscarCuponUsable, importeDescuento, estaRebajada } = require('./cupones');
const { limitar } = require('../middleware/limites');

/* Tope por IP de creación de pedidos: frena bots sin molestar a un cliente
   real (que no hace decenas de pedidos por hora). Configurable por .env. */
const limitePedido = limitar({
  accion: 'pedido',
  ventanaMs: 60 * 60 * 1000,
  max: Number(process.env.PEDIDO_MAX || 40),
  mensaje: 'Se han creado demasiados pedidos desde tu conexión. Espera un momento.'
});

const router = express.Router();

const ENVIO_ESTANDAR = Number(process.env.ENVIO_ESTANDAR || 4.95);
const ENVIO_GRATIS_DESDE = Number(process.env.ENVIO_GRATIS_DESDE || 49);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const CP_RE = /^\d{5}$/;

/* Dirección de la tienda, usada cuando el cliente elige recoger en persona. */
const TIENDA = {
  direccion: 'Plaza Giles y Rubio · Recogida en tienda',
  ciudad: 'Écija',
  cp: '41400',
  provincia: 'Sevilla'
};

function generarCodigo() {
  const f = new Date();
  const ymd = `${String(f.getFullYear()).slice(2)}${String(f.getMonth() + 1).padStart(2, '0')}${String(
    f.getDate()
  ).padStart(2, '0')}`;
  const azar = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GLB-${ymd}-${azar}`;
}

function euros(n) {
  return Math.round(n * 100) / 100;
}

function cargarPedido(pedido) {
  if (!pedido) return null;
  pedido.lineas = db.prepare('SELECT * FROM pedido_lineas WHERE pedido_id = ? ORDER BY id').all(pedido.id);
  pedido.eventos = db
    .prepare('SELECT estado, mensaje, creado_en FROM pedido_eventos WHERE pedido_id = ? ORDER BY id')
    .all(pedido.id);
  pedido.estado_texto = ESTADOS_TEXTO[pedido.estado] || pedido.estado;
  return pedido;
}

// GET /api/envio — reglas de envío para que el front no las duplique a ciegas
router.get('/envio', (_req, res) => {
  res.json({ estandar: ENVIO_ESTANDAR, gratis_desde: ENVIO_GRATIS_DESDE, tienda: TIENDA });
});

// POST /api/pedidos — crear pedido (invitado o cliente registrado)
router.post('/pedidos', limitePedido, opcional, (req, res) => {
  const c = req.body || {};
  const items = Array.isArray(c.items) ? c.items : [];

  if (!items.length) return res.status(400).json({ error: 'El carrito está vacío.' });

  const recogida = c.metodo_envio === 'recogida';

  /* Si recoge en tienda, la dirección la ponemos nosotros: no se la pedimos. */
  const envioDatos = recogida ? { ...TIENDA } : {
    direccion: String(c.direccion || '').trim(),
    ciudad: String(c.ciudad || '').trim(),
    cp: String(c.cp || '').trim(),
    provincia: String(c.provincia || '').trim()
  };

  if (!String(c.nombre || '').trim()) return res.status(400).json({ error: 'Falta el nombre.' });
  if (!recogida) {
    const obligatorios = { direccion: 'dirección', ciudad: 'ciudad', cp: 'código postal', provincia: 'provincia' };
    for (const [campo, etiqueta] of Object.entries(obligatorios)) {
      if (!envioDatos[campo]) return res.status(400).json({ error: `Falta el ${etiqueta}.` });
    }
    if (!CP_RE.test(envioDatos.cp)) return res.status(400).json({ error: 'El código postal debe tener 5 dígitos.' });
  }

  const email = String(c.email || req.usuario?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Necesitamos un correo válido para enviarte el seguimiento.' });

  /* Cupón (opcional). Se resuelve antes de recorrer la cesta para saber si
     cuenta o no las prendas ya rebajadas. Si el cliente manda un código que
     no sirve (caducado, ya usado…), se corta el pedido con el motivo, para
     que no crea que le hemos aplicado un descuento que no existe. */
  const codigoCupon = String(c.cupon || '').trim().toUpperCase();
  let cupon = null;

  const crear = db.transaction(() => {
    const lineas = [];
    let subtotal = 0;
    let baseElegible = 0; // importe sobre el que puede aplicarse el cupón

    for (const item of items) {
      const cantidad = Math.max(1, Math.min(20, parseInt(item.cantidad, 10) || 1));
      const producto = db.prepare('SELECT * FROM productos WHERE id = ? AND activo = 1').get(item.producto_id);
      if (!producto) throw Object.assign(new Error('Uno de los artículos ya no está disponible.'), { code: 409 });

      const variante = db
        .prepare('SELECT * FROM variantes WHERE producto_id = ? AND talla = ?')
        .get(producto.id, String(item.talla || ''));
      if (!variante) throw Object.assign(new Error(`Talla no disponible en ${producto.nombre}.`), { code: 409 });
      if (variante.stock < cantidad) {
        throw Object.assign(new Error(`Solo quedan ${variante.stock} uds. de ${producto.nombre} (talla ${variante.talla}).`), {
          code: 409
        });
      }

      db.prepare('UPDATE variantes SET stock = stock - ? WHERE id = ?').run(cantidad, variante.id);
      subtotal += producto.precio * cantidad;
      if (cupon && (!cupon.solo_precio_normal || !estaRebajada(producto))) {
        baseElegible += producto.precio * cantidad;
      }
      lineas.push({
        producto_id: producto.id,
        nombre: producto.nombre,
        sku: producto.sku,
        imagen: producto.imagen,
        talla: variante.talla,
        precio: producto.precio,
        cantidad
      });
    }

    subtotal = euros(subtotal);

    /* El descuento solo cuenta si de verdad rebaja algo; si el cupón no
       aplica a esta cesta (p. ej. todo está ya rebajado), se guarda 0 y no
       se marca como usado, para que el cliente pueda aprovecharlo otro día. */
    const descuento = cupon ? importeDescuento(cupon, euros(baseElegible)) : 0;
    const cuponAplicado = descuento > 0 ? cupon.codigo : null;

    /* El envío gratis se mide por el subtotal (antes del descuento): así el
       cupón no sube de golpe los gastos de envío por bajar de los 49 €. */
    const envio = recogida || subtotal >= ENVIO_GRATIS_DESDE ? 0 : ENVIO_ESTANDAR;
    const total = euros(subtotal - descuento + envio);

    let codigo = generarCodigo();
    while (db.prepare('SELECT 1 FROM pedidos WHERE codigo = ?').get(codigo)) codigo = generarCodigo();

    const info = db
      .prepare(
        `INSERT INTO pedidos (codigo, usuario_id, email, nombre, telefono, direccion, ciudad, cp, provincia, pais,
                              notas, metodo_pago, metodo_envio, subtotal, descuento, cupon, envio, total, estado)
         VALUES (@codigo, @usuario_id, @email, @nombre, @telefono, @direccion, @ciudad, @cp, @provincia, @pais,
                 @notas, @metodo_pago, @metodo_envio, @subtotal, @descuento, @cupon, @envio, @total, 'pendiente')`
      )
      .run({
        codigo,
        usuario_id: req.usuario?.id ?? null,
        email,
        nombre: String(c.nombre).trim(),
        telefono: String(c.telefono || '').trim(),
        direccion: envioDatos.direccion,
        ciudad: envioDatos.ciudad,
        cp: envioDatos.cp,
        provincia: envioDatos.provincia,
        pais: String(c.pais || 'España').trim(),
        notas: String(c.notas || '').trim(),
        metodo_pago: ['tarjeta', 'transferencia', 'contrareembolso'].includes(c.metodo_pago) ? c.metodo_pago : 'tarjeta',
        metodo_envio: recogida ? 'recogida' : 'domicilio',
        subtotal,
        descuento,
        cupon: cuponAplicado,
        envio,
        total
      });

    const pedidoId = info.lastInsertRowid;

    /* Si el cupón se aplicó, se registra el uso para que no pueda repetirse
       (el de bienvenida es de un solo uso por cliente). */
    if (cuponAplicado) {
      db.prepare(
        'INSERT INTO cupones_usados (codigo, email, usuario_id, pedido_id, ip) VALUES (?, ?, ?, ?, ?)'
      ).run(cuponAplicado, email, req.usuario?.id ?? null, pedidoId, req.ip || null);
    }
    const insLinea = db.prepare(
      `INSERT INTO pedido_lineas (pedido_id, producto_id, nombre, sku, imagen, talla, precio, cantidad)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of lineas) {
      insLinea.run(pedidoId, l.producto_id, l.nombre, l.sku, l.imagen, l.talla, l.precio, l.cantidad);
    }

    db.prepare('INSERT INTO pedido_eventos (pedido_id, estado, mensaje) VALUES (?, ?, ?)').run(
      pedidoId,
      'pendiente',
      recogida
        ? 'Hemos recibido tu pedido. Te avisamos por teléfono cuando puedas pasar a recogerlo por la tienda.'
        : 'Hemos recibido tu pedido. Te avisamos en cuanto confirmemos el pago.'
    );

    return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
  });

  try {
    /* Si viene cupón, se comprueba aquí (dentro del try) para que un código
       caducado o ya usado devuelva un aviso claro y no un error 500. */
    if (codigoCupon) {
      const r = buscarCuponUsable(codigoCupon, email, req.ip);
      if (!r.cupon) throw Object.assign(new Error(r.motivo || 'Ese código no es válido.'), { code: 400 });
      cupon = r.cupon;
    }
    const pedido = crear();
    res.status(201).json({ pedido: cargarPedido(pedido) });
  } catch (err) {
    res.status(err.code === 409 ? 409 : 400).json({ error: err.message });
  }
});

// GET /api/pedidos — historial del cliente
router.get('/pedidos', requerido, (req, res) => {
  const pedidos = db
    .prepare('SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY id DESC')
    .all(req.usuario.id)
    .map(cargarPedido);
  res.json({ pedidos });
});

// GET /api/pedidos/:codigo — detalle para el cliente propietario
router.get('/pedidos/:codigo', requerido, (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE codigo = ?').get(req.params.codigo);
  if (!pedido) return res.status(404).json({ error: 'No encontramos ese pedido.' });
  const suyo = pedido.usuario_id === req.usuario.id || pedido.email === req.usuario.email;
  if (!suyo && req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Ese pedido no es tuyo.' });
  res.json({ pedido: cargarPedido(pedido) });
});

// POST /api/seguimiento — rastreo público con código + correo
router.post('/seguimiento', (req, res) => {
  const codigo = String(req.body.codigo || '').trim().toUpperCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!codigo || !email) return res.status(400).json({ error: 'Escribe el número de pedido y el correo con el que lo hiciste.' });

  const pedido = db.prepare('SELECT * FROM pedidos WHERE codigo = ? AND LOWER(email) = ?').get(codigo, email);
  if (!pedido) return res.status(404).json({ error: 'No hay ningún pedido con esa combinación. Revisa el número y el correo.' });

  res.json({ pedido: cargarPedido(pedido) });
});

module.exports = router;
module.exports.cargarPedido = cargarPedido;
