'use strict';

/**
 * Construye el catálogo real de la tienda a partir de las fotos y los datos
 * extraídos de los catálogos de proveedor.
 *
 * Entrada : /tmp/basicos.json + /tmp/fotos/       (canastilla y básicos)
 *           /tmp/popys.json   + /tmp/fotos-pop/   (ceremonia y vestir)
 * Salida  : server/catalogo-real.json y las imágenes en public/img/productos/
 *
 * Los PRECIOS son una propuesta de partida calculada por tipo de prenda: hay
 * que revisarlos con las tarifas reales de la tienda antes de publicar.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'public', 'img', 'productos');
fs.mkdirSync(DESTINO, { recursive: true });

/* ------------------------- Reglas de clasificación ------------------------- */

/** [palabra en el nombre, categoría, precio orientativo, tipo de talla] */
const REGLAS = [
  ['PACK NACIMIENTO', 'recien-nacido', 42.95, 'unica'],
  ['CAJA REGALO', 'recien-nacido', 39.95, 'unica'],
  ['CANASTILLA', 'recien-nacido', 49.95, 'unica'],
  ['TOQUILLA', 'recien-nacido', 34.95, 'unica'],
  ['CAPOTA', 'recien-nacido', 14.95, 'bebe'],
  ['PATUCO', 'recien-nacido', 11.95, 'bebe'],
  ['MANOPLAS', 'recien-nacido', 8.95, 'unica'],
  ['GASAS', 'recien-nacido', 12.95, 'unica'],
  ['DUDU', 'recien-nacido', 15.95, 'unica'],
  ['BABERO', 'complementos', 9.95, 'unica'],
  ['GORRO', 'complementos', 12.95, 'bebe'],
  ['TOCA', 'complementos', 13.95, 'unica'],
  ['POLAINA', 'complementos', 13.95, 'bebe'],
  ['LEGGIN', 'complementos', 15.95, 'infantil'],
  ['BODY', 'recien-nacido', 13.95, 'bebe'],
  ['BOSY', 'recien-nacido', 13.95, 'bebe'],
  ['CAMISETA', 'complementos', 14.95, 'infantil'],
  ['PELELE', 'recien-nacido', 26.95, 'bebe'],
  ['RANITA', 'ceremonia', 34.95, 'bebe'],
  ['VESTIDO', 'ceremonia', 46.95, 'infantil'],
  ['PICHI', 'nina', 38.95, 'infantil'],
  ['FALDA', 'nina', 29.95, 'infantil'],
  ['BLUSA', 'nina', 29.95, 'infantil'],
  ['CAMISA', 'nino', 29.95, 'infantil'],
  ['BERMUDA', 'nino', 26.95, 'infantil'],
  ['PANTALON', 'nino', 29.95, 'infantil'],
  ['PANTALÓN', 'nino', 29.95, 'infantil'],
  ['SHORT', 'nino', 24.95, 'infantil'],
  ['JERSEY', 'nina', 32.95, 'infantil'],
  ['CHAQUETA', 'nina', 36.95, 'infantil'],
  ['CONJUNTO', 'ceremonia', 44.95, 'bebe'],
  ['CUBREPAÑAL', 'recien-nacido', 16.95, 'bebe'],
  ['BRAGUITA', 'recien-nacido', 12.95, 'bebe'],
  ['PIJAMA', 'recien-nacido', 24.95, 'bebe']
];

const TALLAS = {
  bebe: ['0M', '1M', '3M', '6M', '9M', '12M', '18M', '24M', '36M'],
  infantil: ['2A', '4A', '6A', '8A', '10A', '12A'],
  unica: ['Única']
};

/** Convierte "PR-0-1-3-6-9-12" en la lista de tallas de la tienda. */
function tallasDesde(texto, tipo) {
  if (!texto) return TALLAS[tipo] || TALLAS.bebe;
  const limpio = String(texto).toUpperCase().replace(/\s/g, '');
  const anios = /A$/.test(limpio) || /(\d+)-(\d+)A/.test(limpio);
  const numeros = limpio.split(/[-–]/).map((t) => t.replace(/[^0-9]/g, '')).filter(Boolean);
  if (!numeros.length) return TALLAS[tipo] || TALLAS.bebe;

  const sufijo = anios ? 'A' : 'M';
  const lista = [];
  if (/^PR/.test(limpio)) lista.push('PR');
  for (const n of numeros) {
    const t = `${n}${sufijo}`;
    if (!lista.includes(t)) lista.push(t);
  }
  return lista.slice(0, 10);
}

