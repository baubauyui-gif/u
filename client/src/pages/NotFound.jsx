import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="page narrow center-page">
      <div className="empty">
        <div className="empty-icon">
          <Compass size={26} />
        </div>
        <h2>No encontramos esta página</h2>
        <p>Puede que el enlace esté mal escrito o que el contenido ya no esté disponible.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="btn">
            <Home size={16} /> Volver a Explorar
          </Link>
        </div>
      </div>
    </div>
  );
}
