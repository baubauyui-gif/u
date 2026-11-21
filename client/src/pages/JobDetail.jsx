import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  Flag,
  HandCoins,
  MapPin,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  ShieldAlert,
  Star,
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
  Ban,
  ArrowRight,
} from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Avatar, ErrorState, Field, Modal, PageLoader, RatingInline, Stars } from '../components/ui.jsx';
import { CategoryIcon } from '../lib/icons.jsx';
import { dateAR, dateTimeAR, money, payTypeLabel, relative, statusTone, timeAR } from '../lib/format.js';

const CONFIRM_STATUS = 'pendiente_confirmacion';

export default function JobDetail() {
  const { id } = useParams();
  const { user, toast, refresh } = useApp();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ message: '', offeredPrice: '', availability: '', extraInfo: '', rating: 5, comment: '', reason: '', note: '', reportReason: '' });
  const [formError, setFormError] = useState('');
  const [reasons, setReasons] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.job(id);
      setJob(data.job);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = Boolean(job && user && job.ownerId === user.id);
  const isWorker = Boolean(job && user && job.workerId === user.id);
  const isParticipant = isOwner || isWorker;

  const actions = useMemo(() => {
    if (!job) return {};
    return {
      canEdit: isOwner && ['activa', 'en_seleccion', 'pausada'].includes(job.status),
      canPause: isOwner && ['activa', 'en_seleccion'].includes(job.status),
      canResume: isOwner && job.status === 'pausada',
      canDelete: isOwner && !['en_curso', CONFIRM_STATUS].includes(job.status),
      canCancel: isOwner && !['completada', 'cancelada'].includes(job.status),
      canStart: isParticipant && job.status === 'trabajador_seleccionado',
      canRequestCompletion: isParticipant && ['en_curso', 'trabajador_seleccionado'].includes(job.status),
      canConfirm:
        isParticipant &&
        job.status === CONFIRM_STATUS &&
        ((isOwner && !job.ownerConfirmed) || (isWorker && !job.workerConfirmed)),
    };
  }, [job, isOwner, isWorker, isParticipant]);

  async function run(label, fn) {
    setBusy(label);
    setFormError('');
    try {
      await fn();
      await load();
      await refresh();
    } catch (err) {
      const message = errorMessage(err);
      setFormError(message);
      toast(message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function jobAction(action, body, successMessage) {
    await run(action, async () => {
      await api.jobAction(id, action, body);
      setModal(null);
      toast(successMessage);
    });
  }

  async function submitApplication(event) {
    event.preventDefault();
    setFormError('');
    if (form.message.trim().length < 10) {
      setFormError('Escribí un mensaje de presentación de al menos 10 caracteres.');
      return;
    }
    await run('apply', async () => {
      await api.apply(id, {
        message: form.message.trim(),
        offeredPrice: form.offeredPrice === '' ? undefined : Number(String(form.offeredPrice).replace(/[^\d]/g, '')),
        availability: form.availability.trim() || undefined,
        extraInfo: form.extraInfo.trim() || undefined,
      });
      setModal(null);
      toast('¡Te postulaste! Ya podés conversar con el publicador.');
    });
  }

  async function openChat() {
    await run('chat', async () => {
      const { conversation } = await api.openConversation(id);
      navigate(`/mensajes/${conversation.id}`);
    });
  }

  async function decide(applicationId, decision) {
    await run(applicationId, async () => {
      await api.applicationAction(applicationId, decision);
      toast(decision === 'accept' ? 'Seleccionaste a esta persona para tu changa.' : 'Rechazaste la postulación.');
    });
  }

  async function submitReview(event) {
    event.preventDefault();
    await run('review', async () => {
      await api.review({ jobId: id, rating: Number(form.rating), comment: form.comment.trim() || undefined });
      setModal(null);
      toast('¡Gracias! Tu calificación quedó guardada.');
    });
  }

  async function submitReport(event) {
    event.preventDefault();
    setFormError('');
    if (!form.reportReason) {
      setFormError('Elegí un motivo.');
      return;
    }
    await run('report', async () => {
      await api.report({
        targetType: 'job',
        targetId: id,
        reason: form.reportReason,
        details: form.note.trim() || undefined,
      });
      setModal(null);
      toast('Recibimos tu reporte. Nuestro equipo lo va a revisar.');
    });
  }

  async function blockOwner() {
    await run('block', async () => {
      await api.block(job.ownerId);
      setModal(null);
      toast('Bloqueaste a esta persona. No volverán a aparecer sus publicaciones.');
    });
  }

  function openReport() {
    setForm((f) => ({ ...f, reportReason: '', note: '' }));
    setModal('report');
    if (!reasons.length) api.reportReasons().then((data) => setReasons(data.reasons || [])).catch(() => {});
  }

  if (loading) return <PageLoader label="Cargando changa…" />;
  if (error) {
    return (
      <div className="page narrow">
        <ErrorState message={error} onRetry={load} />
        <div className="center mt-2">
          <Link to="/" className="btn outline sm">
            Volver a explorar
          </Link>
        </div>
      </div>
    );
  }
  if (!job) return null;

  const myApp = job.myApplication;
  const closed = !job.isOpen;

  return (
    <div className="page narrow">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        <ChevronLeft size={17} /> Volver
      </button>

      <article className="card detail-card">
        {job.image && (
          <div className="detail-image">
            <img src={job.image} alt={job.title} />
          </div>
        )}

        <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="cat-badge sm">
              <CategoryIcon name={job.categoryIcon} size={20} />
            </div>
            <div>
              <span className="badge muted">{job.categoryName}</span>
              <h1 className="detail-title">{job.title}</h1>
            </div>
          </div>
          <span className={`badge ${statusTone(job.status)}`}>{job.statusLabel}</span>
        </div>

        <div className="detail-pay">
          <div>
            <span className="label">Pago total</span>
            <strong>{money(job.payTotal)}</strong>
            <small>{payTypeLabel(job.payType)}</small>
          </div>
          {job.distanceKm != null && (
            <span className="badge info">
              <MapPin size={11} /> A {job.distanceKm} km
            </span>
          )}
        </div>

        <div className="detail-meta">
          <span className="meta-item">
            <MapPin size={14} /> {job.locationLabel}
          </span>
          <span className="meta-item">
            <CalendarDays size={14} /> {dateAR(job.workDate)}
          </span>
          <span className="meta-item">
            <Clock size={14} /> {timeAR(job.workTime)}
          </span>
          {job.duration && (
            <span className="meta-item">
              <Clock size={14} /> {job.duration}
            </span>
          )}
          <span className="meta-item">
            <Users size={14} /> {job.applicationCount} {job.applicationCount === 1 ? 'postulación' : 'postulaciones'}
          </span>
        </div>

        <div className="detail-body">
          <h2>Descripción</h2>
          <p className="pre-line">{job.description}</p>
          {job.extraInfo && (
            <>
              <h3>Información adicional</h3>
              <p className="pre-line">{job.extraInfo}</p>
            </>
          )}
        </div>

        <p className="small muted">Publicada {relative(job.createdAt).toLowerCase()}. Ubicación aproximada, sin domicilio exacto.</p>

        {job.hasDispute && (
          <div className="alert warn">
            <ShieldAlert size={16} /> Se informó un problema en esta changa. El equipo de CHANGAPP está revisando el caso.
          </div>
        )}

        {job.status === 'cancelada' && (
          <div className="alert danger">
            <Ban size={16} /> Esta changa fue cancelada. {job.cancelReason ? `Motivo: ${job.cancelReason}` : ''}
          </div>
        )}
      </article>

      <section className="card owner-card">
        <Link to={`/usuario/${job.ownerId}`} className="owner-link">
          <Avatar user={job.owner} size={46} />
          <div className="grow">
            <strong>{job.owner?.fullName}</strong>
            <div className="small muted">
              {job.owner?.localityName ? `${job.owner.localityName}, ${job.owner.provinceName}` : 'Ubicación no indicada'}
            </div>
            <RatingInline rating={job.owner?.rating} jobsCompleted={job.owner?.jobsCompleted} />
          </div>
          <ArrowRight size={16} />
        </Link>
      </section>

      {user && !isOwner && (
        <div className="action-stack">
          {job.canApply && (
            <button
              type="button"
              className="btn block"
              onClick={() => {
                setFormError('');
                setModal('apply');
              }}
            >
              <HandCoins size={17} /> Postularme
            </button>
          )}

          {myApp && !job.canApply && (
            <div className="card compact">
              <div className="row between">
                <span className="small muted">Tu postulación</span>
                <span className={`badge ${myApp.status === 'aceptada' ? 'ok' : myApp.status === 'rechazada' ? 'danger' : 'info'}`}>
                  {myApp.statusLabel}
                </span>
              </div>
              {myApp.offeredPrice != null && <p className="small">Precio ofrecido: {money(myApp.offeredPrice)}</p>}
              {myApp.status === 'pendiente' && (
                <button
                  type="button"
                  className="btn ghost sm mt-1"
                  onClick={() => jobAction('withdraw-application', null)}
                  disabled={busy !== ''}
                  style={{ display: 'none' }}
                >
                  Retirar
                </button>
              )}
              {myApp.status === 'pendiente' && (
                <button
                  type="button"
                  className="btn outline sm mt-1"
                  onClick={() =>
                    run('withdraw', async () => {
                      await api.applicationAction(myApp.id, 'withdraw');
                      toast('Retiraste tu postulación.');
                    })
                  }
                  disabled={busy !== ''}
                >
                  Retirar postulación
                </button>
              )}
            </div>
          )}

          {(job.conversationId || myApp) && !job.blocked && (
            <button type="button" className="btn outline block" onClick={openChat} disabled={busy !== ''}>
              <MessageSquare size={16} /> {busy === 'chat' ? 'Abriendo chat…' : 'Enviar mensaje'}
            </button>
          )}

          {closed && !myApp && (
            <div className="alert info">
              <XCircle size={15} /> Esta changa ya no acepta nuevas postulaciones.
            </div>
          )}

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost sm" onClick={openReport}>
              <Flag size={14} /> Reportar publicación
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setModal('block')}>
              <Ban size={14} /> Bloquear usuario
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <section className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Gestioná tu changa</h2>
            <span className={`badge ${statusTone(job.status)}`}>{job.statusLabel}</span>
          </div>
          <div className="owner-actions">
            {actions.canEdit && (
              <Link to={`/changa/${job.id}/editar`} className="btn outline sm">
                <Pencil size={14} /> Editar
              </Link>
            )}
            {actions.canPause && (
              <button type="button" className="btn outline sm" onClick={() => jobAction('pause', null, 'Tu changa quedó en pausa.')} disabled={busy !== ''}>
                <Pause size={14} /> Pausar
              </button>
            )}
            {actions.canResume && (
              <button type="button" className="btn outline sm" onClick={() => jobAction('resume', null, 'Tu changa está activa otra vez.')} disabled={busy !== ''}>
                <Play size={14} /> Reactivar
              </button>
            )}
            {actions.canDelete && (
              <button type="button" className="btn ghost sm danger-text" onClick={() => setModal('delete')} disabled={busy !== ''}>
                <Trash2 size={14} /> Eliminar
              </button>
            )}
            {actions.canCancel && (
              <button type="button" className="btn ghost sm" onClick={() => setModal('cancel')} disabled={busy !== ''}>
                <Ban size={14} /> Cancelar
              </button>
            )}
            <a href="#postulaciones" className="btn ghost sm">
              <Users size={14} /> Ver postulaciones ({job.applicationCount})
            </a>
          </div>
        </section>
      )}

      {isParticipant && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Estado del trabajo</h2>
          <p className="small muted">
            {job.status === 'trabajador_seleccionado' && 'Ya hay una persona seleccionada. Cuando empiece el trabajo, marcalo como en curso.'}
            {job.status === 'en_curso' && 'El trabajo está en curso. Al terminarlo, pedí la confirmación de la otra parte.'}
            {job.status === CONFIRM_STATUS &&
              `Finalización pendiente: ${job.ownerConfirmed ? 'el publicador confirmó' : 'el publicador todavía no confirmó'} · ${
                job.workerConfirmed ? 'el trabajador confirmó' : 'el trabajador todavía no confirmó'
              }.`}
            {job.status === 'completada' && `Trabajo completado el ${dateAR(job.completedAt)}.`}
          </p>

          <div className="action-stack">
            {actions.canStart && (
              <button type="button" className="btn block" onClick={() => jobAction('start', null, 'El trabajo está en curso.')} disabled={busy !== ''}>
                <Play size={16} /> Iniciar trabajo
              </button>
            )}
            {actions.canRequestCompletion && (
              <button
                type="button"
                className="btn block"
                onClick={() => jobAction('request-completion', null, 'Pedimos la confirmación de finalización a la otra parte.')}
                disabled={busy !== ''}
              >
                <CheckCircle2 size={16} /> Solicitar confirmación de finalización
              </button>
            )}
            {actions.canConfirm && (
              <button type="button" className="btn block" onClick={() => jobAction('confirm', null, 'Registramos tu confirmación.')} disabled={busy !== ''}>
                <CheckCircle2 size={16} /> Confirmar que el trabajo terminó
              </button>
            )}
            {isParticipant && !['completada', 'cancelada'].includes(job.status) && (
              <button type="button" className="btn ghost sm" onClick={() => setModal('dispute')} disabled={busy !== ''}>
                <ShieldAlert size={14} /> Informar un problema
              </button>
            )}
            {job.canReview && (
              <button type="button" className="btn block" onClick={() => setModal('review')}>
                <Star size={16} /> Calificar a la otra parte
              </button>
            )}
            {job.myReview && (
              <div className="alert ok">
                <Stars value={job.myReview.rating} /> Tu calificación: {job.myReview.rating} de 5
                {job.myReview.comment ? ` — “${job.myReview.comment}”` : ''}
              </div>
            )}
            {job.conversationId && (
              <button type="button" className="btn outline block" onClick={openChat} disabled={busy !== ''}>
                <MessageSquare size={16} /> Abrir conversación
              </button>
            )}
          </div>
        </section>
      )}

      {isOwner && (
        <section className="card" id="postulaciones">
          <h2 style={{ marginTop: 0 }}>Postulaciones recibidas</h2>
          {(!job.applications || job.applications.length === 0) && (
            <p className="muted small">Todavía no recibiste postulaciones. Compartí tu changa para llegar a más personas.</p>
          )}
          <div className="stack">
            {(job.applications || []).map((app) => (
              <div key={app.id} className="application-card">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <Link to={`/usuario/${app.applicantId}`} className="owner-link">
                    <Avatar user={app.applicant} size={40} />
                    <div>
                      <strong>{app.applicant?.fullName}</strong>
                      <div>
                        <RatingInline rating={app.applicant?.rating} jobsCompleted={app.applicant?.jobsCompleted} />
                      </div>
                    </div>
                  </Link>
                  <span className={`badge ${app.status === 'aceptada' ? 'ok' : app.status === 'rechazada' ? 'danger' : app.status === 'retirada' ? 'muted' : 'info'}`}>
                    {app.statusLabel}
                  </span>
                </div>
                <p className="pre-line small">{app.message}</p>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {app.offeredPrice != null && <span className="badge muted">Ofrece: {money(app.offeredPrice)}</span>}
                  {app.availability && <span className="badge muted">Disponibilidad: {app.availability}</span>}
                  <span className="badge muted">{relative(app.createdAt)}</span>
                </div>
                {app.status === 'pendiente' && job.isOpen && (
                  <div className="row mt-1" style={{ gap: 8 }}>
                    <button type="button" className="btn sm grow" onClick={() => decide(app.id, 'accept')} disabled={busy !== ''}>
                      <CheckCircle2 size={15} /> Aceptar
                    </button>
                    <button type="button" className="btn outline sm grow" onClick={() => decide(app.id, 'reject')} disabled={busy !== ''}>
                      <XCircle size={15} /> Rechazar
                    </button>
                  </div>
                )}
                {app.status === 'aceptada' && (
                  <p className="small" style={{ color: '#426B35', marginBottom: 0 }}>
                    <CheckCircle2 size={13} /> Seleccionaste a esta persona para tu changa.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {isParticipant && job.history?.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Historial</h2>
          <ul className="timeline">
            {job.history.map((entry) => (
              <li key={entry.id}>
                <span className="dot" />
                <div>
                  <strong>{entry.toLabel}</strong>
                  {entry.note && <p className="small">{entry.note}</p>}
                  <span className="small muted">{dateTimeAR(entry.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={modal === 'apply'} onClose={() => setModal(null)} title="Postulate a esta changa" description={`${job.title} · ${money(job.payTotal)}`}>
        <form onSubmit={submitApplication} className="form-grid">
          <Field label="Mensaje de presentación" htmlFor="app-message" hint="Contá por qué sos la persona indicada (mínimo 10 caracteres).">
            <textarea
              id="app-message"
              className="textarea"
              rows={4}
              maxLength={1500}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Hola, tengo experiencia en este tipo de trabajos y puedo hacerlo el día indicado."
            />
          </Field>
          <Field label="Precio ofrecido (opcional)" htmlFor="app-price" hint={`Pago total publicado: ${money(job.payTotal)}`}>
            <input
              id="app-price"
              className="input"
              type="number"
              min="0"
              inputMode="numeric"
              value={form.offeredPrice}
              onChange={(e) => setForm((f) => ({ ...f, offeredPrice: e.target.value }))}
              placeholder="Dejalo vacío para aceptar el pago publicado"
            />
          </Field>
          <Field label="Disponibilidad (opcional)" htmlFor="app-availability">
            <input
              id="app-availability"
              className="input"
              maxLength={200}
              value={form.availability}
              onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))}
              placeholder="Ej.: sábado por la mañana"
            />
          </Field>
          {formError && <div className="form-error">{formError}</div>}
          <button type="submit" className="btn block" disabled={busy !== ''}>
            {busy === 'apply' ? <span className="spinner" /> : <HandCoins size={16} />}
            {busy === 'apply' ? 'Enviando…' : 'Enviar postulación'}
          </button>
        </form>
      </Modal>

      <Modal open={modal === 'review'} onClose={() => setModal(null)} title="Calificar a la otra parte" description="Solo podés calificar trabajos completados.">
        <form onSubmit={submitReview} className="form-grid">
          <Field label="Puntaje" htmlFor="review-rating">
            <div className="rating-input">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`star-btn ${Number(form.rating) >= n ? 'on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, rating: n }))}
                  aria-label={`${n} estrellas`}
                >
                  <Star size={26} fill={Number(form.rating) >= n ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Opinión (opcional)" htmlFor="review-comment">
            <textarea
              id="review-comment"
              className="textarea"
              rows={3}
              maxLength={1000}
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Contá cómo fue trabajar con esta persona."
            />
          </Field>
          {formError && <div className="form-error">{formError}</div>}
          <button type="submit" className="btn block" disabled={busy !== ''}>
            {busy === 'review' ? <span className="spinner" /> : <Star size={16} />} Enviar calificación
          </button>
        </form>
      </Modal>

      <Modal open={modal === 'cancel'} onClose={() => setModal(null)} title="Cancelar changa" description="Se avisará a todas las personas que se postularon.">
        <div className="form-grid">
          <Field label="Motivo (opcional)" htmlFor="cancel-reason">
            <input
              id="cancel-reason"
              className="input"
              maxLength={500}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Ej.: se resolvió de otra manera"
            />
          </Field>
          {formError && <div className="form-error">{formError}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn outline grow" onClick={() => setModal(null)}>
              Volver
            </button>
            <button
              type="button"
              className="btn danger grow"
              disabled={busy !== ''}
              onClick={() => jobAction('cancel', { reason: form.reason.trim() || undefined }, 'La changa quedó cancelada.')}
            >
              Cancelar changa
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Eliminar publicación" description="Esta acción quita la changa de CHANGAPP y la marca como cancelada.">
        <div className="form-grid">
          {formError && <div className="form-error">{formError}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn outline grow" onClick={() => setModal(null)}>
              Volver
            </button>
            <button
              type="button"
              className="btn danger grow"
              disabled={busy !== ''}
              onClick={async () => {
                setBusy('delete');
                try {
                  await api.deleteJob(id);
                  toast('Eliminamos tu publicación.');
                  navigate('/perfil');
                } catch (err) {
                  const message = errorMessage(err);
                  setFormError(message);
                  toast(message, 'error');
                  setBusy('');
                }
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'dispute'} onClose={() => setModal(null)} title="Informar un problema" description="El equipo de CHANGAPP va a revisar el caso.">
        <div className="form-grid">
          <Field label="Contanos qué pasó" htmlFor="dispute-note" hint="Mínimo 10 caracteres.">
            <textarea
              id="dispute-note"
              className="textarea"
              rows={4}
              maxLength={1000}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </Field>
          {formError && <div className="form-error">{formError}</div>}
          <button
            type="button"
            className="btn block"
            disabled={busy !== '' || form.note.trim().length < 10}
            onClick={() => jobAction('dispute', { note: form.note.trim() }, 'Recibimos tu aviso. El equipo lo va a revisar.')}
          >
            Enviar aviso
          </button>
        </div>
      </Modal>

      <Modal open={modal === 'report'} onClose={() => setModal(null)} title="Reportar publicación" description="Contanos qué problema tiene esta changa.">
        <form onSubmit={submitReport} className="form-grid">
          <Field label="Motivo" htmlFor="report-reason">
            <select
              id="report-reason"
              className="select"
              value={form.reportReason}
              onChange={(e) => setForm((f) => ({ ...f, reportReason: e.target.value }))}
            >
              <option value="">Elegí un motivo</option>
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Detalle (opcional)" htmlFor="report-detail">
            <textarea
              id="report-detail"
              className="textarea"
              rows={3}
              maxLength={1000}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </Field>
          {formError && <div className="form-error">{formError}</div>}
          <button type="submit" className="btn block" disabled={busy !== ''}>
            <Flag size={16} /> Enviar reporte
          </button>
        </form>
      </Modal>

      <Modal open={modal === 'block'} onClose={() => setModal(null)} title="Bloquear usuario" description="Dejarás de ver sus publicaciones y no podrán contactarte.">
        <div className="form-grid">
          <p className="small muted">
            Vas a bloquear a {job.owner?.fullName}. Podés desbloquearlo cuando quieras desde tu configuración.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn outline grow" onClick={() => setModal(null)}>
              Volver
            </button>
            <button type="button" className="btn danger grow" onClick={blockOwner} disabled={busy !== ''}>
              Bloquear
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
