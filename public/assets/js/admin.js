/* Trastienda: métricas, cambio de estado de pedidos y alta/edición de catálogo. */

const ESTADOS = ['pendiente', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado'];
let categorias = [];

/* --------------------------------- Ventana -------------------------------- */

const modal = document.getElementById('modal');

function abrirModal(titulo, html) {
  document.getElementById('modal-titulo').textContent = titulo;
  document.getElementById('modal-cuerpo').innerHTML = html;
  modal.hidden = false;
  modal.querySelector('input, select, textarea, button')?.focus();
}
function cerrarModal() {
  modal.hidden = true;
}
document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) cerrarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) cerrarModal();
});

/* --------------------------------- Resumen -------------------------------- */

async function cargarResumen() {
  const d = await API.get('/admin/resumen');

  document.getElementById('metricas').innerHTML = `
    <div class="metrica"><dt>Ingresos</dt><dd>${eur(d.ingresos)}</dd></div>
    <div class="metrica"><dt>Pedidos</dt><dd>${d.pedidos}</dd></div>
    <div class="metrica"><dt>Artículos activos</dt><dd>${d.productos}</dd></div>
    <div class="metrica"><dt>Clientes</dt><dd>${d.clientes}</dd></div>`;

  const maximo = Math.max(1, ...d.por_dia.map((x) => x.pedidos));
  const dias = [];
  for (let i = 13; i >= 0; i--) {
    const f = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const encontrado = d.por_dia.find((x) => x.dia === f);
    dias.push({ dia: f, pedidos: encontrado ? encontrado.pedidos : 0 });
  }
  document.getElementById('grafico').innerHTML = dias
    .map(
      (x) =>
        `<div style="height:${Math.max(3, (x.pedidos / maximo) * 100)}%" title="${x.dia}: ${x.pedidos} pedidos"></div>`
    )
    .join('');
  document.getElementById('grafico-pie').textContent =
    `Máximo del periodo: ${maximo} ${maximo === 1 ? 'pedido' : 'pedidos'} en un día`;

  document.getElementById('bajo-stock').innerHTML = d.bajo_stock.length
    ? `<table class="datos"><tbody>${d.bajo_stock
        .map(
          (x) =>
            `<tr><td>${esc(x.nombre)}</td><td class="mono">${esc(x.talla)}</td>
             <td class="num" style="color:${x.stock <= 1 ? 'var(--tinta)' : 'inherit'}">${x.stock}</td></tr>`
        )
        .join('')}</tbody></table>`
    : '<p style="color:var(--tinta-45);font-size:.92rem">Todo el catálogo tiene stock suficiente.</p>';
}

/* --------------------------------- Pedidos -------------------------------- */

