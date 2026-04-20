import { useState, useEffect, useCallback } from 'react';

let cache = null;

export function useFBData() {
  const [data, setData] = useState(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/fb-tracker-data');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      cache = json;
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cache) {
      setData(cache);
      setLoading(false);
    } else {
      fetchData();
    }
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