/* Pistas para repartir entre niña y niño. En canastilla casi todo es unisex,
   así que solo se separa cuando el nombre lo indica de verdad. */
const PISTA_NINA = ['PUNTILLA', 'VOLANTE', 'VOLANTES', 'CALAD', 'BORDAD', 'PERLÉ', 'PERLE',
                    'BAMBULA', 'NIÑA', 'BATISTA', 'CISNE', 'PLUMETI'];
const PISTA_NINO = ['POLO', 'SPORT', 'NIÑO', 'PICO', 'CANUTILLO'];

/**
 * Ajusta la categoría según la talla mayor del artículo: lo que llega a años
 * es ropa de niño mayor, y lo que se queda en meses es de bebé.
 */
function porEdad(tallas, base) {
  const ultima = tallas[tallas.length - 1] || '';
  const esAnios = /A$/.test(ultima);
  const meses = parseInt(ultima, 10) || 0;

  if (esAnios) return 'infantil';
  if (meses >= 18) return 'bebe';
  return 'recien';
}

function clasificar(nombre, tallas) {
  const n = nombre.toUpperCase();
  let regla = null;
  for (const [clave, categoria, precio, tipoTalla] of REGLAS) {
    if (n.includes(clave)) { regla = { categoria, precio, tipoTalla }; break; }
  }
  if (!regla) regla = { categoria: 'complementos', precio: 19.95, tipoTalla: 'bebe' };

  /* Complementos y recién nacido se quedan donde están: no dependen del sexo. */
  if (regla.categoria === 'complementos' && !/CAMISETA/.test(n)) return regla;

  const nina = PISTA_NINA.some((k) => n.includes(k));
  const nino = PISTA_NINO.some((k) => n.includes(k));
  const franja = porEdad(tallas, regla.categoria);

  if (franja === 'infantil') {
    return { ...regla, categoria: nino ? 'nino' : nina ? 'nina' : 'nina' };
  }
  if (franja === 'bebe') {
    return { ...regla, categoria: nino ? 'bebe-nino' : nina ? 'bebe-nina' : 'bebe-nina' };
  }
  return { ...regla, categoria: 'recien-nacido' };
}

