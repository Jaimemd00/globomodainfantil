'use strict';

const jwt = require('jsonwebtoken');
const { db } = require('../db');

const SECRET = process.env.JWT_SECRET || 'globo-dev-secret-cambiame';
const EXPIRA = process.env.JWT_EXPIRA || '7d';

function firmarToken(usuario) {
  return jwt.sign({ id: usuario.id, rol: usuario.rol }, SECRET, { expiresIn: EXPIRA });
}

function leerToken(req) {
  const cabecera = req.headers.authorization || '';
  if (cabecera.startsWith('Bearer ')) return cabecera.slice(7).trim();
  return null;
}

/** Adjunta req.usuario si hay token válido. Nunca corta la petición. */
function opcional(req, _res, next) {
  const token = leerToken(req);
  if (!token) return next();
  try {
    const datos = jwt.verify(token, SECRET);
    const usuario = db
      .prepare('SELECT id, nombre, email, rol, telefono, direccion, ciudad, cp, provincia FROM usuarios WHERE id = ?')
      .get(datos.id);
    if (usuario) req.usuario = usuario;
  } catch (_) {
    /* token caducado o inválido: se ignora */
  }
  next();
}

/** Exige sesión iniciada. */
function requerido(req, res, next) {
  opcional(req, res, () => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    }
    next();
  });
}

/** Exige rol de administrador. */
function soloAdmin(req, res, next) {
  requerido(req, res, () => {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Necesitas permisos de administrador.' });
    }
    next();
  });
}

module.exports = { firmarToken, opcional, requerido, soloAdmin, SECRET };
