import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../api.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState({ notifications: 0, messages: 0 });
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = 'success') => {
      const id = ++toastId.current;
      setToasts((list) => [...list.slice(-2), { id, message, type }]);
      setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  const refresh = useCallback(async () => {
    const data = await api.me();
    setUser(data.user);
    setUnread(data.unread || { notifications: 0, messages: 0 });
    return data.user;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfg] = await Promise.all([api.config()]);
        if (!alive) return;
        setConfig(cfg);
        await refresh();
      } catch (error) {
        if (alive) setBootError(errorMessage(error));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => {
      api
        .me()
        .then((data) => {
          setUser(data.user);
          setUnread(data.unread || { notifications: 0, messages: 0 });
        })
        .catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [user?.id]);

  const login = useCallback(async (credentials) => {
    const data = await api.login(credentials);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.register(payload);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setUnread({ notifications: 0, messages: 0 });
    }
  }, []);

  const categories = config?.categories || [];
  const provinces = config?.provinces || [];
  const settings = config?.settings || {};

  const value = useMemo(
    () => ({
      config,
      settings,
      categories,
      provinces,
      totals: config?.totals || {},
      user,
      setUser,
      unread,
      setUnread,
      refresh,
      login,
      register,
      logout,
      toast,
      loading,
      bootError,
    }),
    [config, settings, categories, provinces, user, unread, refresh, login, register, logout, toast, loading, bootError],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismissToast(t.id)}>
            {t.type === 'error' ? '⚠' : '✓'} <span>{t.message}</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}
