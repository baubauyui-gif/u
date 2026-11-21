import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb, persistNow, DB_PATH, DATA_DIR } from './db.js';
import { ensureAdminFromEnv, optionalAuth, SESSION_COOKIE, tokenFromRequest, sessionUser } from './auth.js';
import { HttpError } from './lib.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import jobRoutes from './routes/jobs.js';
import socialRoutes from './routes/social.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

fs.mkdirSync(DATA_DIR, { recursive: true });
await initDb();
await ensureAdminFromEnv();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '6mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Sesión: adjunta req.user a toda la API para respuestas coherentes.
app.use('/api', optionalAuth);
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api', jobRoutes);
app.use('/api', socialRoutes);
app.use('/api', profileRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  const user = req.user || null;
  res.json({
    ok: true,
    app: 'CHANGAPP',
    database: path.basename(DB_PATH),
    sessionCookie: SESSION_COOKIE,
    authenticated: Boolean(user),
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'El recurso solicitado no existe.' });
});

const distDir = path.join(ROOT, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .type('html')
      .send('<!doctype html><html lang="es"><body style="font-family:system-ui;padding:40px"><h1>CHANGAPP</h1><p>La interfaz no está compilada todavía. Ejecutá <code>npm run build</code>.</p></body></html>');
  });
}

app.use((err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details || undefined });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La imagen es demasiado grande. Probá con una más liviana.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Los datos enviados no son válidos.' });
  }
  console.error('[CHANGAPP] Error inesperado:', err);
  res.status(500).json({ error: 'Algo salió mal. Intentá nuevamente.' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CHANGAPP] Servidor escuchando en http://0.0.0.0:${PORT}`);
  console.log(`[CHANGAPP] Base de datos: ${DB_PATH}`);
});

function shutdown(signal) {
  console.log(`[CHANGAPP] Cerrando por ${signal}…`);
  persistNow();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('[CHANGAPP] Promesa rechazada:', reason));

export { app, server };
