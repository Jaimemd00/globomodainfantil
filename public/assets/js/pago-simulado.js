/* Pantalla de pago en modo simulación: permite recorrer el circuito completo
   (pago correcto y pago fallido) sin pasarela real ni conexión a internet. */

const codigo = parametro('codigo');
const referencia = parametro('ref');

async function cargar() {
  document.getElementById('codigo').textContent = codigo || '—';

  if (!codigo) {
    document.getElementById('resumen').innerHTML =
      '<div class="alerta alerta--error">Falta el número de pedido en la dirección.</div>';
    return;
  }

  /* El importe se lee del pedido guardado, igual que haría la pasarela real. */
  const email = sessionStorage.getItem('globo_email_pago') || '';
  try {
    const { pedido } = await API.post('/seguimiento', { codigo, email });
    document.getElementById('resumen').innerHTML = `
      <ul class="lineas" style="border-top:1px solid var(--linea)">
        ${pedido.lineas
          .map(
            (l) => `<li class="linea" style="grid-template-columns:1fr auto;padding:.6rem 0">
              <span>${esc(l.nombre)} · talla ${esc(l.talla)} × ${l.cantidad}</span>
              <span>${eur(l.precio * l.cantidad)}</span>
            </li>`
          )
          .join('')}
      </ul>
      <div class="resumen-fila"><span>Envío</span><span>${pedido.envio === 0 ? 'Gratis' : eur(pedido.envio)}</span></div>
      <div class="resumen-fila resumen-fila--total"><span>Total</span><span>${eur(pedido.total)}</span></div>`;
    document.getElementById('acciones').hidden = false;
  } catch (e) {
    document.getElementById('resumen').innerHTML = `<div class="alerta alerta--error">${esc(e.message)}</div>`;
  }
}

async function resolver(accion) {
  const mensaje = document.getElementById('mensaje');
  document.getElementById('acciones').hidden = true;
  mensaje.innerHTML = '<p class="cargando">Procesando…</p>';

  try {
    const r = await API.post('/pagos/simulado', { codigo, referencia, accion });
    if (r.estado === 'pagado') {
      mensaje.innerHTML = '<div class="alerta alerta--ok">Pago confirmado. Te llevamos al seguimiento…</div>';
      const email = sessionStorage.getItem('globo_email_pago') || '';
      setTimeout(() => {
        location.href = `/seguimiento?codigo=${encodeURIComponent(codigo)}&email=${encodeURIComponent(email)}&nuevo=1`;
      }, 1200);
    } else {
      mensaje.innerHTML = `<div class="alerta alerta--error">
        El pago no se completó y el pedido quedó cancelado. Las unidades han vuelto al stock.
        <br><a href="/tienda">Volver a la tienda</a></div>`;
    }
  } catch (e) {
    mensaje.innerHTML = `<div class="alerta alerta--error">${esc(e.message)}</div>`;
    document.getElementById('acciones').hidden = false;
  }
}

document.getElementById('pagar').addEventListener('click', () => resolver('pagar'));
document.getElementById('cancelar').addEventListener('click', () => resolver('cancelar'));

cargar();
