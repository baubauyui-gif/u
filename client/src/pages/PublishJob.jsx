import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Camera, Check, ChevronLeft, ImagePlus, Loader2, MapPin, Search, X } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Field, PageLoader } from '../components/ui.jsx';
import { money, todayISO } from '../lib/format.js';

const EMPTY = {
  title: '',
  description: '',
  categoryId: '',
  provinceId: '',
  localityId: '',
  localityName: '',
  workDate: '',
  workTime: '',
  duration: '',
  payTotal: '',
  payType: 'fijo',
  extraInfo: '',
  image: '',
};

async function fileToDataUrl(file) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
  if (file.size > 8 * 1024 * 1024) throw new Error('La imagen es muy grande. Usá una de menos de 8 MB.');
  const bitmap = await createImageBitmap(file);
  const maxSide = 1000;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.78;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 420_000 && quality > 0.35) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

export default function PublishJob() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { categories, provinces, user, toast } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [localityQuery, setLocalityQuery] = useState('');
  const [localities, setLocalities] = useState([]);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setForm((f) => ({
        ...f,
        provinceId: user?.provinceId || '',
        localityId: user?.localityId || '',
        localityName: user?.localityName || '',
      }));
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { job } = await api.job(id);
        if (!alive) return;
        if (job.ownerId !== user?.id) {
          setLoadError('Solo el autor puede editar esta changa.');
          return;
        }
        if (!['activa', 'en_seleccion', 'pausada'].includes(job.status)) {
          setLoadError('Esta changa ya no se puede editar porque está en curso o finalizada.');
          return;
        }
        setForm({
          title: job.title || '',
          description: job.description || '',
          categoryId: job.categoryId || '',
          provinceId: job.provinceId || '',
          localityId: job.localityId || '',
          localityName: job.locality || '',
          workDate: job.workDate || '',
          workTime: job.workTime || '',
          duration: job.duration || '',
          payTotal: job.payTotal != null ? String(job.payTotal) : '',
          payType: job.payType || 'fijo',
          extraInfo: job.extraInfo || '',
          image: job.image || '',
        });
      } catch (err) {
        if (alive) setLoadError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, editing, user?.id]);

  useEffect(() => {
    if (!form.provinceId) {
      setLocalities([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.localities({ provinceId: form.provinceId, q: localityQuery, limit: 30 });
        if (alive) setLocalities(data.localities || []);
      } catch {
        if (alive) setLocalities([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, localityQuery ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [form.provinceId, localityQuery]);

  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const payPreview = useMemo(() => {
    const n = Number(String(form.payTotal).replace(/[^\d]/g, ''));
    return n > 0 ? money(n) : '$ 0';
  }, [form.payTotal]);

  function validate() {
    const next = {};
    if (!form.title.trim() || form.title.trim().length < 5) next.title = 'Escribí un título de al menos 5 caracteres.';
    if (form.title.length > 120) next.title = 'El título no puede superar los 120 caracteres.';
    if (!form.description.trim() || form.description.trim().length < 20) {
      next.description = 'Contanos un poco más: al menos 20 caracteres.';
    }
    if (!form.categoryId) next.categoryId = 'Elegí una categoría.';
    if (!form.localityId) next.localityId = 'Elegí la localidad donde se realiza la changa.';
    if (!form.workDate) next.workDate = 'Indicá la fecha del trabajo.';
    else if (form.workDate < todayISO()) next.workDate = 'La fecha no puede ser anterior a hoy.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.workTime)) next.workTime = 'Indicá el horario en formato de 24 horas.';
    const pay = Number(String(form.payTotal).replace(/[^\d]/g, ''));
    if (!Number.isFinite(pay) || pay < 0) next.payTotal = 'Ingresá un pago total válido.';
    else if (form.payType === 'fijo' && pay <= 0) next.payTotal = 'Ingresá el pago total ofrecido.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setServerError('');
    if (!validate()) {
      document.querySelector('.field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId,
        localityId: form.localityId,
        workDate: form.workDate,
        workTime: form.workTime,
        duration: form.duration.trim() || undefined,
        payTotal: Number(String(form.payTotal).replace(/[^\d]/g, '')),
        payType: form.payType,
        extraInfo: form.extraInfo.trim() || undefined,
        image: form.image || undefined,
      };
      if (editing) {
        await api.updateJob(id, payload);
        toast('Guardamos los cambios de tu changa.');
        navigate(`/changa/${id}`);
      } else {
        const { job } = await api.createJob(payload);
        toast('¡Tu changa ya está publicada!');
        navigate(`/changa/${job.id}`);
      }
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  }

  async function onPickImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((f) => ({ ...f, image: dataUrl }));
    } catch (err) {
      setServerError(err.message || 'No pudimos procesar la imagen.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading) return <PageLoader label="Cargando tu changa…" />;

  if (loadError) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h3>No podemos editar esta changa</h3>
          <p>{loadError}</p>
          <Link to="/perfil" className="btn sm">
            Volver a mi perfil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        <ChevronLeft size={17} /> Volver
      </button>

      <header className="page-head">
        <h1>{editing ? 'Editar changa' : 'Publicá tu changa'}</h1>
        <p>Contanos qué necesitás y encontrá a la persona indicada.</p>
      </header>

      <form onSubmit={submit} className="card form-card" noValidate>
        <Field label="Título del trabajo" htmlFor="title" error={errors.title} hint="Ej.: Cortar el pasto de un patio chico">
          <input id="title" className="input" maxLength={120} value={form.title} onChange={set('title')} placeholder="Cortar el pasto" />
        </Field>

        <Field
          label="Descripción detallada"
          htmlFor="description"
          error={errors.description}
          hint={`${form.description.length}/3000 caracteres`}
        >
          <textarea
            id="description"
            className="textarea"
            rows={5}
            maxLength={3000}
            value={form.description}
            onChange={set('description')}
            placeholder="Detallá la tarea, el lugar aproximado, las herramientas disponibles y cualquier requisito."
          />
        </Field>

        <Field label="Categoría" htmlFor="category" error={errors.categoryId}>
          <select id="category" className="select" value={form.categoryId} onChange={set('categoryId')}>
            <option value="">Elegí una categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="form-grid-2">
          <Field label="Provincia" htmlFor="province" error={errors.localityId}>
            <select
              id="province"
              className="select"
              value={form.provinceId}
              onChange={(e) => {
                setForm((f) => ({ ...f, provinceId: e.target.value, localityId: '', localityName: '' }));
                setLocalityQuery('');
              }}
            >
              <option value="">Elegí una provincia</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Localidad" htmlFor="locality-search" hint={form.localityName ? undefined : 'Buscá y elegí de la lista'}>
            <div className="search-bar sm">
              <Search size={15} />
              <input
                id="locality-search"
                placeholder="Buscá tu localidad"
                value={localityQuery}
                onChange={(e) => setLocalityQuery(e.target.value)}
                disabled={!form.provinceId}
                autoComplete="off"
              />
              {searching && <Loader2 size={14} className="spin" />}
            </div>
          </Field>
        </div>

        {form.provinceId && (
          <div className="locality-picker-list">
            {form.localityName && (
              <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                <span className="badge ok">
                  <MapPin size={11} /> {form.localityName}
                </span>
                <span className="small muted">Ubicación aproximada, sin domicilio exacto.</span>
              </div>
            )}
            <div className="locality-options">
              {localities.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  className={`locality-option ${form.localityId === loc.id ? 'active' : ''}`}
                  onClick={() => {
                    setForm((f) => ({ ...f, localityId: loc.id, localityName: loc.name }));
                    setErrors((e) => ({ ...e, localityId: undefined }));
                  }}
                >
                  {form.localityId === loc.id && <Check size={14} />}
                  {loc.name}
                </button>
              ))}
              {!searching && localities.length === 0 && <span className="small muted">No encontramos localidades.</span>}
            </div>
          </div>
        )}

        <div className="form-grid-2">
          <Field label="Fecha del trabajo" htmlFor="workDate" error={errors.workDate}>
            <input id="workDate" className="input" type="date" min={todayISO()} value={form.workDate} onChange={set('workDate')} />
          </Field>
          <Field label="Horario" htmlFor="workTime" error={errors.workTime}>
            <input id="workTime" className="input" type="time" value={form.workTime} onChange={set('workTime')} />
          </Field>
        </div>

        <Field label="Duración aproximada" htmlFor="duration" hint="Opcional. Ej.: 2 horas, media jornada.">
          <input id="duration" className="input" maxLength={60} value={form.duration} onChange={set('duration')} placeholder="2 horas" />
        </Field>

        <div className="form-grid-2">
          <Field label="Pago total" htmlFor="payTotal" error={errors.payTotal} hint={`Se verá así: ${payPreview}`}>
            <input
              id="payTotal"
              className="input"
              type="number"
              min="0"
              step="100"
              inputMode="numeric"
              value={form.payTotal}
              onChange={set('payTotal')}
              placeholder="30000"
            />
          </Field>
          <Field label="Tipo de pago" htmlFor="payType" error={errors.payType}>
            <div className="segmented" role="group" aria-label="Tipo de pago">
              <button type="button" className={form.payType === 'fijo' ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, payType: 'fijo' }))}>
                Fijo
              </button>
              <button
                type="button"
                className={form.payType === 'negociable' ? 'active' : ''}
                onClick={() => setForm((f) => ({ ...f, payType: 'negociable' }))}
              >
                Negociable
              </button>
            </div>
          </Field>
        </div>

        <Field label="Fotografías opcionales" htmlFor="photo" hint="Una imagen ayuda a que tu changa reciba más propuestas.">
          <div className="upload-row">
            {form.image ? (
              <div className="upload-preview">
                <img src={form.image} alt="Imagen de la changa" />
                <button type="button" className="upload-remove" onClick={() => setForm((f) => ({ ...f, image: '' }))} aria-label="Quitar imagen">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" className="upload-empty" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={20} />
                <span>Agregar foto</span>
              </button>
            )}
            <input ref={fileRef} id="photo" type="file" accept="image/*" hidden onChange={onPickImage} />
            {form.image && (
              <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}>
                <Camera size={15} /> Cambiar
              </button>
            )}
          </div>
        </Field>

        <Field label="Información adicional opcional" htmlFor="extraInfo" hint="Herramientas, acceso al lugar, requisitos.">
          <textarea id="extraInfo" className="textarea" rows={3} maxLength={1000} value={form.extraInfo} onChange={set('extraInfo')} />
        </Field>

        {serverError && <div className="form-error">{serverError}</div>}

        <div className="row" style={{ gap: 10 }}>
          <button type="submit" className="btn grow" disabled={saving}>
            {saving ? <span className="spinner" /> : <Check size={17} />}
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Publicar changa'}
          </button>
        </div>
        <p className="small muted center" style={{ marginTop: 4 }}>
          Tu publicación queda guardada y visible hasta que la pongas en pausa o la elimines.
        </p>
      </form>
    </div>
  );
}
