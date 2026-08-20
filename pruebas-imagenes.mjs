/* Pruebas del módulo de imagen y estudio. Requiere el servidor arrancado. */

import sharp from 'sharp';

const B = process.env.BASE || 'http://localhost:3000';
let ok = 0;
let fallos = 0;

function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    ok++;
    console.log(`  ok   ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLO ${nombre} ${detalle}`);
  }
}

async function llamar(ruta, opciones = {}, token = null) {
  const cabeceras = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  const r = await fetch(B + ruta, { ...opciones, headers: cabeceras });
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
}

async function enviarArchivo(ruta, campos, token) {
  const fd = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor?.buffer) fd.append(clave, new Blob([valor.buffer], { type: 'image/png' }), valor.nombre);
    else fd.append(clave, valor);
  }
  const r = await fetch(B + ruta, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
}

/* Imágenes sintéticas para no depender de ficheros externos. */
const fotoModelo = await sharp({
  create: { width: 900, height: 1200, channels: 3, background: '#d8cfc6' }
})
  .png()
  .toBuffer();

/* Imagen de prueba: rectángulo de color sobre fondo blanco. */
const prenda = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
  .composite([
    {
      input: await sharp({ create: { width: 380, height: 400, channels: 3, background: '#d4577e' } }).png().toBuffer(),
      left: 210,
      top: 200
    }
  ])
  .png()
  .toBuffer();

const noEsImagen = Buffer.from('<?php echo "esto no es una foto"; ?>');

console.log('\n  Imágenes de producto\n');

/* Sesión de administración */
const login = await llamar('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@modaglobo.es', password: 'admin1234' })
});
const admin = login.cuerpo.token;
comprobar('acceso de administrador', !!admin);

/* -------------------------------- Permisos -------------------------------- */

const sinSesion = await llamar('/api/admin/productos/1/imagenes');
comprobar('la galería exige sesión de administrador', sinSesion.estado === 401);

/* ------------------------------ Subida de fotos --------------------------- */

const { productos } = (await llamar('/api/admin/productos', {}, admin)).cuerpo;
/* Se elige un artículo activo: las otras pruebas dan de baja los que crean. */
const articulo = productos.find((p) => p.activo === 1);
comprobar('hay un artículo activo con el que trabajar', !!articulo);

const subida = await enviarArchivo(`/api/admin/productos/${articulo.id}/imagenes`, { imagenes: { buffer: prenda, nombre: 'p.png' } }, admin);
comprobar('sube una foto al artículo', subida.estado === 201, JSON.stringify(subida.cuerpo).slice(0, 100));
comprobar('la primera foto queda como portada', subida.cuerpo.imagenes?.[0]?.principal === 1);
comprobar('genera miniatura', !!subida.cuerpo.imagenes?.[0]?.miniatura);

const basura = await enviarArchivo(`/api/admin/productos/${articulo.id}/imagenes`, { imagenes: { buffer: noEsImagen, nombre: 'virus.png' } }, admin);
comprobar('rechaza un archivo que no es imagen', basura.estado === 400, JSON.stringify(basura.cuerpo).slice(0, 80));

const ficha = await llamar(`/api/productos/${articulo.slug}`);
comprobar('la galería llega a la ficha pública', (ficha.cuerpo.producto?.imagenes || []).length > 0);


/* ------------------------------ Portada y borrado ------------------------- */

const segunda = await enviarArchivo(`/api/admin/productos/${articulo.id}/imagenes`, { imagenes: { buffer: prenda, nombre: 'p2.png' } }, admin);
comprobar('admite varias fotos por artículo', segunda.cuerpo.imagenes.length >= 2);

const noPrincipal = segunda.cuerpo.imagenes.find((i) => !i.principal);
const cambio = await llamar(`/api/admin/imagenes/${noPrincipal.id}/principal`, { method: 'PUT' }, admin);
comprobar('cambia la portada', cambio.cuerpo.imagenes.find((i) => i.id === noPrincipal.id).principal === 1);

const fichaTrasPortada = await llamar(`/api/productos/${articulo.slug}`);
comprobar('la portada nueva llega a la tienda', fichaTrasPortada.cuerpo.producto.imagen === noPrincipal.ruta);

const borrada = await llamar(`/api/admin/imagenes/${noPrincipal.id}`, { method: 'DELETE' }, admin);
comprobar('borra una imagen', !borrada.cuerpo.imagenes.some((i) => i.id === noPrincipal.id));
comprobar('y reasigna la portada', borrada.cuerpo.imagenes.some((i) => i.principal === 1));

/* ------------ Guardar el resto del formulario no debe pisar la portada ---- */

/* Hubo un fallo real: el campo oculto de la portada en el formulario de
   edición no se refrescaba al subir una foto nueva. Si después se guardaba
   cualquier otro cambio (precio, tallas...) sin volver a abrir el modal, ese
   valor viejo pisaba la portada real y la tienda volvía a enseñar el dibujo
   de repuesto, aunque la ficha del artículo sí tuviera la foto correcta. */
const nuevoArtPortada = await llamar('/api/admin/productos', {
  method: 'POST',
  body: JSON.stringify({ nombre: 'Prueba de portada', categoria_id: 'complementos', precio: 12 })
}, admin);
const idPortada = nuevoArtPortada.cuerpo.producto.id;
comprobar('el artículo nace con la imagen genérica', nuevoArtPortada.cuerpo.producto.imagen === '/img/productos/generico.svg');

const subidaPortada = await enviarArchivo(`/api/admin/productos/${idPortada}/imagenes`, { imagenes: { buffer: prenda, nombre: 'p.png' } }, admin);
const rutaReal = subidaPortada.cuerpo.imagenes[0].ruta;
comprobar('subir una foto fija la portada real', rutaReal !== '/img/productos/generico.svg');

/* Se simula el fallo: el navegador manda el formulario con la portada
   VIEJA (como si el campo oculto no se hubiera refrescado), guardando de
   paso otro cambio cualquiera (el precio). */
await llamar(`/api/admin/productos/${idPortada}`, {
  method: 'PUT',
  body: JSON.stringify({ precio: 15, imagen: '/img/productos/generico.svg' })
}, admin);
const trasGuardar = await llamar('/api/admin/productos', {}, admin);
const prodPortada = trasGuardar.cuerpo.productos.find((p) => p.id === idPortada);
comprobar('la portada real sobrevive aunque el formulario mande una vieja',
  prodPortada?.imagen === rutaReal, `quedó: ${prodPortada?.imagen}`);

await llamar(`/api/admin/productos/${idPortada}`, { method: 'DELETE' }, admin);

console.log(`\n  ${ok} correctas · ${fallos} fallidas\n`);
process.exit(fallos ? 1 : 0);
