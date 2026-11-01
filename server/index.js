'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const { db, MOTOR } = require('./db');
const authRutas = require('./routes/auth');
const productosRutas = require('./routes/productos');
const pedidosRutas = require('./routes/pedidos');
const cuponesRutas = require('./routes/cupones');
const adminRutas = require('./routes/admin');
const adminMediaRutas = require('./routes/admin-media');
const pagosRutas = require('./pagos/rutas');
const pasarela = require('./pagos/proveedores');

const app = express();
const PUERTO = process.env.PORT || 3000;
const PUBLICO = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');

/* Detrás de Nginx: confiamos en 1 proxy para que req.ip sea la IP REAL del
   cliente (la que Nginx añade en X-Forwarded-For) y no la del propio Nginx.
   Sin esto, el rate-limit y el tope del cupón por IP verían a todos como la
   misma IP. Si algún día se pone Cloudflare delante de Nginx, subir a 2.
   Requiere que Nginx reenvíe la cabecera:
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; */
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

/* El webhook de la pasarela necesita el cuerpo sin parsear: la firma se
   calcula sobre los bytes exactos, y si Express los convierte a objeto y se
   vuelven a serializar, deja de coincidir. Se aplica solo a esa ruta y antes
   de express.json, que respeta lo que ya viene parseado. */
app.use('/api/pagos/webhook', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Cabeceras de seguridad básicas (en producción, delegar en Nginx/Cloudflare).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// API
app.use('/api/auth', authRutas);
app.use('/api', productosRutas);
app.use('/api', pedidosRutas);
app.use('/api', cuponesRutas);
app.use('/api/pagos', pagosRutas);
app.use('/api/admin', adminMediaRutas);
app.use('/api/admin', adminRutas);

app.get('/api/salud', (_req, res) => {
  const productos = db.prepare('SELECT COUNT(*) AS n FROM productos').get().n;
  res.json({ ok: true, productos, hora: new Date().toISOString() });
});

// Estáticos y páginas
/*
 * Caché de los archivos estáticos.
 *
 * El HTML NO se cachea: es el índice que dice qué CSS y qué JS hay que
 * cargar. Si se guarda en el navegador, al actualizar la tienda queda una
 * mezcla de HTML viejo con JavaScript nuevo y hay trozos de página que
 * dejan de aparecer, sin ningún error visible.
 *
 * El CSS, el JS y las fotos sí se cachean: llevan la versión en la URL
 * (?v=), así que un cambio de versión trae el archivo nuevo igualmente.
 */
app.use(
  express.static(PUBLICO, {
    extensions: ['html'],
    setHeaders(res, ruta) {
      if (ruta.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (/\.(css|js|webp|jpg|png|svg|woff2?)$/.test(ruta)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    }
  })
);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(PUBLICO, '404.html'));
});

app.use((err, _req, res, _next) => {
  /* Multer avisa aparte cuando el archivo excede el límite. */
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'La imagen pesa demasiado. El máximo son 12 MB.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Algo ha fallado en el servidor. Inténtalo de nuevo en un momento.' });
});

/**
 * Comprobación al arrancar: si la base no coincide con el catálogo del código
 * o faltan fotos, la tienda se ve mal y no es evidente por qué. Mejor decirlo
 * en la consola que dejar al usuario mirando una portada con artículos viejos.
 */
function revisarCatalogo() {
  const fs = require('fs');
  const rutaCat = path.join(__dirname, 'catalogo-real.json');
  if (!fs.existsSync(rutaCat)) return;

  const catalogo = JSON.parse(fs.readFileSync(rutaCat, 'utf8'));
  const enBase = db.prepare('SELECT sku, imagen FROM productos WHERE activo = 1').all();
  if (!enBase.length) {
    console.log('\n  AVISO: no hay ningún artículo publicado. Ejecuta: npm run seed\n');
    return;
  }

  const skus = new Set(enBase.map((p) => p.sku));
  const comunes = catalogo.filter((a) => skus.has(a.sku)).length;
  if (comunes < catalogo.length * 0.5) {
    console.log(`
  AVISO: la tienda muestra ${enBase.length} artículos que no son los del catálogo
  actual (${catalogo.length}). Vienen de una instalación anterior.

      npm run catalogo              ver qué cambiaría
      npm run catalogo -- --aplicar actualizar sin perder pedidos
`);
    return;
  }

  const faltan = enBase.filter((p) => p.imagen && p.imagen.startsWith('/img/') &&
    !fs.existsSync(path.join(PUBLICO, p.imagen.replace('/img/', 'img/')))).length;
  if (faltan) {
    console.log(`\n  AVISO: ${faltan} artículos apuntan a fotos que no existen.`);
    console.log('  Regenéralas con: node server/construir-catalogo.js\n');
  }
}

app.listen(PUERTO, () => {
  console.log(`\n  Globo en marcha  →  http://localhost:${PUERTO}`);
  console.log(`  Panel de gestión    →  http://localhost:${PUERTO}/admin`);
  console.log(`  Motor de datos      →  ${MOTOR}`);
  console.log(`  Pasarela de pago    →  ${pasarela.PROVEEDOR}${pasarela.esSimulacion() ? ' (simulación)' : ''}\n`);
});
