import { kvGet } from './_utils/kv.js';

export default async function handler(req, res) {
  try {
    const campaignId = req.query?.campaignId;
    const useAll = !campaignId || campaignId === 'all';

    const liveKey = useAll ? 'tracker/fb/live.json' : `tracker/fb/${campaignId}/live.json`;
    const historyKey = useAll ? 'tracker/fb/history.json' : `tracker/fb/${campaignId}/history.json`;

    const [liveData, history, campaigns, tags] = await Promise.all([
      kvGet(liveKey),
      kvGet(historyKey),
      kvGet('tracker/fb/campaigns.json'),
      kvGet('tracker/tags.json'),
    ]);

    return res.status(200).json({
      live: liveData?.assets || [],
      history: history || [],
      campaigns: campaigns || [],
      lastSyncedAt: liveData?.lastSyncedAt || null,
      tags: tags || {},
    });
  } catch (e) {
    console.error('[fb-tracker-data]', e);
    return res.status(500).json({ error: e.message });
  }
}
