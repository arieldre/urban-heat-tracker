import { useState } from 'react';

export function useTags(onUpdate) {
  const [saving, setSaving] = useState(false);

  async function saveTag(youtubeId, updates) {
    setSaving(true);
    try {
      const r = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeId, ...updates }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (onUpdate) onUpdate(youtubeId, json.tag);
      return json;
    } finally {
      setSaving(false);
    }
  }

  return { saveTag, saving };
}
