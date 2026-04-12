import { useState } from 'react';
import Header from './components/Header.jsx';
import LiveTable from './components/LiveTable.jsx';
import HistoryTable from './components/HistoryTable.jsx';
import DescriptionsTable from './components/DescriptionsTable.jsx';
import { useTrackerData } from './hooks/useTrackerData.js';
import { CAMPAIGNS } from './config.js';

export default function App() {
  const [campaignId, setCampaignId] = useState(CAMPAIGNS[0].id);
  const [activeTab, setActiveTab] = useState('live');
  const { data, loading, error, refresh } = useTrackerData(campaignId);

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

  return (
    <>
      <Header
        selectedCampaign={campaignId}
        onCampaignChange={setCampaignId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
        lastSyncedAt={data?.lastSyncedAt}
      />

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
              <button
                onClick={refresh}
                className="ml-3 text-accent2 underline cursor-pointer"
              >
                Retry
              </button>
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

        {data && !loading && live.length === 0 && history.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center font-mono text-sm text-muted">
              <div className="mb-2">No data yet for this campaign.</div>
              <div className="text-[10px]">Trigger a sync at <span className="text-accent2">/api/sync</span> to seed initial data.</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
