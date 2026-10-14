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
