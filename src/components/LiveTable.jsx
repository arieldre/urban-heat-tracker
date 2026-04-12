import { useState, useMemo } from 'react';
import Badge from './Badge.jsx';
import TagEditor from './TagEditor.jsx';
import VideoPreview from './VideoPreview.jsx';
import LifespanChart from './LifespanChart.jsx';
import { cpaTrend, spendVelocity, daysActive, dynamicCpaThresholds } from '../utils/trends.js';


function TrendArrow({ direction, label }) {
  if (direction === 'new') return <span className="text-muted text-[9px]">NEW</span>;
  const cfg = {
    improving:  { arrow: '\u25BC', color: 'text-green', title: 'CPA improving' },
    worsening:  { arrow: '\u25B2', color: 'text-red', title: 'CPA worsening' },
    flat:       { arrow: '\u2014', color: 'text-muted', title: 'CPA stable' },
    scaling:    { arrow: '\u25B2', color: 'text-green', title: 'Spend scaling up' },
    throttled:  { arrow: '\u25BC', color: 'text-red', title: 'Spend throttled' },
    stable:     { arrow: '\u2014', color: 'text-muted', title: 'Spend stable' },
  };
  const c = cfg[direction] || cfg.flat;
  return (
    <span className={`${c.color} text-[10px] font-mono ml-1`} title={`${c.title}${label ? ': ' + label : ''}`}>
      {c.arrow}
    </span>
  );
}

