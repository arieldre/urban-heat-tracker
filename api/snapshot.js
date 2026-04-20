/**
 * GET /api/snapshot?id=xxx — read a saved snapshot
 * POST /api/snapshot — save current state, returns { id }
 */
import { kvGet, kvSet } from './_utils/kv.js';
import { CAMPAIGN_IDS, CAMPAIGN_LABELS } from './_utils/google.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      // Capture current state of all campaigns
      const campaigns = await Promise.all(
        CAMPAIGN_IDS.map(async id => {
          const live = await kvGet(`tracker/${id}/live.json`);
          const history = await kvGet(`tracker/${id}/history.json`);
          return {
            campaignId: id,
            campaignName: CAMPAIGN_LABELS[id] || id,
            live: live?.assets || [],
            history: history || [],
          };
        })
      );
      const tags = (await kvGet('tracker/tags.json')) || {};
      const id = generateId();
      await kvSet(`tracker/snapshots/${id}.json`, {
        id,
        createdAt: new Date().toISOString(),
        campaigns,
        tags,
      });
      return res.status(200).json({ ok: true, id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const snapshot = await kvGet(`tracker/snapshots/${id}.json`);
      if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
      return res.status(200).json(snapshot);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
