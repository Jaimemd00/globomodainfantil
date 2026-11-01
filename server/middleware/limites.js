'use strict';

/**
 * Rate-limit sencillo en memoria, por IP y por "acción".
 *
 * Objetivo: frenar bots y fuerza bruta (altas masivas, prueba de contraseñas,
 * farmeo del cupón) sin molestar a una familia normal. Un solo proceso de pm2
 * con SQLite, así que con un Map en memoria basta; si algún día esto pasa a
 * varios procesos, habría que mover el contador a la base de datos o a Redis.
 *
 * Para que la IP sea la REAL del cliente (y no la del Nginx que hay delante),
 * en index.js se configura `app.set('trust proxy', …)`. Sin eso, todos los
 * clientes saldrían con la misma IP y se bloquearían entre ellos.
 *
 * Se puede desactivar por completo con ANTIABUSO_OFF=1 (útil en local/tests).
 */

const DESACTIVADO = process.env.ANTIABUSO_OFF === '1';

const cubos = new Map(); // `${ip}|${accion}` -> { desde, conteo }

function ipDe(req) {
  return req.ip || req.socket?.remoteAddress || 'desconocida';
}

/**
 * @param {object} opciones
 * @param {string} opciones.accion   nombre del cubo (p. ej. 'registro')
 * @param {number} opciones.ventanaMs ventana de tiempo en ms
 * @param {number} opciones.max       peticiones permitidas en esa ventana
 * @param {string} [opciones.mensaje] texto del error 429
 */
function limitar({ accion, ventanaMs, max, mensaje }) {
  return function limitador(req, res, next) {
    if (DESACTIVADO) return next();

    const clave = `${ipDe(req)}|${accion}`;
    const ahora = Date.now();
    let reg = cubos.get(clave);

    if (!reg || ahora - reg.desde >= ventanaMs) {
      reg = { desde: ahora, conteo: 0 };
      cubos.set(clave, reg);
    }
    reg.conteo += 1;

    if (reg.conteo > max) {
      const quedanS = Math.max(1, Math.ceil((reg.desde + ventanaMs - ahora) / 1000));
      res.setHeader('Retry-After', String(quedanS));
      return res.status(429).json({
        error: mensaje || 'Has hecho demasiadas peticiones seguidas. Espera un momento e inténtalo de nuevo.'
      });
    }
    next();
  };
}

/* Limpieza periódica para que el Map no crezca sin fin. unref() para no
   mantener vivo el proceso (importante en los tests). */
const UNA_HORA = 60 * 60 * 1000;
setInterval(() => {
  const ahora = Date.now();
  for (const [clave, reg] of cubos) {
    if (ahora - reg.desde >= UNA_HORA) cubos.delete(clave);
  }
}, 10 * 60 * 1000).unref();

module.exports = { limitar };
