/* =========================================================================
   Panel · Imágenes de producto
   Subida por arrastre, galería y portada.
   ========================================================================= */

const ICONO_SUBIR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';

/* ------------------------- Subida por arrastre --------------------------- */

/**
 * Convierte un contenedor en zona de subida con arrastre y selector.
 * @param {HTMLElement} host
 * @param {{multiple?:boolean, texto?:string, onArchivos:(FileList)=>void}} opciones
 */
function zonaSubida(host, { multiple = false, texto = 'Arrastra la foto aquí', onArchivos }) {
  host.innerHTML = `
    <div class="soltar" tabindex="0" role="button" aria-label="${esc(texto)}">
      ${ICONO_SUBIR}
      <strong>${esc(texto)}</strong>
      <span>o pulsa para elegirla · JPG, PNG o WEBP · hasta 12 MB</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" ${multiple ? 'multiple' : ''}>
    </div>`;

  const caja = host.querySelector('.soltar');
  const input = host.querySelector('input[type=file]');

  caja.addEventListener('click', () => input.click());
  caja.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    if (input.files.length) onArchivos(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    caja.addEventListener(ev, (e) => {
      e.preventDefault();
      caja.classList.add('encima');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    caja.addEventListener(ev, (e) => {
      e.preventDefault();
      caja.classList.remove('encima');
    })
  );
  caja.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) onArchivos(e.dataTransfer.files);
  });
}

/** Envío multipart con el token de sesión. */
async function subir(ruta, formData) {
  const respuesta = await fetch(`/api${ruta}`, {
    method: 'POST',
    headers: API.token ? { Authorization: `Bearer ${API.token}` } : {},
    body: formData
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || 'No hemos podido subir la imagen.');
  return datos;
}

/* --------------------- Galería dentro de la ficha ------------------------ */

async function pintarGaleria(productoId, host) {
  try {
    const { imagenes } = await API.get(`/admin/productos/${productoId}/imagenes`);

    /*
     * El campo oculto #p-imagen viaja en el mismo formulario y es lo que se
     * manda al guardar el resto de datos (precio, tallas...). Si se sube o
     * se cambia la portada SIN tocar ese campo, quedaba con el valor de
     * cuando se abrió el modal — casi siempre "generico.svg" en un
     * artículo recién creado. Al pulsar "Guardar cambios" para cualquier
     * otro campo, ese valor viejo pisaba la portada real que se acababa de
     * fijar, y la tienda volvía a enseñar el dibujo de repuesto aunque la
     * ficha del artículo sí tuviera la foto de verdad.
     */
    const campoOculto = document.getElementById('p-imagen');
    if (campoOculto) {
      const principal = imagenes.find((i) => i.principal) || imagenes[0];
      if (principal) campoOculto.value = principal.ruta;
    }
    host.innerHTML = imagenes.length
      ? `<div class="galeria">${imagenes
          .map(
            (i) => `
        <div class="galeria__pieza ${i.principal ? 'principal' : ''}">
          <img src="${esc(i.miniatura || i.ruta)}" alt="">
          ${i.principal ? '<span class="galeria__sello galeria__sello--principal">Portada</span>' : ''}
          <div class="galeria__acciones">
            ${i.principal ? '' : `<button type="button" data-portada="${i.id}">Portada</button>`}
            <button type="button" data-borrar="${i.id}">Quitar</button>
          </div>
        </div>`
          )
          .join('')}</div>`
      : '<p style="color:var(--tinta-45);font-size:.9rem;margin:.8rem 0 0">Todavía no hay fotos. Sube al menos una.</p>';

    host.querySelectorAll('[data-portada]').forEach((b) =>
      b.addEventListener('click', async () => {
        await API.put(`/admin/imagenes/${b.dataset.portada}/principal`);
        pintarGaleria(productoId, host);
        avisar('Portada cambiada.', 'ok');
      })
    );
    host.querySelectorAll('[data-borrar]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('¿Quitar esta foto del artículo?')) return;
        await API.del(`/admin/imagenes/${b.dataset.borrar}`);
        pintarGaleria(productoId, host);
      })
    );
  } catch (e) {
    host.innerHTML = `<div class="alerta alerta--error">${esc(e.message)}</div>`;
  }
}

/** Bloque de fotos que se inserta en el formulario de producto. */
function bloqueFotos(productoId) {
  return `
    <div class="campo">
      <label>Fotos del artículo</label>
      <div id="zona-fotos"></div>
      <div id="galeria-fotos"></div>
      <small>La primera foto es la portada. Puedes cambiarla en cualquier momento.</small>
    </div>`;
}

function activarBloqueFotos(productoId) {
  const zona = document.getElementById('zona-fotos');
  const galeria = document.getElementById('galeria-fotos');
  if (!zona || !productoId) return;

  zonaSubida(zona, {
    multiple: true,
    texto: 'Arrastra aquí las fotos',
    onArchivos: async (archivos) => {
      const fd = new FormData();
      for (const a of archivos) fd.append('imagenes', a);
      zona.querySelector('.soltar strong').textContent = 'Subiendo…';
      try {
        await subir(`/admin/productos/${productoId}/imagenes`, fd);
        avisar(`${archivos.length} ${archivos.length === 1 ? 'foto subida' : 'fotos subidas'}.`, 'ok');
        pintarGaleria(productoId, galeria);
      } catch (e) {
        avisar(e.message, 'error');
      } finally {
        zona.querySelector('.soltar strong').textContent = 'Arrastra aquí las fotos';
      }
    }
  });

  pintarGaleria(productoId, galeria);
}
