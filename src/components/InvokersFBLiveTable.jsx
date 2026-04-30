import { useState, useMemo, Fragment, useCallback } from 'react';
import { spendVelocity, daysActive } from '../utils/trends.js';

function sortAssets(assets, sortKey, sortDir) {
  return [...assets].sort((a, b) => {
    const aPaused = a.status !== 'ACTIVE';
    const bPaused = b.status !== 'ACTIVE';
    if (aPaused && !bPaused) return 1;
    if (bPaused && !aPaused) return -1;
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === '_velocity') { va = a._velocity?.recentSpend; vb = b._velocity?.recentSpend; }
    if (sortKey === '_days') { va = a._days; vb = b._days; }
    if (va === null || va === undefined) va = sortDir === 'asc' ? Infinity : -Infinity;
    if (vb === null || vb === undefined) vb = sortDir === 'asc' ? Infinity : -Infinity;
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });
}

function cpiClass(cpi, goodCpi, midCpi) {
  if (cpi === null || cpi === undefined) return '';
  if (cpi <= goodCpi) return 'text-green font-semibold';
  if (cpi <= midCpi) return 'text-text2';
  return 'text-orange';
}

function StatusDot({ status }) {
  const color = status === 'ACTIVE' ? 'bg-green shadow-[0_0_5px_var(--color-green)]'
    : status === 'PAUSED' ? 'bg-orange'
    : 'bg-muted';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />;
}

function shortCampaign(name = '') {
  return name.replace(/^INV_FB_/i, '').replace(/_\d{6}.*$/, '').replace(/_/g, ' ').slice(0, 28);
}

