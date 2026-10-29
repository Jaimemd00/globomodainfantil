/* Tramitación: el servidor recalcula precios y stock; aquí solo se recogen los datos. */

let reglasEnvio = { estandar: 4.95, gratis_desde: 49 };

/* Cupón aplicado: lo calcula el servidor y aquí solo se muestra. */
let cuponAplicado = null;
let descuentoActual = 0;
let etiquetaDescuento = 'Descuento';

const esRecogida = () => document.querySelector('input[name=metodo_envio]:checked')?.value === 'recogida';

function pintarResumen() {
  const items = Carrito.leer();
  if (!items.length) {
    location.href = '/carrito';
    return;
  }

  document.getElementById('resumen-lineas').innerHTML = items
    .map(
      (i) => `
      <li class="linea" style="grid-template-columns:56px 1fr auto;padding:.8rem 0">
        <img src="${esc(i.imagen)}" alt="" width="56" height="70" loading="lazy">
        <div>
          <p style="margin:0;font-weight:700;font-size:.92rem">${esc(i.nombre)}</p>
          <p class="linea__meta" style="margin:0">Talla ${esc(i.talla)} × ${i.cantidad}</p>
        </div>
        <div class="mono" style="font-size:.9rem">${eur(i.precio * i.cantidad)}</div>
      </li>`
    )
    .join('');

  actualizarTotales();
}

/* El envío cambia según se reciba en casa o se recoja: hay que recalcular. */
function actualizarTotales() {
  const subtotal = Carrito.subtotal();
  const gratisPorImporte = subtotal >= reglasEnvio.gratis_desde;
  const envio = esRecogida() || gratisPorImporte ? 0 : reglasEnvio.estandar;

  /* El descuento nunca puede dejar el total por debajo del envío. */
  const descuento = Math.min(descuentoActual, subtotal);

  const filaDesc = document.getElementById('fila-descuento');
  if (descuento > 0) {
    document.getElementById('descuento-etq').textContent = `Descuento (${cuponAplicado})`;
    document.getElementById('descuento').textContent = `− ${eur(descuento)}`;
    filaDesc.hidden = false;
  } else {
    filaDesc.hidden = true;
  }

  document.getElementById('subtotal').textContent = eur(subtotal);
  document.getElementById('envio').textContent = envio === 0 ? 'Gratis' : eur(envio);
  document.getElementById('total').textContent = eur(subtotal - descuento + envio);

  const etiqueta = document.getElementById('precio-domicilio');
  if (etiqueta) {
    etiqueta.textContent = gratisPorImporte ? 'Gratis' : eur(reglasEnvio.estandar);
    etiqueta.style.color = gratisPorImporte ? 'var(--menta)' : '';
  }

  /* Si recoge en tienda, la dirección sobra: se oculta en vez de pedirla en vano. */
  const recogida = esRecogida();
  document.getElementById('bloque-direccion').hidden = recogida;
  document.getElementById('aviso-recogida').hidden = !recogida;
}

/* Pregunta al servidor cuánto descuenta el código sobre la cesta actual.
   El importe lo decide el servidor (mira qué prendas están a precio normal);
   aquí solo se enseña. */
async function validarCupon({ silencioso = false } = {}) {
  const entrada = document.getElementById('cupon');
  const aviso = document.getElementById('cupon-aviso');
  const codigo = entrada.value.trim().toUpperCase();

  if (!codigo) {
    cuponAplicado = null;
    descuentoActual = 0;
    aviso.textContent = '';
    aviso.className = 'cupon__aviso';
    actualizarTotales();
    return;
  }

  const items = Carrito.leer().map((i) => ({ producto_id: i.producto_id, talla: i.talla, cantidad: i.cantidad }));
  const email = document.getElementById('email')?.value.trim() || '';

  try {
    const r = await API.post('/cupones/validar', { codigo, email, items });
    if (r.valido && r.descuento > 0) {
      cuponAplicado = r.cupon;
      descuentoActual = r.descuento;
      etiquetaDescuento = r.etiqueta || 'Descuento';
      aviso.textContent = `✓ Código aplicado: −${eur(r.descuento)}. ${r.etiqueta || ''}`.trim();
      aviso.className = 'cupon__aviso cupon__aviso--ok';
    } else {
      cuponAplicado = null;
      descuentoActual = 0;
      aviso.textContent = r.motivo || 'Ese código no se puede aplicar.';
      aviso.className = 'cupon__aviso cupon__aviso--error';
    }
  } catch (e) {
    cuponAplicado = null;
    descuentoActual = 0;
    if (!silencioso) {
      aviso.textContent = 'No hemos podido comprobar el código. Inténtalo de nuevo.';
      aviso.className = 'cupon__aviso cupon__aviso--error';
    }
  }
  actualizarTotales();
}

