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
  { tipo: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] }
];

/* AVIF y HEIC comparten el mismo contenedor (ISO-BMFF con caja "ftyp" en el
   mismo byte), así que hay que mirar el "marca de marca" (brand) que viene
   justo después para distinguirlos — comprobar solo "ftyp" clasificaba
   fotos de iPhone (HEIC) como AVIF válido. Los brands de HEIC/HEIF
   ("heic","heix","hevc","heim","heis","hevm","hevs","mif1") se ADMITEN
   igualmente: sharp los procesa bien. Solo cambia la etiqueta interna. */
const MARCAS_HEIF = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'avif', 'avis'];

const MAX_BYTES = 12 * 1024 * 1024;

/** Comprueba que el buffer es realmente una imagen admitida. */
function validar(buffer) {
  if (!buffer || !buffer.length) throw new Error('El archivo llegó vacío.');
  if (buffer.length > MAX_BYTES) throw new Error('La imagen pesa más de 12 MB. Redúcela antes de subirla.');

  const coincide = FIRMAS.some((f) => f.bytes.every((b, i) => buffer[i] === b));
  const tieneFtyp = buffer.slice(4, 8).toString('latin1') === 'ftyp';
  const marca = tieneFtyp ? buffer.slice(8, 12).toString('latin1').trim() : '';
  const esHeifOAvif = tieneFtyp && MARCAS_HEIF.includes(marca);

  if (!coincide && !esHeifOAvif) {
    throw new Error('Ese archivo no es una imagen válida. Admitimos JPG, PNG, WEBP, HEIC y AVIF.');
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
  const destino = path.join(CARPETAS.productos, archivo);
  const destinoMini = path.join(CARPETAS.productos, mini);

  let base;
  try {
    base = sharp(buffer, { failOn: 'none' }).rotate();

    await base
      .clone()
      .resize(1200, 1500, { fit: ajuste, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#ffffff' })
      .webp({ quality: 82 })
      .toFile(destino);
  } catch (e) {
    /* Este servidor tiene AVIF pero no el códec HEVC, que es el que usan por
       defecto casi todos los iPhone al fotografiar (el HEIC "normal", no el
       "más compatible"). Sin este mensaje, el fallo llega como un error
       técnico de sharp/libvips que no dice qué hacer. */
    const tecnico = String(e.message || '');
    if (/heif|hevc|h265/i.test(tecnico)) {
      throw new Error(
        'Esa foto viene en el formato HEIC de iPhone y este servidor no puede leerla. ' +
        'En el iPhone: Ajustes → Cámara → Formatos → "Más compatible", y vuelve a intentarlo. ' +
        'O expórtala como JPG antes de subirla.'
      );
    }
    throw new Error('No se ha podido procesar esa imagen. Prueba con otra foto o en formato JPG.');
  }

  /* Comprobación de seguridad: si el resultado sale prácticamente de un
     único color (una foto corrupta, un códec que falla a medias, un archivo
     truncado...), se rechaza en vez de guardar una imagen rota sin avisar.
     Es lo que explicaría una foto que "sale oscura" sin ningún error visible. */
  const stats = await sharp(destino).stats();
  const variacion = Math.max(...stats.channels.map((c) => c.stdev));
  if (variacion < 3) {
    await fs.promises.unlink(destino).catch(() => {});
    throw new Error(
      'La foto se ha guardado casi de un solo color, probablemente por un fallo al leerla. ' +
      'Prueba a exportarla como JPG y súbela de nuevo.'
    );
  }

  await base
    .clone()
    .resize(400, 500, { fit: ajuste, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 72 })
    .toFile(destinoMini);

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
