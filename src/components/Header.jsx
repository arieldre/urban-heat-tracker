import { CAMPAIGNS } from '../config.js';

export default function Header({ selectedCampaign, onCampaignChange, activeTab, onTabChange, stats, lastSyncedAt, onSync, syncing }) {
  const tabs = [
    { id: 'live', label: 'Live' },
    { id: 'history', label: 'History' },
    { id: 'descriptions', label: 'Descriptions' },
  ];

  const camp = CAMPAIGNS.find(c => c.id === selectedCampaign);

  return (
    <header className="bg-surface border-b border-border flex items-center px-5 h-[52px] shrink-0 gap-4">
      {/* Logo */}
      <div className="font-mono text-xs font-semibold text-accent tracking-wider uppercase leading-tight whitespace-nowrap mr-4">
        Urban Heat
        <br />
        <span className="text-text2 font-normal">/ {camp?.shortLabel || '...'}</span>
      </div>

      {/* Campaign toggle */}
      <div className="flex gap-1.5 mr-4">
        {CAMPAIGNS.map(c => (
          <button
            key={c.id}
            onClick={() => onCampaignChange(c.id)}
            className={`font-mono text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded cursor-pointer border transition-all whitespace-nowrap ${
              selectedCampaign === c.id
                ? 'bg-accent text-[#0a0c0f] border-accent'
                : 'bg-transparent text-text2 border-border hover:text-text hover:border-muted'
            }`}
          >
            {c.shortLabel}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex h-full items-stretch">
        {tabs.map(t => (
          <div
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`font-mono text-[11px] font-semibold uppercase tracking-wider px-4 cursor-pointer border-b-2 flex items-center gap-1.5 transition-colors select-none whitespace-nowrap ${
              activeTab === t.id
                ? 'text-accent border-accent'
                : 'text-text2 border-transparent hover:text-text'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              activeTab === t.id ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]' : 'bg-muted'
            }`} />
            {t.label}
          </div>
        ))}
      </div>

      {/* Stats + Sync */}
      <div className="ml-auto flex gap-4 items-center">
        <div className="font-mono text-[11px] text-text2 whitespace-nowrap">
          Live: <strong className="text-text">{stats.live}</strong>
        </div>
        <div className="font-mono text-[11px] text-text2 whitespace-nowrap">
          Pending: <strong className="text-text">{stats.pending}</strong>
        </div>
        <div className="font-mono text-[11px] text-text2 whitespace-nowrap">
          History: <strong className="text-text">{stats.history}</strong>
        </div>
        {lastSyncedAt && (
          <div className="font-mono text-[10px] text-muted whitespace-nowrap" title={lastSyncedAt}>
            {new Date(lastSyncedAt).toLocaleDateString()}
          </div>
        )}
        <button
          onClick={onSync}
          disabled={syncing}
          className="font-mono text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded cursor-pointer border transition-all whitespace-nowrap bg-surface2 text-accent2 border-[rgba(71,200,255,0.25)] hover:border-accent2 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>
    </header>
  );
}
