'use strict';

/**
 * Pagos.
 *
 * Reglas que se aplican aquí y que son el núcleo de una integración segura:
 *
 *  1. El importe se calcula en el servidor a partir del pedido ya guardado.
 *     Nada de lo que mande el navegador influye en lo que se cobra.
 *  2. Un pedido pasa a "pagado" ÚNICAMENTE cuando lo confirma la pasarela por
 *     webhook, nunca al volver el cliente al navegador. Si cierra la pestaña
 *     justo después de pagar, el pedido se confirma igual.
 *  3. Cada aviso se procesa una sola vez. Las pasarelas reintentan, y sin
 *     control de idempotencia un mismo pago cambiaría el estado dos veces.
 *  4. Si el pago caduca o se cancela, el stock reservado vuelve al catálogo.
 */

const express = require('express');
const { db } = require('../db');
const pasarela = require('./proveedores');

const router = express.Router();

const base = (req) => process.env.URL_PUBLICA || `${req.protocol}://${req.get('host')}`;

/** Devuelve al catálogo las unidades que reservó un pedido. */
function restaurarStock(pedidoId) {
  const lineas = db.prepare('SELECT producto_id, talla, cantidad FROM pedido_lineas WHERE pedido_id = ?').all(pedidoId);
  const reponer = db.prepare('UPDATE variantes SET stock = stock + ? WHERE producto_id = ? AND talla = ?');
  for (const l of lineas) {
    if (l.producto_id) reponer.run(l.cantidad, l.producto_id, l.talla);
  }
  return lineas.length;
}

/** Marca un pedido como pagado. Es idempotente: repetirla no hace nada. */
function marcarPagado(pedido, referencia) {
  if (pedido.estado !== 'pendiente') return false;
  db.transaction(() => {
    db.prepare(
      `UPDATE pedidos SET estado = 'pagado', pago_ref = ?, pago_proveedor = ?, actualizado_en = datetime('now') WHERE id = ?`
    ).run(referencia || pedido.pago_ref, pasarela.PROVEEDOR, pedido.id);
    db.prepare('INSERT INTO pedido_eventos (pedido_id, estado, mensaje) VALUES (?, ?, ?)').run(
      pedido.id,
      'pagado',
      'Pago confirmado. Ya estás en la cola de preparación.'
    );
  })();
  return true;
}

/** Cancela un pedido no pagado y devuelve el stock. */
function caducarPedido(pedido, motivo) {
  if (pedido.estado !== 'pendiente') return false;
  db.transaction(() => {
    restaurarStock(pedido.id);
    db.prepare(`UPDATE pedidos SET estado = 'cancelado', actualizado_en = datetime('now') WHERE id = ?`).run(pedido.id);
    db.prepare('INSERT INTO pedido_eventos (pedido_id, estado, mensaje) VALUES (?, ?, ?)').run(pedido.id, 'cancelado', motivo);
  })();
  return true;
}

/** Aplica un evento ya verificado. Devuelve qué se hizo, para el registro. */
function aplicarEvento({ id, accion, codigo, referencia }) {
  if (!codigo || accion === 'ignorar') return { ok: true, hecho: 'ignorado' };

  /* Idempotencia: si este evento ya se procesó, se responde bien y se sale. */
  const visto = db.prepare('SELECT 1 FROM pagos_procesados WHERE evento_id = ?').get(id);
  if (visto) return { ok: true, hecho: 'repetido' };

  const pedido = db.prepare('SELECT * FROM pedidos WHERE codigo = ?').get(codigo);
  if (!pedido) return { ok: true, hecho: 'pedido desconocido' };

  let hecho = 'sin cambios';
  if (accion === 'pagado') hecho = marcarPagado(pedido, referencia) ? 'pagado' : 'ya estaba resuelto';
  if (accion === 'caducado') hecho = caducarPedido(pedido, 'El pago no se completó a tiempo. Puedes volver a intentarlo.') ? 'caducado' : 'ya estaba resuelto';
  if (accion === 'devuelto') {
    db.prepare('INSERT INTO pedido_eventos (pedido_id, estado, mensaje) VALUES (?, ?, ?)').run(
      pedido.id, pedido.estado, 'Se ha emitido una devolución del importe.'
    );
    hecho = 'devolución registrada';
  }

  if (id) {
    db.prepare('INSERT OR IGNORE INTO pagos_procesados (evento_id, pedido_id, tipo) VALUES (?, ?, ?)').run(id, pedido.id, accion);
  }
  return { ok: true, hecho };
}

