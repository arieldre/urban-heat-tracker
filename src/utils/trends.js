/**
 * Compute trend metrics from daily data arrays.
 */

/**
 * Split daily array into recent vs prior windows.
 * Default: last 7 days vs prior 7 days.
 */
export function splitWindow(daily, windowDays = 7) {
  if (!daily || daily.length === 0) return { recent: [], prior: [] };
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-windowDays);
  const prior = sorted.slice(-windowDays * 2, -windowDays);
  return { recent, prior };
}

/**
 * Sum a numeric field across daily entries.
 */
function sum(entries, field) {
  return entries.reduce((s, e) => s + (e[field] || 0), 0);
}

/**
 * Compute CPA trend: compare recent window CPA vs prior window CPA.
 * Returns { recentCpa, priorCpa, delta, direction: 'improving'|'worsening'|'flat'|'new' }
 */
export function cpaTrend(daily, windowDays = 7) {
  const { recent, prior } = splitWindow(daily, windowDays);

  const recentSpend = sum(recent, 'spend');
  const recentConv = sum(recent, 'conversions');
  const priorSpend = sum(prior, 'spend');
  const priorConv = sum(prior, 'conversions');

  const recentCpa = recentConv > 0 ? recentSpend / recentConv : null;
  const priorCpa = priorConv > 0 ? priorSpend / priorConv : null;

  if (recentCpa === null) return { recentCpa: null, priorCpa, delta: null, direction: 'new' };
  if (priorCpa === null) return { recentCpa, priorCpa: null, delta: null, direction: 'new' };

  const delta = recentCpa - priorCpa;
  const pctChange = priorCpa > 0 ? (delta / priorCpa) * 100 : 0;

  // >10% cheaper = improving, >10% more expensive = worsening, else flat
  let direction = 'flat';
  if (pctChange < -10) direction = 'improving';
  else if (pctChange > 10) direction = 'worsening';

  return { recentCpa: +recentCpa.toFixed(3), priorCpa: +priorCpa.toFixed(3), delta: +delta.toFixed(3), pctChange: +pctChange.toFixed(1), direction };
}

/**
 * Compute spend velocity: recent window spend vs prior window.
 * Returns { recentSpend, priorSpend, direction: 'scaling'|'throttled'|'stable'|'new' }
 */
export function spendVelocity(daily, windowDays = 7) {
  const { recent, prior } = splitWindow(daily, windowDays);

  const recentSpend = +sum(recent, 'spend').toFixed(2);
  const priorSpend = +sum(prior, 'spend').toFixed(2);

  if (priorSpend === 0 && recentSpend === 0) return { recentSpend, priorSpend, direction: 'new' };
  if (priorSpend === 0) return { recentSpend, priorSpend, direction: 'scaling' };

  const pctChange = ((recentSpend - priorSpend) / priorSpend) * 100;

  let direction = 'stable';
  if (pctChange > 25) direction = 'scaling';
  else if (pctChange < -25) direction = 'throttled';

  return { recentSpend, priorSpend, pctChange: +pctChange.toFixed(1), direction };
}

/**
 * Compute days active from firstSeenAt to lastSeenAt.
 */
export function daysActive(firstSeenAt, lastSeenAt) {
  if (!firstSeenAt || !lastSeenAt) return null;
  const diff = new Date(lastSeenAt) - new Date(firstSeenAt);
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Compute dynamic CPA thresholds from a set of assets.
 * Returns [good, mid] where good = median * 0.8, mid = median * 1.3
 */
export function dynamicCpaThresholds(assets) {
  const cpas = assets.filter(a => a.cpa !== null && a.cpa > 0 && a.spend > 2).map(a => a.cpa).sort((a, b) => a - b);
  if (cpas.length === 0) return [0.35, 0.65];
  const median = cpas[Math.floor(cpas.length / 2)];
  return [+(median * 0.8).toFixed(3), +(median * 1.3).toFixed(3)];
}
