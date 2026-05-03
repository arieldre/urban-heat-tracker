import { useState, useMemo, Fragment, useCallback } from 'react';
import Badge from './Badge.jsx';
import FBVideoPreview from './FBVideoPreview.jsx';
import { cpaTrend, spendVelocity, daysActive, dynamicCpaThresholds } from '../utils/trends.js';

// Only ads in this campaign expose pause/resume controls.
// Matches FB_CONTROL_CAMPAIGN_ID on the server — server re-verifies before mutating.
const CONTROL_CAMPAIGN_ID = '120243500953780720';

function TrendArrow({ direction, label }) {
  if (direction === 'new') return <span className="text-muted text-[9px]">NEW</span>;
  const cfg = {
    improving:  { arrow: '\u25BC', color: 'text-green' },
    worsening:  { arrow: '\u25B2', color: 'text-red' },
    flat:       { arrow: '\u2014', color: 'text-muted' },
    scaling:    { arrow: '\u25B2', color: 'text-green' },
    throttled:  { arrow: '\u25BC', color: 'text-red' },
    stable:     { arrow: '\u2014', color: 'text-muted' },
  };
  const c = cfg[direction] || cfg.flat;
  return (
    <span className={`${c.color} text-[10px] font-mono ml-1`} title={label}>
      {c.arrow}
    </span>
  );
}

function sortAssets(assets, sortKey, sortDir) {
  return [...assets].sort((a, b) => {
    // Non-ACTIVE (paused at any level) sinks to bottom
    const aPaused = a.status !== 'ACTIVE';
    const bPaused = b.status !== 'ACTIVE';
    if (aPaused && !bPaused) return 1;
    if (bPaused && !aPaused) return -1;
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === '_cpaTrend') { va = a._trend?.recentCpa; vb = b._trend?.recentCpa; }
    if (sortKey === '_velocity') { va = a._velocity?.recentSpend; vb = b._velocity?.recentSpend; }
    if (sortKey === '_days') { va = a._days; vb = b._days; }
    if (va === null || va === undefined) va = sortDir === 'asc' ? Infinity : -Infinity;
    if (vb === null || vb === undefined) vb = sortDir === 'asc' ? Infinity : -Infinity;
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });
}

