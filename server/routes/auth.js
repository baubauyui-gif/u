import { Router } from 'express';
import { get, run } from '../db.js';
import {
  bad,
  fail,
  isValidEmail,
  notify,
  nowIso,
  selfUser,
  text,
  uid,
  HttpError,
} from '../lib.js';
import {
  assertRateLimit,
  clearSessionCookie,
  createResetToken,
  createSession,
  destroySession,
  destroyUserSessions,
  hashPassword,
  optionalAuth,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { mailConfigured, sendPasswordReset } from '../mail.js';

const router = Router();

function ageFrom(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
  const birth = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

router.post('/register', (req, res) => {
  assertRateLimit('register', req.ip || 'anon', 12, 60 * 1000);
  const settings = get("SELECT value FROM settings WHERE key = 'registrations_open'");
  if (settings && settings.value === 'false') fail(403, 'El registro está cerrado temporalmente.');

  const firstName = text(req.body.firstName, { name: 'El nombre', max: 60 });
  const lastName = text(req.body.lastName, { name: 'El apellido', max: 60 });
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) bad('Ingresá un email válido.');
  const password = String(req.body.password || '');
  if (password.length < 8) bad('La contraseña debe tener al menos 8 caracteres.');
  if (password.length > 200) bad('La contraseña es demasiado larga.');
  if (password !== String(req.body.passwordConfirm || '')) bad('Las contraseñas no coinciden.');
  const age = ageFrom(req.body.birthDate);
  if (age === null) bad('Ingresá una fecha de nacimiento válida.');
  if (age < 18) bad('CHANGAPP es solo para personas mayores de 18 años.');
  if (age > 110) bad('Revisá la fecha de nacimiento ingresada.');
  if (req.body.acceptTerms !== true) bad('Tenés que aceptar los términos y condiciones.');
  if (req.body.acceptPrivacy !== true) bad('Tenés que aceptar la política de privacidad.');

  const existing = get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) fail(409, 'Ya existe una cuenta con ese email. Probá iniciar sesión.');

  const id = uid();
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const role = adminEmail && adminEmail === email ? 'admin' : 'user';
  const timestamp = nowIso();
  run(
    `INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, birth_date, avatar, bio,
      province_id, province_name, locality_id, locality_name, lat, lng, location_mode, created_at, updated_at,
      notify_messages, notify_applications, notify_jobs, public_profile)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,1)`,
    [id, firstName, lastName, email, hashPassword(password), role, 'active', req.body.birthDate, null, null,
      null, null, null, null, null, null, null, timestamp, timestamp],
  );
  const token = createSession(id);
  setSessionCookie(res, req, token);
  notify(id, {
    type: 'cuenta',
    title: '¡Bienvenido a CHANGAPP!',
    body: 'Configurá tu ubicación para ver las changas cerca tuyo.',
    link: '/ubicacion',
    force: true,
  });
  res.status(201).json({ user: selfUser(get('SELECT * FROM users WHERE id = ?', [id])), token });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  assertRateLimit('login', `${req.ip || 'anon'}:${email}`, 15, 60 * 1000);
  if (!isValidEmail(email)) bad('Ingresá un email válido.');
  const password = String(req.body.password || '');
  if (!password) bad('Ingresá tu contraseña.');
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    fail(401, 'Email o contraseña incorrectos.');
  }
  if (user.status !== 'active') {
    fail(403, user.suspended_reason || 'Tu cuenta está suspendida. Contactá al soporte.');
  }
  const token = createSession(user.id);
  setSessionCookie(res, req, token);
  res.json({ user: selfUser(user), token });
});

router.post('/logout', optionalAuth, (req, res) => {
  destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ user: null });
  const unreadNotifications = get(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [req.user.id],
  );
  const unreadMessages = get(
    `SELECT COUNT(*) AS n FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.sender_id != ? AND m.read_at IS NULL AND (c.owner_id = ? OR c.applicant_id = ?)`,
    [req.user.id, req.user.id, req.user.id],
  );
  res.json({
    user: selfUser(req.user),
    unread: {
      notifications: Number(unreadNotifications?.n || 0),
      messages: Number(unreadMessages?.n || 0),
    },
  });
});

router.post('/forgot-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  assertRateLimit('forgot', `${req.ip || 'anon'}:${email}`, 6, 60 * 1000);
  if (!isValidEmail(email)) bad('Ingresá un email válido.');
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  let delivered = false;
  if (user) {
    const token = createResetToken(user.id);
    const base = `${req.protocol}://${req.get('host')}`;
    const link = `${base}/restablecer?token=${token}`;
    delivered = mailConfigured() ? awaitPromiseSafe(sendPasswordReset(user.email, link)) : false;
    if (!delivered) {
      console.log(`[auth] enlace de recuperación para ${email}: ${link}`);
    }
  }
  res.json({
    ok: true,
    message:
      'Si el email está registrado, generamos un enlace para restablecer tu contraseña. El enlace vence en 1 hora.',
    emailSent: delivered,
    mailConfigured: mailConfigured(),
  });
});

// pequeño helper para no romper el handler sincrónico si el envío falla
function awaitPromiseSafe(promise) {
  promise.catch((err) => console.error('[mail] fallo de envío:', err.message));
  return false;
}

router.post('/reset-password', (req, res) => {
  assertRateLimit('reset', req.ip || 'anon', 12, 60 * 1000);
  const token = String(req.body.token || '').trim();
  if (!token) bad('El enlace no es válido.');
  const password = String(req.body.password || '');
  if (password.length < 8) bad('La contraseña debe tener al menos 8 caracteres.');
  if (password !== String(req.body.passwordConfirm || '')) bad('Las contraseñas no coinciden.');
  const reset = get('SELECT * FROM password_resets WHERE token = ?', [token]);
  if (!reset || reset.used_at) bad('El enlace ya fue utilizado o no es válido.');
  if (new Date(reset.expires_at).getTime() < Date.now()) bad('El enlace venció. Pedí uno nuevo.');
  const user = get('SELECT * FROM users WHERE id = ?', [reset.user_id]);
  if (!user) bad('El enlace no es válido.');
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(password), nowIso(), user.id]);
  run('UPDATE password_resets SET used_at = ? WHERE token = ?', [nowIso(), token]);
  destroyUserSessions(user.id);
  notify(user.id, {
    type: 'cuenta',
    title: 'Tu contraseña fue actualizada',
    body: 'Se cerraron las sesiones abiertas por seguridad.',
    link: '/perfil',
    force: true,
  });
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (!verifyPassword(current, req.user.password_hash)) throw new HttpError(400, 'La contraseña actual no es correcta.');
  if (next.length < 8) bad('La nueva contraseña debe tener al menos 8 caracteres.');
  if (next !== String(req.body.newPasswordConfirm || '')) bad('Las contraseñas no coinciden.');
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(next), nowIso(), req.user.id]);
  destroyUserSessions(req.user.id, req.sessionToken);
  notify(req.user.id, {
    type: 'cuenta',
    title: 'Contraseña actualizada',
    body: 'Cerramos las demás sesiones por seguridad.',
    link: '/perfil',
    force: true,
  });
  res.json({ ok: true });
});

export default router;
