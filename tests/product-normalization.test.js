const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("src/core/product-normalization.js", "utf8");
const context = { console, URLSearchParams };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "product-normalization.js" });
const normalization = context.RoomProductNormalization;

assert.ok(normalization);

const flat = { itemCode: "flat", itemName: "商品", unknownField: "kept" };
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalization.normalizeRakutenItems({ items: [flat] }))), [flat]);

const nested = normalization.normalizeRakutenItems({ Items: [{ Item: { itemCode: "nested", itemName: "内側" }, apiOnly: "kept" }] });
assert.deepStrictEqual(JSON.parse(JSON.stringify(nested)), [{ Item: { itemCode: "nested", itemName: "内側" }, apiOnly: "kept", itemCode: "nested", itemName: "内側" }]);
assert.deepStrictEqual(normalization.normalizeRakutenItems({ items: [] }), []);
assert.throws(() => normalization.normalizeRakutenItems(null), (error) => error.name === "TypeError");
assert.throws(() => normalization.normalizeRakutenItems(undefined), (error) => error.name === "TypeError");

const product = {
  itemCode: "abc",
  itemName: "商品名",
  itemPrice: 2080,
  itemUrl: "https://example.test/item",
  affiliateUrl: "https://example.test/affiliate",
  shopName: "ショップ",
  mediumImageUrls: [{ imageUrl: "https://img.test/medium.jpg?_ex=128x128" }, { imageUrl: "https://img.test/shared.jpg" }],
  smallImageUrls: [{ imageUrl: "https://img.test/shared.jpg" }, { imageUrl: "https://img.test/small.jpg" }],
  imageUrl: "https://img.test/small.jpg",
  availability: 1,
  genreId: "1",
  rank: 2,
  sourceRank: 3,
  discountRate: 80,
  coupon: { label: "coupon" },
  unknown: { preserved: true }
};
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalization.getImageCandidates(product))), [
  "https://img.test/medium.jpg",
  "https://img.test/shared.jpg",
  "https://img.test/small.jpg"
]);
assert.strictEqual(normalization.getImage(product), "https://img.test/medium.jpg");
assert.strictEqual(normalization.getImage({}), "");

assert.strictEqual(normalization.isUnavailableProduct({ availability: 1 }), false);
assert.strictEqual(normalization.isUnavailableProduct({ availability: 0 }), true);
assert.strictEqual(normalization.isUnavailableProduct({ itemAvailability: "0" }), true);
assert.strictEqual(normalization.isUnavailableProduct({ availability: false }), true);
for (const status of ["売り切れ", "販売終了", "sold out", "discontinued"]) {
  assert.strictEqual(normalization.isUnavailableProduct({ stockStatus: status }), true);
}
assert.strictEqual(normalization.isUnavailableProduct({ saleStatus: "在庫あり" }), false);

const accountingProducts = [
  { itemCode: "keyword-unavailable-posted", itemName: "除外語 販売終了", availability: 0, posted: true, rank: 99 },
  { itemCode: "unavailable-posted", itemName: "販売終了", availability: 0, posted: true, rank: 99 },
  { itemCode: "posted-out-of-range", itemName: "履歴一致", posted: true, rank: 99 },
  { itemCode: "low-rank", itemName: "順位範囲外", rank: 11 },
  { itemCode: "missing-rank", itemName: "順位なし", rank: null },
  { itemCode: "visible-1", itemName: "表示商品1", rank: 2 },
  { itemCode: "visible-2", itemName: "表示商品2", rank: 3 }
];
const rankingAccounting = normalization.classifySearchResults(accountingProducts, {
  isKeywordExcluded: (item) => item.itemName.includes("除外語"),
  isPosted: (item) => item.posted,
  rankRange: { start: 1, end: 10 }
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(rankingAccounting.counts)), {
  api: 7, keyword: 1, unavailable: 1, posted: 1, rankRange: 2, displayed: 2
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(rankingAccounting.products.map((item) => item.itemCode))), ["visible-1", "visible-2"]);

const regularAccounting = normalization.classifySearchResults(accountingProducts, {
  isKeywordExcluded: (item) => item.itemName.includes("除外語"),
  isPosted: (item) => item.posted
});
assert.strictEqual(regularAccounting.counts.api, 7);
assert.strictEqual(regularAccounting.counts.keyword + regularAccounting.counts.unavailable + regularAccounting.counts.posted + regularAccounting.counts.displayed, 7, "regular search assigns each result to one bucket");
assert.strictEqual(regularAccounting.counts.displayed, 4, "regular search keeps available products not in posted history");

const params = new URLSearchParams();
normalization.addParam(params, "present", "value");
normalization.addParam(params, "empty", "");
normalization.addParam(params, "zero", 0);
normalization.addParam(params, "false", false);
assert.strictEqual(params.toString(), "present=value");

console.log("product-normalization tests passed");
