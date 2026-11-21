import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { optionalAuth, requireAuth } from '../auth.js';
import {
  addHistory,
  assertTransition,
  bad,
  categoryById,
  ensureConversation,
  forbidden,
  int,
  isBlockedBetween,
  JOB_STATUS,
  notify,
  notifyAdmins,
  notFound,
  nowIso,
  oneOf,
  optionalText,
  serializeApplication,
  serializeJob,
  text,
  uid,
  validateImage,
} from '../lib.js';

const router = Router();
const OPEN_STATUSES = ['activa', 'en_seleccion'];
const EDITABLE_STATUSES = ['activa', 'en_seleccion', 'pausada'];

function getJobOr404(id) {
  const job = get('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) notFound('La changa no existe o fue eliminada.');
  return job;
}

function isParticipant(job, user) {
  if (!user) return false;
  return job.owner_id === user.id || job.worker_id === user.id;
}

router.get('/jobs', optionalAuth, (req, res) => {
  const viewer = req.user;
  const conditions = ['j.deleted_at IS NULL', 'j.admin_hidden = 0'];
  const params = [];

  const status = String(req.query.status || '').trim();
  if (status && status !== 'todas' && JOB_STATUS[status]) {
    if (viewer?.role === 'admin') {
      conditions.push('j.status = ?');
      params.push(status);
    }
  } else {
    conditions.push("j.status IN ('activa','en_seleccion')");
  }

  const q = String(req.query.q || '').trim();
  if (q) {
    conditions.push('(j.title LIKE ? COLLATE NOCASE OR j.description LIKE ? COLLATE NOCASE OR j.locality_name LIKE ? COLLATE NOCASE OR j.province_name LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const category = String(req.query.category || '').trim();
  if (category) {
    conditions.push('j.category_id = ?');
    params.push(category);
  }
  const province = String(req.query.province || '').trim();
  if (province) {
    conditions.push('j.province_name = ?');
    params.push(province);
  }
  const locality = String(req.query.locality || '').trim();
  if (locality) {
    conditions.push('j.locality_name = ?');
    params.push(locality);
  }
  if (req.query.minPay !== undefined && req.query.minPay !== '') {
    conditions.push('j.pay_total >= ?');
    params.push(int(req.query.minPay, { name: 'El pago mínimo', min: 0 }));
  }
  if (req.query.maxPay !== undefined && req.query.maxPay !== '') {
    conditions.push('j.pay_total <= ?');
    params.push(int(req.query.maxPay, { name: 'El pago máximo', min: 0 }));
  }
  const payType = String(req.query.payType || '').trim();
  if (payType === 'fijo' || payType === 'negociable') {
    conditions.push('j.pay_type = ?');
    params.push(payType);
  }
  const dateFrom = String(req.query.dateFrom || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    conditions.push('j.work_date >= ?');
    params.push(dateFrom);
  }
  const dateTo = String(req.query.dateTo || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    conditions.push('j.work_date <= ?');
    params.push(dateTo);
  }
  const scope = String(req.query.scope || '').trim();
  if (viewer && (scope === 'localidad' || scope === 'provincia') && viewer.province_name) {
    conditions.push('j.province_name = ?');
    params.push(viewer.province_name);
    if (scope === 'localidad' && viewer.locality_name) {
      conditions.push('j.locality_name = ?');
      params.push(viewer.locality_name);
    }
  }

  const rows = all(
    `SELECT j.* FROM jobs j LEFT JOIN categories c ON c.id = j.category_id WHERE ${conditions.join(' AND ')}`,
    params,
  );

  const blockedIds = new Set();
  if (viewer) {
    all('SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?', [viewer.id, viewer.id]).forEach(
      (b) => blockedIds.add(b.blocker_id === viewer.id ? b.blocked_id : b.blocker_id),
    );
  }

  let jobs = rows
    .filter((row) => !viewer || !blockedIds.has(row.owner_id))
    .map((row) => serializeJob(row, viewer));

  const maxDistance = Number(req.query.maxDistanceKm);
  if (Number.isFinite(maxDistance) && maxDistance > 0) {
    jobs = jobs.filter((job) => job.distanceKm != null && job.distanceKm <= maxDistance);
  }

  const rank = (job) => {
    if (!viewer || !viewer.province_name) return 1;
    if (job.province === viewer.province_name && job.locality === viewer.locality_name) return 0;
    if (job.province === viewer.province_name) return 1;
    return 2;
  };
  const sort = String(req.query.sort || '').trim();
  jobs.sort((a, b) => {
    if (sort === 'pago_desc') return b.payTotal - a.payTotal;
    if (sort === 'pago_asc') return a.payTotal - b.payTotal;
    if (sort === 'fecha') return String(a.workDate).localeCompare(String(b.workDate));
    if (sort === 'recientes') return String(b.createdAt).localeCompare(String(a.createdAt));
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const da = a.distanceKm ?? 99999;
    const db = b.distanceKm ?? 99999;
    if (da !== db) return da - db;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  const total = jobs.length;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 60);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  res.json({ jobs: jobs.slice(offset, offset + limit), total, hasMore: offset + limit < total });
});

router.get('/jobs/:id', optionalAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  const viewer = req.user;
  const isOwner = viewer && viewer.id === job.owner_id;
  const isAdmin = viewer?.role === 'admin';
  if ((job.deleted_at || job.admin_hidden) && !isOwner && !isAdmin) {
    notFound('La changa no está disponible.');
  }
  const payload = serializeJob(job, viewer);

  if (isOwner || isAdmin) {
    payload.applications = all('SELECT * FROM applications WHERE job_id = ? ORDER BY created_at DESC', [job.id]).map(
      serializeApplication,
    );
    payload.conversations = all('SELECT * FROM conversations WHERE job_id = ?', [job.id]).map((c) => ({
      id: c.id,
      applicantId: c.applicant_id,
    }));
  }
  if (isParticipant(job, viewer) || isAdmin) {
    payload.history = all('SELECT * FROM job_status_history WHERE job_id = ? ORDER BY created_at ASC', [job.id]).map(
      (row) => ({
        id: row.id,
        from: row.from_status,
        to: row.to_status,
        toLabel: JOB_STATUS[row.to_status] || row.to_status,
        note: row.note,
        createdAt: row.created_at,
        actorId: row.actor_id,
      }),
    );
  }

  if (viewer) {
    const applicantId = isOwner ? job.worker_id || job.accepted_application_id?.replace(/^app-/, '') : viewer.id;
    let conversation = null;
    if (isOwner) {
      const accepted = get('SELECT * FROM applications WHERE job_id = ? AND status = ?', [job.id, 'aceptada']);
      if (accepted) conversation = get('SELECT * FROM conversations WHERE job_id = ? AND applicant_id = ?', [job.id, accepted.applicant_id]);
    } else if (viewer.id !== job.owner_id) {
      conversation = get('SELECT * FROM conversations WHERE job_id = ? AND applicant_id = ?', [job.id, viewer.id]);
    }
    payload.conversationId = conversation?.id || null;
    const myReview = get('SELECT * FROM reviews WHERE job_id = ? AND author_id = ?', [job.id, viewer.id]);
    const otherId = isOwner ? job.worker_id : job.owner_id;
    payload.canReview =
      job.status === 'completada' &&
      isParticipant(job, viewer) &&
      Boolean(otherId) &&
      !myReview &&
      Boolean(get('SELECT id FROM applications WHERE job_id = ? AND applicant_id = ?', [job.id, viewer.id])) ||
      (job.status === 'completada' && isOwner && Boolean(job.worker_id) && !myReview);
    payload.myReview = myReview
      ? { id: myReview.id, rating: myReview.rating, comment: myReview.comment, createdAt: myReview.created_at }
      : null;
    payload.blocked = isBlockedBetween(viewer.id, job.owner_id);
    payload.applicantId = applicantId;
  }

  res.json({ job: payload });
});

router.post('/jobs', requireAuth, (req, res) => {
  const title = text(req.body.title, { name: 'El título', min: 5, max: 120 });
  const description = text(req.body.description, { name: 'La descripción', min: 20, max: 3000 });
  const categoryId = text(req.body.categoryId, { name: 'La categoría', max: 40 });
  const category = categoryById(categoryId);
  if (!category || Number(category.active) !== 1) bad('Elegí una categoría válida.');
  const localityId = text(req.body.localityId, { name: 'La localidad', max: 40 });
  const locality = get('SELECT * FROM localities WHERE id = ?', [localityId]);
  if (!locality) bad('Elegí una localidad válida de la lista.');
  const workDate = text(req.body.workDate, { name: 'La fecha del trabajo', max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) bad('La fecha del trabajo no es válida.');
  const today = new Date().toISOString().slice(0, 10);
  if (workDate < today) bad('La fecha del trabajo no puede ser anterior a hoy.');
  const workTime = text(req.body.workTime, { name: 'El horario', max: 5 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(workTime)) bad('El horario debe tener formato de 24 horas (HH:MM).');
  const duration = optionalText(req.body.duration, { name: 'La duración', max: 60 });
  const payType = oneOf(String(req.body.payType || 'fijo'), ['fijo', 'negociable'], 'El tipo de pago');
  const payTotal = int(req.body.payTotal, { name: 'El pago total', min: 0, max: 100_000_000 });
  if (payType === 'fijo' && payTotal <= 0) bad('Ingresá el pago total ofrecido.');
  const extraInfo = optionalText(req.body.extraInfo, { name: 'La información adicional', max: 1000 });
  const image = validateImage(req.body.image);

  const id = uid();
  const timestamp = nowIso();
  run(
    `INSERT INTO jobs (id, owner_id, title, description, category_id, province_name, locality_name, lat, lng,
      work_date, work_time, duration, pay_total, pay_type, extra_info, image, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.user.id, title, description, categoryId, locality.province_name, locality.name, locality.lat, locality.lng,
      workDate, workTime, duration, payTotal, payType, extraInfo, image, 'activa', timestamp, timestamp],
  );
  addHistory(id, null, 'activa', req.user.id, 'Publicación creada');
  const job = getJobOr404(id);
  res.status(201).json({ job: serializeJob(job, req.user) });
});

router.patch('/jobs/:id', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (job.owner_id !== req.user.id && req.user.role !== 'admin') forbidden('Solo el autor puede editar esta changa.');
  if (!EDITABLE_STATUSES.includes(job.status)) {
    bad('No podés editar una changa en curso, pendiente de confirmación o finalizada.');
  }
  const updates = [];
  const params = [];
  const setField = (field, value) => {
    updates.push(`${field} = ?`);
    params.push(value);
  };

  if (req.body.title !== undefined) setField('title', text(req.body.title, { name: 'El título', min: 5, max: 120 }));
  if (req.body.description !== undefined) {
    setField('description', text(req.body.description, { name: 'La descripción', min: 20, max: 3000 }));
  }
  if (req.body.categoryId !== undefined) {
    const category = categoryById(String(req.body.categoryId));
    if (!category || Number(category.active) !== 1) bad('Elegí una categoría válida.');
    setField('category_id', category.id);
  }
  if (req.body.localityId !== undefined) {
    const locality = get('SELECT * FROM localities WHERE id = ?', [String(req.body.localityId)]);
    if (!locality) bad('Elegí una localidad válida de la lista.');
    setField('locality_name', locality.name);
    setField('province_name', locality.province_name);
    setField('lat', locality.lat);
    setField('lng', locality.lng);
  }
  if (req.body.workDate !== undefined) {
    const workDate = text(req.body.workDate, { name: 'La fecha del trabajo', max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) bad('La fecha del trabajo no es válida.');
    setField('work_date', workDate);
  }
  if (req.body.workTime !== undefined) {
    const workTime = text(req.body.workTime, { name: 'El horario', max: 5 });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(workTime)) bad('El horario debe tener formato de 24 horas (HH:MM).');
    setField('work_time', workTime);
  }
  if (req.body.duration !== undefined) setField('duration', optionalText(req.body.duration, { max: 60 }));
  if (req.body.payType !== undefined) setField('pay_type', oneOf(String(req.body.payType), ['fijo', 'negociable'], 'El tipo de pago'));
  if (req.body.payTotal !== undefined) {
    setField('pay_total', int(req.body.payTotal, { name: 'El pago total', min: 0, max: 100_000_000 }));
  }
  if (req.body.extraInfo !== undefined) setField('extra_info', optionalText(req.body.extraInfo, { max: 1000 }));
  if (req.body.image !== undefined) setField('image', validateImage(req.body.image));

  if (!updates.length) bad('No enviaste cambios para guardar.');
  setField('updated_at', nowIso());
  run(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, [...params, job.id]);
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.delete('/jobs/:id', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (job.owner_id !== req.user.id && req.user.role !== 'admin') forbidden('Solo el autor puede eliminar esta changa.');
  if (['en_curso', 'pendiente_confirmacion'].includes(job.status)) {
    bad('No podés eliminar una changa en curso. Primero cancelala desde los detalles.');
  }
  const timestamp = nowIso();
  run("UPDATE jobs SET deleted_at = ?, status = 'cancelada', cancelled_by = ?, cancel_reason = ?, updated_at = ? WHERE id = ?", [
    timestamp,
    req.user.id,
    'Publicación eliminada por el autor',
    timestamp,
    job.id,
  ]);
  addHistory(job.id, job.status, 'cancelada', req.user.id, 'Publicación eliminada');
  all('SELECT * FROM applications WHERE job_id = ? AND status = ?', [job.id, 'pendiente']).forEach((app) => {
    run("UPDATE applications SET status = 'cancelada', updated_at = ? WHERE id = ?", [timestamp, app.id]);
    notify(app.applicant_id, {
      type: 'postulacion_rechazada',
      title: 'La changa fue eliminada',
      body: `"${job.title}" ya no está disponible.`,
      link: '/perfil?tab=postulaciones',
    });
  });
  res.json({ ok: true });
});

router.post('/jobs/:id/pause', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (job.owner_id !== req.user.id) forbidden('Solo el autor puede pausar esta changa.');
  assertTransition(job.status, 'pausada');
  run("UPDATE jobs SET status = 'pausada', paused_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), job.id]);
  addHistory(job.id, job.status, 'pausada', req.user.id, 'Publicación pausada');
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.post('/jobs/:id/resume', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (job.owner_id !== req.user.id) forbidden('Solo el autor puede reactivar esta changa.');
  if (job.status !== 'pausada') bad('La changa no está pausada.');
  const hasApps = get('SELECT COUNT(*) AS n FROM applications WHERE job_id = ? AND status = ?', [job.id, 'pendiente']);
  const next = Number(hasApps?.n || 0) > 0 ? 'en_seleccion' : 'activa';
  run('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?', [next, nowIso(), job.id]);
  addHistory(job.id, 'pausada', next, req.user.id, 'Publicación reactivada');
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.post('/jobs/:id/cancel', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  const isOwner = job.owner_id === req.user.id;
  if (!isOwner && req.user.role !== 'admin') forbidden('Solo el autor puede cancelar esta changa.');
  if (['completada', 'cancelada'].includes(job.status)) bad('La changa ya está finalizada.');
  const reason = optionalText(req.body.reason, { name: 'El motivo', max: 500 }) || 'Sin motivo indicado';
  const timestamp = nowIso();
  run("UPDATE jobs SET status = 'cancelada', cancelled_by = ?, cancel_reason = ?, updated_at = ? WHERE id = ?", [
    req.user.id,
    reason,
    timestamp,
    job.id,
  ]);
  addHistory(job.id, job.status, 'cancelada', req.user.id, reason);
  all('SELECT * FROM applications WHERE job_id = ? AND status IN (?,?)', [job.id, 'pendiente', 'aceptada']).forEach((app) => {
    run("UPDATE applications SET status = 'cancelada', updated_at = ? WHERE id = ?", [timestamp, app.id]);
    notify(app.applicant_id, {
      type: 'trabajo_completado',
      title: 'Changa cancelada',
      body: `La changa "${job.title}" fue cancelada. Motivo: ${reason}`,
      link: `/changas/${job.id}`,
    });
  });
  if (job.worker_id) {
    notify(job.worker_id, {
      type: 'trabajo_completado',
      title: 'Changa cancelada',
      body: `La changa "${job.title}" fue cancelada. Motivo: ${reason}`,
      link: `/changas/${job.id}`,
    });
  }
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.post('/jobs/:id/start', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (!isParticipant(job, req.user)) forbidden('Solo el publicador o el trabajador seleccionado pueden iniciar el trabajo.');
  assertTransition(job.status, 'en_curso');
  run("UPDATE jobs SET status = 'en_curso', updated_at = ? WHERE id = ?", [nowIso(), job.id]);
  addHistory(job.id, job.status, 'en_curso', req.user.id, 'Trabajo iniciado');
  const otherId = job.owner_id === req.user.id ? job.worker_id : job.owner_id;
  if (otherId) {
    notify(otherId, {
      type: 'trabajo_iniciado',
      title: 'El trabajo comenzó',
      body: `"${job.title}" está en curso.`,
      link: `/changas/${job.id}`,
    });
  }
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.post('/jobs/:id/request-completion', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (!isParticipant(job, req.user)) forbidden('Solo los participantes del trabajo pueden solicitar la finalización.');
  if (!['en_curso', 'trabajador_seleccionado'].includes(job.status)) {
    bad('El trabajo todavía no está en curso.');
  }
  const isOwner = job.owner_id === req.user.id;
  const timestamp = nowIso();
  const ownerConfirmed = isOwner ? timestamp : job.owner_confirmed_at;
  const workerConfirmed = isOwner ? job.worker_confirmed_at : timestamp;
  run(
    `UPDATE jobs SET status = 'pendiente_confirmacion', owner_confirmed_at = ?, worker_confirmed_at = ?, updated_at = ? WHERE id = ?`,
    [ownerConfirmed, workerConfirmed, timestamp, job.id],
  );
  addHistory(job.id, job.status, 'pendiente_confirmacion', req.user.id, isOwner ? 'El publicador marcó el trabajo como terminado' : 'El trabajador solicitó confirmación de finalización');
  const otherId = isOwner ? job.worker_id : job.owner_id;
  if (otherId) {
    notify(otherId, {
      type: 'trabajo_pendiente_confirmacion',
      title: 'Confirmá la finalización',
      body: `"${job.title}" espera tu confirmación para darse por completada.`,
      link: `/changas/${job.id}`,
    });
  }
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.post('/jobs/:id/confirm', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (!isParticipant(job, req.user)) forbidden('Solo los participantes pueden confirmar la finalización.');
  if (job.status !== 'pendiente_confirmacion') bad('La changa no está pendiente de confirmación.');
  const isOwner = job.owner_id === req.user.id;
  const timestamp = nowIso();
  const ownerConfirmed = isOwner ? timestamp : job.owner_confirmed_at;
  const workerConfirmed = isOwner ? job.worker_confirmed_at : timestamp;
  if (ownerConfirmed && workerConfirmed) {
    tx(() => {
      run("UPDATE jobs SET status = 'completada', completed_at = ?, owner_confirmed_at = ?, worker_confirmed_at = ?, updated_at = ? WHERE id = ?", [
        timestamp,
        ownerConfirmed,
        workerConfirmed,
        timestamp,
        job.id,
      ]);
      run("UPDATE applications SET status = 'aceptada', updated_at = ? WHERE job_id = ? AND status = 'pendiente'", [timestamp, job.id]);
      addHistory(job.id, 'pendiente_confirmacion', 'completada', req.user.id, 'Ambas partes confirmaron la finalización');
    });
    [job.owner_id, job.worker_id].filter(Boolean).forEach((userId) => {
      notify(userId, {
        type: 'trabajo_completado',
        title: 'Trabajo completado',
        body: `"${job.title}" quedó completada. Ya podés calificar a la otra parte.`,
        link: `/changas/${job.id}`,
      });
    });
  } else {
    run('UPDATE jobs SET owner_confirmed_at = ?, worker_confirmed_at = ?, updated_at = ? WHERE id = ?', [
      ownerConfirmed,
      workerConfirmed,
      timestamp,
      job.id,
    ]);
    addHistory(job.id, job.status, 'pendiente_confirmacion', req.user.id, 'Confirmación de finalización registrada');
    const otherId = isOwner ? job.worker_id : job.owner_id;
    if (otherId) {
      notify(otherId, {
        type: 'trabajo_pendiente_confirmacion',
        title: 'Falta tu confirmación',
        body: `La otra parte confirmó la finalización de "${job.title}".`,
        link: `/changas/${job.id}`,
      });
    }
  }
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.post('/jobs/:id/dispute', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (!isParticipant(job, req.user)) forbidden('Solo los participantes pueden informar un problema.');
  const note = text(req.body.note, { name: 'El detalle del problema', min: 10, max: 1000 });
  const timestamp = nowIso();
  run('UPDATE jobs SET has_dispute = 1, dispute_note = ?, updated_at = ? WHERE id = ?', [note, timestamp, job.id]);
  const otherId = job.owner_id === req.user.id ? job.worker_id : job.owner_id;
  run(
    'INSERT INTO reports (id, reporter_id, target_type, target_id, target_user_id, reason, details, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [uid(), req.user.id, 'job', job.id, otherId || null, 'Problema con un trabajo', note, 'abierto', timestamp],
  );
  addHistory(job.id, job.status, job.status, req.user.id, `Problema informado: ${note}`);
  notifyAdmins({
    type: 'reporte',
    title: 'Nuevo problema informado',
    body: `En "${job.title}": ${note}`,
    link: '/admin?tab=reportes',
    force: true,
  });
  if (otherId) {
    notify(otherId, {
      type: 'reporte',
      title: 'Se informó un problema',
      body: `En "${job.title}" se informó un problema que revisará el equipo de CHANGAPP.`,
      link: `/changas/${job.id}`,
    });
  }
  res.json({ ok: true });
});

router.get('/jobs/:id/history', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (!isParticipant(job, req.user) && req.user.role !== 'admin') forbidden('No podés ver el historial de esta changa.');
  const history = all('SELECT * FROM job_status_history WHERE job_id = ? ORDER BY created_at ASC', [job.id]).map((row) => ({
    id: row.id,
    from: row.from_status,
    to: row.to_status,
    toLabel: JOB_STATUS[row.to_status] || row.to_status,
    note: row.note,
    createdAt: row.created_at,
    actorId: row.actor_id,
  }));
  res.json({ history });
});

// --- Postulaciones ---

router.post('/jobs/:id/applications', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (job.owner_id === req.user.id) bad('No podés postularte a tu propia changa.');
  if (!OPEN_STATUSES.includes(job.status)) bad('Esta changa ya no acepta postulaciones.');
  if (isBlockedBetween(req.user.id, job.owner_id)) bad('No podés postularte a esta changa.');
  const existing = get('SELECT * FROM applications WHERE job_id = ? AND applicant_id = ?', [job.id, req.user.id]);
  if (existing) bad('Ya te postulaste a esta changa.');
  const message = text(req.body.message, { name: 'El mensaje de presentación', min: 10, max: 1500 });
  const offeredPrice =
    req.body.offeredPrice === undefined || req.body.offeredPrice === '' || req.body.offeredPrice === null
      ? null
      : int(req.body.offeredPrice, { name: 'El precio ofrecido', min: 0, max: 100_000_000 });
  const availability = optionalText(req.body.availability, { name: 'La disponibilidad', max: 200 });
  const extraInfo = optionalText(req.body.extraInfo, { name: 'La información adicional', max: 1000 });
  const id = uid();
  const timestamp = nowIso();
  tx(() => {
    run(
      'INSERT INTO applications (id, job_id, applicant_id, message, offered_price, availability, extra_info, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, job.id, req.user.id, message, offeredPrice, availability, extraInfo, 'pendiente', timestamp, timestamp],
    );
    if (job.status === 'activa') {
      run("UPDATE jobs SET status = 'en_seleccion', updated_at = ? WHERE id = ?", [timestamp, job.id]);
      addHistory(job.id, 'activa', 'en_seleccion', req.user.id, 'Primera postulación recibida');
    }
    ensureConversation(job, req.user.id);
  });
  notify(job.owner_id, {
    type: 'postulacion',
    title: 'Nueva postulación',
    body: `${req.user.first_name} ${req.user.last_name} se postuló a "${job.title}".`,
    link: `/changas/${job.id}`,
  });
  res.status(201).json({ application: serializeApplication(get('SELECT * FROM applications WHERE id = ?', [id])) });
});

router.get('/jobs/:id/applications', requireAuth, (req, res) => {
  const job = getJobOr404(req.params.id);
  if (job.owner_id !== req.user.id && req.user.role !== 'admin') {
    forbidden('Solo el autor de la changa puede ver las postulaciones.');
  }
  const applications = all('SELECT * FROM applications WHERE job_id = ? ORDER BY created_at DESC', [job.id]).map(
    serializeApplication,
  );
  res.json({ applications });
});

router.get('/applications/:id', requireAuth, (req, res) => {
  const application = get('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!application) notFound('La postulación no existe.');
  const job = getJobOr404(application.job_id);
  if (application.applicant_id !== req.user.id && job.owner_id !== req.user.id && req.user.role !== 'admin') {
    forbidden('No podés ver esta postulación.');
  }
  const conversation = get('SELECT * FROM conversations WHERE job_id = ? AND applicant_id = ?', [job.id, application.applicant_id]);
  res.json({ application: serializeApplication(application), conversationId: conversation?.id || null });
});

router.post('/applications/:id/accept', requireAuth, (req, res) => {
  const application = get('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!application) notFound('La postulación no existe.');
  const job = getJobOr404(application.job_id);
  if (job.owner_id !== req.user.id) forbidden('Solo el autor de la changa puede aceptar postulaciones.');
  if (!OPEN_STATUSES.includes(job.status)) bad('La changa ya no está abierta para seleccionar trabajador.');
  if (application.status !== 'pendiente') bad('Esta postulación ya fue procesada.');
  if (isBlockedBetween(job.owner_id, application.applicant_id)) bad('No podés aceptar a este usuario.');
  const timestamp = nowIso();
  tx(() => {
    run("UPDATE applications SET status = 'aceptada', updated_at = ? WHERE id = ?", [timestamp, application.id]);
    run("UPDATE applications SET status = 'rechazada', updated_at = ? WHERE job_id = ? AND id != ? AND status = 'pendiente'", [
      timestamp,
      job.id,
      application.id,
    ]);
    run(
      "UPDATE jobs SET status = 'trabajador_seleccionado', worker_id = ?, accepted_application_id = ?, closed_at = ?, updated_at = ? WHERE id = ?",
      [application.applicant_id, application.id, timestamp, timestamp, job.id],
    );
    addHistory(job.id, job.status, 'trabajador_seleccionado', req.user.id, 'Trabajador seleccionado');
    ensureConversation(job, application.applicant_id);
  });
  notify(application.applicant_id, {
    type: 'postulacion_aceptada',
    title: '¡Fuiste seleccionado!',
    body: `Te eligieron para "${job.title}". Coordiná los detalles por mensaje.`,
    link: `/changas/${job.id}`,
  });
  all("SELECT * FROM applications WHERE job_id = ? AND status = 'rechazada'", [job.id]).forEach((rejected) => {
    if (rejected.id !== application.id) {
      notify(rejected.applicant_id, {
        type: 'postulacion_rechazada',
        title: 'Postulación no seleccionada',
        body: `La changa "${job.title}" ya tiene un trabajador seleccionado.`,
        link: `/changas/${job.id}`,
      });
    }
  });
  res.json({ job: serializeJob(getJobOr404(job.id), req.user) });
});

router.post('/applications/:id/reject', requireAuth, (req, res) => {
  const application = get('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!application) notFound('La postulación no existe.');
  const job = getJobOr404(application.job_id);
  if (job.owner_id !== req.user.id) forbidden('Solo el autor de la changa puede rechazar postulaciones.');
  if (application.status !== 'pendiente') bad('Esta postulación ya fue procesada.');
  run("UPDATE applications SET status = 'rechazada', updated_at = ? WHERE id = ?", [nowIso(), application.id]);
  notify(application.applicant_id, {
    type: 'postulacion_rechazada',
    title: 'Postulación rechazada',
    body: `Tu postulación a "${job.title}" no fue seleccionada.`,
    link: `/changas/${job.id}`,
  });
  res.json({ ok: true });
});

router.post('/applications/:id/withdraw', requireAuth, (req, res) => {
  const application = get('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!application) notFound('La postulación no existe.');
  if (application.applicant_id !== req.user.id) forbidden('Solo vos podés retirar tu postulación.');
  if (application.status !== 'pendiente') bad('Esta postulación ya fue procesada.');
  const job = getJobOr404(application.job_id);
  run("UPDATE applications SET status = 'retirada', updated_at = ? WHERE id = ?", [nowIso(), application.id]);
  notify(job.owner_id, {
    type: 'postulacion_rechazada',
    title: 'Postulación retirada',
    body: `${req.user.first_name} retiró su postulación a "${job.title}".`,
    link: `/changas/${job.id}`,
  });
  res.json({ ok: true });
});

export default router;
