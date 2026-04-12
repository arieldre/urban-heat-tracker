/**
 * GET /api/tracker-data?campaignId=22784768376
 * Returns live assets, history, descriptions, and tags for a campaign.
 * Reads from KV — no Google Ads API calls.
 */
import { kvGet } from './utils/kv.js';
import { CAMPAIGN_IDS, CAMPAIGN_LABELS } from './utils/google.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const campaignId = req.query?.campaignId;
  if (!campaignId || !CAMPAIGN_IDS.includes(campaignId)) {
    return res.status(400).json({
      error: 'Invalid campaignId',
      validIds: CAMPAIGN_IDS,
    });
  }

  try {
    const [live, history, descriptions, tags] = await Promise.all([
      kvGet(`tracker/${campaignId}/live.json`),
      kvGet(`tracker/${campaignId}/history.json`),
      kvGet(`tracker/${campaignId}/descriptions.json`),
      kvGet(`tracker/tags.json`),
    ]);

    return res.status(200).json({
      campaignId,
      campaignName: CAMPAIGN_LABELS[campaignId] || campaignId,
      live: live?.assets || [],
      lastSyncedAt: live?.lastSyncedAt || null,
      history: history || [],
      descriptions: descriptions || [],
      tags: tags || {},
    });
  } catch (e) {
    console.error('[tracker-data]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
