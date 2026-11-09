'use strict';

/**
 * SEO del lado del servidor.
 *
 * La tienda pinta el contenido con JavaScript, pero los buscadores y, sobre
 * todo, las vistas previas de WhatsApp, Instagram o Facebook leen el HTML tal
 * cual llega, sin ejecutar nada. Aquí se inyecta en ese HTML lo que necesitan:
 *
 *   - <title> y descripción propios de cada página (producto, categoría…),
 *     con la ubicación: Écija, provincia de Sevilla, Andalucía.
 *   - Enlace canónico, Open Graph y Twitter (foto, título y precio al compartir).
 *   - Datos estructurados schema.org: la tienda física (ClothingStore, para
 *     búsquedas locales), el producto con su precio, y la miga de pan.
 *   - robots.txt y sitemap.xml generados al vuelo con el dominio real y todos
 *     los productos activos (antes eran ficheros fijos con otro dominio).
 *
 * El dominio sale de SITIO_URL en .env (por defecto https://modaglobo.com).
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const { db } = require('./db');

const router = express.Router();

const SITIO = String(process.env.SITIO_URL || 'https://modaglobo.com').replace(/\/+$/, '');
const PUBLICO = path.join(__dirname, '..', 'public');

/* Datos del negocio, tal y como aparecen en la web (ayuda, legal, pie). */
const NEGOCIO = {
  nombre: 'Globo Moda Infantil',
  telefono: '+34626347020',
  email: 'hola@modaglobo.es',
  calle: 'Plaza Giles y Rubio',
  cp: '41400',
  localidad: 'Écija',
  provincia: 'Sevilla',
  region: 'Andalucía',
  dias: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  tramos: [['10:00', '14:00'], ['17:30', '20:30']]
};

const SUFIJO = 'Globo Moda Infantil · Écija (Sevilla)';
const IMAGEN_GENERICA = '/img/og-globo.jpg';

/* ------------------------------- Utilidades ------------------------------ */

const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escXml = escHtml;

/* JSON dentro de <script>: se escapa "<" para que un nombre de producto con
   "</script>" no pueda cerrar la etiqueta e inyectar código. */
const jsonSeguro = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const absoluta = (ruta) => {
  if (!ruta) return `${SITIO}${IMAGEN_GENERICA}`;
  if (/^https?:\/\//i.test(ruta)) return ruta;
  return `${SITIO}${ruta.startsWith('/') ? '' : '/'}${ruta}`;
};

const recortar = (texto, max = 155) => {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/[\s,.;:]+\S*$/, '')}…`;
};

/* Descripciones de relleno del catálogo inicial (repetidas en decenas de
   fichas): para Google son contenido duplicado, así que se sustituyen por una
   descripción generada con nombre, categoría, precio y ubicación. */
const esRelleno = (d) => {
  const t = String(d || '').trim();
  return (
    !t ||
    /pendiente de describir/i.test(t) ||
    /^[^.]{0,120}\.\s*Consulta la gu[ií]a de tallas si dudas entre dos\.?$/i.test(t)
  );
};

function enBlackFriday(hoy = new Date()) {
  const mmdd = `${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return mmdd >= '11-07' && mmdd <= '12-01';
}

/* Plantillas HTML en memoria, recargadas si el fichero cambia en disco
   (el sellado de versiones reescribe los HTML al desplegar). */
const plantillas = new Map();
function plantilla(nombre) {
  const ruta = path.join(PUBLICO, nombre);
  const mtime = fs.statSync(ruta).mtimeMs;
  const guardada = plantillas.get(nombre);
  if (guardada && guardada.mtime === mtime) return guardada.html;
  const html = fs.readFileSync(ruta, 'utf8');
  plantillas.set(nombre, { mtime, html });
  return html;
}

