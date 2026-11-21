import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, MapPin, Plus, X, Sparkles, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import JobCard from '../components/JobCard.jsx';
import { Empty, ErrorState, SkeletonList } from '../components/ui.jsx';
import { CategoryIcon } from '../lib/icons.jsx';
import { money } from '../lib/format.js';

const EXAMPLES = [
  { id: 'ejemplo-1', title: 'Cortar el pasto', location: 'Santo Tomé, Santa Fe', pay: 18000, icon: 'Trees' },
  { id: 'ejemplo-2', title: 'Ayudar con una mudanza', location: 'Santa Fe Capital', pay: 25000, icon: 'Truck' },
  { id: 'ejemplo-3', title: 'Pasear un perro', location: 'Santo Tomé, Santa Fe', pay: 8000, icon: 'PawPrint' },
];

const EMPTY_FILTERS = {
  q: '',
  category: '',
  province: '',
  locality: '',
  minPay: '',
  maxPay: '',
  payType: '',
  dateFrom: '',
  maxDistanceKm: '',
  sort: '',
};

export default function Explore() {
  const { user, categories, provinces } = useApp();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.jobs({ ...filters, limit: 60 });
        if (!signal?.aborted) setJobs(data.jobs || []);
      } catch (err) {
        if (!signal?.aborted) setError(errorMessage(err));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filters, user?.localityName, user?.provinceName],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), filters.q ? 300 : 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load]);

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([key, value]) => key !== 'q' && value !== '').length,
    [filters],
  );

  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value }));
  const clearFilters = () => setFilters({ ...EMPTY_FILTERS, q: filters.q });

  const noResults = !loading && !error && jobs.length === 0;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-eyebrow">
            <Sparkles size={13} /> {user?.localityName ? `Cerca de ${user.localityName}` : 'Changas en toda Argentina'}
          </span>
          <h1>Encontrá changas cerca tuyo</h1>
          <p>Descubrí oportunidades y trabajos disponibles en tu zona.</p>
        </div>
        <Link to="/publicar" className="btn hero-cta">
          <Plus size={17} /> Publicar changa
        </Link>
      </section>

      <div className="search-row">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="search"
            placeholder="¿Qué changa estás buscando?"
            value={filters.q}
            onChange={set('q')}
            aria-label="¿Qué changa estás buscando?"
          />
          {filters.q && (
            <button type="button" className="icon-btn plain" onClick={() => setFilters((f) => ({ ...f, q: '' }))} aria-label="Limpiar búsqueda">
              <X size={16} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`btn outline filter-toggle ${activeFilterCount ? 'has-filters' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={16} />
          Filtros
          {activeFilterCount > 0 && <span className="chip-count">{activeFilterCount}</span>}
        </button>
      </div>

      <div className="category-scroll" role="list" aria-label="Categorías">
        <button
          type="button"
          className={`category-chip ${!filters.category ? 'active' : ''}`}
          onClick={() => setFilters((f) => ({ ...f, category: '' }))}
        >
          <span className="cat-chip-icon">
            <Sparkles size={18} />
          </span>
          Todas
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`category-chip ${filters.category === cat.id ? 'active' : ''}`}
            onClick={() => setFilters((f) => ({ ...f, category: f.category === cat.id ? '' : cat.id }))}
          >
            <span className="cat-chip-icon">
              <CategoryIcon name={cat.icon} size={18} />
            </span>
            {cat.name}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filters-grid">
            <div className="field">
              <label htmlFor="f-province">Provincia</label>
              <select id="f-province" className="select" value={filters.province} onChange={set('province')}>
                <option value="">Todas las provincias</option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-locality">Localidad</label>
              <input
                id="f-locality"
                className="input"
                placeholder="Ej.: Santo Tomé"
                value={filters.locality}
                onChange={set('locality')}
              />
            </div>
            <div className="field">
              <label htmlFor="f-min">Pago mínimo</label>
              <input id="f-min" className="input" type="number" min="0" inputMode="numeric" placeholder="$ 0" value={filters.minPay} onChange={set('minPay')} />
            </div>
            <div className="field">
              <label htmlFor="f-max">Pago máximo</label>
              <input id="f-max" className="input" type="number" min="0" inputMode="numeric" placeholder="Sin límite" value={filters.maxPay} onChange={set('maxPay')} />
            </div>
            <div className="field">
              <label htmlFor="f-paytype">Tipo de pago</label>
              <select id="f-paytype" className="select" value={filters.payType} onChange={set('payType')}>
                <option value="">Todos</option>
                <option value="fijo">Pago fijo</option>
                <option value="negociable">Pago negociable</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-date">Desde la fecha</label>
              <input id="f-date" className="input" type="date" value={filters.dateFrom} onChange={set('dateFrom')} />
            </div>
            <div className="field">
              <label htmlFor="f-distance">Distancia máxima (km)</label>
              <input
                id="f-distance"
                className="input"
                type="number"
                min="1"
                placeholder={user?.lat ? 'Ej.: 25' : 'Requiere ubicación GPS'}
                value={filters.maxDistanceKm}
                onChange={set('maxDistanceKm')}
                disabled={!user?.lat}
              />
            </div>
            <div className="field">
              <label htmlFor="f-sort">Ordenar por</label>
              <select id="f-sort" className="select" value={filters.sort} onChange={set('sort')}>
                <option value="">Más relevantes cerca tuyo</option>
                <option value="recientes">Publicaciones recientes</option>
                <option value="fecha">Fecha del trabajo</option>
                <option value="pago_desc">Pago: mayor a menor</option>
                <option value="pago_asc">Pago: menor a mayor</option>
              </select>
            </div>
          </div>
          <div className="row between mt-1">
            <button type="button" className="btn ghost sm" onClick={clearFilters}>
              <RotateCcw size={14} /> Limpiar filtros
            </button>
            <button type="button" className="btn sm" onClick={() => setShowFilters(false)}>
              Ver resultados
            </button>
          </div>
        </div>
      )}

      <div className="row between section-head">
        <h2>Changas disponibles</h2>
        {!loading && !error && <span className="small muted">{jobs.length} {jobs.length === 1 ? 'changa' : 'changas'}</span>}
      </div>

      {loading && <SkeletonList count={3} />}

      {!loading && error && <ErrorState message={error} onRetry={() => load()} />}

      {noResults && (
        <Empty
          title={filters.q || activeFilterCount ? 'No encontramos changas con esos filtros.' : 'Todavía no hay changas en esta zona.'}
          description={
            filters.q || activeFilterCount
              ? 'Probá con otra búsqueda o limpiá los filtros para ver más oportunidades.'
              : 'Probá cambiar tu ubicación o publicá la primera oportunidad.'
          }
          action={
            <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {(filters.q || activeFilterCount) > 0 && (
                <button type="button" className="btn outline sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Limpiar filtros
                </button>
              )}
              <Link to="/publicar" className="btn sm">
                <Plus size={15} /> Publicar changa
              </Link>
            </div>
          }
        />
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {!loading && !error && jobs.length > 0 && activeFilterCount > 0 && (
        <div className="center mt-2">
          <button
            type="button"
            className="btn outline sm"
            onClick={() => setFilters((f) => ({ ...f, province: '', locality: '', maxDistanceKm: '' }))}
          >
            <MapPin size={14} /> Ampliar búsqueda a otras zonas
          </button>
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <section className="examples">
          <div className="row between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Ejemplos de changas</h3>
            <span className="badge muted">Solo ilustrativo</span>
          </div>
          <div className="job-list">
            {EXAMPLES.map((ex) => (
              <div key={ex.id} className="job-card example" aria-disabled="true">
                <div className="cat-badge">
                  <CategoryIcon name={ex.icon} size={26} />
                </div>
                <div className="job-card-body">
                  <div className="job-card-title">{ex.title}</div>
                  <div className="job-meta">
                    <span className="meta-item">
                      <MapPin size={12} /> {ex.location}
                    </span>
                  </div>
                  <div className="owner-line">
                    <span className="badge muted">Ejemplo</span>
                  </div>
                </div>
                <div className="job-card-right">
                  <div className="job-pay">
                    {money(ex.pay)}
                    <small>Pago fijo</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="small muted center mt-1">
            Estas tarjetas son solo un ejemplo visual. No son publicaciones reales ni reciben postulaciones.
          </p>
        </section>
      )}
    </div>
  );
}
