'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { firmarToken, requerido } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function publico(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    telefono: u.telefono || '',
    direccion: u.direccion || '',
    ciudad: u.ciudad || '',
    cp: u.cp || '',
    provincia: u.provincia || ''
  };
}

// POST /api/auth/registro
router.post('/registro', (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (nombre.length < 2) return res.status(400).json({ error: 'Escribe tu nombre completo.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Ese correo no tiene un formato válido.' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña necesita al menos 6 caracteres.' });

  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) return res.status(409).json({ error: 'Ya hay una cuenta con ese correo. Inicia sesión.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, direccion, ciudad, cp, provincia)
       VALUES (?, ?, ?, 'cliente', ?, ?, ?, ?, ?)`
    )
    .run(
      nombre,
      email,
      hash,
      String(req.body.telefono || '').trim(),
      String(req.body.direccion || '').trim(),
      String(req.body.ciudad || '').trim(),
      String(req.body.cp || '').trim(),
      String(req.body.provincia || '').trim()
    );

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: firmarToken(usuario), usuario: publico(usuario) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
    return res.status(401).json({ error: 'El correo o la contraseña no coinciden.' });
  }
  res.json({ token: firmarToken(usuario), usuario: publico(usuario) });
});

// GET /api/auth/yo
router.get('/yo', requerido, (req, res) => {
  res.json({ usuario: publico(req.usuario) });
});

// PUT /api/auth/yo  — actualizar datos de envío del cliente
router.put('/yo', requerido, (req, res) => {
  const campos = ['nombre', 'telefono', 'direccion', 'ciudad', 'cp', 'provincia'];
  const valores = campos.map((c) => String(req.body[c] ?? req.usuario[c] ?? '').trim());
  if (valores[0].length < 2) return res.status(400).json({ error: 'Escribe tu nombre completo.' });

  db.prepare(
    `UPDATE usuarios SET nombre = ?, telefono = ?, direccion = ?, ciudad = ?, cp = ?, provincia = ? WHERE id = ?`
  ).run(...valores, req.usuario.id);

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  res.json({ usuario: publico(usuario) });
});

// PUT /api/auth/password
router.put('/password', requerido, (req, res) => {
  const actual = String(req.body.actual || '');
  const nueva = String(req.body.nueva || '');
  if (nueva.length < 6) return res.status(400).json({ error: 'La contraseña nueva necesita al menos 6 caracteres.' });

  const fila = db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!bcrypt.compareSync(actual, fila.password_hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
  }
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(nueva, 10), req.usuario.id);
  res.json({ ok: true });
});

module.exports = router;
