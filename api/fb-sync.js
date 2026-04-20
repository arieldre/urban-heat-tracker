import { runFBSync } from './_utils/fb-sync-logic.js';
import { hasCredentials } from './_utils/facebook.js';

export default async function handler(req, res) {
  if (!hasCredentials()) {
    return res.status(500).json({ error: 'Missing Facebook credentials' });
  }
  try {
    const result = await runFBSync();
    return res.status(200).json(result);
  } catch (e) {
    console.error('[fb-sync]', e);
    return res.status(500).json({ error: e.message });
  }
}
