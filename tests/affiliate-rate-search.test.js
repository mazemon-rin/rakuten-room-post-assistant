const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "core", "affiliate-rate-search.js"), "utf8");
const context = { URLSearchParams, Number, String, Object, Array, RangeError };
context.globalThis = context;
vm.runInNewContext(source, context);
const api = context.AffiliateRateSearch;

for (const threshold of [5, 10, 15, 20]) {
  const params = new URLSearchParams("keyword=tea&sort=standard");
  api.applyHighAffiliateRateParams(params, threshold);
  assert.strictEqual(params.get("minAffiliateRate"), String(threshold));
  assert.strictEqual(params.get("sort"), "-affiliateRate");
  assert.strictEqual(params.get("keyword"), "tea");
}
assert.throws(() => api.applyHighAffiliateRateParams(new URLSearchParams(), 25), RangeError);

const sourceProduct = {
  itemCode: "shop:item-1", itemName: "商品A", itemPrice: 2500, itemUrl: "https://item.example/a",
  affiliateUrl: "https://af.example/a", shopName: "ショップ", itemCaption: "確認済み説明",
  affiliateRate: "15.5", mediumImageUrls: [{ imageUrl: "https://img.example/a", largeUnneededPayload: "x" }],
  smallImageUrls: [{ imageUrl: "https://img.example/b" }],
  privateOrLargeApiPayload: { many: "unneeded fields" }
};
const result = api.withApiAffiliateRate(sourceProduct);
assert.strictEqual(result.apiAffiliateRate, 15.5);
assert.strictEqual(result.apiAffiliateRateSource, "Rakuten Ichiba Item Search API");
assert.strictEqual(api.withApiAffiliateRate({ affiliateRate: null }).apiAffiliateRate, null);

const emptyResponse = api.processHighRateSearchResponses([{ count: 0, items: [] }], { requestedCount: 10 });
assert.strictEqual(emptyResponse.apiTotalCount, 0, "successful API response with zero count is distinct from a failed request");
assert.strictEqual(emptyResponse.fetchedCount, 0);
assert.strictEqual(emptyResponse.displayedCount, 0);
const failedResponse = api.processHighRateSearchResponses([], {});
assert.strictEqual(failedResponse.apiTotalCount, null, "failed requests have no API count");
assert(api.getHighRateSearchState(emptyResponse, 1).includes("検索成功"), "normal empty response is reported as a genuine zero-result search");
assert(api.getHighRateSearchState(failedResponse, 0).includes("検索失敗"), "transport/API failure is not described as zero results");
assert(api.getHighRateSearchState({ displayedCount: 0, fetchedCount: 1 }, 1).includes("除外後"), "items filtered out after fetch are distinguished from API zero results");

const thirtyProducts = Array.from({ length: 30 }, (_, index) => ({
  itemCode: `shop:item-${index + 1}`,
  itemName: `商品${index + 1}`,
  affiliateRate: String(index + 5)
}));
const tenShown = api.processHighRateSearchResponses([{ count: "120", items: thirtyProducts }], {
  requestedCount: 10,
  getIdentity: (product) => product.itemCode
});
assert.strictEqual(tenShown.apiTotalCount, 120);
assert.strictEqual(tenShown.fetchedCount, 30);
assert.strictEqual(tenShown.duplicateExcludedCount, 0);
assert.strictEqual(tenShown.displayedCount, 10);
assert.deepStrictEqual(JSON.parse(JSON.stringify(tenShown.products.map((product) => product.apiAffiliateRate))), [34, 33, 32, 31, 30, 29, 28, 27, 26, 25], "sort by rate before limiting to the requested count");

const postedTopTen = new Set(thirtyProducts.slice(20).map((product) => product.itemCode));
const fillsPastPosted = api.processHighRateSearchResponses([{ count: 30, items: thirtyProducts }], {
  requestedCount: 10,
  getIdentity: (product) => product.itemCode,
  isPosted: (product) => postedTopTen.has(product.itemCode)
});
assert.strictEqual(fillsPastPosted.postedExcludedCount, 10);
assert.strictEqual(fillsPastPosted.displayedCount, 10);
assert.deepStrictEqual(JSON.parse(JSON.stringify(fillsPastPosted.products.map((product) => product.apiAffiliateRate))), [24, 23, 22, 21, 20, 19, 18, 17, 16, 15], "posted top ten are removed before selecting ten display results");

