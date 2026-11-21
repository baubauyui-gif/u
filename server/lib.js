import crypto from 'node:crypto';
import { all, get, run } from './db.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

export const fail = (status, message) => {
  throw new HttpError(status, message);
};
export const bad = (message) => fail(400, message);
export const forbidden = (message = 'No tenés permiso para realizar esta acción.') => fail(403, message);
export const notFound = (message = 'No encontramos lo que buscás.') => fail(404, message);

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export function text(value, { name = 'El campo', min = 1, max = 4000, required = true } = {}) {
  const clean = typeof value === 'string' ? value.replace(/\u0000/g, '').trim() : '';
  if (!clean) {
    if (required) bad(`${name} es obligatorio.`);
    return null;
  }
  if (clean.length < min) bad(`${name} debe tener al menos ${min} caracteres.`);
  if (clean.length > max) bad(`${name} no puede superar los ${max} caracteres.`);
  return clean;
}

export function optionalText(value, opts = {}) {
  return text(value, { ...opts, required: false });
}

export function int(value, { name = 'El valor', min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) bad(`${name} es obligatorio.`);
    return null;
  }
  const n = Number(String(value).replace(/[^0-9-]/g, ''));
  if (!Number.isFinite(n) || !Number.isInteger(n)) bad(`${name} debe ser un número válido.`);
  if (n < min) bad(`${name} no puede ser menor a ${min}.`);
  if (n > max) bad(`${name} es demasiado grande.`);
  return n;
}

export function oneOf(value, options, name = 'El valor') {
  if (!options.includes(value)) bad(`${name} no es válido.`);
  return value;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(email || '').trim());
}

export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export const JOB_STATUS = {
  activa: 'Activa',
  en_seleccion: 'En selección',
  trabajador_seleccionado: 'Trabajador seleccionado',
  en_curso: 'En curso',
  pendiente_confirmacion: 'Pendiente de confirmación',
  completada: 'Completada',
  cancelada: 'Cancelada',
  pausada: 'Pausada',
};

export const APPLICATION_STATUS = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
  cancelada: 'Cancelada',
};

const TRANSITIONS = {
  activa: ['en_seleccion', 'trabajador_seleccionado', 'pausada', 'cancelada'],
  en_seleccion: ['trabajador_seleccionado', 'pausada', 'cancelada'],
  pausada: ['activa', 'cancelada'],
  trabajador_seleccionado: ['en_curso', 'cancelada'],
  en_curso: ['pendiente_confirmacion', 'cancelada'],
  pendiente_confirmacion: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    bad(`No se puede pasar la changa de "${JOB_STATUS[from] || from}" a "${JOB_STATUS[to] || to}".`);
  }
}

export function addHistory(jobId, fromStatus, toStatus, actorId, note = null) {
  run(
    'INSERT INTO job_status_history (id, job_id, from_status, to_status, actor_id, note, created_at) VALUES (?,?,?,?,?,?,?)',
    [uid(), jobId, fromStatus, toStatus, actorId, note, nowIso()],
  );
}

export function userPrefs(row) {
  return {
    messages: Number(row.notify_messages) === 1,
    applications: Number(row.notify_applications) === 1,
    jobs: Number(row.notify_jobs) === 1,
  };
}

export function ratingFor(userId) {
  const row = get('SELECT COUNT(*) AS count, AVG(rating) AS avg FROM reviews WHERE target_id = ?', [userId]);
  const count = Number(row?.count || 0);
  return {
    average: count ? Math.round(Number(row.avg) * 10) / 10 : null,
    count,
  };
}

export function completedJobsFor(userId) {
  const asWorker = get(
    "SELECT COUNT(*) AS n FROM jobs WHERE worker_id = ? AND status = 'completada' AND deleted_at IS NULL",
    [userId],
  );
  return Number(asWorker?.n || 0);
}

export function publicUser(row) {
  if (!row) return null;
  const rating = ratingFor(row.id);
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    avatar: row.avatar || null,
    bio: row.bio || null,
    provinceName: row.province_name || null,
    localityName: row.locality_name || null,
    createdAt: row.created_at,
    role: row.role,
    status: row.status,
    rating,
    jobsCompleted: completedJobsFor(row.id),
    publicProfile: Number(row.public_profile) === 1,
  };
}

