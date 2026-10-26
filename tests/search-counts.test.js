const assert = require("assert");
const fs = require("fs");

const script = fs.readFileSync("script.js", "utf8");
assert.strictEqual((script.match(/RoomProductNormalization\.classifySearchResults\(/g) || []).length, 2, "ordinary and ranking searches use shared accounting");
assert.match(script, /キーワード除外：\$\{counts\.keyword\}件/);
assert.match(script, /順位範囲外除外：\$\{rankingCounts\.rankRange\}件/);
assert.match(script, /最終表示：\$\{searchResults\.length\}件/);
console.log("search count integration checks passed");
