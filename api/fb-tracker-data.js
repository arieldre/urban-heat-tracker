import { kvGet } from './_utils/kv.js';

export default async function handler(req, res) {
  try {
    const campaignId = req.query?.campaignId;
    const filterByCampaign = campaignId && campaignId !== 'all';

    const [liveData, history, campaigns, tags] = await Promise.all([
      kvGet('tracker/fb/live.json'),
      kvGet('tracker/fb/history.json'),
      kvGet('tracker/fb/campaigns.json'),
      kvGet('tracker/tags.json'),
    ]);

    const allLive = liveData?.assets || [];
    const allHistory = history || [];

    const live = filterByCampaign
      ? allLive.filter(a => a.campaignId === campaignId)
      : allLive;

    const filteredHistory = filterByCampaign
      ? allHistory.filter(h => h.campaignId === campaignId)
      : allHistory;

    return res.status(200).json({
      live,
      history: filteredHistory,
      campaigns: campaigns || [],
      lastSyncedAt: liveData?.lastSyncedAt || null,
      tags: tags || {},
    });
  } catch (e) {
    console.error('[fb-tracker-data]', e);
    return res.status(500).json({ error: e.message });
  }
}
