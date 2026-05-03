import { useState, useEffect, useCallback } from 'react';

export function useInvokersGoogleData(campaignId = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = campaignId
        ? `/api/edit-descriptions?type=videos&campaignId=${campaignId}`
        : '/api/edit-descriptions?type=videos';
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
