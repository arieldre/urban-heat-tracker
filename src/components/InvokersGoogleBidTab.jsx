import { useState, useEffect } from 'react';

function microsToDollars(micros) {
  return (parseInt(micros || '0') / 1_000_000).toFixed(2);
}

export default function InvokersGoogleBidTab() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [tcpaValue, setTcpaValue] = useState('');
  const [budgetValue, setBudgetValue] = useState('');
  const [submittingTcpa, setSubmittingTcpa] = useState(false);
  const [submittingBudget, setSubmittingBudget] = useState(false);
  const [tcpaResult, setTcpaResult] = useState(null);
  const [budgetResult, setBudgetResult] = useState(null);
  const [tcpaError, setTcpaError] = useState(null);
  const [budgetError, setBudgetError] = useState(null);

  useEffect(() => {
    fetch('/api/edit-descriptions?type=bid-info')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoadError(d.error); return; }
        setInfo(d);
        setTcpaValue(microsToDollars(d.tcpaMicros));
        setBudgetValue(microsToDollars(d.budgetMicros));
      })
      .catch(e => setLoadError('Network error: ' + e.message))
      .finally(() => setLoading(false));
  }, []);

  const submitField = async (field, value, setSubmitting, setResult, setError) => {
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch('/api/edit-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bid-update', field, value }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      const newDollars = microsToDollars(data.newMicros);
      setResult(`Updated to $${newDollars}`);
      setInfo(prev => prev ? {
        ...prev,
        [field === 'tcpa' ? 'tcpaMicros' : 'budgetMicros']: data.newMicros,
      } : prev);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 font-mono text-[11px] text-muted">Loading bid info…</div>;
  if (loadError) return <div className="p-6 font-mono text-[11px] text-red">{loadError}</div>;

  return (
    <div className="p-6 max-w-[480px]">
      <div className="font-mono text-[10px] text-text2 uppercase tracking-wider border-b border-border pb-3 mb-5">
        Invokers UAC — Bid &amp; Budget
      </div>

      {info && (
        <div className="mb-5 bg-surface2 border border-border rounded p-3 font-mono text-[11px] space-y-1 text-text2">
          <div><span className="text-muted">Campaign:</span> {info.campaignName}</div>
          <div><span className="text-muted">Current tCPA:</span> <span className="text-text font-semibold">${microsToDollars(info.tcpaMicros)}</span></div>
          <div><span className="text-muted">Daily Budget:</span> <span className="text-text font-semibold">${microsToDollars(info.budgetMicros)}</span></div>
        </div>
      )}

      {/* tCPA */}
      <div className="mb-6">
        <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">
          Target CPA (USD)
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={tcpaValue}
              onChange={e => setTcpaValue(e.target.value)}
              className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded pl-6 pr-3 py-2 focus:border-accent2 outline-none"
            />
          </div>
          <button
            onClick={() => submitField('tcpa', tcpaValue, setSubmittingTcpa, setTcpaResult, setTcpaError)}
            disabled={submittingTcpa || !tcpaValue}
            className="px-4 py-2 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors whitespace-nowrap"
          >
            {submittingTcpa ? '…' : 'Update'}
          </button>
        </div>
        {tcpaResult && <div className="font-mono text-[10px] text-green mt-1">✓ {tcpaResult}</div>}
        {tcpaError && <div className="font-mono text-[10px] text-red mt-1">{tcpaError}</div>}
      </div>

      {/* Budget */}
      <div className="mb-6">
        <label className="block font-mono text-[10px] text-text2 uppercase tracking-wider mb-2">
          Daily Budget (USD)
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">$</span>
            <input
              type="number"
              min="1"
              step="1"
              value={budgetValue}
              onChange={e => setBudgetValue(e.target.value)}
              className="w-full bg-surface2 border border-border text-text font-mono text-[11px] rounded pl-6 pr-3 py-2 focus:border-accent2 outline-none"
            />
          </div>
          <button
            onClick={() => submitField('budget', budgetValue, setSubmittingBudget, setBudgetResult, setBudgetError)}
            disabled={submittingBudget || !budgetValue}
            className="px-4 py-2 font-mono text-[11px] font-semibold bg-accent text-bg rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors whitespace-nowrap"
          >
            {submittingBudget ? '…' : 'Update'}
          </button>
        </div>
        {budgetResult && <div className="font-mono text-[10px] text-green mt-1">✓ {budgetResult}</div>}
        {budgetError && <div className="font-mono text-[10px] text-red mt-1">{budgetError}</div>}
      </div>

      <div className="font-mono text-[9px] text-muted border-t border-border pt-3">
        Changes take effect within minutes. Budget is shared — modifying it affects all campaigns using this budget.
      </div>
    </div>
  );
}
