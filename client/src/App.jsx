import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useApp } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import { PageLoader } from './components/ui.jsx';
import Explore from './pages/Explore.jsx';
import JobDetail from './pages/JobDetail.jsx';
import PublishJob from './pages/PublishJob.jsx';
import Messages from './pages/Messages.jsx';
import Conversation from './pages/Conversation.jsx';
import Profile from './pages/Profile.jsx';
import UserProfile from './pages/UserProfile.jsx';
import Notifications from './pages/Notifications.jsx';
import LocationSetup from './pages/LocationSetup.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Admin from './pages/Admin.jsx';
import Legal from './pages/Legal.jsx';
import NotFound from './pages/NotFound.jsx';

function RequireAuth({ children }) {
  const { user } = useApp();
  const location = useLocation();
  const [params] = useSearchParams();
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/ingresar?next=${encodeURIComponent(next)}`} replace />;
  }
  return children;
}

function GuestOnly({ children }) {
  const { user } = useApp();
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { loading, bootError, user } = useApp();

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="brand-mark big">C</div>
        <div className="brand-text big">
          CHANG<span>APP</span>
        </div>
        <div className="spinner" />
        <p className="small muted">Conectamos personas con oportunidades.</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="boot-screen">
        <h1>Algo salió mal</h1>
        <p className="muted">{bootError}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/changa/:id" element={<JobDetail />} />
        <Route
          path="/publicar"
          element={
            <RequireAuth>
              <PublishJob />
            </RequireAuth>
          }
        />
        <Route
          path="/changa/:id/editar"
          element={
            <RequireAuth>
              <PublishJob />
            </RequireAuth>
          }
        />
        <Route
          path="/mensajes"
          element={
            <RequireAuth>
              <Messages />
            </RequireAuth>
          }
        />
        <Route
          path="/mensajes/:id"
          element={
            <RequireAuth>
              <Conversation />
            </RequireAuth>
          }
        />
        <Route
          path="/perfil"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route path="/usuario/:id" element={<UserProfile />} />
        <Route
          path="/notificaciones"
          element={
            <RequireAuth>
              <Notifications />
            </RequireAuth>
          }
        />
        <Route
          path="/ubicacion"
          element={
            <RequireAuth>
              <LocationSetup />
            </RequireAuth>
          }
        />
        <Route path="/ingresar" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/registrar" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/recuperar" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
        <Route path="/restablecer" element={<ResetPassword />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Admin />
            </RequireAuth>
          }
        />
        <Route path="/terminos" element={<Legal kind="terms" />} />
        <Route path="/privacidad" element={<Legal kind="privacy" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {user && !user.localityName && <LocationHint />}
    </Layout>
  );
}

function LocationHint() {
  const location = useLocation();
  if (location.pathname === '/ubicacion') return null;
  return (
    <div className="location-hint">
      <span>Configurá tu ubicación para ver changas cerca tuyo.</span>
      <a href="/ubicacion" className="btn sm">
        Elegir ubicación
      </a>
    </div>
  );
}
