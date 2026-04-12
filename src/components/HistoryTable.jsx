import Badge from './Badge.jsx';

export default function HistoryTable({ entries, tags }) {
  const sorted = [...entries].sort((a, b) => (b.removedAt || '').localeCompare(a.removedAt || ''));

  return (
    <div className="overflow-auto h-full">
      <table>
        <thead>
          <tr>
            <th>Date Removed</th>
            <th>Creative</th>
            <th>Format</th>
            <th>Last CPA</th>
            <th>Last Spend</th>
            <th>Last Conv</th>
            <th>Last Rating</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, i) => (
            <tr key={entry.key || i} className="border-l-3 border-l-orange">
              <td className="font-mono text-[11px] text-text2">{entry.removedAt || '--'}</td>
              <td className="flex items-center gap-3">
                {entry.youtubeId && (
                  <img
                    src={`https://img.youtube.com/vi/${entry.youtubeId}/default.jpg`}
                    alt=""
                    className="w-[48px] h-[36px] rounded object-cover shrink-0"
                  />
                )}
                <div>
                  <div className="font-mono text-[11px] font-medium text-text">
                    {entry.name || entry.youtubeId || entry.id}
                  </div>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-accent2 hover:underline"
                    >
                      {entry.youtubeId ? `youtu.be/${entry.youtubeId}` : 'link'}
                    </a>
                  )}
                </div>
              </td>
              <td><Badge label={entry.orientation} /></td>
              <td className="font-mono text-[11px] text-orange">
                {entry.lastCpa !== null && entry.lastCpa !== undefined ? `$${entry.lastCpa.toFixed(3)}` : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {entry.lastSpend > 0 ? `$${entry.lastSpend.toFixed(0)}` : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {entry.lastConversions > 0 ? Math.round(entry.lastConversions) : '\u2013'}
              </td>
              <td><Badge label={entry.lastPerformanceLabel} /></td>
              <td className="text-[11px] text-text2">{entry.reason}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-muted font-mono text-[11px] py-8">
                No removed creatives yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
