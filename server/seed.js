'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const { db } = require('./db');

const FORZAR = process.argv.includes('--force');
const DIR_IMG = path.join(__dirname, '..', 'public', 'img', 'productos');

/* Catálogo real, construido desde los catálogos de proveedor.
   Se regenera con: node server/construir-catalogo.js */
const CATALOGO = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogo-real.json'), 'utf8'));

/* ------------------------------- Paleta base ------------------------------ */

/* Pares [relleno, detalle]. Todo en pastel, con el detalle apenas un tono
   por debajo para que la prenda se lea sin oscurecer la ficha. */


/* -------------------------------- Categorías ------------------------------ */

const CATEGORIAS = [
  ['recien-nacido', 'Recién nacido', 'De 0 a 12 meses', 'Primeras puestas, peleles y canastilla. Algodón suave y cierres que no complican el cambio.', 1],
  ['bebe-nina', 'Bebé niña', 'De 1 a 36 meses', 'Vestidos, ranitas y conjuntos para los primeros años.', 2],
  ['bebe-nino', 'Bebé niño', 'De 1 a 36 meses', 'Peleles, conjuntos y bodies para el día a día.', 3],
  ['nina', 'Niña', 'De 3 a 14 años', 'Vestidos, faldas y punto para el colegio y para salir.', 4],
  ['nino', 'Niño', 'De 3 a 14 años', 'Camisas, bermudas y sudaderas que aguantan el recreo.', 5],
  ['ceremonia', 'Ceremonia', 'Bodas, bautizos y comuniones', 'Para las ocasiones que se quedan en la foto de toda la vida.', 6],
  ['complementos', 'Complementos', 'Todas las edades', 'Lazos, calcetines, gorros y mochilas.', 7]
];

const TALLAS = {
  recien: ['0M', '1M', '3M', '6M', '9M', '12M'],
  bebe: ['12M', '18M', '24M', '36M'],
  infantil: ['3A', '4A', '6A', '8A', '10A', '12A', '14A'],
  unica: ['Única']
};

/* --------------------------------- Catálogo ------------------------------- */
// [nombre, categoría, tipo de prenda, color, precio, precioAntes|null, descripción, composición, flags]



/* --------------------------------- Utilidades ----------------------------- */

function aSlug(t) {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}



function stockAzar() {
  return 2 + Math.floor(Math.random() * 18);
}

/* ---------------------------------- Carga --------------------------------- */

const yaHay = db.prepare('SELECT COUNT(*) AS n FROM productos').get().n;

if (yaHay > 0 && !FORZAR) {
  /* Comprobar si lo que hay en la base es el catálogo de este código o uno
     anterior: si no coincide, el aviso genérico dejaba al usuario mirando un
     catálogo viejo con las fotos rotas sin saber por qué. */
  const enBase = new Set(db.prepare('SELECT sku FROM productos').all().map((p) => p.sku));
  const enCodigo = CATALOGO.map((a) => a.sku);
  const comunes = enCodigo.filter((sku) => enBase.has(sku)).length;
  const coincide = comunes >= enCodigo.length * 0.8;

  if (coincide) {
    console.log(`\n  La base ya tiene ${yaHay} artículos, y coinciden con el catálogo actual.`);
    console.log('  No hay nada que cargar. Para vaciarla y volver a empezar: npm run reset\n');
  } else {
    console.log(`
  ATENCIÓN: la base de datos tiene ${yaHay} artículos que NO son los de este catálogo.

  Casi seguro vienen de una instalación anterior. Si abres la tienda ahora verás
  productos antiguos y las fotos aparecerán rotas, porque sus imágenes ya no existen.

  Para cargar el catálogo real (${enCodigo.length} artículos con sus fotos):

      npm run reset

  Ojo: eso borra también los pedidos y las cuentas de cliente que hubiera.
  Si tienes pedidos reales que conservar, haz antes una copia de data/globo.db.
`);
  }
  process.exit(0);
}