function rellenarConSesion() {
  const u = Sesion.usuario;
  const aviso = document.getElementById('aviso-cuenta');

  if (u) {
    aviso.innerHTML = `Estás comprando como <strong>${esc(u.nombre)}</strong> (${esc(u.email)}).
      El pedido quedará guardado en tu portal. <a href="/cuenta">Ver mi cuenta</a>`;
    for (const campo of ['nombre', 'email', 'telefono', 'direccion', 'ciudad', 'cp', 'provincia']) {
      const nodo = document.getElementById(campo);
      if (nodo && u[campo]) nodo.value = u[campo];
    }
  } else {
    aviso.innerHTML = `Puedes comprar sin cuenta: te daremos un número de seguimiento.
      Si prefieres tener el historial guardado, <a href="/cuenta?volver=/checkout">inicia sesión o regístrate</a>.`;
  }
}

function mostrarError(texto) {
  document.getElementById('mensaje').innerHTML = `<div class="alerta alerta--error">${esc(texto)}</div>`;
  document.getElementById('mensaje').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.getElementById('formulario-pedido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = document.getElementById('confirmar');

  if (!document.getElementById('acepto').checked) {
    return mostrarError('Necesitamos que aceptes las condiciones de compra para continuar.');
  }

  const valor = (id) => document.getElementById(id).value.trim();

  const recogida = esRecogida();
  const datos = {
    metodo_envio: recogida ? 'recogida' : 'domicilio',
    nombre: valor('nombre'),
    email: valor('email'),
    telefono: valor('telefono'),
    direccion: valor('direccion'),
    ciudad: valor('ciudad'),
    cp: valor('cp'),
    provincia: valor('provincia'),
    pais: valor('pais'),
    notas: valor('notas'),
    metodo_pago: document.querySelector('input[name=metodo_pago]:checked').value,
    cupon: cuponAplicado || '',
    items: Carrito.leer().map((i) => ({ producto_id: i.producto_id, talla: i.talla, cantidad: i.cantidad }))
  };

  const obligatorios = recogida
    ? [['nombre', 'tu nombre'], ['email', 'tu correo'], ['telefono', 'tu teléfono, para avisarte cuando esté listo']]
    : [['nombre', 'tu nombre'], ['email', 'tu correo'], ['direccion', 'la dirección'],
       ['cp', 'el código postal'], ['ciudad', 'la ciudad'], ['provincia', 'la provincia']];

  for (const [campo, etiqueta] of obligatorios) {
    if (!datos[campo]) return mostrarError(`Falta ${etiqueta}.`);
  }

  boton.disabled = true;
  boton.textContent = 'Confirmando…';

  try {
    const { pedido } = await API.post('/pedidos', datos);
    Carrito.vaciar();

    /* Con tarjeta se pasa por la pasarela; el pedido no se da por pagado
       hasta que ella lo confirme. Con transferencia o pago al recibir,
       se va directo al seguimiento. */
    if (datos.metodo_pago === 'tarjeta') {
      sessionStorage.setItem('globo_email_pago', pedido.email);
      boton.textContent = 'Abriendo la pasarela…';
      try {
        const sesion = await API.post('/pagos/sesion', { codigo: pedido.codigo, email: pedido.email });
        location.href = sesion.url;
        return;
      } catch (errorPago) {
        /* Si la pasarela falla, el pedido ya existe: se avisa y se manda al
           seguimiento en vez de perderlo. */
        avisar('El pedido se ha registrado, pero la pasarela no respondió. Te llamaremos para cobrarlo.', 'error');
      }
    }

    location.href = `/seguimiento?codigo=${pedido.codigo}&email=${encodeURIComponent(pedido.email)}&nuevo=1`;
  } catch (err) {
    mostrarError(err.message);
    boton.disabled = false;
    boton.textContent = 'Confirmar pedido';
  }
});

(async function iniciar() {
  try {
    reglasEnvio = await API.get('/envio');
  } catch (_) {
    /* valores por defecto */
  }
  pintarResumen();
  rellenarConSesion();

  document.querySelectorAll('input[name=metodo_envio]').forEach((r) =>
    r.addEventListener('change', actualizarTotales)
  );

  /* Cupón: botón "Aplicar", tecla Enter y prellenado por URL (?cupon=...),
     que es como llega desde el correo de bienvenida o tras registrarse. */
  const entradaCupon = document.getElementById('cupon');
  document.getElementById('aplicar-cupon')?.addEventListener('click', () => validarCupon());
  entradaCupon?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); validarCupon(); }
  });

  const cuponURL = new URLSearchParams(location.search).get('cupon');
  if (cuponURL && entradaCupon) {
    entradaCupon.value = cuponURL.toUpperCase();
    validarCupon({ silencioso: true });
  }

  actualizarTotales();
})();
