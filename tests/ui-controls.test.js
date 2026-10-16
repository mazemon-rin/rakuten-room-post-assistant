const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const roomQueue = fs.readFileSync("src/core/room-sequential-queue.js", "utf8");
const roomBridge = fs.readFileSync("src/core/room-codex-bridge.js", "utf8");
const candidateList = fs.readFileSync("src/core/candidate-list-view.js", "utf8");
const discovery = fs.readFileSync("src/sns-trend-discovery.js", "utf8");
const css = fs.readFileSync("src/sns-trend.css", "utf8");
const appCss = fs.readFileSync("style.css", "utf8");

if (!html.includes('id="clearSearchConditions"') || !html.includes('id="clearSearchConditions" class="secondary-button" type="button">クリア')) {
  throw new Error("search clear button is missing or mislabeled");
}
if (!html.includes('id="unifiedSearchMode"') || !html.includes('value="high_affiliate_rate">高料率検索')) throw new Error("high affiliate-rate search mode is missing");
for (const rate of [5, 10, 15, 20]) if (!html.includes(`value="${rate}">${rate}%以上`)) throw new Error(`affiliate-rate threshold ${rate}% is missing`);
if (!html.includes('API参考料率') || !script.includes('searchHighAffiliateRateProducts') || !script.includes('updateAffiliateRateSearchVisibility')) throw new Error("high affiliate-rate UI flow is missing");
if (!html.includes('id="apiRateDiagnostic"') || !script.includes('runApiRateDiagnostic')) throw new Error("developer API rate diagnostic UI flow is missing");
for (const condition of ["A", "B", "C", "D", "E"]) if (!html.includes(`data-api-rate-condition="${condition}"`)) throw new Error(`API rate diagnostic condition ${condition} is missing`);
if (!html.includes("shopCode検索は最大2ページ・60件まで確認") || !html.includes("E：shopCode / 最大2ページ・60件") || !script.includes("対象商品未発見")) throw new Error("shopCode diagnostic UI must communicate its two-page, 60-item limit");
if (!script.includes('エラーコード：${result.errorCode || "詳細不明"}')) throw new Error("diagnostic UI must show only allowlisted error codes or an unknown-detail label");
if (!script.includes("安全なエラー理由：${result.safeErrorReason}")) throw new Error("diagnostic UI must display only a sanitized API error reason");
if (!script.includes("取得した全件に対象商品なし") || !script.includes("対象商品未確認（全件確認は未完了）") || !script.includes("result.pagesChecked")) throw new Error("shop-code diagnostic must distinguish complete and incomplete two-page scans");
for (const label of ["API料率分布診断", "1%以上～2%未満", "2%以上～3%未満", "3%以上～4%未満", "4%以上～5%未満", "5%以上", "affiliateRate未取得", "affiliateRate不正値"]) {
  if (!script.includes(label)) throw new Error(`A-only affiliate-rate distribution display is missing: ${label}`);
}
if (!script.includes('applyHighAffiliateRateParams(params, minimumRate)') || !script.includes('buildHighRateCandidateProduct(product)')) throw new Error("high affiliate-rate API filtering or candidate minimization is missing");
if (!script.includes('affiliateRateSearchResults = [...products]') || !script.includes('processHighRateSearchResponses') || !script.includes('quickSaveAffiliateRateByIndex') || !script.includes('openAffiliateRateDetailByIndex')) throw new Error("high affiliate-rate results must use their own filtered processing and selection state");
if (!script.includes('resetSearchModeState') || !html.includes('検索条件を設定して商品を検索してください。')) throw new Error("search mode switching must clear stale results and show the initial prompt");
if ((html.match(/class="discovery-accordion"/g) || []).length < 5) throw new Error("discovery accordion sections are missing");
if (!html.includes('class="discovery-accordion"><summary>Google Trendsから追加</summary>')) throw new Error("Google Trends accordion is missing");
if (!html.includes('class="discovery-accordion"><summary>YouTubeから追加</summary>')) throw new Error("YouTube accordion is missing");
if (!html.includes('class="discovery-accordion"><summary>Yahoo!ショッピング 急上昇ワード</summary>')) throw new Error("Yahoo accordion is missing");
if (!html.includes('id="yahooShoppingRankingFetch"')) throw new Error("Yahoo fetch button is missing");
if (!css.includes(".discovery-accordion") || !css.includes("cursor: pointer")) throw new Error("accordion styles are missing");
if (!discovery.includes("if (event.target.dataset.discoveryDelete) { state = removeCandidate")) throw new Error("discovery delete handler is missing");
if (discovery.includes('dataset.discoveryDelete && window.confirm(')) throw new Error("discovery delete confirmation remains");
if (!discovery.includes('document.querySelectorAll(".discovery-accordion").forEach((section)')) throw new Error("discovery accordion behavior is missing");
if (!script.includes("searchResults = []") || !script.includes("couponSearchResults = []") || !script.includes("rankingCategoryStates.clear()")) throw new Error("search clear state reset is incomplete");
if (!script.includes('generateRoomCopy(\'auto\')') || !script.includes('generateRoomCopy(\'compare\')') || !script.includes('generateRoomCopy(\'classic\')')) throw new Error("ROOM copy generation modes are missing");
if (!script.includes('window.HistoryDisplay.getStoredValue(item, "itemCode")') || !script.includes('window.HistoryDisplay.getStoredValue(item, "shopName")') || !script.includes('window.HistoryDisplay.getProductUrl(item)') || !script.includes('window.HistoryDisplay.getStoredValue(item, "genreId")')) throw new Error("history cards must show saved product identifiers separately");
if (!script.includes('安全確認できないためリンクなし') || !script.includes('商品URL：未記録') || !appCss.includes('.history-product-identifiers')) throw new Error("history product URL safety and missing-field display are missing");
if (!script.includes('id="room-copy-builder"') || !script.includes('id="roomCopyResults"') || !script.includes('onclick="saveRoomCopyDraft()"') || !script.includes('id="startRoomPostFromDetail"') || !script.includes('disabled') || script.includes('saveRoomCopyDraft({ startAfterSave: true })')) throw new Error("ROOM copy save and separate post-start UI is missing or combined");
if (!script.includes('保存済み情報から文章を準備')) throw new Error("Candidate copy preparation must clearly use saved information without requiring a product-page visit");
if (!script.includes("ROOM_COPY_HOOKS") || !script.includes("商品名・カテゴリなど確認できる情報だけで") || !script.includes("商品を一意に照合できません")) throw new Error("ROOM copy hooks must allow evidence-limited copy while distinguishing insufficient information from product mismatch");
if (!html.includes('id="candidateStatusFilter"') || !html.includes('value="unposted" selected>未投稿') || !html.includes('value="review">確認待ち') || !html.includes('value="all">すべて')) throw new Error("candidate list must default to unposted and offer review/all filters");
if (html.includes('id="start-sequential-processing"') || html.includes('id="start-sequential-posting"') || html.includes('id="sequential-processing-count"') || html.includes('id="reset-room-candidates"')) throw new Error("legacy queue controls or bulk candidate reset remain in the UI");
if (!script.includes('items.map(candidateCardCompact)') || !script.includes('function candidateCardCompact(item)') || !script.includes('詳細を開く') || !script.includes('data-candidate-id="${escapeAttr(item.id)}"')) throw new Error("candidate cards must be compact with an expandable detail view and stable identity");
if (!script.includes('role="alertdialog" aria-label="候補削除の確認"')
    || !script.includes('function cancelCandidateDeletion()')
    || !script.includes('function confirmCandidateDeletion(id)')
    || !script.includes('candidateDeleteConfirmationId !== id')
    || script.includes('window.confirm(`「${candidate.title || candidate.product?.itemName')) {
  throw new Error("candidate deletion must require a visible, explicit in-page confirmation and must not use an auto-accepted native dialog");
}
if (!candidateList.includes('function filterRoomCandidates') || !script.includes('window.CandidateListView.filterRoomCandidates')) throw new Error("candidate list filters must use the testable view helper");
if (!html.includes('<details class="panel codex-room-command-panel"') || !html.includes('id="codex-room-command-form"') || !html.includes('id="codex-room-command"') || !script.includes('handleCodexRoomCommandSubmit')) throw new Error("Codex bridge must remain available in a collapsed, natively operable details panel");
if (!html.includes('ROOMの完了とアプリの履歴保存を確認した後に、次の投稿可能候補を改めて選択します。')
    || html.includes('開始時点の投稿可能候補を固定')) throw new Error("Codex bridge help text must describe one-item-at-a-time dynamic candidate selection");
