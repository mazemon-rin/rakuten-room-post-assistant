const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("script.js", "utf8");
function extractFunction(name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} exists`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} has a top-level closing brace`);
  return source.slice(start, end + 2);
}

const helperSource = [
  "const EXPANDED_SEARCH_MAX_429_RETRIES = 2;",
  extractFunction("getExpandedSearchRetryWaitMs"),
  extractFunction("requestRakutenItemSearch"),
  "this.testRequestRakutenItemSearch = requestRakutenItemSearch;"
].join("\n");

async function exercise(responses) {
  let call = 0;
  const waits = [];
  const context = {
    URLSearchParams,
    data: { settings: { applicationId: "SENTINEL_APP_ID", accessKey: "SENTINEL_ACCESS_KEY", affiliateId: "affiliate-test" } },
    hasRakutenCredentials: () => true,
    addAffiliateIdParam: () => {},
    normalizeRakutenItems: (payload) => payload.items || [],
    readRakutenApiError: async (response) => `HTTP ${response.status}：${await response.text()}`,
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    formatRakutenApiError: (text) => String(text).replaceAll("SENTINEL_APP_ID", "[applicationId]").replaceAll("SENTINEL_ACCESS_KEY", "[accessKey]"),
    window: { fetch: async () => responses[Math.min(call++, responses.length - 1)] }
  };
  vm.createContext(context);
  vm.runInContext(helperSource, context);
  return { context, waits, getCalls: () => call };
}

function response(status, body, retryAfter = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name.toLowerCase() === "retry-after" ? retryAfter : null },
    text: async () => body,
    json: async () => ({ items: [{ itemCode: "shop:1", itemName: "テスト商品" }] })
  };
}

(async () => {
  const successful = await exercise([response(429, '{"error_description":"Try again in 1 seconds."}'), response(200, "")]);
  const result = await successful.context.testRequestRakutenItemSearch("検索語", { retry429: true });
  assert.equal(result.products[0].itemCode, "shop:1");
  assert.equal(successful.getCalls(), 2);
  assert.deepEqual(successful.waits, [1000], "server body wait is honored");

  const legacyCall = await exercise([response(429, "rate limited"), response(200, "")]);
  await assert.rejects(legacyCall.context.testRequestRakutenItemSearch("既存検索"), (error) => error.status === 429);
  assert.equal(legacyCall.getCalls(), 1, "callers that do not opt in keep their existing single-attempt behavior");
  assert.deepEqual(legacyCall.waits, []);

  const headerWait = await exercise([response(429, '{"error_description":"Try again in 1 seconds."}', "2"), response(200, "")]);
  await headerWait.context.testRequestRakutenItemSearch("検索語", { retry429: true });
  assert.deepEqual(headerWait.waits, [2000], "Retry-After header takes precedence");

  const limited = await exercise([response(429, '{"error_description":"Try again in 1 seconds. SENTINEL_ACCESS_KEY"}')]);
  await assert.rejects(limited.context.testRequestRakutenItemSearch("検索語", { retry429: true }), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.retryCount, 2);
    assert.equal(error.message.includes("SENTINEL_ACCESS_KEY"), false, "API secret is not exposed in error text");
    return true;
  });
  assert.equal(limited.getCalls(), 3, "two retries cap the request at three attempts");
  assert.deepEqual(limited.waits, [1000, 1000]);

  console.log("expanded search 429 server wait, Retry-After, bounded retry, and secret masking: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