export function selfUser(row) {
  if (!row) return null;
  return {
    ...publicUser(row),
    email: row.email,
    provinceId: row.province_id || null,
    localityId: row.locality_id || null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    locationMode: row.location_mode || null,
    birthDate: row.birth_date || null,
    notifications: userPrefs(row),
    suspendedReason: row.suspended_reason || null,
  };
}

export function notify(userId, { type, title, body = null, link = null, force = false }) {
  const user = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  const prefs = userPrefs(user);
  if (!force) {
    if (type === 'mensaje' && !prefs.messages) return null;
    if ((type === 'postulacion' || type === 'propuesta') && !prefs.applications) return null;
    if (!prefs.jobs && !['mensaje', 'postulacion', 'propuesta', 'cuenta'].includes(type)) return null;
  }
  const id = uid();
  run('INSERT INTO notifications (id, user_id, type, title, body, link, read_at, created_at) VALUES (?,?,?,?,?,?,NULL,?)', [
    id,
    userId,
    type,
    title,
    body,
    link,
    nowIso(),
  ]);
  return id;
}

export function notifyAdmins(payload) {
  const admins = all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  admins.forEach((admin) => notify(admin.id, payload));
}

export function isBlockedBetween(a, b) {
  if (!a || !b) return false;
  const row = get(
    'SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1',
    [a, b, b, a],
  );
  return Boolean(row);
}

export function validateImage(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length > 2_500_000) bad('La imagen es demasiado grande (máximo 2 MB).');
  if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(str)) return str;
  if (/^https?:\/\/[^\s]+$/i.test(str)) return str;
  bad('El formato de la imagen no es válido.');
  return null;
}

export function categoryById(id) {
  return get('SELECT * FROM categories WHERE id = ?', [id]);
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

export function provinces() {
  return all('SELECT DISTINCT province_id AS id, province_name AS name FROM localities ORDER BY name COLLATE NOCASE').map(
    (r) => ({ id: r.id, name: r.name }),
  );
}

export function localityByNames(provinceName, localityName) {
  return get('SELECT * FROM localities WHERE province_name = ? AND name = ? LIMIT 1', [provinceName, localityName]);
}

export function nearestLocality(lat, lng) {
  if (lat == null || lng == null) return null;
  const rows = all('SELECT id, name, province_id, province_name, lat, lng FROM localities WHERE lat IS NOT NULL');
  let best = null;
  let bestDist = Infinity;
  for (const row of rows) {
    const d = haversineKm({ lat, lng }, row);
    if (d != null && d < bestDist) {
      bestDist = d;
      best = row;
    }
  }
  return best ? { ...best, distanceKm: Math.round(bestDist * 10) / 10 } : null;
}

export function serializeJob(row, viewer) {
  if (!row) return null;
  const owner = get('SELECT * FROM users WHERE id = ?', [row.owner_id]);
  const category = categoryById(row.category_id);
  const apps = get('SELECT COUNT(*) AS n FROM applications WHERE job_id = ?', [row.id]);
  const distanceKm =
    viewer && viewer.lat != null && row.lat != null ? haversineKm({ lat: viewer.lat, lng: viewer.lng }, row) : null;
  const myApplication = viewer
    ? get('SELECT * FROM applications WHERE job_id = ? AND applicant_id = ?', [row.id, viewer.id])
    : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    categoryName: category?.name || 'Otros',
    categoryIcon: category?.icon || 'LayoutGrid',
    province: row.province_name,
    locality: row.locality_name,
    locationLabel: `${row.locality_name}, ${row.province_name}`,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    workDate: row.work_date,
    workTime: row.work_time,
    duration: row.duration,
    payTotal: Number(row.pay_total),
    payType: row.pay_type,
    extraInfo: row.extra_info,
    image: row.image || null,
    status: row.status,
    statusLabel: JOB_STATUS[row.status] || row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelReason: row.cancel_reason,
    cancelledBy: row.cancelled_by,
    hasDispute: Number(row.has_dispute) === 1,
    ownerId: row.owner_id,
    owner: publicUser(owner),
    workerId: row.worker_id,
    acceptedApplicationId: row.accepted_application_id,
    applicationCount: Number(apps?.n || 0),
    distanceKm,
    isOwner: viewer ? viewer.id === row.owner_id : false,
    myApplication: myApplication
      ? {
          id: myApplication.id,
          status: myApplication.status,
          statusLabel: APPLICATION_STATUS[myApplication.status],
          message: myApplication.message,
          offeredPrice: myApplication.offered_price,
          availability: myApplication.availability,
          createdAt: myApplication.created_at,
        }
      : null,
    ownerConfirmed: Boolean(row.owner_confirmed_at),
    workerConfirmed: Boolean(row.worker_confirmed_at),
    ownerConfirmedAt: row.owner_confirmed_at,
    workerConfirmedAt: row.worker_confirmed_at,
    isOpen: row.status === 'activa' || row.status === 'en_seleccion',
    canApply:
      Boolean(viewer) &&
      viewer.id !== row.owner_id &&
      (row.status === 'activa' || row.status === 'en_seleccion') &&
      !myApplication &&
      !isBlockedBetween(viewer.id, row.owner_id),
  };
}

