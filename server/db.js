'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'globo.db');

/* -------------------------------------------------------------------------
   Motor de base de datos
   -------------------------------------------------------------------------
   Se intenta usar better-sqlite3, que es algo más rápido y está muy probado.
   Si no está instalado (compila código nativo y no todas las máquinas tienen
   las herramientas de compilación), se recurre al módulo `node:sqlite` que
   Node 22 trae de serie. La API que consume el resto del proyecto es idéntica
   en ambos casos, así que ningún otro fichero se entera del cambio.
   ------------------------------------------------------------------------- */

let db;
let MOTOR;

try {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  MOTOR = 'better-sqlite3';
} catch (_) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (__) {
    console.error(
      '\n  No hay ningún motor SQLite disponible.\n' +
        '  Opciones:\n' +
        '   1. Actualiza a Node.js 22 o superior, que incluye SQLite de serie.\n' +
        '   2. Instala las herramientas de compilación y ejecuta: npm install better-sqlite3\n' +
        '      (Debian/Ubuntu: sudo apt install build-essential python3)\n'
    );
    process.exit(1);
  }
  const nativa = new DatabaseSync(DB_PATH);
  nativa.exec('PRAGMA journal_mode = WAL');
  nativa.exec('PRAGMA foreign_keys = ON');

  db = {
    exec: (sql) => nativa.exec(sql),

    prepare(sql) {
      const sentencia = nativa.prepare(sql);
      return {
        get: (...args) => sentencia.get(...args) ?? undefined,
        all: (...args) => sentencia.all(...args),
        run: (...args) => {
          const r = sentencia.run(...args);
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        }
      };
    },

    /* better-sqlite3 devuelve una función que envuelve la transacción; se replica. */
    transaction(fn) {
      return (...args) => {
        nativa.exec('BEGIN');
        try {
          const resultado = fn(...args);
          nativa.exec('COMMIT');
          return resultado;
        } catch (error) {
          try {
            nativa.exec('ROLLBACK');
          } catch (_) {
            /* la transacción ya se había deshecho */
          }
          throw error;
        }
      };
    },

    pragma: (texto) => nativa.exec(`PRAGMA ${texto}`)
  };

  MOTOR = 'node:sqlite';
}

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente','admin')),
  telefono      TEXT,
  direccion     TEXT,
  ciudad        TEXT,
  cp            TEXT,
  provincia     TEXT,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  slug      TEXT NOT NULL UNIQUE,
  nombre    TEXT NOT NULL,
  edad      TEXT,
  descripcion TEXT,
  orden     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sku           TEXT NOT NULL UNIQUE,
  slug          TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  composicion   TEXT,
  categoria_id  INTEGER NOT NULL REFERENCES categorias(id),
  precio        REAL NOT NULL,
  precio_antes  REAL,
  color         TEXT,
  imagen        TEXT,
  destacado     INTEGER NOT NULL DEFAULT 0,
  novedad       INTEGER NOT NULL DEFAULT 0,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS variantes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  talla       TEXT NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (producto_id, talla)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo         TEXT NOT NULL UNIQUE,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  telefono       TEXT,
  direccion      TEXT NOT NULL,
  ciudad         TEXT NOT NULL,
  cp             TEXT NOT NULL,
  provincia      TEXT NOT NULL,
  pais           TEXT NOT NULL DEFAULT 'España',
  notas          TEXT,
  metodo_pago    TEXT NOT NULL DEFAULT 'tarjeta',
  metodo_envio   TEXT NOT NULL DEFAULT 'domicilio',
  pago_ref       TEXT,
  pago_proveedor TEXT,
  subtotal       REAL NOT NULL,
  envio          REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente',
  transportista  TEXT,
  seguimiento_ext TEXT,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedido_lineas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id    INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id  INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre       TEXT NOT NULL,
  sku          TEXT,
  imagen       TEXT,
  talla        TEXT NOT NULL,
  precio       REAL NOT NULL,
  cantidad     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pedido_eventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  estado     TEXT NOT NULL,
  mensaje    TEXT,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ---- Galería de imágenes por artículo ---- */
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  ruta         TEXT NOT NULL,
  miniatura    TEXT,
  alt          TEXT,
  orden        INTEGER NOT NULL DEFAULT 0,
  principal    INTEGER NOT NULL DEFAULT 0,
  creada_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ---- Trazabilidad de pagos ----
   Cada aviso de la pasarela se registra por su identificador. Si llega dos
   veces (las pasarelas reintentan), la segunda se descarta sin efecto. */
