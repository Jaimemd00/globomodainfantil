'use strict';

/**
 * Sella los enlaces a CSS y JS con una huella de su contenido.
 *
 *   <link href="/assets/css/estilos.css?v=a3f91c">
 *
 * Por qué una huella y no el número de versión: con un sello fijo, al cambiar
 * un archivo la URL seguía siendo la misma y el navegador se quedaba con la
 * copia vieja durante días. Con la huella, cualquier cambio en el archivo
 * cambia la URL y el navegador lo descarga solo.
 *
 * Se ejecuta automáticamente antes de `npm start`, así que no hay que
 * acordarse de nada.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public');

/** Huella corta y estable del contenido de un archivo. */
function huella(rutaPublica) {
  const archivo = path.join(PUBLICO, rutaPublica.replace(/^\//, ''));
  if (!fs.existsSync(archivo)) return null;
  return crypto.createHash('md5').update(fs.readFileSync(archivo)).digest('hex').slice(0, 8);
}

const PATRON = /(href|src)="(\/assets\/(?:css|js)\/[^"?]+)(?:\?v=[^"]*)?"/g;

let paginas = 0;
let sellos = 0;

for (const nombre of fs.readdirSync(PUBLICO).filter((f) => f.endsWith('.html'))) {
  const ruta = path.join(PUBLICO, nombre);
  const original = fs.readFileSync(ruta, 'utf8');

  const actualizado = original.replace(PATRON, (todo, atributo, recurso) => {
    const h = huella(recurso);
    if (!h) return todo;
    sellos++;
    return `${atributo}="${recurso}?v=${h}"`;
  });

  if (actualizado !== original) {
    fs.writeFileSync(ruta, actualizado);
    paginas++;
  }
}

if (process.argv.includes('--silencioso')) process.exit(0);
console.log(`  ${sellos} enlaces sellados en ${paginas} ${paginas === 1 ? 'página' : 'páginas'}.`);
