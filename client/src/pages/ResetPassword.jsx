import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, KeyRound } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Field } from '../components/ui.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { toast } = useApp();
  const [form, setForm] = useState({ password: '', passwordConfirm: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) setServerError('El enlace no es válido. Pedí uno nuevo desde "Olvidé mi contraseña".');
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setServerError('');
    const next = {};
    if (form.password.length < 8) next.password = 'La contraseña debe tener al menos 8 caracteres.';
    if (form.password !== form.passwordConfirm) next.passwordConfirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await api.resetPassword({ token, password: form.password, passwordConfirm: form.passwordConfirm });
      toast('Tu contraseña se actualizó. Ya podés ingresar.');
      navigate('/ingresar', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
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
          <h1>Creá una contraseña nueva</h1>
          <p>Elegí una contraseña segura de al menos 8 caracteres.</p>
        </header>

        <Field label="Contraseña nueva" htmlFor="password" error={errors.password}>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </Field>
        <Field label="Confirmación de contraseña" htmlFor="passwordConfirm" error={errors.passwordConfirm}>
          <input
            id="passwordConfirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.passwordConfirm}
            onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
          />
        </Field>

        {serverError && <div className="form-error">{serverError}</div>}

        <button type="submit" className="btn block" disabled={busy || !token}>
          {busy ? <span className="spinner" /> : <KeyRound size={16} />}
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  );
}
