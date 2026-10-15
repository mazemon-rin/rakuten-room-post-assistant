const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
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
if (!html.includes("shopCode検索も最大30件") || !script.includes("対象商品未発見")) throw new Error("diagnostic must distinguish a successful search from target item discovery");
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
if (!script.includes('id="room-copy-builder"') || !script.includes('id="roomCopyResults"') || !script.includes('saveRoomCopyDraft({ startAfterSave: true })')) throw new Error("ROOM copy selection, results, or save/start UI is missing");
if (!script.includes("ROOM_COPY_HOOKS") || !script.includes("確認済みの商品特徴がありません")) throw new Error("ROOM copy hook definitions or minimum-evidence guidance are missing");
if (!html.includes('id="start-sequential-processing"') || !html.includes("確認モードで次の候補を準備") || !html.includes('id="start-sequential-posting"') || !script.includes('startSequentialProcessing("continuous")')) throw new Error("ROOM confirmation and explicitly selected continuous modes are missing");
if (!script.includes('openDetailByCandidate(id);') || !script.includes('紹介文が未作成です。確認済みの商品特徴から生成')) throw new Error("Missing ROOM intro does not route the user to copy generation");
if (!script.includes('get("room-copy-test") === "1"') || !script.includes('sessionStorage.setItem(ROOM_COPY_SANDBOX_STORAGE_KEY, serialized)')) throw new Error("Local-only isolated product-copy test mode is missing");
if (!script.includes('if (isRoomCopySandboxMode()) {\n    return { ok: false') || !script.includes('テスト文面を隔離保存')) throw new Error("Sandbox mode does not block normal data writes or expose isolated save UI");
if (!script.includes('document.body.classList.add("room-copy-sandbox-mode")') || script.includes("document.body.innerHTML = `")) throw new Error("Sandbox mode must preserve the normal app DOM");
if (!script.includes('id = "roomCopySandboxRoot"') || !script.includes('href="${escapeAttr(location.pathname + location.hash)}"') || !script.includes("[data-room-copy-candidate-id]")) throw new Error("Sandbox needs a separate root, return link, and delegated product-selection handler");
if (!script.includes('$("#room-copy-builder")?.scrollIntoView({ behavior: "smooth", block: "start" })')) throw new Error("Selecting a real product must bring the copy-generation UI into view");
if (!appCss.includes('body.room-copy-sandbox-mode > nav') || !appCss.includes('main:not(#roomCopySandboxRoot)')) throw new Error("Sandbox styles must isolate the test UI without removing the normal app shell");
console.log("UI controls cases: passed");
