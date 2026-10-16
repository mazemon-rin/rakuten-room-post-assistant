const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src/core/room-codex-bridge.js"), "utf8");
const context = {
  Object, String, Set, Array, Number, Date, Math, structuredClone,
  ProductIdentity: { normalizeItemCode: (value) => String(value || "").trim().toLowerCase() }
};
context.globalThis = context;
vm.runInNewContext(source, context);
const bridge = context.RoomCodexBridge;
const prompt = "楽天ROOMの投稿候補から3件、正式Skillに従って連続実投稿してください。";

assert.deepStrictEqual(JSON.parse(JSON.stringify(bridge.parseRequestedCount(prompt))), { ok: true, requestedCount: 3 });
assert.strictEqual(bridge.parseRequestedCount("楽天ROOM投稿を二件お願いします。").requestedCount, 2);
assert.strictEqual(bridge.parseRequestedCount("ROOM投稿を３件してください。").requestedCount, 3);
assert.strictEqual(bridge.parseRequestedCount("1件目と2件目を処理して3件目は止める").ok, false);
assert.strictEqual(bridge.parseRequestedCount("楽天ROOM投稿を2件、今回は4件に変更").ok, false);
assert.strictEqual(bridge.hasExplicitPostingIntent(prompt), true);
assert.strictEqual(bridge.hasExplicitPostingIntent("楽天ROOMへの実投稿を1件だけ実行してください。"), true);
assert.strictEqual(bridge.hasExplicitPostingIntent("楽天ROOMに3件投稿してください。"), true);
assert.strictEqual(bridge.hasExplicitPostingIntent("楽天ROOM投稿候補から3件、今回は実投稿しないでください。"), false);
assert.strictEqual(bridge.hasExplicitPostingIntent("投稿準備だけを3件お願いします。"), false);

const targets = [
  { candidateId: "c-old", itemCode: "Shop:one" },
  { candidateId: "c-next", itemCode: "shop:two" }
];
const created = bridge.createQueue(targets, 2, "2026-10-16T00:00:00.000Z", "queue-1");
assert.strictEqual(created.ok, true);
assert.strictEqual(created.queue.entries.length, 2, "requested count is a hard cap");
assert.deepStrictEqual(JSON.parse(JSON.stringify(created.queue.entries.map(({ candidateId, itemCode }) => ({ candidateId, itemCode })))), targets);
assert.strictEqual(bridge.createQueue(targets, 1, "2026-10-16", "queue-overflow").ok, false);
assert.strictEqual(bridge.recordOutcome(created.queue, "wrong-id", "Shop:one", "posted", { roomCompletionConfirmed: true, historySaved: true }).ok, false);
assert.strictEqual(bridge.recordOutcome(created.queue, "c-old", "Shop:one", "posted", { roomCompletionConfirmed: true, historySaved: false }).ok, false);

const posted = bridge.recordOutcome(created.queue, "c-old", "Shop:one", "posted", {
  roomCompletionConfirmed: true, historySaved: true
});
assert.strictEqual(posted.queue.status, bridge.QUEUE_STATUS.ADVANCE_READY);
assert.strictEqual(posted.queue.entries[0].outcome, "posted");
const reloadedQueue = JSON.parse(JSON.stringify(posted.queue));
const advanced = bridge.advanceQueue(reloadedQueue);
assert.strictEqual(advanced.queue.status, bridge.QUEUE_STATUS.ACTIVE);
assert.strictEqual(advanced.queue.currentIndex, 1);
assert.strictEqual(advanced.entry.candidateId, "c-next");
assert.strictEqual(advanced.queue.entries.length, 2);
const finalPost = bridge.recordOutcome(advanced.queue, "c-next", "shop:two", "posted", {
  roomCompletionConfirmed: true, historySaved: true
});
assert.strictEqual(finalPost.queue.status, bridge.QUEUE_STATUS.COMPLETED);
assert.strictEqual(bridge.advanceQueue(finalPost.queue).ok, false);

const duplicateMissingClosure = bridge.recordOutcome(created.queue, "c-old", "Shop:one", "duplicate", {
  duplicateWarningConfirmed: true
});
assert.strictEqual(duplicateMissingClosure.ok, false);
const duplicate = bridge.recordOutcome(created.queue, "c-old", "Shop:one", "duplicate", {
  duplicateWarningConfirmed: true,
  operationClosedAt: "2026-10-16T01:00:00.000Z",
  closeReason: "ROOMの重複警告を確認して対象画面を閉じた"
});
assert.strictEqual(duplicate.queue.entries[0].outcome, "duplicate");
assert.strictEqual(duplicate.queue.status, bridge.QUEUE_STATUS.ADVANCE_READY);

const unknown = bridge.recordOutcome(created.queue, "c-old", "Shop:one", "unknown");
assert.strictEqual(unknown.queue.status, bridge.QUEUE_STATUS.RESULT_CHECK_REQUIRED);
assert.strictEqual(unknown.queue.entries[0].outcome, "result_check_required");
assert.strictEqual(unknown.queue.entries[0].outcome === "posted", false);
const unresolvedCandidates = [
  { id: "c-old", itemCode: "Shop:one", roomAttempt: { status: "result_check_required", itemCode: "Shop:one" } },
  { id: "c-next", itemCode: "shop:two" }
];
assert.strictEqual(bridge.canStartQueue(unresolvedCandidates, [{ candidateId: "c-next", itemCode: "shop:two" }], unknown.queue).ok, false);
const closedCandidates = [
  { id: "c-old", itemCode: "Shop:one", roomAttempt: {
    status: "result_check_required", itemCode: "Shop:one",
    roomOperationClosedAt: "2026-10-16T01:00:00.000Z", roomOperationCloseReason: "ROOM画面を閉じた"
  } },
  { id: "c-next", itemCode: "shop:two" }
];
assert.strictEqual(bridge.canStartQueue(closedCandidates, [{ candidateId: "c-next", itemCode: "shop:two" }], unknown.queue).ok, true);
assert.strictEqual(bridge.canStartQueue(closedCandidates, [{ candidateId: "same-code", itemCode: "shop:one" }], unknown.queue).ok, false);
assert.strictEqual(bridge.isSavedQueueConsistent(unknown.queue, closedCandidates), true);
assert.strictEqual(bridge.isSavedQueueConsistent(unknown.queue, [closedCandidates[0]]), false,
  "a queue with a missing fixed candidate is inconsistent");
assert.strictEqual(bridge.isSavedQueueConsistent(unknown.queue, [closedCandidates[0], { id: "c-next", itemCode: "shop:wrong" }]), false,
  "a queue whose fixed candidate itemCode changed is inconsistent");

const photo = bridge.recordOutcome(created.queue, "c-old", "Shop:one", "original_photo");
assert.strictEqual(photo.queue.status, bridge.QUEUE_STATUS.HUMAN_ACTION_REQUIRED);
assert.strictEqual(photo.queue.entries[0].outcome, "human_action_required");
assert.strictEqual(bridge.canStartQueue([], targets, photo.queue).ok, false);

const legacy = { settings: {}, candidates: [{ id: "legacy", itemCode: "shop:old" }], history: [] };
assert.strictEqual(Object.hasOwn(legacy, "roomPostQueue"), false, "old storage is not migrated until a queue is explicitly started");
console.log("ROOM Codex bridge parsing, queue cap, transitions, recovery, identity and legacy cases: passed");
