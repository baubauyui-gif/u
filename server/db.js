import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.CHANGAPP_DATA_DIR || path.join(__dirname, '..', 'data');
export const DB_PATH = process.env.CHANGAPP_DB_PATH || path.join(DATA_DIR, 'changapp.sqlite');

let db = null;
let flushTimer = null;
let ready = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  birth_date TEXT,
  avatar TEXT,
  bio TEXT,
  province_id TEXT,
  province_name TEXT,
  locality_id TEXT,
  locality_name TEXT,
  lat REAL,
  lng REAL,
  location_mode TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  suspended_reason TEXT,
  notify_messages INTEGER NOT NULL DEFAULT 1,
  notify_applications INTEGER NOT NULL DEFAULT 1,
  notify_jobs INTEGER NOT NULL DEFAULT 1,
  public_profile INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS localities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province_id TEXT NOT NULL,
  province_name TEXT NOT NULL,
  lat REAL,
  lng REAL
);
CREATE INDEX IF NOT EXISTS idx_localities_province ON localities(province_id);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL,
  province_name TEXT NOT NULL,
  locality_name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  work_date TEXT,
  work_time TEXT,
  duration TEXT,
  pay_total INTEGER NOT NULL,
  pay_type TEXT NOT NULL DEFAULT 'fijo',
  extra_info TEXT,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  worker_id TEXT,
  accepted_application_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paused_at TEXT,
  closed_at TEXT,
  completed_at TEXT,
  cancelled_by TEXT,
  cancel_reason TEXT,
  owner_confirmed_at TEXT,
  worker_confirmed_at TEXT,
  has_dispute INTEGER NOT NULL DEFAULT 0,
  dispute_note TEXT,
  deleted_at TEXT,
  admin_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_owner ON jobs(owner_id);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  message TEXT NOT NULL,
  offered_price INTEGER,
  availability TEXT,
  extra_info TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, applicant_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications(applicant_id);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT,
  UNIQUE(job_id, applicant_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(job_id, author_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_user_id TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'abierto',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_note TEXT
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS job_status_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_job ON job_status_history(job_id);
CREATE TABLE IF NOT EXISTS admin_activity (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
`;

const CATEGORIES = [
  ['limpieza', 'Limpieza', 'Sparkles'],
  ['construccion', 'Construcción', 'HardHat'],
  ['jardineria', 'Jardinería', 'Shovel'],
  ['mudanzas', 'Mudanzas', 'Truck'],
  ['mascotas', 'Mascotas', 'PawPrint'],
  ['reparaciones', 'Reparaciones', 'Wrench'],
  ['eventos', 'Eventos', 'PartyPopper'],
  ['mandados', 'Mandados', 'ShoppingBag'],
  ['clases', 'Clases', 'GraduationCap'],
  ['otros', 'Otros', 'LayoutGrid'],
];

const DEFAULT_SETTINGS = {
  app_name: 'CHANGAPP',
  slogan: 'Conectamos personas con oportunidades.',
  support_email: 'soporte@changapp.com.ar',
  min_age: '18',
  registrations_open: 'true',
  welcome_title: 'Encontrá changas cerca tuyo',
  welcome_subtitle: 'Descubrí oportunidades y trabajos disponibles en tu zona.',
};

function exportBytes() {
  return Buffer.from(db.export());
}

export function persistNow() {
  if (!db) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, exportBytes());
  fs.renameSync(tmp, DB_PATH);
}

export function persistSoon() {
  if (!db || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      persistNow();
    } catch (err) {
      console.error('[db] no se pudo guardar la base:', err.message);
    }
  }, 15);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export function get(sql, params = []) {
  return all(sql, params)[0];
}

export function run(sql, params = []) {
  db.run(sql, params);
  persistSoon();
}

export function tx(fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    persistSoon();
    return result;
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function seed() {
  const now = new Date().toISOString();
  const catCount = get('SELECT COUNT(*) AS n FROM categories');
  if (!catCount || Number(catCount.n) === 0) {
    CATEGORIES.forEach(([id, name, icon], index) => {
      db.run('INSERT INTO categories (id, name, icon, sort, active, created_at) VALUES (?,?,?,?,1,?)', [
        id,
        name,
        icon,
        index,
        now,
      ]);
    });
  }
  const setCount = get('SELECT COUNT(*) AS n FROM settings');
  if (!setCount || Number(setCount.n) === 0) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      db.run('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)', [key, value, now]);
    }
  }
  const locCount = get('SELECT COUNT(*) AS n FROM localities');
  if (!locCount || Number(locCount.n) === 0) {
    const file = path.join(__dirname, 'data', 'localidades.json');
    if (fs.existsSync(file)) {
      const localities = JSON.parse(fs.readFileSync(file, 'utf8'));
      db.run('BEGIN');
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO localities (id, name, province_id, province_name, lat, lng) VALUES (?,?,?,?,?,?)',
      );
      for (const l of localities) {
        stmt.run([l.id, l.name, l.provinceId, l.provinceName, l.lat, l.lng]);
      }
      stmt.free();
      db.run('COMMIT');
      console.log(`[db] ${localities.length} localidades oficiales cargadas`);
    } else {
      console.warn('[db] falta server/data/localidades.json');
    }
  }
}

export function initDb() {
  if (ready) return ready;
  ready = (async () => {
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
    });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    let buffer = null;
    try {
      buffer = fs.readFileSync(DB_PATH);
    } catch {
      buffer = null;
    }
    db = buffer && buffer.length ? new SQL.Database(buffer) : new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    db.exec(SCHEMA);
    seed();
    persistNow();
    process.on('exit', () => {
      try {
        persistNow();
      } catch {
        /* ignore */
      }
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        try {
          persistNow();
        } catch {
          /* ignore */
        }
        process.exit(0);
      });
    }
    return db;
  })();
  return ready;
}

export function dbStats() {
  return {
    path: DB_PATH,
    size: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0,
  };
}
