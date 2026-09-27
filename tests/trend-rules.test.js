const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "core", "trend-rules.js"), "utf8");
const context = { console, Date, Math, Number, String, Object, Array, Set, RegExp, JSON };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);
const rules = context.RoomTrendRules;
const plain = (value) => JSON.parse(JSON.stringify(value));
const stripHtml = (value) => String(value).replace(/<[^>]*>/g, "");

assert.strictEqual(rules.normalizeTrendText(" ＡＢＣ １２３ "), "abc123");
assert.strictEqual(rules.normalizeTrendText("iPhone18-Pro ケース"), "iphone18proケース");
assert.strictEqual(rules.normalizeTrendText(undefined), "");
assert.strictEqual(rules.normalizeTrendText(null), "null");
assert.deepStrictEqual(plain(rules.tokenizeTrendKeyword("iPhone18 Pro ケース").tokens), ["iphone18", "pro", "ケース"]);
assert.strictEqual(rules.tokenizeTrendKeyword(" iPhone18 Pro ").original, "iPhone18 Pro");
assert.strictEqual(rules.isTrendProductTypeToken("ケース"), true);
assert.strictEqual(rules.isTrendProductTypeToken("スマートフォン"), false);

const fit = rules.calculateTrendFitScore({ itemName: "iPhone18Pro ケース MagSafe対応", itemCaption: "<p>便利</p>" }, ["iPhone 18 Pro ケース"], stripHtml);
assert.ok(fit.total >= 27);
assert.ok(fit.typeMatch);
assert.strictEqual(rules.calculateTrendFitScore({}, []).total, 0);

assert.strictEqual(rules.calculateTrendReviewEvidenceScore({ reviewCount: 1000, reviewAverage: 4.5 }, {}).toString(), "15");
assert.strictEqual(rules.calculateTrendReviewEvidenceScore({ reviewCount: 500, reviewAverage: 4.3 }, {}).toString(), "13");
assert.strictEqual(rules.calculateTrendReviewEvidenceScore({ reviewCount: 30, reviewAverage: 4 }, {}).toString(), "8");
assert.strictEqual(rules.calculateTrendReviewEvidenceScore({ reviewCount: 0, reviewAverage: 0 }, { total: 0 }).toString(), "3");

for (const [position, expected] of [[1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0], [undefined, 0]]) {
  const product = { itemName: "ケース", trendSearchPosition: position };
  assert.strictEqual(rules.calculateTrendScore(product, ["ケース"], stripHtml).searchPosition, expected);
}

const now = new Date("2026-10-01T12:00:00+09:00");
assert.strictEqual(rules.calculateEventTiming({ enabled: true, startDate: "2026-10-04" }, now).score, 8);
assert.strictEqual(rules.calculateEventTiming({ enabled: true, startDate: "2026-10-02" }, now).score, 7);
assert.strictEqual(rules.calculateEventTiming({ enabled: true, startDate: "2026-09-30", endDate: "2026-10-02" }, now).score, 6);
assert.strictEqual(rules.calculateEventTiming({ enabled: false, startDate: "2026-10-04" }, now).score, 0);

console.log("trend-rules tests passed");
