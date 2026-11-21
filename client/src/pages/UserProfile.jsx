import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, Flag, MapPin, ShieldCheck, Star } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Avatar, Empty, ErrorState, Field, Modal, PageLoader, RatingInline, Stars } from '../components/ui.jsx';
import JobCard from '../components/JobCard.jsx';
import { dateAR } from '../lib/format.js';

export default function UserProfile() {
  const { id } = useParams();
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reasons, setReasons] = useState([]);
  const [reportForm, setReportForm] = useState({ reason: '', details: '' });
  const [reportError, setReportError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const payload = await api.user(id);
      setData(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!reportOpen) return;
    api
      .reportReasons()
      .then((d) => setReasons(d.reasons || []))
      .catch(() => setReasons([]));
  }, [reportOpen]);

  async function toggleBlock() {
    try {
      if (data.blocked) await api.unblock(id);
      else await api.block(id);
      toast(data.blocked ? 'Desbloqueaste a este usuario.' : 'Bloqueaste a este usuario.');
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function sendReport(event) {
    event.preventDefault();
    setReportError('');
    if (!reportForm.reason) {
      setReportError('Elegí un motivo.');
      return;
    }
    setSending(true);
    try {
      await api.report({ targetType: 'user', targetId: id, reason: reportForm.reason, details: reportForm.details });
      setReportOpen(false);
      setReportForm({ reason: '', details: '' });
      toast('Recibimos tu reporte. Nuestro equipo lo va a revisar.');
    } catch (err) {
      setReportError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <PageLoader />;
  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!data) return null;

  const { user, stats, jobs, reviews, blocked, isSelf } = data;

  return (
    <div className="page">
      <header className="profile-head card">
        <Avatar user={user} size={72} />
        <div className="grow">
          <h1 className="profile-name">{user.fullName}</h1>
          <p className="small muted row" style={{ gap: 6 }}>
            <MapPin size={13} /> {user.localityName ? `${user.localityName}, ${user.provinceName}` : 'Ubicación no informada'}
          </p>
          <div className="row mt-1 wrap" style={{ gap: 8 }}>
            <RatingInline rating={stats.rating} />
            <span className="badge">{stats.completedJobs} trabajos completados</span>
            <span className="badge">{stats.publishedJobs} publicaciones</span>
            <span className="badge">{dateAR(user.createdAt) ? `Desde ${dateAR(user.createdAt)}` : ''}</span>
          </div>
        </div>
      </header>

      {user.bio && (
        <div className="card">
          <h2 className="section-title">Presentación</h2>
          <p className="small">{user.bio}</p>
        </div>
      )}

      {!isSelf && (
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn sm outline" onClick={toggleBlock}>
            <Ban size={14} /> {blocked ? 'Desbloquear' : 'Bloquear usuario'}
          </button>
          <button type="button" className="btn sm ghost" onClick={() => setReportOpen(true)}>
            <Flag size={14} /> Reportar usuario
          </button>
        </div>
      )}

      {blocked && (
        <div className="notice warn">
          <ShieldCheck size={15} /> Bloqueaste a este usuario: no pueden enviarse mensajes ni postularse entre ustedes.
        </div>
      )}

      <section className="stack">
        <h2 className="section-title">Changas activas</h2>
        {jobs.length === 0 ? (
          <Empty icon={Star} title="Sin changas activas" text="Este usuario no tiene publicaciones activas en este momento." />
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">Opiniones ({stats.rating?.count || 0})</h2>
        {reviews.length === 0 ? (
          <p className="small muted">Todavía no recibió calificaciones.</p>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="card">
              <div className="row between">
                <div className="row" style={{ gap: 10 }}>
                  <Avatar user={review.author} size={34} />
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

      <Modal open={reportOpen} title="Reportar usuario" onClose={() => setReportOpen(false)}>
        <form onSubmit={sendReport} className="stack">
          <Field label="Motivo" htmlFor="report-reason">
            <select
              id="report-reason"
              className="select"
              value={reportForm.reason}
              onChange={(e) => setReportForm((f) => ({ ...f, reason: e.target.value }))}
            >
              <option value="">Elegí un motivo</option>
              {reasons.map((r) => (
                <option key={r.value || r} value={r.value || r}>
                  {r.label || r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Detalles (opcional)" htmlFor="report-details">
            <textarea
              id="report-details"
              className="textarea"
              rows={4}
              maxLength={600}
              value={reportForm.details}
              onChange={(e) => setReportForm((f) => ({ ...f, details: e.target.value }))}
            />
          </Field>
          {reportError && <div className="form-error">{reportError}</div>}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={() => setReportOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={sending}>
              {sending ? <span className="spinner" /> : <Flag size={15} />} Enviar reporte
            </button>
          </div>
        </form>
      </Modal>

      {isSelf && (
        <Link to="/perfil" className="btn outline">
          Ir a mi perfil
        </Link>
      )}
    </div>
  );
}
