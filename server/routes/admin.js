import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireAdmin } from '../auth.js';
import { bad, getSetting, logAdmin, notFound, nowIso, optionalText, publicUser, text, uid } from '../lib.js';

const router = Router();
router.use(requireAdmin);

router.get('/stats', (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const count = (sql, params = []) => Number(get(sql, params)?.n || 0);
  res.json({
    stats: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      newUsers: count('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', [weekAgo]),
      jobs: count('SELECT COUNT(*) AS n FROM jobs WHERE deleted_at IS NULL'),
      activeJobs: count("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('activa','en_seleccion') AND deleted_at IS NULL"),
      applications: count('SELECT COUNT(*) AS n FROM applications'),
      completedJobs: count("SELECT COUNT(*) AS n FROM jobs WHERE status = 'completada'"),
      pendingReports: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'abierto'"),
      messages: count('SELECT COUNT(*) AS n FROM messages'),
      reviews: count('SELECT COUNT(*) AS n FROM reviews'),
    },
    recentJobs: all(
      `SELECT j.*, u.first_name, u.last_name FROM jobs j LEFT JOIN users u ON u.id = j.owner_id
       WHERE j.deleted_at IS NULL ORDER BY j.created_at DESC LIMIT 8`,
    ).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      ownerName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      locality: row.locality_name,
      payTotal: Number(row.pay_total),
      createdAt: row.created_at,
    })),
    recentReports: all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 6').map((row) => ({
      id: row.id,
      reason: row.reason,
      targetType: row.target_type,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
});

router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const conditions = [];
  const params = [];
  if (q) {
    conditions.push('(first_name LIKE ? COLLATE NOCASE OR last_name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'active' || status === 'suspended') {
    conditions.push('status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = all(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT 200`, params);
  res.json({
    users: rows.map((row) => ({
      ...publicUser(row),
      email: row.email,
      suspendedReason: row.suspended_reason,
      jobsCount: Number(get('SELECT COUNT(*) AS n FROM jobs WHERE owner_id = ?', [row.id])?.n || 0),
      applicationsCount: Number(get('SELECT COUNT(*) AS n FROM applications WHERE applicant_id = ?', [row.id])?.n || 0),
    })),
  });
});

router.post('/users/:id/suspend', (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) notFound('El usuario no existe.');
  if (user.id === req.user.id) bad('No podés suspender tu propia cuenta.');
  if (user.role === 'admin') bad('No podés suspender a otro administrador.');
  const reason = optionalText(req.body.reason, { name: 'El motivo', max: 300 }) || 'Incumplimiento de las normas de CHANGAPP';
  run("UPDATE users SET status = 'suspended', suspended_reason = ?, updated_at = ? WHERE id = ?", [reason, nowIso(), user.id]);
  run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
  logAdmin(req.user.id, 'suspender_usuario', 'user', user.id, reason);
  res.json({ ok: true });
});

router.post('/users/:id/reactivate', (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) notFound('El usuario no existe.');
  run("UPDATE users SET status = 'active', suspended_reason = NULL, updated_at = ? WHERE id = ?", [nowIso(), user.id]);
  logAdmin(req.user.id, 'reactivar_usuario', 'user', user.id, null);
  res.json({ ok: true });
});

router.get('/jobs', (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const conditions = [];
  const params = [];
  if (q) {
    conditions.push('(j.title LIKE ? COLLATE NOCASE OR j.locality_name LIKE ? COLLATE NOCASE)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    conditions.push('j.status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = all(
    `SELECT j.*, u.first_name, u.last_name, c.name AS category_name FROM jobs j
     LEFT JOIN users u ON u.id = j.owner_id LEFT JOIN categories c ON c.id = j.category_id
     ${where} ORDER BY j.created_at DESC LIMIT 200`,
    params,
  );
  res.json({
    jobs: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      categoryName: row.category_name,
      locality: row.locality_name,
      province: row.province_name,
      payTotal: Number(row.pay_total),
      ownerName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      ownerId: row.owner_id,
      adminHidden: Number(row.admin_hidden) === 1,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      applicationCount: Number(get('SELECT COUNT(*) AS n FROM applications WHERE job_id = ?', [row.id])?.n || 0),
    })),
  });
});

router.post('/jobs/:id/hide', (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job) notFound('La changa no existe.');
  run('UPDATE jobs SET admin_hidden = 1, updated_at = ? WHERE id = ?', [nowIso(), job.id]);
  logAdmin(req.user.id, 'ocultar_publicacion', 'job', job.id, optionalText(req.body.reason, { max: 300 }));
  res.json({ ok: true });
});

router.post('/jobs/:id/unhide', (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job) notFound('La changa no existe.');
  run('UPDATE jobs SET admin_hidden = 0, updated_at = ? WHERE id = ?', [nowIso(), job.id]);
  logAdmin(req.user.id, 'restaurar_publicacion', 'job', job.id, null);
  res.json({ ok: true });
});

router.post('/jobs/:id/delete', (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job) notFound('La changa no existe.');
  const reason = optionalText(req.body.reason, { max: 300 }) || 'Contenido eliminado por moderación';
  run("UPDATE jobs SET deleted_at = ?, status = 'cancelada', admin_hidden = 1, cancel_reason = ?, updated_at = ? WHERE id = ?", [
    nowIso(),
    reason,
    nowIso(),
    job.id,
  ]);
  logAdmin(req.user.id, 'eliminar_publicacion', 'job', job.id, reason);
  res.json({ ok: true });
});

