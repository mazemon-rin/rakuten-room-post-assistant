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

const params = new URLSearchParams();
normalization.addParam(params, "present", "value");
normalization.addParam(params, "empty", "");
normalization.addParam(params, "zero", 0);
normalization.addParam(params, "false", false);
assert.strictEqual(params.toString(), "present=value");

console.log("product-normalization tests passed");
