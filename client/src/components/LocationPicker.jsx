import { useEffect, useMemo, useState } from 'react';
import { LocateFixed, Search, MapPin, Check, Loader2 } from 'lucide-react';
import { api, errorMessage } from '../api.js';
import { useApp } from '../context/AppContext.jsx';

export default function LocationPicker({ value, onSaved, compact = false, submitLabel = 'Guardar ubicación' }) {
  const { provinces, toast, setUser, refresh } = useApp();
  const [provinceId, setProvinceId] = useState(value?.provinceId || '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(
    value?.localityName ? { id: value.localityId, name: value.localityName, provinceId: value.provinceId, provinceName: value.provinceName } : null,
  );
  const [coords, setCoords] = useState(value?.lat != null ? { lat: value.lat, lng: value.lng } : null);
  const [mode, setMode] = useState(value?.locationMode || 'manual');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [gpsMessage, setGpsMessage] = useState('');

  const selectedProvince = useMemo(() => provinces.find((p) => p.id === provinceId), [provinces, provinceId]);

  useEffect(() => {
    if (!provinceId) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.localities({ provinceId, q: query, limit: 30 });
        if (alive) setResults(data.localities || []);
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setSearching(false);
      }
    }, query ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [provinceId, query]);

  async function useCurrentLocation() {
    setError('');
    setGpsMessage('');
    if (!navigator.geolocation) {
      setError('Tu dispositivo no permite obtener la ubicación. Elegila manualmente.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const data = await api.reverseGeocode(latitude.toFixed(5), longitude.toFixed(5));
          const loc = data.location;
          setProvinceId(loc.provinceId);
          setSelected({
            id: loc.localityId,
            name: loc.localityName,
            provinceId: loc.provinceId,
            provinceName: loc.provinceName,
          });
          setCoords({ lat: Number(latitude.toFixed(5)), lng: Number(longitude.toFixed(5)) });
          setMode('gps');
          setQuery('');
          setGpsMessage(`Detectamos ${loc.localityName}, ${loc.provinceName}.`);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);
        setGpsMessage('');
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? 'No nos diste permiso de ubicación. Podés elegir tu localidad manualmente.'
            : 'No pudimos obtener tu ubicación. Elegí tu localidad manualmente.',
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    );
  }

  function pick(locality) {
    setSelected(locality);
    setCoords(null);
    setMode('manual');
    setGpsMessage('');
  }

  async function save() {
    setError('');
    if (!selected) {
      setError('Elegí una localidad para continuar.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        provinceId: selected.provinceId || provinceId,
        provinceName: selected.provinceName || selectedProvince?.name,
        localityId: selected.id,
        localityName: selected.name,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        locationMode: coords ? 'gps' : 'manual',
      };
      const data = await api.updateLocation(payload);
      if (data?.user) setUser(data.user);
      else await refresh();
      toast(`Ubicación guardada: ${selected.name}, ${payload.provinceName}.`);
      onSaved?.(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-grid">
      {!compact && (
        <button type="button" className="btn outline block" onClick={useCurrentLocation} disabled={locating}>
          {locating ? <Loader2 size={16} className="spin" /> : <LocateFixed size={17} />}
          {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
        </button>
      )}

      {gpsMessage && <div className="form-success">{gpsMessage}</div>}

      <div className="field">
        <label htmlFor="province">Provincia</label>
        <select
          id="province"
          className="select"
          value={provinceId}
          onChange={(e) => {
            setProvinceId(e.target.value);
            setSelected(null);
            setQuery('');
            setCoords(null);
            setMode('manual');
          }}
        >
          <option value="">Elegí una provincia</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {provinceId && (
        <div className="field">
          <label htmlFor="locality-search">Localidad</label>
          <div className="search-bar" style={{ height: 44 }}>
            <Search size={16} />
            <input
              id="locality-search"
              placeholder="Buscá tu localidad"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {searching && <Loader2 size={15} className="spin" />}
          </div>

          {selected && (
            <div className="row mt-1" style={{ gap: 6 }}>
              <span className="badge ok">
                <MapPin size={11} /> {selected.name}
              </span>
              {coords && <span className="badge info">Con coordenadas GPS</span>}
            </div>
          )}

          <div className="list mt-1" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {results.map((loc) => {
              const isSelected = selected?.id === loc.id;
              return (
                <button
                  key={loc.id}
                  type="button"
                  className="row-item"
                  style={{
                    padding: '9px 11px',
                    borderColor: isSelected ? '#b9f36b' : undefined,
                    background: isSelected ? '#fbfef7' : undefined,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onClick={() => pick({ ...loc, provinceName: loc.provinceName || selectedProvince?.name })}
                >
                  <MapPin size={15} style={{ color: '#426B35', marginTop: 2 }} />
                  <span className="grow">
                    <span className="title" style={{ fontSize: 13.5 }}>
                      {loc.name}
                    </span>
                    <span className="sub">{loc.provinceName || selectedProvince?.name}</span>
                  </span>
                  {isSelected && <Check size={16} style={{ color: '#426B35' }} />}
                </button>
              );
            })}
            {!searching && !results.length && (
              <p className="small muted">
                {query ? 'No encontramos localidades con ese nombre.' : 'Escribí para buscar tu localidad.'}
              </p>
            )}
          </div>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <button type="button" className="btn block" onClick={save} disabled={saving || !selected}>
        {saving ? <span className="spinner" /> : <Check size={17} />}
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </div>
  );
}
