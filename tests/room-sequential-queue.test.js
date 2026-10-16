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

// 2: a queue snapshot stays fixed even when the backing candidate array is reordered.
const sortedSnapshot = queueApi.buildRoomSequentialQueue([second, third], 2);
assert.strictEqual(sortedSnapshot.entries[0].candidateId, second.id);
assert.strictEqual(queueApi.resolveRoomQueueCandidate(sortedSnapshot.entries[1], [third, second]).candidate.id, third.id);

// 3: the pure queue helper can still accept a limited input for isolated tests.
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
const successTarget = queueApi.buildRoomSequentialQueue([
  { ...candidate("dup-first", "shop:repeat", "投稿待ち"), savedAt: "2026-10-01" },
  { ...candidate("dup-later", "SHOP:REPEAT", "投稿待ち"), savedAt: "2026-10-02" },
  { ...candidate("after-duplicate", "shop:unique", "投稿待ち"), savedAt: "2026-10-03" }
], 2, [], { successTarget: true });
assert.strictEqual(successTarget.ok, true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(successTarget.entries.map((entry) => entry.candidateId))), ["dup-first", "after-duplicate"]);
assert.strictEqual(queueApi.buildRoomSequentialQueue([candidate("few", "shop:few")], 3, [], { successTarget: true }).ok, true,
  "a success target may start with fewer candidates and end when candidates are exhausted");
const identityEligible = queueApi.getEligibleRoomCandidates([
  { ...candidate("duplicate-id", "shop:a"), title: "Duplicate ID A" },
  { ...candidate("duplicate-id", "shop:b"), title: "Duplicate ID B" },
  { ...candidate("shared-with-posted", "shop:ready"), postStatus: "投稿済み", status: "投稿済み" },
  { ...candidate("shared-with-posted", "shop:ready-new"), postStatus: "投稿待ち" },
  { ...candidate("shared-with-threads", "shop:threads"), destination: "threads_only" },
  { ...candidate("shared-with-threads", "shop:room"), destination: "room" },
  { ...candidate("nested-code", "Shop:Nested"), product: { itemCode: "shop:nested" } },
  candidate("valid", "shop:valid")
], []);
assert.deepStrictEqual(JSON.parse(JSON.stringify(identityEligible.map((item) => item.id))), ["nested-code", "valid"],
  "queue eligibility excludes globally ambiguous IDs but normalizes equivalent nested itemCodes");

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
const persistedActiveProgress = queueApi.formatRoomSequentialProgress(manyCandidates[0], {
  status: "active", entries: threeOnly.entries, currentIndex: 0
});
assert(persistedActiveProgress.includes("保存上ACTIVE・実行状態未確認"), "persisted ACTIVE is not presented as proof of a live worker");
assert(queueApi.formatRoomSequentialProgress(null, { status: "active" }).includes("保存上ACTIVE・実行状態未確認"),
  "an orphaned ACTIVE queue must remain visible even when no candidate can be resolved");

// Phase 2: savedAt determines posting order, never the card order or a screen filter.
const dated = [
  { ...candidate("newer", "shop:newer"), savedAt: "2026-10-15T00:00:00.000Z" },
  { ...candidate("older", "shop:older"), savedAt: "2026-10-01T00:00:00.000Z" },
  { ...candidate("same-b", "shop:same-b"), savedAt: "2026-10-10T00:00:00.000Z" },
  { ...candidate("same-a", "shop:same-a"), savedAt: "2026-10-10T00:00:00.000Z" },
  candidate("legacy", "shop:legacy")
];
const datedQueue = queueApi.buildRoomSequentialQueue(dated, 5);
assert.deepStrictEqual(JSON.parse(JSON.stringify(datedQueue.entries.map((entry) => entry.candidateId))),
  ["older", "same-a", "same-b", "newer", "legacy"]);
assert.strictEqual(dated[0].id, "newer", "sorting must not mutate saved candidates");
assert.strictEqual(dated[4].savedAt, undefined, "missing legacy savedAt must not be invented");
assert.deepStrictEqual(JSON.parse(JSON.stringify(queueApi.buildRoomSequentialQueue([...dated].reverse(), 5).entries)),
  JSON.parse(JSON.stringify(datedQueue.entries)), "tie-breaking must not depend on the input order");

const blocked = [
  { ...candidate("waiting", "shop:waiting"), roomAttempt: { status: "result_check_required" } },
  { ...candidate("processing", "shop:processing"), roomAttempt: { status: "processing" } },
  { ...candidate("duplicate", "shop:duplicate"), roomAttempt: { status: "duplicate_confirmed" } },
  { ...candidate("posted", "shop:posted"), status: "投稿済み" },
  candidate("existing-history", "shop:history"),
  candidate("safe", "shop:safe")
];
const safeQueue = queueApi.buildRoomSequentialQueue(blocked, 1, [{ itemCode: " shop:history " }]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(safeQueue.entries)), [{ candidateId: "safe", itemCode: "shop:safe" }]);
assert.strictEqual(queueApi.buildRoomSequentialQueue([candidate("case-mismatch", "Shop:History")], 1,
  [{ itemCode: "shop:history" }]).ok, false, "history duplicate matching normalizes itemCode casing");
assert.strictEqual(queueApi.buildRoomSequentialQueue(blocked, 2, [{ itemCode: "shop:history" }]).ok, false);
assert.strictEqual(queueApi.resolveRoomQueueCandidate(safeQueue.entries[0],
  [{ ...candidate("safe", "shop:safe"), product: { itemCode: "shop:other" } }]).ok, false);
const copyStates = queueApi.buildRoomSequentialQueue([
  { ...candidate("no-copy", "shop:no-copy", "紹介文未作成"), savedAt: "2026-10-01" },
  { ...candidate("saved-copy", "shop:saved-copy", "紹介文作成済み"), savedAt: "2026-10-02" }
], 2);
assert.strictEqual(copyStates.ok, true, "copy preparation states remain eligible without bypassing ROOM safety checks");
const afterCopy = queueApi.advanceRoomSequentialQueue(copyStates.entries, 0, "no-copy", [
  candidate("no-copy", "shop:no-copy", "投稿済み"), candidate("saved-copy", "shop:saved-copy", "紹介文作成済み")
]);
assert.strictEqual(afterCopy.entry.candidateId, "saved-copy");

console.log("ROOM sequential queue cases 1-8: passed");
