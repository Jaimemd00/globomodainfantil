/* Portada: familias por edad, tres carruseles y datos de la tienda física. */

const GARANTIAS = [
  ['camion', 'Envío en 24-48 h', 'Gratis desde 49 €'],
  ['tienda', 'Recogida gratis', 'En la tienda de Écija'],
  ['cambio', 'Cambios en 30 días', 'También en el mostrador'],
  ['telefono', 'Te atendemos', '626 34 70 20']
];

const DATOS_TIENDA = [
  ['ubicacion', 'Plaza Giles y Rubio', 'Écija (Sevilla), 41400'],
  ['reloj', 'Lunes a sábado', '10:00-14:00 y 17:30-20:30'],
  ['telefono', '626 34 70 20', 'También por WhatsApp']
];

function pintarGarantias() {
  GARANTIAS.forEach(([icono, titulo, texto], i) => {
    const nodo = document.getElementById(`g${i + 1}`);
    if (nodo) nodo.innerHTML = `${ICONOS[icono]}<strong>${titulo}</strong><span>${texto}</span>`;
  });

  const host = document.getElementById('datos-tienda');
  if (host) {
    host.innerHTML = DATOS_TIENDA.map(
      ([icono, titulo, texto]) => `
      <div class="tienda-fisica__dato">
        ${ICONOS[icono]}
        <div><strong>${titulo}</strong><span style="color:var(--tinta-45);font-size:.92rem">${texto}</span></div>
      </div>`
    ).join('');
  }
}

/* Tintes suaves que se superponen a cada portada de familia, para que la
   banda tenga ritmo aunque todas las fotos vengan del mismo fondo claro. */
const TINTES = ['#FCE0EA', '#CDF0E6', '#E6DCF0', '#FBEECD', '#FCE0EA', '#CDF0E6', '#E6DCF0'];

/* =======================================================================
   SIN REPETIDOS EN LA PORTADA
   Un mismo artículo sale UNA sola vez en toda la portada. Las secciones se
   reparten los artículos en el orden en que aparecen en la página:
     escaparate → portadas de familia → Novedades → Favoritas → Ceremonia
   Si un artículo ya salió más arriba, la sección siguiente lo salta y coge
   el siguiente. Todas las consultas salen a la vez al cargar (la portada no
   tarda más); solo el reparto se hace en orden.
   ======================================================================= */
const mostrados = new Set();

/** Hasta `max` artículos de la lista que no hayan salido ya; los marca como vistos. */
function tomarUnicos(lista, max) {
  const elegidos = [];
  for (const p of lista) {
    if (elegidos.length >= max) break;
    if (mostrados.has(p.id)) continue;
    mostrados.add(p.id);
    elegidos.push(p);
  }
  return elegidos;
}

/* Lanza una consulta ya y deja la promesa lista para usarla más tarde (el
   catch vacío solo evita el aviso del navegador; el error se trata donde se usa). */
function pedir(consulta) {
  const promesa = API.get(consulta).then((r) => r.productos || []);
  promesa.catch(() => {});
  return promesa;
}

const PEDIDOS = {
  novedades: pedir('/productos?novedad=1&porPagina=24&orden=novedades'),
  destacados: pedir('/productos?destacado=1&porPagina=24'),
  ceremonia: pedir('/productos?categoria=ceremonia&porPagina=24')
};

/**
 * Escaparate del hero.
 *
 * Muestra una foto grande que va rotando. Lo que sale lo controla la tienda
 * desde el panel: aparecen los artículos marcados como NOVEDAD, y si no hay
 * ninguno, los destacados. Así se cambia el escaparate sin tocar código.
 */
