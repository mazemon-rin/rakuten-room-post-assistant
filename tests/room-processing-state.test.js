const assert = require("assert");
const fs = require("fs");

const script = fs.readFileSync("script.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const queue = fs.readFileSync("src/core/room-sequential-queue.js", "utf8");

assert(!/data\.pendingRoomPost|completePendingRoomPost|resolveBlockedRoomCandidate|resolveOrphanPendingAsUnposted|RoomProcessingState/.test(script));
assert(!/room-processing-diagnostics|room-processing-state\.js/.test(html));
assert(!/pendingRoomPost/.test(queue));
assert(!/function resolveBlockedRoomCandidate|function resolveOrphanPendingAsUnposted/.test(script));
const defaults = script.slice(script.indexOf("const defaultData = {"), script.indexOf("// 投稿済み候補"));
assert(!defaults.includes("pendingRoomPost"), "new data defaults should not create pending state");
assert.match(script, /function normalizeStoredData\(saved\) \{[\s\S]*?\.\.\.defaultData,\s+\.\.\.\(saved \|\| \{\}\)/, "legacy fields are preserved by spreading saved data during normalization");
assert(script.includes('let activeRoomPostMode = "continuous"'));
assert(script.includes("投稿指示を準備"));
assert(script.includes("確認モードで準備"));

console.log("ROOM processing-state removal cases: passed");
