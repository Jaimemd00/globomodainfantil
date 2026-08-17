/* =========================================================================
   GLOBO — núcleo compartido del front
   Cliente de API, sesión, carrito, cabecera, pie, carrusel y avisos.
   ========================================================================= */

/* --------------------------------- API ----------------------------------- */

const API = {
  get token() {
    return localStorage.getItem('globo_token');
  },
  set token(valor) {
    if (valor) localStorage.setItem('globo_token', valor);
    else localStorage.removeItem('globo_token');
  },

  async peticion(ruta, opciones = {}) {
    const cabeceras = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
    if (this.token) cabeceras.Authorization = `Bearer ${this.token}`;

    const respuesta = await fetch(`/api${ruta}`, { ...opciones, headers: cabeceras });
    let datos = {};
    try {
      datos = await respuesta.json();
    } catch (_) {
      /* respuesta sin cuerpo */
    }
    if (!respuesta.ok) {
      if (respuesta.status === 401 && this.token) Sesion.cerrar(false);
      throw new Error(datos.error || 'No hemos podido completar la operación.');
    }
    return datos;
  },

  get: (ruta) => API.peticion(ruta),
  post: (ruta, cuerpo) => API.peticion(ruta, { method: 'POST', body: JSON.stringify(cuerpo) }),
  put: (ruta, cuerpo) => API.peticion(ruta, { method: 'PUT', body: JSON.stringify(cuerpo) }),
  del: (ruta) => API.peticion(ruta, { method: 'DELETE' })
};

/* -------------------------------- Sesión --------------------------------- */

const Sesion = {
  get usuario() {
    try {
      return JSON.parse(localStorage.getItem('globo_usuario') || 'null');
    } catch (_) {
      return null;
    }
  },
  set usuario(u) {
    if (u) localStorage.setItem('globo_usuario', JSON.stringify(u));
    else localStorage.removeItem('globo_usuario');
  },
  guardar({ token, usuario }) {
    API.token = token;
    this.usuario = usuario;
    pintarCabecera();
  },
  cerrar(redirigir = true) {
    API.token = null;
    this.usuario = null;
    if (redirigir) location.href = '/';
    else pintarCabecera();
  }
};

/* -------------------------------- Carrito -------------------------------- */

const Carrito = {
  leer() {
    try {
      return JSON.parse(localStorage.getItem('globo_carrito') || '[]');
    } catch (_) {
      return [];
    }
  },
  guardar(items) {
    localStorage.setItem('globo_carrito', JSON.stringify(items));
    actualizarContador();
  },
  anadir(producto, talla, cantidad = 1) {
    const items = this.leer();
    const clave = `${producto.id}|${talla}`;
    const existente = items.find((i) => `${i.producto_id}|${i.talla}` === clave);
    if (existente) existente.cantidad += cantidad;
    else
      items.push({
        producto_id: producto.id,
        slug: producto.slug,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagen,
        talla,
        cantidad
      });
    this.guardar(items);
  },
  cambiarCantidad(indice, cantidad) {
    const items = this.leer();
    if (!items[indice]) return;
    items[indice].cantidad = Math.max(1, Math.min(20, cantidad));
    this.guardar(items);
  },
  quitar(indice) {
    const items = this.leer();
    items.splice(indice, 1);
    this.guardar(items);
  },
  vaciar() {
    this.guardar([]);
  },
  subtotal() {
    return Math.round(this.leer().reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100;
  },
  unidades() {
    return this.leer().reduce((s, i) => s + i.cantidad, 0);
  }
};

/* ------------------------------- Utilidades ------------------------------ */

const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);

const fecha = (texto, conHora = false) => {
  if (!texto) return '—';
  const d = new Date(texto.replace(' ', 'T') + (texto.includes('Z') ? '' : 'Z'));
  const opciones = conHora
    ? { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'long', year: 'numeric' };
  return d.toLocaleDateString('es-ES', opciones);
};

const esc = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const parametro = (nombre) => new URLSearchParams(location.search).get(nombre);

