import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Eye,
  FileText,
  Inbox,
  KeyRound,
  MapPin,
  Pause,
  Pencil,
  Play,
  ShieldCheck,
  Star,
  Trash2,
  UserCog,
  Users,
  XCircle,
  LogOut,
  Camera,
} from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Avatar, Empty, ErrorState, Field, PageLoader, RatingInline, Stars } from '../components/ui.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { dateAR, money } from '../lib/format.js';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: FileText },
  { id: 'publicaciones', label: 'Mis publicaciones', icon: Briefcase },
  { id: 'postulaciones', label: 'Mis postulaciones', icon: Inbox },
  { id: 'trabajos', label: 'Mis trabajos', icon: CheckCircle2 },
  { id: 'propuestas', label: 'Propuestas recibidas', icon: Users },
  { id: 'reputacion', label: 'Mi reputación', icon: Star },
  { id: 'configuracion', label: 'Configuración', icon: UserCog },
];

async function fileToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const max = 400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export default function Profile() {
  const { user, setUser, refresh, logout, toast } = useApp();
  const [tab, setTab] = useState('resumen');
  const [data, setData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [profile, jobs, works, applications, proposals] = await Promise.all([
        api.profile(),
        api.myJobs(),
        api.myWorks(),
        api.myApplications(),
        api.myProposals(),
      ]);
      setData({
        stats: profile.stats || {},
        jobs: jobs.jobs || [],
        works: works.jobs || [],
        applications: applications.applications || [],
        proposals: proposals.applications || [],
      });
      const [reviewData, blockData] = await Promise.all([
        api.userReviews(profile.user?.id || user?.id),
        api.blocks().catch(() => ({ blocks: [] })),
      ]);
      setReviews(reviewData.reviews || []);
      setBlocks(blockData.blocks || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(kind, id, action) {
    setBusyId(`${kind}:${id}:${action}`);
    try {
      if (kind === 'job') {
        if (action === 'delete') await api.deleteJob(id);
        else await api.jobAction(id, action);
      } else {
        await api.applicationAction(id, action);
      }
      toast('Listo, actualizamos la información.');
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId('');
    }
  }

  const counts = useMemo(() => {
    if (!data) return { active: 0, pending: 0, inProgress: 0, done: 0 };
    return {
      active: data.jobs.filter((j) => ['activa', 'en_seleccion'].includes(j.status)).length,
      pending: data.applications.filter((a) => a.status === 'pendiente').length,
      inProgress: data.works.filter((j) => ['trabajador_seleccionado', 'en_curso', 'pendiente_confirmacion'].includes(j.status)).length,
      done: data.works.filter((j) => j.status === 'completada').length,
    };
  }, [data]);

  if (loading) return <PageLoader />;
  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!user) return null;

  return (
    <div className="page">
      <header className="profile-head card">
        <Avatar user={user} size={72} />
        <div className="grow">
          <h1 className="profile-name">{user.fullName}</h1>
          <p className="small muted row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <MapPin size={13} /> {user.localityName ? `${user.localityName}, ${user.provinceName}` : 'Ubicación sin configurar'}
          </p>
          <div className="row mt-1" style={{ gap: 8, flexWrap: 'wrap' }}>
            <RatingInline rating={data.stats.rating || { average: 0, count: 0 }} />
            <span className="badge">{counts.done} trabajos completados</span>
            <span className="badge">{data.stats.publishedJobs ?? data.jobs.length} publicaciones</span>
          </div>
        </div>
        <Link to="/publicar" className="btn sm hide-sm">
          Publicar changa
        </Link>
      </header>

      <nav className="tabs" aria-label="Secciones del perfil">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={15} /> <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {tab === 'resumen' && (
        <section className="stack">
          <div className="stat-grid">
            <div className="stat card">
              <span className="stat-label">Calificación</span>
              <strong className="stat-value">{(data.stats.rating?.average || 0).toFixed(1)}</strong>
              <span className="small muted">{data.stats.rating?.count || 0} opiniones</span>
            </div>
            <div className="stat card">
              <span className="stat-label">Publicaciones activas</span>
              <strong className="stat-value">{counts.active}</strong>
              <span className="small muted">de {data.jobs.length} en total</span>
            </div>
            <div className="stat card">
              <span className="stat-label">Postulaciones pendientes</span>
              <strong className="stat-value">{counts.pending}</strong>
              <span className="small muted">de {data.applications.length} enviadas</span>
            </div>
            <div className="stat card">
              <span className="stat-label">Trabajos completados</span>
              <strong className="stat-value">{counts.done}</strong>
              <span className="small muted">{counts.inProgress} en curso</span>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Presentación</h2>
            <p className="muted small">{user.bio || 'Todavía no agregaste una presentación. Contá qué sabés hacer desde Configuración.'}</p>
            <p className="small muted mt-1">En CHANGAPP desde el {dateAR(user.createdAt)}</p>
          </div>

          <div className="card">
            <h2 className="section-title">Accesos rápidos</h2>
            <div className="row wrap" style={{ gap: 8 }}>
              <Link to="/publicar" className="btn sm">
                Publicar changa
              </Link>
              <Link to="/" className="btn sm outline">
                Explorar changas
              </Link>
              <Link to="/mensajes" className="btn sm ghost">
                Ver mensajes
              </Link>
            </div>
          </div>
        </section>
      )}

      {tab === 'publicaciones' && (
        <section className="stack">
          {data.jobs.length === 0 ? (
            <Empty
              icon={Briefcase}
              title="Todavía no publicaste changas"
              text="Publicá tu primera changa y empezá a recibir postulaciones."
              action={<Link to="/publicar" className="btn">Publicar changa</Link>}
            />
          ) : (
            data.jobs.map((job) => (
              <article key={job.id} className="card job-row">
                <div className="grow">
                  <div className="row between">
                    <Link to={`/changas/${job.id}`} className="job-row-title">
                      {job.title}
                    </Link>
                    <span className={`badge ${job.status === 'activa' ? 'ok' : job.status === 'pausada' ? 'warn' : ''}`}>{job.statusLabel}</span>
                  </div>
                  <p className="small muted">
                    {job.locality}, {job.province} · {money(job.payTotal)} · {job.applicationCount || 0} postulaciones
                  </p>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <Link to={`/changas/${job.id}`} className="btn sm ghost" aria-label="Ver changa">
                    <Eye size={14} />
                  </Link>
                  <Link to={`/changas/${job.id}/editar`} className="btn sm ghost" aria-label="Editar">
                    <Pencil size={14} />
                  </Link>
                  {job.status === 'pausada' ? (
                    <button type="button" className="btn sm ghost" onClick={() => act('job', job.id, 'resume')} disabled={busyId.startsWith(`job:${job.id}`)} aria-label="Reactivar">
                      <Play size={14} />
                    </button>
                  ) : (
                    <button type="button" className="btn sm ghost" onClick={() => act('job', job.id, 'pause')} disabled={busyId.startsWith(`job:${job.id}`)} aria-label="Pausar">
                      <Pause size={14} />
                    </button>
                  )}
                  <Link to={`/changas/${job.id}`} className="btn sm outline">
                    Ver postulaciones ({job.applicationCount || 0})
                  </Link>
                  <button type="button" className="btn sm danger" onClick={() => act('job', job.id, 'delete')} disabled={busyId.startsWith(`job:${job.id}`)} aria-label="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'postulaciones' && (
        <section className="stack">
          {data.applications.length === 0 ? (
            <Empty
              icon={Inbox}
              title="Todavía no te postulaste a ninguna changa"
              text="Explorá las changas disponibles y postulate a la que mejor se adapte a vos."
              action={<Link to="/" className="btn">Explorar changas</Link>}
            />
          ) : (
            data.applications.map((app) => (
              <article key={app.id} className="card job-row">
                <div className="grow">
                  <div className="row between">
                    <Link to={`/changas/${app.jobId}`} className="job-row-title">
                      {app.job?.title || 'Changa'}
                    </Link>
                    <span className={`badge ${app.status === 'aceptada' ? 'ok' : app.status === 'rechazada' ? 'danger' : ''}`}>{app.statusLabel}</span>
                  </div>
                  <p className="small muted">
                    {app.job?.locality ? `${app.job.locality}, ${app.job.province}` : ''} · Enviada el {dateAR(app.createdAt)}
                    {app.offeredPrice ? ` · Ofreciste ${money(app.offeredPrice)}` : ''}
                  </p>
                </div>
                <Link to={`/changas/${app.jobId}`} className="btn sm outline">
                  Ver changa
                </Link>
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'trabajos' && (
        <section className="stack">
          {data.works.length === 0 ? (
            <Empty
              icon={CheckCircle2}
              title="Todavía no tenés trabajos asignados"
              text="Cuando te seleccionen para una changa, va a aparecer acá."
              action={<Link to="/" className="btn">Explorar changas</Link>}
            />
          ) : (
            ['En curso', 'Pendientes de confirmación', 'Finalizados', 'Cancelados'].map((group) => {
              const map = {
                'En curso': ['trabajador_seleccionado', 'en_curso'],
                'Pendientes de confirmación': ['pendiente_confirmacion'],
                Finalizados: ['completada'],
                Cancelados: ['cancelada'],
              };
              const items = data.works.filter((j) => map[group].includes(j.status));
              if (!items.length) return null;
              return (
                <div key={group} className="stack">
                  <h2 className="section-title">{group}</h2>
                  {items.map((job) => (
                    <article key={job.id} className="card job-row">
                      <div className="grow">
                        <Link to={`/changas/${job.id}`} className="job-row-title">
                          {job.title}
                        </Link>
                        <p className="small muted">
                          {job.locality}, {job.province} · {money(job.payTotal)} · {job.workDate ? dateAR(job.workDate) : 'Fecha a coordinar'}
                        </p>
                      </div>
                      <span className="badge ok">{job.statusLabel}</span>
                      <Link to={`/changas/${job.id}`} className="btn sm outline">
                        Abrir
                      </Link>
                    </article>
                  ))}
                </div>
              );
            })
          )}
        </section>
      )}

      {tab === 'propuestas' && (
        <section className="stack">
          {data.proposals.length === 0 ? (
            <Empty icon={Users} title="Todavía no recibiste postulaciones" text="Cuando alguien se postule a tus changas, vas a verlo acá." />
          ) : (
            data.proposals.map((app) => (
              <article key={app.id} className="card stack" style={{ gap: 10 }}>
                <div className="row between">
                  <Link to={`/usuarios/${app.applicantId}`} className="row" style={{ gap: 10 }}>
                    <Avatar user={app.applicant} size={42} />
                    <div>
                      <strong>{app.applicant?.fullName || 'Usuario'}</strong>
                      <div className="small muted">
                        <RatingInline rating={app.applicant?.rating || { average: 0, count: 0 }} />
                      </div>
                    </div>
                  </Link>
                  <span className={`badge ${app.status === 'aceptada' ? 'ok' : app.status === 'rechazada' ? 'danger' : ''}`}>{app.statusLabel}</span>
                </div>
                <p className="small muted">
                  Para: <Link to={`/changas/${app.jobId}`} className="link">{app.job?.title}</Link>
                </p>
                <p className="small">{app.message}</p>
                <div className="row wrap small muted" style={{ gap: 12 }}>
                  {app.offeredPrice ? <span>Precio ofrecido: <strong>{money(app.offeredPrice)}</strong></span> : null}
                  {app.availability ? <span>Disponibilidad: {app.availability}</span> : null}
                  <span>Enviada el {dateAR(app.createdAt)}</span>
                </div>
                {app.status === 'pendiente' && (
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn sm" onClick={() => act('application', app.id, 'accept')} disabled={busyId.startsWith(`application:${app.id}`)}>
                      <CheckCircle2 size={14} /> Aceptar
                    </button>
                    <button type="button" className="btn sm danger" onClick={() => act('application', app.id, 'reject')} disabled={busyId.startsWith(`application:${app.id}`)}>
                      <XCircle size={14} /> Rechazar
                    </button>
                    <Link to={`/changas/${app.jobId}`} className="btn sm ghost">
                      Ver changa
                    </Link>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'reputacion' && (
        <section className="stack">
          <div className="card stack">
            <div className="row between">
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>Promedio</h2>
                <div className="row" style={{ gap: 10 }}>
                  <strong style={{ fontSize: 30 }}>{(data.stats.rating?.average || 0).toFixed(1)}</strong>
                  <Stars value={data.stats.rating?.average || 0} size={18} />
                </div>
                <p className="small muted">{data.stats.rating?.count || 0} calificaciones · {counts.done} trabajos completados</p>
              </div>
              <ShieldCheck size={28} style={{ color: '#426B35' }} />
            </div>
          </div>

          {reviews.length === 0 ? (
            <Empty icon={Star} title="Todavía no tenés opiniones" text="Las calificaciones aparecen cuando completás una changa con otra persona." />
          ) : (
            reviews.map((review) => (
              <article key={review.id} className="card">
                <div className="row between">
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar user={review.author} size={36} />
                    <div>
                      <strong className="small">{review.author?.fullName || 'Usuario'}</strong>
                      <div><Stars value={review.rating} size={13} /></div>
                    </div>
                  </div>
                  <span className="small muted">{dateAR(review.createdAt)}</span>
                </div>
                {review.comment && <p className="small mt-1">{review.comment}</p>}
                {review.jobTitle && <p className="small muted">Changa: {review.jobTitle}</p>}
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'configuracion' && (
        <SettingsPanel user={user} blocks={blocks} setBlocks={setBlocks} reload={load} setUser={setUser} refresh={refresh} logout={logout} toast={toast} />
      )}
    </div>
  );
}

function SettingsPanel({ user, blocks, setBlocks, reload, setUser, refresh, logout, toast }) {
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    bio: user.bio || '',
    publicProfile: user.publicProfile !== false,
    notifications: {
      messages: user.notifications?.messages !== false,
      applications: user.notifications?.applications !== false,
      jobs: user.notifications?.jobs !== false,
    },
  });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const fileRef = useRef(null);

  async function saveProfile(event) {
    event.preventDefault();
    setProfileMsg('');
    setSavingProfile(true);
    try {
      const data = await api.updateProfile(form);
      if (data?.user) setUser(data.user);
      toast('Guardamos tus cambios.');
    } catch (err) {
      setProfileMsg(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMsg('Elegí una imagen válida.');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const data = await api.updateProfile({ avatar: dataUrl });
      if (data?.user) setUser(data.user);
      toast('Actualizamos tu foto de perfil.');
    } catch (err) {
      setProfileMsg(errorMessage(err));
    } finally {
      event.target.value = '';
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordMsg('');
    if (password.newPassword.length < 8) {
      setPasswordMsg('La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }
    if (password.newPassword !== password.newPasswordConfirm) {
      setPasswordMsg('Las contraseñas nuevas no coinciden.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(password);
      setPassword({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
      toast('Tu contraseña se actualizó.');
    } catch (err) {
      setPasswordMsg(errorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  }

  async function unblock(userId) {
    try {
      await api.unblock(userId);
      setBlocks((list) => list.filter((b) => (b.userId || b.user?.id) !== userId));
      toast('Desbloqueaste a este usuario.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <section className="stack">
      <form onSubmit={saveProfile} className="card stack">
        <h2 className="section-title">Datos del perfil</h2>
        <div className="row" style={{ gap: 14, alignItems: 'center' }}>
          <Avatar user={user} size={62} />
          <div>
            <button type="button" className="btn sm outline" onClick={() => fileRef.current?.click()}>
              <Camera size={14} /> Cambiar foto
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
            <p className="small muted mt-1">JPG o PNG, hasta 2 MB.</p>
          </div>
        </div>

        <div className="form-grid-2">
          <Field label="Nombre" htmlFor="cfg-first">
            <input id="cfg-first" className="input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          </Field>
          <Field label="Apellido" htmlFor="cfg-last">
            <input id="cfg-last" className="input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </Field>
        </div>

        <Field label="Presentación personal" htmlFor="cfg-bio" hint="Contá qué sabés hacer y cómo trabajás.">
          <textarea id="cfg-bio" className="textarea" rows={4} maxLength={600} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
        </Field>

        <div className="check-group">
          <label className="check">
            <input type="checkbox" checked={form.publicProfile} onChange={(e) => setForm((f) => ({ ...f, publicProfile: e.target.checked }))} />
            <span>Mostrar mi perfil público a otros usuarios.</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.notifications.messages}
              onChange={(e) => setForm((f) => ({ ...f, notifications: { ...f.notifications, messages: e.target.checked } }))}
            />
            <span>Recibir notificaciones de mensajes nuevos.</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.notifications.applications}
              onChange={(e) => setForm((f) => ({ ...f, notifications: { ...f.notifications, applications: e.target.checked } }))}
            />
            <span>Recibir notificaciones de postulaciones.</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.notifications.jobs}
              onChange={(e) => setForm((f) => ({ ...f, notifications: { ...f.notifications, jobs: e.target.checked } }))}
            />
            <span>Recibir novedades sobre el estado de mis trabajos.</span>
          </label>
        </div>

        {profileMsg && <div className="form-error">{profileMsg}</div>}
        <button type="submit" className="btn" disabled={savingProfile}>
          {savingProfile ? <span className="spinner" /> : <CheckCircle2 size={16} />} Guardar cambios
        </button>
      </form>

      <div className="card stack">
        <div className="row between">
          <h2 className="section-title" style={{ margin: 0 }}>Ubicación</h2>
          <button type="button" className="btn sm ghost" onClick={() => setShowLocation((v) => !v)}>
            {showLocation ? 'Cerrar' : 'Cambiar'}
          </button>
        </div>
        <p className="small muted row" style={{ gap: 6 }}>
          <MapPin size={13} /> {user.localityName ? `${user.localityName}, ${user.provinceName}` : 'Sin configurar'}
        </p>
        {showLocation && (
          <LocationPicker
            value={{
              provinceId: user.provinceId,
              provinceName: user.provinceName,
              localityId: user.localityId,
              localityName: user.localityName,
              lat: user.lat,
              lng: user.lng,
              locationMode: user.locationMode,
            }}
            submitLabel="Guardar ubicación"
            onSaved={() => {
              setShowLocation(false);
              reload?.();
            }}
          />
        )}
      </div>

      <form onSubmit={savePassword} className="card stack">
        <h2 className="section-title">Contraseña</h2>
        <Field label="Contraseña actual" htmlFor="cur-pass">
          <input id="cur-pass" className="input" type="password" autoComplete="current-password" value={password.currentPassword} onChange={(e) => setPassword((p) => ({ ...p, currentPassword: e.target.value }))} />
        </Field>
        <Field label="Contraseña nueva" htmlFor="new-pass" hint="Mínimo 8 caracteres.">
          <input id="new-pass" className="input" type="password" autoComplete="new-password" value={password.newPassword} onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))} />
        </Field>
        <Field label="Confirmación de contraseña nueva" htmlFor="new-pass-2">
          <input id="new-pass-2" className="input" type="password" autoComplete="new-password" value={password.newPasswordConfirm} onChange={(e) => setPassword((p) => ({ ...p, newPasswordConfirm: e.target.value }))} />
        </Field>
        {passwordMsg && <div className="form-error">{passwordMsg}</div>}
        <button type="submit" className="btn outline" disabled={savingPassword}>
          {savingPassword ? <span className="spinner" /> : <KeyRound size={16} />} Actualizar contraseña
        </button>
      </form>

      <div className="card stack">
        <h2 className="section-title">Usuarios bloqueados</h2>
        {blocks.length === 0 ? (
          <p className="small muted">No bloqueaste a ningún usuario.</p>
        ) : (
          blocks.map((b) => {
            const person = b.user || b;
            const id = b.userId || b.user?.id;
            return (
              <div key={id} className="row between">
                <div className="row" style={{ gap: 10 }}>
                  <Avatar user={person} size={34} />
                  <span className="small">{person.fullName || 'Usuario'}</span>
                </div>
                <button type="button" className="btn sm ghost" onClick={() => unblock(id)}>
                  Desbloquear
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="card stack">
        <h2 className="section-title">Sesión</h2>
        <p className="small muted">Tu email de cuenta es privado y nunca se muestra a otros usuarios.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn danger" onClick={() => logout()}>
            <LogOut size={16} /> Cerrar sesión
          </button>
          <Link to="/notificaciones" className="btn ghost sm">
            <Bell size={15} /> Centro de notificaciones
          </Link>
        </div>
      </div>
    </section>
  );
}
