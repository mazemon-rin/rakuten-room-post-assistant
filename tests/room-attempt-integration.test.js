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
  document: { addEventListener() {}, querySelector(selector) { return context.commandInputs?.[selector] || null; }, querySelectorAll() { return []; }, getElementById() { return null; },
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
  "src/core/product-identity.js", "src/core/duplicate-detection.js", "script.js"]) {
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
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), true);
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
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [{ ...candidate }], history: [] });
  run("data = loadData();");
  assert.strictEqual(await run("startCodexPost('candidate-1', 'confirmation')"), true);
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
  context.localStorage.fail = true;
  assert.strictEqual(run("markPosted('candidate-1', RoomAttempt.SOURCE.COMPLETION)"), false);
  assert.strictEqual(JSON.parse(context.localStorage.value).history.length, 0);
  assert.strictEqual(run("data.candidates[0].roomAttempt.status"), "processing");
  context.localStorage.fail = false;

  // Phase 3: natural-language count starts a persistent bounded queue; saved history is verified before item two starts.
  const secondCandidate = { ...candidate, id: "candidate-2", itemCode: "shop:item-2", title: "保存済み特徴のTシャツ",
    itemUrl: "https://item.rakuten.co.jp/shop/item-2/", product: { itemCode: "shop:item-2", itemName: "保存済み特徴のTシャツ",
      itemUrl: "https://item.rakuten.co.jp/shop/item-2/", itemCaption: "ポリエステル素材。吸汗速乾性。" },
    introText: "", hashTags: "", status: "未作成", postStatus: "紹介文未作成", savedAt: "2026-10-02T00:00:00.000Z" };
  const firstCandidate = { ...candidate, id: "candidate-1", savedAt: "2026-10-01T00:00:00.000Z" };
  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [secondCandidate, firstCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null; data.roomPostQueue = undefined;");
  assert.strictEqual(await run("startSequentialProcessing('continuous', 2, { source: 'codex-prompt' })"), undefined);
  assert.strictEqual(run("data.roomPostQueue.requestedCount"), 2);
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "candidate-1");
  assert.strictEqual(run("data.roomPostQueue.currentIndex"), 0);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-1').roomAttempt.status"), "processing");
  assert.strictEqual(run("JSON.parse(localStorage.value).roomPostQueue.entries.length"), 2);
  assert.strictEqual(run("markPosted('candidate-1', RoomAttempt.SOURCE.COMPLETION)"), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(run("data.history.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.currentIndex"), 0);
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.policy"), "successful_posts");
  assert.strictEqual(run("data.roomPostQueue.successCount"), 1);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').roomAttempt.status"), "processing");
  assert.strictEqual(run("Boolean(data.candidates.find((item) => item.id === 'candidate-2').introText)"), true,
    "the next candidate's missing copy is generated and saved as its turn begins");
  assert.strictEqual(JSON.parse(context.localStorage.value).history.length, 1,
    "the first history write is visible in storage before the next attempt starts");

  // Reload recovery: a persisted in-flight success-target queue is not restarted; it becomes unknown and waits for ROOM closure.
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
  assert.strictEqual(run("data.roomPostQueue.successCount"), 1);
  context.commandInputs["#room-operation-close-reason-candidate-2"] = { value: "ROOM投稿操作を終了し、該当タブが閉じていることを確認" };
  assert.strictEqual(run("confirmRoomOperationClosed('candidate-2')"), true);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').postStatus"), "結果確認待ち",
    "closing the browser operation alone must not decide whether the item was posted");
  assert.strictEqual(run("getProcessingBlocker()"), null,
    "a closed unknown result does not block a different item after it is removed from the fixed queue");
  run("data.candidates.push({ ...data.candidates[0], id: 'candidate-3', itemCode: 'shop:item-3', product: { ...data.candidates[0].product, itemCode: 'shop:item-3' }, roomAttempt: undefined, postStatus: '投稿待ち', status: '投稿待ち' })");
  assert.strictEqual(run("RoomCodexBridge.canStartQueue(data.candidates, [{ candidateId: 'candidate-3', itemCode: 'shop:item-3' }], data.roomPostQueue).ok"), true,
    "after queue closure, a different product may start while the unknown result remains protected");
  assert.strictEqual(run("typeof removeClosedUnknownFromSuccessQueue"), "undefined",
    "the legacy unknown-removal action is removed rather than left as an alternate continuation path");
  assert.strictEqual(run("data.candidates.some((item) => item.id === 'candidate-2')"), true);
  assert.strictEqual(run("data.roomPostQueue.successCount"), 1, "unknown result does not count as a post");
  assert.strictEqual(run("data.roomPostQueue.failureCount"), 0);
  assert.strictEqual(run("data.roomPostQueue.status"), "completed");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 0);
  assert.strictEqual(run("data.roomPostQueue.unknownCount"), 1);
  assert.strictEqual(run("confirmRoomAttemptResult('candidate-2', RoomAttempt.STATUS.NOT_POSTED_CONFIRMED, RoomAttempt.SOURCE.NOT_POSTED)"), true,
    "a human-confirmed ROOM result can resolve the attempt using the normal state UI");
  assert.strictEqual(run("data.roomPostQueue.status"), "completed", "a queue with no remaining fixed candidates stays completed after human resolution");
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
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 2,
    "the new success-target queue fixes the remaining eligible candidates in order");
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
  assert.strictEqual(run("data.roomPostQueue.status"), "active");
  assert.strictEqual(run("data.roomPostQueue.failureCount"), 1);
  assert.strictEqual(run("data.roomPostQueue.deletedCount"), 1);
  assert.strictEqual(run("data.roomPostQueue.successCount"), 0);
  assert.strictEqual(run("data.candidates.some((item) => item.id === 'unknown-duplicate')"), false,
    "a ROOM-confirmed duplicate is removed from candidates without deleting successful history");
  assert.deepStrictEqual(context.mockRoomStarts, ["after-unknown"], "a confirmed duplicate advances to the next fixed item");
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
  assert.strictEqual(run("data.roomPostQueue.requestedCount"), 3);
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 4, "the queue snapshots eligible candidates beyond the success target to allow confirmed skips");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.mockRoomStarts)), [{ id: "queue-1", mode: "continuous", code: "shop:item-1" }],
    "the mocked handoff starts only the oldest fixed candidate and has no external side effect");
  assert.deepStrictEqual(Array.from(run("data.roomPostQueue.entries"), (entry) => [entry.candidateId, entry.itemCode]), [
    ["queue-1", "shop:item-1"], ["queue-2", "shop:item-2"], ["queue-3", "shop:item-3"], ["queue-4", "shop:item-4"]
  ]);
  assert.strictEqual(run("data.candidates.some((item) => item.roomAttempt)"), false,
    "mock queue acceptance does not create a live ROOM attempt");
  assert.strictEqual(JSON.parse(context.localStorage.value).roomPostQueue.entries.length, 4,
    "the eligible snapshot survives app reload through the normal persistence layer");
  run("data = loadData(); activeRoomPostQueue = null; recoverInterruptedRoomAttempts();");
  assert.strictEqual(run("data.roomPostQueue.entries[3].candidateId"), "queue-4",
    "reloading preserves the entire initial eligible snapshot");

  // Successful-post target: a confirmed unusable candidate is removed, does not count, and the queue ends at two successes.
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
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 3, "success-target queues scan past confirmed failures");
  context.commandInputs["#queue-failure-reason-fail-one"] = { value: "product_missing" };
  context.commandInputs["#queue-failure-evidence-fail-one"] = { value: "商品ページが見つからないことを確認" };
  context.commandInputs["#queue-failure-closed-fail-one"] = { checked: true };
  assert.strictEqual(run("confirmQueueCandidateUnpostable('fail-one')"), true);
  assert.strictEqual(run("data.candidates.some((item) => item.id === 'fail-one')"), false);
  assert.strictEqual(run("data.roomPostQueue.successCount"), 0);
  assert.strictEqual(run("data.roomPostQueue.failureCount"), 1);
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "success-two",
    "the confirmed-failure transition fixes the next candidate by ID");
  for (const id of ["success-two", "success-three"]) {
    run("activeRoomPostQueue = { entries: data.roomPostQueue.entries, currentIndex: 0, mode: 'continuous' };");
    run(`data.candidates.find((item) => item.id === '${id}').roomAttempt = RoomAttempt.create(data.candidates.find((item) => item.id === '${id}'), 'attempt-${id}', '2026-10-16T00:00:00.000Z');`);
    assert.strictEqual(run(`markPosted('${id}', RoomAttempt.SOURCE.COMPLETION)`), true,
      `mocked success for ${id} should be accepted: ${run("toastMessages.at(-1)")}`);
  }
  assert.strictEqual(run("data.roomPostQueue.successCount"), 2);
  assert.strictEqual(run("data.roomPostQueue.failureCount"), 1);
  assert.strictEqual(run("data.roomPostQueue.status"), "completed");
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 0);
  assert.strictEqual(run("data.history.length"), 2);
  assert.strictEqual(context.mockRoomStarts.at(-1).id, "success-three", "the success target is the terminal boundary");

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
  assert.strictEqual(run("data.roomPostQueue.status"), "completed", "the fixed queue ends when no other fixed item remains");
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
  assert.strictEqual(context.mockRoomStarts[0], "stale-next",
    "after a verified closure, only the next fixed candidate is started");
  assert.strictEqual(run("data.candidates.find((item) => item.id === '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e').roomAttempt.status"), "result_check_required");
  assert.strictEqual(run("data.candidates.find((item) => item.id === '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e').postStatus"), "結果確認待ち");
  assert.strictEqual(run("data.roomPostQueue.entries[0].candidateId"), "stale-next");
  assert.strictEqual(run("data.roomPostQueue.entries[0].itemCode"), "shop:next");
  assert.strictEqual(run("data.roomPostQueue.successCount"), 0);
  assert.strictEqual(run("data.roomPostQueue.unknownCount"), 1);
  assert.strictEqual(run("data.history.length"), 0);

  context.localStorage.value = JSON.stringify({ settings: {}, candidates: [legacyCandidate], history: [] });
  run("data = loadData(); activeRoomPostQueue = null;");
  run("data.roomPostQueue = RoomCodexBridge.createQueue([{ candidateId: '2f145c8f-dd1b-4ce2-be1b-a3a9b1bbcf1e', itemCode: 'shop:wrong' }], 1, '2026-10-16T00:00:00.000Z', 'stale-mismatch').queue;");
  assert.strictEqual(run("endStaleRoomQueue()"), false, "stale queue identity mismatch must not delete or clear anything");
  assert.strictEqual(run("data.candidates.length"), 1);
  assert.strictEqual(run("data.roomPostQueue.status"), "active");

  console.log("ROOM attempt integration, bounded queue, reload recovery, legacy protection and failed-save safety: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
