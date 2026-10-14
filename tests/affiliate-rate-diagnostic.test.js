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

const noFilter = api.buildDiagnosticParams("app-secret", null);
assert.strictEqual(noFilter.get("itemCode"), itemCode);
assert.strictEqual(noFilter.has("minAffiliateRate"), false);
assert.strictEqual(noFilter.has("accessKey"), false);
assert.strictEqual(noFilter.has("sort"), false);
const filtered = api.buildDiagnosticParams("app-secret", 5);
assert.strictEqual(filtered.get("minAffiliateRate"), "5");
assert.strictEqual(filtered.get("itemCode"), itemCode);

const success = api.summarizeResponse(200, { count: 1, Items: [{ itemCode, affiliateRate: "20" }] });
assert.strictEqual(success.state, "success");
assert.strictEqual(success.httpStatus, 200);
assert.strictEqual(success.apiCount, 1);
assert.strictEqual(success.fetchedCount, 1);
assert.strictEqual(success.targetFound, true);
assert.strictEqual(success.affiliateRate, "20");
assert.strictEqual(success.affiliateRateType, "string");

const zero = api.summarizeResponse(200, { count: 0, Items: [] });
assert.strictEqual(zero.state, "zero_results");
assert.strictEqual(zero.targetFound, false);
assert.strictEqual(api.summarizeResponse(200, {}).state, "api_error");
const failure = api.summarizeResponse(400, { error: "invalid_request", error_description: "sensitive details" });
assert.strictEqual(failure.state, "api_error");
assert.strictEqual(failure.httpStatus, 400);
assert.strictEqual(failure.errorCode, null);
const knownFailure = api.summarizeResponse(400, { error: "wrong_parameter", error_description: "applicationId=app-secret accessKey=access-secret" });
assert.strictEqual(knownFailure.errorCode, "wrong_parameter");
assert.strictEqual(JSON.stringify(knownFailure).includes("error_description"), false);
assert.strictEqual(JSON.stringify(knownFailure).includes("app-secret"), false);
assert.strictEqual(JSON.stringify(knownFailure).includes("access-secret"), false);
const unknownFailure = api.summarizeResponse(400, { error: "unknown_api_error", error_description: "do not expose" });
assert.strictEqual(unknownFailure.errorCode, null);
assert.strictEqual(api.getSafeApiErrorCode({ error: "access-secret" }), null);
assert.strictEqual(JSON.stringify(unknownFailure).includes("do not expose"), false);

(async () => {
  const requests = [];
  const requestOptions = [];
  const waits = [];
  const payloads = [
    { count: 1, Items: [{ itemCode, affiliateRate: 20 }] },
    { count: 0, Items: [] }
  ];
  const results = await api.runDiagnostic({
    applicationId: "app-secret", accessKey: "access-secret", wait: async (ms) => waits.push(ms),
    fetchImpl: async (url, options) => {
      requests.push(new URL(url));
      requestOptions.push(options);
      assert.strictEqual(url.includes("access-secret"), false);
      const payload = payloads.shift();
      return { status: 200, json: async () => payload };
    }
  });
  assert.strictEqual(requests.length, 2);
  assert.strictEqual(requests[0].searchParams.has("minAffiliateRate"), false);
  assert.strictEqual(requests[1].searchParams.get("minAffiliateRate"), "5");
  assert.strictEqual(requestOptions[0].headers.accessKey, "access-secret");
  assert.deepStrictEqual(waits, [1200]);
  assert.strictEqual(results[0].targetFound, true);
  assert.strictEqual(results[1].state, "zero_results");
  assert.strictEqual(JSON.stringify(results).includes("20"), true);
  assert.strictEqual(JSON.stringify(results).includes("app-secret"), false);
  assert.strictEqual(JSON.stringify(results).includes("access-secret"), false);

  const apiError = await api.runDiagnostic({
    applicationId: "app-secret", accessKey: "access-secret", wait: async () => {},
    fetchImpl: async () => ({ status: 400, json: async () => ({ error: "invalid_request", error_description: "do not expose" }) })
  });
  assert.strictEqual(apiError[0].state, "api_error");
  assert.strictEqual(apiError[0].httpStatus, 400);
  assert.strictEqual(apiError[0].errorCode, null);
  assert.strictEqual(apiError[0].errorType, undefined);
  assert.strictEqual(JSON.stringify(apiError).includes("do not expose"), false);

  const allowedApiError = await api.runDiagnostic({
    applicationId: "app-secret", accessKey: "access-secret", wait: async () => {},
    fetchImpl: async () => ({ status: 400, json: async () => ({ error: "wrong_parameter", error_description: "access-secret echoed in detail" }) })
  });
  assert.strictEqual(allowedApiError[0].errorCode, "wrong_parameter");
  assert.strictEqual(JSON.stringify(allowedApiError).includes("access-secret"), false);
  assert.strictEqual(JSON.stringify(allowedApiError).includes("echoed in detail"), false);

  const noJsonError = await api.runDiagnostic({
    applicationId: "app-secret", accessKey: "access-secret", wait: async () => {},
    fetchImpl: async () => ({ status: 400, json: async () => { throw new Error("invalid json"); } })
  });
  assert.strictEqual(noJsonError[0].httpStatus, 400);
  assert.strictEqual(noJsonError[0].errorCode, null);

  console.log("Affiliate rate diagnostic mock cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
