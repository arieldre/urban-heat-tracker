import { kvGet } from './utils/kv.js';

export default async function handler(req, res) {
  try {
    const [liveData, history, tags] = await Promise.all([
      kvGet('tracker/fb/live.json'),
      kvGet('tracker/fb/history.json'),
      kvGet('tracker/tags.json'),
    ]);

    return res.status(200).json({
      live: liveData?.assets || [],
      history: history || [],
      lastSyncedAt: liveData?.lastSyncedAt || null,
      tags: tags || {},
    });
  } catch (e) {
    console.error('[fb-tracker-data]', e);
    return res.status(500).json({ error: e.message });
  }
}