function sortAssets(assets, sortKey, sortDir) {
  return [...assets].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return 1;
    if (b.status === 'pending' && a.status !== 'pending') return -1;
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

export default function LiveTable({ assets, tags }) {
  const [sortKey, setSortKey] = useState('cpa');
  const [sortDir, setSortDir] = useState('asc');
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');

  // Enrich assets with computed trends
  const enriched = useMemo(() => assets.map(a => ({
    ...a,
    _trend: cpaTrend(a.daily),
    _velocity: spendVelocity(a.daily),
    _days: daysActive(a.firstSeenAt, a.lastSeenAt),
  })), [assets]);

  // Dynamic CPA thresholds
  const [goodCpa, midCpa] = useMemo(() => dynamicCpaThresholds(assets), [assets]);

  // Filter
  const filtered = useMemo(() => {
    if (!search) return enriched;
    const q = search.toLowerCase();
    return enriched.filter(a => (a.name || '').toLowerCase().includes(q) || (a.youtubeId || '').toLowerCase().includes(q));
  }, [enriched, search]);

  const sorted = useMemo(() => sortAssets(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'spend' || key === 'conversions' || key === '_velocity' ? 'desc' : 'asc'); }
  }

  const sortIcon = (key) => sortKey !== key ? '' : sortDir === 'asc' ? ' \u25B2' : ' \u25BC';

  // Top 3 by CPA with meaningful spend
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
    { key: 'orientation', label: 'Format' },
    { key: 'cpa', label: 'CPA' },
    { key: '_cpaTrend', label: '7d Trend' },
    { key: 'spend', label: 'Spend' },
    { key: '_velocity', label: 'Velocity' },
    { key: 'conversions', label: 'Conv' },
    { key: '_days', label: 'Days' },
    { key: 'performanceLabel', label: 'G. Rating' },
    { key: 'theme', label: 'Theme', custom: true },
  ];

  return (
    <div className="overflow-auto h-full">
      {/* Search bar */}
      <div className="sticky top-0 z-20 bg-bg border-b border-border px-4 py-2 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search creatives..."
          className="bg-surface2 border border-border rounded px-3 py-1 text-[11px] font-mono text-text outline-none focus:border-[rgba(232,255,71,0.4)] placeholder:text-muted w-[200px]"
        />
        <div className="ml-auto font-mono text-[10px] text-muted">
          {filtered.length} creatives &middot; CPA thresholds: &le;${goodCpa} good &middot; &gt;${midCpa} high
        </div>
      </div>

      <table>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} onClick={() => !c.custom && handleSort(c.key)}>
                {c.label}{!c.custom && sortIcon(c.key)}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(asset => {
            const tag = tags[asset.youtubeId] || {};
            const isTop = topIds.has(asset.key);
            const isExpanded = expandedId === asset.key;

            return (
              <>
                <tr
                  key={asset.key}
                  className={`cursor-pointer ${isTop ? 'border-l-3 border-l-accent bg-[rgba(232,255,71,0.02)]' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : asset.key)}
                >
                  {/* Creative */}
                  <td className="flex items-center gap-3">
                    {asset.youtubeId && (
                      <VideoPreview youtubeId={asset.youtubeId}>
                        <img
                          src={`https://img.youtube.com/vi/${asset.youtubeId}/default.jpg`}
                          alt=""
                          className="w-[48px] h-[36px] rounded object-cover shrink-0"
                        />
                      </VideoPreview>
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-medium text-text truncate max-w-[250px]">
                        {asset.name || asset.youtubeId || asset.id}
                        {isTop && <span className="text-accent text-[9px] ml-1">{'\u2605'}</span>}
                      </div>
                      {asset.url && (
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-accent2 hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {asset.youtubeId ? `youtu.be/${asset.youtubeId}` : 'link'}
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Format */}
                  <td><Badge label={asset.orientation} /></td>

                  {/* CPA */}
                  <td className={`font-mono text-[11px] ${cpaClass(asset.cpa)}`}>
                    {asset.cpa !== null ? `$${asset.cpa.toFixed(3)}` : '\u2013'}
                  </td>

                  {/* 7d Trend */}
                  <td className="font-mono text-[10px]">
                    {asset._trend?.recentCpa !== null && asset._trend?.recentCpa !== undefined ? (
                      <span>
                        ${asset._trend.recentCpa.toFixed(3)}
                        <TrendArrow direction={asset._trend.direction} label={asset._trend.pctChange ? `${asset._trend.pctChange > 0 ? '+' : ''}${asset._trend.pctChange}%` : ''} />
                      </span>
                    ) : (
                      <span className="text-muted">{'\u2013'}</span>
                    )}
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
                    ) : (
                      <span className="text-muted">{'\u2013'}</span>
                    )}
                  </td>

                  {/* Conversions */}
                  <td className="font-mono text-[11px] text-text2">
                    {asset.conversions > 0 ? Math.round(asset.conversions) : '\u2013'}
                  </td>

                  {/* Days Active */}
                  <td className="font-mono text-[10px] text-text2">
                    {asset._days ? `${asset._days}d` : '\u2013'}
                  </td>

                  {/* G. Rating */}
                  <td><Badge label={asset.performanceLabel} /></td>

                  {/* Theme */}
                  <td>{tag.theme ? <Badge label={tag.theme} /> : <span className="text-muted text-[10px]">--</span>}</td>

                  {/* Edit */}
                  <td>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(editingId === asset.key ? null : asset.key); }}
                      className="font-mono text-[10px] text-muted hover:text-accent2 cursor-pointer"
                    >
                      {editingId === asset.key ? 'close' : 'tag'}
                    </button>
                  </td>
                </tr>

                {/* Expanded daily breakdown */}
                {isExpanded && (
                  <tr key={`${asset.key}-expand`}>
                    <td colSpan={columns.length + 1} className="bg-surface2 p-0">
                      <div className="px-4 py-3">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-muted mb-2">Daily Breakdown (last 14 days)</div>
                        <div className="flex gap-1 items-end h-[60px]">
                          {(asset.daily || []).slice(-14).map((d, i) => {
                            const maxSpend = Math.max(...(asset.daily || []).slice(-14).map(x => x.spend));
                            const h = maxSpend > 0 ? (d.spend / maxSpend) * 100 : 0;
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}\nSpend: $${d.spend}\nConv: ${d.conversions}\nCPA: ${d.cpa !== null ? '$' + d.cpa : '--'}`}>
                                <div
                                  className="w-full rounded-sm bg-accent2 opacity-60 hover:opacity-100 transition-opacity min-h-[2px]"
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
                          {tag.notes && <span className="text-muted">Notes: {tag.notes}</span>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Tag editor */}
                {editingId === asset.key && (
                  <tr key={`${asset.key}-edit`}>
                    <td colSpan={columns.length + 1} className="bg-surface2 p-0">
                      <TagEditor
                        asset={asset}
                        tag={tag}
                        onClose={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      {/* Lifespan chart */}
      {sorted.length > 0 && (
        <div className="border-t border-border mt-2">
          <LifespanChart assets={sorted} thresholds={[goodCpa, midCpa]} />
        </div>
      )}
    </div>
  );
}
