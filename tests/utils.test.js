const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("src/core/utils.js", "utf8");
const context = { console, globalThis: {}, window: undefined, setTimeout, clearTimeout, Date, Promise, String, Number, Object, Array };
context.globalThis = context;
vm.runInNewContext(source, context);
const utils = context.RoomUtils;

assert.strictEqual(utils.escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
assert.strictEqual(utils.escapeAttr("`&"), "&#96;&amp;");
assert.strictEqual(utils.formatYen(2080), "2,080円");
assert.strictEqual(utils.formatYen(416), "416円");
assert.strictEqual(utils.formatYen(0), "0円");
assert.strictEqual(utils.formatYen(null), "0円");
assert.strictEqual(utils.formatDate("2026-09-27T00:00:00.000Z"), new Date("2026-09-27T00:00:00.000Z").toLocaleDateString("ja-JP"));
assert(/^\d{4}-\d{2}-\d{2}$/.test(utils.dateStamp()));
assert.strictEqual(utils.shorten("短い", 10), "短い");
assert.strictEqual(utils.shorten("123456", 3), "123...");
assert.strictEqual(utils.shorten("", 3), "");
assert.strictEqual(utils.normalizeAffiliateHeader("\uFEFF 発生日 "), "発生日");
assert.strictEqual(utils.normalizeAffiliateStatus("0 - 未確定"), "未確定");
assert.strictEqual(utils.normalizeAffiliateStatus("1 - 確定"), "確定");
assert.strictEqual(utils.normalizeAffiliateStatus("2 - 破棄"), "キャンセル");
assert.strictEqual(utils.normalizeAffiliateText(" 商品－テスト（A） "), "商品テストa");
assert.strictEqual(JSON.stringify(utils.parseCsvRows("見出し,値\n通常,商品")), JSON.stringify([["見出し", "値"], ["通常", "商品"]]));
assert.strictEqual(JSON.stringify(utils.parseCsvRows('a,"b,c","d""e"\n"改行\n値",')), JSON.stringify([["a", "b,c", 'd"e'], ["改行\n値", ""]]));
utils.sleep(0).then(() => console.log("utils regression cases: passed"));