export default function InvokersFBLiveTable({ assets, onControlAd }) {
  const [sortKey, setSortKey] = useState('cpi');
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
      console.error('[inv-fb-control]', e.message);
    } finally {
      setPendingIds(s => { const n = new Set(s); n.delete(asset.id); return n; });
    }
  }, [onControlAd, optimisticStatus]);

  const enriched = useMemo(() => assets.map(a => ({
    ...a,
    _velocity: spendVelocity(a.daily),
    _days: daysActive(a.firstSeenAt, a.lastSeenAt),
  })), [assets]);

  // Dynamic CPI thresholds based on median of non-null values
  const [goodCpi, midCpi] = useMemo(() => {
    const cpis = enriched.map(a => a.cpi).filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
    if (!cpis.length) return [2, 5];
    const median = cpis[Math.floor(cpis.length / 2)];
    return [+(median * 0.7).toFixed(2), +(median * 1.3).toFixed(2)];
  }, [enriched]);

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
    else { setSortKey(key); setSortDir(key === 'spend' || key === '_velocity' ? 'desc' : 'asc'); }
  }

  const sortIcon = (key) => sortKey !== key ? '' : sortDir === 'asc' ? ' ▲' : ' ▼';

  const hasAfData = enriched.some(a => a.afInstalls !== null);
  const hasRoasData = enriched.some(a => a.roas7 !== null && a.roas7 > 0);

  const columns = [
    { key: 'name', label: 'Creative' },
    { key: 'campaignName', label: 'Campaign' },
    { key: 'cpi', label: 'CPI' },
    ...(hasAfData ? [{ key: 'afCpi', label: 'AF CPI' }] : []),
    { key: 'spend', label: 'Spend' },
    { key: '_velocity', label: 'Velocity' },
    { key: 'installs', label: 'FB Inst.' },
    ...(hasAfData ? [{ key: 'afInstalls', label: 'AF Inst.' }] : []),
    ...(hasRoasData ? [{ key: 'roas1', label: 'D1 ROAS' }] : []),
    ...(hasRoasData ? [{ key: 'roas7', label: 'D7 ROAS' }] : []),
    { key: 'purchases', label: 'Purch.' },
    { key: 'ctr', label: 'CTR' },
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
          {filtered.length} ads · CPI thresholds: ≤${goodCpi} good · &gt;${midCpi} high
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
            const isExpanded = expandedId === asset.key;
            const isPending = pendingIds.has(asset.id);
            const currentStatus = optimisticStatus.get(asset.id) ?? asset.status;
            const isActive = currentStatus === 'ACTIVE';

            return (
              <Fragment key={asset.key}>
                <tr
                  className={`cursor-pointer ${asset.status !== 'ACTIVE' ? 'opacity-40' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : asset.key)}
                >
                  {/* Creative */}
                  <td className="flex items-center gap-3">
                    {asset.thumbnailUrl && (
                      <img
                        src={asset.thumbnailUrl}
                        alt=""
                        className="w-[48px] h-[36px] rounded object-cover shrink-0"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <StatusDot status={currentStatus} />
                        <div className="font-mono text-[11px] font-medium text-text truncate max-w-[220px]">
                          {asset.name}
                        </div>
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
                  <td className="font-mono text-[10px] text-muted truncate max-w-[180px]" title={asset.campaignName}>
                    {shortCampaign(asset.campaignName)}
                  </td>

                  {/* CPI */}
                  <td className={`font-mono text-[11px] ${cpiClass(asset.cpi, goodCpi, midCpi)}`}>
                    {asset.cpi !== null ? `$${asset.cpi.toFixed(2)}` : '–'}
                  </td>

                  {/* AF CPI */}
                  {hasAfData && (
                    <td className={`font-mono text-[11px] ${cpiClass(asset.afCpi, goodCpi, midCpi)}`}>
                      {asset.afCpi !== null ? `$${asset.afCpi.toFixed(2)}` : '–'}
                    </td>
                  )}

                  {/* Spend */}
                  <td className="font-mono text-[11px] text-text2">
                    {asset.spend > 0 ? `$${asset.spend.toFixed(0)}` : '–'}
                  </td>

                  {/* Velocity */}
                  <td className="font-mono text-[10px] text-text2">
                    {asset._velocity?.recentSpend !== undefined
                      ? `$${asset._velocity.recentSpend.toFixed(0)}/7d`
                      : '–'}
                  </td>

                  {/* FB Installs */}
                  <td className="font-mono text-[11px] text-text">
                    {asset.installs > 0 ? Math.round(asset.installs) : '–'}
                  </td>

                  {/* AF Installs */}
                  {hasAfData && (
                    <td className="font-mono text-[11px] text-text2">
                      {asset.afInstalls !== null ? asset.afInstalls.toLocaleString() : '–'}
                    </td>
                  )}

                  {/* D1 ROAS */}
                  {hasRoasData && (
                    <td className={`font-mono text-[11px] ${asset.roas1 >= 1 ? 'text-green font-semibold' : asset.roas1 > 0 ? 'text-orange' : 'text-muted'}`}>
                      {asset.roas1 !== null ? `${(asset.roas1 * 100).toFixed(0)}%` : '–'}
                    </td>
                  )}

                  {/* D7 ROAS */}
                  {hasRoasData && (
                    <td className={`font-mono text-[11px] ${asset.roas7 >= 1 ? 'text-green font-semibold' : asset.roas7 > 0 ? 'text-orange' : 'text-muted'}`}>
                      {asset.roas7 !== null ? `${(asset.roas7 * 100).toFixed(0)}%` : '–'}
                    </td>
                  )}

                  {/* Purchases */}
                  <td className="font-mono text-[11px] text-text2">
                    {asset.purchases > 0 ? Math.round(asset.purchases) : '–'}
                  </td>

                  {/* CTR */}
                  <td className="font-mono text-[10px] text-text2">
                    {asset.ctr !== null ? `${asset.ctr.toFixed(2)}%` : '–'}
                  </td>

                  {/* Days */}
                  <td className="font-mono text-[10px] text-text2">
                    {asset._days ? `${asset._days}d` : '–'}
                  </td>

                  {/* Pause / Resume */}
                  <td>
                    {onControlAd && (
                      <button
                        disabled={isPending}
                        onClick={e => handleControl(e, asset)}
                        className={`font-mono text-[9px] px-2 py-0.5 rounded border cursor-pointer transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                          isActive
                            ? 'border-orange text-orange hover:bg-orange hover:text-white'
                            : 'border-green text-green hover:bg-green hover:text-white'
                        }`}
                      >
                        {isPending ? '...' : isActive ? '⏸ Pause' : '▶ Resume'}
                      </button>
                    )}
                  </td>
                </tr>

                {/* Expanded daily breakdown */}
                {isExpanded && asset.daily?.length > 0 && (
                  <tr>
                    <td colSpan={columns.length} className="bg-surface2 p-0">
                      <div className="px-4 py-3 overflow-x-auto">
                        <table className="min-w-0">
                          <thead>
                            <tr>
                              {['Date', 'Spend', 'Installs', 'CPI', 'Purchases'].map(h => (
                                <th key={h} className="!cursor-default">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...asset.daily].reverse().map(d => (
                              <tr key={d.date}>
                                <td className="font-mono text-[10px] text-muted">{d.date}</td>
                                <td className="font-mono text-[10px] text-text2">{d.spend > 0 ? `$${d.spend.toFixed(2)}` : '–'}</td>
                                <td className="font-mono text-[10px] text-text">{d.installs > 0 ? Math.round(d.installs) : '–'}</td>
                                <td className={`font-mono text-[10px] ${cpiClass(d.cpi, goodCpi, midCpi)}`}>
                                  {d.cpi !== null ? `$${d.cpi.toFixed(2)}` : '–'}
                                </td>
                                <td className="font-mono text-[10px] text-text2">{d.purchases > 0 ? Math.round(d.purchases) : '–'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}

          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center font-mono text-[11px] text-muted py-12">
                {assets.length === 0 ? 'No data — click Sync to populate.' : 'No ads match filter.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
