import { useMemo } from 'react';

/**
 * Horizontal bar chart showing each creative's active period, colored by CPA performance.
 */
export default function LifespanChart({ assets, thresholds }) {
  const [goodCpa, midCpa] = thresholds || [0.03, 0.06];

  const data = useMemo(() => {
    const items = assets
      .filter(a => a.firstSeenAt && a.lastSeenAt && a.spend > 0)
      .map(a => ({
        key: a.key,
        name: (a.name || a.youtubeId || '').slice(0, 35),
        firstSeenAt: a.firstSeenAt,
        lastSeenAt: a.lastSeenAt,
        cpa: a.cpa,
        spend: a.spend,
      }))
      .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));

    if (!items.length) return { items: [], minDate: null, maxDate: null, totalDays: 0 };

    const allDates = items.flatMap(i => [i.firstSeenAt, i.lastSeenAt]);
    const minDate = allDates.sort()[0];
    const maxDate = allDates.sort().pop();
    const totalDays = Math.max(1, Math.round((new Date(maxDate) - new Date(minDate)) / 86400000) + 1);

    return { items, minDate, maxDate, totalDays };
  }, [assets]);

  if (!data.items.length) return null;

  function barColor(cpa) {
    if (cpa === null) return 'bg-muted';
    if (cpa <= goodCpa) return 'bg-green';
    if (cpa <= midCpa) return 'bg-accent2';
    return 'bg-orange';
  }

  function dayOffset(date) {
    return Math.round((new Date(date) - new Date(data.minDate)) / 86400000);
  }

  return (
    <div className="px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mb-1">
        Creative Lifespan &middot; {data.minDate} to {data.maxDate}
        <span className="ml-3">
          <span className="inline-block w-2 h-2 rounded-sm bg-green mr-1 align-middle"></span>good
          <span className="inline-block w-2 h-2 rounded-sm bg-accent2 mx-1 align-middle ml-2"></span>mid
          <span className="inline-block w-2 h-2 rounded-sm bg-orange mx-1 align-middle ml-2"></span>high CPA
        </span>
      </div>
      <div className="space-y-1 mt-2">
        {data.items.map(item => {
          const left = (dayOffset(item.firstSeenAt) / data.totalDays) * 100;
          const width = Math.max(1, ((dayOffset(item.lastSeenAt) - dayOffset(item.firstSeenAt) + 1) / data.totalDays) * 100);
          return (
            <div key={item.key} className="flex items-center gap-2 h-5">
              <div className="font-mono text-[9px] text-text2 w-[200px] truncate shrink-0 text-right">{item.name}</div>
              <div className="flex-1 relative h-3 bg-surface2 rounded-sm overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-sm ${barColor(item.cpa)} opacity-70 hover:opacity-100 transition-opacity`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${item.name}\n${item.firstSeenAt} → ${item.lastSeenAt}\nCPA: ${item.cpa ? '$' + item.cpa.toFixed(3) : '--'}\nSpend: $${item.spend.toFixed(0)}`}
                />
              </div>
              <div className="font-mono text-[9px] text-muted w-[50px] shrink-0">
                {item.cpa ? `$${item.cpa.toFixed(3)}` : '--'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
