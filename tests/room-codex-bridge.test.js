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
assert.strictEqual(bridge.matchStaleQueueCurrent({ status: "active", currentIndex: 0, entries: [targets[0]] },
  { id: "c-old", itemCode: "shop:one" }).ok, true, "legacy queue may be checked by current candidate identity without trusting queue count");
assert.strictEqual(bridge.matchStaleQueueCurrent({ status: "active", currentIndex: 0, entries: [targets[0]] },
  { id: "c-old", itemCode: "shop:wrong" }).ok, false, "stale queue itemCode mismatch must block cleanup");
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

const successTargetQueue = bridge.createQueue([
  { candidateId: "s1", itemCode: "shop:s1" },
  { candidateId: "s2", itemCode: "shop:s2" },
  { candidateId: "s3", itemCode: "shop:s3" }
], 2, "2026-10-16T00:00:00.000Z", "success-target", { successTarget: true });
assert.strictEqual(successTargetQueue.ok, true);
assert.strictEqual(successTargetQueue.queue.entries.length, 3, "queue may contain more items than the success target");
assert.strictEqual(successTargetQueue.queue.policy, "successful_posts");
const firstSuccess = bridge.recordOutcome(successTargetQueue.queue, "s1", "shop:s1", "posted", {
  roomCompletionConfirmed: true, historySaved: true
});
assert.strictEqual(firstSuccess.queue.successCount, 1);
assert.strictEqual(firstSuccess.queue.entries[0].candidateId, "s2");
assert.strictEqual(firstSuccess.queue.status, bridge.QUEUE_STATUS.ACTIVE);
const noEvidenceFailure = bridge.recordConfirmedFailure(firstSuccess.queue, "s2", "shop:s2", "product_missing", {});
assert.strictEqual(noEvidenceFailure.ok, false);
const skippedFailure = bridge.recordConfirmedFailure(firstSuccess.queue, "s2", "shop:s2", "product_missing", {
  evidence: "商品URLが404であることを確認", confirmedAt: "2026-10-16T00:01:00.000Z", roomOperationMayBeActive: false,
  operationClosedAt: "2026-10-16T00:01:00.000Z", closeReason: "商品ページ操作が終了"
});
assert.strictEqual(skippedFailure.ok, true);
assert.strictEqual(skippedFailure.queue.successCount, 1, "confirmed failures do not count as successes");
assert.strictEqual(skippedFailure.queue.failureCount, 1);
assert.strictEqual(skippedFailure.queue.deletedCount, 1);
assert.strictEqual(skippedFailure.queue.entries[0].candidateId, "s3");
const secondSuccess = bridge.recordOutcome(skippedFailure.queue, "s3", "shop:s3", "posted", {
  roomCompletionConfirmed: true, historySaved: true
});
assert.strictEqual(secondSuccess.queue.successCount, 2);
assert.strictEqual(secondSuccess.queue.status, bridge.QUEUE_STATUS.COMPLETED);
assert.strictEqual(bridge.isSavedQueueConsistent(secondSuccess.queue, []), true, "completed queue may have no remaining entries");

const unknownSuccessTarget = bridge.recordOutcome(successTargetQueue.queue, "s1", "shop:s1", "unknown");
assert.strictEqual(unknownSuccessTarget.queue.successCount, 0, "unknown result is never counted as success");
const closedUnknownAttempt = {
  status: "result_check_required", candidateId: "s1", itemCode: "shop:s1",
  roomOperationClosedAt: "2026-10-16T00:02:00.000Z", roomOperationCloseReason: "ROOMタブ終了を確認"
};
const unknownMismatchQueue = bridge.releaseClosedUnknown(unknownSuccessTarget.queue, "s1", "shop:wrong", closedUnknownAttempt,
  { evidence: "ROOM画面が閉じていることを確認" });
assert.strictEqual(unknownMismatchQueue.ok, false, "attempt identity must match the fixed queue entry");
const releasedUnknownQueue = bridge.releaseClosedUnknown(unknownSuccessTarget.queue, "s1", "shop:s1", closedUnknownAttempt,
  { evidence: "ROOM画面が閉じていることを確認", operationClosedAt: closedUnknownAttempt.roomOperationClosedAt });