const unavailableCase = api.processHighRateSearchResponses([{ count: 12, items: [
  ...Array.from({ length: 11 }, (_, index) => ({ itemCode: `available:${index}`, affiliateRate: 11 - index })),
  { itemCode: "gone:item", affiliateRate: 20, availability: 0 }
] }], {
  requestedCount: 10,
  getIdentity: (product) => product.itemCode,
  isUnavailable: (product) => product.availability === 0
});
assert.strictEqual(unavailableCase.unavailableExcludedCount, 1);
assert.strictEqual(unavailableCase.displayedCount, 10, "available products fill the requested count after removing unavailable items");
assert(!unavailableCase.products.some((product) => product.itemCode === "gone:item"));

const duplicateAndUnknownRate = api.processHighRateSearchResponses([
  { count: 2, items: [{ itemCode: "same:item", affiliateRate: "8" }, { itemCode: "unknown:item" }] },
  { count: 2, items: [{ itemCode: "same:item", affiliateRate: "15" }, { itemCode: "other:item", affiliateRate: 5 }] }
], { requestedCount: 10, getIdentity: (product) => product.itemCode });
assert.strictEqual(duplicateAndUnknownRate.apiTotalCount, 4, "API count is summed across successful queries");
assert.strictEqual(duplicateAndUnknownRate.fetchedCount, 4);
assert.strictEqual(duplicateAndUnknownRate.duplicateExcludedCount, 1);
assert.strictEqual(duplicateAndUnknownRate.rateMissingCount, 1);
assert(duplicateAndUnknownRate.products.some((product) => product.itemCode === "unknown:item"), "unknown rate is counted but not excluded");

const apiErrorText = api.formatHighRateApiErrors([{ category: "食品", status: 400, type: "wrong_parameter", detail: "accessKey=SECRET&applicationId=APPSECRET invalid query" }]);
assert(apiErrorText.includes("HTTP 400"));
assert(apiErrorText.includes("wrong_parameter"));
assert(!apiErrorText.includes("SECRET"));
assert(!apiErrorText.includes("APPSECRET"));

const resultsContainer = { innerHTML: "<article>stale results</article>" };
const messageElement = { textContent: "前回の検索結果" };
const resetState = api.resetSearchModeState(resultsContainer, messageElement);
assert.strictEqual(resultsContainer.innerHTML, "", "changing search mode clears stale result cards");
assert.strictEqual(messageElement.textContent, "検索条件を設定して商品を検索してください。");
assert.deepStrictEqual(JSON.parse(JSON.stringify(resetState)), { highRateResults: [], normalResults: [] });

assert.deepStrictEqual(JSON.parse(JSON.stringify(api.sortByApiAffiliateRate([
  { apiAffiliateRate: 5 }, { apiAffiliateRate: 20 }, { apiAffiliateRate: null }, { apiAffiliateRate: 10 }
]))), [{ apiAffiliateRate: 20 }, { apiAffiliateRate: 10 }, { apiAffiliateRate: 5 }, { apiAffiliateRate: null }]);
const mockedApiResults = new Map();
api.mergeApiResultsByIdentity(mockedApiResults, [
  { itemCode: "shop:a", affiliateRate: 10 },
  { itemCode: "shop:b", affiliateRate: 20 }
], (product) => product.itemCode);
api.mergeApiResultsByIdentity(mockedApiResults, [
  { itemCode: "shop:a", affiliateRate: 15 },
  { itemCode: "shop:c", affiliateRate: 5 }
], (product) => product.itemCode);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.sortByApiAffiliateRate([...mockedApiResults.values()]).map((item) => item.itemCode))), ["shop:b", "shop:a", "shop:c"]);
const candidateProduct = api.buildHighRateCandidateProduct(result);
assert.strictEqual(candidateProduct.itemCode, sourceProduct.itemCode);
assert.strictEqual(candidateProduct.apiAffiliateRate, 15.5);
assert.strictEqual(candidateProduct.apiAffiliateRateSource, "Rakuten Ichiba Item Search API");
assert.deepStrictEqual(JSON.parse(JSON.stringify(candidateProduct.mediumImageUrls)), [{ imageUrl: "https://img.example/a" }]);
assert.strictEqual(Object.hasOwn(candidateProduct, "affiliateRate"), false);
assert.strictEqual(Object.hasOwn(candidateProduct, "privateOrLargeApiPayload"), false);

const serialized = JSON.stringify({ candidates: [{ product: candidateProduct }] });
assert(serialized.length < JSON.stringify({ candidates: [{ product: sourceProduct }] }).length, "high-rate candidate persistence should not duplicate the full API response");
assert.strictEqual(JSON.parse(serialized).candidates[0].product.apiAffiliateRate, 15.5, "JSON backup round-trip retains the API reference rate");
console.log("affiliate rate search cases: passed");
