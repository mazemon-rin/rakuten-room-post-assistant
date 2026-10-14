const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src/core/affiliate-rate-diagnostic.js"), "utf8");
const context = { URLSearchParams, Number, String, Object, Array, Promise, setTimeout };
context.globalThis = context;
vm.runInNewContext(source, context);
const api = context.AffiliateRateDiagnostic;
const itemCode = api.ITEM_CODE;
const appId = "app-secret";
const accessKey = "access-secret";

assert.deepStrictEqual(Array.from(api.CONDITIONS, ({ id }) => id), ["A", "B", "C", "D"]);
const expected = {
  A: { keyword: "しそ餃子", itemCode: null, hits: "30", minimum: null },
  B: { keyword: null, itemCode, hits: "1", minimum: null },
  C: { keyword: "しそ餃子", itemCode: null, hits: "30", minimum: "5" },
  D: { keyword: null, itemCode, hits: "1", minimum: "5" }
};
for (const [id, values] of Object.entries(expected)) {
  const params = api.buildDiagnosticParams(appId, accessKey, id);
  assert.strictEqual(params.get("format"), "json");
  assert.strictEqual(params.get("applicationId"), appId);
  assert.strictEqual(params.get("accessKey"), accessKey);
  assert.strictEqual(params.get("keyword"), values.keyword);
  assert.strictEqual(params.get("itemCode"), values.itemCode);
  assert.strictEqual(params.get("hits"), values.hits);
  assert.strictEqual(params.get("minAffiliateRate"), values.minimum);
}
assert.throws(() => api.buildDiagnosticParams(appId, accessKey, "X"), /診断条件が不正/);

const success = api.summarizeResponse(200, { count: 2, Items: [
  { itemCode: "another-shop:other-item", affiliateRate: 2 },
  { itemCode, affiliateRate: "20" }
] });
assert.strictEqual(success.state, "success");
assert.strictEqual(success.httpStatus, 200);
assert.strictEqual(success.apiCount, 2);
assert.strictEqual(success.fetchedCount, 2);
assert.strictEqual(success.targetFound, true);
assert.strictEqual(success.affiliateRate, "20");
assert.strictEqual(success.affiliateRateType, "string");

const noTarget = api.summarizeResponse(200, { count: 2, Items: [
  { itemCode: "shop:one", affiliateRate: 1 }, { itemCode: "shop:two", affiliateRate: 3 }
] });
assert.strictEqual(noTarget.state, "success");
assert.strictEqual(noTarget.targetFound, false);
assert.strictEqual(noTarget.affiliateRate, null);
assert.strictEqual(api.summarizeResponse(200, { count: 0, Items: [] }).state, "zero_results");
assert.strictEqual(api.summarizeResponse(200, { count: 1, Items: [{ itemCode }] }).affiliateRateType, "unavailable");
assert.strictEqual(api.summarizeResponse(200, {}).state, "api_error");

const failure = api.summarizeResponse(400, { error: "wrong_parameter", error_description: `applicationId=${appId} accessKey=${accessKey}` });
assert.strictEqual(failure.state, "api_error");
assert.strictEqual(failure.httpStatus, 400);
assert.strictEqual(failure.errorCode, "wrong_parameter");
assert.strictEqual(JSON.stringify(failure).includes(appId), false);
assert.strictEqual(JSON.stringify(failure).includes(accessKey), false);
assert.strictEqual(JSON.stringify(failure).includes("error_description"), false);
assert.strictEqual(api.summarizeResponse(400, { error: "unrecognized-secret", error_description: "sensitive details" }).errorCode, null);

(async () => {
  let fakeNow = 10000;
  const waits = [];
  const rateLimitOptions = { now: () => fakeNow, wait: async (ms) => { waits.push(ms); fakeNow += ms; } };
  const requested = [];
  const result = await api.runDiagnosticCondition({
    applicationId: appId,
    accessKey,
    conditionId: "A",
    ...rateLimitOptions,
    fetchImpl: async (url, options) => {
      requested.push({ url: new URL(url), options });
      return { status: 200, json: async () => ({ count: 1, Items: [{ itemCode, affiliateRate: 20 }] }) };
    }
  });
  assert.strictEqual(requested.length, 1, "one condition must make exactly one request");
  assert.strictEqual(requested[0].url.searchParams.get("keyword"), "しそ餃子");
  assert.strictEqual(requested[0].url.searchParams.get("hits"), "30");
  assert.strictEqual(requested[0].url.searchParams.get("itemCode"), null);
  assert.strictEqual(requested[0].options.method, "GET");
  assert.strictEqual(requested[0].options.headers.accessKey, undefined);
  assert.strictEqual(result.conditionId, "A");
  assert.strictEqual(result.targetFound, true);
  assert.strictEqual(result.affiliateRate, 20);
  assert.strictEqual(JSON.stringify(result).includes(appId), false);
  assert.strictEqual(JSON.stringify(result).includes(accessKey), false);
  assert.strictEqual(JSON.stringify(result).includes("openapi.rakuten"), false);

  const absent = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "C",
    ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 0, Items: [] }) })
  });
  assert.strictEqual(absent.state, "zero_results");
  assert.strictEqual(absent.targetFound, false);

  const http400 = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "D",
    ...rateLimitOptions,
    fetchImpl: async () => ({ status: 400, json: async () => ({ error: "wrong_parameter", error_description: `${appId} ${accessKey}` }) })
  });
  assert.strictEqual(http400.httpStatus, 400);
  assert.strictEqual(http400.errorCode, "wrong_parameter");
  assert.strictEqual(JSON.stringify(http400).includes(appId), false);
  assert.strictEqual(JSON.stringify(http400).includes(accessKey), false);

  const targetRateMissing = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "B",
    ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 1, Items: [{ itemCode }] }) })
  });
  assert.strictEqual(targetRateMissing.targetFound, true);
  assert.strictEqual(targetRateMissing.affiliateRate, null);
  assert.strictEqual(targetRateMissing.affiliateRateType, "unavailable");
  assert.deepStrictEqual(waits, [1200, 1200, 1200]);

  console.log("Affiliate rate diagnostic mock cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
