const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("src/core/ranking-rules.js", "utf8");
const context = { JSON, Number, Math, String, Object, Array, RegExp, Date };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "ranking-rules.js" });
const rules = context.RoomRankingRules;

const ranges = [
  [[1, 10], { start: 1, end: 10 }, [1]],
  [[11, 10], { start: 11, end: 20 }, [1]],
  [[21, 10], { start: 21, end: 30 }, [1]],
  [[31, 10], { start: 31, end: 40 }, [2]],
  [[41, 10], { start: 41, end: 50 }, [2]],
  [[31, 20], { start: 31, end: 50 }, [2]],
  [[26, 10], { start: 26, end: 35 }, [1, 2]]
];
for (const [[start, count], expectedRange, expectedPages] of ranges) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rules.getRankingRange(start, count))), expectedRange);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rules.getRankingPagesForRange(start, count))), expectedPages);
  assert.strictEqual(rules.getRankingPageForRange(start), start >= 31 ? 2 : 1);
}

for (const [rank, score] of [[1, 30], [2, 27], [3, 24], [4, 20], [10, 20], [11, 15], [20, 15], [21, 10], [31, 10], [50, 10]]) {
  assert.strictEqual(rules.calculateRankingScore({ rank }), score);
}
assert.strictEqual(rules.calculateRankingScore({ sourceRank: 2, rank: 31 }), 27);
assert.strictEqual(rules.calculateRankingScore({}), 0);
assert.strictEqual(rules.getRankingRequestInterval(3), 1200);
assert.strictEqual(rules.getRankingRequestInterval(4), 1800);

const sparse = [31, 32, 34, 35].map((rank) => rules.applyOfficialRankingRank({ rank }));
assert.deepStrictEqual(sparse.map((item) => item.rank), [31, 32, 34, 35]);
assert.deepStrictEqual(sparse.map((item) => item.sourceRank), [31, 32, 34, 35]);
assert.deepStrictEqual(sparse.map((item) => item.apiRank), [31, 32, 34, 35]);
const unknown = rules.applyOfficialRankingRank({ itemName: "不明" });
assert.strictEqual(unknown.rank, null);
assert.strictEqual(unknown.sourceRank, null);
assert.strictEqual(unknown.apiRank, null);

assert.strictEqual(rules.extractRakutenApiErrorDetail('{"error":"bad"}'), "bad");
assert.strictEqual(rules.extractRakutenApiErrorDetail('{"message":"message"}'), "message");
assert.strictEqual(rules.extractRakutenApiErrorDetail(""), "HTTPエラー");
assert.strictEqual(rules.extractRakutenApiErrorDetail(null), "HTTPエラー");
assert.strictEqual(rules.extractRakutenApiErrorDetail(undefined), "HTTPエラー");
assert.strictEqual(rules.extractRakutenApiErrorDetail("plain error"), "plain error");

console.log("ranking-rules tests passed");
