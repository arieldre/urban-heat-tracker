import { useState, useMemo } from 'react';
import Badge from './Badge.jsx';
import TagEditor from './TagEditor.jsx';

function cpaClass(cpa) {
  if (cpa === null || cpa === undefined) return '';
  if (cpa <= 0.35) return 'text-green font-semibold';
  if (cpa <= 0.65) return 'text-text2';
  return 'text-orange';
}

function sortAssets(assets, sortKey, sortDir) {
  return [...assets].sort((a, b) => {
    // Pending always at bottom
    if (a.status === 'pending' && b.status !== 'pending') return 1;
    if (b.status === 'pending' && a.status !== 'pending') return -1;

    let va = a[sortKey], vb = b[sortKey];
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

  const sorted = useMemo(() => sortAssets(assets, sortKey, sortDir), [assets, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'spend' || key === 'conversions' ? 'desc' : 'asc');
    }
  }

  const sortIcon = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  // Top 3 performers (lowest CPA with spend > 0)
  const topIds = new Set(
    sorted.filter(a => a.cpa !== null && a.spend > 5).slice(0, 3).map(a => a.key)
  );

  const columns = [
    { key: 'name', label: 'Creative' },
    { key: 'orientation', label: 'Format' },
    { key: 'theme', label: 'Theme', custom: true },
    { key: 'cpa', label: 'CPA' },
    { key: 'spend', label: 'Spend' },
    { key: 'conversions', label: 'Conv' },
    { key: 'performanceLabel', label: 'G. Rating' },
    { key: 'notes', label: 'Notes', custom: true },
  ];

  return (
    <div className="overflow-auto h-full">
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
            return (
              <tr
                key={asset.key}
                className={isTop ? 'border-l-3 border-l-accent bg-[rgba(232,255,71,0.02)]' : ''}
              >
                {/* Creative */}
                <td className="flex items-center gap-3">
                  {asset.youtubeId && (
                    <img
                      src={`https://img.youtube.com/vi/${asset.youtubeId}/default.jpg`}
                      alt=""
                      className="w-[48px] h-[36px] rounded object-cover shrink-0"
                    />
                  )}
                  <div>
                    <div className="font-mono text-[11px] font-medium text-text">
                      {asset.name || asset.youtubeId || asset.id}
                      {isTop && <span className="text-accent text-[9px] ml-1">{'\u2605'}</span>}
                    </div>
                    {asset.url && (
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-accent2 hover:underline"
                      >
                        {asset.youtubeId ? `youtu.be/${asset.youtubeId}` : 'link'}
                      </a>
                    )}
                  </div>
                </td>

                {/* Format */}
                <td><Badge label={asset.orientation} /></td>

                {/* Theme (from tags) */}
                <td>{tag.theme ? <Badge label={tag.theme} /> : <span className="text-muted text-[10px]">--</span>}</td>

                {/* CPA */}
                <td className={`font-mono text-[11px] ${cpaClass(asset.cpa)}`}>
                  {asset.cpa !== null ? `$${asset.cpa.toFixed(2)}` : '\u2013'}
                </td>

                {/* Spend */}
                <td className="font-mono text-[11px] text-text2">
                  {asset.spend > 0 ? `$${asset.spend.toFixed(0)}` : '\u2013'}
                </td>

                {/* Conversions */}
                <td className="font-mono text-[11px] text-text2">
                  {asset.conversions > 0 ? Math.round(asset.conversions) : '\u2013'}
                </td>

                {/* G. Rating */}
                <td><Badge label={asset.performanceLabel} /></td>

                {/* Notes */}
                <td className="text-[11px] text-text2 max-w-[200px] truncate">
                  {tag.notes || ''}
                </td>

                {/* Edit */}
                <td>
                  <button
                    onClick={() => setEditingId(editingId === asset.key ? null : asset.key)}
                    className="font-mono text-[10px] text-muted hover:text-accent2 cursor-pointer"
                  >
                    {editingId === asset.key ? 'close' : 'edit'}
                  </button>
                </td>
              </tr>
            );
          })}

          {/* Inline tag editor */}
          {editingId && (
            <tr>
              <td colSpan={columns.length + 1} className="bg-surface2 p-0">
                <TagEditor
                  asset={sorted.find(a => a.key === editingId)}
                  tag={tags[sorted.find(a => a.key === editingId)?.youtubeId] || {}}
                  onClose={() => setEditingId(null)}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
