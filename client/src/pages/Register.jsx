import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { errorMessage } from '../api.js';
import { Field } from '../components/ui.jsx';

export default function Register() {
  const { register, toast } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    birthDate: '',
    password: '',
    passwordConfirm: '',
    acceptTerms: false,
    acceptPrivacy: false,
    acceptAdult: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function validate() {
    const next = {};
    if (form.firstName.trim().length < 2) next.firstName = 'Ingresá tu nombre.';
    if (form.lastName.trim().length < 2) next.lastName = 'Ingresá tu apellido.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next.email = 'Ingresá un email válido.';
    if (!form.birthDate) next.birthDate = 'Indicá tu fecha de nacimiento.';
    else {
      const born = new Date(`${form.birthDate}T12:00:00`);
      const age = (Date.now() - born.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (Number.isNaN(age) || age < 18) next.birthDate = 'CHANGAPP es solo para personas mayores de 18 años.';
    }
    if (form.password.length < 8) next.password = 'La contraseña debe tener al menos 8 caracteres.';
    if (form.password !== form.passwordConfirm) next.passwordConfirm = 'Las contraseñas no coinciden.';
    if (!form.acceptTerms) next.acceptTerms = 'Tenés que aceptar los términos y condiciones.';
    if (!form.acceptPrivacy) next.acceptPrivacy = 'Tenés que aceptar la política de privacidad.';
    if (!form.acceptAdult) next.acceptAdult = 'Confirmá que sos mayor de 18 años.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setServerError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const user = await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        birthDate: form.birthDate,
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        acceptTerms: true,
        acceptPrivacy: true,
      });
      toast(`¡Bienvenido/a a CHANGAPP, ${user.firstName}!`);
      navigate('/ubicacion', { replace: true });
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
          <h1>Creá tu cuenta</h1>
          <p>Publicá changas, postulate y generá nuevas oportunidades cerca tuyo.</p>
        </header>

        <div className="form-grid-2">
          <Field label="Nombre" htmlFor="firstName" error={errors.firstName}>
            <input id="firstName" className="input" autoComplete="given-name" maxLength={60} value={form.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Apellido" htmlFor="lastName" error={errors.lastName}>
            <input id="lastName" className="input" autoComplete="family-name" maxLength={60} value={form.lastName} onChange={set('lastName')} />
          </Field>
        </div>

        <Field label="Email" htmlFor="email" error={errors.email}>
          <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="tucorreo@ejemplo.com" />
        </Field>

        <Field label="Fecha de nacimiento" htmlFor="birthDate" error={errors.birthDate} hint="CHANGAPP es para personas mayores de 18 años.">
          <input id="birthDate" className="input" type="date" value={form.birthDate} onChange={set('birthDate')} max={new Date().toISOString().slice(0, 10)} />
        </Field>

        <Field label="Contraseña" htmlFor="password" error={errors.password} hint="Mínimo 8 caracteres.">
          <div className="input-with-action">
            <input
              id="password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
            />
            <button type="button" className="input-action" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <Field label="Confirmación de contraseña" htmlFor="passwordConfirm" error={errors.passwordConfirm}>
          <input
            id="passwordConfirm"
            className="input"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.passwordConfirm}
            onChange={set('passwordConfirm')}
          />
        </Field>

        <div className="check-group">
          <label className="check">
            <input type="checkbox" checked={form.acceptAdult} onChange={set('acceptAdult')} />
            <span>Confirmo que soy mayor de 18 años.</span>
          </label>
          {errors.acceptAdult && <div className="field-error">{errors.acceptAdult}</div>}

          <label className="check">
            <input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} />
            <span>
              Acepto los{' '}
              <Link to="/terminos" className="link" target="_blank" rel="noreferrer">
                términos y condiciones
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms && <div className="field-error">{errors.acceptTerms}</div>}

          <label className="check">
            <input type="checkbox" checked={form.acceptPrivacy} onChange={set('acceptPrivacy')} />
            <span>
              Acepto la{' '}
              <Link to="/privacidad" className="link" target="_blank" rel="noreferrer">
                política de privacidad
              </Link>
              .
            </span>
          </label>
          {errors.acceptPrivacy && <div className="field-error">{errors.acceptPrivacy}</div>}
        </div>

        {serverError && <div className="form-error">{serverError}</div>}

        <button type="submit" className="btn block" disabled={busy}>
          {busy ? <span className="spinner" /> : <UserPlus size={17} />}
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        <p className="small muted center">
          <ShieldCheck size={12} /> No compartimos tus datos personales ni tu email.
        </p>
        <p className="small muted center">
          ¿Ya tenés cuenta?{' '}
          <Link to="/ingresar" className="link">
            Ingresar <ArrowRight size={12} />
          </Link>
        </p>
      </form>
    </div>
  );
}