if (!script.includes('startSequentialProcessing("continuous", requestedCount, { source: "codex-prompt", candidateId: first.id })')
    || !script.includes('const requestedCount = parsed.requestedCount || eligible.length')) throw new Error("Codex prompt bridge must use an explicit success target or the current eligible count");
if (html.includes('room-processing-diagnostics') || html.includes('room-processing-state.js') || /data\.pendingRoomPost|completePendingRoomPost/.test(script)) throw new Error("pending state or its diagnostic UI remains active");
if (!html.includes('src/core/room-sequential-queue.js') || !script.includes('startDynamicRoomPostCandidate(candidate, run)')
    || !script.includes('getEligibleRoomCandidates(data.candidates, data.history)')) throw new Error("continuous posting must dynamically select the next eligible candidate by saved order and history");
if (!script.includes('searchResults = filterAvailableProducts(products)') || !script.includes('products.push(...filterAvailableProducts(await fetchRankingCategory(')) throw new Error("normal and ranking results must share saved-candidate exclusion");
if (!script.includes('formatRoomQueueProgress(') || !roomQueue.includes('function formatRoomQueueProgress(queueState, eligibleCandidates = [], runtimeQueue = null, candidates = [])') || script.includes('(${position} / ${roomCandidates.length}件)')) throw new Error("queue progress must distinguish result-check-required candidates from validated live work");
if (!script.includes('formatRoomQueueSummary(\n      queueState, eligibleCandidates, activeRoomPostQueue, data.candidates)')
    || !roomQueue.includes('function formatRoomQueueSummary(queueState, eligibleCandidates = [], runtimeQueue = null, candidates = [])')
    || !roomQueue.includes('キュー完了（処理中なし）')
    || !roomQueue.includes('現在投稿可能 ${remaining}件')
    || !roomQueue.includes('保存上ACTIVE・実行状態未確認')) throw new Error("queue stats must distinguish completed queues from verified live work and persisted ACTIVE state");
