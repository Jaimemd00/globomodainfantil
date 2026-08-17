/* Catálogo: filtros combinables que viven en la URL, para poder compartir la vista. */

const estado = {
  categoria: parametro('categoria') || '',
  q: parametro('q') || '',
  talla: parametro('talla') || '',
  max: parametro('max') || '',
  orden: parametro('orden') || '',
  novedad: parametro('novedad') === '1',
  rebaja: parametro('rebaja') === '1',
  destacado: parametro('destacado') === '1',
  pagina: parseInt(parametro('pagina'), 10) || 1
};

let categorias = [];

function consulta() {
  const p = new URLSearchParams();
  if (estado.categoria) p.set('categoria', estado.categoria);
  if (estado.q) p.set('q', estado.q);
  if (estado.talla) p.set('talla', estado.talla);
  if (estado.max) p.set('max', estado.max);
  if (estado.orden) p.set('orden', estado.orden);
  if (estado.novedad) p.set('novedad', '1');
  if (estado.rebaja) p.set('rebaja', '1');
  if (estado.destacado) p.set('destacado', '1');
  if (estado.pagina > 1) p.set('pagina', String(estado.pagina));
  return p;
}

function sincronizarURL() {
  const p = consulta();
  history.replaceState(null, '', p.toString() ? `/tienda?${p}` : '/tienda');
}

function pintarEncabezado() {
  const cat = categorias.find((c) => c.slug === estado.categoria);
  const titulo = document.getElementById('titulo-catalogo');
  const cejilla = document.getElementById('cejilla-catalogo');
  const desc = document.getElementById('descripcion-catalogo');
  const miga = document.getElementById('miga-actual');

  if (estado.q) {
    cejilla.textContent = 'Búsqueda';
    titulo.textContent = `Resultados para «${estado.q}»`;
    desc.textContent = 'Si no encuentras lo que buscas, prueba con el nombre de la prenda.';
    miga.textContent = 'Búsqueda';
  } else if (cat) {
    cejilla.textContent = 'Familia';
    titulo.textContent = cat.nombre;
    desc.textContent = cat.descripcion || '';
    miga.textContent = cat.nombre;
  } else if (estado.rebaja) {
    cejilla.textContent = 'Precio reducido';
    titulo.textContent = 'Rebajas';
    desc.textContent = 'Últimas unidades de temporadas anteriores. No se reponen.';
    miga.textContent = 'Rebajas';
  } else {
    cejilla.textContent = 'Catálogo completo';
    titulo.textContent = 'Todos los artículos';
    miga.textContent = 'Catálogo';
  }
  document.title = `${titulo.textContent} · Globo`;
}

function pintarFiltros() {
  const host = document.getElementById('filtro-categorias');
  host.innerHTML = [
    `<li><button aria-pressed="${!estado.categoria}" data-cat="">Todas</button></li>`,
    ...categorias.map(
      (c) =>
        `<li><button aria-pressed="${estado.categoria === c.slug}" data-cat="${c.slug}">${esc(c.nombre)}<span>${c.total}</span></button></li>`
    )
  ].join('');

  host.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      estado.categoria = b.dataset.cat;
      estado.pagina = 1;
      cargar();
    })
  );

  document.querySelectorAll('[data-marca]').forEach((b) => {
    b.setAttribute('aria-pressed', String(estado[b.dataset.marca]));
    b.onclick = () => {
      estado[b.dataset.marca] = !estado[b.dataset.marca];
      estado.pagina = 1;
      cargar();
    };
  });
}

async function pintarTallas() {
  const { tallas } = await API.get('/tallas');
  const host = document.getElementById('filtro-tallas');
  host.innerHTML = tallas
    .map((t) => `<button class="pastilla" data-talla="${esc(t)}" aria-pressed="${estado.talla === t}">${esc(t)}</button>`)
    .join('');
  host.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      estado.talla = estado.talla === b.dataset.talla ? '' : b.dataset.talla;
      estado.pagina = 1;
      cargar();
    })
  );
}

function pintarPaginacion(paginas, actual) {
  const host = document.getElementById('paginacion');
  if (paginas <= 1) {
    host.innerHTML = '';
    return;
  }
  const botones = [];
  for (let i = 1; i <= paginas; i++) {
    botones.push(`<button data-pagina="${i}" aria-current="${i === actual}">${i}</button>`);
  }
  host.innerHTML = botones.join('');
  host.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      estado.pagina = Number(b.dataset.pagina);
      cargar();
      window.scrollTo({ top: 240, behavior: 'smooth' });
    })
  );
}

async function cargar() {
  sincronizarURL();
  pintarEncabezado();
  pintarFiltros();

  const rejilla = document.getElementById('rejilla');
  rejilla.innerHTML = '<p class="cargando">Cargando catálogo…</p>';

  try {
    const p = consulta();
    p.set('porPagina', '12');
    const datos = await API.get(`/productos?${p}`);

    document.getElementById('conteo').textContent =
      datos.total === 0 ? 'Sin resultados' : `${datos.total} ${datos.total === 1 ? 'artículo' : 'artículos'}`;

    rejilla.innerHTML = datos.productos.length
      ? datos.productos.map(fichaProducto).join('')
      : `<div class="vacio" style="grid-column:1/-1">
           <h3>Aquí no hay nada todavía</h3>
           <p>Prueba a quitar algún filtro o a buscar por el nombre de la prenda.</p>
         </div>`;

    pintarPaginacion(datos.paginas, datos.pagina);
  } catch (e) {
    rejilla.innerHTML = `<p class="cargando">${esc(e.message)}</p>`;
  }
}

/* --------------------------------- Eventos -------------------------------- */

document.getElementById('orden').value = estado.orden;
document.getElementById('orden').addEventListener('change', (e) => {
  estado.orden = e.target.value;
  estado.pagina = 1;
  cargar();
});

const rango = document.getElementById('filtro-precio');
const etiquetaPrecio = document.getElementById('etiqueta-precio');
if (estado.max) rango.value = estado.max;
etiquetaPrecio.textContent = rango.value >= 100 ? 'Sin límite' : `Hasta ${rango.value} €`;
rango.addEventListener('input', () => {
  etiquetaPrecio.textContent = rango.value >= 100 ? 'Sin límite' : `Hasta ${rango.value} €`;
});
rango.addEventListener('change', () => {
  estado.max = rango.value >= 100 ? '' : rango.value;
  estado.pagina = 1;
  cargar();
});

document.getElementById('limpiar').addEventListener('click', () => {
  Object.assign(estado, { categoria: '', q: '', talla: '', max: '', orden: '', novedad: false, rebaja: false, destacado: false, pagina: 1 });
  rango.value = 100;
  etiquetaPrecio.textContent = 'Sin límite';
  document.getElementById('orden').value = '';
  cargar();
});

/* En móvil los filtros ocupan demasiado: se pliegan tras un botón. */
document.getElementById('ver-filtros')?.addEventListener('click', (e) => {
  const panel = document.getElementById('panel-filtros');
  const abierto = panel.classList.toggle('abierto');
  e.target.setAttribute('aria-expanded', String(abierto));
  e.target.textContent = abierto ? 'Ocultar filtros' : 'Filtrar y ordenar';
});

(async function iniciar() {
  categorias = (await API.get('/categorias')).categorias;
  await pintarTallas();
  cargar();
})();
