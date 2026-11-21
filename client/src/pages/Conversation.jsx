import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Send, Briefcase } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Avatar, ErrorState, PageLoader } from '../components/ui.jsx';
import { timeOnly, dateAR } from '../lib/format.js';

const POLL_MS = 6000;

export default function Conversation() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const lastCount = useRef(0);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setError('');
      try {
        const data = await api.conversation(id);
        setConversation(data.conversation);
        setMessages(data.messages || []);
      } catch (err) {
        if (!silent) setError(errorMessage(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const data = await api.sendMessage(id, { body });
      setMessages((prev) => [...prev, data.message]);
      setConversation(data.conversation);
      setText('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <PageLoader />;
  if (error) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => load()} />
      </div>
    );
  }

  const other = conversation?.otherUser;
  let lastDate = '';

  return (
    <div className="chat-page">
      <header className="chat-head">
        <Link to="/mensajes" className="icon-btn" aria-label="Volver a mensajes">
          <ChevronLeft size={20} />
        </Link>
        <Link to={other?.id ? `/usuarios/${other.id}` : '#'} className="chat-person">
          <Avatar user={other} size={38} />
          <div>
            <strong>{other?.fullName || 'Usuario'}</strong>
            <span className="small muted">Ver perfil</span>
          </div>
        </Link>
      </header>

      <Link to={`/changas/${conversation?.jobId}`} className="chat-job">
        <Briefcase size={15} />
        <span className="truncate">{conversation?.jobTitle}</span>
      </Link>

      <div className="chat-body">
        {messages.length === 0 && (
          <p className="small muted center" style={{ padding: '24px 0' }}>
            Todavía no hay mensajes. Escribí el primero para coordinar los detalles de la changa.
          </p>
        )}
        {messages.map((msg) => {
          const day = dateAR(msg.createdAt);
          const showDay = day !== lastDate;
          lastDate = day;
          return (
            <div key={msg.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <div className={`bubble-row ${msg.mine ? 'mine' : ''}`}>
                {!msg.mine && <Avatar user={other} size={26} />}
                <div className={`bubble ${msg.mine ? 'mine' : ''}`}>
                  <p>{msg.body}</p>
                  <span className="bubble-time">{timeOnly(msg.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="chat-composer">
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribí un mensaje…"
          maxLength={2000}
          aria-label="Mensaje"
        />
        <button type="submit" className="btn btn-icon" disabled={sending || !text.trim()} aria-label="Enviar mensaje">
          {sending ? <span className="spinner" /> : <Send size={17} />}
        </button>
      </form>
      {user && <span className="sr-only">Sesión de {user.fullName}</span>}
    </div>
  );
}
