const BASE = `https://graph.facebook.com/${process.env.FB_API_VERSION || 'v20.0'}`;

export async function getAdCampaignId(adId) {
  const qs = new URLSearchParams({
    fields: 'campaign{id}',
    access_token: process.env.FB_ACCESS_TOKEN,
  });
  const r = await fetch(`${BASE}/${adId}?${qs}`);
  const data = await r.json();
  if (data.error) throw new Error(`FB API: ${data.error.message} (code ${data.error.code})`);
  return data.campaign?.id || null;
}

export async function updateAdStatus(adId, status) {
  const r = await fetch(`${BASE}/${adId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status, access_token: process.env.FB_ACCESS_TOKEN }),
  });
  const data = await r.json();
  if (data.error) throw new Error(`FB API: ${data.error.message} (code ${data.error.code})`);
  return data;
}
