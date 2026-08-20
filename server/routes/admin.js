'use strict';

const express = require('express');
const { db, ESTADOS, ESTADOS_TEXTO } = require('../db');
const { soloAdmin } = require('../middleware/auth');
const { sincronizarPortada } = require('../imagen/portada');
const { cargarPedido } = require('./pedidos');
const { restaurarStock } = require('../pagos/rutas');

const router = express.Router();
router.use(soloAdmin);

function aSlug(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/* ---------------------------------- Panel --------------------------------- */

// GET /api/admin/resumen
router.get('/resumen', (_req, res) => {
  const ventas = db
    .prepare(`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n FROM pedidos WHERE estado != 'cancelado'`)
    .get();
  const porEstado = db.prepare('SELECT estado, COUNT(*) AS n FROM pedidos GROUP BY estado').all();
  const productos = db.prepare('SELECT COUNT(*) AS n FROM productos WHERE activo = 1').get().n;
  const clientes = db.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'cliente'`).get().n;
  const bajoStock = db
    .prepare(
      `SELECT p.nombre, p.sku, v.talla, v.stock FROM variantes v
       JOIN productos p ON p.id = v.producto_id
       WHERE v.stock <= 3 AND p.activo = 1 ORDER BY v.stock ASC LIMIT 10`
    )
    .all();
  const ultimos = db.prepare('SELECT codigo, nombre, total, estado, creado_en FROM pedidos ORDER BY id DESC LIMIT 8').all();
  const porDia = db
    .prepare(
      `SELECT DATE(creado_en) AS dia, COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS importe
       FROM pedidos WHERE creado_en >= DATE('now','-13 days') GROUP BY dia ORDER BY dia`
    )
    .all();

  res.json({
    ingresos: Math.round(ventas.total * 100) / 100,
    pedidos: ventas.n,
    productos,
    clientes,
    por_estado: porEstado,
    bajo_stock: bajoStock,
    ultimos,
    por_dia: porDia
  });
});

/* -------------------------------- Productos ------------------------------- */

// GET /api/admin/productos
router.get('/productos', (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const productos = db
    .prepare(
      `SELECT p.*, c.nombre AS categoria_nombre, c.slug AS categoria_slug,
              (SELECT COALESCE(SUM(stock),0) FROM variantes v WHERE v.producto_id = p.id) AS stock_total
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.nombre LIKE ? OR p.sku LIKE ? ORDER BY p.id DESC`
    )
    .all(q, q);
  for (const p of productos) {
    p.variantes = db.prepare('SELECT id, talla, stock FROM variantes WHERE producto_id = ? ORDER BY id').all(p.id);
  }
  res.json({ productos });
});

// POST /api/admin/productos
router.post('/productos', (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim();
  const precio = Number(b.precio);
  if (nombre.length < 2) return res.status(400).json({ error: 'El artículo necesita un nombre.' });
  if (!(precio > 0)) return res.status(400).json({ error: 'El precio debe ser mayor que 0.' });

  const categoria = db.prepare('SELECT id FROM categorias WHERE id = ? OR slug = ?').get(b.categoria_id, b.categoria_id);
  if (!categoria) return res.status(400).json({ error: 'Elige una categoría válida.' });

  let slug = aSlug(b.slug || nombre);
  let i = 2;
  while (db.prepare('SELECT 1 FROM productos WHERE slug = ?').get(slug)) slug = `${aSlug(nombre)}-${i++}`;

  let sku = String(b.sku || '').trim().toUpperCase() || `CRC-${Date.now().toString().slice(-6)}`;
  if (db.prepare('SELECT 1 FROM productos WHERE sku = ?').get(sku)) {
    return res.status(409).json({ error: 'Ese SKU ya existe. Usa otro.' });
  }

  const info = db
    .prepare(
      `INSERT INTO productos (sku, slug, nombre, descripcion, composicion, categoria_id, precio, precio_antes,
                              color, imagen, destacado, novedad, activo)
       VALUES (@sku, @slug, @nombre, @descripcion, @composicion, @categoria_id, @precio, @precio_antes,
               @color, @imagen, @destacado, @novedad, @activo)`
    )
    .run({
      sku,
      slug,
      nombre,
      descripcion: String(b.descripcion || '').trim(),
      composicion: String(b.composicion || '').trim(),
      categoria_id: categoria.id,
      precio,
      precio_antes: b.precio_antes ? Number(b.precio_antes) : null,
      color: String(b.color || '').trim(),
      imagen: String(b.imagen || '/img/productos/generico.svg').trim(),
      destacado: b.destacado ? 1 : 0,
      novedad: b.novedad ? 1 : 0,
      activo: b.activo === false ? 0 : 1
    });

  const tallas = Array.isArray(b.variantes) ? b.variantes : [];
  const ins = db.prepare('INSERT INTO variantes (producto_id, talla, stock) VALUES (?, ?, ?)');
  for (const v of tallas) {
    if (v && v.talla) ins.run(info.lastInsertRowid, String(v.talla).trim(), Math.max(0, parseInt(v.stock, 10) || 0));
  }

  res.status(201).json({ producto: db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid) });
});

// PUT /api/admin/productos/:id
router.put('/productos/:id', (req, res) => {
  const actual = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'Ese artículo no existe.' });
  const b = req.body || {};

  const categoria = b.categoria_id
    ? db.prepare('SELECT id FROM categorias WHERE id = ? OR slug = ?').get(b.categoria_id, b.categoria_id)
    : { id: actual.categoria_id };
  if (!categoria) return res.status(400).json({ error: 'Elige una categoría válida.' });

  db.prepare(
    `UPDATE productos SET nombre=@nombre, descripcion=@descripcion, composicion=@composicion, categoria_id=@categoria_id,
            precio=@precio, precio_antes=@precio_antes, color=@color, imagen=@imagen,
            destacado=@destacado, novedad=@novedad, activo=@activo
     WHERE id=@id`
  ).run({
    id: actual.id,
    nombre: String(b.nombre ?? actual.nombre).trim(),
    descripcion: String(b.descripcion ?? actual.descripcion ?? ''),
    composicion: String(b.composicion ?? actual.composicion ?? ''),
    categoria_id: categoria.id,
    precio: b.precio != null ? Number(b.precio) : actual.precio,
    precio_antes: b.precio_antes === '' || b.precio_antes === null ? null : b.precio_antes != null ? Number(b.precio_antes) : actual.precio_antes,
    color: String(b.color ?? actual.color ?? ''),
    imagen: String(b.imagen ?? actual.imagen ?? ''),
    destacado: b.destacado != null ? (b.destacado ? 1 : 0) : actual.destacado,
    novedad: b.novedad != null ? (b.novedad ? 1 : 0) : actual.novedad,
    activo: b.activo != null ? (b.activo ? 1 : 0) : actual.activo
  });

  /*
   * Cinturón de seguridad: si el artículo ya tiene fotos reales en su
   * galería, la portada la decide esa galería, no lo que traiga el
   * formulario. Un valor de `imagen` desfasado en el navegador (por
   * ejemplo, si se subió una foto nueva sin refrescar ese campo) ya no
   * puede pisar la portada correcta.
   */
  sincronizarPortada(actual.id);

  if (Array.isArray(b.variantes)) {
    /*
     * El formulario de tallas no tiene un identificador estable por fila:
     * el propio texto de la talla ES la clave. Antes, esto solo daba de
     * alta o actualizaba el stock de las tallas que llegaban, pero nunca
     * borraba las que ya no estaban en la lista enviada.
     *
     * Consecuencia real: si se corregía el texto de una talla (un fallo de
     * tecleo, "0M" por "RN"), el formulario mandaba la nueva talla, el
     * servidor la daba de alta... y la talla vieja se quedaba intacta en la
     * base de datos, todavía visible y comprable en la tienda. El panel
     * decía "guardado" porque técnicamente no fallaba nada — simplemente no
     * borraba lo que sobraba.
     *
     * Ahora el envío se trata como la lista COMPLETA y definitiva de tallas
     * del artículo: se borra cualquier talla que ya no esté en la lista, y
     * se da de alta o actualiza el resto. Es lo que espera quien edita un
     * formulario: lo que ve en pantalla es lo que queda guardado.
     */
    const limpias = b.variantes
      .filter((v) => v && String(v.talla || '').trim())
      .map((v) => ({ talla: String(v.talla).trim(), stock: Math.max(0, parseInt(v.stock, 10) || 0) }));

    const nombres = limpias.map((v) => v.talla);
    const existentes = db.prepare('SELECT talla FROM variantes WHERE producto_id = ?').all(actual.id).map((v) => v.talla);
    const sobran = existentes.filter((t) => !nombres.includes(t));

    const sincronizar = db.transaction(() => {
      if (sobran.length) {
        const marcadores = sobran.map(() => '?').join(',');
        db.prepare(`DELETE FROM variantes WHERE producto_id = ? AND talla IN (${marcadores})`).run(actual.id, ...sobran);
      }
      const upsert = db.prepare(
        `INSERT INTO variantes (producto_id, talla, stock) VALUES (?, ?, ?)
         ON CONFLICT(producto_id, talla) DO UPDATE SET stock = excluded.stock`
      );
      for (const v of limpias) upsert.run(actual.id, v.talla, v.stock);
    });
    sincronizar();
  }

  res.json({ producto: db.prepare('SELECT * FROM productos WHERE id = ?').get(actual.id) });
});

// DELETE /api/admin/productos/:id — baja lógica para no romper pedidos antiguos
router.delete('/productos/:id', (req, res) => {
  const info = db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Ese artículo no existe.' });
  res.json({ ok: true });
});

/* --------------------------------- Pedidos -------------------------------- */

// GET /api/admin/pedidos?estado=&q=
router.get('/pedidos', (req, res) => {
  const where = [];
  const params = {};
  if (req.query.estado && ESTADOS.includes(req.query.estado)) {
    where.push('estado = @estado');
    params.estado = req.query.estado;
  }
  if (req.query.q) {
    where.push('(codigo LIKE @q OR nombre LIKE @q OR email LIKE @q)');
    params.q = `%${String(req.query.q).trim()}%`;
  }
  const sql = `SELECT * FROM pedidos ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`;
  res.json({ pedidos: db.prepare(sql).all(params).map(cargarPedido) });
});

// PUT /api/admin/pedidos/:codigo/estado
router.put('/pedidos/:codigo/estado', (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE codigo = ?').get(req.params.codigo);
  if (!pedido) return res.status(404).json({ error: 'No encontramos ese pedido.' });

  const estado = String(req.body.estado || '');
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Ese estado no existe.' });

  const transportista = String(req.body.transportista || pedido.transportista || '').trim();
  const seguimiento = String(req.body.seguimiento_ext || pedido.seguimiento_ext || '').trim();

  /* Al cancelar, las unidades vuelven al catálogo. Si no, el stock se
     quedaría bloqueado por un pedido que nadie va a recibir. */
  const devolverStock = estado === 'cancelado' && pedido.estado !== 'cancelado';

  db.transaction(() => {
    if (devolverStock) restaurarStock(pedido.id);
    db.prepare(
      `UPDATE pedidos SET estado = ?, transportista = ?, seguimiento_ext = ?, actualizado_en = datetime('now') WHERE id = ?`
    ).run(estado, transportista || null, seguimiento || null, pedido.id);
  })();

  const mensaje =
    String(req.body.mensaje || '').trim() ||
    (estado === 'enviado' && transportista
      ? `Tu paquete ha salido con ${transportista}${seguimiento ? ` (nº ${seguimiento})` : ''}.`
      : ESTADOS_TEXTO[estado]);

  db.prepare('INSERT INTO pedido_eventos (pedido_id, estado, mensaje) VALUES (?, ?, ?)').run(pedido.id, estado, mensaje);

  res.json({ pedido: cargarPedido(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id)) });
});

/* -------------------------------- Clientes -------------------------------- */

// GET /api/admin/clientes
router.get('/clientes', (_req, res) => {
  const clientes = db
    .prepare(
      `SELECT u.id, u.nombre, u.email, u.telefono, u.ciudad, u.creado_en,
              (SELECT COUNT(*) FROM pedidos p WHERE p.usuario_id = u.id) AS pedidos,
              (SELECT COALESCE(SUM(total),0) FROM pedidos p WHERE p.usuario_id = u.id AND p.estado != 'cancelado') AS gastado
       FROM usuarios u WHERE u.rol = 'cliente' ORDER BY u.id DESC`
    )
    .all();
  res.json({ clientes });
});

module.exports = router;
