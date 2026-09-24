(function initPremiumHistory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PremiumHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPremiumHistoryApi() {
  const STORAGE_KEY = "us-stock-dashboard:premium-history:v1";

  function emptyState() {
    return { version: 1, funds: {} };
  }

  function load(storage) {
    if (!storage) return emptyState();
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== 1 || typeof parsed.funds !== "object") return emptyState();
      return parsed;
    } catch {
      return emptyState();
    }
  }

  function save(storage, state) {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The dashboard remains usable when browser storage is unavailable.
    }
  }

  function recordPremiums(etfs, recordedAt, storage) {
    const state = load(storage);
    let changed = false;

    for (const etf of Array.isArray(etfs) ? etfs : []) {
      const code = String(etf?.code || "");
      const premium = etf?.premiumPct;
      if (!code || !Number.isFinite(premium)) continue;

      const sampleId = `${recordedAt || "unknown"}:${code}`;
      const previous = state.funds[code] || {};
      if (previous.lastSampleId === sampleId) continue;

      const previousSum = Number.isFinite(previous.sum) ? previous.sum : 0;
      const previousCount = Number.isInteger(previous.count) && previous.count > 0 ? previous.count : 0;
      const sum = previousSum + premium;
      const count = previousCount + 1;
      state.funds[code] = {
        sum,
        count,
        average: sum / count,
        firstRecordedAt: previous.firstRecordedAt || recordedAt || null,
        lastRecordedAt: recordedAt || null,
        lastSampleId: sampleId
      };
      changed = true;
    }

    if (changed) save(storage, state);
    return state.funds;
  }

  return { STORAGE_KEY, emptyState, load, recordPremiums };
});
