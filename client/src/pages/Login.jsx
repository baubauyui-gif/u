import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LogIn } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { errorMessage } from '../api.js';
import { Field } from '../components/ui.jsx';

export default function Login() {
  const { login, toast } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setServerError('');
    const next_ = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next_.email = 'Ingresá un email válido.';
    if (!form.password) next_.password = 'Ingresá tu contraseña.';
    setErrors(next_);
    if (Object.keys(next_).length) return;

    setBusy(true);
    try {
      const user = await login({ email: form.email.trim(), password: form.password });
      toast(`¡Hola de nuevo, ${user.firstName}!`);
      navigate(next.startsWith('/') ? next : '/', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page auth-page">
      <div className="auth-brand">
        <div className="brand-mark big">C</div>
        <div>
          <div className="brand-text big">
            CHANG<span>APP</span>
          </div>
          <p className="small muted">Conectamos personas con oportunidades.</p>
        </div>
      </div>

      <form onSubmit={submit} className="card form-card" noValidate>
        <header className="page-head" style={{ marginBottom: 4 }}>
          <h1>Ingresá a tu cuenta</h1>
          <p>Encontrá changas, ofrecé tus servicios y generá nuevas oportunidades cerca tuyo.</p>
        </header>

        <Field label="Email" htmlFor="email" error={errors.email}>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="tucorreo@ejemplo.com"
          />
        </Field>

        <Field label="Contraseña" htmlFor="password" error={errors.password}>
          <div className="input-with-action">
            <input
              id="password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Tu contraseña"
            />
            <button type="button" className="input-action" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <div className="row between">
          <Link to="/recuperar" className="link small">
            Olvidé mi contraseña
          </Link>
        </div>

        {serverError && <div className="form-error">{serverError}</div>}

        <button type="submit" className="btn block" disabled={busy}>
          {busy ? <span className="spinner" /> : <LogIn size={17} />}
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="small muted center">
          ¿Todavía no tenés cuenta?{' '}
          <Link to="/registrar" className="link">
            Crear cuenta <ArrowRight size={12} />
          </Link>
        </p>
      </form>
    </div>
  );
}
