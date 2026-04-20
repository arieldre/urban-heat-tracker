import { runFBSync } from '../utils/fb-sync-logic.js';
import { hasCredentials } from '../utils/facebook.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!hasCredentials()) {
    return res.status(500).json({ error: 'Missing Facebook credentials' });
  }
  try {
    const result = await runFBSync();
    return res.status(200).json(result);
  } catch (e) {
    console.error('[fb-cron]', e);
    return res.status(500).json({ error: e.message });
  }
}
