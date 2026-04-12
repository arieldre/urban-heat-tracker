import { useState, useCallback, useEffect } from 'react';
import Header from './components/Header.jsx';
import CampaignSummary from './components/CampaignSummary.jsx';
import LiveTable from './components/LiveTable.jsx';
import HistoryTable from './components/HistoryTable.jsx';
import DescriptionsTable from './components/DescriptionsTable.jsx';
import CrossCampaignTab from './components/CrossCampaignTab.jsx';
import HeadToHead from './components/HeadToHead.jsx';
import { useTrackerData } from './hooks/useTrackerData.js';
import { CAMPAIGNS } from './config.js';

export default function App() {
  const [campaignId, setCampaignId] = useState(CAMPAIGNS[0].id);
  const [activeTab, setActiveTab] = useState('live');
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('uh-theme') || 'dark');
  const [showH2H, setShowH2H] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState(null);
  const { data, loading, error, refresh } = useTrackerData(campaignId);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uh-theme', theme);
  }, [theme]);

  const live = data?.live || [];
  const history = data?.history || [];
  const descriptions = data?.descriptions || [];
  const descriptionsHistory = data?.descriptionsHistory || [];
  const tags = data?.tags || {};

  const stats = {
    live: live.filter(a => a.status === 'live').length,
    pending: live.filter(a => a.status === 'pending').length,
    history: history.length,
  };

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/sync');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const handleSnapshot = useCallback(async () => {
    try {
      const r = await fetch('/api/snapshot', { method: 'POST' });
      const json = await r.json();
      if (json.id) {
        const url = `${window.location.origin}?snapshot=${json.id}`;
        await navigator.clipboard.writeText(url);
        setSnapshotMsg('Link copied!');
        setTimeout(() => setSnapshotMsg(null), 2500);
      }
    } catch (e) {
      console.error('Snapshot failed:', e);
    }
  }, []);

  return (
    <>
      <Header
        selectedCampaign={campaignId}
        onCampaignChange={setCampaignId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
        lastSyncedAt={data?.lastSyncedAt}
        onSync={handleSync}
        syncing={syncing}
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        onSnapshot={handleSnapshot}
        snapshotMsg={snapshotMsg}
        onH2H={() => setShowH2H(true)}
      />

      {data && activeTab === 'live' && (
        <CampaignSummary assets={live} history={history} />
      )}

      <div className="flex-1 overflow-auto bg-bg">
        {loading && !data && (
          <div className="flex items-center justify-center h-full">
            <div className="font-mono text-sm text-muted">Loading...</div>
          </div>
        )}

        {error && !data && (
          <div className="flex items-center justify-center h-full">
            <div className="font-mono text-sm text-red">
              Error: {error}
              <button onClick={refresh} className="ml-3 text-accent2 underline cursor-pointer">Retry</button>
            </div>
          </div>
        )}

        {data && activeTab === 'live' && (
          <LiveTable assets={live} tags={tags} />
        )}
        {data && activeTab === 'history' && (
          <HistoryTable entries={history} tags={tags} />
        )}
        {data && activeTab === 'descriptions' && (
          <DescriptionsTable assets={descriptions} historyAssets={descriptionsHistory} />
        )}
        {activeTab === 'compare' && (
          <CrossCampaignTab />
        )}

        {data && !loading && live.length === 0 && history.length === 0 && activeTab !== 'compare' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center font-mono text-sm text-muted">
              <div className="mb-2">No data yet for this campaign.</div>
              <div className="text-[10px]">Click Sync in the header to seed initial data.</div>
            </div>
          </div>
        )}
      </div>

      {showH2H && data && (
        <HeadToHead assets={live} onClose={() => setShowH2H(false)} />
      )}
    </>
  );
}