/* ------------------------------- Endpoints -------------------------------- */

// GET /api/pagos/estado — cómo está configurada la pasarela
router.get('/estado', (_req, res) => {
  res.json({
    proveedor: pasarela.PROVEEDOR,
    simulacion: pasarela.esSimulacion(),
    configurado: pasarela.configurado(),
    metodos: pasarela.METODOS
  });
});

// POST /api/pagos/sesion — crea la sesión de pago de un pedido pendiente
router.post('/sesion', async (req, res) => {
  const codigo = String(req.body.codigo || '').trim().toUpperCase();
  const email = String(req.body.email || '').trim().toLowerCase();

  const pedido = db.prepare('SELECT * FROM pedidos WHERE codigo = ? AND LOWER(email) = ?').get(codigo, email);
  if (!pedido) return res.status(404).json({ error: 'No encontramos ese pedido.' });
  if (pedido.estado !== 'pendiente') return res.status(409).json({ error: 'Ese pedido ya no está pendiente de pago.' });

  const lineas = db.prepare('SELECT nombre, talla, precio, cantidad FROM pedido_lineas WHERE pedido_id = ?').all(pedido.id);

  try {
    const sesion = await pasarela.crearSesion({ pedido, lineas, base: base(req) });
    db.prepare('UPDATE pedidos SET pago_ref = ?, pago_proveedor = ? WHERE id = ?').run(sesion.referencia, pasarela.PROVEEDOR, pedido.id);
    res.json({ url: sesion.url, referencia: sesion.referencia, simulacion: pasarela.esSimulacion() });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/**
 * POST /api/pagos/webhook — aviso de la pasarela.
 *
 * Recibe el cuerpo sin parsear (se monta con express.raw en index.js) porque
 * la firma se calcula sobre los bytes exactos: si Express lo convierte a
 * objeto y se vuelve a serializar, la firma deja de coincidir.
 */
router.post('/webhook', (req, res) => {
  if (pasarela.esSimulacion()) {
    return res.status(400).json({ error: 'La pasarela está en modo simulación: no hay webhook real.' });
  }
  try {
    const evento = pasarela.verificarFirmaStripe(req.body, req.get('stripe-signature'));
    const resultado = aplicarEvento(pasarela.interpretarEvento(evento));
    res.json(resultado);
  } catch (e) {
    /* 400 y no 500: así la pasarela no reintenta un aviso mal firmado. */
    console.error('Webhook rechazado:', e.message);
    res.status(400).json({ error: e.message });
  }
});

/* ---------------------------- Modo simulación ----------------------------- */

/**
 * POST /api/pagos/simulado — confirma o cancela un pago de prueba.
 * Solo existe cuando la pasarela está en modo simulación; en producción
 * devuelve 404 y no hay forma de marcar un pedido como pagado desde fuera.
 */
router.post('/simulado', (req, res) => {
  if (!pasarela.esSimulacion()) return res.status(404).json({ error: 'No disponible.' });

  const codigo = String(req.body.codigo || '').trim().toUpperCase();
  const referencia = String(req.body.referencia || '').trim();
  const accion = req.body.accion === 'cancelar' ? 'caducado' : 'pagado';

  const pedido = db.prepare('SELECT * FROM pedidos WHERE codigo = ?').get(codigo);
  if (!pedido) return res.status(404).json({ error: 'No encontramos ese pedido.' });
  if (pedido.pago_ref && referencia && pedido.pago_ref !== referencia) {
    return res.status(409).json({ error: 'La referencia de pago no corresponde a este pedido.' });
  }

  const resultado = aplicarEvento({
    id: `sim_evt_${referencia || pedido.id}_${accion}`,
    accion,
    codigo: pedido.codigo,
    referencia
  });

  res.json({ ...resultado, estado: db.prepare('SELECT estado FROM pedidos WHERE id = ?').get(pedido.id).estado });
});

module.exports = router;
module.exports.restaurarStock = restaurarStock;
