'use strict';

/**
 * Diagnóstico y reparación del acceso a la trastienda.
 *
 *   npm run admin                              ver el estado de las cuentas
 *   npm run admin -- --reset                   restablecer la contraseña del admin
 *   npm run admin -- --email x@y.es --password miClave
 *   npm run admin -- --promover cliente@x.es   convertir una cuenta en administrador
 *
 * Existe porque, si se pierde la contraseña o la base viene de una versión
 * anterior con otro correo, no hay forma de entrar desde el navegador.
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { db, MOTOR, DB_PATH } = require('./db');

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : null;
};
const tiene = (nombre) => args.includes(`--${nombre}`);

const usuarios = db.prepare('SELECT id, nombre, email, rol, creado_en FROM usuarios ORDER BY id').all();
const admins = usuarios.filter((u) => u.rol === 'admin');

console.log(`\n  Base de datos : ${DB_PATH}`);
console.log(`  Motor         : ${MOTOR}`);
console.log(`  Cuentas       : ${usuarios.length} (${admins.length} de administración)\n`);

if (!usuarios.length) {
  console.log('  La base está vacía. Ejecuta primero:  npm run seed\n');
  process.exit(0);
}

/* ------------------------------ Promover ---------------------------------- */

const promover = opcion('promover');
if (promover) {
  const u = db.prepare('SELECT * FROM usuarios WHERE LOWER(email) = ?').get(promover.toLowerCase());
  if (!u) {
    console.log(`  No hay ninguna cuenta con el correo ${promover}.\n`);
    process.exit(1);
  }
  db.prepare("UPDATE usuarios SET rol = 'admin' WHERE id = ?").run(u.id);
  console.log(`  ${u.email} ya es administrador. Entra en /admin con su contraseña de siempre.\n`);
  process.exit(0);
}

/* --------------------------- Crear o restablecer -------------------------- */

const email = (opcion('email') || '').trim().toLowerCase();
const password = opcion('password');

if (tiene('reset') || email || password) {
  const destino = email || admins[0]?.email;
  if (!destino) {
    console.log('  No hay ninguna cuenta de administración. Crea una así:');
    console.log('    npm run admin -- --email tu@correo.es --password TuClaveSegura\n');
    process.exit(1);
  }

  const clave = password || 'admin1234';
  if (clave.length < 6) {
    console.log('  La contraseña necesita al menos 6 caracteres.\n');
    process.exit(1);
  }

  const existente = db.prepare('SELECT * FROM usuarios WHERE LOWER(email) = ?').get(destino);
  const hash = bcrypt.hashSync(clave, 10);

  if (existente) {
    db.prepare("UPDATE usuarios SET password_hash = ?, rol = 'admin' WHERE id = ?").run(hash, existente.id);
    console.log(`  Contraseña restablecida para ${destino}.`);
  } else {
    db.prepare(
      `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')`
    ).run('Administración', destino, hash);
    console.log(`  Cuenta de administración creada: ${destino}`);
  }

  console.log(`  Contraseña    : ${clave}`);
  console.log(`  Entra en      : http://localhost:${process.env.PORT || 3000}/admin\n`);
  if (clave === 'admin1234') {
    console.log('  Cámbiala desde Mi cuenta antes de publicar la tienda.\n');
  }
  process.exit(0);
}

/* --------------------------------- Estado --------------------------------- */

console.log('  CUENTAS DE ADMINISTRACIÓN');
if (admins.length) {
  for (const a of admins) console.log(`    ${a.email}  ·  ${a.nombre}  ·  alta ${a.creado_en}`);
} else {
  console.log('    ninguna');
}

const clientes = usuarios.filter((u) => u.rol === 'cliente');
if (clientes.length) {
  console.log('\n  CUENTAS DE CLIENTE');
  for (const c of clientes.slice(0, 8)) console.log(`    ${c.email}`);
  if (clientes.length > 8) console.log(`    …y ${clientes.length - 8} más`);
}

/* Aviso si la base viene de una versión anterior del proyecto. */
const antiguos = usuarios.filter((u) => /caracola/i.test(u.email));
if (antiguos.length) {
  console.log('\n  AVISO: hay cuentas de una versión anterior del proyecto:');
  for (const a of antiguos) console.log(`    ${a.email} (${a.rol})`);
  console.log('  Si no puedes entrar, esas son probablemente tus credenciales antiguas.');
}

console.log(`
  ¿No puedes entrar? Prueba en este orden:

    1. Restablecer la contraseña de la cuenta que ya existe:
         npm run admin -- --reset

    2. Crear una cuenta nueva con tus propios datos:
         npm run admin -- --email tu@correo.es --password TuClaveSegura

    3. Convertir en administrador una cuenta de cliente que ya uses:
         npm run admin -- --promover cliente@ejemplo.es

  Y en el navegador, si la pantalla se queda en blanco o no reacciona,
  borra los datos del sitio (F12 → Aplicación → Almacenamiento local) y
  vuelve a entrar: un token de una instalación anterior puede quedarse
  guardado y confundir a la página.
`);