function avisar(mensaje, tipo = '', accion = null) {
  let caja = document.querySelector('.avisos');
  if (!caja) {
    caja = document.createElement('div');
    caja.className = 'avisos';
    caja.setAttribute('role', 'status');
    caja.setAttribute('aria-live', 'polite');
    document.body.appendChild(caja);
  }
  const nodo = document.createElement('div');
  nodo.className = `aviso-flotante ${tipo ? 'aviso-flotante--' + tipo : ''}`;
  nodo.innerHTML = esc(mensaje) + (accion ? ` <a href="${accion.href}">${esc(accion.texto)}</a>` : '');
  caja.appendChild(nodo);
  setTimeout(() => nodo.remove(), 5200);
}

/* ---------------------------------- Iconos -------------------------------- */

const ICONOS = {
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  cuenta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  carrito: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14l-1.2 12.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8L5 7Z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/></svg>',
  ruta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="13" height="10" rx="1.5"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="18" cy="18.5" r="1.8"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  tienda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9h16v11H4z"/><path d="M3 9l1.5-5h15L21 9M9 20v-6h6v6"/></svg>',
  camion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="1" y="6" width="14" height="11" rx="1.5"/><path d="M15 9h4l3 3v5h-7z"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="18.5" r="2"/></svg>',
  cambio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 11a8 8 0 0 1 14-5m1-3v5h-5"/><path d="M21 13a8 8 0 0 1-14 5m-1 3v-5h5"/></svg>',
  telefono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/></svg>',
  ubicacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/></svg>',
  corazon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.3 12 20 12 20Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1Z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.3 14c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a13 13 0 0 1-6.6-5.8c-.5-.9-.8-1.7-.8-2.4 0-.7.4-1.3.8-1.7.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .5.4l.8 1.9c0 .2 0 .3-.1.5l-.4.5c-.1.2-.3.3-.1.6.5.9 1.6 2.1 2.9 2.7.3.2.5.1.6 0l.7-.8c.2-.2.3-.2.5-.1l1.8.9c.2.1.3.2.3.3.1.2.1.6-.1 1.2Z"/></svg>'
};

/* ------------------------------ Marca y menú ------------------------------ */

const SELLO = `<svg class="marca__sello" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="18.6" fill="#fff" stroke="#443E48" stroke-width="2.2"/>
  <ellipse cx="14.6" cy="16" rx="5.4" ry="6.8" fill="#F8C4D8"/>
  <ellipse cx="22.4" cy="12.8" rx="5" ry="6.4" fill="#D6C5E8"/>
  <ellipse cx="26.6" cy="18.6" rx="4.4" ry="5.8" fill="#B0E7D7"/>
  <path d="M14.6 22.8c1 5-2 7-1 10M22.4 19.2c1 6-2 8-1 12M26.6 24.4c1 4-2 6-1 9" stroke="#DCB6CA" stroke-width="1" fill="none"/>
</svg>`;

const MARCA = `
  <a class="marca" href="/">
    ${SELLO}
    <span class="marca__nombre">
      <span class="marca__firma">Globo</span>
      <span class="marca__bajo">Moda infantil</span>
    </span>
  </a>`;

const ENLACES = [
  ['/tienda?categoria=recien-nacido', 'Recién nacido'],
  ['/tienda?categoria=bebe-nina', 'Bebé niña'],
  ['/tienda?categoria=bebe-nino', 'Bebé niño'],
  ['/tienda?categoria=nina', 'Niña'],
  ['/tienda?categoria=nino', 'Niño'],
  ['/tienda?categoria=ceremonia', 'Ceremonia'],
  ['/tienda?rebaja=1', 'Rebajas']
];

