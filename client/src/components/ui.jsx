import { useEffect } from 'react';
import { X, Star, Inbox, AlertTriangle } from 'lucide-react';
import { initials } from '../lib/format.js';

export function Avatar({ user, size = 40, name }) {
  const label = name || user?.fullName || '';
  const src = user?.avatar;
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };
  if (src) {
    return <img className="avatar" src={src} alt={label || 'Foto de perfil'} style={style} />;
  }
  return (
    <div className="avatar-fallback" style={style} aria-hidden="true">
      {initials(label)}
    </div>
  );
}

export function Stars({ value = 0, size = 13, showEmpty = true }) {
  const rounded = Math.round(Number(value) || 0);
  if (!showEmpty && !rounded) return null;
  return (
    <span className="stars" aria-label={`${value || 0} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={2}
          fill={n <= rounded ? 'currentColor' : 'none'}
          color={n <= rounded ? 'currentColor' : '#cbd5e1'}
        />
      ))}
    </span>
  );
}

export function RatingInline({ rating, jobsCompleted }) {
  if (!rating) return null;
  if (!rating.count) {
    return <span className="rating-inline">Sin calificaciones todavía</span>;
  }
  return (
    <span className="rating-inline">
      <Star size={12} fill="currentColor" color="#F59E0B" />
      <strong>{rating.average}</strong>
      <span>
        ({rating.count} {rating.count === 1 ? 'opinión' : 'opiniones'})
      </span>
      {jobsCompleted > 0 && <span>· {jobsCompleted} trabajos</span>}
    </span>
  );
}

export function Empty({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={24} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function PageLoader({ label = 'Cargando…' }) {
  return (
    <div className="page-loader">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonList({ count = 3 }) {
  return (
    <div className="job-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon" style={{ background: '#fdeaea', color: '#b91c1c' }}>
        <AlertTriangle size={24} />
      </div>
      <h3>Algo salió mal</h3>
      <p>{message || 'Algo salió mal. Intentá nuevamente.'}</p>
      {onRetry && (
        <button type="button" className="btn outline sm" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