async function pintarEscaparate() {
  const host = document.getElementById('escaparate');
  if (!host) return;
  host.innerHTML = '<p class="escaparate__aviso">Cargando…</p>';

  try {
    let productos = tomarUnicos(await PEDIDOS.novedades, 6);
    if (productos.length < 2) {
      productos.forEach((p) => mostrados.delete(p.id)); // se devuelven: no salen aquí
      productos = tomarUnicos(await PEDIDOS.destacados, 6);
    }
    if (!productos.length) {
      /* Sin artículos no hay nada que enseñar, pero se dice en pantalla: si el
         hueco se oculta sin más, parece que la web está rota y no hay forma de
         saber que lo que falta es cargar el catálogo. */
      host.innerHTML = `<p class="escaparate__aviso">
        No hay artículos publicados todavía.<br>Carga el catálogo con <strong>npm run seed</strong>.</p>`;
      return;
    }

    host.innerHTML = `
      <span class="escaparate__marca">Novedad</span>
      ${productos
        .map(
          (p, i) => `
        <a class="escaparate__foto ${i === 0 ? 'activa' : ''}" href="/producto?slug=${encodeURIComponent(p.slug)}"
           ${i === 0 ? '' : 'aria-hidden="true" tabindex="-1"'}>
          <img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" ${i === 0 ? '' : 'loading="lazy"'} width="600" height="750">
          <span class="escaparate__pie">
            <span class="escaparate__nombre">${esc(p.nombre)}</span>
            <span class="escaparate__precio">${eur(p.precio)}</span>
          </span>
        </a>`
        )
        .join('')}
      <div class="escaparate__puntos" role="tablist" aria-label="Artículos en el escaparate">
        ${productos
          .map((p, i) => `<button class="escaparate__punto" role="tab" data-i="${i}"
             aria-current="${i === 0}" aria-label="Ver ${esc(p.nombre)}"></button>`)
          .join('')}
      </div>`;

    const fotos = [...host.querySelectorAll('.escaparate__foto')];
    const puntos = [...host.querySelectorAll('.escaparate__punto')];
    let actual = 0;

    const mostrar = (i) => {
      actual = (i + fotos.length) % fotos.length;
      fotos.forEach((f, n) => {
        const activa = n === actual;
        f.classList.toggle('activa', activa);
        f.toggleAttribute('aria-hidden', !activa);
        f.tabIndex = activa ? 0 : -1;
      });
      puntos.forEach((b, n) => b.setAttribute('aria-current', String(n === actual)));
    };

    puntos.forEach((b) => b.addEventListener('click', () => { mostrar(Number(b.dataset.i)); reiniciar(); }));

    /* Quien prefiere menos movimiento no ve la rotación automática.
       Se consulta de forma defensiva: no todos los entornos traen matchMedia,
       y una excepción aquí dejaba la portada sin escaparate. */
    const quieto = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    let reloj = null;
    const arrancar = () => { if (!quieto && fotos.length > 1) reloj = setInterval(() => mostrar(actual + 1), 5000); };
    const parar = () => { if (reloj) clearInterval(reloj); reloj = null; };
    const reiniciar = () => { parar(); arrancar(); };

    host.addEventListener('mouseenter', parar);
    host.addEventListener('mouseleave', arrancar);
    host.addEventListener('focusin', parar);
    host.addEventListener('focusout', arrancar);
    arrancar();
  } catch (error) {
    /* Si algo falla se dice en pantalla y en la consola. Ocultarlo dejaba un
       hueco mudo imposible de diagnosticar desde fuera. */
    console.error('No se ha podido montar el escaparate:', error);
    host.innerHTML = `<p class="escaparate__aviso">
      No se ha podido cargar el escaparate.<br>
      <small>${esc(error.message)}</small><br>
      <small>Abre <strong>/revision.html</strong> para ver qué falla.</small></p>`;
  }
}

