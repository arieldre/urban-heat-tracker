import { useState, useMemo } from 'react';
import Badge from './Badge.jsx';

export default function HeadToHead({ assets, onClose }) {
  const [selectedA, setSelectedA] = useState(null);
  const [selectedB, setSelectedB] = useState(null);

  const eligible = assets.filter(a => a.cpa !== null && a.daily?.length > 3);

  const a = eligible.find(x => x.key === selectedA);
  const b = eligible.find(x => x.key === selectedB);

  // Merge daily dates for overlay chart
  const chartData = useMemo(() => {
    if (!a || !b) return [];
    const dates = new Set([...(a.daily || []).map(d => d.date), ...(b.daily || []).map(d => d.date)]);
    const aMap = Object.fromEntries((a.daily || []).map(d => [d.date, d]));
    const bMap = Object.fromEntries((b.daily || []).map(d => [d.date, d]));
    return [...dates].sort().map(date => ({
      date,
      aCpa: aMap[date]?.cpa ?? null,
      bCpa: bMap[date]?.cpa ?? null,
      aSpend: aMap[date]?.spend ?? 0,
      bSpend: bMap[date]?.spend ?? 0,
    }));
  }, [a, b]);

  const maxCpa = Math.max(...chartData.filter(d => d.aCpa || d.bCpa).map(d => Math.max(d.aCpa || 0, d.bCpa || 0)), 0.01);

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.85)] z-50 flex items-center justify-center">
      <div className="bg-surface border border-border rounded-lg w-[90vw] max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="font-mono text-[12px] font-semibold text-accent uppercase tracking-wider">Head-to-Head</div>
          <button onClick={onClose} className="font-mono text-[14px] text-muted hover:text-text cursor-pointer">&times;</button>
        </div>

        {/* Selectors */}
        <div className="flex gap-4 px-5 py-3 border-b border-border">
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-wider text-green mb-1">Creative A</div>
            <select
              value={selectedA || ''}
              onChange={e => setSelectedA(e.target.value || null)}
              className="w-full bg-surface2 border border-border rounded px-3 py-1.5 text-[11px] font-mono text-text outline-none"
            >
              <option value="">Select creative...</option>
              {eligible.map(a => (
                <option key={a.key} value={a.key}>{(a.name || a.youtubeId || '').slice(0, 50)} (${a.cpa?.toFixed(4)})</option>
              ))}
            </select>
          </div>
          <div className="flex items-end font-mono text-[12px] text-muted pb-1">vs</div>
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-wider text-accent2 mb-1">Creative B</div>
            <select
              value={selectedB || ''}
              onChange={e => setSelectedB(e.target.value || null)}
              className="w-full bg-surface2 border border-border rounded px-3 py-1.5 text-[11px] font-mono text-text outline-none"
            >
              <option value="">Select creative...</option>
              {eligible.filter(x => x.key !== selectedA).map(b => (
                <option key={b.key} value={b.key}>{(b.name || b.youtubeId || '').slice(0, 50)} (${b.cpa?.toFixed(4)})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Comparison */}
        {a && b ? (
          <div className="flex-1 overflow-auto p-5">
            {/* Stats comparison */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              {[{ asset: a, color: 'green', label: 'A' }, { asset: b, color: 'accent2', label: 'B' }].map(({ asset, color, label }) => (
                <div key={label} className="bg-surface2 border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    {asset.youtubeId && <img src={`https://img.youtube.com/vi/${asset.youtubeId}/default.jpg`} alt="" className="w-[48px] h-[36px] rounded object-cover" />}
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-medium text-text truncate">{asset.name || asset.youtubeId}</div>
                      <Badge label={asset.orientation} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {[
                      ['CPA', asset.cpa ? `$${asset.cpa.toFixed(4)}` : '--'],
                      ['Spend', `$${asset.spend.toFixed(0)}`],
                      ['Conv', Math.round(asset.conversions)],
                      ['Impr', asset.impressions.toLocaleString()],
                      ['CTR', asset.ctr ? `${asset.ctr.toFixed(2)}%` : '--'],
                      ['Rating', asset.performanceLabel],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="font-mono text-[9px] text-muted">{k}</span>
                        <span className={`font-mono text-[11px] text-${color}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* CPA overlay chart */}
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted mb-2">Daily CPA Comparison</div>
            <div className="bg-surface2 border border-border rounded-lg p-4">
              <div className="flex items-end gap-px h-[120px]">
                {chartData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-px" title={`${d.date}\nA: ${d.aCpa ? '$' + d.aCpa.toFixed(4) : '--'}\nB: ${d.bCpa ? '$' + d.bCpa.toFixed(4) : '--'}`}>
                    <div className="w-full flex items-end justify-center gap-px h-full">
                      {d.aCpa !== null && (
                        <div className="w-[45%] bg-green opacity-60 rounded-t-sm" style={{ height: `${(d.aCpa / maxCpa) * 100}%`, minHeight: '2px' }} />
                      )}
                      {d.bCpa !== null && (
                        <div className="w-[45%] bg-accent2 opacity-60 rounded-t-sm" style={{ height: `${(d.bCpa / maxCpa) * 100}%`, minHeight: '2px' }} />
                      )}
                    </div>
                    {i % 3 === 0 && <span className="text-[7px] text-muted font-mono">{d.date.slice(8)}</span>}
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-2 justify-center">
                <span className="font-mono text-[9px] text-green">&#9632; A</span>
                <span className="font-mono text-[9px] text-accent2">&#9632; B</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center font-mono text-[11px] text-muted">
            Select two creatives above to compare
          </div>
        )}
      </div>
    </div>
  );
}