assert.strictEqual(releasedUnknownQueue.ok, true);
assert.strictEqual(releasedUnknownQueue.queue.status, bridge.QUEUE_STATUS.ACTIVE);
assert.strictEqual(releasedUnknownQueue.queue.entries[0].candidateId, "s2");
assert.strictEqual(releasedUnknownQueue.queue.successCount, 0);
assert.strictEqual(releasedUnknownQueue.queue.unknownCount, 1);
assert.strictEqual(bridge.releaseClosedUnknown(unknownSuccessTarget.queue, "s1", "shop:wrong", {
  status: "result_check_required", candidateId: "s1", itemCode: "shop:s1",
  roomOperationClosedAt: "2026-10-16T00:02:00.000Z", roomOperationCloseReason: "ROOMタブ終了を確認"
}, { evidence: "確認" }).ok, false, "itemCode mismatch prevents release");

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
const confirmedDuplicateInTargetQueue = bridge.recordOutcome(successTargetQueue.queue, "s1", "shop:s1", "duplicate", {
  duplicateWarningConfirmed: true,
  operationClosedAt: "2026-10-16T01:00:00.000Z",
  closeReason: "ROOMの重複警告を確認し画面を閉じた"
});
assert.strictEqual(confirmedDuplicateInTargetQueue.queue.status, bridge.QUEUE_STATUS.ACTIVE,
  "a directly observed and confirmed duplicate may advance the active success-target queue");
assert.strictEqual(confirmedDuplicateInTargetQueue.queue.successCount, 0);
assert.strictEqual(confirmedDuplicateInTargetQueue.queue.failureCount, 1);
assert.strictEqual(confirmedDuplicateInTargetQueue.queue.entries[0].candidateId, "s2");

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
assert.strictEqual(bridge.canStartQueue(closedCandidates, [{ candidateId: "c-next", itemCode: "shop:two" }], unknown.queue).ok, false,
  "the unknown fixed queue must be advanced through the closure transition before a different queue can start");
assert.strictEqual(bridge.canStartQueue(closedCandidates, [{ candidateId: "same-code", itemCode: "shop:one" }], unknown.queue).ok, false);
assert.strictEqual(bridge.isSavedQueueConsistent(unknown.queue, closedCandidates), true);
assert.strictEqual(bridge.isSavedQueueConsistent(unknown.queue, [closedCandidates[0]]), false,
  "a queue with a missing fixed candidate is inconsistent");
assert.strictEqual(bridge.isSavedQueueConsistent(unknown.queue, [closedCandidates[0], { id: "c-next", itemCode: "shop:wrong" }]), false,
  "a queue whose fixed candidate itemCode changed is inconsistent");

const fixedUnknownQueue = bridge.createQueue([
  { candidateId: "c-old", itemCode: "Shop:one" }, { candidateId: "c-next", itemCode: "shop:two" }
], 2, "2026-10-16T00:00:00.000Z", "fixed-unknown", { successTarget: true }).queue;
const fixedUnknownStopped = bridge.recordOutcome(fixedUnknownQueue, "c-old", "Shop:one", "unknown").queue;
const fixedUnknownAttempt = { ...closedCandidates[0].roomAttempt, candidateId: "c-old", itemCode: "Shop:one" };
const advancedUnknown = bridge.releaseClosedUnknown(fixedUnknownStopped, "c-old", "Shop:one", fixedUnknownAttempt,
  { evidence: "ROOM画面終了を確認", operationClosedAt: fixedUnknownAttempt.roomOperationClosedAt });
assert.strictEqual(advancedUnknown.ok, true);
assert.strictEqual(advancedUnknown.queue.status, bridge.QUEUE_STATUS.ACTIVE);
assert.strictEqual(advancedUnknown.queue.entries[0].candidateId, "c-next");
assert.strictEqual(advancedUnknown.queue.successCount, 0, "unknown result is not a success");
assert.strictEqual(advancedUnknown.queue.failureCount, 0, "unknown result is not a confirmed failure");
assert.strictEqual(advancedUnknown.queue.deletedCount, 0, "unknown candidate is retained, not deleted");
assert.strictEqual(advancedUnknown.queue.unknownCount, 1);
assert.strictEqual(bridge.canStartQueue(closedCandidates, [{ candidateId: "same-code", itemCode: "shop:one" }], null).ok, false,
  "same itemCode stays blocked after the old ROOM action is closed");
