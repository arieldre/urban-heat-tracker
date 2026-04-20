import Badge from './Badge.jsx';

export default function FBHistoryTable({ entries }) {
  const sorted = [...entries].sort((a, b) => (b.removedAt || '').localeCompare(a.removedAt || ''));

  return (
    <div className="overflow-auto h-full">
      <table>
        <thead>
          <tr>
            <th>Date Removed</th>
            <th>Creative</th>
            <th>Campaign</th>
            <th>Format</th>
            <th>Last CPA</th>
            <th>Last CPI</th>
            <th>Last Spend</th>
            <th>Purchases</th>
            <th>Installs</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, i) => (
            <tr key={entry.key || i} className="border-l-3 border-l-[#1877f2]">
              <td className="font-mono text-[11px] text-text2">{entry.removedAt || '--'}</td>
              <td className="flex items-center gap-3">
                {entry.thumbnailUrl && (
                  <img
                    src={entry.thumbnailUrl}
                    alt=""
                    className="w-[48px] h-[36px] rounded object-cover shrink-0"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                )}
                <div>
                  <div className="font-mono text-[11px] font-medium text-text truncate max-w-[200px]">
                    {entry.name || entry.id}
                  </div>
                  {entry.videoId && (
                    <a
                      href={`https://www.facebook.com/watch/?v=${entry.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-[#1877f2] hover:underline"
                    >
                      fb/{entry.videoId}
                    </a>
                  )}
                </div>
              </td>
              <td className="font-mono text-[10px] text-muted truncate max-w-[140px]" title={entry.campaignName}>
                {entry.campaignName?.replace(/^UH_FB_/, '').replace(/_\d{6}$/, '') || '--'}
              </td>
              <td><Badge label={entry.orientation} /></td>
              <td className="font-mono text-[11px] text-orange">
                {entry.lastCpa !== null && entry.lastCpa !== undefined ? `$${entry.lastCpa.toFixed(4)}` : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {entry.lastCpi !== null && entry.lastCpi !== undefined ? `$${entry.lastCpi.toFixed(4)}` : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {entry.lastSpend > 0 ? `$${entry.lastSpend.toFixed(0)}` : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {entry.lastPurchases > 0 ? Math.round(entry.lastPurchases) : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {entry.lastInstalls > 0 ? Math.round(entry.lastInstalls) : '\u2013'}
              </td>
              <td className="text-[11px] text-text2">{entry.reason}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={10} className="text-center text-muted font-mono text-[11px] py-8">
                No removed Facebook ads yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
