import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 3400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'changapp-test-'));
const ADMIN_EMAIL = 'admin@changapp.test';

let server = null;
let serverLog = '';

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), CHANGAPP_DATA_DIR: DATA_DIR, ADMIN_EMAIL, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => {
      serverLog += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      serverLog += chunk.toString();
    });
    child.on('exit', (code) => {
      if (server !== child) return;
      server = null;
      if (code !== 0) reject(new Error(`El servidor terminó con código ${code}\n${serverLog}`));
    });
    server = child;
    resolve(child);
  });
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      /* todavía no escucha */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`El servidor no respondió a tiempo.\n${serverLog}`);
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    const child = server;
    server = null;
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      resolve();
    }, 5000).unref();
  });
}

function makeClient() {
  let cookie = '';
  async function request(pathname, { method = 'GET', body } = {}) {
    const res = await fetch(`${BASE}${pathname}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const rawCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of rawCookies) {
      const pair = raw.split(';')[0];
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!value) cookie = '';
      else cookie = `${name}=${value}`;
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  }
  return { request, get cookie() { return cookie; } };
}

function tomorrow() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const adult = '1995-04-12';
const password = 'ChangaSegura123';

async function register(client, overrides = {}) {
  return client.request('/api/auth/register', {
    method: 'POST',
    body: {
      firstName: 'Nombre',
      lastName: 'Apellido',
      email: `user${Math.random().toString(36).slice(2, 9)}@changapp.test`,
      password,
      passwordConfirm: password,
      birthDate: adult,
      acceptTerms: true,
      acceptPrivacy: true,
      ...overrides,
    },
  });
}

let locality = null;

before(async () => {
  await startServer();
  await waitForHealth();
  const geo = await fetch(`${BASE}/api/geo/localities?q=Santo%20Tom&limit=5`).then((r) => r.json());
  assert.ok(Array.isArray(geo.localities) && geo.localities.length > 0, 'La base de localidades oficiales debe estar cargada');
  locality = geo.localities[0];
});

after(async () => {
  await stopServer();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('CHANGAPP · flujos completos A-H con datos persistentes', async (t) => {
  const ana = makeClient();
  const bruno = makeClient();
  const carla = makeClient();
  const admin = makeClient();

  let anaId = null;
  let brunoId = null;
  let carlaId = null;
  let jobId = null;
  let brunoApplicationId = null;
  let conversationId = null;

  await t.test('A · registro, edad mínima, duplicados y sesión persistente', async () => {
    const anaReg = await register(ana, { firstName: 'Ana', lastName: 'Gómez', email: 'ana@changapp.test' });
    assert.equal(anaReg.status, 201, JSON.stringify(anaReg.data));
    anaId = anaReg.data.user.id;
    assert.equal(anaReg.data.user.email, 'ana@changapp.test');
    assert.equal(anaReg.data.user.passwordHash, undefined, 'La API nunca debe devolver el hash de contraseña');

    const dup = await register(makeClient(), { email: 'ana@changapp.test' });
    assert.equal(dup.status, 409, 'No se permiten cuentas duplicadas por email');

    const minor = await register(makeClient(), {
      email: 'menor@changapp.test',
      birthDate: new Date().toISOString().slice(0, 10).replace(/^\d{4}/, String(new Date().getFullYear() - 15)),
    });
    assert.equal(minor.status, 400, 'La plataforma es solo para mayores de 18 años');

    const brunoReg = await register(bruno, { firstName: 'Bruno', lastName: 'Paz', email: 'bruno@changapp.test' });
    assert.equal(brunoReg.status, 201);
    brunoId = brunoReg.data.user.id;

    const carlaReg = await register(carla, { firstName: 'Carla', lastName: 'Ruiz', email: 'carla@changapp.test' });
    assert.equal(carlaReg.status, 201);
    carlaId = carlaReg.data.user.id;

    const adminReg = await register(admin, { firstName: 'Admin', lastName: 'Changapp', email: ADMIN_EMAIL });
    assert.equal(adminReg.status, 201);
    assert.equal(adminReg.data.user.role, 'admin', 'El email configurado debe recibir rol de administrador');

    assert.equal((await ana.request('/api/auth/logout', { method: 'POST' })).status, 200);
    const anonymousMe = await ana.request('/api/auth/me');
    assert.equal(anonymousMe.status, 200);
    assert.equal(anonymousMe.data.user, null, 'Tras cerrar sesión no queda ningún usuario autenticado');

    const relogin = await ana.request('/api/auth/login', { method: 'POST', body: { email: 'ana@changapp.test', password } });
    assert.equal(relogin.status, 200);
    assert.equal(relogin.data.user.id, anaId, 'La cuenta conserva su identidad tras volver a ingresar');
  });

  await t.test('B · publicación real visible, persistente y sin datos de demostración', async () => {
    const initial = await bruno.request('/api/jobs');
    assert.equal(initial.status, 200);
    assert.equal(initial.data.jobs.length, 0, 'No debe haber changas ficticias cargadas en la base');

    const created = await ana.request('/api/jobs', {
      method: 'POST',
      body: {
        title: 'Cortar el pasto del frente',
        description: 'Necesito cortar el pasto de un jardín chico, con máquina propia. Zona centro.',
        categoryId: 'jardineria',
        localityId: locality.id,
        workDate: tomorrow(),
        workTime: '09:00',
        duration: '2 horas',
        payTotal: 18000,
        payType: 'fijo',
        extraInfo: 'Hay enchufe disponible.',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    jobId = created.data.job.id;
    assert.equal(created.data.job.status, 'activa');
    assert.equal(created.data.job.payTotal, 18000);
    assert.equal(created.data.job.ownerId, anaId);

    const found = await bruno.request('/api/jobs?q=pasto');
    assert.equal(found.status, 200);
    assert.ok(found.data.jobs.some((job) => job.id === jobId), 'Otro usuario encuentra la changa en Explorar');
    assert.equal(found.data.jobs[0].canApply, true, 'Otro usuario puede postularse');

    const mine = await ana.request('/api/me/jobs');
    assert.ok(mine.data.jobs.some((job) => job.id === jobId), 'La changa aparece en Mis publicaciones');

    await ana.request('/api/auth/logout', { method: 'POST' });
    await ana.request('/api/auth/login', { method: 'POST', body: { email: 'ana@changapp.test', password } });
    const afterRelogin = await ana.request('/api/me/jobs');
    assert.ok(afterRelogin.data.jobs.some((job) => job.id === jobId), 'La publicación sigue existiendo tras cerrar sesión');

    const detail = await bruno.request(`/api/jobs/${jobId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.job.title, 'Cortar el pasto del frente');
    assert.equal(detail.data.job.isOwner, false);
  });

  await t.test('C · postulaciones con reglas y selección única', async () => {
    const own = await ana.request(`/api/jobs/${jobId}/applications`, {
      method: 'POST',
      body: { message: 'Me postulo a mi propia changa para probar la regla.' },
    });
    assert.equal(own.status, 400, 'Nadie puede postularse a su propia changa');

    const brunoApply = await bruno.request(`/api/jobs/${jobId}/applications`, {
      method: 'POST',
      body: { message: 'Hola Ana, tengo máquina y experiencia en jardinería.', offeredPrice: 17000, availability: 'Mañanas' },
    });
    assert.equal(brunoApply.status, 201, JSON.stringify(brunoApply.data));
    brunoApplicationId = brunoApply.data.application.id;

    const twice = await bruno.request(`/api/jobs/${jobId}/applications`, {
      method: 'POST',
      body: { message: 'Intento postularme dos veces a la misma changa.' },
    });
    assert.equal(twice.status, 400, 'No se permite postularse dos veces');

    const carlaApply = await carla.request(`/api/jobs/${jobId}/applications`, {
      method: 'POST',
      body: { message: 'Hola, también puedo cortar el pasto el mismo día.', offeredPrice: 16500 },
    });
    assert.equal(carlaApply.status, 201);

    const proposals = await ana.request('/api/me/proposals');
    assert.equal(proposals.status, 200);
    assert.ok(proposals.data.applications.some((app) => app.id === brunoApplicationId), 'El publicador ve las propuestas recibidas');

    const foreignList = await bruno.request(`/api/jobs/${jobId}/applications`);
    assert.equal(foreignList.status, 403, 'Solo el autor ve todas las postulaciones');

    const foreignAccept = await carla.request(`/api/applications/${brunoApplicationId}/accept`, { method: 'POST' });
    assert.equal(foreignAccept.status, 403, 'Solo el autor puede aceptar postulaciones');

    const accepted = await ana.request(`/api/applications/${brunoApplicationId}/accept`, { method: 'POST' });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.job.status, 'trabajador_seleccionado');
    assert.equal(accepted.data.job.workerId, brunoId);

    const afterAccept = await carla.request('/api/me/applications');
    const carlaApp = afterAccept.data.applications.find((app) => app.jobId === jobId);
    assert.equal(carlaApp.status, 'rechazada', 'Las demás postulaciones quedan como no seleccionadas');

    const late = await carla.request(`/api/jobs/${jobId}/applications`, {
      method: 'POST',
      body: { message: 'Llego tarde, la changa ya tiene trabajador asignado.' },
    });
    assert.equal(late.status, 400, 'Una changa cerrada no acepta postulaciones');

    const works = await bruno.request('/api/me/works');
    assert.ok(works.data.jobs.some((job) => job.id === jobId), 'El trabajo seleccionado aparece en Mis trabajos');
  });

  await t.test('D · chat privado persistente y protegido', async () => {
    const opened = await bruno.request(`/api/jobs/${jobId}/conversation`, { method: 'POST' });
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    conversationId = opened.data.conversationId;
    assert.ok(conversationId);

    const sent = await bruno.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body: 'Hola Ana, ¿te sirve que arranque a las 9?' },
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));

    const reply = await ana.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body: 'Perfecto, te espero a las 9 en la dirección que te paso.' },
    });
    assert.equal(reply.status, 201);

    const history = await bruno.request(`/api/conversations/${conversationId}`);
    assert.equal(history.status, 200);
    assert.equal(history.data.messages.length, 2, 'El historial conserva ambos mensajes');
    assert.equal(history.data.messages[0].mine, true);
    assert.equal(history.data.messages[1].mine, false);

    const inbox = await ana.request('/api/conversations');
    const conv = inbox.data.conversations.find((item) => item.id === conversationId);
    assert.ok(conv, 'La conversación aparece en Mensajes del publicador');
    assert.equal(conv.jobTitle, 'Cortar el pasto del frente');

    const intruder = await carla.request(`/api/conversations/${conversationId}`);
    assert.ok([403, 404].includes(intruder.status), 'Un tercero no puede leer conversaciones ajenas');

    const intruderWrite = await carla.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body: 'Intento escribir en una conversación ajena.' },
    });
    assert.ok([403, 404].includes(intruderWrite.status), 'Un tercero no puede escribir en conversaciones ajenas');
  });

  await t.test('E · notificaciones generadas por eventos reales', async () => {
    const anaInbox = await ana.request('/api/notifications');
    assert.equal(anaInbox.status, 200);
    const applicationNotice = anaInbox.data.notifications.find((n) => n.type === 'postulacion');
    assert.ok(applicationNotice, 'El publicador recibe la notificación de la nueva postulación');
    assert.ok(anaInbox.data.unreadCount >= 1);

    const brunoInbox = await bruno.request('/api/notifications');
    assert.ok(brunoInbox.data.notifications.some((n) => n.type === 'postulacion_aceptada'), 'El postulante sabe que fue seleccionado');
    assert.ok(brunoInbox.data.notifications.some((n) => n.type === 'mensaje'), 'El destinatario recibe la notificación del mensaje');

    const unreadBefore = anaInbox.data.unreadCount;
    const marked = await ana.request(`/api/notifications/${applicationNotice.id}/read`, { method: 'POST' });
    assert.equal(marked.status, 200);
    const anaAfter = await ana.request('/api/notifications');
    assert.equal(anaAfter.data.unreadCount, unreadBefore - 1, 'Marcar como leída cambia el estado real');

    const foreignRead = await carla.request(`/api/notifications/${applicationNotice.id}/read`, { method: 'POST' });
    assert.ok([403, 404].includes(foreignRead.status), 'Nadie puede modificar notificaciones ajenas');
  });

  await t.test('F · perfil con secciones reales y edición persistente', async () => {
    const me = await ana.request('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.user.id, anaId);
    assert.equal(me.data.stats.activePublications, 1, 'El resumen cuenta las publicaciones activas');

    const brunoMe = await bruno.request('/api/me');
    assert.ok(brunoMe.data.stats.inProgressJobs >= 1, 'El resumen cuenta los trabajos en curso');

    const updated = await ana.request('/api/me', {
      method: 'PATCH',
      body: { bio: 'Ofrezco ayuda con jardinería y mudanzas en Santo Tomé.' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.user.bio, 'Ofrezco ayuda con jardinería y mudanzas en Santo Tomé.');

    await ana.request('/api/auth/logout', { method: 'POST' });
    await ana.request('/api/auth/login', { method: 'POST', body: { email: 'ana@changapp.test', password } });
    const afterRelogin = await ana.request('/api/me');
    assert.equal(afterRelogin.data.user.bio, 'Ofrezco ayuda con jardinería y mudanzas en Santo Tomé.', 'La presentación persiste');

    const publicProfile = await bruno.request(`/api/users/${anaId}`);
    assert.equal(publicProfile.status, 200);
    assert.equal(publicProfile.data.user.email ?? null, null, 'El email privado nunca se expone en el perfil público');
  });

  await t.test('G · ubicación manual persistente y filtros reales', async () => {
    const setLocation = await bruno.request('/api/me/location', {
      method: 'PATCH',
      body: { mode: 'manual', localityId: locality.id },
    });
    assert.equal(setLocation.status, 200, JSON.stringify(setLocation.data));
    assert.equal(setLocation.data.user.localityName, locality.name);

    await bruno.request('/api/auth/logout', { method: 'POST' });
    await bruno.request('/api/auth/login', { method: 'POST', body: { email: 'bruno@changapp.test', password } });
    const persisted = await bruno.request('/api/me');
    assert.equal(persisted.data.user.localityId, locality.id, 'La ubicación sigue configurada al volver a entrar');
    assert.equal(persisted.data.user.provinceName, locality.provinceName);

    const activeJob = await ana.request('/api/jobs', {
      method: 'POST',
      body: {
        title: 'Pintar una habitación chica',
        description: 'Necesito pintar una habitación de 3x3 con pintura incluida, dos manos.',
        categoryId: 'pintura',
        localityId: locality.id,
        workDate: tomorrow(),
        workTime: '10:00',
        duration: '1 día',
        payTotal: 22000,
        payType: 'negociable',
      },
    });
    assert.equal(activeJob.status, 201, JSON.stringify(activeJob.data));
    const activeJobId = activeJob.data.job.id;

    const nearby = await bruno.request(`/api/jobs?locality=${encodeURIComponent(locality.name)}`);
    assert.equal(nearby.status, 200);
    assert.ok(nearby.data.jobs.some((job) => job.id === activeJobId), 'El filtro por localidad devuelve las changas de esa zona');

    const otherLocality = await bruno.request('/api/jobs?locality=Ushuaia');
    assert.ok(!otherLocality.data.jobs.some((job) => job.id === activeJobId), 'Otra localidad no muestra esa changa');

    const filteredOut = await bruno.request('/api/jobs?minPay=999999');
    assert.equal(filteredOut.data.jobs.length, 0, 'El filtro de pago mínimo modifica los resultados');

    const category = await bruno.request('/api/jobs?category=limpieza');
    assert.ok(!category.data.jobs.some((job) => job.id === activeJobId), 'El filtro por categoría excluye otras categorías');
  });

  await t.test('H · seguridad: operaciones ajenas rechazadas en backend', async () => {
    const foreignEdit = await bruno.request(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      body: { title: 'Intento editar una changa ajena' },
    });
    assert.equal(foreignEdit.status, 403, 'No se puede editar una publicación ajena');

    const foreignDelete = await bruno.request(`/api/jobs/${jobId}`, { method: 'DELETE' });
    assert.equal(foreignDelete.status, 403, 'No se puede eliminar una publicación ajena');

    const foreignProfile = await bruno.request(`/api/users/${carlaId}`);
    assert.equal(foreignProfile.status, 200);
    assert.equal(foreignProfile.data.user.email ?? null, null, 'Sin datos privados de terceros');

    const earlyReview = await ana.request('/api/reviews', {
      method: 'POST',
      body: { jobId, rating: 5, comment: 'Intento calificar antes de terminar el trabajo.' },
    });
    assert.equal(earlyReview.status, 400, 'No se califica un trabajo sin completar');

    const anonymous = await makeClient().request('/api/me');
    assert.equal(anonymous.status, 401, 'La API exige sesión para datos privados');
  });

  await t.test('Ciclo de vida completo y calificaciones', async () => {
    const started = await ana.request(`/api/jobs/${jobId}/start`, { method: 'POST' });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.job.status, 'en_curso');

    const requested = await bruno.request(`/api/jobs/${jobId}/request-completion`, { method: 'POST' });
    assert.equal(requested.status, 200);
    assert.equal(requested.data.job.status, 'pendiente_confirmacion');

    const confirmed = await ana.request(`/api/jobs/${jobId}/confirm`, { method: 'POST' });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    assert.equal(confirmed.data.job.status, 'completada', 'Con ambas confirmaciones el trabajo queda completado');

    const review = await ana.request('/api/reviews', {
      method: 'POST',
      body: { jobId, rating: 5, comment: 'Muy prolijo y puntual.' },
    });
    assert.equal(review.status, 201, JSON.stringify(review.data));

    const duplicate = await ana.request('/api/reviews', {
      method: 'POST',
      body: { jobId, rating: 1, comment: 'Segunda calificación del mismo trabajo.' },
    });
    assert.equal(duplicate.status, 400, 'Una sola calificación por usuario y trabajo');

    const brunoReview = await bruno.request('/api/reviews', {
      method: 'POST',
      body: { jobId, rating: 4, comment: 'Todo claro y cordial.' },
    });
    assert.equal(brunoReview.status, 201);

    const reviews = await bruno.request(`/api/users/${anaId}/reviews`);
    assert.ok(reviews.data.reviews.some((item) => item.rating === 4), 'La reputación muestra las opiniones recibidas');

    const completed = await ana.request('/api/me/jobs');
    assert.equal(completed.data.jobs.find((job) => job.id === jobId).status, 'completada');
  });

  await t.test('Panel de administración protegido por rol', async () => {
    const stats = await admin.request('/api/admin/stats');
    assert.equal(stats.status, 200, JSON.stringify(stats.data));
    assert.ok(stats.data.stats.users >= 4);
    assert.ok(stats.data.stats.jobs >= 1);

    const forbidden = await ana.request('/api/admin/stats');
    assert.equal(forbidden.status, 403, 'Un usuario común no accede al panel');

    const reports = await carla.request('/api/reports', {
      method: 'POST',
      body: { targetType: 'job', targetId: jobId, reason: 'Otro problema', details: 'Reporte de prueba del flujo de moderación.' },
    });
    assert.equal(reports.status, 201, JSON.stringify(reports.data));

    const pending = await admin.request('/api/admin/reports');
    assert.equal(pending.status, 200);
    assert.ok(pending.data.reports.length >= 1, 'El reporte llega al panel de administración');
  });

  await t.test('Persistencia real: los datos sobreviven al reinicio del servidor', async () => {
    await stopServer();
    await startServer();
    await waitForHealth();

    const fresh = makeClient();
    const login = await fresh.request('/api/auth/login', { method: 'POST', body: { email: 'ana@changapp.test', password } });
    assert.equal(login.status, 200, 'La cuenta sigue existiendo después de reiniciar');

    const jobs = await fresh.request('/api/me/jobs');
    assert.ok(jobs.data.jobs.some((job) => job.id === jobId), 'La publicación sigue en la base después de reiniciar');
    assert.equal(jobs.data.jobs.find((job) => job.id === jobId).status, 'completada');

    const brunoLogin = makeClient();
    await brunoLogin.request('/api/auth/login', { method: 'POST', body: { email: 'bruno@changapp.test', password } });
    const history = await brunoLogin.request(`/api/conversations/${conversationId}`);
    assert.equal(history.status, 200);
    assert.equal(history.data.messages.length, 2, 'El historial del chat sigue guardado');
  });
});