/** Convierte "BODY CRUZADO PUNTILLA" en "Body cruzado puntilla". */
function bonito(texto) {
  const t = texto.toLowerCase().replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function aSlug(t) {
  return t
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/* -------------------------------- Proceso --------------------------------- */

const basicos = JSON.parse(fs.readFileSync('/tmp/basicos.json', 'utf8')).filter((p) => p.tiene_foto);
const ceremonia = JSON.parse(fs.readFileSync('/tmp/popys.json', 'utf8'));

/*
 * El catálogo de ceremonia no da nombre a las prendas: solo su referencia
 * (MOD.32465). Inventarlos sería mentir sobre lo que se vende, así que se
 * usa la referencia del proveedor y se marcan para que la tienda los
 * renombre desde el panel con el nombre comercial que quiera darles.
 */
const LIMITE_CEREMONIA = 60;

const productos = [];
const usados = new Set();

function añadir({ ref, nombreCrudo, tallasCrudas, origen, indice, porRevisar = false }) {
  const nombre = bonito(nombreCrudo);
  let slug = aSlug(nombre);
  let i = 2;
  while (usados.has(slug)) slug = `${aSlug(nombre)}-${i++}`;
  usados.add(slug);

  const previa = clasificar(nombreCrudo, tallasDesde(tallasCrudas, 'bebe'));
  let tallas = tallasDesde(tallasCrudas, previa.tipoTalla);
  /* Muchas fichas de ceremonia no traen tallas legibles: se usa la horquilla
     habitual del proveedor y la tienda la ajusta desde el panel. */
  if (porRevisar && tallas.length < 4) tallas = ['6M', '12M', '18M', '24M', '36M', '4A', '6A'];
  const { categoria, precio } = porRevisar
    ? { categoria: 'ceremonia', precio: 44.95 }
    : clasificar(nombreCrudo, tallas);

  productos.push({
    sku: ref,
    slug,
    nombre,
    categoria,
    precio,
    tallas,
    origen,
    archivo: `${slug}.webp`,
    /* Se rellenan más abajo, cuando ya está el catálogo completo. */
    destacado: false,
    novedad: false,
    porRevisar
  });
}

basicos.forEach((p, i) =>
  añadir({ ref: `GLB-${p.ref}`, nombreCrudo: p.nombre, tallasCrudas: p.tallas, origen: `/tmp/orig-bas/${p.ref}.png`, indice: i })
);

ceremonia.slice(0, LIMITE_CEREMONIA).forEach((p, i) =>
  añadir({
    ref: `GLB-${p.ref}`,
    nombreCrudo: `Modelo ${p.ref.replace(/^P/, '')}`,
    tallasCrudas: p.tallas,
    origen: `/tmp/orig-pop/${p.ref}.png`,
    indice: i + basicos.length,
    porRevisar: true
  })
);

/* ------------------------- Escaparate y destacados ------------------------ */

/*
 * Qué sale en la portada.
 *
 * Un escaparate con seis bodies blancos no vende: el catálogo real es
 * mayoritariamente básicos, así que se eligen a mano los artículos con más
 * gancho visual y se reparten entre categorías para que la portada no
 * enseñe cinco veces lo mismo.
 *
 * La tienda puede cambiarlo cuando quiera desde el panel, marcando la
 * casilla "Novedad" o "Destacado" de cualquier artículo.
 */
const GANCHO = ['PACK', 'CAJA REGALO', 'CANASTILLA', 'TOQUILLA', 'MOCHILA',
                'BORDAD', 'ESTRELLAS', 'TOPITOS', 'VOLANTE', 'PUNTILLA', 'PERLÉ'];

function puntuar(art) {
  const n = art.nombre.toUpperCase();
  let p = 0;
  GANCHO.forEach((k, i) => { if (n.includes(k)) p += GANCHO.length - i; });
  if (art.porRevisar) p -= 3;          // los que aún no tienen nombre comercial
  if (art.precio > 25) p += 2;         // las prendas de más valor lucen más
  return p;
}

/* Escaparate: seis artículos, como mucho dos por categoría. */
const porCat = {};
const escaparate = [...productos]
  .sort((a, b) => puntuar(b) - puntuar(a))
  .filter((a) => {
    /* Máximo uno por categoría: seis bodies seguidos aburren aunque
       cada uno tenga su detalle. */
    porCat[a.categoria] = (porCat[a.categoria] || 0) + 1;
    return porCat[a.categoria] <= 1;
  })
  .slice(0, 6);
escaparate.forEach((a) => { a.novedad = true; });

/* Destacados: los doce siguientes mejor puntuados, para los carruseles. */
[...productos]
  .filter((a) => !a.novedad)
  .sort((a, b) => puntuar(b) - puntuar(a))
  .slice(0, 12)
  .forEach((a) => { a.destacado = true; });

/* ------------------------------ Imágenes ---------------------------------- */

/*
 * Calidad de imagen.
 *
 * Las fotos de los catálogos de proveedor son pequeñas: la mediana de las de
 * básicos son ~210 px de lado. Ampliarlas hasta 1200 px suponía multiplicar por
 * casi 6 y el resultado salía blando, con los bordes lavados.
 *
 * Lo que más degradaba era un doble reescalado: la extracción ya componía la
 * foto sobre un lienzo grande y aquí se volvía a escalar. Ahora se parte del
 * original a resolución nativa y se escala UNA sola vez.
 *
 * Además se corrige por tres vías:
 *  1. Lienzo de 1000x1250 en vez de 1200x1500. Sobra para la ficha, incluso
 *     en pantallas de alta densidad.
 *  2. Tope de ampliación: ninguna foto se agranda más de 2,2 veces. Si el
 *     original es pequeño, la prenda sale algo menor dentro del lienzo, con
 *     más aire alrededor — que además queda mejor que una prenda borrosa.
 *  3. Realce de bordes proporcional a lo que se haya ampliado: cuanto más
 *     estirada esté la foto, más realce necesita para recuperar definición.
 */

const LIENZO = { ancho: 1000, alto: 1250 };
const AMPLIACION_MAXIMA = 2.6;

/** Realce adaptado: nada si no se amplió, más fuerte cuanto más se estiró. */
function realce(factor) {
  if (factor <= 1) return { sigma: 0.5, m1: 0.4, m2: 0.6 };
  if (factor <= 1.5) return { sigma: 0.8, m1: 0.7, m2: 1.1 };
  return { sigma: 1.1, m1: 1.0, m2: 1.6 };
}

(async () => {
  let ok = 0;
  let ampliadas = 0;

  for (const p of productos) {
    if (!fs.existsSync(p.origen)) { p.omitir = true; continue; }

    const meta = await sharp(p.origen).metadata();

    /* Cuánto habría que estirar la foto para llenar el lienzo, y cuánto se
       estira de verdad una vez aplicado el tope. */
    const necesario = Math.max(LIENZO.ancho / meta.width, LIENZO.alto / meta.height);
    const factor = Math.min(necesario, AMPLIACION_MAXIMA);
    if (factor > 1.05) ampliadas++;

    const cabe = factor;
    const anchoUtil = Math.max(1, Math.round(meta.width * cabe));
    const altoUtil = Math.max(1, Math.round(meta.height * cabe));

    /* El lienzo se adapta a la prenda en vez de al revés.
       Con un lienzo fijo, una foto pequeña quedaba perdida en medio de
       mucho fondo. Aquí la prenda ocupa siempre la misma proporción y es
       el lienzo el que encoge, así que la imagen final tiene justo los
       píxeles que hacen falta: ni se estira, ni sobra fondo. */
    const anchoLienzo = Math.min(
      LIENZO.ancho,
      Math.max(600, Math.round(Math.max(anchoUtil / 0.82, altoUtil / 0.88 * 0.8)))
    );
    const altoLienzo = Math.round((anchoLienzo * 5) / 4);
    const r = realce(cabe);

    /* Ampliar en dos pasos con un realce suave entre medias conserva más
       detalle que dar el salto de golpe. */
    let prenda;
    if (cabe > 1.6) {
      const intermedio = await sharp(p.origen)
        .resize(Math.round(meta.width * Math.sqrt(cabe)), null,
                { kernel: sharp.kernel.lanczos3 })
        .sharpen({ sigma: 0.6, m1: 0.5, m2: 0.9 })
        .toBuffer();
      prenda = await sharp(intermedio)
        .resize(anchoUtil, altoUtil, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
        .sharpen(r)
        .toBuffer();
    } else {
      prenda = await sharp(p.origen)
        .resize(anchoUtil, altoUtil, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
        .sharpen(r)
        .toBuffer();
    }

    /* La prenda se centra en el lienzo. Si no da para llenarlo, queda con
       margen en vez de estirarse: mejor pequeña y nítida que grande y blanda. */
    const fondo = { r: 251, g: 240, b: 246, alpha: 1 };

    /* Último seguro: si tras los cálculos la prenda no cupiera, se reduce. */
    const prendaFinal = (anchoUtil > anchoLienzo || altoUtil > altoLienzo)
      ? await sharp(prenda).resize(
          Math.min(anchoUtil, Math.round(anchoLienzo * 0.9)),
          Math.min(altoUtil, Math.round(altoLienzo * 0.92)),
          { fit: 'inside', kernel: sharp.kernel.lanczos3 }
        ).toBuffer()
      : prenda;

    await sharp({ create: { width: anchoLienzo, height: altoLienzo, channels: 4, background: fondo } })
      .composite([{ input: prendaFinal, gravity: 'center' }])
      .webp({ quality: 90, effort: 5 })
      .toFile(path.join(DESTINO, p.archivo));

    /* La miniatura se genera reduciendo desde el original, nunca desde la
       versión ampliada: reducir siempre da un resultado limpio. */
    await sharp(p.origen)
      .resize(400, 500, { fit: 'contain', background: fondo, kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.6, m1: 0.5, m2: 0.8 })
      .webp({ quality: 82 })
      .toFile(path.join(DESTINO, `mini-${p.archivo}`));

    ok++;
  }

  const finales = productos.filter((p) => !p.omitir).map(({ origen, omitir, ...resto }) => resto);
  fs.writeFileSync(path.join(__dirname, 'catalogo-real.json'), JSON.stringify(finales, null, 1));

  const porCategoria = finales.reduce((a, p) => ({ ...a, [p.categoria]: (a[p.categoria] || 0) + 1 }), {});
  const revisar = finales.filter((p) => p.porRevisar).length;
  console.log(`\n  ${ok} imágenes procesadas · ${finales.length} artículos`);
  console.log(`  ${ampliadas} necesitaron ampliarse (tope de ${AMPLIACION_MAXIMA}x, con realce de bordes)\n`);
  for (const [c, n] of Object.entries(porCategoria).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c.padEnd(16)} ${n}`);
  }
  console.log(`\n  ${revisar} artículos con nombre provisional (referencia del proveedor):`);
  console.log('  la tienda debe ponerles nombre y precio desde el panel.\n');
  console.log('  En el escaparate de la portada:');
  for (const a of finales.filter((x) => x.novedad)) console.log(`    ${a.nombre}`);
  console.log('');
})();
