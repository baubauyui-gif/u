import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { Avatar, Empty, ErrorState, SkeletonList } from '../components/ui.jsx';
import { timeAgo } from '../lib/format.js';

export default function Messages() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.conversations();
      setConversations(data.conversations || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Mensajes</h1>
        <p>Tus conversaciones con publicadores y postulantes.</p>
      </header>

      {loading && <SkeletonList count={3} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && conversations.length === 0 && (
        <Empty
          icon={MessageSquare}
          title="Todavía no tenés mensajes"
          text="Tus conversaciones aparecerán acá cuando empieces a conectar con otras personas."
          action={
            <Link to="/" className="btn">
              Explorar changas
            </Link>
          }
        />
      )}

      {!loading && !error && conversations.length > 0 && (
        <ul className="conv-list">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <Link to={`/mensajes/${conv.id}`} className={`conv-item ${conv.unreadCount > 0 ? 'unread' : ''}`}>
                <Avatar user={conv.otherUser} size={46} />
                <div className="conv-body">
                  <div className="row between">
                    <strong className="conv-name">{conv.otherUser?.fullName || 'Usuario'}</strong>
                    <span className="small muted">{timeAgo(conv.lastMessageAt)}</span>
                  </div>
                  <span className="small muted conv-job">{conv.jobTitle}</span>
                  <div className="row between">
                    <span className="conv-preview">
                      {conv.lastMessage ? `${conv.lastMessage.mine ? 'Vos: ' : ''}${conv.lastMessage.body}` : 'Todavía no hay mensajes'}
                    </span>
                    {conv.unreadCount > 0 && <span className="badge badge-lime">{conv.unreadCount}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