function pintarCabecera() {
  const host = document.getElementById('cabecera');
  if (!host) return;

  const u = Sesion.usuario;
  const actual = location.pathname + location.search;

  host.innerHTML = `
    <div class="aviso-superior">
      Envío gratis desde <strong>49 €</strong> · Recoge <strong>gratis</strong> en nuestra tienda de Écija
    </div>
    <div class="cabecera">
      <div class="contenedor cabecera__fila">
        <button class="icono-btn hamburguesa" id="btn-menu" aria-label="Abrir el menú" aria-expanded="false">${ICONOS.menu}</button>
        ${MARCA}
        <nav class="nav" id="nav" aria-label="Categorías">
          ${ENLACES.map(([h, t]) => `<a href="${h}"${actual === h ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
        </nav>
        <form class="buscador" role="search" action="/tienda">
          ${ICONOS.buscar}
          <input type="search" name="q" placeholder="Buscar" aria-label="Buscar en la tienda">
        </form>
        <div class="acciones">
          <a class="icono-btn" href="/seguimiento" title="Seguir mi pedido">${ICONOS.ruta}<span class="solo-lectores">Seguir mi pedido</span></a>
          <a class="icono-btn" href="${u && u.rol === 'admin' ? '/admin' : '/cuenta'}" title="Mi cuenta">${ICONOS.cuenta}<span class="solo-lectores">Mi cuenta</span></a>
          <a class="icono-btn" href="/carrito" title="Mi cesta">${ICONOS.carrito}<span class="contador" id="contador-carrito">0</span></a>
        </div>
      </div>
    </div>`;

  const btn = document.getElementById('btn-menu');
  const nav = document.getElementById('nav');
  btn?.addEventListener('click', () => {
    const abierto = nav.classList.toggle('abierto');
    btn.setAttribute('aria-expanded', String(abierto));
  });

  actualizarContador();
}

function actualizarContador() {
  const nodo = document.getElementById('contador-carrito');
  if (nodo) nodo.textContent = Carrito.unidades();
}

function pintarPie() {
  const host = document.getElementById('pie');
  if (!host) return;
  host.innerHTML = `
    <div class="pie">
      <div class="contenedor pie__rejilla">
        <div>
          ${MARCA}
          <p style="margin-top:1rem;font-size:.95rem;max-width:34ch">
            Moda infantil de 0 a 14 años en el centro de Écija. Lo que ves aquí lo tienes también en la tienda,
            y lo que compras online puedes recogerlo sin pagar envío.
          </p>
          <div class="pie__redes">
            <a href="https://wa.me/34626347020" aria-label="WhatsApp">${ICONOS.whatsapp}</a>
            <a href="https://instagram.com/" aria-label="Instagram">${ICONOS.instagram}</a>
            <a href="https://facebook.com/" aria-label="Facebook">${ICONOS.facebook}</a>
          </div>
        </div>
        <div>
          <h4>Comprar</h4>
          <ul>${ENLACES.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul>
        </div>
        <div>
          <h4>Tu pedido</h4>
          <ul>
            <li><a href="/seguimiento">Seguir mi pedido</a></li>
            <li><a href="/cuenta">Mi cuenta</a></li>
            <li><a href="/carrito">Mi cesta</a></li>
            <li><a href="/ayuda#envios">Envíos y recogida</a></li>
            <li><a href="/ayuda#devoluciones">Cambios y devoluciones</a></li>
          </ul>
        </div>
        <div>
          <h4>La tienda</h4>
          <ul>
            <li><a href="/ayuda#tallas">Guía de tallas</a></li>
            <li><a href="/ayuda#contacto">Dónde estamos</a></li>
            <li><a href="tel:+34626347020">626 34 70 20</a></li>
            <li><a href="/legal#aviso">Aviso legal</a></li>
            <li><a href="/legal#privacidad">Privacidad</a></li>
            <li><a href="/legal#condiciones">Condiciones de compra</a></li>
          </ul>
          <form class="pie__boletin" id="boletin">
            <input type="email" name="email" placeholder="tu@correo.es" aria-label="Tu correo" required>
            <button class="btn btn--claro btn--peq" type="submit">Apuntarme</button>
          </form>
        </div>
      </div>
      <div class="contenedor pie__legal">
        <span>© ${new Date().getFullYear()} Globo Moda Infantil · Plaza Giles y Rubio, Écija (Sevilla)</span>
        <span>Pago con tarjeta, Bizum, transferencia o al recoger</span>
      </div>
    </div>`;

  document.getElementById('boletin')?.addEventListener('submit', (e) => {
    e.preventDefault();
    e.target.reset();
    avisar('Te hemos apuntado. Avisamos de novedades y rebajas, sin agobiar.', 'ok');
  });
}

/* ------------------------------ Ficha de producto ------------------------- */

function fichaProducto(p) {
  const rebaja = p.precio_antes && p.precio_antes > p.precio;
  const agotado = p.stock_total === 0;
  const marcas = [];
  if (agotado) marcas.push('<span class="marca-etiqueta marca-etiqueta--agotado">Agotado</span>');
  else if (rebaja)
    marcas.push(`<span class="marca-etiqueta marca-etiqueta--rebaja">−${Math.round((1 - p.precio / p.precio_antes) * 100)}%</span>`);
  if (p.novedad && !agotado) marcas.push('<span class="marca-etiqueta marca-etiqueta--nuevo">Nuevo</span>');

  const tallas = (p.variantes || []).filter((v) => v.stock > 0).map((v) => v.talla);

  return `
    <article class="ficha">
      <a class="ficha__enlace" href="/producto?slug=${encodeURIComponent(p.slug)}">
        <div class="ficha__medio">
          <img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" width="600" height="750">
          <div class="ficha__marcas">${marcas.join('')}</div>
        </div>
        <div class="ficha__cuerpo">
          <span class="ficha__categoria">${esc(p.categoria_nombre || '')}</span>
          <h3 class="ficha__nombre">${esc(p.nombre)}</h3>
          <p class="ficha__precio">
            <span class="${rebaja ? 'rebajado' : ''}">${eur(p.precio)}</span>
            ${rebaja ? `<del>${eur(p.precio_antes)}</del>` : ''}
          </p>
          <span class="ficha__tallas">${tallas.length ? 'Tallas ' + tallas.join(' · ') : 'Sin stock'}</span>
        </div>
      </a>
    </article>`;
}

/* --------------------------------- Carrusel -------------------------------- */

/**
 * Convierte un contenedor en carrusel con desplazamiento por tarjetas.
 * @param {HTMLElement} host contenedor con la pista dentro
 */
function activarCarrusel(host) {
  const pista = host.querySelector('.carrusel__pista');
  const izq = host.querySelector('.carrusel__flecha--izq');
  const der = host.querySelector('.carrusel__flecha--der');
  if (!pista || !izq || !der) return;

  const paso = () => {
    const tarjeta = pista.firstElementChild;
    if (!tarjeta) return 280;
    return tarjeta.getBoundingClientRect().width + 21;
  };

  const refrescar = () => {
    const max = pista.scrollWidth - pista.clientWidth - 4;
    izq.hidden = pista.scrollLeft <= 4;
    der.hidden = pista.scrollLeft >= max;
  };

  izq.addEventListener('click', () => pista.scrollBy({ left: -paso() * 2, behavior: 'smooth' }));
  der.addEventListener('click', () => pista.scrollBy({ left: paso() * 2, behavior: 'smooth' }));
  pista.addEventListener('scroll', refrescar, { passive: true });
  window.addEventListener('resize', refrescar);
  refrescar();
}

/** Pinta productos dentro de un carrusel y lo activa. */
function pintarCarrusel(id, productos, vacio = 'Todavía no hay artículos aquí.') {
  const host = document.getElementById(id);
  if (!host) return;
  const pista = host.querySelector('.carrusel__pista');
  pista.innerHTML = productos.length ? productos.map(fichaProducto).join('') : `<p class="cargando">${vacio}</p>`;
  activarCarrusel(host);
}

/** Devuelve el armazón HTML de un carrusel vacío. */
function armazonCarrusel(id) {
  return `
    <div class="carrusel" id="${id}">
      <button class="carrusel__flecha carrusel__flecha--izq" aria-label="Ver anteriores" hidden>‹</button>
      <div class="carrusel__pista"><p class="cargando">Cargando artículos…</p></div>
      <button class="carrusel__flecha carrusel__flecha--der" aria-label="Ver siguientes">›</button>
    </div>`;
}

/* --------------------------------- Arranque ------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  pintarCabecera();
  pintarPie();
});
