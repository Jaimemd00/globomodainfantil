'use strict';

/**
 * Procesado de imágenes de la tienda.
 *
 * Todo lo que sube el navegador pasa por aquí antes de tocar el disco público:
 * se valida el contenido real del fichero (no la extensión, que se falsifica en
 * dos segundos), se normaliza a un formato único y se genera la miniatura.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..', '..', 'public', 'img');

const CARPETAS = {
  productos: path.join(RAIZ, 'productos')
};

for (const dir of Object.values(CARPETAS)) fs.mkdirSync(dir, { recursive: true });

/* Firmas de fichero admitidas. Se comprueba el contenido, no el nombre. */
const FIRMAS = [
  { tipo: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { tipo: 'avif', bytes: [0x00, 0x00, 0x00], desplazamiento: 0 }
];

const MAX_BYTES = 12 * 1024 * 1024;

/** Comprueba que el buffer es realmente una imagen admitida. */
function validar(buffer) {
  if (!buffer || !buffer.length) throw new Error('El archivo llegó vacío.');
  if (buffer.length > MAX_BYTES) throw new Error('La imagen pesa más de 12 MB. Redúcela antes de subirla.');

  const coincide = FIRMAS.some((f) => f.bytes.every((b, i) => buffer[i] === b));
  const esAvif = buffer.slice(4, 12).toString('latin1').includes('ftyp');
  if (!coincide && !esAvif) {
    throw new Error('Ese archivo no es una imagen válida. Admitimos JPG, PNG, WEBP y AVIF.');
  }
}

function nombreUnico(prefijo, extension = 'webp') {
  return `${prefijo}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}.${extension}`;
}

/**
 * Normaliza una imagen de catálogo: recorte a 4:5, ancho fijo y WebP.
 * @returns {Promise<{ruta: string, miniatura: string}>} rutas públicas
 */
async function guardarImagenProducto(buffer, { prefijo = 'articulo', ajuste = 'cover' } = {}) {
  validar(buffer);

  const archivo = nombreUnico(prefijo);
  const mini = `mini-${archivo}`;

  const base = sharp(buffer, { failOn: 'none' }).rotate();

  await base
    .clone()
    .resize(1200, 1500, { fit: ajuste, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 82 })
    .toFile(path.join(CARPETAS.productos, archivo));

  await base
    .clone()
    .resize(400, 500, { fit: ajuste, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 72 })
    .toFile(path.join(CARPETAS.productos, mini));

  return { ruta: `/img/productos/${archivo}`, miniatura: `/img/productos/${mini}` };
}

/** Borra un fichero público sin quejarse si ya no está. */
function borrar(rutaPublica) {
  if (!rutaPublica || !rutaPublica.startsWith('/img/')) return;
  const destino = path.join(RAIZ, rutaPublica.replace('/img/', ''));
  if (!destino.startsWith(RAIZ)) return; // corta cualquier intento de salir de la carpeta
  fs.promises.unlink(destino).catch(() => {});
}

module.exports = {
  validar,
  guardarImagenProducto,
  borrar,
  CARPETAS,
  MAX_BYTES
};
