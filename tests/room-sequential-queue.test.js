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
const snapshot = queueApi.buildRoomSequentialQueue([candidate("id-first", "shop:first"), second, third]);
assert.strictEqual(snapshot.ok, true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot.entries)), [
  { candidateId: "id-first", itemCode: "shop:first" },
  { candidateId: "id-second", itemCode: "shop:second" },
  { candidateId: "id-third", itemCode: "shop:third" }
]);
const firstToSecond = queueApi.advanceRoomSequentialQueue(snapshot.entries, 0, first.id, [third, second, first]);
assert.strictEqual(firstToSecond.candidate.id, second.id);

// 2: sorting is captured in the displayed order; later reorder does not change the target.
const sortedSnapshot = queueApi.buildRoomSequentialQueue([second, third]);
assert.strictEqual(sortedSnapshot.entries[0].candidateId, second.id);
assert.strictEqual(queueApi.resolveRoomQueueCandidate(sortedSnapshot.entries[1], [third, second]).candidate.id, third.id);

// 3: filters are represented by the displayed-candidate input; hidden candidates are not queued.
const filteredSnapshot = queueApi.buildRoomSequentialQueue([third]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(filteredSnapshot.entries.map((entry) => entry.candidateId))), ["id-third"]);

// 4: unresolved pending state blocks advancement.
const pendingBlocked = queueApi.advanceRoomSequentialQueue(snapshot.entries, 0, first.id, [first, second, third], { candidateId: first.id, itemCode: "shop:first" });
assert.strictEqual(pendingBlocked.ok, false);
assert.match(pendingBlocked.error, /pendingRoomPost/);

// 5: ID or itemCode mismatch stops; it never selects a different product by position.
assert.strictEqual(queueApi.resolveRoomQueueCandidate(snapshot.entries[1], [candidate("id-second", "shop:wrong")]).ok, false);
assert.strictEqual(queueApi.advanceRoomSequentialQueue(snapshot.entries, 0, "id-second", [first, second, third]).ok, false);

// 6: a two-item sequence ends after item two and never wraps to item one or takes item three.
const twoItems = queueApi.buildRoomSequentialQueue([candidate("one", "shop:one"), candidate("two", "shop:two")]);
const afterOne = queueApi.advanceRoomSequentialQueue(twoItems.entries, 0, "one", [candidate("one", "shop:one", "投稿済み"), candidate("two", "shop:two")]);
assert.strictEqual(afterOne.done, false);
assert.strictEqual(afterOne.entry.candidateId, "two");
const afterTwo = queueApi.advanceRoomSequentialQueue(twoItems.entries, 1, "two", [candidate("one", "shop:one", "投稿済み"), candidate("two", "shop:two", "投稿済み")]);
assert.strictEqual(afterTwo.done, true);
assert.strictEqual(twoItems.entries.length, 2);

// Pending linkage must correspond to the same candidate and exact itemCode.
assert.strictEqual(queueApi.advanceRoomSequentialQueue(twoItems.entries, 0, "one", [candidate("one", "shop:one", "投稿済み"), candidate("two", "shop:two")], { candidateId: "one", itemCode: "shop:wrong" }).ok, false);
assert.strictEqual(queueApi.buildRoomSequentialQueue([candidate("a", "shop:duplicate"), candidate("b", "shop:duplicate")]).ok, false);

console.log("ROOM sequential queue cases 1-6: passed");
