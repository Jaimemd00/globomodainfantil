/* Portal de cliente: dos vistas en la misma página según haya sesión o no. */

const volverA = parametro('volver');

function alerta(id, texto, tipo = 'error') {
  document.getElementById(id).innerHTML = `<div class="alerta alerta--${tipo}">${esc(texto)}</div>`;
}

/* ------------------------------ Sin sesión -------------------------------- */

function activarPestanasAcceso() {
  const mapa = { 'tab-entrar': 'panel-entrar', 'tab-registro': 'panel-registro' };
  Object.keys(mapa).forEach((idTab) => {
    document.getElementById(idTab).addEventListener('click', () => {
      Object.entries(mapa).forEach(([t, p]) => {
        const activo = t === idTab;
        document.getElementById(t).setAttribute('aria-selected', String(activo));
        document.getElementById(p).hidden = !activo;
      });
      document.getElementById('mensaje-acceso').innerHTML = '';
    });
  });
}

function irDespuesDeEntrar() {
  if (volverA) location.href = volverA;
  else location.reload();
}

document.getElementById('panel-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const datos = await API.post('/auth/login', {
      email: document.getElementById('e-email').value.trim(),
      password: document.getElementById('e-password').value
    });
    Sesion.guardar(datos);
    irDespuesDeEntrar();
  } catch (err) {
    alerta('mensaje-acceso', err.message);
  }
});

document.getElementById('panel-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const datos = await API.post('/auth/registro', {
      nombre: document.getElementById('r-nombre').value.trim(),
      email: document.getElementById('r-email').value.trim(),
      password: document.getElementById('r-password').value,
      telefono: document.getElementById('r-telefono').value.trim(),
      cp: document.getElementById('r-cp').value.trim()
    });
    Sesion.guardar(datos);
    irDespuesDeEntrar();
  } catch (err) {
    alerta('mensaje-acceso', err.message);
  }
});

/* ------------------------------- Con sesión -------------------------------- */

function activarPestanasPortal() {
  const botones = document.querySelectorAll('.pestanas [data-panel]');
  botones.forEach((b) =>
    b.addEventListener('click', () => {
      botones.forEach((otro) => {
        const activo = otro === b;
        otro.setAttribute('aria-selected', String(activo));
        document.getElementById(otro.dataset.panel).hidden = !activo;
      });
    })
  );
}

function tarjetaPedido(p) {
  return `
    <article class="panel" style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <div>
          <p class="codigo-pedido" style="font-size:.95rem">${esc(p.codigo)}</p>
          <p style="font-size:.86rem;color:var(--tinta-45);margin:.4rem 0 0">
            ${fecha(p.creado_en)} · ${p.lineas.length} ${p.lineas.length === 1 ? 'artículo' : 'artículos'} · ${eur(p.total)}
          </p>
        </div>
        <span class="estado estado--${esc(p.estado)}">${esc(p.estado_texto)}</span>
      </div>

      <ul class="lineas" style="border-top:1px solid var(--linea);margin-top:1rem">
        ${p.lineas
          .map(
            (l) => `
          <li class="linea" style="grid-template-columns:52px 1fr auto;padding:.7rem 0">
            <img src="${esc(l.imagen)}" alt="" width="52" height="65" loading="lazy">
            <div>
              <p style="margin:0;font-weight:700;font-size:.9rem">${esc(l.nombre)}</p>
              <p class="linea__meta" style="margin:0">Talla ${esc(l.talla)} × ${l.cantidad}</p>
            </div>
            <div style="font-size:.9rem">${eur(l.precio * l.cantidad)}</div>
          </li>`
          )
          .join('')}
      </ul>

      <div style="display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap">
        <a class="btn btn--linea btn--peq"
           href="/seguimiento?codigo=${encodeURIComponent(p.codigo)}&email=${encodeURIComponent(p.email)}">
          Ver el seguimiento
        </a>
        ${p.transportista ? `<span style="align-self:center;font-size:.85rem;color:var(--tinta-45)">${esc(p.transportista)} ${esc(p.seguimiento_ext || '')}</span>` : ''}
      </div>
    </article>`;
}

async function cargarPedidos() {
  const host = document.getElementById('lista-pedidos');
  try {
    const { pedidos } = await API.get('/pedidos');
    host.innerHTML = pedidos.length
      ? pedidos.map(tarjetaPedido).join('')
      : `<div class="vacio">
           <h3>Todavía no has hecho ningún pedido</h3>
           <p>Cuando compres algo, aparecerá aquí con su estado y su seguimiento.</p>
           <a class="btn" href="/tienda">Ver el catálogo</a>
         </div>`;
  } catch (e) {
    host.innerHTML = `<div class="alerta alerta--error">${esc(e.message)}</div>`;
  }
}

function rellenarDatos(u) {
  for (const campo of ['nombre', 'telefono', 'direccion', 'ciudad', 'cp', 'provincia']) {
    document.getElementById(`d-${campo}`).value = u[campo] || '';
  }
}

function activarFormulariosPortal() {
  document.querySelector('#p-datos form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { usuario } = await API.put('/auth/yo', {
        nombre: document.getElementById('d-nombre').value.trim(),
        telefono: document.getElementById('d-telefono').value.trim(),
        direccion: document.getElementById('d-direccion').value.trim(),
        ciudad: document.getElementById('d-ciudad').value.trim(),
        cp: document.getElementById('d-cp').value.trim(),
        provincia: document.getElementById('d-provincia').value.trim()
      });
      Sesion.usuario = usuario;
      alerta('mensaje-datos', 'Datos guardados.', 'ok');
      avisar('Datos guardados.', 'ok');
    } catch (err) {
      alerta('mensaje-datos', err.message);
    }
  });

  document.querySelector('#p-seguridad form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.put('/auth/password', {
        actual: document.getElementById('s-actual').value,
        nueva: document.getElementById('s-nueva').value
      });
      e.target.reset();
      alerta('mensaje-password', 'Contraseña actualizada.', 'ok');
    } catch (err) {
      alerta('mensaje-password', err.message);
    }
  });

  document.getElementById('salir').addEventListener('click', () => Sesion.cerrar());
}

/* --------------------------------- Arranque -------------------------------- */

(async function iniciar() {
  activarPestanasAcceso();

  if (!API.token) {
    document.getElementById('acceso').hidden = false;
    return;
  }

  try {
    const { usuario } = await API.get('/auth/yo');
    Sesion.usuario = usuario;

    document.getElementById('portal').hidden = false;
    document.getElementById('saludo').textContent = `Hola, ${usuario.nombre.split(' ')[0]}`;
    document.getElementById('sub-saludo').textContent = usuario.email;
    if (usuario.rol === 'admin') document.getElementById('enlace-admin').hidden = false;

    activarPestanasPortal();
    activarFormulariosPortal();
    rellenarDatos(usuario);
    cargarPedidos();
  } catch (_) {
    Sesion.cerrar(false);
    document.getElementById('acceso').hidden = false;
  }
})();