export default function FBLiveTable({ assets, onControlAd }) {
  const [sortKey, setSortKey] = useState('cpa');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [optimisticStatus, setOptimisticStatus] = useState(new Map());

  const handleControl = useCallback(async (e, asset) => {
    e.stopPropagation();
    const currentStatus = optimisticStatus.get(asset.id) ?? asset.status;
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setPendingIds(s => new Set([...s, asset.id]));
    try {
      await onControlAd(asset.id, newStatus);
      setOptimisticStatus(m => new Map([...m, [asset.id, newStatus]]));
    } catch (e) {
      console.error('[fb-control]', e.message);
    } finally {
      setPendingIds(s => { const n = new Set(s); n.delete(asset.id); return n; });
    }
  }, [onControlAd, optimisticStatus]);

  // Use purchases as the CPA metric (FB AEO campaigns optimize for purchase)
  const enriched = useMemo(() => assets.map(a => ({
    ...a,
    conversions: a.purchases,
    cpa: a.cpa,
    _trend: cpaTrend(a.daily?.map(d => ({ ...d, conversions: d.purchases }))),
    _velocity: spendVelocity(a.daily),
    _days: daysActive(a.firstSeenAt, a.lastSeenAt),
  })), [assets]);

  const [goodCpa, midCpa] = useMemo(() => dynamicCpaThresholds(
    assets.map(a => ({ ...a, conversions: a.purchases }))
  ), [assets]);

  const filtered = useMemo(() => {
    let result = activeOnly ? enriched.filter(a => a.status === 'ACTIVE') : enriched;
    if (!search) return result;
    const q = search.toLowerCase();
    return result.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.campaignName || '').toLowerCase().includes(q)
    );
  }, [enriched, search, activeOnly]);

  const sorted = useMemo(() => sortAssets(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'spend' || key === 'purchases' || key === '_velocity' ? 'desc' : 'asc'); }
  }

  const sortIcon = (key) => sortKey !== key ? '' : sortDir === 'asc' ? ' \u25B2' : ' \u25BC';

  const topIds = new Set(
    sorted.filter(a => a.cpa !== null && a.spend > 5).slice(0, 3).map(a => a.key)
  );

  function cpaClass(cpa) {
    if (cpa === null || cpa === undefined) return '';
    if (cpa <= goodCpa) return 'text-green font-semibold';
    if (cpa <= midCpa) return 'text-text2';
    return 'text-orange';
  }

  const columns = [
    { key: 'name', label: 'Creative' },
    { key: 'campaignName', label: 'Campaign' },
    { key: 'orientation', label: 'Format' },
    { key: 'cpa', label: 'CPA (Purchase)' },
    { key: '_cpaTrend', label: '7d Trend' },
    { key: 'spend', label: 'Spend' },
    { key: '_velocity', label: 'Velocity' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'installs', label: 'Installs' },
    { key: '_days', label: 'Days' },
    { key: '_control', label: '' },
  ];

  return (
    <div className="overflow-auto h-full">
      <div className="sticky top-0 z-20 bg-bg border-b border-border px-4 py-2 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search creatives or campaigns..."
          className="bg-surface2 border border-border rounded px-3 py-1 text-[11px] font-mono text-text outline-none focus:border-[rgba(24,119,242,0.4)] placeholder:text-muted w-[240px]"
        />
        <button
          onClick={() => setActiveOnly(v => !v)}
          className={`font-mono text-[10px] font-semibold px-2.5 py-1 rounded border cursor-pointer transition-all whitespace-nowrap ${
            activeOnly
              ? 'bg-[#1877f2] text-white border-[#1877f2]'
              : 'bg-transparent text-text2 border-border hover:text-text hover:border-muted'
          }`}
        >
          {activeOnly ? 'Active' : 'All'}
        </button>
        <div className="ml-auto font-mono text-[10px] text-muted">
          {filtered.length} ads &middot; CPA thresholds: &le;${goodCpa} good &middot; &gt;${midCpa} high
        </div>
      </div>

      <table>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} onClick={() => handleSort(c.key)} className="cursor-pointer">
                {c.label}{sortIcon(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(asset => {
            const isTop = topIds.has(asset.key);
            const isExpanded = expandedId === asset.key;

            return (
              <Fragment key={asset.key}>
                <tr
                  className={`cursor-pointer ${asset.status !== 'ACTIVE' ? 'opacity-40' : ''} ${isTop ? 'border-l-3 border-l-[#1877f2] bg-[rgba(24,119,242,0.02)]' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : asset.key)}
                >
                  {/* Creative */}
                  <td className="flex items-center gap-3">
                    {asset.thumbnailUrl && (
                      <FBVideoPreview videoId={asset.videoId} picture={asset.thumbnailUrl}>
                        <img
                          src={asset.thumbnailUrl}
                          alt=""
                          className="w-[48px] h-[36px] rounded object-cover shrink-0"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      </FBVideoPreview>
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-medium text-text truncate max-w-[220px]">
                        {asset.name}
                        {isTop && <span className="text-[#1877f2] text-[9px] ml-1">{'\u2605'}</span>}
                      </div>
                      {asset.videoId && (
                        <a
                          href={`https://www.facebook.com/watch/?v=${asset.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-[#1877f2] hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          fb/{asset.videoId}
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Campaign */}
                  <td className="font-mono text-[10px] text-muted truncate max-w-[160px]" title={asset.campaignName}>
                    {asset.campaignName?.replace(/^UH_FB_/, '').replace(/_\d{6}$/, '') || '--'}
                  </td>

                  {/* Format */}
                  <td><Badge label={asset.orientation} /></td>

                  {/* CPA */}
                  <td className={`font-mono text-[11px] ${cpaClass(asset.cpa)}`}>
                    {asset.cpa !== null ? `$${asset.cpa.toFixed(4)}` : '\u2013'}
                  </td>

                  {/* 7d Trend */}
                  <td className="font-mono text-[10px]">
                    {asset._trend?.recentCpa !== null && asset._trend?.recentCpa !== undefined ? (
                      <span>
                        ${asset._trend.recentCpa.toFixed(4)}
                        <TrendArrow direction={asset._trend.direction} label={asset._trend.pctChange ? `${asset._trend.pctChange > 0 ? '+' : ''}${asset._trend.pctChange}%` : ''} />
                      </span>
                    ) : <span className="text-muted">{'\u2013'}</span>}
                  </td>

                  {/* Spend */}
                  <td className="font-mono text-[11px] text-text2">
                    {asset.spend > 0 ? `$${asset.spend.toFixed(0)}` : '\u2013'}
                  </td>

                  {/* Velocity */}
                  <td className="font-mono text-[10px]">
                    {asset._velocity?.recentSpend !== undefined ? (
                      <span className="text-text2">
                        ${asset._velocity.recentSpend.toFixed(0)}
                        <TrendArrow direction={asset._velocity.direction} label={asset._velocity.pctChange ? `${asset._velocity.pctChange > 0 ? '+' : ''}${asset._velocity.pctChange}%` : ''} />
                      </span>
                    ) : <span className="text-muted">{'\u2013'}</span>}
                  </td>

                  {/* Purchases */}
                  <td className="font-mono text-[11px] text-text2">
                    {asset.purchases > 0 ? Math.round(asset.purchases) : '\u2013'}
                  </td>

                  {/* Installs */}
                  <td className="font-mono text-[11px] text-text2">
                    {asset.installs > 0 ? Math.round(asset.installs) : '\u2013'}
                  </td>

                  {/* Days */}
                  <td className="font-mono text-[10px] text-text2">
                    {asset._days ? `${asset._days}d` : '\u2013'}
                  </td>

                  {/* Pause / Resume \u2014 only for the whitelisted control campaign */}
                  <td>
                    {asset.campaignId === CONTROL_CAMPAIGN_ID && onControlAd ? (() => {
                      const isPending = pendingIds.has(asset.id);
                      const currentStatus = optimisticStatus.get(asset.id) ?? asset.status;
                      const isActive = currentStatus === 'ACTIVE';
                      return (
                        <button
                          disabled={isPending}
                          onClick={e => handleControl(e, asset)}
                          className={`font-mono text-[9px] px-2 py-0.5 rounded border cursor-pointer transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                            isActive
                              ? 'border-orange text-orange hover:bg-orange hover:text-white'
                              : 'border-green text-green hover:bg-green hover:text-white'
                          }`}
                        >
                          {isPending ? '...' : isActive ? '\u23f8 Pause' : '\u25b6 Resume'}
                        </button>
                      );
                    })() : null}
                  </td>
                </tr>

                {/* Expanded daily breakdown */}
                {isExpanded && (
                  <tr key={`${asset.key}-expand`}>
                    <td colSpan={columns.length} className="bg-surface2 p-0">
                      <div className="px-4 py-3">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-muted mb-2">Daily Breakdown (last 14 days)</div>
                        <div className="flex gap-1 items-end h-[60px]">
                          {(asset.daily || []).slice(-14).map((d, i) => {
                            const maxSpend = Math.max(...(asset.daily || []).slice(-14).map(x => x.spend));
                            const h = maxSpend > 0 ? (d.spend / maxSpend) * 100 : 0;
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}\nSpend: $${d.spend}\nPurchases: ${d.purchases}\nInstalls: ${d.installs}`}>
                                <div
                                  className="w-full rounded-sm bg-[#1877f2] opacity-60 hover:opacity-100 transition-opacity min-h-[2px]"
                                  style={{ height: `${Math.max(2, h)}%` }}
                                />
                                <span className="text-[7px] text-muted font-mono">{d.date.slice(8)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-4 mt-2 font-mono text-[10px] text-text2">
                          <span>First seen: {asset.firstSeenAt}</span>
                          <span>Last seen: {asset.lastSeenAt}</span>
                          <span>CTR: {asset.ctr ? `${asset.ctr.toFixed(2)}%` : '--'}</span>
                          <span>CPI: {asset.cpi ? `$${asset.cpi.toFixed(4)}` : '--'}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center text-muted font-mono text-[11px] py-8">
                No active Facebook ads
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
