/**
 * GET /api/snapshot?id=xxx — read a saved snapshot
 * GET /api/snapshot        — return live data for all campaigns (was /api/tracker-all)
 * POST /api/snapshot       — save current state, returns { id }
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
      await kvSet(`tracker/snapshots/${id}.json`, { id, createdAt: new Date().toISOString(), campaigns, tags });
      return res.status(200).json({ ok: true, id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    const { id } = req.query || {};

    // No id → return all campaigns (replaces /api/tracker-all)
    if (!id) {
      try {
        const results = await Promise.all(
          CAMPAIGN_IDS.map(async campId => {
            const [live, history, tags] = await Promise.all([
              kvGet(`tracker/${campId}/live.json`),
              kvGet(`tracker/${campId}/history.json`),
              kvGet('tracker/tags.json'),
            ]);
            return {
              campaignId: campId,
              campaignName: CAMPAIGN_LABELS[campId] || campId,
              live: live?.assets || [],
              lastSyncedAt: live?.lastSyncedAt || null,
              history: history || [],
              tags: tags || {},
            };
          })
        );
        return res.status(200).json({ campaigns: results });
      } catch (e) {
        console.error('[snapshot:all]', e.message);
        return res.status(500).json({ error: e.message });
      }
    }

    // Validate id to prevent path traversal — only alphanumeric allowed
    if (!/^[a-z0-9]+$/.test(id)) return res.status(400).json({ error: 'Invalid snapshot id' });

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
