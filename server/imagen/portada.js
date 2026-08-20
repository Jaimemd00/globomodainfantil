'use strict';

/**
 * Mantiene sincronizado el campo `imagen` (la portada) del producto con la
 * galería real de fotos en `producto_imagenes`.
 *
 * Vive en su propio módulo porque lo usan dos sitios que no deben confiarse
 * el uno al otro: la subida/gestión de fotos (admin-media.js) y el guardado
 * general del artículo (admin.js). El segundo existe como cinturón de
 * seguridad: aunque el formulario mande un valor de portada desfasado —cosa
 * que ya pasó una vez por un campo oculto que no se refrescaba al subir una
 * foto nueva—, la base de datos vuelve a quedar coherente con lo que hay
 * realmente en la galería, no con lo que diga el navegador.
 */

const { db } = require('../db');

function sincronizarPortada(productoId) {
  const hayPrincipal = db
    .prepare('SELECT 1 FROM producto_imagenes WHERE producto_id = ? AND principal = 1')
    .get(productoId);

  if (!hayPrincipal) {
    const siguiente = db
      .prepare('SELECT id FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id LIMIT 1')
      .get(productoId);
    if (siguiente) db.prepare('UPDATE producto_imagenes SET principal = 1 WHERE id = ?').run(siguiente.id);
  }

  const portada = db
    .prepare('SELECT ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY principal DESC, orden, id LIMIT 1')
    .get(productoId);
  if (portada) db.prepare('UPDATE productos SET imagen = ? WHERE id = ?').run(portada.ruta, productoId);
}

module.exports = { sincronizarPortada };
