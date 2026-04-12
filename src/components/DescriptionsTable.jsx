import Badge from './Badge.jsx';

export default function DescriptionsTable({ assets }) {
  const sorted = [...assets].sort((a, b) => b.spend - a.spend);

  return (
    <div className="overflow-auto h-full">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Text</th>
            <th>Performance</th>
            <th>Spend</th>
            <th>Conv</th>
            <th>Impressions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((asset, i) => (
            <tr key={asset.key || asset.id || i}>
              <td><Badge label={asset.fieldType} /></td>
              <td className="text-[13px] max-w-[500px] whitespace-normal" style={{ padding: '10px 16px' }}>
                {asset.text || '--'}
              </td>
              <td><Badge label={asset.performanceLabel} /></td>
              <td className="font-mono text-[11px] text-text2">
                {asset.spend > 0 ? `$${asset.spend.toFixed(2)}` : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {asset.conversions > 0 ? Math.round(asset.conversions) : '\u2013'}
              </td>
              <td className="font-mono text-[11px] text-text2">
                {asset.impressions > 0 ? asset.impressions.toLocaleString() : '\u2013'}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-muted font-mono text-[11px] py-8">
                No text assets found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