if (FORZAR) {
  db.exec(`DELETE FROM pedido_eventos; DELETE FROM pedido_lineas; DELETE FROM pedidos;
           DELETE FROM variantes; DELETE FROM productos; DELETE FROM categorias; DELETE FROM usuarios;
           DELETE FROM sqlite_sequence;`);
}

fs.mkdirSync(DIR_IMG, { recursive: true });

const cargar = db.transaction(() => {
  // Categorías
  const insCat = db.prepare('INSERT INTO categorias (slug, nombre, edad, descripcion, orden) VALUES (?, ?, ?, ?, ?)');
  for (const c of CATEGORIAS) insCat.run(...c);
  const catPorSlug = {};
  for (const c of db.prepare('SELECT id, slug FROM categorias').all()) catPorSlug[c.slug] = c.id;

  // Productos + variantes + imágenes
  const insProd = db.prepare(
    `INSERT INTO productos (sku, slug, nombre, descripcion, composicion, categoria_id, precio, precio_antes,
                            color, imagen, destacado, novedad, activo, creado_en)
     VALUES (@sku, @slug, @nombre, @descripcion, @composicion, @categoria_id, @precio, @precio_antes,
             @color, @imagen, @destacado, @novedad, 1, @creado_en)`
  );
  const insVar = db.prepare('INSERT INTO variantes (producto_id, talla, stock) VALUES (?, ?, ?)');

  const insImagen = db.prepare(
    `INSERT INTO producto_imagenes (producto_id, ruta, miniatura, alt, orden, principal)
     VALUES (?, ?, ?, ?, 0, 1)`
  );

  CATALOGO.forEach((art, i) => {
    const dias = Math.floor(Math.random() * 60);
    const ruta = `/img/productos/${art.archivo}`;
    const mini = `/img/productos/mini-${art.archivo}`;

    const info = insProd.run({
      sku: art.sku,
      slug: art.slug,
      nombre: art.nombre,
      descripcion: art.porRevisar
        ? 'Prenda de ceremonia. Pendiente de describir desde el panel de la tienda.'
        : `${art.nombre}. Consulta la guía de tallas si dudas entre dos.`,
      composicion: '',
      categoria_id: catPorSlug[art.categoria],
      precio: art.precio,
      precio_antes: null,
      color: '',
      imagen: ruta,
      destacado: art.destacado ? 1 : 0,
      novedad: art.novedad ? 1 : 0,
      creado_en: new Date(Date.now() - dias * 86400000).toISOString().slice(0, 19).replace('T', ' ')
    });

    insImagen.run(info.lastInsertRowid, ruta, mini, art.nombre);
    for (const talla of art.tallas) insVar.run(info.lastInsertRowid, talla, stockAzar());
  });

  // Usuarios
  const insUser = db.prepare(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, direccion, ciudad, cp, provincia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@modaglobo.es';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin1234';
  insUser.run('Tienda Globo', adminEmail, bcrypt.hashSync(adminPass, 10), 'admin', '626 34 70 20', 'Plaza Giles y Rubio', 'Écija', '41400', 'Sevilla');
  const clienteId = insUser.run(
    'Lucía Moreno', 'cliente@ejemplo.es', bcrypt.hashSync('cliente1234', 10), 'cliente',
    '600 111 222', 'Calle Emilio Castelar 18, 2ºB', 'Écija', '41400', 'Sevilla'
  ).lastInsertRowid;

  // Pedidos de ejemplo, para que el rastreo funcione desde el primer minuto
  const productos = db.prepare('SELECT * FROM productos LIMIT 8').all();
  const ejemplos = [
    { codigo: 'GLB-260714-8A21F3', estado: 'entregado', dias: 12, items: [0, 3], transportista: 'SEUR', ext: '7841200193' },
    { codigo: 'GLB-260802-C1D4E7', estado: 'enviado', dias: 4, items: [5, 6, 1], transportista: 'Correos Express', ext: 'CE99231144' },
    { codigo: 'GLB-260808-B72A09', estado: 'preparando', dias: 1, items: [2], transportista: null, ext: null }
  ];

  const insPedido = db.prepare(
    `INSERT INTO pedidos (codigo, usuario_id, email, nombre, telefono, direccion, ciudad, cp, provincia, pais,
                          metodo_pago, subtotal, envio, total, estado, transportista, seguimiento_ext, creado_en, actualizado_en)
     VALUES (@codigo, @usuario_id, @email, @nombre, @telefono, @direccion, @ciudad, @cp, @provincia, 'España',
             'tarjeta', @subtotal, @envio, @total, @estado, @transportista, @ext, @creado_en, @creado_en)`
  );
  const insLinea = db.prepare(
    `INSERT INTO pedido_lineas (pedido_id, producto_id, nombre, sku, imagen, talla, precio, cantidad)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insEvento = db.prepare('INSERT INTO pedido_eventos (pedido_id, estado, mensaje, creado_en) VALUES (?, ?, ?, ?)');

  const flujo = {
    preparando: ['pendiente', 'pagado', 'preparando'],
    enviado: ['pendiente', 'pagado', 'preparando', 'enviado'],
    entregado: ['pendiente', 'pagado', 'preparando', 'enviado', 'entregado']
  };
  const mensajes = {
    pendiente: 'Hemos recibido tu pedido. Te avisamos en cuanto confirmemos el pago.',
    pagado: 'Pago confirmado. Ya estás en la cola de preparación.',
    preparando: 'Estamos preparando el paquete en la tienda de Écija.',
    enviado: 'Tu paquete ha salido de la tienda.',
    entregado: 'Entregado. Si algo no encaja, tienes 30 días para cambiarlo.'
  };

  for (const e of ejemplos) {
    const lineas = e.items.map((i) => productos[i]);
    const subtotal = Math.round(lineas.reduce((s, p) => s + p.precio, 0) * 100) / 100;
    const envio = subtotal >= 49 ? 0 : 4.95;
    const creado = new Date(Date.now() - e.dias * 86400000);

    const pid = insPedido.run({
      codigo: e.codigo,
      usuario_id: clienteId,
      email: 'cliente@ejemplo.es',
      nombre: 'Lucía Moreno',
      telefono: '600 111 222',
      direccion: 'Calle Emilio Castelar 18, 2ºB',
      ciudad: 'Écija',
      cp: '41400',
      provincia: 'Sevilla',
      subtotal,
      envio,
      total: Math.round((subtotal + envio) * 100) / 100,
      estado: e.estado,
      transportista: e.transportista,
      ext: e.ext,
      creado_en: creado.toISOString().slice(0, 19).replace('T', ' ')
    }).lastInsertRowid;

    for (const p of lineas) {
      const talla = db.prepare('SELECT talla FROM variantes WHERE producto_id = ? LIMIT 1').get(p.id).talla;
      insLinea.run(pid, p.id, p.nombre, p.sku, p.imagen, talla, p.precio, 1);
    }

    flujo[e.estado].forEach((estado, k) => {
      const fecha = new Date(creado.getTime() + k * 20 * 3600000);
      insEvento.run(pid, estado, mensajes[estado], fecha.toISOString().slice(0, 19).replace('T', ' '));
    });
  }

  return { adminEmail, adminPass };
});

const { adminEmail, adminPass } = cargar();

console.log(`
  Catálogo cargado.

  Artículos      ${db.prepare('SELECT COUNT(*) AS n FROM productos').get().n} (catálogo real con fotos)
  Categorías     ${CATEGORIAS.length}
  Pedidos demo   ${db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n}

  Administración   ${adminEmail} / ${adminPass}
  Cliente de prueba cliente@ejemplo.es / cliente1234

  Arranca con: npm start
`);
