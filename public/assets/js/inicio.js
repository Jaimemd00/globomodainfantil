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
    let { productos } = await API.get('/productos?novedad=1&porPagina=6&orden=novedades');
    if (productos.length < 2) ({ productos } = await API.get('/productos?destacado=1&porPagina=6'));
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

    /* Una portada por familia: el primer artículo destacado, o el primero que haya. */
    const portadas = await Promise.all(
      visibles.map(async (c) => {
        const { productos } = await API.get(`/productos?categoria=${c.slug}&porPagina=1&destacado=1`);
        if (productos.length) return productos[0].imagen;
        const alt = await API.get(`/productos?categoria=${c.slug}&porPagina=1`);
        return alt.productos[0]?.imagen || '/img/productos/generico.svg';
      })
    );

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

async function cargarCarrusel(hostId, id, consulta, vacio) {
  const host = document.getElementById(hostId);
  host.innerHTML = armazonCarrusel(id);
  try {
    const { productos } = await API.get(consulta);
    pintarCarrusel(id, productos, vacio);
  } catch (e) {
    pintarCarrusel(id, [], e.message);
  }
}

pintarGarantias();
pintarEscaparate();
pintarFamilias();
cargarCarrusel('carrusel-novedades', 'novedades', '/productos?novedad=1&porPagina=10&orden=novedades', 'Pronto habrá novedades.');
cargarCarrusel('carrusel-destacados', 'destacados', '/productos?destacado=1&porPagina=10', 'Aún no hay favoritas.');
cargarCarrusel('carrusel-ceremonia', 'ceremonia', '/productos?categoria=ceremonia&porPagina=10', 'Pregunta en la tienda por ceremonia.');