/* Mete en el HTML el título, la descripción y las etiquetas de la página. */
function pintar(html, m) {
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escHtml(m.titulo)}</title>`);

  const desc = `<meta name="description" content="${escHtml(m.descripcion)}">`;
  out = /<meta\s+name="description"[^>]*>/i.test(out)
    ? out.replace(/<meta\s+name="description"[^>]*>/i, desc)
    : out.replace(/<\/title>/i, `</title>\n${desc}`);

  const etiquetas = [
    m.indexar === false ? '<meta name="robots" content="noindex, follow">' : '',
    m.canonica ? `<link rel="canonical" href="${escHtml(m.canonica)}">` : '',
    `<meta property="og:site_name" content="${escHtml(NEGOCIO.nombre)}">`,
    '<meta property="og:locale" content="es_ES">',
    `<meta property="og:type" content="${escHtml(m.tipo || 'website')}">`,
    `<meta property="og:title" content="${escHtml(m.tituloSocial || m.titulo)}">`,
    `<meta property="og:description" content="${escHtml(m.descripcion)}">`,
    m.canonica ? `<meta property="og:url" content="${escHtml(m.canonica)}">` : '',
    `<meta property="og:image" content="${escHtml(absoluta(m.imagen))}">`,
    m.precio != null ? `<meta property="product:price:amount" content="${Number(m.precio).toFixed(2)}">` : '',
    m.precio != null ? '<meta property="product:price:currency" content="EUR">' : '',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escHtml(m.tituloSocial || m.titulo)}">`,
    `<meta name="twitter:description" content="${escHtml(m.descripcion)}">`,
    `<meta name="twitter:image" content="${escHtml(absoluta(m.imagen))}">`,
    '<meta name="geo.region" content="ES-SE">',
    `<meta name="geo.placename" content="${escHtml(`${NEGOCIO.localidad}, ${NEGOCIO.provincia}`)}">`,
    ...(m.datos || []).map((d) => `<script type="application/ld+json">${jsonSeguro(d)}</script>`)
  ].filter(Boolean);

  return out.replace(/<\/head>/i, `${etiquetas.join('\n')}\n</head>`);
}

function enviarHtml(res, html, estado = 200) {
  res.status(estado);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.send(html);
}

/* ------------------------- Datos estructurados ---------------------------- */

const tienda = () => ({
  '@context': 'https://schema.org',
  '@type': 'ClothingStore',
  '@id': `${SITIO}/#tienda`,
  name: NEGOCIO.nombre,
  url: `${SITIO}/`,
  image: absoluta(IMAGEN_GENERICA),
  logo: absoluta('/img/logo.svg'),
  telephone: NEGOCIO.telefono,
  email: NEGOCIO.email,
  priceRange: '€€',
  description:
    'Tienda de moda infantil en Écija (Sevilla): ropa de bebé, niña, niño y ceremonia de 0 a 14 años. Venta online con envío a toda España y recogida gratis en tienda.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: NEGOCIO.calle,
    addressLocality: NEGOCIO.localidad,
    addressRegion: NEGOCIO.provincia,
    postalCode: NEGOCIO.cp,
    addressCountry: 'ES'
  },
  areaServed: [
    { '@type': 'City', name: 'Écija' },
    { '@type': 'AdministrativeArea', name: 'Provincia de Sevilla' },
    { '@type': 'AdministrativeArea', name: 'Andalucía' },
    { '@type': 'Country', name: 'España' }
  ],
  openingHoursSpecification: NEGOCIO.tramos.map(([abre, cierra]) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: NEGOCIO.dias,
    opens: abre,
    closes: cierra
  }))
});

