const base = () => `https://graph.facebook.com/${process.env.FB_API_VERSION || 'v20.0'}`;
const token = () => process.env.INV_FB_ACCESS_TOKEN;
const account = () => process.env.INV_FB_AD_ACCOUNT_ID;

export function hasInvCredentials() {
  return !!(token() && account());
}

async function graphAll(url, params = {}) {
  const qs = new URLSearchParams({ access_token: token(), ...params });
  let endpoint = `${url}?${qs}`;
  const items = [];
  while (endpoint) {
    const r = await fetch(endpoint);
    const data = await r.json();
    if (data.error) throw new Error(`FB API: ${data.error.message} (code ${data.error.code})`);
    if (data.data) items.push(...data.data);
    endpoint = data.paging?.next || null;
  }
  return items;
}

export async function fetchInvAds() {
  const all = await graphAll(`${base()}/${account()}/ads`, {
    fields: 'id,name,status,effective_status,campaign{id,name,status},creative{id}',
    limit: '100',
  });
  const ads = all.filter(a => a.status !== 'DELETED' && a.status !== 'ARCHIVED');

  const creativeIds = [...new Set(ads.map(a => a.creative?.id).filter(Boolean))];
  const creativeMap = {};
  for (let i = 0; i < creativeIds.length; i += 25) {
    const batch = creativeIds.slice(i, i + 25);
    const qs = new URLSearchParams({
      ids: batch.join(','),
      fields: 'id,thumbnail_url,video_id,image_url',
      access_token: token(),
    });
    const r = await fetch(`${base()}/?${qs}`);
    const data = await r.json();
    if (!data.error) Object.assign(creativeMap, data);
  }

  return ads.map(a => ({
    ...a,
    creative: a.creative?.id ? { ...a.creative, ...(creativeMap[a.creative.id] || {}) } : null,
  }));
}

export async function fetchInvInsights(since, until) {
  return graphAll(`${base()}/${account()}/insights`, {
    level: 'ad',
    time_increment: '1',
    fields: 'ad_id,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since, until }),
    limit: '100',
  });
}

export function extractInvActions(actions = []) {
  const map = {};
  for (const a of actions) map[a.action_type] = parseFloat(a.value || 0);
  return {
    purchases: map['omni_purchase'] || map['purchase'] || 0,
    installs: map['mobile_app_install'] || 0,
  };
}

export async function updateInvAdStatus(adId, status) {
  const r = await fetch(`${base()}/${adId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status, access_token: token() }),
  });
  const data = await r.json();
  if (data.error) throw new Error(`FB API: ${data.error.message} (code ${data.error.code})`);
  return data;
}
