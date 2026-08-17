'use strict';

/**
 * Revisión de la instalación: `npm run diagnostico`
 *
 * Comprueba de una vez las cosas que suelen fallar al actualizar la tienda,
 * y dice exactamente qué comando arregla cada una.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db, MOTOR, DB_PATH } = require('./db');

const RAIZ = path.join(__dirname, '..');
const DIR_IMG = path.join(RAIZ, 'public', 'img', 'productos');
const problemas = [];

const bien = (t) => console.log(`   OK    ${t}`);
const mal = (t, arreglo) => { console.log(`   FALLO ${t}`); problemas.push(arreglo); };

console.log(`
  REVISIÓN DE LA TIENDA
  ---------------------
  Carpeta       : ${RAIZ}
  Base de datos : ${DB_PATH}
  Motor         : ${MOTOR}
`);

/* 1 · Catálogo del código */
const rutaCat = path.join(__dirname, 'catalogo-real.json');
let catalogo = [];
if (fs.existsSync(rutaCat)) {
  catalogo = JSON.parse(fs.readFileSync(rutaCat, 'utf8'));
  bien(`catalogo-real.json presente (${catalogo.length} artículos)`);
} else {
  mal('falta server/catalogo-real.json', 'node server/construir-catalogo.js');
}

/* 2 · Fotos en disco */
const webp = fs.existsSync(DIR_IMG) ? fs.readdirSync(DIR_IMG).filter((f) => f.endsWith('.webp')) : [];
const svg = fs.existsSync(DIR_IMG) ? fs.readdirSync(DIR_IMG).filter((f) => f.endsWith('.svg')) : [];
if (webp.length) bien(`${webp.length} fotos en public/img/productos/`);
else mal('no hay ninguna foto de producto', 'node server/construir-catalogo.js');
if (svg.length) {
  console.log(`   AVISO ${svg.length} ilustraciones .svg de la versión antigua (se pueden borrar)`);
}

/* 3 · Artículos publicados */
const publicados = db.prepare('SELECT sku, nombre, imagen FROM productos WHERE activo = 1').all();
if (publicados.length) bien(`${publicados.length} artículos publicados en la tienda`);
else mal('la tienda no tiene ningún artículo', 'npm run seed');

/* 4 · ¿Coincide lo publicado con el catálogo? */
if (catalogo.length && publicados.length) {
  const skus = new Set(publicados.map((p) => p.sku));
  const comunes = catalogo.filter((a) => skus.has(a.sku)).length;
  const pct = Math.round((comunes / catalogo.length) * 100);
  if (pct >= 80) bien(`el catálogo publicado coincide con el del código (${pct} %)`);
  else mal(`solo coincide el ${pct} % — la base viene de una versión anterior`,
           'npm run catalogo -- --aplicar');
}

/* 5 · Fotos rotas */
const rotas = publicados.filter((p) => p.imagen && p.imagen.startsWith('/img/') &&
  !fs.existsSync(path.join(RAIZ, 'public', p.imagen.replace(/^\//, ''))));
if (!rotas.length) bien('ningún artículo apunta a una foto que falte');
else {
  mal(`${rotas.length} artículos con la foto rota`, 'npm run catalogo -- --aplicar');
  for (const p of rotas.slice(0, 5)) console.log(`         ${p.sku} → ${p.imagen}`);
}

/* 6 · Administración */
const admins = db.prepare("SELECT email FROM usuarios WHERE rol = 'admin'").all();
if (admins.length) bien(`acceso de administración: ${admins.map((a) => a.email).join(', ')}`);
else mal('no hay ninguna cuenta de administración', 'npm run admin -- --reset');

/* 7 · Configuración */
if (fs.existsSync(path.join(RAIZ, '.env'))) {
  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  if (/JWT_SECRET=cambia|JWT_SECRET=globo-dev/.test(env)) {
    console.log('   AVISO la clave JWT_SECRET sigue siendo la de ejemplo (cámbiala antes de publicar)');
  } else bien('.env configurado');
} else {
  console.log('   AVISO no hay archivo .env (se usan los valores por defecto)');
}

/* --------------------------------- Resumen -------------------------------- */

if (!problemas.length) {
  console.log('\n  Todo correcto. Arranca con: npm start\n');
} else {
  console.log('\n  QUÉ HACER, EN ESTE ORDEN:\n');
  [...new Set(problemas)].forEach((c, i) => console.log(`    ${i + 1}.  ${c}`));
  console.log('');
}
