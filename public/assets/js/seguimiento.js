/* Seguimiento: cada hito completado rellena una pieza de azulejo. */

const HITOS = [
  ['pendiente', 'Pedido recibido', 'Lo tenemos registrado y en cola.'],
  ['pagado', 'Pago confirmado', 'Cobro verificado correctamente.'],
  ['preparando', 'Preparando el pedido', 'Estamos recogiendo las prendas en la tienda.'],
  ['enviado', 'En camino', 'El transportista ya lo tiene.'],
  ['entregado', 'Entregado', 'Ya está en su destino.']
];

/* Para recogida en tienda, los dos últimos pasos se llaman de otra forma. */
const HITOS_RECOGIDA = [
  ['pendiente', 'Pedido recibido', 'Lo tenemos registrado y en cola.'],
  ['pagado', 'Pago confirmado', 'Cobro verificado correctamente.'],
  ['preparando', 'Preparando el pedido', 'Estamos apartando las prendas para ti.'],
  ['enviado', 'Listo para recoger', 'Te esperamos en Plaza Giles y Rubio, Écija.'],
  ['entregado', 'Recogido', 'Entregado en mano. ¡Gracias!']
];

/* El globo del logotipo, que se infla conforme avanza el pedido. */
const GLOBO = `<svg class="ruta__globo" viewBox="0 0 40 40" aria-hidden="true">
  <ellipse class="cuerpo" cx="20" cy="16" rx="10" ry="12.5"/>
  <path d="M20 28.5c1.5 4-1.5 6-.5 9" stroke="#DCB6CA" stroke-width="1.6" fill="none"/>
  <path d="M17.5 28.5h5l-2.5 2.5Z" fill="currentColor" opacity=".25"/>
</svg>`;

function lineaTiempo(pedido) {
  if (pedido.estado === 'cancelado') {
    const evento = pedido.eventos.find((e) => e.estado === 'cancelado');
    return `<div class="alerta alerta--error" style="margin-top:1.5rem">
      Este pedido está cancelado. ${esc(evento?.mensaje || 'Si no lo has pedido tú, escríbenos.')}
    </div>`;
  }

  const hitos = pedido.metodo_envio === 'recogida' ? HITOS_RECOGIDA : HITOS;
  const alcanzados = new Set(pedido.eventos.map((e) => e.estado));
  const indiceActual = hitos.findIndex(([clave]) => clave === pedido.estado);

  return `<ol class="ruta">${hitos.map(([clave, titulo, texto], i) => {
    const evento = [...pedido.eventos].reverse().find((e) => e.estado === clave);
    const hecho = alcanzados.has(clave) || i < indiceActual;
    const actual = clave === pedido.estado;
    return `
      <li class="${hecho ? 'hecho' : ''} ${actual ? 'actual' : ''}">
        ${GLOBO}
        <div>
          <p class="ruta__fecha">${evento ? fecha(evento.creado_en, true) : 'Pendiente'}</p>
          <h3 class="ruta__titulo">${titulo}</h3>
          <p class="ruta__texto">${esc(evento?.mensaje || texto)}</p>
        </div>
      </li>`;
  }).join('')}</ol>`;
}

function pintarPedido(pedido) {
  const host = document.getElementById('resultado');
  host.hidden = false;

  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1.5rem;flex-wrap:wrap;margin-bottom:.5rem">
      <div>
        <p class="cejilla">Pedido</p>
        <p class="codigo-pedido">${esc(pedido.codigo)}</p>
      </div>
      <span class="estado estado--${esc(pedido.estado)}">${esc(pedido.estado_texto)}</span>
    </div>
    <p class="mono" style="font-size:.82rem;color:var(--tinta-45)">
      Realizado el ${fecha(pedido.creado_en, true)}
      ${pedido.metodo_envio === 'recogida' ? ' · Recogida en tienda' : ''}
      ${pedido.transportista ? ` · ${esc(pedido.transportista)}${pedido.seguimiento_ext ? ` nº ${esc(pedido.seguimiento_ext)}` : ''}` : ''}
    </p>

    <div class="disposicion-2" style="margin-top:2rem">
      <div>${lineaTiempo(pedido)}</div>

      <aside class="panel">
        <h3 style="margin-top:0">Contenido</h3>
        <ul class="lineas" style="border-top:0">
          ${pedido.lineas
            .map(
              (l) => `
            <li class="linea" style="grid-template-columns:56px 1fr auto;padding:.8rem 0">
              <img src="${esc(l.imagen)}" alt="" width="56" height="70" loading="lazy">
              <div>
                <p style="margin:0;font-weight:700;font-size:.92rem">${esc(l.nombre)}</p>
                <p class="linea__meta" style="margin:0">Talla ${esc(l.talla)} × ${l.cantidad}</p>
              </div>
              <div class="mono" style="font-size:.9rem">${eur(l.precio * l.cantidad)}</div>
            </li>`
            )
            .join('')}
        </ul>
        <div class="resumen-fila"><span>Subtotal</span><span>${eur(pedido.subtotal)}</span></div>
        <div class="resumen-fila"><span>Envío</span><span>${pedido.envio === 0 ? 'Gratis' : eur(pedido.envio)}</span></div>
        <div class="resumen-fila resumen-fila--total"><span>Total</span><span>${eur(pedido.total)}</span></div>

        <h3 style="margin-top:1.8rem">${pedido.metodo_envio === 'recogida' ? 'Recogida' : 'Entrega'}</h3>
        <p style="font-size:.95rem;color:var(--tinta-70);margin:0">
          ${esc(pedido.nombre)}<br>
          ${esc(pedido.direccion)}<br>
          ${esc(pedido.cp)} ${esc(pedido.ciudad)}, ${esc(pedido.provincia)}
        </p>
        ${pedido.metodo_envio === 'recogida'
          ? '<p style="font-size:.9rem;color:var(--tinta-45);margin:.6rem 0 0">Horario: lunes a sábado, 10:00-14:00 y 17:30-20:30.</p>'
          : ''}
      </aside>
    </div>`;

  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function buscar(codigo, email) {
  const mensaje = document.getElementById('mensaje');
  const boton = document.getElementById('btn-buscar');
  mensaje.innerHTML = '';
  boton.disabled = true;
  boton.textContent = 'Buscando…';

  try {
    const { pedido } = await API.post('/seguimiento', { codigo, email });
    pintarPedido(pedido);
  } catch (e) {
    document.getElementById('resultado').hidden = true;
    mensaje.innerHTML = `<div class="alerta alerta--error">${esc(e.message)}</div>`;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Ver el estado';
  }
}

document.getElementById('formulario-seguimiento').addEventListener('submit', (e) => {
  e.preventDefault();
  buscar(document.getElementById('codigo').value.trim().toUpperCase(), document.getElementById('email').value.trim());
});

/* Llegada desde la tramitación: se rellena y se consulta solo. */
(function iniciar() {
  const cod = parametro('codigo');
  const mail = parametro('email');

  if (parametro('nuevo') === '1' && cod) {
    document.getElementById('celebracion').innerHTML = `
      <div class="alerta alerta--ok" style="margin-bottom:2rem">
        <strong>Pedido confirmado.</strong> Guarda el número <span class="mono">${esc(cod)}</span>:
        con él y tu correo puedes volver a esta página cuando quieras. También te lo enviamos por email.
      </div>`;
  }

  if (cod) document.getElementById('codigo').value = cod;
  if (mail) document.getElementById('email').value = mail;
  if (cod && mail) buscar(cod, mail);
})();
