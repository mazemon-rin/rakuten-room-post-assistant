const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const context = {
  console, URL, URLSearchParams, Intl, Date, Math, Number, String, Boolean, Object, Array,
  Set, Map, RegExp, JSON, Promise, TextEncoder, Blob, setTimeout, clearTimeout, structuredClone,
  crypto: { randomUUID: () => "test-attempt" },
  document: { addEventListener() {}, querySelector(selector) { return context.uiNodes?.[selector] || context.commandInputs?.[selector] || null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { innerHTML: "", textContent: "" }; } },
  localStorage: { value: null, fail: false, getItem() { return this.value; },
    setItem(key, value) { if (this.fail) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" }); this.value = value; } },
  fetch: async () => { throw new Error("network not permitted in test"); }, window: null
};
context.FileReader = class { readAsText(file) { this.result = file.text; this.onload(); } };
context.window = context;
vm.createContext(context);
for (const file of ["src/core/product-identity.js", "src/core/room-sequential-queue.js", "src/core/room-codex-bridge.js", "src/core/room-attempt.js",
  "src/core/discount-rules.js", "src/core/utils.js", "src/core/affiliate-sales.js",
  "src/core/product-normalization.js", "src/core/ranking-rules.js", "src/core/trend-rules.js",
  "src/core/product-identity.js", "src/core/duplicate-detection.js", "src/core/candidate-list-view.js", "script.js"]) {
  vm.runInContext(read(file), context);
}
// The test drives the real state functions, but never a browser or external API.
context.toastMessages = [];
vm.runInContext("renderAll = () => {}; renderCandidates = () => {}; renderStorageStatus = () => {}; toast = (message) => { globalThis.toastMessages.push(message); }; showTab = () => {}; fillSettings = () => {}; copyText = async () => true; downloadFile = (name, body) => { globalThis.testExportBody = body; };", context);
const run = (code) => vm.runInContext(code, context);
const candidate = { id: "candidate-1", destination: "room", title: "確認済みポロシャツ",
  itemCode: "shop:item-1", itemUrl: "https://item.rakuten.co.jp/shop/item-1/",
  product: { itemCode: "shop:item-1", itemName: "確認済みポロシャツ",
    itemUrl: "https://item.rakuten.co.jp/shop/item-1/", itemCaption: "綿100%" },
  introText: "綿100%のポロシャツです。", hashTags: "#ポロシャツ", status: "文章作成済み", postStatus: "投稿待ち" };
context.localStorage.value = JSON.stringify({ settings: {}, candidates: [candidate], history: [] });
run("data = loadData();");

(async () => {
  // Regression: a completed legacy fixed-items queue retains its final entry.
  // The real saved state also has an unrelated unresolved item and one eligible
  // candidate without copy. None may make the posted Pampers look in progress.
  const completedPampers = { ...candidate, id: "pampers", title: "パンパース 肌へのいちばん",
    itemCode: "netbaby:10051424", product: { ...candidate.product, itemCode: "netbaby:10051424" },
    postStatus: "投稿済み", status: "投稿済み", postedAt: "2026-10-16T00:00:00.000Z",
    roomAttempt: { status: "posted_confirmed", candidateId: "pampers", itemCode: "netbaby:10051424" } };
  const unresolvedDevirock = { ...candidate, id: "devirock", title: "アソートパンツ",
    itemCode: "devirockstore:10031954", product: { ...candidate.product, itemCode: "devirockstore:10031954" },
    postStatus: "結果確認待ち", roomAttempt: { status: "result_check_required", candidateId: "devirock", itemCode: "devirockstore:10031954" } };
  const unpreparedOmutsu = { ...candidate, id: "omutsu", title: "おむつストッカー",
    itemCode: "auc-risecreation:10005250", product: { ...candidate.product, itemCode: "auc-risecreation:10005250" },
    introText: "", hashTags: "#ベビー用品", status: "未作成", postStatus: "紹介文未作成" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [completedPampers, unresolvedDevirock, unpreparedOmutsu],
    history: [{ itemCode: "netbaby:10051424", postedAt: "2026-10-16T00:00:00.000Z" }],
    roomPostQueue: { version: 1, policy: "fixed_items", queueId: "completed-pampers-queue", requestedCount: 1,
      currentIndex: 0, status: "completed", entries: [{ candidateId: "pampers", itemCode: "netbaby:10051424", outcome: "posted" }] } });
  run("data = loadData(); activeRoomPostQueue = null;");
  context.uiNodes = { "#queue-progress": { textContent: "" }, "#queue-stats": { textContent: "" },
    "#stale-queue-recovery": { hidden: false } };
  run("renderQueueProgress()");
  assert.match(context.uiNodes["#queue-stats"].textContent, /現在投稿可能 1件/);
  assert.match(context.uiNodes["#queue-stats"].textContent, /キュー完了/);
  assert.match(context.uiNodes["#queue-stats"].textContent, /処理中なし/);
  assert.doesNotMatch(context.uiNodes["#queue-stats"].textContent, /パンパース/,
    "a completed persisted entry must never be rendered as the current processing product");
  assert.match(context.uiNodes["#queue-progress"].textContent, /キュー完了（処理中なし）/,
    "progress and summary must agree that the completed queue has no processing candidate");
  assert.ok(context.uiNodes["#queue-progress"].textContent.startsWith(context.uiNodes["#queue-stats"].textContent),
    "progress must repeat the exact queue status and postable count shown in the summary");
  assert.match(context.uiNodes["#queue-progress"].textContent, /結果確認待ち（処理中とは別・再投稿対象外）：アソートパンツ（devirockstore:10031954）/,
    "the result-check-required candidate must be shown separately from live processing");
  assert.doesNotMatch(context.uiNodes["#queue-progress"].textContent, /現在の処理商品：アソートパンツ/);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run("RoomSequentialQueue.getEligibleRoomCandidates(data.candidates, data.history).map((item) => item.id)"))), ["omutsu"],
    "the unprepared next candidate remains eligible while posted and unknown products are excluded");

  // A live ACTIVE queue may name a processing product only when both saved
  // and runtime queue entries match one unique candidate ID and itemCode.
  const activeProgress = run(`RoomSequentialQueue.formatRoomQueueProgress(
    { policy: "fixed_items", status: "active", currentIndex: 0, entries: [{ candidateId: "omutsu", itemCode: "auc-risecreation:10005250" }] },
    RoomSequentialQueue.getEligibleRoomCandidates(data.candidates.map((item) => item.id === "omutsu" ? { ...item, roomAttempt: { status: "processing", candidateId: "omutsu", itemCode: "auc-risecreation:10005250" } } : item), data.history),
    { currentIndex: 0, entries: [{ candidateId: "omutsu", itemCode: "auc-risecreation:10005250" }] }, data.candidates.map((item) => item.id === "omutsu" ? { ...item, roomAttempt: { status: "processing", candidateId: "omutsu", itemCode: "auc-risecreation:10005250" } } : item))`);
  assert.match(activeProgress, /処理中 おむつストッカー/);
  assert.match(activeProgress, /結果確認待ち（処理中とは別・再投稿対象外）：アソートパンツ/);
  const mismatchedProgress = run(`RoomSequentialQueue.formatRoomQueueProgress(
    { policy: "fixed_items", status: "active", currentIndex: 0, entries: [{ candidateId: "omutsu", itemCode: "auc-risecreation:10005250" }] },
    RoomSequentialQueue.getEligibleRoomCandidates(data.candidates.map((item) => item.id === "omutsu" ? { ...item, roomAttempt: { status: "processing", candidateId: "omutsu", itemCode: "auc-risecreation:10005250" } } : item), data.history),
    { currentIndex: 0, entries: [{ candidateId: "omutsu", itemCode: "wrong:item" }] }, data.candidates.map((item) => item.id === "omutsu" ? { ...item, roomAttempt: { status: "processing", candidateId: "omutsu", itemCode: "auc-risecreation:10005250" } } : item))`);
  assert.match(mismatchedProgress, /保存上ACTIVE・実行状態未確認/);
  assert.doesNotMatch(mismatchedProgress, /処理中 おむつストッカー/);

  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [candidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");

  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), true);
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined, "creating/copying instructions alone must not create a ROOM attempt");
  assert.strictEqual(run("data.candidates[0].postStatus"), "投稿準備済み");
  assert.strictEqual(run("Boolean(data.candidates[0].roomPreparedAt)"), true);
  assert.strictEqual(run("RoomSequentialQueue.getEligibleRoomCandidates(data.candidates, data.history).length"), 0,
    "prepared work is no longer eligible for another queue");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run("getDisplayedRoomCandidates().map((item) => item.id)"))), ["candidate-1"],
    "prepared work remains visible in the default unposted view so its start/cancel controls are reachable");
  assert.strictEqual(run("beginPreparedRoomOperation('candidate-1', 'wrong:item-code')"), false,
    "a mismatched itemCode must not create a ROOM attempt");
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined);
  assert.strictEqual(run("beginPreparedRoomOperation('missing-candidate', 'shop:item-1')"), false,
    "an unknown candidate ID must not create a ROOM attempt");
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined);
  assert.strictEqual(run("beginPreparedRoomOperation('candidate-1', 'shop:item-1')"), true,
    "the explicit pre-ROOM UI action is the only transition into a processing attempt");
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "processing");
  assert.strictEqual(run("data.candidates[0].roomAttempt.itemCode"), "shop:item-1");
  assert.strictEqual(run("data.candidates[0].roomAttempt.candidateId"), "candidate-1");
  assert.strictEqual(run("data.candidates[0].roomAttempt.confirmationSource"), null);
  assert.strictEqual(run("data.candidates[0].roomAttempt.startedAt.length > 0"), true);
  assert.strictEqual(run("markRoomResultUnknown('candidate-1')"), true);
  assert.strictEqual(run("data.candidates[0].postStatus"), "結果確認待ち");
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), false);
  assert.strictEqual(run("markPosted('candidate-1', '')"), false);
  assert.strictEqual(run("data.history.length"), 0);
  assert.strictEqual(run("confirmRoomAttemptResult('candidate-1', RoomAttempt.STATUS.NOT_POSTED_CONFIRMED, RoomAttempt.SOURCE.HISTORY)"), false);
  context.commandInputs = { "#room-operation-close-reason-candidate-1": { value: "テストでROOM操作終了を確認" } };
  assert.strictEqual(run("confirmRoomOperationClosed('candidate-1')"), true);
  assert.strictEqual(run("confirmRoomAttemptResult('candidate-1', RoomAttempt.STATUS.NOT_POSTED_CONFIRMED, RoomAttempt.SOURCE.NOT_POSTED)"), true);
  assert.strictEqual(run("data.candidates[0].postStatus"), "投稿待ち");
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), true);
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "not_posted_confirmed", "preparation preserves the prior verified result until the new operation starts");
  assert.strictEqual(run("beginPreparedRoomOperation('candidate-1', 'shop:item-1')"), true);
  assert.strictEqual(run("markPosted('candidate-1', RoomAttempt.SOURCE.COMPLETION)"), true);
  assert.strictEqual(run("data.history.length"), 1);
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "posted_confirmed");
  assert.strictEqual(run("markPosted('candidate-1', RoomAttempt.SOURCE.COMPLETION)"), false);
  assert.strictEqual(run("data.history.length"), 1);
  assert.strictEqual(JSON.parse(context.localStorage.value).history.length, 1);
  assert.strictEqual(run("normalizeStoredData(JSON.parse(localStorage.value)).candidates[0].roomAttempt.status"), "posted_confirmed");
  assert.strictEqual(run("normalizeStoredData({ settings: {}, candidates: [{ id: 'old', itemCode: 'shop:old' }], history: [] }).candidates[0].roomAttempt"), undefined);

  // JSON backup/import keep the attempt fields without changing the storage key.
  const backup = JSON.parse(context.localStorage.value);
  assert.strictEqual(backup.candidates[0].roomAttempt.status, "posted_confirmed");
  assert.strictEqual(backup.candidates[0].roomAttempt.confirmationSource, "room_completion_screen");
  run("exportJson();");
  assert.strictEqual(JSON.parse(context.testExportBody).candidates[0].roomAttempt.status, "posted_confirmed");
  run("importJson({ target: { files: [{ text: testExportBody }] } });");
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "posted_confirmed");
  assert.strictEqual(run("data.history.length"), 1);

  // Cancelling before the explicit ROOM-start action stops only the prepared work.
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [{ ...candidate }], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), true);
  assert.strictEqual(run("cancelPreparedRoomQueue('candidate-1', 'shop:item-1')"), true);
  assert.strictEqual(run("data.candidates.length"), 1, "pre-start cancellation preserves the candidate");
  assert.strictEqual(run("data.candidates[0].introText"), "綿100%のポロシャツです。", "pre-start cancellation preserves saved copy");
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined, "pre-start cancellation never creates an attempt");
  assert.strictEqual(run("data.candidates[0].roomPreparedAt"), undefined);
  assert.strictEqual(run("data.history.length"), 0, "pre-start cancellation does not create history");
  assert.strictEqual(run("data.candidates[0].postStatus"), "紹介文作成済み");
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [{ ...candidate }], history: [] });
  run("data = loadData();");
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), true);
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined, "preparation must remain non-processing across persistence");
  run("data = loadData(); recoverInterruptedRoomAttempts();");
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined, "reload must not convert an unstarted preparation into an unknown attempt");
  assert.strictEqual(run("Boolean(data.candidates[0].roomPreparedAt)"), true);
  assert.strictEqual(run("beginPreparedRoomOperation('candidate-1', 'shop:item-1')"), true);
  run("data = loadData(); recoverInterruptedRoomAttempts();");
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "result_check_required");
  assert.strictEqual(run("data.candidates[0].postStatus"), "結果確認待ち");
  assert.strictEqual(run("data.history.length"), 0);
  context.commandInputs = { "#room-operation-close-reason-candidate-1": { value: "テストでROOM操作終了を確認" } };
  run("activeRoomPostQueue = { entries: [], currentIndex: 0, mode: 'continuous' };");
  assert.strictEqual(run("confirmRoomOperationClosed('candidate-1')"), false);
  assert.strictEqual(run("data.candidates[0].roomAttempt.roomOperationClosedAt"), undefined);
  run("activeRoomPostQueue = null;");
  assert.strictEqual(run("confirmRoomOperationClosed('candidate-1')"), true);
  assert.strictEqual(run("confirmRoomAttemptResult('candidate-1', RoomAttempt.STATUS.DUPLICATE_CONFIRMED, RoomAttempt.SOURCE.DUPLICATE)"), true);
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "duplicate_confirmed");
  assert.strictEqual(run("data.history.length"), 0);
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), false);

  // A failed save must not leave an in-memory posting attempt or history success.
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [{ ...candidate }], history: [] });
  run("data = loadData();");
  context.localStorage.fail = true;
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), false);
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined);
  assert.strictEqual(run("data.history.length"), 0);
  assert.strictEqual(JSON.parse(context.localStorage.value).history.length, 0);
  context.localStorage.fail = false;
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), true);
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined);
  assert.strictEqual(run("beginPreparedRoomOperation('candidate-1', 'shop:item-1')"), true);
  context.localStorage.fail = true;
  assert.strictEqual(run("markPosted('candidate-1', RoomAttempt.SOURCE.COMPLETION)"), false);
  assert.strictEqual(JSON.parse(context.localStorage.value).history.length, 0);
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "processing");
  context.localStorage.fail = false;

  // Continuous posting selects one saved candidate at a time. The next item is
  // recalculated only after ROOM success and its history write are verified.
  const secondCandidate = { ...candidate, id: "candidate-2", itemCode: "shop:item-2", title: "保存済み特徴のTシャツ",
    itemUrl: "https://item.rakuten.co.jp/shop/item-2/", product: { itemCode: "shop:item-2", itemName: "保存済み特徴のTシャツ",
      itemUrl: "https://item.rakuten.co.jp/shop/item-2/", itemCaption: "ポリエステル素材。吸汗速乾性。" },
    introText: "", hashTags: "", status: "未作成", postStatus: "紹介文未作成", savedAt: "2026-10-02T00:00:00.000Z" };
  const firstCandidate = { ...candidate, id: "candidate-1", savedAt: "2026-10-01T00:00:00.000Z" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [secondCandidate, firstCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  assert.strictEqual(await run("startSequentialProcessing('continuous', 2, { source: 'codex-prompt' })"), true);
  assert.strictEqual(run("data.roomPostQueue.requestedCount"), 1,
    "the persisted audit queue contains only the current item; the success target stays in runtime state");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1, "only the current candidate is persisted, not a fixed batch");
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "candidate-1");
  assert.strictEqual(run("data.roomPostQueue.currentIndex"), 0);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-1').roomAttempt"), undefined,
    "a saved queue and generated instructions must not imply that ROOM interaction started");
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-1').postStatus"), "投稿準備済み");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run("getDisplayedRoomCandidates().map((item) => item.id)"))), ["candidate-2", "candidate-1"],
    "a continuous queue's prepared current item remains visible alongside other postable candidates");
  assert.strictEqual(run("beginPreparedRoomOperation('candidate-1', 'shop:item-1')"), true);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-1').roomAttempt.status"), "processing");
  assert.strictEqual(run("JSON.parse(localStorage.value).roomPostQueue.entries.length"), 1);
  assert.strictEqual(run("markPosted('candidate-1', RoomAttempt.SOURCE.COMPLETION)"), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(run("data.history.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "candidate-2",
    "the saved single-item queue is replaced with the next candidate only after success is persisted");
  assert.strictEqual(run("activeRoomPostQueue.successCount"), 1);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').roomAttempt"), undefined,
    "the next queue entry is only prepared until its own ROOM operation starts");
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').postStatus"), "投稿準備済み");
  assert.strictEqual(run("beginPreparedRoomOperation('candidate-2', 'shop:item-2')"), true);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').roomAttempt.status"), "processing");
  assert.strictEqual(run("Boolean(data.candidates.find((item) => item.id === 'candidate-2').introText)"), true,
    "the next candidate's missing copy is generated and saved as its turn begins");
  assert.strictEqual(JSON.parse(context.localStorage.value).history.length, 1,
    "the first history write is visible in storage before the next attempt starts");

  // Reload recovery: an in-flight one-item queue is never restarted and becomes
  // result-check-required until a human verifies the outcome.
  const reloaded = JSON.parse(context.localStorage.value);
  reloaded.roomPostQueue.status = "active";
  reloaded.roomPostQueue.currentIndex = 0;
  context.localStorage.value = JSON.stringify(reloaded);
  run("data = loadData(); activeRoomPostQueue = null; recoverInterruptedRoomAttempts();");
  context.commandInputs = { "#codex-room-command": { value: "楽天ROOMの投稿候補から2件、連続実投稿してください。" },
    "#codex-room-command-message": { textContent: "" } };
  const resumed = await run("handleCodexRoomCommandSubmit({ preventDefault() {} })");
  assert.strictEqual(resumed, false, "a saved ACTIVE flag is not enough to restart ROOM interaction after reload");
  assert.strictEqual(run("data.roomPostQueue.status"), "result_check_required");
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "candidate-2");
  context.commandInputs["#room-operation-close-reason-candidate-2"] = { value: "ROOM投稿操作を終了し、該当タブが閉じていることを確認" };
  assert.strictEqual(run("confirmRoomOperationClosed('candidate-2')"), true);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').postStatus"), "結果確認待ち",
    "closing the browser operation alone must not decide whether the item was posted");
  assert.strictEqual(run("getProcessingBlocker()"), null,
    "a closed unknown result does not block a different item after it is removed from the fixed queue");
  run("data.candidates.push({ ...data.candidates[0], id: 'candidate-3', itemCode: 'shop:item-3', product: { ...data.candidates[0].product, itemCode: 'shop:item-3' }, roomAttempt: undefined, postStatus: '投稿待ち', status: '投稿待ち' })");
  assert.strictEqual(run("RoomCodexBridge.canStartQueue(data.candidates, [{ candidateId: 'candidate-3', itemCode: 'shop:item-3' }], data.roomPostQueue).ok"), true,
    `after queue closure, a different product may start while the unknown result remains protected: ${run("RoomCodexBridge.canStartQueue(data.candidates, [{ candidateId: 'candidate-3', itemCode: 'shop:item-3' }], data.roomPostQueue).error")}`);
  assert.strictEqual(run("typeof removeClosedUnknownFromSuccessQueue"), "undefined",
    "the legacy unknown-removal action is removed rather than left as an alternate continuation path");
  assert.strictEqual(run("data.candidates.some((item) => item.id === 'candidate-2')"), true);
  assert.strictEqual(run("data.roomPostQueue.successCount"), 0, "the current item's audit queue never inherits prior run successes");
  assert.strictEqual(run("data.roomPostQueue.failureCount"), 0);
  assert.strictEqual(run("data.roomPostQueue.status"), "stopped");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 0,
    "the completed audit queue releases its active candidate while the candidate attempt remains protected");
  assert.strictEqual(run("data.roomPostQueue.unknownCount"), 1);
  assert.strictEqual(run("confirmRoomAttemptResult('candidate-2', RoomAttempt.STATUS.NOT_POSTED_CONFIRMED, RoomAttempt.SOURCE.NOT_POSTED)"), true,
    "a human-confirmed ROOM result can resolve the attempt using the normal state UI");
  assert.strictEqual(run("data.roomPostQueue.status"), "stopped", "human resolution does not revive the old queue");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 0);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').postStatus"), "投稿待ち");
  assert.strictEqual(run("getProcessingBlocker()"), null, "confirmed result clears only the result blocker");
  context.commandInputs = { "#codex-room-command": { value: "楽天ROOMの投稿候補から1件、連続実投稿してください。" },
    "#codex-room-command-message": { textContent: "" } };
  const stoppedQueueId = run("data.roomPostQueue.queueId");
  context.mockRoomStarts = [];
  context.crypto.randomUUID = () => "fresh-queue-after-human-resolution";
  run("startCodexPost = async (id, mode, code) => { mockRoomStarts.push({ id, mode, code }); return true; };");
  assert.strictEqual(await run("handleCodexRoomCommandSubmit({ preventDefault() {} })"), true,
    "an explicit new prompt can create a fresh queue after human resolution");
  assert.notStrictEqual(run("data.roomPostQueue.queueId"), stoppedQueueId,
    "a new explicit command creates a new queue ID rather than resuming the stopped queue");
  assert.strictEqual(run("data.roomPostQueue.status"), "active");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1,
    "a new explicit command saves only its current item, not a candidate batch");
  assert.strictEqual(context.mockRoomStarts[0].id, "candidate-2");

  // A human-confirmed duplicate is deleted from the success-target queue before the next fixed candidate starts.
  const duplicateRecoveryCandidates = ["unknown-duplicate", "after-unknown"].map((id, index) => {
    const itemCode = `shop:${id}`;
    return { ...candidate, id, itemCode, title: id, postStatus: index ? "投稿待ち" : "結果確認待ち",
      status: index ? "投稿待ち" : "保留", product: { ...candidate.product, itemCode, itemName: id },
      savedAt: `2026-10-0${index + 1}T00:00:00.000Z`,
      roomAttempt: index ? undefined : { attemptId: "unknown-duplicate-attempt", candidateId: id, itemCode,
        startedAt: "2026-10-16T00:00:00.000Z", status: "result_check_required", confirmedAt: null,
        confirmationSource: null, roomOperationClosedAt: "2026-10-16T00:01:00.000Z",
        roomOperationCloseReason: "テストでROOM操作終了を確認" }
    };
  });
  const duplicateQueue = run("RoomCodexBridge.createQueue([{ candidateId: 'unknown-duplicate', itemCode: 'shop:unknown-duplicate' }, { candidateId: 'after-unknown', itemCode: 'shop:after-unknown' }], 1, '2026-10-16T00:00:00.000Z', 'unknown-duplicate-queue', { successTarget: true }).queue");
  context.duplicateQueue = duplicateQueue;
  const unknownDuplicateQueue = run("RoomCodexBridge.recordOutcome(duplicateQueue, 'unknown-duplicate', 'shop:unknown-duplicate', 'unknown').queue");
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: duplicateRecoveryCandidates, history: [], roomPostQueue: unknownDuplicateQueue });
  run("data = loadData(); activeRoomPostQueue = null;");
  context.mockRoomStarts = [];
  run("startSuccessTargetNextEntry = (entry) => { mockRoomStarts.push(entry.candidateId); return true; };");
  assert.strictEqual(run("confirmRoomAttemptResult('unknown-duplicate', RoomAttempt.STATUS.DUPLICATE_CONFIRMED, RoomAttempt.SOURCE.DUPLICATE)"), true);
  assert.strictEqual(run("data.roomPostQueue.status"), "stopped");
  assert.strictEqual(run("data.roomPostQueue.failureCount"), 1);
  assert.strictEqual(run("data.roomPostQueue.deletedCount"), 0);
  assert.strictEqual(run("data.roomPostQueue.successCount"), 0);
  assert.strictEqual(run("data.candidates.some((item) => item.id === 'unknown-duplicate')"), true,
    "a ROOM-confirmed duplicate is retained as a candidate record and excluded by its status");
  assert.deepStrictEqual(context.mockRoomStarts, [], "resolving a legacy unknown result never resumes its frozen queue");
  assert.strictEqual(run("data.history.length"), 0, "a duplicate is not recorded as a new success");

  // Candidate deletion requires a rendered confirmation and a second explicit action.
  const deletableCandidate = { id: "delete-target", destination: "room", title: "隔離テスト削除候補",
    itemCode: "test-shop:delete-target", postStatus: "投稿待ち", status: "文章作成済み" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [deletableCandidate], history: [] });
  run("data = loadData(); candidateDeleteConfirmationId = null;");
  run("deleteCandidate('delete-target')");
  assert.strictEqual(run("data.candidates.length"), 1, "the first action only opens the confirmation UI");
  assert.strictEqual(JSON.parse(context.localStorage.value).candidates.length, 1, "no storage mutation before explicit confirmation");
  assert.strictEqual(context.document.getElementById("candidate-delete-confirm-delete-target"), null,
    "when the confirmation control cannot be rendered, there is no approval action and deletion stays pending");
  assert.match(run("renderCandidateDeleteControl(data.candidates[0])"), /role="alertdialog"[\s\S]*キャンセル[\s\S]*この候補を削除/);
  run("cancelCandidateDeletion()");
  assert.strictEqual(run("data.candidates.length"), 1, "cancel leaves the candidate untouched");
  run("deleteCandidate('delete-target')");
  run("confirmCandidateDeletion('different-id')");
  assert.strictEqual(run("data.candidates.length"), 1, "confirmation for another candidate is ignored");
  run("confirmCandidateDeletion('delete-target')");
  assert.strictEqual(run("data.candidates.length"), 0, "only the matching explicit confirmation removes the candidate");
  assert.strictEqual(JSON.parse(context.localStorage.value).candidates.length, 0, "confirmed deletion is persisted through the normal save path");

  const unresolvedDeleteCandidate = { ...deletableCandidate, id: "delete-blocked", itemCode: "test-shop:delete-blocked",
    roomAttempt: { status: "result_check_required", itemCode: "test-shop:delete-blocked" }, postStatus: "結果確認待ち" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [unresolvedDeleteCandidate], history: [] });
  run("data = loadData(); candidateDeleteConfirmationId = null;");
  run("deleteCandidate('delete-blocked')");
  assert.strictEqual(run("candidateDeleteConfirmationId"), null, "unresolved outcomes never open a delete confirmation");
  assert.strictEqual(run("data.candidates.length"), 1, "unresolved candidates cannot be deleted");
  assert.strictEqual(JSON.parse(context.localStorage.value).candidates.length, 1, "unresolved candidate remains persisted");

  // A natural-language prompt creates and persists only the requested queue in an isolated mock.
  // The outbound ROOM step is replaced here; this test never opens a product URL or ROOM page.
  const queueCandidates = [
    ...[3, 1, 2, 4].map((number) => ({ ...candidate, id: `queue-${number}`, itemCode: `shop:item-${number}`,
      title: `${number}番目`, savedAt: `2026-10-0${number}T00:00:00.000Z`,
      product: { ...candidate.product, itemCode: `shop:item-${number}`, itemName: `${number}番目` } }))
  ];
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: queueCandidates, history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  context.commandInputs = {
    "#codex-room-command": { value: "楽天ROOMの投稿候補から3件、正式Skillに従って連続実投稿してください。" },
    "#codex-room-command-message": { textContent: "" }
  };
  context.mockRoomStarts = [];
  run("startCodexPost = async (id, mode, code) => { mockRoomStarts.push({ id, mode, code }); return true; };");
  assert.strictEqual(await run("handleCodexRoomCommandSubmit({ preventDefault() {} })"), true,
    context.commandInputs["#codex-room-command-message"].textContent);
  assert.strictEqual(run("data.roomPostQueue.requestedCount"), 1);
  assert.strictEqual(run("activeRoomPostQueue.targetSuccesses"), 3);
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1, "only the current candidate is saved in the audit queue");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.mockRoomStarts)), [{ id: "queue-1", mode: "continuous", code: "shop:item-1" }],
    "the mocked handoff starts only the oldest fixed candidate and has no external side effect");
  assert.deepStrictEqual(Array.from(run("data.roomPostQueue.entries"), (entry) => [entry.candidateId, entry.itemCode]), [
    ["queue-1", "shop:item-1"]
  ]);
  assert.strictEqual(run("data.candidates.some((item) => item.roomAttempt)"), false,
    "mock queue acceptance does not create a live ROOM attempt");
  assert.strictEqual(JSON.parse(context.localStorage.value).roomPostQueue.entries.length, 1,
    "the current-item audit record uses the normal persistence layer");
  run("data = loadData(); activeRoomPostQueue = null; recoverInterruptedRoomAttempts();");
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "queue-1",
    "reloading never recreates or expands the current-item audit record");

  // Unspecified count means snapshot all currently eligible ROOM candidates.
  // Confirmation-wait and posted items stay excluded, and X/Threads-only
  // negative wording must not cancel the explicit ROOM posting permission.
  const allAvailableCandidates = [
    ...[3, 1, 2].map((number) => ({ ...candidate, id: `all-${number}`, itemCode: `shop:all-${number}`,
      title: `${number}番目`, savedAt: `2026-10-0${number}T00:00:00.000Z`,
      product: { ...candidate.product, itemCode: `shop:all-${number}`, itemName: `${number}番目` } })),
    { ...candidate, id: "already-posted", itemCode: "shop:already-posted", postStatus: "投稿済み",
      status: "投稿済み", postedAt: "2026-10-01T00:00:00.000Z",
      product: { ...candidate.product, itemCode: "shop:already-posted" } },
    { ...candidate, id: "result-wait", itemCode: "shop:result-wait", postStatus: "結果確認待ち",
      roomAttempt: { status: "result_check_required", candidateId: "result-wait", itemCode: "shop:result-wait",
        roomOperationClosedAt: "2026-10-16T01:00:00.000Z", roomOperationCloseReason: "隔離テストで操作終了を記録済み" },
      product: { ...candidate.product, itemCode: "shop:result-wait" } }
  ];
  context.localStorage.value = JSON.stringify({
    settings: {}, candidates: allAvailableCandidates,
    history: [{ itemCode: "shop:already-posted", postedAt: "2026-10-01T00:00:00.000Z" }]
  });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  context.commandInputs = {
    "#codex-room-command": { value: "今回、楽天ROOMへの実投稿を許可します。投稿可能候補を登録日時の古い順に、候補がなくなるまで1件ずつ連続実投稿してください。X・Threadsには投稿しないでください。" },
    "#codex-room-command-message": { textContent: "" }
  };
  context.mockRoomStarts = [];
  run("startCodexPost = async (id, mode, code) => { mockRoomStarts.push({ id, mode, code }); return true; };");
  assert.strictEqual(await run("handleCodexRoomCommandSubmit({ preventDefault() {} })"), true,
    context.commandInputs["#codex-room-command-message"].textContent);
  assert.strictEqual(run("data.roomPostQueue.requestedCount"), 1,
    "the saved audit queue is always limited to its current item");
  assert.strictEqual(run("activeRoomPostQueue.targetSuccesses"), 3,
    "an unspecified target is bounded by the initial eligible candidate count in runtime state");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1);
  assert.deepStrictEqual(Array.from(run("data.roomPostQueue.entries"), (entry) => [entry.candidateId, entry.itemCode]), [
    ["all-1", "shop:all-1"]
  ], "only the oldest eligible candidate is persisted; posted and result-check-required candidates stay excluded");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.mockRoomStarts)), [
    { id: "all-1", mode: "continuous", code: "shop:all-1" }
  ], "the normal queue starts one fixed item at a time");
  assert.match(context.commandInputs["#codex-room-command-message"].textContent, /1件ずつ.*成功目標 3件/);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'result-wait').postStatus"), "結果確認待ち");
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'already-posted').postStatus"), "投稿済み");

  // A confirmed duplicate is not counted; the next candidate is resolved
  // dynamically, and the success target is applied to actual saved posts.
  const recoveryCandidates = ["fail-one", "success-two", "success-three"].map((id, index) => ({
    ...candidate, id, itemCode: `shop:${id}`, title: id,
    product: { ...candidate.product, itemCode: `shop:${id}`, itemName: id },
    savedAt: `2026-10-0${index + 1}T00:00:00.000Z`,
    introText: "保存済みの商品情報に基づく紹介文です。", hashTags: "#テスト"
  }));
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: recoveryCandidates, history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  context.commandInputs = {
    "#codex-room-command": { value: "楽天ROOMの投稿候補から2件、連続実投稿してください。" },
    "#codex-room-command-message": { textContent: "" }
  };
  context.mockRoomStarts = [];
  run("startCodexPost = async (id, mode, code) => { mockRoomStarts.push({ id, mode, code }); return true; };");
  assert.strictEqual(await run("handleCodexRoomCommandSubmit({ preventDefault() {} })"), true);
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "fail-one");
  run("data.candidates[0].roomAttempt = { attemptId: 'unknown-duplicate-attempt', status: 'result_check_required', candidateId: 'fail-one', itemCode: 'shop:fail-one', startedAt: '2026-10-16T00:00:00.000Z', roomOperationClosedAt: '2026-10-16T00:01:00.000Z', roomOperationCloseReason: '隔離モックでROOM画面の終了を確認' };");
  assert.strictEqual(run("confirmRoomAttemptResult('fail-one', RoomAttempt.STATUS.DUPLICATE_CONFIRMED, RoomAttempt.SOURCE.DUPLICATE)"), true);
  assert.strictEqual(run("activeRoomPostQueue.successCount"), 0, "confirmed duplicate is not a successful post");
  assert.strictEqual(context.mockRoomStarts.at(-1).id, "success-two", "after a confirmed and closed duplicate, selection advances to the next eligible candidate");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "success-two");
  for (const id of ["success-two", "success-three"]) {
    run(`data.candidates.find((item) => item.id === '${id}').roomAttempt = RoomAttempt.create(data.candidates.find((item) => item.id === '${id}'), 'attempt-${id}', '2026-10-16T00:00:00.000Z');`);
    assert.strictEqual(run(`markPosted('${id}', RoomAttempt.SOURCE.COMPLETION)`), true,
      `mocked success for ${id} should be accepted: ${run("toastMessages.at(-1)")}`);
    if (id === "success-two") {
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(run("activeRoomPostQueue.successCount"), 1);
      assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "success-three",
        "the next item is selected only after the first history record is saved");
    }
  }
  assert.strictEqual(run("activeRoomPostQueue"), null, "the run stops when its successful-post target is reached");
  assert.strictEqual(run("data.history.length"), 2);
  assert.deepStrictEqual(context.mockRoomStarts.map((item) => item.id), ["fail-one", "success-two", "success-three"]);

  // Legacy status-only processing is protected only after an explicit identity check and confirmation.
  const legacyCandidate = { id: "2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e", destination: "room",
    itemCode: "devirockstore:10031954", title: "旧形式の候補", status: "投稿待ち", postStatus: "Codex処理中" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  context.commandInputs = {
    "#legacy-room-confirm-code-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { value: "devirockstore:10031954" },
    "#legacy-room-protection-reason-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { value: "ROOM結果不明のまま保留する確認" },
    "#legacy-room-protection-confirmed-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { checked: true }
  };
  assert.strictEqual(run("RoomAttempt.isLegacyProcessingState(data.candidates[0])"), true);
  assert.strictEqual(run("protectLegacyRoomProcessing('2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e')"), true);
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "result_check_required");
  assert.strictEqual(run("data.candidates[0].roomAttempt.startedAt"), null);
  assert.strictEqual(run("data.candidates[0].roomAttempt.confirmedAt"), null);
  assert.strictEqual(run("data.candidates[0].roomAttempt.confirmationSource"), null);
  assert.strictEqual(run("data.candidates[0].roomAttempt.itemCode"), "devirockstore:10031954");
  assert.strictEqual(run("data.candidates[0].postStatus"), "結果確認待ち");
  assert.strictEqual(run("JSON.parse(localStorage.value).candidates[0].roomAttempt.startedAt"), null);
  run("data = loadData(); recoverInterruptedRoomAttempts();");
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "result_check_required", "reload preserves the unknown result");
  assert.strictEqual(run("data.candidates[0].roomAttempt.startedAt"), null);

  context.commandInputs["#room-operation-close-reason-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e"] = {
    value: "ROOM投稿画面を閉じ、操作が継続していないことを目視確認"
  };
  assert.strictEqual(run("confirmRoomOperationClosed('2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e')"), true);
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "result_check_required", "operation closure is not a post result");
  assert.strictEqual(run("data.candidates[0].roomAttempt.confirmedAt"), null);
  assert.strictEqual(run("getProcessingBlocker()"), null,
    "verified ROOM closure releases other itemCodes while preserving the unknown candidate itself");
  context.otherQueueEntries = [{ candidateId: "other-id", itemCode: "different-shop:item" }];
  context.sameQueueEntries = [{ candidateId: "retry-id", itemCode: "devirockstore:10031954" }];
  assert.strictEqual(run("RoomCodexBridge.canStartQueue([...data.candidates, { id: 'other-id', itemCode: 'different-shop:item' }], otherQueueEntries, null).ok"), true,
    "a different itemCode can be queued after ROOM closure is verified");
  assert.strictEqual(run("RoomCodexBridge.canStartQueue(data.candidates, sameQueueEntries, null).ok"), false,
    "the protected itemCode remains blocked even after operation closure");
  const freshQueueCandidates = [
    { ...legacyCandidate, roomAttempt: run("structuredClone(data.candidates[0].roomAttempt)") },
    { ...candidate, id: "fresh-b", itemCode: "shop:fresh-b", product: { ...candidate.product, itemCode: "shop:fresh-b" },
      title: "新しい商品B", savedAt: "2026-10-03T00:00:00.000Z" },
    { ...candidate, id: "fresh-a", itemCode: "shop:fresh-a", product: { ...candidate.product, itemCode: "shop:fresh-a" },
      title: "新しい商品A", savedAt: "2026-10-02T00:00:00.000Z" }
  ];
  context.freshQueueCandidates = freshQueueCandidates;
  const oldQueue = run("RoomCodexBridge.recordOutcome(RoomCodexBridge.createQueue(freshQueueCandidates.map((item) => ({ candidateId: item.id, itemCode: item.itemCode })), 3, '2026-10-16T00:00:00.000Z', 'old-unrecoverable-count-queue', { successTarget: true }).queue, '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e', 'devirockstore:10031954', 'unknown').queue");
  oldQueue.policy = "fixed_items";
  oldQueue.version = 1;
  oldQueue.requestedCount = 371;
  context.oldQueue = oldQueue;
  assert.strictEqual(run("RoomCodexBridge.isSavedQueueConsistent(oldQueue, freshQueueCandidates)"), false,
    "test fixture represents an old queue whose starting count cannot be reconciled");
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: freshQueueCandidates, history: [{ itemCode: "shop:already-posted" }], roomPostQueue: oldQueue });
  run("data = loadData(); activeRoomPostQueue = null;");
  context.commandInputs = { "#codex-room-command": { value: "楽天ROOMの投稿候補から2件、連続実投稿してください。" },
    "#codex-room-command-message": { textContent: "" } };
  context.crypto.randomUUID = () => "new-queue-two-items";
  context.mockRoomStarts = [];
  run("startCodexPost = async (id, mode, code) => { mockRoomStarts.push({ id, mode, code }); return true; };");
  assert.strictEqual(await run("handleCodexRoomCommandSubmit({ preventDefault() {} })"), true,
    "explicit prompt can start a fresh queue after a closed unknown result");
  assert.strictEqual(run("data.roomPostQueue.queueId"), "new-queue-two-items");
  assert.strictEqual(run("data.roomPostQueue.status"), "active");
  assert.strictEqual(run("data.roomPostQueue.requestedCount"), 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run("data.roomPostQueue.entries.map(({ candidateId, itemCode }) => ({ candidateId, itemCode }))"))), [
    { candidateId: "fresh-a", itemCode: "shop:fresh-a" }
  ], "the new queue stores only the oldest eligible product; later candidates are recalculated after success");
  assert.strictEqual(context.mockRoomStarts[0].id, "fresh-a");
  assert.strictEqual(context.mockRoomStarts[0].code, "shop:fresh-a");
  assert.strictEqual(run("data.candidates.find((item) => item.id === '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e').roomAttempt.status"), "result_check_required",
    "replacing the old queue leaves the unknown product protected and unclassified");
  assert.strictEqual(run("data.candidates.length"), 3, "new queue creation does not delete candidates");
  assert.strictEqual(run("data.history.length"), 1, "new queue creation preserves posting history");

  context.localStorage.value = JSON.stringify({ settings: {},
    candidates: [run("structuredClone(data.candidates.find((item) => item.id === '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e'))")], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  assert.strictEqual(run("confirmRoomAttemptResult('2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e', RoomAttempt.STATUS.NOT_POSTED_CONFIRMED, RoomAttempt.SOURCE.NOT_POSTED)"), true);
  assert.strictEqual(run("data.roomPostQueue"), undefined, "legacy candidate can be resolved without inventing a prior queue");
  assert.strictEqual(run("RoomCodexBridge.canStartQueue([...data.candidates, { id: 'other-id', itemCode: 'different-shop:item' }], otherQueueEntries, null).ok"), true,
    "new explicit queue may start after ROOM-side result confirmation");

  // Candidate identity conflict and a mismatched open queue are refused without changing the saved record.
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [{ ...legacyCandidate, product: { itemCode: "shop:mismatch" } }], history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  assert.strictEqual(run("protectLegacyRoomProcessing('2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e')"), false);
  assert.strictEqual(run("data.candidates[0].postStatus"), "Codex処理中");
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined);

  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: 'different-id', itemCode: 'shop:other' }], 1, '2026-10-16T00:00:00.000Z', 'other-queue').queue;");
  assert.strictEqual(run("protectLegacyRoomProcessing('2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e')"), false);
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined);
  assert.strictEqual(run("data.roomPostQueue.status"), "active");

  // A matching persisted queue is stopped as unknown; save failure leaves the legacy record intact.
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e', itemCode: 'devirockstore:10031954' }], 1, '2026-10-16T00:00:00.000Z', 'matching-queue').queue;");
  context.commandInputs = {
    "#legacy-room-confirm-code-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { value: "devirockstore:10031954" },
    "#legacy-room-protection-reason-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { value: "ROOM結果不明のまま保留する確認" },
    "#legacy-room-protection-confirmed-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { checked: true }
  };
  assert.strictEqual(run("protectLegacyRoomProcessing('2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e')"), true);
  assert.strictEqual(run("data.roomPostQueue.status"), "result_check_required");
  assert.strictEqual(run("data.roomPostQueue.entries[0].outcome"), "result_check_required");
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  context.localStorage.fail = true;
  context.commandInputs = {
    "#legacy-room-confirm-code-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { value: "devirockstore:10031954" },
    "#legacy-room-protection-reason-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { value: "ROOM結果不明のまま保留する確認" },
    "#legacy-room-protection-confirmed-2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e": { checked: true }
  };
  assert.strictEqual(run("protectLegacyRoomProcessing('2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e')"), false);
  assert.strictEqual(run("data.candidates[0].postStatus"), "Codex処理中");
  assert.strictEqual(run("data.candidates[0].roomAttempt"), undefined);
  assert.strictEqual(JSON.parse(context.localStorage.value).candidates[0].postStatus, "Codex処理中");
  context.localStorage.fail = false;

  // A stale saved queue can be ended only after explicit operation-closure confirmation and exact current ID/code matching.
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e', itemCode: 'devirockstore:10031954' }], 1, '2026-10-16T00:00:00.000Z', 'stale-queue').queue; data.roomPostQueue.requestedCount = 7;");
  context.commandInputs = {
    "#stale-queue-close-reason": { value: "ROOMタブを閉じ、操作が継続していないことを確認" },
    "#stale-queue-close-confirmed": { checked: true }
  };
  assert.strictEqual(run("endStaleRoomQueue()"), true, "unknown saved queue count is not trusted; exact current ID and itemCode allow safe explicit closure");
  assert.strictEqual(run("data.candidates.length"), 1, "operation closure does not delete the unresolved candidate");
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "result_check_required");
  assert.strictEqual(run("data.roomPostQueue.status"), "stopped", "closing the old queue never resumes its fixed next item");
  assert.strictEqual(run("data.roomPostQueue.unknownCount"), 1);
  assert.strictEqual(run("data.history.length"), 0, "stale unknown result is never added to successful history");

  const legacyWithNext = { ...legacyCandidate };
  const queuedNextCandidate = { id: "stale-next", destination: "room", itemCode: "shop:next",
    product: { itemCode: "shop:next", itemName: "次の商品" }, title: "次の商品", postStatus: "紹介文未作成", status: "未作成" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyWithNext, queuedNextCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e', itemCode: 'devirockstore:10031954' }, { candidateId: 'stale-next', itemCode: 'shop:next' }], 1, '2026-10-16T00:00:00.000Z', 'stale-with-next', { successTarget: true }).queue;");
  context.commandInputs = {
    "#stale-queue-close-reason": { value: "ROOM操作が終了し、対象画面が閉じていることを確認" },
    "#stale-queue-close-confirmed": { checked: true }
  };
  context.mockRoomStarts = [];
  run("startCodexPost = async (id, mode, code) => { mockRoomStarts.push({ id, mode, code }); return true; };");
  assert.strictEqual(run("endStaleRoomQueue()"), true);
  assert.deepStrictEqual(context.mockRoomStarts, [],
    "verified closure terminates the old queue without starting its frozen next candidate");
  assert.strictEqual(run("data.candidates.find((item) => item.id === '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e').roomAttempt.status"), "result_check_required");
  assert.strictEqual(run("data.candidates.find((item) => item.id === '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e').postStatus"), "結果確認待ち");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 0,
    "the old fixed queue is cleared only after confirmed operation closure; the candidate itself remains saved");
  assert.strictEqual(run("data.roomPostQueue.successCount"), 0);
  assert.strictEqual(run("data.roomPostQueue.unknownCount"), 1);
  assert.strictEqual(run("data.history.length"), 0);

  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e', itemCode: 'shop:wrong' }], 1, '2026-10-16T00:00:00.000Z', 'stale-mismatch').queue;");
  assert.strictEqual(run("endStaleRoomQueue()"), false, "stale queue identity mismatch must not delete or clear anything");
  assert.strictEqual(run("data.candidates.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.status"), "active");

  // Queue-only stop ends persisted progression without changing candidates,
  // ROOM attempts, copy, history, result-wait state, or starting the next item.
  const magRide = { ...candidate, id: "magride", title: "MagRide",
    itemCode: "magcruise:10000091", product: { ...candidate.product, itemCode: "magcruise:10000091", itemName: "MagRide" },
    introText: "保存済みMagRide紹介文", hashTags: "#MagRide", postStatus: "投稿待ち",
    roomAttempt: { status: "not_posted_confirmed", candidateId: "magride", itemCode: "magcruise:10000091",
      roomOperationClosedAt: "2026-10-16T00:00:00.000Z", roomOperationCloseReason: "テスト用に操作終了確認済み" } };
  const waitingDevirock = { ...candidate, id: "devirock", title: "devirock",
    itemCode: "devirockstore:10031954", product: { ...candidate.product, itemCode: "devirockstore:10031954" },
    postStatus: "結果確認待ち", roomAttempt: { status: "result_check_required", candidateId: "devirock", itemCode: "devirockstore:10031954" } };
  const nextCandidate = { ...candidate, id: "next-item", title: "次候補", itemCode: "shop:next-item",
    product: { ...candidate.product, itemCode: "shop:next-item" }, postStatus: "紹介文未作成", status: "未作成" };
  const historyBeforeStop = [{ id: "history-existing", itemCode: "shop:posted", postedAt: "2026-10-15T00:00:00.000Z" }];
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [magRide, waitingDevirock, nextCandidate], history: historyBeforeStop });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: 'magride', itemCode: 'magcruise:10000091' }, { candidateId: 'next-item', itemCode: 'shop:next-item' }], 2, '2026-10-16T00:00:00.000Z', 'queue-only-stop').queue;");
  const candidatesBeforeQueueStop = JSON.stringify(run("data.candidates"));
  const historyBeforeQueueStop = JSON.stringify(run("data.history"));
  const entriesBeforeQueueStop = JSON.stringify(run("data.roomPostQueue.entries"));
  context.mockRoomStarts = [];
  assert.strictEqual(run("stopRoomQueueOnly()"), true, "verified saved queue can be stopped independently");
  assert.strictEqual(run("data.roomPostQueue.status"), "stopped");
  assert.strictEqual(run("data.roomPostQueue.currentIndex"), 0, "queue-only stop does not advance the current index");
  assert.strictEqual(JSON.stringify(run("data.roomPostQueue.entries")), entriesBeforeQueueStop, "fixed queue entries remain intact");
  assert.strictEqual(JSON.stringify(run("data.candidates")), candidatesBeforeQueueStop, "candidate, intro, and attempt data remain byte-for-byte equivalent");
  assert.strictEqual(JSON.stringify(run("data.history")), historyBeforeQueueStop, "posting history is unchanged");
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'magride').roomAttempt.roomOperationClosedAt"), "2026-10-16T00:00:00.000Z",
    "queue stop preserves the existing ROOM operation closure evidence without changing it");
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'devirock').roomAttempt.status"), "result_check_required",
    "other result-confirmation-wait candidates remain unchanged");
  assert.deepStrictEqual(context.mockRoomStarts, [], "queue-only stop never starts the next candidate");
  assert.strictEqual(JSON.parse(context.localStorage.value).roomPostQueue.status, "stopped", "queue stop is persisted");

  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [magRide], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: 'magride', itemCode: 'magcruise:10000091' }], 1, '2026-10-16T00:00:00.000Z', 'queue-only-stop-save-failure').queue;");
  run("saveData(data, { render: false });");
  const savedBeforeStopFailure = context.localStorage.value;
  context.localStorage.fail = true;
  assert.strictEqual(run("stopRoomQueueOnly()"), false, "storage failure must reject queue stop");
  assert.strictEqual(context.localStorage.value, savedBeforeStopFailure, "failed save leaves stored state untouched");
  assert.strictEqual(run("data.roomPostQueue.status"), "active", "failed save leaves in-memory queue active as restored from storage");
  context.localStorage.fail = false;

  run("data.candidates.find((item) => item.id === 'magride').roomAttempt = { attemptId: 'in-flight', candidateId: 'magride', itemCode: 'magcruise:10000091', status: 'processing' }; data.candidates.find((item) => item.id === 'magride').postStatus = 'Codex処理中'; activeRoomPostQueue = { entries: [{ candidateId: 'magride', itemCode: 'magcruise:10000091' }], currentIndex: 0, mode: 'continuous' };");
  assert.strictEqual(run("stopRoomQueueOnly()"), false, "queue-only stop cannot race an active runtime queue");
  assert.strictEqual(run("data.roomPostQueue.status"), "active");
  run("activeRoomPostQueue = null;");

  // A detail-page action for Yakenū must not start it when the fixed queue
  // currently names a different candidate; the mismatch remains untouched.
  const yakenu = { ...candidate, id: "yakenu-id", title: "ヤケーヌ",
    itemCode: "suzukachan:10000207", product: { ...candidate.product, itemCode: "suzukachan:10000207", itemName: "ヤケーヌ" },
    introText: "保存済み紹介文", hashTags: "#ヤケーヌ", postStatus: "投稿待ち" };
  const queueFirst = { ...candidate, id: "queue-first", title: "固定キュー先頭",
    itemCode: "shop:queue-first", product: { ...candidate.product, itemCode: "shop:queue-first" }, postStatus: "投稿待ち" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [queueFirst, yakenu], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: 'queue-first', itemCode: 'shop:queue-first' }, { candidateId: 'yakenu-id', itemCode: 'suzukachan:10000207' }], 2, '2026-10-16T00:00:00.000Z', 'yakenu-mismatch-queue').queue;");
  run("activeRoomPostQueue = { entries: data.roomPostQueue.entries, currentIndex: 0, mode: 'continuous' }; currentRoomCopySession = { candidateId: 'yakenu-id', itemCode: 'suzukachan:10000207' }; currentProduct = { itemCode: 'suzukachan:10000207' }; startCodexPost = async () => { globalThis.unexpectedRoomStart = true; return true; };");
  const beforeWrongDetailStart = JSON.stringify(run("data.candidates"));
  assert.strictEqual(await run("startRoomPostFromDetail()"), false,
    "a card/detail candidate that differs from the fixed queue cursor must be rejected before posting preparation");
  assert.strictEqual(context.unexpectedRoomStart, undefined, "mismatch must not call the ROOM start/preparation routine");
  assert.match(context.toastMessages.at(-1), /固定キューの現在候補と一致しません.*固定キュー先頭/);
  assert.strictEqual(JSON.stringify(run("data.candidates")), beforeWrongDetailStart, "identity mismatch does not mutate candidates");
  run("data.roomPostQueue.currentIndex = 1; activeRoomPostQueue.currentIndex = 1; startCodexPost = async () => false;");
  assert.strictEqual(await run("startRoomPostFromDetail()"), false,
    "detail action must propagate a failed asynchronous preparation instead of reporting success");

  // A mismatched pre-start queue can be ended as queue metadata only when the
  // current candidate has no ROOM attempt; confirmation-wait data is retained.
  const waitingProtected = { ...candidate, id: "waiting-protected", title: "確認待ち商品",
    itemCode: "shop:waiting", product: { ...candidate.product, itemCode: "shop:waiting" }, postStatus: "結果確認待ち",
    roomAttempt: { attemptId: "waiting-attempt", candidateId: "waiting-protected", itemCode: "shop:waiting",
      status: "result_check_required", startedAt: null } };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [yakenu, waitingProtected], history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: 'yakenu-id', itemCode: 'shop:stale-code' }], 1, '2026-10-16T00:00:00.000Z', 'yakenu-prestart-mismatch').queue; activeRoomPostQueue = { entries: data.roomPostQueue.entries, currentIndex: 0, mode: 'continuous' };");
  const candidatesBeforeMismatchStop = JSON.stringify(run("data.candidates"));
  const historyBeforeMismatchStop = JSON.stringify(run("data.history"));
  assert.strictEqual(run("stopRoomQueueOnly()"), true,
    "a pre-ROOM queue with mismatched itemCode can be stopped without guessing or editing a product");
  assert.strictEqual(run("data.roomPostQueue.status"), "stopped");
  assert.strictEqual(run("activeRoomPostQueue"), null, "runtime queue pointer is cleared after persisted stop is verified");
  assert.strictEqual(JSON.stringify(run("data.candidates")), candidatesBeforeMismatchStop, "Yakenū and waiting candidate data stay unchanged");
  assert.strictEqual(JSON.stringify(run("data.history")), historyBeforeMismatchStop, "history stays unchanged");
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'waiting-protected').roomAttempt.status"), "result_check_required",
    "existing confirmation-wait state is preserved");

  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [{ ...yakenu,
    roomAttempt: { attemptId: "in-flight", candidateId: "yakenu-id", itemCode: "suzukachan:10000207", status: "processing" },
    postStatus: "Codex処理中" }], history: [] });
  run("data = loadData(); activeRoomPostQueue = { entries: [{ candidateId: 'yakenu-id', itemCode: 'suzukachan:10000207' }], currentIndex: 0, mode: 'continuous' }; data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: 'yakenu-id', itemCode: 'suzukachan:10000207' }], 1, '2026-10-16T00:00:00.000Z', 'yakenu-inflight-queue').queue;");
  assert.strictEqual(run("stopRoomQueueOnly()"), false, "an existing in-flight ROOM attempt prevents queue termination");
  assert.strictEqual(run("data.roomPostQueue.status"), "active");

  console.log("ROOM attempt integration, bounded queue, reload recovery, legacy protection and failed-save safety: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
