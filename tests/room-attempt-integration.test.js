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
  assert.strictEqual(run("data.roomPostQueue.currentIndex"), 1);
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 2);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').roomAttempt.status"), "processing");
  assert.strictEqual(run("Boolean(data.candidates.find((item) => item.id === 'candidate-2').introText)"), true,
    "the next candidate's missing copy is generated and saved as its turn begins");
  assert.strictEqual(JSON.parse(context.localStorage.value).history.length, 1,
    "the first history write is visible in storage before the next attempt starts");

  // Reload recovery: a persisted advance-ready queue resumes the exact next ID/itemCode from the natural-language prompt.
  const reloaded = JSON.parse(context.localStorage.value);
  reloaded.roomPostQueue.status = "advance_ready";
  reloaded.roomPostQueue.currentIndex = 0;
  reloaded.roomPostQueue.entries[0].outcome = "posted";
  const reloadedFirst = reloaded.candidates.find((item) => item.id === "candidate-1");
  const reloadedSecond = reloaded.candidates.find((item) => item.id === "candidate-2");
  reloadedFirst.status = "投稿済み";
  reloadedFirst.postStatus = "投稿済み";
  reloadedFirst.roomAttempt = { attemptId: "attempt-1", candidateId: "candidate-1", itemCode: "shop:item-1",
    startedAt: "2026-10-01T00:00:00.000Z", status: "posted_confirmed", confirmedAt: "2026-10-01T00:01:00.000Z",
    confirmationSource: "room_completion_screen" };
  delete reloadedSecond.roomAttempt;
  reloadedSecond.status = "未作成";
  reloadedSecond.postStatus = "紹介文未作成";
  reloadedSecond.introText = "";
  reloadedSecond.hashTags = "";
  context.localStorage.value = JSON.stringify(reloaded);
  run("data = loadData(); activeRoomPostQueue = null; recoverInterruptedRoomAttempts();");
  context.commandInputs = { "#codex-room-command": { value: "楽天ROOMの投稿候補から2件、連続実投稿してください。" },
    "#codex-room-command-message": { textContent: "" } };
  const resumed = await run("handleCodexRoomCommandSubmit({ preventDefault() {} })");
  assert.strictEqual(resumed, true, `${context.commandInputs["#codex-room-command-message"].textContent} ${context.toastMessages.join(" | ")}`);
  assert.strictEqual(run("data.roomPostQueue.currentIndex"), 1);
  assert.strictEqual(run("data.roomPostQueue.entries[1].candidateId"), "candidate-2");
  assert.strictEqual(run("data.roomPostQueue.entries[1].itemCode"), "shop:item-2");
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').roomAttempt.status"), "processing");
  assert.strictEqual(JSON.parse(context.localStorage.value).roomPostQueue.currentIndex, 1,
    "reloaded queue progress must be persisted before starting the next attempt");

  const interruptedBeforeAttempt = JSON.parse(context.localStorage.value);
  interruptedBeforeAttempt.roomPostQueue.status = "active";
  interruptedBeforeAttempt.roomPostQueue.currentIndex = 1;
  interruptedBeforeAttempt.roomPostQueue.entries[1].outcome = "pending";
  const secondAfterReload = interruptedBeforeAttempt.candidates.find((item) => item.id === "candidate-2");
  delete secondAfterReload.roomAttempt;
  secondAfterReload.postStatus = "紹介文作成済み";
  context.localStorage.value = JSON.stringify(interruptedBeforeAttempt);
  run("data = loadData(); activeRoomPostQueue = null; recoverInterruptedRoomAttempts();");
  context.commandInputs["#codex-room-command"].value = "楽天ROOMの投稿候補から2件、連続実投稿してください。";
  context.commandInputs["#codex-room-command-message"].textContent = "";
  assert.strictEqual(await run("handleCodexRoomCommandSubmit({ preventDefault() {} })"), true,
    "an active queue may resume only when its current fixed item has no ROOM attempt and all prior outcomes are saved");
  assert.strictEqual(run("data.roomPostQueue.currentIndex"), 1);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').roomAttempt.status"), "processing");
  assert.strictEqual(run("markRoomResultUnknown('candidate-2')"), true);
  context.commandInputs["#room-operation-close-reason-candidate-2"] = { value: "ROOM投稿操作を終了し、該当タブが閉じていることを確認" };
  assert.strictEqual(run("confirmRoomOperationClosed('candidate-2')"), true);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').postStatus"), "結果確認待ち",
    "closing the browser operation alone must not decide whether the item was posted");
  assert.strictEqual(run("confirmRoomAttemptResult('candidate-2', RoomAttempt.STATUS.DUPLICATE_CONFIRMED, RoomAttempt.SOURCE.DUPLICATE)"), true);
  assert.strictEqual(run("data.candidates.find((item) => item.id === 'candidate-2').postStatus"), "ROOM重複確認済み");
  assert.strictEqual(run("data.history.length"), 1, "a ROOM duplicate warning is not a new successful post");
  assert.strictEqual(run("data.roomPostQueue.status"), "completed", "a two-item queue ends after the second fixed result");
  assert.strictEqual(run("data.roomPostQueue.entries[1].outcome"), "duplicate");

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
  assert.strictEqual(run("data.roomPostQueue.entries.length"), 3, "the queue never exceeds the requested count");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.mockRoomStarts)), [{ id: "queue-1", mode: "continuous", code: "shop:item-1" }],
    "the mocked handoff starts only the oldest fixed candidate and has no external side effect");
  assert.deepStrictEqual(Array.from(run("data.roomPostQueue.entries"), (entry) => [entry.candidateId, entry.itemCode]), [
    ["queue-1", "shop:item-1"], ["queue-2", "shop:item-2"], ["queue-3", "shop:item-3"]
  ]);
  assert.strictEqual(run("data.candidates.some((item) => item.roomAttempt)"), false,
    "mock queue acceptance does not create a live ROOM attempt");
  assert.strictEqual(JSON.parse(context.localStorage.value).roomPostQueue.entries.length, 3,
    "bounded queue survives app reload through the normal persistence layer");
  run("data = loadData(); activeRoomPostQueue = null; recoverInterruptedRoomAttempts();");
  assert.strictEqual(run("data.roomPostQueue.entries[2].candidateId"), "queue-3",
    "reloading preserves the final fixed ID without appending a fourth candidate");

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
  assert.strictEqual(run("getProcessingBlocker()"), null, "confirmed closure can unblock a different item");
  context.otherQueueEntries = [{ candidateId: "other-id", itemCode: "different-shop:item" }];
  context.sameQueueEntries = [{ candidateId: "retry-id", itemCode: "devirockstore:10031954" }];
  assert.strictEqual(run("RoomCodexBridge.canStartQueue(data.candidates, otherQueueEntries, null).ok"), true);
  assert.strictEqual(run("RoomCodexBridge.canStartQueue(data.candidates, sameQueueEntries, null).ok"), false,
    "the protected itemCode remains blocked even after operation closure");

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

  console.log("ROOM attempt integration, bounded queue, reload recovery, legacy protection and failed-save safety: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
