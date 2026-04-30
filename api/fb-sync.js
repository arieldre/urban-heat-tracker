import { runFBSync } from './_utils/fb-sync-logic.js';
import { hasCredentials } from './_utils/facebook.js';
import { runInvFBSync } from './_utils/inv-fb-sync-logic.js';
import { hasInvCredentials } from './_utils/invokers-facebook.js';

export default async function handler(req, res) {
  const game = req.query?.game || 'uh';

  if (game === 'inv') {
    if (!hasInvCredentials()) return res.status(500).json({ error: 'Missing Invokers FB credentials' });
    try {
      const result = await runInvFBSync();
      return res.status(200).json(result);
    } catch (e) {
      console.error('[fb-sync/inv]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  if (!hasCredentials()) return res.status(500).json({ error: 'Missing Facebook credentials' });
  try {
    const result = await runFBSync();
    return res.status(200).json(result);
  } catch (e) {
    console.error('[fb-sync]', e);
    return res.status(500).json({ error: e.message });
  }
}
