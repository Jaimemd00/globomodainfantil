'use strict';

const express = require('express');
const { db } = require('../db');

const router = express.Router();

function conVariantes(producto) {
  if (!producto) return null;
  producto.variantes = db
    .prepare('SELECT id, talla, stock FROM variantes WHERE producto_id = ? ORDER BY id')
    .all(producto.id);
  producto.imagenes = db
    .prepare('SELECT ruta, miniatura, alt FROM producto_imagenes WHERE producto_id = ? ORDER BY principal DESC, orden, id')
    .all(producto.id);
  producto.stock_total = producto.variantes.reduce((s, v) => s + v.stock, 0);
  producto.destacado = !!producto.destacado;
  producto.novedad = !!producto.novedad;
  return producto;
}

// GET /api/categorias
router.get('/categorias', (_req, res) => {
  const filas = db
    .prepare(
      `SELECT c.id, c.slug, c.nombre, c.edad, c.descripcion,
              (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id AND p.activo = 1) AS total
       FROM categorias c ORDER BY c.orden, c.nombre`
    )
    .all();
  res.json({ categorias: filas });
});

// GET /api/productos?categoria=&q=&talla=&min=&max=&orden=&pagina=&porPagina=&destacado=&novedad=
router.get('/productos', (req, res) => {
  const where = ['p.activo = 1'];
  const params = {};

  if (req.query.categoria) {
    where.push('c.slug = @categoria');
    params.categoria = String(req.query.categoria);
  }
  if (req.query.q) {
    where.push('(p.nombre LIKE @q OR p.descripcion LIKE @q OR p.sku LIKE @q)');
    params.q = `%${String(req.query.q).trim()}%`;
  }
  if (req.query.talla) {
    where.push('EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.talla = @talla AND v.stock > 0)');
    params.talla = String(req.query.talla);
  }
  if (req.query.min) {
    where.push('p.precio >= @min');
    params.min = Number(req.query.min);
  }
  if (req.query.max) {
    where.push('p.precio <= @max');
    params.max = Number(req.query.max);
  }
  if (req.query.destacado === '1') where.push('p.destacado = 1');
  if (req.query.novedad === '1') where.push('p.novedad = 1');
  if (req.query.rebaja === '1') where.push('p.precio_antes IS NOT NULL');

  const ordenes = {
    novedades: 'p.creado_en DESC, p.id DESC',
    'precio-asc': 'p.precio ASC',
    'precio-desc': 'p.precio DESC',
    nombre: 'p.nombre ASC'
  };
  const orderBy = ordenes[req.query.orden] || 'p.destacado DESC, p.id DESC';

  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const porPagina = Math.min(48, Math.max(1, parseInt(req.query.porPagina, 10) || 12));
  const offset = (pagina - 1) * porPagina;

  const sqlBase = `FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${sqlBase}`).get(params).n;

  const productos = db
    .prepare(
      `SELECT p.*, c.slug AS categoria_slug, c.nombre AS categoria_nombre
       ${sqlBase} ORDER BY ${orderBy} LIMIT ${porPagina} OFFSET ${offset}`
    )
    .all(params)
    .map(conVariantes);

  res.json({ productos, total, pagina, porPagina, paginas: Math.ceil(total / porPagina) || 1 });
});

// GET /api/productos/:slug
router.get('/productos/:slug', (req, res) => {
  const producto = db
    .prepare(
      `SELECT p.*, c.slug AS categoria_slug, c.nombre AS categoria_nombre
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.slug = ? AND p.activo = 1`
    )
    .get(req.params.slug);

  if (!producto) return res.status(404).json({ error: 'No encontramos ese artículo.' });

  const relacionados = db
    .prepare(
      `SELECT p.*, c.slug AS categoria_slug, c.nombre AS categoria_nombre
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.categoria_id = ? AND p.id != ? AND p.activo = 1
       ORDER BY RANDOM() LIMIT 4`
    )
    .all(producto.categoria_id, producto.id)
    .map(conVariantes);

  res.json({ producto: conVariantes(producto), relacionados });
});

// GET /api/tallas — tallas disponibles para los filtros
router.get('/tallas', (_req, res) => {
  const filas = db
    .prepare('SELECT DISTINCT talla FROM variantes WHERE stock > 0 ORDER BY LENGTH(talla), talla')
    .all();
  res.json({ tallas: filas.map((f) => f.talla) });
});

module.exports = router;
