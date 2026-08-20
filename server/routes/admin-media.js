'use strict';

/**
 * Trastienda: subida y gestión de las imágenes de cada artículo.
 *
 * Todo lo que sube el navegador pasa por `imagen/procesar`, que valida el
 * contenido real del fichero, lo recorta a 4:5 y genera la miniatura.
 */

const express = require('express');
const multer = require('multer');
const { db } = require('../db');
const { sincronizarPortada } = require('../imagen/portada');
const { soloAdmin } = require('../middleware/auth');
const img = require('../imagen/procesar');

const router = express.Router();
router.use(soloAdmin);

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: img.MAX_BYTES, files: 8 }
});

const hoy = () => new Date().toISOString().slice(0, 10);

/* ========================= Imágenes de un artículo ========================= */

function galeria(productoId) {
  return db
    .prepare('SELECT * FROM producto_imagenes WHERE producto_id = ? ORDER BY principal DESC, orden, id')
    .all(productoId);
}



// GET /api/admin/productos/:id/imagenes
router.get('/productos/:id/imagenes', (req, res) => {
  res.json({ imagenes: galeria(req.params.id) });
});

// POST /api/admin/productos/:id/imagenes  (multipart, campo "imagenes")
router.post('/productos/:id/imagenes', subida.array('imagenes', 8), async (req, res) => {
  const producto = db.prepare('SELECT id, nombre FROM productos WHERE id = ?').get(req.params.id);
  if (!producto) return res.status(404).json({ error: 'Ese artículo no existe.' });
  if (!req.files?.length) return res.status(400).json({ error: 'No has seleccionado ninguna imagen.' });

  const yaHay = db.prepare('SELECT COUNT(*) AS n FROM producto_imagenes WHERE producto_id = ?').get(producto.id).n;
  const insertar = db.prepare(
    `INSERT INTO producto_imagenes (producto_id, ruta, miniatura, alt, orden, principal)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const creadas = [];
  try {
    for (const [i, fichero] of req.files.entries()) {
      const { ruta, miniatura } = await img.guardarImagenProducto(fichero.buffer, { prefijo: 'articulo' });
      const info = insertar.run(producto.id, ruta, miniatura, producto.nombre, yaHay + i, yaHay === 0 && i === 0 ? 1 : 0);
      creadas.push(db.prepare('SELECT * FROM producto_imagenes WHERE id = ?').get(info.lastInsertRowid));
    }
    sincronizarPortada(producto.id);
    res.status(201).json({ imagenes: galeria(producto.id), creadas: creadas.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/admin/imagenes/:id/principal
router.put('/imagenes/:id/principal', (req, res) => {
  const imagen = db.prepare('SELECT * FROM producto_imagenes WHERE id = ?').get(req.params.id);
  if (!imagen) return res.status(404).json({ error: 'Esa imagen no existe.' });

  db.transaction(() => {
    db.prepare('UPDATE producto_imagenes SET principal = 0 WHERE producto_id = ?').run(imagen.producto_id);
    db.prepare('UPDATE producto_imagenes SET principal = 1 WHERE id = ?').run(imagen.id);
  })();
  sincronizarPortada(imagen.producto_id);
  res.json({ imagenes: galeria(imagen.producto_id) });
});

// DELETE /api/admin/imagenes/:id
router.delete('/imagenes/:id', (req, res) => {
  const imagen = db.prepare('SELECT * FROM producto_imagenes WHERE id = ?').get(req.params.id);
  if (!imagen) return res.status(404).json({ error: 'Esa imagen no existe.' });

  db.prepare('DELETE FROM producto_imagenes WHERE id = ?').run(imagen.id);
  img.borrar(imagen.ruta);
  img.borrar(imagen.miniatura);
  sincronizarPortada(imagen.producto_id);
  res.json({ imagenes: galeria(imagen.producto_id) });
});

module.exports = router;
