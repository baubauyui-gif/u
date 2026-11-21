import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Compass, PlusCircle, MessageSquare, User, Bell, MapPin, ShieldCheck, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { Avatar, Modal } from './ui.jsx';
import LocationPicker from './LocationPicker.jsx';

const NAV = [
  { to: '/', label: 'Explorar', icon: Compass, end: true },
  { to: '/publicar', label: 'Publicar', icon: PlusCircle },
  { to: '/mensajes', label: 'Mensajes', icon: MessageSquare, badge: 'messages' },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export default function Layout({ children }) {
  const { user, unread, logout, toast } = useApp();
  const [locationOpen, setLocationOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const unreadNotifications = unread?.notifications || 0;
  const unreadMessages = unread?.messages || 0;

  async function handleLogout() {
    await logout();
    toast('Cerraste sesión.');
    navigate('/');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="CHANGAPP inicio">
            <span className="brand-mark">C</span>
            <span className="brand-text">
              CHANG<span>APP</span>
            </span>
          </Link>

          <button type="button" className="location-pill" onClick={() => setLocationOpen(true)}>
            <MapPin size={14} />
            <span className="ellipsis">{user?.localityName ? `${user.localityName}, ${user.provinceName}` : 'Elegir ubicación'}</span>
          </button>

          <div className="header-actions">
            {user?.role === 'admin' && (
              <NavLink to="/admin" className="icon-btn" aria-label="Panel de administración" title="Administración">
                <ShieldCheck size={19} />
              </NavLink>
            )}
            <NavLink to="/notificaciones" className="icon-btn" aria-label="Notificaciones" title="Notificaciones">
              <Bell size={19} />
              {unreadNotifications > 0 && <span className="dot-count">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
            </NavLink>
            {user ? (
              <Link to="/perfil" className="header-avatar" aria-label="Mi perfil">
                <Avatar user={user} size={32} />
              </Link>
            ) : (
              <Link to="/ingresar" className="btn sm">
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <nav className="sidebar-nav">
            {NAV.map((item) => {
              const Icon = item.icon;
              const count = item.badge === 'messages' ? unreadMessages : 0;
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className="sidebar-link">
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {count > 0 && <span className="sidebar-count">{count}</span>}
                </NavLink>
              );
            })}
            {user?.role === 'admin' && (
              <NavLink to="/admin" className="sidebar-link">
                <ShieldCheck size={19} />
                <span>Administración</span>
              </NavLink>
            )}
          </nav>

          <div className="sidebar-foot">
            {user ? (
              <>
                <Link to="/perfil" className="sidebar-user">
                  <Avatar user={user} size={36} />
                  <span className="grow">
                    <span className="title">{user.fullName}</span>
                    <span className="sub">{user.localityName || 'Sin ubicación'}</span>
                  </span>
                </Link>
                <button type="button" className="sidebar-link" onClick={handleLogout}>
                  <LogOut size={18} />
                  <span>Cerrar sesión</span>
                </button>
              </>
            ) : (
              <div className="sidebar-cta">
                <strong>Conectamos personas con oportunidades.</strong>
                <Link to="/registrar" className="btn block sm">
                  Crear cuenta
                </Link>
              </div>
            )}
          </div>
        </aside>

        <main className="app-main" key={location.pathname}>
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegación principal">
        {NAV.map((item) => {
          const Icon = item.icon;
          const count = item.badge === 'messages' ? unreadMessages : 0;
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className="bottom-link">
              <span className="bottom-icon">
                <Icon size={21} />
                {count > 0 && <span className="dot-count small">{count > 9 ? '9+' : count}</span>}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <Modal
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        title="Tu ubicación"
        description="Elegí dónde querés encontrar changas. Podés cambiarla cuando quieras."
      >
        <LocationPicker
          value={user}
          onSaved={() => setLocationOpen(false)}
          submitLabel="Guardar ubicación"
        />
      </Modal>
    </div>
  );
}
