'use strict';

/**
 * Sincroniza el catálogo de la tienda con `catalogo-real.json`.
 *
 *   npm run catalogo            ver qué cambiaría, sin tocar nada
 *   npm run catalogo -- --aplicar   aplicar los cambios
 *
 * A diferencia de `npm run reset`, esto NO borra pedidos ni cuentas de
 * cliente: solo da de alta los artículos nuevos, actualiza la foto de los
 * que ya estaban y oculta los que ya no figuran en el catálogo. Es lo que
 * hay que usar cuando llega un catálogo nuevo del proveedor y la tienda
 * ya tiene ventas.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const APLICAR = process.argv.includes('--aplicar');
const RUTA = path.join(__dirname, 'catalogo-real.json');
const DIR_IMG = path.join(__dirname, '..', 'public', 'img', 'productos');

if (!fs.existsSync(RUTA)) {
  console.log('\n  No encuentro server/catalogo-real.json.');
  console.log('  Genéralo con: node server/construir-catalogo.js\n');
  process.exit(1);
}

const catalogo = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
const enBase = db.prepare('SELECT id, sku, nombre, imagen, activo FROM productos').all();
const porSku = new Map(enBase.map((p) => [p.sku, p]));
const skusCatalogo = new Set(catalogo.map((a) => a.sku));

const nuevos = catalogo.filter((a) => !porSku.has(a.sku));
const existentes = catalogo.filter((a) => porSku.has(a.sku));
const sobran = enBase.filter((p) => !skusCatalogo.has(p.sku) && p.activo);

/* Fotos que el catálogo declara pero no están en disco. */
const sinFoto = catalogo.filter((a) => !fs.existsSync(path.join(DIR_IMG, a.archivo)));

console.log(`
  Catálogo del código : ${catalogo.length} artículos
  Catálogo en la base : ${enBase.length} artículos

  Se darían de alta   : ${nuevos.length}
  Se actualizarían    : ${existentes.length}
  Se ocultarían       : ${sobran.length} (ya no están en el catálogo)
`);

if (sinFoto.length) {
  console.log(`  AVISO: faltan ${sinFoto.length} fotos en public/img/productos/`);
  console.log('  Regenéralas con: node server/construir-catalogo.js\n');
}

if (sobran.length && sobran.length <= 12) {
  console.log('  Artículos que se ocultarían:');
  for (const p of sobran) console.log(`    ${p.sku.padEnd(12)} ${p.nombre}`);
  console.log('');
}

if (!APLICAR) {
  console.log('  No se ha cambiado nada. Para aplicarlo:\n');
  console.log('      npm run catalogo -- --aplicar\n');
  console.log('  Se conservan los pedidos y las cuentas de cliente.\n');
  process.exit(0);
}

/* --------------------------------- Aplicar -------------------------------- */

const categorias = Object.fromEntries(
  db.prepare('SELECT id, slug FROM categorias').all().map((c) => [c.slug, c.id])
);

const insProd = db.prepare(
  `INSERT INTO productos (sku, slug, nombre, descripcion, categoria_id, precio, imagen, destacado, novedad, activo)
   VALUES (@sku, @slug, @nombre, @descripcion, @categoria_id, @precio, @imagen, @destacado, @novedad, 1)`
);
const insVar = db.prepare(
  `INSERT INTO variantes (producto_id, talla, stock) VALUES (?, ?, ?)
   ON CONFLICT(producto_id, talla) DO NOTHING`
);
const insImg = db.prepare(
  `INSERT INTO producto_imagenes (producto_id, ruta, miniatura, alt, orden, principal)
   VALUES (?, ?, ?, ?, 0, 1)`
);

const aplicar = db.transaction(() => {
  for (const a of nuevos) {
    const ruta = `/img/productos/${a.archivo}`;
    const info = insProd.run({
      sku: a.sku,
      slug: a.slug,
      nombre: a.nombre,
      descripcion: a.porRevisar
        ? 'Prenda de ceremonia. Pendiente de describir desde el panel.'
        : `${a.nombre}. Consulta la guía de tallas si dudas entre dos.`,
      categoria_id: categorias[a.categoria] || categorias['complementos'],
      precio: a.precio,
      imagen: ruta,
      destacado: a.destacado ? 1 : 0,
      novedad: a.novedad ? 1 : 0
    });
    insImg.run(info.lastInsertRowid, ruta, `/img/productos/mini-${a.archivo}`, a.nombre);
    for (const t of a.tallas) insVar.run(info.lastInsertRowid, t, 6);
  }

  /* De los que ya existían solo se refresca la foto: el precio, el nombre y el
     stock pueden haberse tocado desde el panel y no hay que pisarlos. */
  for (const a of existentes) {
    const p = porSku.get(a.sku);
    const ruta = `/img/productos/${a.archivo}`;
    if (p.imagen !== ruta) {
      db.prepare('UPDATE productos SET imagen = ?, activo = 1 WHERE id = ?').run(ruta, p.id);
      const tiene = db.prepare('SELECT 1 FROM producto_imagenes WHERE producto_id = ? AND ruta = ?').get(p.id, ruta);
      if (!tiene) {
        db.prepare('UPDATE producto_imagenes SET principal = 0 WHERE producto_id = ?').run(p.id);
        insImg.run(p.id, ruta, `/img/productos/mini-${a.archivo}`, a.nombre);
      }
    }
  }

  for (const p of sobran) {
    db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(p.id);
  }
});

aplicar();

const total = db.prepare('SELECT COUNT(*) AS n FROM productos WHERE activo = 1').get().n;
console.log(`  Hecho. La tienda tiene ahora ${total} artículos publicados.`);
console.log('  Los pedidos y las cuentas de cliente no se han tocado.\n');
