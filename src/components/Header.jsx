import { CAMPAIGNS } from '../config.js';

export default function Header({ selectedCampaign, onCampaignChange, activeTab, onTabChange, stats, lastSyncedAt, onSync, syncing, theme, onThemeToggle, onSnapshot, snapshotMsg, onH2H }) {
  const tabs = [
    { id: 'live', label: 'Live' },
    { id: 'history', label: 'History' },
    { id: 'descriptions', label: 'Descriptions' },
    { id: 'compare', label: 'Compare' },
  ];

  const camp = CAMPAIGNS.find(c => c.id === selectedCampaign);

  return (
    <header className="bg-surface border-b border-border flex items-center px-5 h-[52px] shrink-0 gap-3">
      {/* Logo */}
      <div className="font-mono text-xs font-semibold text-accent tracking-wider uppercase leading-tight whitespace-nowrap mr-3">
        Urban Heat
        <br />
        <span className="text-text2 font-normal">/ {camp?.shortLabel || '...'}</span>
      </div>

      {/* Campaign toggle */}
      <div className="flex gap-1 mr-3">
        {CAMPAIGNS.map(c => (
          <button
            key={c.id}
            onClick={() => onCampaignChange(c.id)}
            className={`font-mono text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded cursor-pointer border transition-all whitespace-nowrap ${
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
            className={`font-mono text-[11px] font-semibold uppercase tracking-wider px-3 cursor-pointer border-b-2 flex items-center gap-1.5 transition-colors select-none whitespace-nowrap ${
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

      {/* Right side controls */}
      <div className="ml-auto flex gap-3 items-center">
        <div className="font-mono text-[11px] text-text2 whitespace-nowrap">
          <strong className="text-text">{stats.live}</strong> live
        </div>
        <div className="font-mono text-[11px] text-text2 whitespace-nowrap">
          <strong className="text-text">{stats.history}</strong> hist
        </div>

        {/* H2H button */}
        <button
          onClick={onH2H}
          title="Head-to-Head comparison"
          className="font-mono text-[10px] font-semibold px-2 py-1 rounded cursor-pointer border bg-transparent text-purple border-[rgba(192,132,252,0.25)] hover:border-purple transition-all"
        >
          H2H
        </button>

        {/* Snapshot */}
        <button
          onClick={onSnapshot}
          title="Copy shareable link"
          className="font-mono text-[10px] font-semibold px-2 py-1 rounded cursor-pointer border bg-transparent text-orange border-[rgba(255,170,71,0.25)] hover:border-orange transition-all"
        >
          {snapshotMsg || 'Share'}
        </button>

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="font-mono text-[10px] font-semibold px-2 py-1 rounded cursor-pointer border bg-transparent text-text2 border-border hover:border-muted transition-all"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>

        {/* Sync */}
        <button
          onClick={onSync}
          disabled={syncing}
          className="font-mono text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded cursor-pointer border transition-all whitespace-nowrap bg-surface2 text-accent2 border-[rgba(71,200,255,0.25)] hover:border-accent2 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>
    </header>
  );
}
