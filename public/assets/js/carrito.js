/* Cesta: las reglas de envío se piden al servidor para no duplicarlas en el front. */

let reglasEnvio = { estandar: 4.95, gratis_desde: 49 };

function pintar() {
  const items = Carrito.leer();
  const vacio = document.getElementById('vacio');
  const disposicion = document.getElementById('disposicion');

  if (!items.length) {
    disposicion.hidden = true;
    vacio.hidden = false;
    return;
  }
  disposicion.hidden = false;
  vacio.hidden = true;

  document.getElementById('lineas').innerHTML = items
    .map(
      (i, n) => `
      <li class="linea">
        <a href="/producto?slug=${encodeURIComponent(i.slug)}">
          <img src="${esc(i.imagen)}" alt="${esc(i.nombre)}" width="92" height="115" loading="lazy">
        </a>
        <div>
          <h3 class="linea__nombre">
            <a href="/producto?slug=${encodeURIComponent(i.slug)}" style="color:inherit;text-decoration:none">${esc(i.nombre)}</a>
          </h3>
          <p class="linea__meta">Talla ${esc(i.talla)} · ${eur(i.precio)} / ud.</p>
          <div class="cantidad" style="margin-top:.6rem">
            <button type="button" data-accion="menos" data-i="${n}" aria-label="Quitar una unidad">−</button>
            <span>${i.cantidad}</span>
            <button type="button" data-accion="mas" data-i="${n}" aria-label="Añadir una unidad">+</button>
          </div>
          <button class="linea__quitar" data-accion="quitar" data-i="${n}">Quitar de la cesta</button>
        </div>
        <div style="font-weight:700;font-family:var(--display);font-size:1.05rem">${eur(i.precio * i.cantidad)}</div>
      </li>`
    )
    .join('');

  document.querySelectorAll('[data-accion]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = Number(b.dataset.i);
      const items = Carrito.leer();
      if (b.dataset.accion === 'quitar') Carrito.quitar(n);
      else Carrito.cambiarCantidad(n, items[n].cantidad + (b.dataset.accion === 'mas' ? 1 : -1));
      pintar();
    })
  );

  pintarResumen();
}

function pintarResumen() {
  const subtotal = Carrito.subtotal();
  const gratis = subtotal >= reglasEnvio.gratis_desde;
  const envio = gratis ? 0 : reglasEnvio.estandar;

  document.getElementById('subtotal').textContent = eur(subtotal);
  document.getElementById('envio').textContent = gratis ? 'Gratis' : eur(envio);
  document.getElementById('total').textContent = eur(subtotal + envio);

  /* Barra de progreso: motiva a llegar al envío gratis sin tener que hacer cuentas. */
  const aviso = document.getElementById('aviso-envio');
  const porcentaje = Math.min(100, (subtotal / reglasEnvio.gratis_desde) * 100);
  aviso.hidden = false;
  aviso.innerHTML = gratis
    ? '<strong>¡El envío te sale gratis!</strong> O recógelo en la tienda cuando quieras.'
    : `Te faltan <strong>${eur(reglasEnvio.gratis_desde - subtotal)}</strong> para el envío gratis.
       También puedes recogerlo en la tienda sin pagar envío.
       <div class="barra-progreso"><div style="width:${porcentaje}%"></div></div>`;
}

/* Vuelta desde la pasarela sin completar el pago. */
if (parametro('pago') === 'cancelado') {
  avisar('No se completó el pago. Tu cesta sigue aquí cuando quieras volver a intentarlo.', 'error');
}

(async function iniciar() {
  try {
    reglasEnvio = await API.get('/envio');
  } catch (_) {
    /* se usan los valores por defecto */
  }
  pintar();
})();
