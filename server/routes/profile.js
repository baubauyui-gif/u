import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  bad,
  forbidden,
  hashless,
  int,
  isBlockedBetween,
  localityByNames,
  notFound,
  nowIso,
  optionalText,
  publicUser,
  ratingFor,
  selfUser,
  serializeApplication,
  serializeJob,
  text,
  uid,
  validateImage,
} from '../lib.js';

const router = Router();

function statsFor(userId) {
  const activePublications = get(
    "SELECT COUNT(*) AS n FROM jobs WHERE owner_id = ? AND status IN ('activa','en_seleccion') AND deleted_at IS NULL",
    [userId],
  );
  const pendingApplications = get("SELECT COUNT(*) AS n FROM applications WHERE applicant_id = ? AND status = 'pendiente'", [
    userId,
  ]);
  const pendingProposals = get(
    "SELECT COUNT(*) AS n FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.owner_id = ? AND a.status = 'pendiente'",
    [userId],
  );
  const unreadNotifications = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
  const unreadMessages = get(
    `SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE (c.owner_id = ? OR c.applicant_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`,
    [userId, userId, userId],
  );
  const completed = get(
    "SELECT COUNT(*) AS n FROM jobs WHERE (owner_id = ? OR worker_id = ?) AND status = 'completada' AND deleted_at IS NULL",
    [userId, userId],
  );
  const inProgress = get(
    "SELECT COUNT(*) AS n FROM jobs WHERE (owner_id = ? OR worker_id = ?) AND status IN ('trabajador_seleccionado','en_curso','pendiente_confirmacion') AND deleted_at IS NULL",
    [userId, userId],
  );
  return {
    activePublications: Number(activePublications?.n || 0),
    pendingApplications: Number(pendingApplications?.n || 0),
    pendingProposals: Number(pendingProposals?.n || 0),
    unreadNotifications: Number(unreadNotifications?.n || 0),
    unreadMessages: Number(unreadMessages?.n || 0),
    completedJobs: Number(completed?.n || 0),
    inProgressJobs: Number(inProgress?.n || 0),
  };
}

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: selfUser(req.user), stats: statsFor(req.user.id) });
});

router.patch('/me', requireAuth, (req, res) => {
  const updates = [];
  const params = [];
  const setField = (field, value) => {
    updates.push(`${field} = ?`);
    params.push(value);
  };
  if (req.body.firstName !== undefined) setField('first_name', text(req.body.firstName, { name: 'El nombre', min: 2, max: 60 }));
  if (req.body.lastName !== undefined) setField('last_name', text(req.body.lastName, { name: 'El apellido', min: 2, max: 60 }));
  if (req.body.bio !== undefined) setField('bio', optionalText(req.body.bio, { name: 'La presentación', max: 600 }));
  if (req.body.avatar !== undefined) setField('avatar', validateImage(req.body.avatar));
  if (req.body.publicProfile !== undefined) setField('public_profile', req.body.publicProfile ? 1 : 0);
  if (req.body.notifications && typeof req.body.notifications === 'object') {
    if (req.body.notifications.messages !== undefined) setField('notify_messages', req.body.notifications.messages ? 1 : 0);
    if (req.body.notifications.applications !== undefined) setField('notify_applications', req.body.notifications.applications ? 1 : 0);
    if (req.body.notifications.jobs !== undefined) setField('notify_jobs', req.body.notifications.jobs ? 1 : 0);
  }
  if (!updates.length) bad('No enviaste cambios para guardar.');
  setField('updated_at', nowIso());
  run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...params, req.user.id]);
  res.json({ user: selfUser(get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});

router.patch('/me/location', requireAuth, (req, res) => {
  const mode = String(req.body.mode || 'manual');
  if (!['manual', 'gps'].includes(mode)) bad('El modo de ubicación no es válido.');
  let provinceId = null;
  let provinceName = null;
  let localityId = null;
  let localityName = null;
  let lat = null;
  let lng = null;

  if (mode === 'manual') {
    const locality = get('SELECT * FROM localities WHERE id = ?', [String(req.body.localityId || '')]);
    if (!locality) bad('Elegí una localidad válida de la lista.');
    provinceId = locality.province_id;
    provinceName = locality.province_name;
    localityId = locality.id;
    localityName = locality.name;
    lat = locality.lat;
    lng = locality.lng;
  } else {
    lat = Number(req.body.lat);
    lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      bad('No pudimos obtener tu ubicación. Probá elegirla manualmente.');
    }
    const localityIdBody = String(req.body.localityId || '').trim();
    let locality = localityIdBody ? get('SELECT * FROM localities WHERE id = ?', [localityIdBody]) : null;
    if (!locality) {
      const nearest = require('../lib.js').nearestLocality(lat, lng);
      locality = nearest ? get('SELECT * FROM localities WHERE id = ?', [nearest.id]) : null;
    }
    if (!locality) bad('No pudimos determinar tu localidad. Elegila manualmente.');
    provinceId = locality.province_id;
    provinceName = locality.province_name;
    localityId = locality.id;
    localityName = locality.name;
  }

  run(
    'UPDATE users SET province_id = ?, province_name = ?, locality_id = ?, locality_name = ?, lat = ?, lng = ?, location_mode = ?, updated_at = ? WHERE id = ?',
    [provinceId, provinceName, localityId, localityName, lat, lng, mode, nowIso(), req.user.id],
  );
  res.json({ user: selfUser(get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});

router.get('/me/jobs', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM jobs WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [req.user.id]);
  res.json({ jobs: rows.map((row) => serializeJob(row, req.user)) });
});

router.get('/me/works', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM jobs WHERE worker_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [req.user.id]);
  res.json({ jobs: rows.map((row) => serializeJob(row, req.user)) });
});

