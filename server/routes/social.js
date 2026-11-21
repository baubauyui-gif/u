import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  bad,
  conversationPayload,
  ensureConversation,
  forbidden,
  int,
  isBlockedBetween,
  notify,
  notifyAdmins,
  notFound,
  nowIso,
  optionalText,
  publicUser,
  text,
  uid,
} from '../lib.js';

const router = Router();

function loadConversation(id, userId) {
  const conv = get('SELECT * FROM conversations WHERE id = ?', [id]);
  if (!conv) notFound('La conversación no existe.');
  if (conv.owner_id !== userId && conv.applicant_id !== userId) {
    forbidden('No tenés acceso a esta conversación.');
  }
  return conv;
}

router.get('/conversations', requireAuth, (req, res) => {
  const rows = all(
    'SELECT * FROM conversations WHERE owner_id = ? OR applicant_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC',
    [req.user.id, req.user.id],
  );
  res.json({ conversations: rows.map((conv) => conversationPayload(conv, req.user.id)) });
});

router.get('/conversations/:id', requireAuth, (req, res) => {
  const conv = loadConversation(req.params.id, req.user.id);
  const messages = all(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
    [conv.id],
  ).map((row) => ({
    id: row.id,
    body: row.body,
    senderId: row.sender_id,
    mine: row.sender_id === req.user.id,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
  const readAt = nowIso();
  run('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL', [
    readAt,
    conv.id,
    req.user.id,
  ]);
  res.json({ conversation: conversationPayload(conv, req.user.id), messages });
});

router.post('/conversations/:id/messages', requireAuth, (req, res) => {
  const conv = loadConversation(req.params.id, req.user.id);
  const body = text(req.body.body, { name: 'El mensaje', min: 1, max: 2000 });
  const otherId = conv.owner_id === req.user.id ? conv.applicant_id : conv.owner_id;
  if (isBlockedBetween(req.user.id, otherId)) bad('No podés enviar mensajes a este usuario.');
  const id = uid();
  const timestamp = nowIso();
  run('INSERT INTO messages (id, conversation_id, sender_id, body, created_at, read_at) VALUES (?,?,?,?,?,NULL)', [
    id,
    conv.id,
    req.user.id,
    body,
    timestamp,
  ]);
  run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [timestamp, conv.id]);
  const job = get('SELECT * FROM jobs WHERE id = ?', [conv.job_id]);
  notify(otherId, {
    type: 'mensaje',
    title: `Nuevo mensaje de ${req.user.first_name}`,
    body: body.length > 90 ? `${body.slice(0, 90)}…` : body,
    link: `/mensajes/${conv.id}`,
  });
  res.status(201).json({
    message: { id, body, senderId: req.user.id, mine: true, createdAt: timestamp, readAt: null },
    conversation: conversationPayload(get('SELECT * FROM conversations WHERE id = ?', [conv.id]), req.user.id),
    jobTitle: job?.title || null,
  });
});

router.post('/jobs/:id/conversation', requireAuth, (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job || job.deleted_at) notFound('La changa no existe o fue eliminada.');
  if (job.owner_id === req.user.id) bad('No podés abrir una conversación con vos mismo.');
  const application = get('SELECT * FROM applications WHERE job_id = ? AND applicant_id = ?', [job.id, req.user.id]);
  if (!application) {
    bad('Primero postulate a la changa para poder coordinar por mensaje.');
  }
  if (isBlockedBetween(req.user.id, job.owner_id)) bad('No podés contactar a este usuario.');
  const conv = ensureConversation(job, req.user.id);
  res.json({ conversationId: conv.id });
});

router.get('/notifications', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  const unread = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.json({
    notifications: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      read: Boolean(row.read_at),
      createdAt: row.created_at,
    })),
    unreadCount: Number(unread?.n || 0),
  });
});

router.post('/notifications/:id/read', requireAuth, (req, res) => {
  const row = get('SELECT * FROM notifications WHERE id = ?', [req.params.id]);
  if (!row) notFound('La notificación no existe.');
  if (row.user_id !== req.user.id) forbidden('No podés modificar notificaciones de otra persona.');
  if (!row.read_at) run('UPDATE notifications SET read_at = ? WHERE id = ?', [nowIso(), row.id]);
  res.json({ ok: true });
});

router.post('/notifications/read-all', requireAuth, (req, res) => {
  run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [nowIso(), req.user.id]);
  res.json({ ok: true });
});

