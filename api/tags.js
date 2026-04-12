/**
 * POST /api/tags
 * Upsert manual tags for a creative.
 * Body: { youtubeId, theme?, notes?, rating? }
 */
import { kvGet, kvSet } from './utils/kv.js';

const TAGS_KEY = 'tracker/tags.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { youtubeId, theme, notes, rating } = req.body || {};
    if (!youtubeId) return res.status(400).json({ error: 'youtubeId required' });

    const tags = (await kvGet(TAGS_KEY)) || {};
    tags[youtubeId] = {
      ...(tags[youtubeId] || {}),
      ...(theme !== undefined && { theme }),
      ...(notes !== undefined && { notes }),
      ...(rating !== undefined && { rating }),
      updatedAt: new Date().toISOString(),
    };

    await kvSet(TAGS_KEY, tags);
    return res.status(200).json({ ok: true, tag: tags[youtubeId] });
  } catch (e) {
    console.error('[tags]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