router.get('/me/applications', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM applications WHERE applicant_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({ applications: rows.map(serializeApplication) });
});

router.get('/me/proposals', requireAuth, (req, res) => {
  const rows = all(
    `SELECT a.* FROM applications a JOIN jobs j ON j.id = a.job_id
     WHERE j.owner_id = ? AND j.deleted_at IS NULL ORDER BY a.created_at DESC`,
    [req.user.id],
  );
  res.json({ applications: rows.map(serializeApplication) });
});

router.get('/users/:id', requireAuth, (req, res) => {
  const row = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!row) notFound('El usuario no existe.');
  const isSelf = row.id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin && (row.status !== 'active' || Number(row.public_profile) !== 1)) {
    notFound('Este perfil no está disponible.');
  }
  const publicJobs = all(
    "SELECT * FROM jobs WHERE owner_id = ? AND status IN ('activa','en_seleccion') AND deleted_at IS NULL AND admin_hidden = 0 ORDER BY created_at DESC LIMIT 12",
    [row.id],
  ).map((job) => serializeJob(job, req.user));
  const rating = ratingFor(row.id);
  const reviews = all(
    `SELECT r.*, u.first_name, u.last_name, u.avatar, j.title AS job_title
     FROM reviews r LEFT JOIN users u ON u.id = r.author_id LEFT JOIN jobs j ON j.id = r.job_id
     WHERE r.target_id = ? ORDER BY r.created_at DESC LIMIT 20`,
    [row.id],
  ).map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    jobTitle: review.job_title,
    author: { id: review.author_id, fullName: `${review.first_name || ''} ${review.last_name || ''}`.trim(), avatar: review.avatar },
  }));
  res.json({
    user: { ...publicUser(row), email: isSelf || isAdmin ? row.email : null },
    stats: {
      publishedJobs: Number(get('SELECT COUNT(*) AS n FROM jobs WHERE owner_id = ? AND deleted_at IS NULL', [row.id])?.n || 0),
      activeJobs: publicJobs.length,
      completedJobs: Number(
        get("SELECT COUNT(*) AS n FROM jobs WHERE worker_id = ? AND status = 'completada'", [row.id])?.n || 0,
      ),
      rating,
    },
    jobs: publicJobs,
    reviews,
    blocked: isBlockedBetween(req.user.id, row.id),
    isSelf,
  });
});

router.post('/users/:id/block', requireAuth, (req, res) => {
  if (req.params.id === req.user.id) bad('No podés bloquearte a vos mismo.');
  const target = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!target) notFound('El usuario no existe.');
  if (!get('SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, target.id])) {
    run('INSERT INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (?,?,?,?)', [uid(), req.user.id, target.id, nowIso()]);
  }
  res.json({ ok: true });
});

export default router;
