import { useMemo } from 'react';

export default function CampaignSummary({ assets, history, campaignStats }) {
  const stats = useMemo(() => {
    const live = assets.filter(a => a.status === 'live');
    const totalSpend = live.reduce((s, a) => s + a.spend, 0);
    const totalConv = live.reduce((s, a) => s + a.conversions, 0);
    const totalImpr = live.reduce((s, a) => s + a.impressions, 0);
    const totalClicks = live.reduce((s, a) => s + a.clicks, 0);
    const avgCpa = totalConv > 0 ? totalSpend / totalConv : null;
    const ctr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : null;

    // Best performer (lowest CPA with meaningful spend)
    const ranked = live.filter(a => a.cpa && a.spend > 5).sort((a, b) => a.cpa - b.cpa);
    const best = ranked[0] || null;
    const worst = ranked[ranked.length - 1] || null;

    // Campaign-level metrics override asset-level aggregation for accurate CPA.
    // Asset-level ad_group_ad_asset_view gives full conversion credit to each asset (not fractional),
    // so summing across N assets inflates conversions N×. Campaign-level matches Google Ads UI.
    const displaySpend = campaignStats?.spend ?? totalSpend;
    const displayConv = campaignStats?.conversions ?? totalConv;
    const displayCpa = campaignStats?.cpa ?? avgCpa;

    return { totalSpend: displaySpend, totalConv: displayConv, totalImpr, avgCpa: displayCpa, ctr, best, worst, liveCount: live.length, historyCount: history.length };
  }, [assets, history, campaignStats]);

  const cards = [
    { label: 'Total Spend', value: `$${stats.totalSpend.toFixed(0)}`, color: 'text-text' },
    { label: 'Avg CPA', value: stats.avgCpa ? `$${stats.avgCpa.toFixed(4)}` : '--', color: 'text-green' },
    { label: 'Conversions', value: stats.totalConv.toLocaleString(), color: 'text-accent2' },
    { label: 'Impressions', value: stats.totalImpr > 1000 ? `${(stats.totalImpr / 1000).toFixed(1)}k` : stats.totalImpr.toString(), color: 'text-text2' },
    { label: 'CTR', value: stats.ctr ? `${stats.ctr.toFixed(2)}%` : '--', color: 'text-text2' },
    { label: 'Best CPA', value: stats.best ? `$${stats.best.cpa.toFixed(4)}` : '--', sub: stats.best?.name?.slice(0, 25) || '', color: 'text-green' },
  ];

  return (
    <div className="bg-surface border-b border-border px-5 py-3 flex items-center gap-6 shrink-0 overflow-x-auto">
      {cards.map(c => (
        <div key={c.label} className="min-w-0 shrink-0">
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted">{c.label}</div>
          <div className={`font-mono text-[14px] font-semibold ${c.color}`}>{c.value}</div>
          {c.sub && <div className="font-mono text-[9px] text-muted truncate max-w-[120px]">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
