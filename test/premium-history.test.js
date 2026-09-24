const test = require("node:test");
const assert = require("node:assert/strict");

const {
  STORAGE_KEY,
  recordPremiums,
  classifyAgainstAverage
} = require("../public/premium-history.js");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test("keeps a cumulative average per ETF and survives reloads", () => {
  const storage = createStorage();
  recordPremiums([
    { code: "513100", premiumPct: 2 },
    { code: "513500", premiumPct: 8 }
  ], "2026-09-24T01:00:00.000Z", storage);

  const result = recordPremiums([
    { code: "513100", premiumPct: 4 },
    { code: "513500", premiumPct: 10 }
  ], "2026-09-24T01:00:30.000Z", storage);

  assert.equal(result["513100"].average, 3);
  assert.equal(result["513100"].count, 2);
  assert.equal(result["513500"].average, 9);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).funds["513500"].count, 2);
});

test("does not count the same snapshot twice and ignores invalid premiums", () => {
  const storage = createStorage();
  const time = "2026-09-24T01:00:00.000Z";
  recordPremiums([{ code: "159655", premiumPct: 7.5 }], time, storage);
  recordPremiums([{ code: "159655", premiumPct: 7.5 }], time, storage);
  const result = recordPremiums([
    { code: "159655", premiumPct: null },
    { code: "513650", premiumPct: "not-a-number" }
  ], "2026-09-24T01:00:30.000Z", storage);

  assert.equal(result["159655"].count, 1);
  assert.equal(result["159655"].average, 7.5);
  assert.equal(result["513650"], undefined);
});

test("classifies current premium only as high or low relative to its average", () => {
  assert.deepEqual(classifyAgainstAverage(8.2, 8.1), {
    label: "高",
    level: "danger",
    comparison: "above"
  });
  assert.deepEqual(classifyAgainstAverage(7.9, 8.1), {
    label: "低",
    level: "good",
    comparison: "atOrBelow"
  });
  assert.equal(classifyAgainstAverage(8.1, 8.1).label, "低");
});
