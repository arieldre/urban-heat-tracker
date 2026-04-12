/**
 * GET /api/tracker-all
 * Returns live assets for ALL campaigns in one call.
 * Used by cross-campaign comparison and shareable snapshots.
 */
import { kvGet } from './utils/kv.js';
import { CAMPAIGN_IDS, CAMPAIGN_LABELS } from './utils/google.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const results = await Promise.all(
      CAMPAIGN_IDS.map(async id => {
        const [live, history, tags] = await Promise.all([
          kvGet(`tracker/${id}/live.json`),
          kvGet(`tracker/${id}/history.json`),
          kvGet(`tracker/tags.json`),
        ]);
        return {
          campaignId: id,
          campaignName: CAMPAIGN_LABELS[id] || id,
          live: live?.assets || [],
          lastSyncedAt: live?.lastSyncedAt || null,
          history: history || [],
          tags: tags || {},
        };
      })
    );

    return res.status(200).json({ campaigns: results });
  } catch (e) {
    console.error('[tracker-all]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