async function cargarPedidos() {
  const cuerpo = document.getElementById('tabla-pedidos');
  const p = new URLSearchParams();
  const q = document.getElementById('buscar-pedidos').value.trim();
  const estado = document.getElementById('filtro-estado').value;
  if (q) p.set('q', q);
  if (estado) p.set('estado', estado);

  try {
    const { pedidos } = await API.get(`/admin/pedidos?${p}`);
    cuerpo.innerHTML = pedidos.length
      ? pedidos
          .map(
            (o) => `
        <tr>
          <td class="mono">${esc(o.codigo)}</td>
          <td>${esc(o.nombre)}<br><span class="mono" style="font-size:.78rem;color:var(--tinta-45)">${esc(o.email)}</span></td>
          <td style="white-space:nowrap">${fecha(o.creado_en)}${o.metodo_envio === 'recogida' ? '<br><span style="font-size:.76rem;color:var(--menta)">Recoge en tienda</span>' : ''}</td>
          <td>${o.lineas.reduce((s, l) => s + l.cantidad, 0)}</td>
          <td class="num">${eur(o.total)}</td>
          <td><span class="estado estado--${esc(o.estado)}">${esc(o.estado_texto)}</span></td>
          <td><button class="btn btn--linea btn--peq" data-pedido="${esc(o.codigo)}">Gestionar</button></td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="7" class="cargando">No hay pedidos con esos criterios.</td></tr>';

    cuerpo.querySelectorAll('[data-pedido]').forEach((b) =>
      b.addEventListener('click', () => abrirPedido(pedidos.find((o) => o.codigo === b.dataset.pedido)))
    );
  } catch (e) {
    cuerpo.innerHTML = `<tr><td colspan="7" class="cargando">${esc(e.message)}</td></tr>`;
  }
}

function abrirPedido(o) {
  abrirModal(
    `Pedido ${o.codigo}`,
    `
    <p style="font-size:.9rem;color:var(--tinta-45)">
      ${esc(o.nombre)} · ${esc(o.email)} · ${esc(o.telefono || 'sin teléfono')}<br>
      ${esc(o.direccion)}, ${esc(o.cp)} ${esc(o.ciudad)} (${esc(o.provincia)})
    </p>
    ${o.metodo_envio === 'recogida'
      ? '<div class="alerta alerta--ok" style="margin:0 0 1rem">Recoge en tienda. Llámale al preparar el pedido y pon el estado en <strong>enviado</strong> (aparecerá como «Listo para recoger»).</div>'
      : ''}

    <ul class="lineas" style="margin:1rem 0">
      ${o.lineas
        .map(
          (l) => `
        <li class="linea" style="grid-template-columns:48px 1fr auto;padding:.6rem 0">
          <img src="${esc(l.imagen)}" alt="" width="48" height="60">
          <div><p style="margin:0;font-weight:700;font-size:.9rem">${esc(l.nombre)}</p>
          <p class="linea__meta" style="margin:0">Talla ${esc(l.talla)} × ${l.cantidad}</p></div>
          <div class="mono" style="font-size:.88rem">${eur(l.precio * l.cantidad)}</div>
        </li>`
        )
        .join('')}
    </ul>
    <div class="resumen-fila resumen-fila--total"><span>Total</span><span>${eur(o.total)}</span></div>
    ${o.notas ? `<p class="alerta alerta--info" style="margin-top:1rem">Indicaciones: ${esc(o.notas)}</p>` : ''}

    <form class="formulario" id="form-estado" style="margin-top:1.5rem">
      <div class="campo">
        <label for="m-estado">Nuevo estado</label>
        <select id="m-estado">
          ${ESTADOS.map((s) => `<option value="${s}" ${s === o.estado ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="formulario__fila">
        <div class="campo">
          <label for="m-transportista">Transportista</label>
          <input id="m-transportista" type="text" value="${esc(o.transportista || '')}" placeholder="SEUR, Correos Express, MRW…">
        </div>
        <div class="campo">
          <label for="m-seguimiento">Nº de seguimiento</label>
          <input id="m-seguimiento" type="text" value="${esc(o.seguimiento_ext || '')}">
        </div>
      </div>
      <div class="campo">
        <label for="m-mensaje">Mensaje para el cliente</label>
        <input id="m-mensaje" type="text" placeholder="Se muestra en su página de seguimiento">
      </div>
      <button class="btn btn--acento" type="submit">Guardar y avisar</button>
    </form>

    <h3 style="margin-top:2rem;font-size:1rem">Historial</h3>
    <ul style="list-style:none;padding:0;margin:0;font-size:.88rem;color:var(--tinta-70)">
      ${o.eventos
        .map(
          (e) =>
            `<li style="padding:.4rem 0;border-bottom:1px solid var(--linea)">
              <span class="mono" style="font-size:.76rem;color:var(--tinta-45)">${fecha(e.creado_en, true)}</span> —
              ${esc(e.mensaje || e.estado)}
            </li>`
        )
        .join('')}
    </ul>`
  );

  document.getElementById('form-estado').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.put(`/admin/pedidos/${o.codigo}/estado`, {
        estado: document.getElementById('m-estado').value,
        transportista: document.getElementById('m-transportista').value.trim(),
        seguimiento_ext: document.getElementById('m-seguimiento').value.trim(),
        mensaje: document.getElementById('m-mensaje').value.trim()
      });
      cerrarModal();
      avisar('Pedido actualizado. El cliente ya lo ve en su seguimiento.', 'ok');
      cargarPedidos();
      cargarResumen();
    } catch (err) {
      avisar(err.message, 'error');
    }
  });
}

/* -------------------------------- Catálogo -------------------------------- */

