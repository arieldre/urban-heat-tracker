import { kvGet } from './_utils/kv.js';

export default async function handler(req, res) {
  try {
    const campaignId = req.query?.campaignId;
    const game = req.query?.game || 'uh';
    const filterByCampaign = campaignId && campaignId !== 'all';
    const prefix = game === 'inv' ? 'tracker/inv-fb' : 'tracker/fb';

    const fetches = [
      kvGet(`${prefix}/live.json`),
      kvGet(`${prefix}/history.json`),
      kvGet(`${prefix}/campaigns.json`),
    ];
    if (game !== 'inv') fetches.push(kvGet('tracker/tags.json'));

    const [liveData, history, campaigns, tags] = await Promise.all(fetches);

    const allLive = liveData?.assets || [];
    const allHistory = history || [];

    const live = filterByCampaign ? allLive.filter(a => a.campaignId === campaignId) : allLive;
    const filteredHistory = filterByCampaign ? allHistory.filter(h => h.campaignId === campaignId) : allHistory;

    return res.status(200).json({
      live,
      history: filteredHistory,
      campaigns: campaigns || [],
      lastSyncedAt: liveData?.lastSyncedAt || null,
      ...(game !== 'inv' && { tags: tags || {} }),
    });
  } catch (e) {
    console.error('[fb-tracker-data]', e);
    return res.status(500).json({ error: e.message });
  }
}