const sitioWeb = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITIO}/#web`,
  name: NEGOCIO.nombre,
  url: `${SITIO}/`,
  inLanguage: 'es-ES',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITIO}/tienda?q={search_term_string}`,
    'query-input': 'required name=search_term_string'
  }
});

const migas = (pasos) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: pasos.map(([nombre, url], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: nombre,
    item: url
  }))
});

/* -------------------------------- Páginas -------------------------------- */

// Portada
router.get(['/', '/index.html'], (_req, res, next) => {
  try {
    const html = pintar(plantilla('index.html'), {
      titulo: 'Moda infantil y ceremonia en Écija (Sevilla) · Globo Moda Infantil',
      tituloSocial: 'Globo Moda Infantil · Écija (Sevilla)',
      descripcion:
        'Tienda de moda infantil en Écija, Sevilla: ropa de bebé, niña, niño y ceremonia de 0 a 14 años. Compra online con envío 24-48 h o recoge gratis en tienda.',
      canonica: `${SITIO}/`,
      datos: [tienda(), sitioWeb()]
    });
    enviarHtml(res, html);
  } catch (e) {
    next(e);
  }
});

// Catálogo: general, por categoría, rebajas o búsqueda
router.get(['/tienda', '/tienda.html'], (req, res, next) => {
  try {
    const slug = String(req.query.categoria || '');
    const rebaja = req.query.rebaja === '1';
    const q = String(req.query.q || '').trim();
    const pasos = [['Inicio', `${SITIO}/`], ['Tienda', `${SITIO}/tienda`]];
    let m;

    if (q) {
      /* Las páginas de resultados no se indexan: contenido cambiante y fino. */
      m = {
        titulo: `Resultados para «${recortar(q, 40)}» · ${SUFIJO}`,
        descripcion: `Prendas de moda infantil que coinciden con «${recortar(q, 40)}» en Globo, Écija (Sevilla).`,
        canonica: `${SITIO}/tienda`,
        indexar: false
      };
    } else if (rebaja) {
      const bf = enBlackFriday();
      m = {
        titulo: bf
          ? 'Black Friday en moda infantil · Rebajas en Écija (Sevilla) · Globo'
          : `Rebajas de moda infantil · ${SUFIJO}`,
        descripcion: `${bf ? 'Black Friday: ' : ''}ropa de bebé, niña, niño y ceremonia rebajada en Globo, tienda de moda infantil de Écija (Sevilla). Envío 24-48 h o recogida gratis.`,
        canonica: `${SITIO}/tienda?rebaja=1`
      };
      pasos.push(['Rebajas', m.canonica]);
    } else if (slug) {
      const cat = db.prepare('SELECT * FROM categorias WHERE slug = ?').get(slug);
      if (cat) {
        const edad = cat.edad ? ` (${cat.edad})` : '';
        m = {
          titulo: `${cat.nombre}${edad} · Ropa infantil en Écija (Sevilla) · Globo`,
          descripcion: recortar(
            !esRelleno(cat.descripcion) && cat.descripcion
              ? `${cat.descripcion} En Globo, Écija (Sevilla): compra online o recoge gratis en tienda.`
              : `Ropa de ${cat.nombre.toLowerCase()}${edad} en Globo Moda Infantil, tienda de Écija (Sevilla). Compra online con envío 24-48 h o recoge gratis en tienda.`
          ),
          canonica: `${SITIO}/tienda?categoria=${encodeURIComponent(cat.slug)}`
        };
        pasos.push([cat.nombre, m.canonica]);
      }
    }

    if (!m) {
      m = {
        titulo: `Toda la ropa infantil · ${SUFIJO}`,
        descripcion:
          'Catálogo de moda infantil de Globo, en Écija (Sevilla): bebé, niña, niño, ceremonia y complementos de 0 a 14 años. Envío 24-48 h o recogida gratis.',
        canonica: `${SITIO}/tienda`
      };
    }

    m.datos = [migas(pasos)];
    enviarHtml(res, pintar(plantilla('tienda.html'), m));
  } catch (e) {
    next(e);
  }
});

// Ficha de producto
router.get(['/producto', '/producto.html'], (req, res, next) => {
  try {
    const slug = String(req.query.slug || '');
    if (!slug) return next(); // sin slug, el JS de la página manda a /tienda

    const p = db
      .prepare(
        `SELECT p.*, c.slug AS categoria_slug, c.nombre AS categoria_nombre
         FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE p.slug = ? AND p.activo = 1`
      )
      .get(slug);

    if (!p) {
      return enviarHtml(
        res,
        pintar(plantilla('producto.html'), {
          titulo: `Artículo no disponible · ${SUFIJO}`,
          descripcion: 'Este artículo ya no está disponible. Mira el resto de la ropa infantil de Globo, en Écija (Sevilla).',
          indexar: false
        }),
        404
      );
    }

    const stock = db.prepare('SELECT COALESCE(SUM(stock), 0) AS n FROM variantes WHERE producto_id = ?').get(p.id).n;
    const url = `${SITIO}/producto?slug=${encodeURIComponent(p.slug)}`;
    const urlCat = `${SITIO}/tienda?categoria=${encodeURIComponent(p.categoria_slug)}`;
    const precio = Number(p.precio).toFixed(2).replace('.', ',');

    const descripcion = recortar(
      esRelleno(p.descripcion)
        ? `${p.nombre}, ${p.categoria_nombre.toLowerCase()}, por ${precio} €. En Globo Moda Infantil, Écija (Sevilla): envío 24-48 h o recogida gratis en tienda.`
        : `${p.descripcion} ${precio} € en Globo, Écija (Sevilla).`
    );

    const producto = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.nombre,
      description: descripcion,
      sku: p.sku,
      image: [absoluta(p.imagen)],
      category: p.categoria_nombre,
      ...(p.color ? { color: p.color } : {}),
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'EUR',
        price: Number(p.precio).toFixed(2),
        availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@id': `${SITIO}/#tienda`, '@type': 'ClothingStore', name: NEGOCIO.nombre }
      }
    };

    const html = pintar(plantilla('producto.html'), {
      titulo: `${p.nombre} · ${p.categoria_nombre} · Globo Moda Infantil Écija`,
      tituloSocial: `${p.nombre} — ${precio} €`,
      descripcion,
      canonica: url,
      tipo: 'product',
      imagen: p.imagen,
      precio: p.precio,
      datos: [
        producto,
        migas([
          ['Inicio', `${SITIO}/`],
          [p.categoria_nombre, urlCat],
          [p.nombre, url]
        ])
      ]
    });
    enviarHtml(res, html);
  } catch (e) {
    next(e);
  }
});

