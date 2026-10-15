const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src/core/room-processing-state.js"), "utf8");
const context = { Object, String, Set, Boolean, Array };
context.globalThis = context;
vm.runInNewContext(source, context);
const api = context.RoomProcessingState;
const candidate = (id, postStatus = "投稿待ち", itemCode = `shop:${id}`) => ({ id, title: `商品${id}`, itemCode, postStatus, status: "投稿待ち" });
const history = [{ id: "old-history", itemCode: "shop:hidden", title: "履歴側の商品" }];
const options = {
  isRoomCandidate: (item) => item.destination !== "threads_only",
  isVisibleRoomCandidate: (item) => item.itemCode !== "shop:hidden",
  postedHistoryMatch: (item, records) => records.some((record) => record.itemCode === item.itemCode)
};

// A: ordinary unposted candidate does not block and inputs stay unchanged.
const ordinary = candidate("ordinary");
assert.deepStrictEqual(api.inspectRoomProcessingState([ordinary], [], null, options).issues, []);

// B: a visible confirmation-waiting candidate is reported with identifiers.
const visiblePending = candidate("visible", "確認待ち");
const visibleResult = api.inspectRoomProcessingState([visiblePending], [], null, options);
assert.strictEqual(visibleResult.issues[0].visible, true);
assert.strictEqual(visibleResult.issues[0].itemCode, "shop:visible");
assert.strictEqual(visibleResult.issues[0].postStatus, "確認待ち");

// C: history-hidden confirmation candidate remains a blocker and explains why.
const hiddenPending = candidate("hidden", "確認待ち", "shop:hidden");
const hiddenResult = api.inspectRoomProcessingState([hiddenPending], history, null, options);
assert.strictEqual(hiddenResult.issues.length, 1);
assert.strictEqual(hiddenResult.issues[0].visible, false);
assert.match(hiddenResult.issues[0].hiddenReason, /投稿履歴との重複/);
assert.strictEqual(hiddenResult.issues[0].historyMatch.itemCode, "shop:hidden");

// D: pendingRoomPost with no candidate is surfaced as an orphan, not silently cleared.
const orphan = { candidateId: "deleted-id", itemCode: "shop:deleted", title: "削除済み候補" };
const orphanResult = api.inspectRoomProcessingState([], [], orphan, options);
assert.strictEqual(orphanResult.pendingIssue.relation, "一致する候補なし");
assert.deepStrictEqual(orphan, { candidateId: "deleted-id", itemCode: "shop:deleted", title: "削除済み候補" });

// E: history duplication is explicit while the candidate remains an issue.
const duplicate = candidate("duplicate", "要手動確認", "shop:hidden");
const duplicateResult = api.inspectRoomProcessingState([duplicate], history, null, options);
assert.strictEqual(duplicateResult.issues[0].historyMatch.title, "履歴側の商品");

// F: unknown result is an observation only; inspector never changes status or pending.
const unknown = candidate("unknown", "確認待ち");
const unknownPending = { candidateId: "unknown", itemCode: "shop:unknown", title: "商品unknown" };
const before = JSON.stringify({ unknown, unknownPending });
const unknownResult = api.inspectRoomProcessingState([unknown], [], unknownPending, options);
assert.strictEqual(unknownResult.issues[0].pendingRelation, "候補ID・itemCodeとも一致");
assert.strictEqual(JSON.stringify({ unknown, unknownPending }), before);
assert.strictEqual(api.isPendingLinkedToCandidate(unknown, unknownPending), true);
assert.strictEqual(api.isPendingAssociatedWithCandidate(unknown, { candidateId: "unknown", itemCode: "shop:wrong" }), true);

// Mismatched identifiers must remain unresolved.
assert.strictEqual(api.isPendingLinkedToCandidate(unknown, { candidateId: "other", itemCode: "shop:unknown" }), false);
assert.strictEqual(api.isPendingAssociatedWithCandidate(unknown, { candidateId: "other", itemCode: "shop:other" }), false);

// G: a selected continuous mode remains continuous for the next item; reload/default mode stays safe.
assert.strictEqual(api.normalizePostMode("continuous"), "continuous");
assert.strictEqual(api.normalizePostMode("confirmation"), "confirmation");
assert.strictEqual(api.normalizePostMode(undefined), "confirmation");
console.log("ROOM processing state cases A-G: passed");
