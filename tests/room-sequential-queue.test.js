const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src/core/room-sequential-queue.js"), "utf8");
const context = { Object, String, Set, Array };
context.globalThis = context;
vm.runInNewContext(source, context);
const queueApi = context.RoomSequentialQueue;
const candidate = (id, code, postStatus = "投稿待ち") => ({ id, itemCode: code, title: id, postStatus, destination: "room" });

// 1: transitions by candidate ID + itemCode, even when backing storage order differs.
const first = candidate("id-first", "shop:first", "投稿済み");
const second = candidate("id-second", "shop:second");
const third = candidate("id-third", "shop:third");
const snapshot = queueApi.buildRoomSequentialQueue([candidate("id-first", "shop:first"), second, third], 3);
assert.strictEqual(snapshot.ok, true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot.entries)), [
  { candidateId: "id-first", itemCode: "shop:first" },
  { candidateId: "id-second", itemCode: "shop:second" },
  { candidateId: "id-third", itemCode: "shop:third" }
]);
const firstToSecond = queueApi.advanceRoomSequentialQueue(snapshot.entries, 0, first.id, [third, second, first]);
assert.strictEqual(firstToSecond.candidate.id, second.id);

// 2: sorting is captured in the displayed order; later reorder does not change the target.
const sortedSnapshot = queueApi.buildRoomSequentialQueue([second, third], 2);
assert.strictEqual(sortedSnapshot.entries[0].candidateId, second.id);
assert.strictEqual(queueApi.resolveRoomQueueCandidate(sortedSnapshot.entries[1], [third, second]).candidate.id, third.id);

// 3: filters are represented by the displayed-candidate input; hidden candidates are not queued.
const filteredSnapshot = queueApi.buildRoomSequentialQueue([third], 1);
assert.deepStrictEqual(JSON.parse(JSON.stringify(filteredSnapshot.entries.map((entry) => entry.candidateId))), ["id-third"]);

// 4: ID or itemCode mismatch stops; it never selects a different product by position.
assert.strictEqual(queueApi.resolveRoomQueueCandidate(snapshot.entries[1], [candidate("id-second", "shop:wrong")]).ok, false);
assert.strictEqual(queueApi.advanceRoomSequentialQueue(snapshot.entries, 0, "id-second", [first, second, third]).ok, false);

// 6: a two-item sequence ends after item two and never wraps to item one or takes item three.
const twoItems = queueApi.buildRoomSequentialQueue([candidate("one", "shop:one"), candidate("two", "shop:two")], 2);
const afterOne = queueApi.advanceRoomSequentialQueue(twoItems.entries, 0, "one", [candidate("one", "shop:one", "投稿済み"), candidate("two", "shop:two")]);
assert.strictEqual(afterOne.done, false);
assert.strictEqual(afterOne.entry.candidateId, "two");
const afterTwo = queueApi.advanceRoomSequentialQueue(twoItems.entries, 1, "two", [candidate("one", "shop:one", "投稿済み"), candidate("two", "shop:two", "投稿済み")]);
assert.strictEqual(afterTwo.done, true);
assert.strictEqual(twoItems.entries.length, 2);

assert.strictEqual(queueApi.buildRoomSequentialQueue([candidate("a", "shop:duplicate"), candidate("b", "shop:duplicate")], 2).ok, false);

// 7: a requested limit is a hard boundary even when hundreds of candidates exist.
const manyCandidates = Array.from({ length: 371 }, (_, index) => candidate(`item-${index + 1}`, `shop:item-${index + 1}`));
const threeOnly = queueApi.buildRoomSequentialQueue(manyCandidates, 3);
assert.strictEqual(threeOnly.ok, true);
assert.strictEqual(threeOnly.entries.length, 3);
assert.deepStrictEqual(JSON.parse(JSON.stringify(threeOnly.entries.map((entry) => entry.candidateId))), ["item-1", "item-2", "item-3"]);
assert.strictEqual(queueApi.buildRoomSequentialQueue(manyCandidates, 372).ok, false);
assert.strictEqual(queueApi.buildRoomSequentialQueue(manyCandidates, 0).ok, false);
assert.strictEqual(queueApi.buildRoomSequentialQueue(manyCandidates, 1.5).ok, false);
const boundedProgress = queueApi.formatRoomSequentialProgress(manyCandidates[0], { entries: threeOnly.entries, currentIndex: 0 });
assert.match(boundedProgress, /（1 \/ 3件）/);
assert(!boundedProgress.includes("371"));
const unavailableProgress = queueApi.formatRoomSequentialProgress(manyCandidates[0], null);
assert(unavailableProgress.includes("開始時のキュー件数は復元できません"));

console.log("ROOM sequential queue cases 1-8: passed");
