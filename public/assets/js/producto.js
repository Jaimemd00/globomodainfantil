/* Ficha de producto: selección de talla contra stock real y alta en el carrito. */

let producto = null;
let tallaElegida = null;
let cantidad = 1;
let imagenes = [];


function pintar() {
  const rebaja = producto.precio_antes && producto.precio_antes > producto.precio;
  const agotado = producto.stock_total === 0;

  document.getElementById('ficha').innerHTML = `
    <p class="migas">
      <a href="/">Inicio</a> / <a href="/tienda">Catálogo</a> /
      <a href="/tienda?categoria=${producto.categoria_slug}">${esc(producto.categoria_nombre)}</a> /
      ${esc(producto.nombre)}
    </p>

    <div class="producto">
      <div class="producto__galeria">
        <div class="producto__medio">
          <img src="${esc(imagenes[0].ruta)}" alt="${esc(producto.nombre)}" width="600" height="750" id="foto-principal">
        </div>
        ${imagenes.length > 1
          ? `<div class="producto__tiras" id="tiras">
              ${imagenes
                .map(
                  (im, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}"
                                  aria-label="Ver foto ${i + 1}">
                                <img src="${esc(im.miniatura || im.ruta)}" alt="" loading="lazy">
                              </button>`
                )
                .join('')}
            </div>`
          : ''}
      </div>

      <div>
        <p class="cejilla">${esc(producto.categoria_nombre)} · <span class="mono">${esc(producto.sku)}</span></p>
        <h1 style="font-size:clamp(1.9rem,4vw,2.8rem)">${esc(producto.nombre)}</h1>

        <p class="producto__precio">
          <span style="${rebaja ? 'color:var(--tinta)' : ''}">${eur(producto.precio)}</span>
          ${rebaja ? `<del>${eur(producto.precio_antes)}</del>` : ''}
        </p>

        <p style="color:var(--tinta-70)">${esc(producto.descripcion)}</p>

        <div class="paso"><span class="paso__num">1</span><span class="paso__texto">Elige la talla</span></div>
        <div class="selector-talla" id="tallas" role="group" aria-label="Tallas disponibles"></div>
        <p id="aviso-talla" style="font-size:.9rem;color:var(--tinta-45);margin:0 0 .4rem">
          Solo mostramos las tallas que tenemos ahora mismo.
          <a href="/ayuda#tallas">Ver guía de tallas</a>
        </p>

        <div class="paso"><span class="paso__num">2</span><span class="paso__texto">¿Cuántas quieres?</span></div>
        <div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin-bottom:1.4rem">
          <div class="cantidad">
            <button type="button" id="menos" aria-label="Quitar una unidad">−</button>
            <span id="cantidad">1</span>
            <button type="button" id="mas" aria-label="Añadir una unidad">+</button>
          </div>
          <button class="btn btn--acento" id="anadir" style="flex:1;min-width:230px" ${agotado ? 'disabled' : ''}>
            ${agotado ? 'Sin stock ahora mismo' : 'Añadir a la cesta'}
          </button>
        </div>

        <div class="panel panel--menta" style="padding:1.1rem 1.2rem">
          <p style="margin:0;font-size:.95rem">
            <strong>¿Lo recoges en la tienda?</strong> Marca la recogida al finalizar y no pagas envío.
            Te avisamos al teléfono cuando esté listo en Plaza Giles y Rubio.
          </p>
        </div>

        <div class="acordeon">
          <details open>
            <summary>Composición y cuidados</summary>
            <p>${esc(producto.composicion || 'Consulta la etiqueta interior de la prenda.')}<br>
               Lavar a 30 °C del revés. No usar lejía. Secado a la sombra.</p>
          </details>
          <details>
            <summary>Cómo va de talla</summary>
            <p>Corte regular. Las tallas de bebé se indican en meses y las infantiles en años.
               Si el peque está entre dos tallas, recomendamos subir a la mayor: encoge algo menos de un 3 % en el primer lavado.</p>
          </details>
          <details>
            <summary>Envío y devoluciones</summary>
            <p>Preparamos los pedidos en el almacén de Málaga en 24 h laborables.
               Tienes 30 días para cambiar la talla o devolver la prenda sin estrenar, con la recogida a nuestro cargo.</p>
          </details>
        </div>
      </div>
    </div>`;

  pintarTallas();
  activarGaleria();

  document.getElementById('menos').onclick = () => cambiarCantidad(-1);
  document.getElementById('mas').onclick = () => cambiarCantidad(1);
  document.getElementById('anadir').onclick = anadir;

  pintarBarraCompra(agotado);
}

function pintarTallas() {
  const host = document.getElementById('tallas');
  host.innerHTML = producto.variantes
    .map(
      (v) => `<button class="talla" data-talla="${esc(v.talla)}" ${v.stock === 0 ? 'disabled' : ''}
                 aria-pressed="${tallaElegida === v.talla}"
                 title="${v.stock === 0 ? 'Agotada' : `${v.stock} uds. disponibles`}">${esc(v.talla)}</button>`
    )
    .join('');

  host.querySelectorAll('button:not([disabled])').forEach((b) =>
    b.addEventListener('click', () => {
      tallaElegida = b.dataset.talla;
      cantidad = 1;
      document.getElementById('cantidad').textContent = '1';
      pintarTallas();
    })
  );
}

function cambiarCantidad(delta) {
  const variante = producto.variantes.find((v) => v.talla === tallaElegida);
  const tope = variante ? Math.min(20, variante.stock) : 20;
  cantidad = Math.max(1, Math.min(tope, cantidad + delta));
  document.getElementById('cantidad').textContent = cantidad;
}

/** Cambia la foto grande y actualiza el aviso de IA si esa imagen lo lleva. */
function activarGaleria() {
  const tiras = document.getElementById('tiras');
  if (!tiras) return;
  const principal = document.getElementById('foto-principal');

  tiras.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      const im = imagenes[Number(b.dataset.i)];
      principal.src = im.ruta;
      tiras.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    })
  );
}

/* En móvil el botón de compra queda siempre a la vista, sin tener que subir. */
function pintarBarraCompra(agotado) {
  if (agotado) return;
  const barra = document.createElement('div');
  barra.className = 'barra-compra';
  barra.innerHTML = `
    <span class="barra-compra__precio">${eur(producto.precio)}</span>
    <button class="btn btn--acento" id="anadir-movil">Añadir a la cesta</button>`;
  document.body.appendChild(barra);
  document.body.classList.add('con-barra');
  document.getElementById('anadir-movil').onclick = anadir;
}

function anadir() {
  if (!tallaElegida) {
    avisar('Elige primero una talla.', 'error');
    const tallas = document.getElementById('tallas');
    tallas.querySelector('button:not([disabled])')?.focus();
    tallas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  Carrito.anadir(producto, tallaElegida, cantidad);
  avisar(`Añadido: ${producto.nombre}, talla ${tallaElegida}.`, 'ok', { href: '/carrito', texto: 'Ver mi cesta →' });
}

(async function cargar() {
  const slug = parametro('slug');
  if (!slug) {
    location.href = '/tienda';
    return;
  }
  try {
    const datos = await API.get(`/productos/${encodeURIComponent(slug)}`);
    producto = datos.producto;

    /* La galería es la lista de imágenes del artículo. Si todavía no tiene
       ninguna subida, se usa su foto de portada para no quedarse sin nada
       que enseñar. Sin esta línea, pintar() leía imagenes[0] de un array
       vacío y la ficha entera fallaba. */
    imagenes = producto.imagenes && producto.imagenes.length
      ? producto.imagenes
      : [{ ruta: producto.imagen, miniatura: producto.imagen, alt: producto.nombre }];

    document.title = `${producto.nombre} · Globo`;
    pintar();

    if (datos.relacionados.length) {
      const host = document.getElementById('relacionados');
      host.innerHTML = armazonCarrusel('rel');
      pintarCarrusel('rel', datos.relacionados);
      document.getElementById('bloque-relacionados').hidden = false;
    }
  } catch (e) {
    document.getElementById('ficha').innerHTML = `
      <div class="vacio">
        <h3>No encontramos ese artículo</h3>
        <p>${esc(e.message)}</p>
        <a class="btn" href="/tienda">Volver al catálogo</a>
      </div>`;
  }
})();
