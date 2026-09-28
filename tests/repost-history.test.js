const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.match(source, /function restoreHistoryToRoomCandidate\(id\)/);
assert.match(source, /repostRequested = true/);
assert.match(source, /投稿候補へ戻す/);
assert.match(source, /function findAnyHistoryRecord\(item\)/);
assert.match(source, /recordRoomPosting\(item, \{ roomUrl/);
assert.match(source, /existingHistory\.repostRequested = false/);
assert.match(source, /data\.candidates\.unshift\(candidate\)/);

console.log("history repost candidate regression cases: passed");
