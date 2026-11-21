import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Ban,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderCog,
  LayoutGrid,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Empty, ErrorState, Field, PageLoader, SkeletonList } from '../components/ui.jsx';
import { CATEGORY_ICON_OPTIONS } from '../lib/icons.jsx';
import { dateAR, money, timeAgo } from '../lib/format.js';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3 },
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'publicaciones', label: 'Publicaciones', icon: LayoutGrid },
  { id: 'reportes', label: 'Reportes', icon: ShieldAlert },
  { id: 'categorias', label: 'Categorías', icon: FolderCog },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
  { id: 'actividad', label: 'Actividad', icon: Activity },
];

const JOB_STATUS_OPTIONS = [
  ['', 'Todos los estados'],
  ['activa', 'Activa'],
  ['en_seleccion', 'En selección'],
  ['trabajador_seleccionado', 'Trabajador seleccionado'],
  ['en_curso', 'En curso'],
  ['pendiente_confirmacion', 'Pendiente de confirmación'],
  ['completada', 'Completada'],
  ['cancelada', 'Cancelada'],
  ['pausada', 'Pausada'],
];

function Stat({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

export default function Admin() {
  const { user, toast } = useApp();
  const [tab, setTab] = useState('resumen');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userStatus, setUserStatus] = useState('');
  const [jobQuery, setJobQuery] = useState('');
  const [jobStatus, setJobStatus] = useState('');
  const [reportStatus, setReportStatus] = useState('abierto');
  const [newCategory, setNewCategory] = useState({ name: '', icon: 'LayoutGrid' });
  const [busyId, setBusyId] = useState('');

  const loadStats = useCallback(async () => {
    const data = await api.adminStats();
    setStats(data);
  }, []);

  const loadUsers = useCallback(async () => {
    const data = await api.adminUsers({ q: userQuery || undefined, status: userStatus || undefined });
    setUsers(data.users || []);
  }, [userQuery, userStatus]);

  const loadJobs = useCallback(async () => {
    const data = await api.adminJobs({ q: jobQuery || undefined, status: jobStatus || undefined });
    setJobs(data.jobs || []);
  }, [jobQuery, jobStatus]);

  const loadReports = useCallback(async () => {
    const data = await api.adminReports({ status: reportStatus || undefined });
    setReports(data.reports || []);
  }, [reportStatus]);

  const loadCategories = useCallback(async () => {
    const data = await api.adminCategories();
    setCategories(data.categories || []);
  }, []);

  const loadSettings = useCallback(async () => {
    const data = await api.adminSettings();
    setSettings(data.settings || {});
  }, []);

  const loadActivity = useCallback(async () => {
    const data = await api.adminActivity();
    setActivity(data.activity || []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadStats();
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadStats]);

  useEffect(() => {
    if (tab === 'usuarios') loadUsers().catch((err) => toast(errorMessage(err), 'error'));
    if (tab === 'publicaciones') loadJobs().catch((err) => toast(errorMessage(err), 'error'));
    if (tab === 'reportes') loadReports().catch((err) => toast(errorMessage(err), 'error'));
    if (tab === 'categorias') loadCategories().catch((err) => toast(errorMessage(err), 'error'));
    if (tab === 'configuracion') loadSettings().catch((err) => toast(errorMessage(err), 'error'));
    if (tab === 'actividad') loadActivity().catch((err) => toast(errorMessage(err), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function runAction(key, action, successMessage) {
    setBusyId(key);
    try {
      await action();
      toast(successMessage);
      if (tab === 'usuarios') await loadUsers();
      if (tab === 'publicaciones') await loadJobs();
      if (tab === 'reportes') await loadReports();
      if (tab === 'categorias') await loadCategories();
      await loadStats();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId('');
    }
  }

  async function suspend(target) {
    const reason = window.prompt(`Motivo de la suspensión de ${target.fullName || 'este usuario'} (opcional):`) ?? null;
    if (reason === null) return;
    await runAction(
      `user-${target.id}`,
      () => api.adminUserAction(target.id, 'suspend', { reason }),
      'Usuario suspendido.',
    );
  }

  async function saveCategory(category, patch) {
    await runAction(
      `cat-${category.id}`,
      () => api.adminUpdateCategory(category.id, patch),
      'Categoría actualizada.',
    );
  }

  async function createCategory(event) {
    event.preventDefault();
    if (newCategory.name.trim().length < 3) {
      toast('El nombre debe tener al menos 3 caracteres.', 'error');
      return;
    }
    await runAction(
      'new-cat',
      async () => {
        await api.adminCreateCategory({ name: newCategory.name.trim(), icon: newCategory.icon });
        setNewCategory({ name: '', icon: 'LayoutGrid' });
      },
      'Categoría creada.',
    );
  }

  async function saveSettings(event) {
    event.preventDefault();
    await runAction('settings', () => api.adminUpdateSettings(settings), 'Configuración guardada.');
  }

  if (loading) return <PageLoader />;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => window.location.reload()} /></div>;
  if (user?.role !== 'admin') {
    return (
      <div className="page narrow">
        <Empty icon={ShieldAlert} title="Acceso restringido" text="Este panel es solo para administradores." />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Panel de administración</h1>
        <p>Moderación, usuarios y configuración de CHANGAPP.</p>
      </header>

      <nav className="admin-tabs" aria-label="Secciones de administración">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`admin-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} /> {label}
            {id === 'reportes' && stats?.stats?.pendingReports > 0 && (
              <span className="pill-count">{stats.stats.pendingReports}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'resumen' && stats && (
        <>
          <div className="stat-grid">
            <Stat label="Usuarios registrados" value={stats.stats.users} hint={`${stats.stats.newUsers} nuevos esta semana`} />
            <Stat label="Publicaciones totales" value={stats.stats.jobs} />
            <Stat label="Publicaciones activas" value={stats.stats.activeJobs} />
            <Stat label="Postulaciones" value={stats.stats.applications} />
            <Stat label="Trabajos completados" value={stats.stats.completedJobs} />
            <Stat label="Reportes pendientes" value={stats.stats.pendingReports} />
            <Stat label="Mensajes" value={stats.stats.messages} />
            <Stat label="Calificaciones" value={stats.stats.reviews} />
          </div>

          <section className="stack">
            <h2 className="section-title">Últimas publicaciones</h2>
            <div className="table-wrap card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Autor</th>
                    <th>Ubicación</th>
                    <th>Pago total</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentJobs.map((job) => (
                    <tr key={job.id}>
                      <td><Link to={`/changas/${job.id}`}>{job.title}</Link></td>
                      <td>{job.ownerName || '—'}</td>
                      <td>{job.locality || '—'}</td>
                      <td>{money(job.payTotal)}</td>
                      <td><span className="badge">{job.status}</span></td>
                      <td>{dateAR(job.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="stack">
            <h2 className="section-title">Reportes recientes</h2>
            {stats.recentReports.length === 0 ? (
              <p className="small muted">No hay reportes registrados.</p>
            ) : (
              stats.recentReports.map((report) => (
                <div key={report.id} className="card row between">
                  <div>
                    <strong className="small">{report.reason}</strong>
                    <p className="small muted">
                      {report.targetType === 'user' ? 'Usuario' : 'Publicación'} · {timeAgo(report.createdAt)}
                    </p>
                  </div>
                  <span className={`badge ${report.status === 'abierto' ? 'warn' : 'ok'}`}>{report.status}</span>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {tab === 'usuarios' && (
        <>
          <div className="row wrap filters-row">
            <div className="search-inline">
              <Search size={16} />
              <input
                className="input"
                placeholder="Buscar por nombre o email"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
            </div>
            <select className="select sm" value={userStatus} onChange={(e) => setUserStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="suspended">Suspendidos</option>
            </select>
            <button type="button" className="btn sm" onClick={() => loadUsers()}>
              Buscar
            </button>
          </div>

          {users.length === 0 ? (
            <Empty icon={Users} title="Sin resultados" text="No encontramos usuarios con esos criterios." />
          ) : (
            <div className="table-wrap card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Ubicación</th>
                    <th>Changas</th>
                    <th>Postulaciones</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/usuarios/${row.id}`}>{row.fullName}</Link></td>
                      <td className="small">{row.email}</td>
                      <td className="small">{row.localityName ? `${row.localityName}, ${row.provinceName}` : '—'}</td>
                      <td>{row.jobsCount}</td>
                      <td>{row.applicationsCount}</td>
                      <td>
                        <span className={`badge ${row.status === 'suspended' ? 'danger' : 'ok'}`}>
                          {row.status === 'suspended' ? 'Suspendido' : 'Activo'}
                        </span>
                        {row.role === 'admin' && <span className="badge">Admin</span>}
                      </td>
                      <td>
                        {row.role === 'admin' ? (
                          <span className="small muted">—</span>
                        ) : row.status === 'suspended' ? (
                          <button
                            type="button"
                            className="btn xs outline"
                            disabled={busyId === `user-${row.id}`}
                            onClick={() =>
                              runAction(
                                `user-${row.id}`,
                                () => api.adminUserAction(row.id, 'reactivate'),
                                'Usuario reactivado.',
                              )
                            }
                          >
                            <UserCheck size={13} /> Reactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn xs ghost danger-text"
                            disabled={busyId === `user-${row.id}`}
                            onClick={() => suspend(row)}
                          >
                            <Ban size={13} /> Suspender
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'publicaciones' && (
        <>
          <div className="row wrap filters-row">
            <div className="search-inline">
              <Search size={16} />
              <input
                className="input"
                placeholder="Buscar por título o localidad"
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
              />
            </div>
            <select className="select sm" value={jobStatus} onChange={(e) => setJobStatus(e.target.value)}>
              {JOB_STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="button" className="btn sm" onClick={() => loadJobs()}>
              Buscar
            </button>
          </div>

          {jobs.length === 0 ? (
            <Empty icon={LayoutGrid} title="Sin publicaciones" text="No hay publicaciones con esos criterios." />
          ) : (
            <div className="table-wrap card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Changa</th>
                    <th>Autor</th>
                    <th>Ubicación</th>
                    <th>Pago total</th>
                    <th>Postulaciones</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link to={`/changas/${job.id}`}>{job.title}</Link>
                        {job.adminHidden && <span className="badge warn">Oculta</span>}
                        {job.deletedAt && <span className="badge danger">Eliminada</span>}
                      </td>
                      <td className="small">{job.ownerName || '—'}</td>
                      <td className="small">{job.locality ? `${job.locality}, ${job.province}` : '—'}</td>
                      <td>{money(job.payTotal)}</td>
                      <td>{job.applicationCount}</td>
                      <td><span className="badge">{job.status}</span></td>
                      <td className="row" style={{ gap: 4 }}>
                        {job.adminHidden ? (
                          <button
                            type="button"
                            className="btn xs outline"
                            disabled={busyId === `job-${job.id}`}
                            onClick={() =>
                              runAction(`job-${job.id}`, () => api.adminJobAction(job.id, 'unhide'), 'Publicación restaurada.')
                            }
                          >
                            <RotateCcw size={13} /> Restaurar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn xs outline"
                            disabled={busyId === `job-${job.id}`}
                            onClick={() =>
                              runAction(`job-${job.id}`, () => api.adminJobAction(job.id, 'hide'), 'Publicación ocultada.')
                            }
                          >
                            <EyeOff size={13} /> Ocultar
                          </button>
                        )}
                        {!job.deletedAt && (
                          <button
                            type="button"
                            className="btn xs ghost danger-text"
                            disabled={busyId === `job-${job.id}`}
                            onClick={() =>
                              runAction(`job-${job.id}`, () => api.adminJobAction(job.id, 'delete'), 'Publicación eliminada.')
                            }
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'reportes' && (
        <>
          <div className="row wrap filters-row">
            <select className="select sm" value={reportStatus} onChange={(e) => setReportStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="abierto">Abiertos</option>
              <option value="resuelto">Resueltos</option>
            </select>
            <button type="button" className="btn sm" onClick={() => loadReports()}>
              Actualizar
            </button>
          </div>

          {reports.length === 0 ? (
            <Empty icon={CheckCircle2} title="Sin reportes" text="No hay reportes con ese estado." />
          ) : (
            reports.map((report) => (
              <article key={report.id} className="card stack">
                <div className="row between">
                  <div>
                    <strong>{report.reason}</strong>
                    <p className="small muted">
                      Denunciado: {report.targetName || report.targetUserId || report.targetId} · Denunciante:{' '}
                      {report.reporterName || report.reporterEmail || '—'}
                    </p>
                    <p className="small muted">
                      {report.targetType === 'user' ? 'Usuario' : 'Publicación'} · {dateAR(report.createdAt)}
                    </p>
                  </div>
                  <span className={`badge ${report.status === 'abierto' ? 'warn' : 'ok'}`}>{report.status}</span>
                </div>
                {report.details && <p className="small">{report.details}</p>}
                <div className="row wrap" style={{ gap: 8 }}>
                  {report.targetType === 'job' && (
                    <Link to={`/changas/${report.targetId}`} className="btn xs outline">
                      <Eye size={13} /> Ver publicación
                    </Link>
                  )}
                  {report.targetUserId && (
                    <Link to={`/usuarios/${report.targetUserId}`} className="btn xs outline">
                      <Eye size={13} /> Ver perfil
                    </Link>
                  )}
                  {report.status === 'abierto' && (
                    <button
                      type="button"
                      className="btn xs"
                      disabled={busyId === `report-${report.id}`}
                      onClick={() => {
                        const note = window.prompt('Resolución del reporte (opcional):') ?? '';
                        runAction(
                          `report-${report.id}`,
                          () => api.adminResolveReport(report.id, { note }),
                          'Reporte resuelto.',
                        );
                      }}
                    >
                      <CheckCircle2 size={13} /> Resolver
                    </button>
                  )}
                  {report.resolutionNote && <span className="small muted">Resolución: {report.resolutionNote}</span>}
                </div>
              </article>
            ))
          )}
        </>
      )}

      {tab === 'categorias' && (
        <>
          <form onSubmit={createCategory} className="card row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
            <Field label="Nueva categoría" htmlFor="new-cat">
              <input
                id="new-cat"
                className="input"
                placeholder="Ej.: Herrería"
                value={newCategory.name}
                onChange={(e) => setNewCategory((c) => ({ ...c, name: e.target.value }))}
              />
            </Field>
            <Field label="Icono" htmlFor="new-cat-icon">
              <select
                id="new-cat-icon"
                className="select"
                value={newCategory.icon}
                onChange={(e) => setNewCategory((c) => ({ ...c, icon: e.target.value }))}
              >
                {CATEGORY_ICON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <button type="submit" className="btn" disabled={busyId === 'new-cat'}>
              Crear
            </button>
          </form>

          <div className="table-wrap card">
            <table className="table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Icono</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td className="small">{category.icon}</td>
                    <td>
                      <span className={`badge ${category.active ? 'ok' : 'warn'}`}>
                        {category.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn xs outline"
                        disabled={busyId === `cat-${category.id}`}
                        onClick={() => saveCategory(category, { active: category.active ? 0 : 1 })}
                      >
                        {category.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'configuracion' && settings && (
        <form onSubmit={saveSettings} className="card stack">
          <Field label="Nombre de la aplicación" htmlFor="app-name">
            <input
              id="app-name"
              className="input"
              value={settings.app_name || ''}
              onChange={(e) => setSettings((s) => ({ ...s, app_name: e.target.value }))}
            />
          </Field>
          <Field label="Eslogan" htmlFor="slogan">
            <input
              id="slogan"
              className="input"
              value={settings.slogan || ''}
              onChange={(e) => setSettings((s) => ({ ...s, slogan: e.target.value }))}
            />
          </Field>
          <Field label="Email de soporte" htmlFor="support-email">
            <input
              id="support-email"
              className="input"
              type="email"
              value={settings.support_email || ''}
              onChange={(e) => setSettings((s) => ({ ...s, support_email: e.target.value }))}
            />
          </Field>
          <Field label="Título de bienvenida" htmlFor="welcome-title">
            <input
              id="welcome-title"
              className="input"
              value={settings.welcome_title || ''}
              onChange={(e) => setSettings((s) => ({ ...s, welcome_title: e.target.value }))}
            />
          </Field>
          <Field label="Subtítulo de bienvenida" htmlFor="welcome-subtitle">
            <input
              id="welcome-subtitle"
              className="input"
              value={settings.welcome_subtitle || ''}
              onChange={(e) => setSettings((s) => ({ ...s, welcome_subtitle: e.target.value }))}
            />
          </Field>
          <div className="row wrap" style={{ gap: 16 }}>
            <Field label="Registro abierto" htmlFor="registrations-open">
              <select
                id="registrations-open"
                className="select"
                value={settings.registrations_open || 'true'}
                onChange={(e) => setSettings((s) => ({ ...s, registrations_open: e.target.value }))}
              >
                <option value="true">Sí, permitir registros</option>
                <option value="false">No, cerrar registros</option>
              </select>
            </Field>
            <Field label="Edad mínima" htmlFor="min-age">
              <input
                id="min-age"
                className="input"
                type="number"
                min={18}
                max={99}
                value={settings.min_age || '18'}
                onChange={(e) => setSettings((s) => ({ ...s, min_age: e.target.value }))}
              />
            </Field>
          </div>
          <button type="submit" className="btn" disabled={busyId === 'settings'}>
            Guardar configuración
          </button>
        </form>
      )}

      {tab === 'actividad' && (
        <>
          {activity.length === 0 ? (
            <Empty icon={Activity} title="Sin actividad" text="Las acciones administrativas van a aparecer acá." />
          ) : (
            <ul className="activity-list card">
              {activity.map((item) => (
                <li key={item.id}>
                  <span className="grow">
                    <strong className="small">{item.action}</strong>
                    <span className="small muted">
                      {' '}
                      {item.targetType || item.target_type || ''} {item.detail ? `· ${item.detail}` : ''}
                    </span>
                  </span>
                  <span className="small muted">{timeAgo(item.createdAt || item.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