// Páginas informativas: canónica y vista previa social
const INFORMATIVAS = {
  '/ayuda': ['ayuda.html', `Ayuda, envíos y devoluciones · ${SUFIJO}`, 'Envíos 24-48 h en península, gratis desde 49 €, recogida gratis en nuestra tienda de Écija (Sevilla), cambios y devoluciones, y guía de tallas.'],
  '/seguimiento': ['seguimiento.html', `Seguir mi pedido · ${SUFIJO}`, 'Consulta en qué punto está tu pedido de Globo Moda Infantil, tienda de Écija (Sevilla).'],
  '/legal': ['legal.html', `Información legal · ${SUFIJO}`, 'Aviso legal, privacidad, cookies y condiciones de compra de Globo Moda Infantil, Écija (Sevilla).']
};
for (const [ruta, [fichero, titulo, descripcion]] of Object.entries(INFORMATIVAS)) {
  router.get([ruta, `${ruta}.html`], (_req, res, next) => {
    try {
      enviarHtml(res, pintar(plantilla(fichero), { titulo, descripcion, canonica: `${SITIO}${ruta}` }));
    } catch (e) {
      next(e);
    }
  });
}

/* ---------------------------- robots y sitemap ---------------------------- */

router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /cuenta',
      'Disallow: /checkout',
      'Disallow: /carrito',
      'Disallow: /pago-simulado',
      'Disallow: /revision',
      'Disallow: /api/',
      'Disallow: /tienda?q=',
      '',
      `Sitemap: ${SITIO}/sitemap.xml`,
      ''
    ].join('\n')
  );
});

router.get('/sitemap.xml', (_req, res, next) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const urls = [];
    const anadir = (loc, prioridad, extra = {}) => urls.push({ loc, prioridad, ...extra });

    anadir(`${SITIO}/`, '1.0', { lastmod: hoy, frecuencia: 'daily' });
    anadir(`${SITIO}/tienda`, '0.9', { lastmod: hoy, frecuencia: 'daily' });
    anadir(`${SITIO}/tienda?rebaja=1`, '0.9', { lastmod: hoy, frecuencia: 'daily' });

    for (const c of db.prepare('SELECT slug FROM categorias ORDER BY orden, id').all()) {
      anadir(`${SITIO}/tienda?categoria=${encodeURIComponent(c.slug)}`, '0.8', { frecuencia: 'weekly' });
    }

    const productos = db
      .prepare('SELECT slug, nombre, imagen, creado_en FROM productos WHERE activo = 1 ORDER BY id DESC')
      .all();
    for (const p of productos) {
      anadir(`${SITIO}/producto?slug=${encodeURIComponent(p.slug)}`, '0.7', {
        lastmod: String(p.creado_en || hoy).slice(0, 10),
        imagen: p.imagen ? absoluta(p.imagen) : null,
        titulo: p.nombre
      });
    }

    anadir(`${SITIO}/ayuda`, '0.5');
    anadir(`${SITIO}/seguimiento`, '0.4');
    anadir(`${SITIO}/legal`, '0.2');

    const cuerpo = urls
      .map((u) =>
        [
          '  <url>',
          `    <loc>${escXml(u.loc)}</loc>`,
          u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
          u.frecuencia ? `    <changefreq>${u.frecuencia}</changefreq>` : '',
          `    <priority>${u.prioridad}</priority>`,
          u.imagen
            ? `    <image:image><image:loc>${escXml(u.imagen)}</image:loc><image:title>${escXml(u.titulo)}</image:title></image:image>`
            : '',
          '  </url>'
        ]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n');

    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${cuerpo}\n</urlset>\n`
      );
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.SITIO = SITIO;
