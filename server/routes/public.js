import { Router } from 'express';
import { all, get } from '../db.js';
import { nearestLocality, provinces } from '../lib.js';
import { mailConfigured } from '../mail.js';

const router = Router();

const PUBLIC_SETTINGS = ['app_name', 'slogan', 'support_email', 'welcome_title', 'welcome_subtitle', 'min_age'];

router.get('/config', (req, res) => {
  const settings = {};
  all('SELECT key, value FROM settings').forEach((row) => {
    if (PUBLIC_SETTINGS.includes(row.key)) settings[row.key] = row.value;
  });
  const categories = all('SELECT id, name, icon, sort FROM categories WHERE active = 1 ORDER BY sort, name');
  const totals = {
    users: Number(get('SELECT COUNT(*) AS n FROM users')?.n || 0),
    jobs: Number(get("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('activa','en_seleccion') AND deleted_at IS NULL")?.n || 0),
    completed: Number(get("SELECT COUNT(*) AS n FROM jobs WHERE status = 'completada'")?.n || 0),
    localities: Number(get('SELECT COUNT(*) AS n FROM localities')?.n || 0),
  };
  res.json({
    settings,
    categories,
    provinces: provinces(),
    totals,
    mailConfigured: mailConfigured(),
  });
});

router.get('/geo/provinces', (req, res) => {
  res.json({ provinces: provinces() });
});

router.get('/geo/localities', (req, res) => {
  const provinceId = String(req.query.provinceId || '').trim();
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const conditions = [];
  const params = [];
  if (provinceId) {
    conditions.push('province_id = ?');
    params.push(provinceId);
  }
  if (q) {
    conditions.push('name LIKE ? COLLATE NOCASE');
    params.push(`%${q}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = all(
    `SELECT id, name, province_id, province_name, lat, lng FROM localities ${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const total = get(`SELECT COUNT(*) AS n FROM localities ${where}`, params);
  res.json({
    localities: rows.map((r) => ({
      id: r.id,
      name: r.name,
      provinceId: r.province_id,
      provinceName: r.province_name,
      lat: r.lat,
      lng: r.lng,
    })),
    total: Number(total?.n || 0),
    hasMore: offset + rows.length < Number(total?.n || 0),
  });
});

router.get('/geo/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Coordenadas inválidas.' });
  }
  // Fuente oficial: Georef (datos.gob.ar). Si no responde, usamos la localidad
  // más cercana del dataset oficial ya incluido en la aplicación.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(
      `https://apis.datos.gob.ar/georef/api/ubicacion?lat=${lat}&lon=${lng}`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    );
    clearTimeout(timer);
    if (response.ok) {
      const data = await response.json();
      const ubic = data?.ubicacion;
      if (ubic?.provincia?.nombre) {
        const localityName = ubic.localidad_censal?.nombre || ubic.municipio?.nombre || ubic.departamento?.nombre;
        const match = all(
          'SELECT id, name, province_id, province_name, lat, lng FROM localities WHERE province_name = ? AND name = ? LIMIT 1',
          [ubic.provincia.nombre, localityName || ''],
        )[0];
        return res.json({
          source: 'georef',
          location: {
            provinceId: match?.province_id || ubic.provincia.id,
            provinceName: ubic.provincia.nombre,
            localityId: match?.id || null,
            localityName: localityName || match?.name || ubic.provincia.nombre,
            lat,
            lng,
          },
        });
      }
    }
  } catch {
    /* usamos la búsqueda local */
  }
  const near = nearestLocality(lat, lng);
  if (!near) return res.status(404).json({ error: 'No pudimos determinar tu localidad. Elegila manualmente.' });
  res.json({
    source: 'dataset',
    location: {
      provinceId: near.province_id,
      provinceName: near.province_name,
      localityId: near.id,
      localityName: near.name,
      lat,
      lng,
    },
  });
});

export default router;