if (!script.includes('prepareRoomCopyForPosting(candidate)') || !script.includes('const selected = chooseRoomIntroVariant(product, result.variants)') || !script.includes('紹介文の保存を確認できなかったため')) throw new Error("a missing ROOM introduction must be generated from verified features and saved before posting");
if (!script.includes('let activeRoomPostMode = "continuous"') || !script.includes('let activeRoomPostQueue = null')
    || !script.includes('async function startNextCandidate(id, mode = activeRoomPostMode, confirmedOutcome = "posted")')
    || !script.includes('startDynamicRoomPostCandidate(next, run)') || !script.includes('run.currentCandidateId === id')) throw new Error("continuous flow must reselect a unique candidate only after verifying prior candidate ID and itemCode");
if (!script.includes('連続処理を終了しました。成功 ${run.successCount}/${run.targetSuccesses}件。')
    || !script.includes('void startNextCandidate(item.id, "continuous")')) throw new Error("continuous flow must advance after success and stop at its successful-post target");
if (!html.includes('id="codex-room-command-form"') || !html.includes('id="codex-room-command"') || html.includes('id="codex-room-command-submit"') || !script.includes('Control＋Enter') && !html.includes('Control＋Enter')) throw new Error("visible prompt bridge must submit from keyboard without a hidden or extra start button");
if (!script.includes('handleCodexRoomCommandSubmit') || !script.includes('parseRequestedCount(prompt)') || !script.includes('hasExplicitPostingIntent(prompt)') || !script.includes('data.roomPostQueue = created.queue')) throw new Error("Codex prompt bridge must parse an optional count and explicit ROOM intent, then persist a bounded queue");
if (!roomBridge.includes('function parseRequestedCount(prompt = "")') || !roomBridge.includes('function canStartQueue(candidates = [], entries = [], previousQueue = null)') || !roomBridge.includes('function recordOutcome(queue, candidateId, itemCode, outcome, proof = {})')) throw new Error("Codex queue validation and result lifecycle helpers are missing");
if (!script.includes('confirmRoomOperationClosed') || !script.includes('roomOperationClosedAt') || !script.includes('roomOperationCloseReason')) throw new Error("unknown outcomes need a recorded ROOM operation closure before another queue can start");
if (script.includes('結果を確認・記録するまで同じキューの続行・新しいキューの開始はできません。')
    || !script.includes('投稿結果は未確定のまま保持されます。同じitemCodeの再投稿は禁止です。別商品の新規キューは、旧キューと候補ID・itemCodeの整合性、および他のROOM操作がないことを開始時に確認できた場合に限り開始できます。旧キューは再開しません。')) {
  throw new Error("closed unknown results must be described accurately: same-item retry remains blocked while a verified different-item queue can be checked and started independently");
}
if (!script.includes('confirmQueueCandidateUnpostable') || script.includes('removeClosedUnknownFromSuccessQueue')
    || !html.includes('ROOM操作終了を記録して旧キューを終了')
    || !script.includes('roomCodexBridge.releaseClosedUnknown')
    || !script.includes('別商品の処理は新しい指示から開始してください')) {
  throw new Error("unknown results must remain protected and closing the ROOM action must terminate, not resume, an old queue");
}
if (!html.includes('id="queue-stats"') || !html.includes('id="candidate-count-summary"') || !html.includes('id="stale-queue-recovery"') || !html.includes('id="refresh-latest-app"')) throw new Error("candidate and queue summaries, stale-queue recovery, and safe cache refresh controls must be present");
if (!html.includes('id="stop-room-queue-only"') || !html.includes('キューを終了（次候補へ進まない）')
    || !html.includes('キューだけを終了') || !script.includes('function stopRoomQueueOnly()')
    || !script.includes('on("#stop-room-queue-only", "click", stopRoomQueueOnly)')) {
  throw new Error("a dedicated queue-only stop action must be available without advancing or changing candidate state");
}
const queueOnlyStopSource = script.slice(script.indexOf("function stopRoomQueueOnly()"), script.indexOf("function resetRoomCandidates()"));
if (queueOnlyStopSource.includes("startNextCandidate(") || queueOnlyStopSource.includes("confirmRoomOperationClosed(")
    || queueOnlyStopSource.includes("roomAttempt =") || queueOnlyStopSource.includes("postStatus =")
    || queueOnlyStopSource.includes("data.history =") || queueOnlyStopSource.includes("data.candidates =")) {
  throw new Error("queue-only stop must not start a next item, confirm ROOM closure, or mutate candidate/history state");
}
if (!html.includes('src/core/room-sequential-queue.js?v=room-2.7.1.4-queue-progress-separated-result-20261016')
    || !html.includes('script.js?v=dynamic-room-step-20261016')) throw new Error("queue and ROOM-copy assets must use their expected cache identifiers");
