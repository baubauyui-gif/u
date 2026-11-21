import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Compass } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import LocationPicker from '../components/LocationPicker.jsx';

export default function LocationSetup() {
  const { user, setUser } = useApp();
  const navigate = useNavigate();

  return (
    <div className="page auth-page">
      <div className="auth-brand">
        <div className="brand-mark big">
          <MapPin size={22} />
        </div>
        <div>
          <div className="brand-text big">
            CHANG<span>APP</span>
          </div>
          <p className="small muted">Conectamos personas con oportunidades.</p>
        </div>
      </div>

      <div className="card form-card">
        <header className="page-head" style={{ marginBottom: 4 }}>
          <h1>¿Dónde querés encontrar changas?</h1>
          <p>Elegí tu ubicación para mostrarte oportunidades cerca tuyo.</p>
        </header>

        <LocationPicker
          value={
            user
              ? {
                  provinceId: user.provinceId,
                  provinceName: user.provinceName,
                  localityId: user.localityId,
                  localityName: user.localityName,
                  lat: user.lat,
                  lng: user.lng,
                  locationMode: user.locationMode,
                }
              : undefined
          }
          submitLabel="Guardar y continuar"
          onSaved={() => navigate('/', { replace: true })}
        />

        <button type="button" className="btn ghost block" onClick={() => navigate('/', { replace: true })}>
          <Compass size={16} /> Explorar por ahora
        </button>
        <p className="small muted center">
          Podés cambiar tu ubicación cuando quieras desde el encabezado o desde{' '}
          <Link to="/perfil" className="link">
            Configuración
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