assert.strictEqual(bridge.canStartQueue(closedCandidates, [{ candidateId: "c-next", itemCode: "shop:two" }], null).ok, true,
  "a different product can start after operation closure is verified");

const resolvedUnknown = bridge.recordOutcome(unknown.queue, "c-old", "Shop:one", "not_posted", {
  humanConfirmed: true, operationClosedAt: closedUnknownAttempt.roomOperationClosedAt,
  closeReason: closedUnknownAttempt.roomOperationCloseReason
});
assert.strictEqual(resolvedUnknown.ok, true);
assert.strictEqual(resolvedUnknown.queue.status, bridge.QUEUE_STATUS.STOPPED,
  "human-confirmed resolution closes the old queue rather than resuming it");
assert.strictEqual(resolvedUnknown.queue.entries[0].outcome, "not_posted_confirmed");
const confirmedNotPostedCandidates = [
  { id: "c-old", itemCode: "Shop:one", roomAttempt: { status: "not_posted_confirmed", itemCode: "Shop:one" } },
  { id: "c-next", itemCode: "shop:two" }
];
const explicitNewQueue = [{ candidateId: "c-next", itemCode: "shop:two" }];
assert.strictEqual(bridge.canStartQueue(confirmedNotPostedCandidates, explicitNewQueue, resolvedUnknown.queue).ok, true,
  "a fresh explicit queue is allowed after human result resolution and stopped old queue");
assert.strictEqual(bridge.canStartQueue(confirmedNotPostedCandidates, [{ candidateId: "c-next", itemCode: "shop:wrong" }], resolvedUnknown.queue).ok, false,
  "a new queue with a mismatched itemCode is rejected");
const humanConfirmedDuplicate = bridge.recordOutcome(unknownSuccessTarget.queue, "s1", "shop:s1", "duplicate", {
  duplicateWarningConfirmed: true, operationClosedAt: closedUnknownAttempt.roomOperationClosedAt,
  closeReason: closedUnknownAttempt.roomOperationCloseReason, stopAfterHumanResolution: true
});
assert.strictEqual(humanConfirmedDuplicate.ok, true);
assert.strictEqual(humanConfirmedDuplicate.queue.status, bridge.QUEUE_STATUS.STOPPED,
  "human-confirmed duplicate resolution never auto-continues the old queue");
assert.strictEqual(humanConfirmedDuplicate.queue.successCount, 0,
  "a confirmed duplicate is never counted as a successful post");
const humanConfirmedPosted = bridge.recordOutcome(unknownSuccessTarget.queue, "s1", "shop:s1", "posted", {
  roomCompletionConfirmed: true, historySaved: true, stopAfterHumanResolution: true
});
assert.strictEqual(humanConfirmedPosted.queue.status, bridge.QUEUE_STATUS.STOPPED,
  "human resolution of a posted result also leaves the old queue stopped when its target is not met");
assert.strictEqual(humanConfirmedPosted.queue.successCount, 1);
assert.strictEqual(bridge.canStartQueue([
  { id: "s1", itemCode: "shop:s1", roomAttempt: { status: "posted_confirmed", itemCode: "shop:s1" } },
  { id: "s2", itemCode: "shop:s2" }, { id: "s3", itemCode: "shop:s3" }
], [{ candidateId: "s2", itemCode: "shop:s2" }], humanConfirmedPosted.queue).ok, true,
"fresh queue can start only after the previous unknown result is confirmed and old queue is terminal");
assert.strictEqual(bridge.canStartQueue(confirmedNotPostedCandidates, [{ candidateId: "missing", itemCode: "shop:two" }], resolvedUnknown.queue).ok, false,
  "missing candidate ID blocks a new queue");

const photo = bridge.recordOutcome(created.queue, "c-old", "Shop:one", "original_photo");
assert.strictEqual(photo.queue.status, bridge.QUEUE_STATUS.HUMAN_ACTION_REQUIRED);
assert.strictEqual(photo.queue.entries[0].outcome, "human_action_required");
assert.strictEqual(bridge.canStartQueue([], targets, photo.queue).ok, false);

const legacy = { settings: {}, candidates: [{ id: "legacy", itemCode: "shop:old" }], history: [] };
assert.strictEqual(Object.hasOwn(legacy, "roomPostQueue"), false, "old storage is not migrated until a queue is explicitly started");
console.log("ROOM Codex bridge parsing, queue cap, transitions, recovery, identity and legacy cases: passed");
