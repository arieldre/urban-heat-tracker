import { useState, useEffect, useCallback } from 'react';

const cache = {};

export function useInvokersFBData(campaignId = 'all') {
  const [data, setData] = useState(cache[campaignId] || null);
  const [loading, setLoading] = useState(!cache[campaignId]);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/fb-tracker-data?game=inv&campaignId=${campaignId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      cache[campaignId] = json;
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (cache[campaignId]) {
      setData(cache[campaignId]);
      setLoading(false);
    } else {
      fetchData();
    }
  }, [campaignId, fetchData]);

  return { data, loading, error, refresh: fetchData };
}