async function cargarProductos() {
  const cuerpo = document.getElementById('tabla-productos');
  const q = document.getElementById('buscar-productos').value.trim();

  try {
    const { productos } = await API.get(`/admin/productos?q=${encodeURIComponent(q)}`);
    cuerpo.innerHTML = productos.length
      ? productos
          .map(
            (p) => `
        <tr>
          <td><img src="${esc(p.imagen)}" alt="" width="40" height="50" style="border-radius:3px;border:1px solid var(--linea)"></td>
          <td>${esc(p.nombre)}</td>
          <td class="mono">${esc(p.sku)}</td>
          <td>${esc(p.categoria_nombre)}</td>
          <td class="num">${eur(p.precio)}</td>
          <td class="num" style="color:${p.stock_total <= 5 ? 'var(--tinta)' : 'inherit'}">${p.stock_total}</td>
          <td>${p.activo ? '<span class="estado estado--entregado">activo</span>' : '<span class="estado estado--cancelado">oculto</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn--linea btn--peq" data-editar="${p.id}">Editar</button>
            ${p.activo ? `<button class="btn btn--linea btn--peq" data-ocultar="${p.id}">Ocultar</button>` : ''}
          </td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="8" class="cargando">No hay artículos con esos criterios.</td></tr>';

    cuerpo.querySelectorAll('[data-editar]').forEach((b) =>
      b.addEventListener('click', () => formularioProducto(productos.find((p) => p.id === Number(b.dataset.editar))))
    );
    cuerpo.querySelectorAll('[data-ocultar]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('¿Ocultar este artículo de la tienda? Los pedidos antiguos no se ven afectados.')) return;
        await API.del(`/admin/productos/${b.dataset.ocultar}`);
        avisar('Artículo oculto.', 'ok');
        cargarProductos();
      })
    );
  } catch (e) {
    cuerpo.innerHTML = `<tr><td colspan="8" class="cargando">${esc(e.message)}</td></tr>`;
  }
}

function formularioProducto(p = null) {
  const variantes = p?.variantes || [];
  abrirModal(
    p ? `Editar ${p.nombre}` : 'Nuevo artículo',
    `
    <form class="formulario" id="form-producto">
      <div id="mensaje-producto"></div>
      <div class="formulario__fila">
        <div class="campo"><label for="p-nombre">Nombre</label>
          <input id="p-nombre" type="text" value="${esc(p?.nombre || '')}" required></div>
        <div class="campo"><label for="p-sku">SKU</label>
          <input id="p-sku" type="text" value="${esc(p?.sku || '')}" ${p ? 'disabled' : ''} placeholder="CRC-1050"></div>
      </div>

      <div class="campo"><label for="p-categoria">Categoría</label>
        <select id="p-categoria">
          ${categorias
            .map((c) => `<option value="${c.slug}" ${p?.categoria_slug === c.slug ? 'selected' : ''}>${esc(c.nombre)}</option>`)
            .join('')}
        </select></div>

      <div class="formulario__fila">
        <div class="campo"><label for="p-precio">Precio (€)</label>
          <input id="p-precio" type="number" step="0.01" min="0" value="${p?.precio ?? ''}" required></div>
        <div class="campo"><label for="p-antes">Precio anterior (€)</label>
          <input id="p-antes" type="number" step="0.01" min="0" value="${p?.precio_antes ?? ''}"></div>
      </div>

      <div class="campo"><label for="p-descripcion">Descripción</label>
        <textarea id="p-descripcion">${esc(p?.descripcion || '')}</textarea></div>

      <div class="campo"><label for="p-composicion">Composición</label>
        <input id="p-composicion" type="text" value="${esc(p?.composicion || '')}"></div>

      ${p
        ? bloqueFotos(p.id)
        : `<div class="alerta alerta--info" style="margin:0">
             Crea primero el artículo y, al volver a abrirlo, podrás subirle las fotos arrastrándolas.
           </div>`}
      <input id="p-imagen" type="hidden" value="${esc(p?.imagen || '/img/productos/generico.svg')}">

      <div class="campo">
        <label>Tallas y stock</label>
        <div id="tallas-editor">
          ${variantes
            .map(
              (v) => `<div style="display:flex;gap:.5rem;margin-bottom:.4rem">
                <input type="text" value="${esc(v.talla)}" class="v-talla" style="width:110px">
                <input type="number" value="${v.stock}" min="0" class="v-stock" style="width:110px">
              </div>`
            )
            .join('')}
        </div>
        <button type="button" class="btn btn--linea btn--peq" id="add-talla" style="margin-top:.4rem">Añadir talla</button>
      </div>

      <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="p-destacado" ${p?.destacado ? 'checked' : ''}> Destacado</label>
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="p-novedad" ${p?.novedad ? 'checked' : ''}> Novedad</label>
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="p-activo" ${p ? (p.activo ? 'checked' : '') : 'checked'}> Visible en la tienda</label>
      </div>

      <button class="btn btn--acento" type="submit">${p ? 'Guardar cambios' : 'Crear artículo'}</button>
    </form>`
  );

  if (p) activarBloqueFotos(p.id);

  document.getElementById('add-talla').addEventListener('click', () => {
    const fila = document.createElement('div');
    fila.style.cssText = 'display:flex;gap:.5rem;margin-bottom:.4rem';
    fila.innerHTML =
      '<input type="text" class="v-talla" placeholder="Talla" style="width:110px"><input type="number" class="v-stock" value="0" min="0" style="width:110px">';
    document.getElementById('tallas-editor').appendChild(fila);
  });

  document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tallas = [...document.querySelectorAll('#tallas-editor > div')]
      .map((f) => ({
        talla: f.querySelector('.v-talla').value.trim(),
        stock: Number(f.querySelector('.v-stock').value)
      }))
      .filter((v) => v.talla);

    const cuerpo = {
      nombre: document.getElementById('p-nombre').value.trim(),
      sku: document.getElementById('p-sku').value.trim(),
      categoria_id: document.getElementById('p-categoria').value,
      precio: Number(document.getElementById('p-precio').value),
      precio_antes: document.getElementById('p-antes').value || null,
      descripcion: document.getElementById('p-descripcion').value.trim(),
      composicion: document.getElementById('p-composicion').value.trim(),
      imagen: document.getElementById('p-imagen').value.trim(),
      destacado: document.getElementById('p-destacado').checked,
      novedad: document.getElementById('p-novedad').checked,
      activo: document.getElementById('p-activo').checked,
      variantes: tallas
    };

    try {
      if (p) await API.put(`/admin/productos/${p.id}`, cuerpo);
      else await API.post('/admin/productos', cuerpo);
      cerrarModal();
      avisar(p ? 'Artículo actualizado.' : 'Artículo creado.', 'ok');
      cargarProductos();
      cargarResumen();
    } catch (err) {
      document.getElementById('mensaje-producto').innerHTML = `<div class="alerta alerta--error">${esc(err.message)}</div>`;
    }
  });
}

/* -------------------------------- Clientes -------------------------------- */

async function cargarClientes() {
  const cuerpo = document.getElementById('tabla-clientes');
  try {
    const { clientes } = await API.get('/admin/clientes');
    cuerpo.innerHTML = clientes.length
      ? clientes
          .map(
            (c) => `
        <tr>
          <td>${esc(c.nombre)}</td>
          <td class="mono">${esc(c.email)}</td>
          <td>${esc(c.ciudad || '—')}</td>
          <td class="num">${c.pedidos}</td>
          <td class="num">${eur(c.gastado)}</td>
          <td class="mono">${fecha(c.creado_en)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="cargando">Todavía no hay clientes registrados.</td></tr>';
  } catch (e) {
    cuerpo.innerHTML = `<tr><td colspan="6" class="cargando">${esc(e.message)}</td></tr>`;
  }
}

/* -------------------------------- Arranque -------------------------------- */

function activarPestanas() {
  const botones = document.querySelectorAll('.pestanas [data-panel]');
  botones.forEach((b) =>
    b.addEventListener('click', () => {
      botones.forEach((otro) => {
        const activo = otro === b;
        otro.setAttribute('aria-selected', String(activo));
        document.getElementById(otro.dataset.panel).hidden = !activo;
      });
      if (b.dataset.panel === 'a-clientes') cargarClientes();
    })
  );
}

let temporizador;
function conRetardo(fn) {
  clearTimeout(temporizador);
  temporizador = setTimeout(fn, 280);
}

/** Acceso desde la propia página del panel, sin pasar por /cuenta. */
function activarAcceso() {
  const caja = document.getElementById('sin-permiso');
  caja.hidden = false;

  document.getElementById('limpiar-sesion')?.addEventListener('click', () => {
    localStorage.removeItem('globo_token');
    localStorage.removeItem('globo_usuario');
    location.reload();
  });

  document.getElementById('acceso-admin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const aviso = document.getElementById('mensaje-admin');
    aviso.innerHTML = '';
    try {
      const datos = await API.post('/auth/login', {
        email: document.getElementById('a-email').value.trim(),
        password: document.getElementById('a-password').value
      });
      if (datos.usuario.rol !== 'admin') {
        aviso.innerHTML = `<div class="alerta alerta--error">Esa cuenta es de cliente, no de administración.
          Puedes convertirla desde la terminal con: npm run admin -- --promover ${esc(datos.usuario.email)}</div>`;
        return;
      }
      Sesion.guardar(datos);
      location.reload();
    } catch (err) {
      aviso.innerHTML = `<div class="alerta alerta--error">${esc(err.message)}</div>`;
    }
  });
}

(async function iniciar() {
  if (!API.token) {
    activarAcceso();
    return;
  }
  try {
    const { usuario } = await API.get('/auth/yo');
    if (usuario.rol !== 'admin') throw new Error('sin permiso');
    Sesion.usuario = usuario;
  } catch (_) {
    /* Token caducado, de otra instalación o de una cuenta sin permisos. */
    activarAcceso();
    return;
  }

  document.getElementById('panel').hidden = false;
  activarPestanas();

  document.getElementById('salir').addEventListener('click', () => Sesion.cerrar());
  document.getElementById('nuevo-producto').addEventListener('click', () => formularioProducto());
  document.getElementById('buscar-pedidos').addEventListener('input', () => conRetardo(cargarPedidos));
  document.getElementById('filtro-estado').addEventListener('change', cargarPedidos);
  document.getElementById('buscar-productos').addEventListener('input', () => conRetardo(cargarProductos));

  categorias = (await API.get('/categorias')).categorias;
  cargarResumen();
  cargarPedidos();
  cargarProductos();
})();