export function serializeApplication(row) {
  const applicant = get('SELECT * FROM users WHERE id = ?', [row.applicant_id]);
  const job = get('SELECT * FROM jobs WHERE id = ?', [row.job_id]);
  return {
    id: row.id,
    jobId: row.job_id,
    applicantId: row.applicant_id,
    applicant: publicUser(applicant),
    job: job
      ? {
          id: job.id,
          title: job.title,
          status: job.status,
          statusLabel: JOB_STATUS[job.status] || job.status,
          locality: job.locality_name,
          province: job.province_name,
          payTotal: Number(job.pay_total),
          payType: job.pay_type,
          workDate: job.work_date,
          ownerId: job.owner_id,
          deletedAt: job.deleted_at,
        }
      : null,
    message: row.message,
    offeredPrice: row.offered_price == null ? null : Number(row.offered_price),
    availability: row.availability,
    extraInfo: row.extra_info,
    status: row.status,
    statusLabel: APPLICATION_STATUS[row.status] || row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function conversationFor(jobId, applicantId) {
  return get('SELECT * FROM conversations WHERE job_id = ? AND applicant_id = ?', [jobId, applicantId]);
}

export function ensureConversation(job, applicantId) {
  const existing = conversationFor(job.id, applicantId);
  if (existing) return existing;
  const id = uid();
  run('INSERT INTO conversations (id, job_id, owner_id, applicant_id, created_at, last_message_at) VALUES (?,?,?,?,?,NULL)', [
    id,
    job.id,
    job.owner_id,
    applicantId,
    nowIso(),
  ]);
  return conversationFor(job.id, applicantId);
}

export function conversationPayload(conv, viewerId) {
  const job = get('SELECT * FROM jobs WHERE id = ?', [conv.job_id]);
  const otherId = conv.owner_id === viewerId ? conv.applicant_id : conv.owner_id;
  const other = get('SELECT * FROM users WHERE id = ?', [otherId]);
  const lastMessage = get(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    [conv.id],
  );
  const unread = get(
    'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL',
    [conv.id, viewerId],
  );
  return {
    id: conv.id,
    jobId: conv.job_id,
    jobTitle: job?.title || 'Changa',
    jobStatus: job?.status || null,
    otherUser: publicUser(other),
    lastMessage: lastMessage ? { body: lastMessage.body, createdAt: lastMessage.created_at, mine: lastMessage.sender_id === viewerId } : null,
    lastMessageAt: conv.last_message_at,
    unreadCount: Number(unread?.n || 0),
  };
}

export function logAdmin(adminId, action, targetType, targetId, details) {
  run('INSERT INTO admin_activity (id, admin_id, action, target_type, target_id, details, created_at) VALUES (?,?,?,?,?,?,?)', [
    uid(),
    adminId,
    action,
    targetType || null,
    targetId || null,
    details || null,
    nowIso(),
  ]);
}
