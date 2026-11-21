import crypto from 'node:crypto';
import { get, run } from './db.js';
import { HttpError, nowIso, uid, forbidden, fail } from './lib.js';

export const SESSION_COOKIE = 'changapp_session';
const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored || '').split(':');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)', [token, userId, nowIso(), expires]);
  return token;
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', [token]);
}

export function destroyUserSessions(userId, exceptToken = null) {
  if (exceptToken) {
    run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [userId, exceptToken]);
  } else {
    run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  }
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    if (!key) return;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export function tokenFromRequest(req) {
  const auth = req.headers?.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return parseCookies(req)[SESSION_COOKIE] || null;
}

export function sessionUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const session = get('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE token = ?', [token]);
    return null;
  }
  const user = get('SELECT * FROM users WHERE id = ?', [session.user_id]);
  if (!user) return null;
  return { user, token };
}

export function setSessionCookie(res, req, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function optionalAuth(req, _res, next) {
  const found = sessionUser(req);
  req.user = found?.user || null;
  req.sessionToken = found?.token || null;
  next();
}

export function requireAuth(req, _res, next) {
  const found = sessionUser(req);
  if (!found) return next(new HttpError(401, 'Necesitás iniciar sesión para continuar.'));
  if (found.user.status !== 'active') {
    return next(new HttpError(403, found.user.suspended_reason || 'Tu cuenta está suspendida. Contactá al soporte.'));
  }
  req.user = found.user;
  req.sessionToken = found.token;
  next();
}

export function requireAdmin(req, _res, next) {
  requireAuth(req, _res, (err) => {
    if (err) return next(err);
    if (req.user.role !== 'admin') return next(forbidden('Esta sección es solo para administradores.'));
    next();
  });
}

export function ensureAdminFromEnv() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return;
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (user && user.role !== 'admin') {
    run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', ['admin', nowIso(), user.id]);
    console.log(`[auth] ${email} promovido a administrador`);
  }
}

export function createResetToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  run('INSERT INTO password_resets (token, user_id, created_at, expires_at, used_at) VALUES (?,?,?,?,NULL)', [
    token,
    userId,
    nowIso(),
    expires,
  ]);
  return token;
}

export function assertRateLimit(bucket, key, max, windowMs) {
  const store = globalThis.__changappRate || (globalThis.__changappRate = new Map());
  const id = `${bucket}:${key}`;
  const now = Date.now();
  const entry = store.get(id);
  if (!entry || entry.reset < now) {
    store.set(id, { count: 1, reset: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max) fail(429, 'Demasiados intentos. Esperá unos minutos y volvé a intentar.');
}

export function newId() {
  return uid();
}
