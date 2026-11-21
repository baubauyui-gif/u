import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Mail, Send } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { Field } from '../components/ui.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Ingresá un email válido.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.forgotPassword({ email: email.trim() });
      setResult(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page auth-page narrow">
      <Link to="/ingresar" className="back-link">
        <ChevronLeft size={17} /> Volver a ingresar
      </Link>

      <form onSubmit={submit} className="card form-card" noValidate>
        <header className="page-head" style={{ marginBottom: 4 }}>
          <h1>Recuperá tu contraseña</h1>
          <p>Te enviamos un enlace para crear una contraseña nueva.</p>
        </header>

        {!result ? (
          <>
            <Field label="Email de tu cuenta" htmlFor="email" error={error}>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
              />
            </Field>
            <button type="submit" className="btn block" disabled={busy}>
              {busy ? <span className="spinner" /> : <Send size={16} />}
              {busy ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </>
        ) : (
          <div className="form-success">
            <Mail size={16} />
            <div>
              <strong>{result.message}</strong>
              {result.mailConfigured === false && (
                <p className="small muted" style={{ marginTop: 6 }}>
                  El envío de emails todavía no está configurado en este entorno. Si sos administrador, revisá la configuración de correo; el
                  enlace queda registrado en el servidor para pruebas.
                </p>
              )}
            </div>
          </div>
        )}

        <p className="small muted center">
          ¿Ya recordaste tu contraseña?{' '}
          <Link to="/ingresar" className="link">
            Ingresar
          </Link>
        </p>
      </form>
    </div>
  );
}
