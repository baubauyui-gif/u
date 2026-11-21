export const money = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '$ 0';
  return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(number))}`;
};

export const dateAR = (value) => {
  if (!value) return '';
  const iso = String(value).length === 10 ? `${value}T12:00:00` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const timeAR = (value) => {
  if (!value) return '';
  const [h, m] = String(value).split(':');
  if (h === undefined) return String(value);
  return `${String(h).padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`;
};

export const dateTimeAR = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString(
    'es-AR',
    { hour: '2-digit', minute: '2-digit', hour12: false },
  )}`;
};

export const timeOnly = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const relative = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return dateAR(value);
};

export const initials = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'CH';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

export const payTypeLabel = (type) => (type === 'negociable' ? 'Pago negociable' : 'Pago fijo');

export const statusTone = (status) => {
  switch (status) {
    case 'activa':
      return 'ok';
    case 'en_seleccion':
    case 'trabajador_seleccionado':
      return 'info';
    case 'en_curso':
      return 'info';
    case 'pendiente_confirmacion':
      return 'warn';
    case 'completada':
      return 'ok';
    case 'cancelada':
      return 'danger';
    case 'pausada':
      return 'muted';
    default:
      return 'muted';
  }
};

export const applicationTone = (status) => {
  switch (status) {
    case 'aceptada':
      return 'ok';
    case 'pendiente':
      return 'info';
    case 'rechazada':
    case 'cancelada':
      return 'danger';
    case 'retirada':
      return 'muted';
    default:
      return 'muted';
  }
};

export const isFutureDate = (value) => {
  if (!value) return false;
  const d = new Date(`${value}T23:59:59`);
  return d.getTime() >= Date.now() - 24 * 60 * 60 * 1000;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