async function pintarFamilias() {
  const host = document.getElementById('familias');
  try {
    const { categorias } = await API.get('/categorias');
    const visibles = categorias.filter((c) => c.total > 0);

    /* Una portada por familia: un artículo destacado de esa familia que no
       haya salido ya en la portada; si no queda ninguno, cualquiera de la
       familia sin repetir. Solo si la familia no tiene ninguno libre se
       repite foto, para no dejar la tarjeta en blanco. */
    const candidatos = await Promise.all(
      visibles.map((c) =>
        Promise.all([
          pedir(`/productos?categoria=${c.slug}&porPagina=12&destacado=1`),
          pedir(`/productos?categoria=${c.slug}&porPagina=12`)
        ]).then(([dest, todos]) => [...dest, ...todos])
      )
    );
    const portadas = candidatos.map((lista) => {
      const [libre] = tomarUnicos(lista, 1);
      return (libre || lista[0])?.imagen || '/img/productos/generico.svg';
    });

    host.innerHTML = visibles
      .map(
        (c, i) => `
      <a class="familia-ancha" href="/tienda?categoria=${c.slug}">
        <div class="familia-ancha__medio">
          <img src="${portadas[i]}" alt="${esc(c.nombre)}" loading="lazy" width="600" height="750">
          <span class="familia-ancha__tinte" style="background:${TINTES[i % TINTES.length]}"></span>
          <span class="familia-ancha__conteo">${c.total} ${c.total === 1 ? 'artículo' : 'artículos'}</span>
        </div>
        <div class="familia-ancha__pie">
          <div>
            <div class="familia-ancha__nombre">${esc(c.nombre)}</div>
            <div class="familia-ancha__edad">${esc(c.edad || '')}</div>
          </div>
          <span class="familia-ancha__ir" aria-hidden="true">→</span>
        </div>
      </a>`
      )
      .join('');
  } catch (e) {
    host.innerHTML = `<p class="cargando">${esc(e.message)}</p>`;
  }
}

/* Pinta un carrusel con los artículos que aún no han salido en la portada.
   Si se queda sin ninguno (todos estaban ya más arriba), la sección entera
   se oculta en vez de enseñar un carrusel vacío o repetido. */
async function cargarCarrusel(hostId, id, pedido, vacio) {
  const host = document.getElementById(hostId);
  if (!host) return;
  try {
    const productos = tomarUnicos(await pedido, 10);
    const seccion = host.closest('section');
    if (!productos.length && seccion) {
      seccion.style.display = 'none';
      return;
    }
    pintarCarrusel(id, productos, vacio);
  } catch (e) {
    pintarCarrusel(id, [], e.message);
  }
}

/* Hero de campaña (Halloween / Black Friday / normal). La imagen y los textos
   vienen de comun.js, así que para cambiar una promo solo se toca aquel sitio. */
function pintarPromoHero() {
  const host = document.getElementById('promo-hero');
  if (!host || typeof heroActivo !== 'function') return;
  const h = heroActivo();
  host.classList.add(`promo-hero--${h.id}`);
  host.style.backgroundImage = `url('${h.imagen}')`;
  host.innerHTML = `
    <span class="promo-hero__chispa promo-hero__chispa--1" aria-hidden="true"></span>
    <span class="promo-hero__chispa promo-hero__chispa--2" aria-hidden="true"></span>
    <span class="promo-hero__chispa promo-hero__chispa--3" aria-hidden="true"></span>
    <div class="contenedor">
      <div class="promo-hero__texto">
        ${h.badge ? `<span class="promo-hero__sticker">${esc(h.badge)}</span>` : ''}
        ${h.cejilla ? `<p class="promo-hero__cejilla">${esc(h.cejilla)}</p>` : ''}
        <h2 class="promo-hero__titulo">${esc(h.titulo)}</h2>
        <p class="promo-hero__entrada">${esc(h.texto)}</p>
        <a class="btn btn--acento btn--grande" href="${esc(h.href)}">${esc(h.cta)} <span aria-hidden="true">→</span></a>
      </div>
    </div>`;
}

pintarPromoHero();
pintarGarantias();

const CARRUSELES = [
  ['carrusel-novedades', 'novedades', PEDIDOS.novedades, 'Pronto habrá novedades.'],
  ['carrusel-destacados', 'destacados', PEDIDOS.destacados, 'Aún no hay favoritas.'],
  ['carrusel-ceremonia', 'ceremonia', PEDIDOS.ceremonia, 'Pregunta en la tienda por ceremonia.']
];

/* Los esqueletos de carga salen ya; el reparto de artículos va en el orden
   de la página para que nada se repita (las consultas ya están en marcha). */
CARRUSELES.forEach(([hostId, id]) => {
  const host = document.getElementById(hostId);
  if (host) host.innerHTML = armazonCarrusel(id);
});

(async () => {
  await pintarEscaparate();
  await pintarFamilias();
  for (const args of CARRUSELES) await cargarCarrusel(...args);
})();