if (!script.includes('function getPostableRoomCandidates()')
    || !script.includes('updateCandidateViewCounts(postableCandidates)')
    || !script.includes('getDisplayedRoomCandidates(postableCandidates)')
    || !script.includes('textContent = postableCandidates.length')
    || !script.includes('postableCandidates: new Set(postableCandidates)')
    || !script.includes('summarizeRoomCandidates')) {
  throw new Error("candidate badge, unposted filter, and summary must share the exact queue-eligible candidate snapshot");
}
if (!script.includes('onclick="beginPreparedRoomOperation(')
    || !script.includes('onclick="cancelPreparedRoomQueue(')
    || !script.includes('投稿準備・候補ID・itemCodeまたは履歴を照合できないため、ROOM操作を開始しません。')
    || !script.includes('nextCandidate.roomAttempt = attempt')
    || !script.includes('candidate.postStatus = "投稿準備済み"')) {
  throw new Error("ROOM attempts must begin only through the explicit identity-checked UI; prepared work must be safely cancellable");
}
if (!script.includes('const visibleCandidates = new Set(postableCandidates)')
    || !script.includes('visibleCandidates.add(candidate)')
    || !script.includes('roomCodexBridge.isSavedQueueConsistent(queue, data.candidates)')) {
  throw new Error("a verified prepared candidate must remain visible in the unposted view without inflating the postable count");
}
if (!roomQueue.includes('結果不明保留 ${queueState.unknownCount || 0}件')) throw new Error("queue status must distinguish unresolved results from confirmed failure and deletion");
if (!html.includes('queue-recovery-20261016')) throw new Error("static assets need a shared cache-busting identifier");
if (!script.includes('function reloadLatestAppWithoutClearingData()') || !script.includes('url.searchParams.set("app-refresh"') || script.includes('function reloadLatestAppWithoutClearingData() {\n  localStorage.clear')) throw new Error("latest-version refresh must change the navigation URL without clearing saved data");
if (!appCss.includes('@media (max-width: 720px)') || !appCss.includes('.queue-status-panel { min-width: 0; overflow-wrap: anywhere; }')) throw new Error("queue stats must remain readable at mobile widths");
if (!script.includes('activeRoomPostMode = postMode') || !script.includes('queued.candidateId !== id || queued.itemCode !== itemCode')) throw new Error("posting start must match the selected candidate ID and exact itemCode");
const markPostedSource = script.slice(script.indexOf("function markPosted(id,"), script.indexOf("function generateCandidatePrompt(id)"));
if (markPostedSource.indexOf("recordRoomPosting(item)") < 0 || markPostedSource.indexOf("void startNextCandidate(item.id, activeRoomPostQueue.mode)") < markPostedSource.indexOf("recordRoomPosting(item)")) throw new Error("successful history recording must precede continuous queue advancement");
if (!markPostedSource.includes("findPostedHistoryRecord(item)") || !script.includes("同じitemCodeの投稿履歴があるため、再投稿を停止しました。") || !markPostedSource.includes('roomCompletionConfirmed: true') || !markPostedSource.includes('historySaved: true')) throw new Error("posted history duplicate protection and persisted result gate are missing");
if (!script.includes("投稿結果不明として再投稿せず停止してください")) throw new Error("unknown post outcome must stop without reposting");
if (!script.includes('prepareRoomCopyForPosting(candidate)') || !script.includes('buildRoomIntroVariants(product)') || !script.includes('同じitemCodeの投稿履歴があるため、再投稿を停止しました。')) throw new Error("Missing ROOM intro must use the existing safe generator and duplicate-history guard inline");
if (!script.includes('get("room-copy-test") === "1"') || !script.includes('sessionStorage.setItem(ROOM_COPY_SANDBOX_STORAGE_KEY, serialized)')) throw new Error("Local-only isolated product-copy test mode is missing");
if (!script.includes('if (isRoomCopySandboxMode()) {\n    return { ok: false') || !script.includes('テスト文面を隔離保存')) throw new Error("Sandbox mode does not block normal data writes or expose isolated save UI");
if (!script.includes('document.body.classList.add("room-copy-sandbox-mode")') || script.includes("document.body.innerHTML = `")) throw new Error("Sandbox mode must preserve the normal app DOM");
if (!script.includes('id = "roomCopySandboxRoot"') || !script.includes('href="${escapeAttr(location.pathname + location.hash)}"') || !script.includes("[data-room-copy-candidate-id]")) throw new Error("Sandbox needs a separate root, return link, and delegated product-selection handler");
if (!script.includes('$("#room-copy-builder")?.scrollIntoView({ behavior: "smooth", block: "start" })')) throw new Error("Selecting a real product must bring the copy-generation UI into view");
if (!appCss.includes('body.room-copy-sandbox-mode > nav') || !appCss.includes('main:not(#roomCopySandboxRoot)')) throw new Error("Sandbox styles must isolate the test UI without removing the normal app shell");
console.log("UI controls cases: passed");