router.get('/reports', (req, res) => {
  const status = String(req.query.status || '').trim();
  const rows = all(
    `SELECT r.*, rep.first_name AS reporter_first, rep.last_name AS reporter_last, rep.email AS reporter_email,
            tgt.first_name AS target_first, tgt.last_name AS target_last, tgt.email AS target_email
     FROM reports r
     LEFT JOIN users rep ON rep.id = r.reporter_id
     LEFT JOIN users tgt ON tgt.id = r.target_user_id
     ${status ? 'WHERE r.status = ?' : ''}
     ORDER BY r.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  res.json({
    reports: rows.map((row) => ({
      id: row.id,
      reporterId: row.reporter_id,
      reporterName: `${row.reporter_first || ''} ${row.reporter_last || ''}`.trim(),
      reporterEmail: row.reporter_email,
      targetType: row.target_type,
      targetId: row.target_id,
      targetUserId: row.target_user_id,
      targetName: `${row.target_first || ''} ${row.target_last || ''}`.trim(),
      targetEmail: row.target_email,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolutionNote: row.resolution_note,
    })),
  });
});

router.post('/reports/:id/resolve', (req, res) => {
  const report = get('SELECT * FROM reports WHERE id = ?', [req.params.id]);
  if (!report) notFound('El reporte no existe.');
  const note = optionalText(req.body.note, { name: 'La resolución', max: 500 });
  run("UPDATE reports SET status = 'resuelto', resolved_at = ?, resolved_by = ?, resolution_note = ? WHERE id = ?", [
    nowIso(),
    req.user.id,
    note,
    report.id,
  ]);
  logAdmin(req.user.id, 'resolver_reporte', 'report', report.id, note);
  res.json({ ok: true });
});

router.get('/categories', (req, res) => {
  res.json({ categories: all('SELECT * FROM categories ORDER BY sort, name') });
});

router.post('/categories', (req, res) => {
  const name = text(req.body.name, { name: 'El nombre', min: 3, max: 40 });
  const icon = optionalText(req.body.icon, { max: 40 }) || 'LayoutGrid';
  const id = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!id) bad('El nombre de la categoría no es válido.');
  if (get('SELECT id FROM categories WHERE id = ?', [id])) bad('Ya existe una categoría con ese nombre.');
  const maxSort = get('SELECT MAX(sort) AS s FROM categories');
  run('INSERT INTO categories (id, name, icon, sort, active, created_at) VALUES (?,?,?,?,1,?)', [
    id,
    name,
    icon,
    Number(maxSort?.s || 0) + 1,
    nowIso(),
  ]);
  logAdmin(req.user.id, 'crear_categoria', 'category', id, name);
  res.status(201).json({ category: get('SELECT * FROM categories WHERE id = ?', [id]) });
});

router.patch('/categories/:id', (req, res) => {
  const category = get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
  if (!category) notFound('La categoría no existe.');
  const updates = [];
  const params = [];
  if (req.body.name !== undefined) {
    updates.push('name = ?');
    params.push(text(req.body.name, { name: 'El nombre', min: 3, max: 40 }));
  }
  if (req.body.icon !== undefined) {
    updates.push('icon = ?');
    params.push(optionalText(req.body.icon, { max: 40 }) || 'LayoutGrid');
  }
  if (req.body.active !== undefined) {
    updates.push('active = ?');
    params.push(req.body.active ? 1 : 0);
  }
  if (!updates.length) bad('No enviaste cambios para guardar.');
  run(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, [...params, category.id]);
  logAdmin(req.user.id, 'editar_categoria', 'category', category.id, null);
  res.json({ category: get('SELECT * FROM categories WHERE id = ?', [category.id]) });
});

const EDITABLE_SETTINGS = [
  'app_name',
  'slogan',
  'support_email',
  'welcome_title',
  'welcome_subtitle',
  'registrations_open',
  'min_age',
];

router.get('/settings', (req, res) => {
  const settings = {};
  EDITABLE_SETTINGS.forEach((key) => {
    settings[key] = getSetting(key, '');
  });
  res.json({ settings });
});

router.patch('/settings', (req, res) => {
  const updates = Object.entries(req.body || {}).filter(([key]) => EDITABLE_SETTINGS.includes(key));
  if (!updates.length) bad('No enviaste cambios para guardar.');
  updates.forEach(([key, value]) => {
    const str = String(value ?? '').slice(0, 500);
    run('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [
      key,
      str,
      nowIso(),
    ]);
  });
  logAdmin(req.user.id, 'actualizar_configuracion', 'settings', null, updates.map(([key]) => key).join(', '));
  const settings = {};
  EDITABLE_SETTINGS.forEach((key) => {
    settings[key] = getSetting(key, '');
  });
  res.json({ settings });
});

router.get('/activity', (req, res) => {
  const rows = all(
    `SELECT a.*, u.first_name, u.last_name FROM admin_activity a LEFT JOIN users u ON u.id = a.admin_id
     ORDER BY a.created_at DESC LIMIT 60`,
  );
  res.json({
    activity: rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      adminName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      createdAt: row.created_at,
    })),
  });
});

export default router;
