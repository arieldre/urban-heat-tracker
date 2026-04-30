// AppsFlyer MCP client for Invokers — mirrors creative-dashboard pattern
// iOS app ID confirmed by user; Android TBD (add to INV_APP_IDS when known)

const MCP_URL = 'https://mcp.appsflyer.com/auth/mcp';
const MCP_TIMEOUT_MS = 40000;
const INV_APP_IDS = ['id6755186220']; // iOS only for now

function token() { return process.env.APPSFLYER_MCP?.trim(); }

export function hasAfCredentials() { return !!token(); }

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`AF MCP timeout after ${MCP_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function initSession() {
  const t = token();
  const res = await fetchWithTimeout(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${t}`,
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 0, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'urban-heat-tracker', version: '1.0' },
      },
    }),
  });
  if (res.status !== 200 && res.status !== 201) {
    const body = await res.text();
    throw new Error(`AF MCP init failed: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.headers.get('mcp-session-id');
}

async function callTool(sessionId, id, query) {
  const t = token();
  const res = await fetchWithTimeout(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${t}`,
      'Accept': 'application/json, text/event-stream',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id, method: 'tools/call',
      params: { name: 'fetch_aggregated_data', arguments: { query } },
    }),
  });

  const ct = res.headers.get('content-type') || '';
  const body = await res.text();

  if (ct.includes('text/event-stream')) {
    for (const block of body.split('\n\n')) {
      const dataLine = block.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const msg = JSON.parse(dataLine.slice(6));
        const text = msg.result?.content?.[0]?.text;
        if (text !== undefined) {
          if (msg.result?.isError) throw new Error(`AF MCP tool error: ${text}`);
          return text;
        }
        if (msg.error) throw new Error(`AF MCP error: ${JSON.stringify(msg.error)}`);
      } catch (e) {
        if (e.message.startsWith('AF MCP')) throw e;
      }
    }
    throw new Error(`AF MCP: no SSE data block. Status ${res.status}`);
  }

  const msg = JSON.parse(body);
  if (msg.error) throw new Error(`AF MCP error: ${msg.error.message}`);
  if (msg.result?.isError) throw new Error(`AF MCP tool error: ${msg.result?.content?.[0]?.text}`);
  return msg.result?.content?.[0]?.text ?? null;
}

function parseCsv(rawText) {
  if (!rawText) return [];
  const dataSection = rawText.split('; ## Metadata:')[0].replace(/^## Data:\s*/m, '');
  const lines = dataSection.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = [];
    let i = 0, field = '';
    while (i < line.length) {
      if (line[i] === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { field += line[i++]; }
        }
      } else if (line[i] === ',') { vals.push(field.trim()); field = ''; i++; }
      else { field += line[i++]; }
    }
    vals.push(field.trim());
    return Object.fromEntries(headers.map((h, idx) => [h, vals[idx] ?? '']));
  });
}

function parseNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function col(row, name) {
  if (row[name] !== undefined) return row[name];
  const lower = name.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
  }
  return '';
}

/**
 * Fetch AF installs + ROAS per ad_name for a date range.
 * Returns Map<adName, { afInstalls, roas1, roas7, rev1, rev7 }>
 */
export async function fetchInvAfEnrichment(from, to) {
  const t = token();
  if (!t) throw new Error('APPSFLYER_MCP not set');

  const sessionId = await initSession();
  const text = await callTool(sessionId, 1, {
    app_ids: INV_APP_IDS,
    start_date: from,
    end_date: to,
    groupings: ['Ad', 'Media source'],
    filters: { 'Media source': ['Facebook Ads'] },
    metrics: [
      { metric_name: 'Installs' },
      { metric_name: 'Cost' },
      { metric_name: 'Revenue', period: '1' },
      { metric_name: 'ROAS',    period: '1' },
      { metric_name: 'Revenue', period: '7' },
      { metric_name: 'ROAS',    period: '7' },
    ],
    row_count: 300,
    sort_by_metrics: [{ metric_name: 'Installs', order: 'desc' }],
  });

  const rows = parseCsv(text || '');

  const lookup = new Map();
  for (const row of rows) {
    const adName = (row['Ad'] || '').trim();
    if (!adName || adName === 'None') continue;

    const existing = lookup.get(adName) || { afInstalls: 0, afSpend: 0, rev1: 0, roas1: 0, rev7: 0, roas7: 0 };
    existing.afInstalls += Math.round(parseNum(col(row, 'Installs appsflyer') || col(row, 'Installs') || 0));
    existing.afSpend    += parseNum(col(row, 'Cost'));
    existing.rev1       += parseNum(col(row, 'Revenue days 1 cumulative appsflyer'));
    existing.rev7       += parseNum(col(row, 'Revenue days 7 cumulative appsflyer'));
    existing.roas1       = parseNum(col(row, 'Roas days 1 cumulative appsflyer'));
    existing.roas7       = parseNum(col(row, 'Roas days 7 cumulative appsflyer'));
    lookup.set(adName, existing);
  }

  return lookup;
}