router.post('/reviews', requireAuth, (req, res) => {
  const jobId = text(req.body.jobId, { name: 'La changa', max: 60 });
  const job = get('SELECT * FROM jobs WHERE id = ?', [jobId]);
  if (!job) notFound('La changa no existe.');
  if (job.status !== 'completada') bad('Solo podés calificar trabajos completados.');
  const isOwner = job.owner_id === req.user.id;
  if (!isOwner && job.worker_id !== req.user.id) forbidden('Solo los participantes del trabajo pueden calificar.');
  const targetId = isOwner ? job.worker_id : job.owner_id;
  if (!targetId) bad('No hay una persona para calificar en este trabajo.');
  const rating = int(req.body.rating, { name: 'La calificación', min: 1, max: 5 });
  const comment = optionalText(req.body.comment, { name: 'La opinión', max: 1000 });
  const existing = get('SELECT * FROM reviews WHERE job_id = ? AND author_id = ?', [job.id, req.user.id]);
  if (existing) bad('Ya calificaste este trabajo.');
  const id = uid();
  run('INSERT INTO reviews (id, job_id, author_id, target_id, rating, comment, created_at) VALUES (?,?,?,?,?,?,?)', [
    id,
    job.id,
    req.user.id,
    targetId,
    rating,
    comment,
    nowIso(),
  ]);
  notify(targetId, {
    type: 'calificacion',
    title: 'Recibiste una calificación',
    body: `${req.user.first_name} te calificó con ${rating} ${rating === 1 ? 'estrella' : 'estrellas'}.`,
    link: `/perfil?tab=reputacion`,
  });
  res.status(201).json({ ok: true, review: { id, rating, comment, createdAt: nowIso() } });
});

router.get('/users/:id/reviews', (req, res) => {
  const rows = all(
    `SELECT r.*, u.first_name, u.last_name, u.avatar, j.title AS job_title
     FROM reviews r
     LEFT JOIN users u ON u.id = r.author_id
     LEFT JOIN jobs j ON j.id = r.job_id
     WHERE r.target_id = ? ORDER BY r.created_at DESC LIMIT 50`,
    [req.params.id],
  );
  res.json({
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
      jobId: row.job_id,
      jobTitle: row.job_title,
      author: { id: row.author_id, fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(), avatar: row.avatar },
    })),
  });
});

const REPORT_REASONS = [
  'Estafa',
  'Publicación falsa',
  'Acoso',
  'Contenido inapropiado',
  'Suplantación de identidad',
  'Otro problema',
];

router.get('/reports/reasons', (_req, res) => res.json({ reasons: REPORT_REASONS }));

router.post('/reports', requireAuth, (req, res) => {
  const targetType = String(req.body.targetType || '').trim();
  if (!['job', 'user', 'message'].includes(targetType)) bad('El tipo de reporte no es válido.');
  const targetId = text(req.body.targetId, { name: 'El contenido a reportar', max: 60 });
  const reason = text(req.body.reason, { name: 'El motivo', max: 80 });
  if (!REPORT_REASONS.includes(reason)) bad('Elegí un motivo válido.');
  const details = optionalText(req.body.details, { name: 'El detalle', max: 1000 });

  let targetUserId = null;
  if (targetType === 'job') {
    const job = get('SELECT * FROM jobs WHERE id = ?', [targetId]);
    if (!job) notFound('La changa no existe.');
    targetUserId = job.owner_id;
  } else if (targetType === 'user') {
    const user = get('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!user) notFound('El usuario no existe.');
    targetUserId = user.id;
  } else {
    const message = get('SELECT * FROM messages WHERE id = ?', [targetId]);
    if (!message) notFound('El mensaje no existe.');
    const conv = get('SELECT * FROM conversations WHERE id = ?', [message.conversation_id]);
    if (!conv || (conv.owner_id !== req.user.id && conv.applicant_id !== req.user.id)) {
      forbidden('No podés reportar un mensaje de una conversación ajena.');
    }
    targetUserId = message.sender_id;
  }
  if (targetUserId === req.user.id) bad('No podés reportarte a vos mismo.');

  const id = uid();
  run(
    'INSERT INTO reports (id, reporter_id, target_type, target_id, target_user_id, reason, details, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, req.user.id, targetType, targetId, targetUserId, reason, details, 'abierto', nowIso()],
  );
  notifyAdmins({
    type: 'reporte',
    title: 'Nuevo reporte recibido',
    body: `${req.user.first_name} ${req.user.last_name} reportó: ${reason}.`,
    link: '/admin?tab=reportes',
    force: true,
  });
  res.status(201).json({ ok: true, id });
});

router.get('/blocks', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({
    blocks: rows.map((row) => ({ id: row.id, userId: row.blocked_id, user: publicUser(get('SELECT * FROM users WHERE id = ?', [row.blocked_id])), createdAt: row.created_at })),
  });
});

router.post('/blocks/:userId', requireAuth, (req, res) => {
  const target = get('SELECT * FROM users WHERE id = ?', [req.params.userId]);
  if (!target) notFound('El usuario no existe.');
  if (target.id === req.user.id) bad('No podés bloquearte a vos mismo.');
  if (!get('SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, target.id])) {
    run('INSERT INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (?,?,?,?)', [uid(), req.user.id, target.id, nowIso()]);
  }
  res.json({ ok: true });
});

router.delete('/blocks/:userId', requireAuth, (req, res) => {
  run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, req.params.userId]);
  res.json({ ok: true });
});

export default router;