CREATE TABLE IF NOT EXISTS pagos_procesados (
  evento_id TEXT PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo      TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ---- Cupones de descuento ----
   Un cupón es un código (p. ej. BIENVENIDA10) que aplica un % de descuento.
   solo_precio_normal = 1 significa que el descuento NO cuenta las prendas
   que ya están rebajadas (las que tienen precio_antes). usos_por_cliente
   limita cuántas veces puede usarlo un mismo correo (1 = cupón de bienvenida).
   caduca_en en NULL = no caduca. activo = 0 lo apaga sin borrarlo. */
CREATE TABLE IF NOT EXISTS cupones (
  codigo             TEXT PRIMARY KEY,
  descripcion        TEXT,
  tipo               TEXT NOT NULL DEFAULT 'porcentaje',
  valor              REAL NOT NULL,
  solo_precio_normal INTEGER NOT NULL DEFAULT 1,
  usos_por_cliente   INTEGER NOT NULL DEFAULT 1,
  minimo             REAL NOT NULL DEFAULT 0,
  activo             INTEGER NOT NULL DEFAULT 1,
  caduca_en          TEXT,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Cada uso de un cupón queda registrado para poder limitarlo por cliente. */
CREATE TABLE IF NOT EXISTS cupones_usados (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo     TEXT NOT NULL REFERENCES cupones(codigo) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  pedido_id  INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
  usado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_cupones_usados ON cupones_usados(codigo, email);
CREATE INDEX IF NOT EXISTS idx_pedidos_pago ON pedidos(pago_ref);
CREATE INDEX IF NOT EXISTS idx_imagenes_producto ON producto_imagenes(producto_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_lineas_pedido ON pedido_lineas(pedido_id);
CREATE INDEX IF NOT EXISTS idx_eventos_pedido ON pedido_eventos(pedido_id);
`);

/**
 * Añade una columna si todavía no existe.
 * CREATE TABLE IF NOT EXISTS no toca las tablas ya creadas, así que sin esto
 * una instalación anterior se quedaría sin las columnas nuevas al actualizar.
 */
function asegurarColumna(tabla, columna, definicion) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all();
  if (!columnas.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

asegurarColumna('pedidos', 'pago_proveedor', 'TEXT');
asegurarColumna('pedidos', 'pago_ref', 'TEXT');
asegurarColumna('pedidos', 'pagado_en', 'TEXT');
asegurarColumna('categorias', 'edad', 'TEXT');
asegurarColumna('pedidos', 'metodo_envio', "TEXT NOT NULL DEFAULT 'domicilio'");
asegurarColumna('pedidos', 'descuento', 'REAL NOT NULL DEFAULT 0');
asegurarColumna('pedidos', 'cupon', 'TEXT');
/* IP desde la que se usó el cupón, para limitar el farmeo del 10 % aunque se
   cambie de correo en cada pedido (los correos son infinitos; las IP no). */
asegurarColumna('cupones_usados', 'ip', 'TEXT');

/* Cupón de bienvenida del club: 10 % en la primera compra, un uso por cliente
   y solo sobre prendas a precio normal. INSERT OR IGNORE = si ya existe (o si
   la clienta lo edita a mano más adelante), esto no lo pisa. */
db.prepare(
  `INSERT OR IGNORE INTO cupones (codigo, descripcion, tipo, valor, solo_precio_normal, usos_por_cliente, minimo, activo)
   VALUES ('BIENVENIDA10', 'Bienvenida al club: 10 % en tu primera compra', 'porcentaje', 10, 1, 1, 0, 1)`
).run();

/** Estados del ciclo de vida de un pedido, en orden. */
const ESTADOS = ['pendiente', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado'];

const ESTADOS_TEXTO = {
  pendiente: 'Pedido recibido',
  pagado: 'Pago confirmado',
  preparando: 'Preparando el paquete',
  enviado: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

module.exports = { db, ESTADOS, ESTADOS_TEXTO, DB_PATH, MOTOR };
