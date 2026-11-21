import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, MessageSquare, Star, Briefcase, Inbox, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Empty, ErrorState, SkeletonList } from '../components/ui.jsx';
import { timeAgo } from '../lib/format.js';

const ICONS = {
  mensaje: MessageSquare,
  postulacion: Inbox,
  propuesta: Inbox,
  calificacion: Star,
  trabajo: Briefcase,
  cuenta: ShieldCheck,
};

export default function Notifications() {
  const navigate = useNavigate();
  const { setUnread, toast } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.notifications();
      setItems(data.notifications || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function open(item) {
    try {
      if (!item.read) {
        await api.readNotification(item.id);
        setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
        setUnread((u) => ({ ...u, notifications: Math.max(0, (u.notifications || 0) - 1) }));
      }
    } catch {
      /* la navegación no debe bloquearse por el estado de lectura */
    }
    if (item.link) navigate(item.link);
  }

  async function readAll() {
    setBusy(true);
    try {
      await api.readAllNotifications();
      setItems((list) => list.map((n) => ({ ...n, read: true })));
      setUnread((u) => ({ ...u, notifications: 0 }));
      toast('Marcamos todas las notificaciones como leídas.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="page">
      <header className="page-head row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>Notificaciones</h1>
          <p>{unreadCount > 0 ? `Tenés ${unreadCount} sin leer.` : 'Estás al día.'}</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="btn sm outline" onClick={readAll} disabled={busy}>
            <CheckCheck size={15} /> Marcar todas
          </button>
        )}
      </header>

      {loading && <SkeletonList count={4} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <Empty icon={Bell} title="No tenés notificaciones" text="Acá vas a ver postulaciones, mensajes y novedades de tus changas." />
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="notif-list">
          {items.map((item) => {
            const Icon = ICONS[item.type] || Bell;
            return (
              <li key={item.id}>
                <button type="button" className={`notif-item ${item.read ? '' : 'unread'}`} onClick={() => open(item)}>
                  <span className="notif-icon">
                    <Icon size={16} />
                  </span>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <span className="notif-title">{item.title}</span>
                    {item.body && <span className="notif-body">{item.body}</span>}
                    <span className="small muted">{timeAgo(item.createdAt)}</span>
                  </span>
                  {!item.read && <span className="dot" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
