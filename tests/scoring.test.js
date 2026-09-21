const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const context = {
  console,
  URLSearchParams,
  Intl,
  Date,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Set,
  Map,
  RegExp,
  JSON,
  Promise,
  setTimeout,
  clearTimeout,
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { innerHTML: "", textContent: "" }; } },
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch: async () => { throw new Error("fetch is not used in scoring tests"); },
  window: {}
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.__scoring = { calculateSelectionScore, calculateTrendSelectionScore, calculateTrendFitScore, calculateTrendOpportunityScore, calculateRankingScore, getSelectionTotal, trendSelectionGrade, checkProductTrust, getRankingPageForRange, applyOfficialRankingRank, createSnsPosts, buildSnsPrompt, buildCombinedSnsPrompt, buildCombinedContentPrompt, parseCombinedContentResult, validateCombinedSnsLinks, validateSnsPostText, parseSnsPostsResult, validateSnsPostsResult, applySnsPostsToItem, isLikelyRoomUrl, getRoomUrlNotice, data };`, context);

const scoring = context.__scoring;
scoring.data.eventSettings = {};
const keyword = "iPhone 18 Pro ケース";
const base = { matchedTrendKeywords: [keyword], itemPrice: 1980, reviewAverage: 4.5, reviewCount: 1200, itemCaption: "MagSafe対応", itemUrl: "https://example.com/item" };
const trend = (itemName, extra = {}) => scoring.calculateTrendSelectionScore({ ...base, itemName, ...extra }, { matchedTrendKeywords: [keyword], postedIdentities: new Set(), queuedIdentities: new Set() });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const caseA = trend("iPhone18Pro ケース MagSafe対応");
assert(caseA.selectionScore.trendFit >= 27, "A: exact model and product type should score high");
const caseB = trend("iPhone18Pro ガラスフィルム");
assert(caseB.selectionScore.trendFit < caseA.selectionScore.trendFit && caseB.selectionScore.trendFit >= 12, "B: related accessory should be lower but relevant");
const caseC = trend("Android用スマホケース");
assert(caseC.selectionScore.trendFit <= 6, "C: unrelated model should score low");
const caseD = trend("iPhone18Pro ケース", { saleInfo: { coupon: "20%OFFクーポン", discountRate: 20, salePeriod: "本日限定" }, coupon: "20%OFFクーポン", discountRate: 20 });
assert(caseD.selectionScore.opportunity >= 13, "D: strong purchase timing should score high");
const caseE = trend("iPhone18Pro ケース", { reviewAverage: 0, reviewCount: 0, releaseDate: "2026-09-19" });
assert(caseE.selectionScore.reviewEvidence >= 6, "E: new strong-match products should not be heavily penalized");
const caseF = { ...base, itemName: "iPhone18Pro ケース", itemCaption: "超高速 最強", itemUrl: "https://example.com/item" };
const trustF = scoring.checkProductTrust(caseF);
assert(trustF.trustStatus !== "通常投稿候補" || trustF.needsManualReview === false, "F: trust check remains independent");
const regularBefore = scoring.calculateSelectionScore({ sourceRank: 1, itemPrice: 1980, categoryName: "家電", reviewAverage: 4.5, reviewCount: 1200, itemName: "通常商品", itemUrl: "https://example.com/item" }, { postedIdentities: new Set(), queuedIdentities: new Set() });
const regularAfter = scoring.calculateSelectionScore({ sourceRank: 1, itemPrice: 1980, categoryName: "家電", reviewAverage: 4.5, reviewCount: 1200, itemName: "通常商品", itemUrl: "https://example.com/item" }, { postedIdentities: new Set(), queuedIdentities: new Set() });
assert(regularBefore.selectionScore.total === regularAfter.selectionScore.total && scoring.calculateRankingScore({ sourceRank: 1 }) === 30, "G: regular ranking score remains unchanged");
assert(caseD.selectionScore.total >= 70, "H: strong trend product should be at least a strong candidate");
assert(caseB.selectionScore.trendFit !== caseA.selectionScore.trendFit, "I: accessory type mismatch must not equal exact case match");
assert(caseA.selectionScore.total === scoring.getSelectionTotal(caseA) && caseA.selectionScore.total <= 100, "J: trend score is one 100-point total without duplicate priority add-on");

const rankingRanges = [
  [1, 1], [6, 1], [11, 1], [16, 1], [21, 1], [26, 1],
  [31, 2], [36, 2], [41, 2], [46, 2]
];
rankingRanges.forEach(([start, expectedPage]) => assert(scoring.getRankingPageForRange(start) === expectedPage, `ranking page: ${start} should use page ${expectedPage}`));
const page2First = scoring.applyOfficialRankingRank({ itemName: "page2 first", rank: 31 });
assert(page2First.rank === 31 && page2First.apiRank === 31 && page2First.sourceRank === 31, "E: page 2 official rank remains 31");
assert(scoring.calculateRankingScore(page2First) === 10, "E: rank 31 is not scored as rank 1");
const sparseRanks = [31, 32, 34, 35].map((rank) => scoring.applyOfficialRankingRank({ rank }));
assert(sparseRanks.length === 4 && sparseRanks.map((item) => item.rank).join(",") === "31,32,34,35", "F: ranking gaps are preserved");
const unknownRank = scoring.applyOfficialRankingRank({ itemName: "unknown" });
assert(unknownRank.rank === null && unknownRank.apiRank === null && unknownRank.sourceRank === null, "safe handling: missing API rank is not guessed");

const snsItem = { title: "軽量トートバッグ", price: 2490, shopName: "毎日バッグ研究所", categoryName: "日用品・生活雑貨", usageStatus: "unknown", introText: "A4対応で便利そうなトートバッグです。", hashTags: "#楽天ROOM", roomUrl: "" };
const xPrompt = scoring.buildSnsPrompt(snsItem, "x", "info");
const threadsPrompt = scoring.buildSnsPrompt(snsItem, "threads", "problem");
assert(xPrompt.includes("X向け") && xPrompt.includes("最初の1〜2行"), "SNS: X rules are included");
assert(threadsPrompt.includes("Threads向け") && threadsPrompt.includes("会話調"), "SNS: Threads rules are included");
assert(xPrompt !== threadsPrompt, "SNS: media prompts differ");
assert(xPrompt.includes("使用経験・断定を絶対に書かない") && xPrompt.includes("ROOM個別URL未設定"), "SNS: unused and missing URL safety rules");
assert(!scoring.buildSnsPrompt({ ...snsItem, usageStatus: "unknown" }, "x", "experience").includes("usageStatusはused。"), "SNS: unused item cannot use experience rule");
assert(scoring.buildCombinedSnsPrompt({ ...snsItem, snsPosts: scoring.createSnsPosts() }).includes("【X】") && scoring.buildCombinedSnsPrompt({ ...snsItem, snsPosts: scoring.createSnsPosts() }).includes("【Threads】"), "SNS: combined prompt includes both media");
assert(scoring.createSnsPosts().x.postType === "discovery" && scoring.createSnsPosts().threads.postType === "problem", "SNS: defaults are independent from ROOM postType");
const problemPrompt = scoring.buildSnsPrompt(snsItem, "threads", "problem");
const discoveryPrompt = scoring.buildSnsPrompt(snsItem, "x", "discovery");
assert(problemPrompt.includes("日常の具体的な小さな困りごと") && problemPrompt.includes("私は困っていました") && problemPrompt.includes("実体験を作らない"), "SNS problem: concrete daily difficulty and no fabricated experience rules");
assert(discoveryPrompt.includes("発見性の高い特徴を1つ") && discoveryPrompt.includes("冒頭のフック候補"), "SNS discovery: distinctive feature hook rule");
const roomUrl = "https://room.rakuten.co.jp/room_b51fcf8b3c/1700393916418208";
const withRoomUrl = { ...snsItem, roomUrl };
assert(scoring.buildSnsPrompt(withRoomUrl, "x", "discovery").includes(roomUrl), "SNS URL: X prompt includes saved ROOM URL");
assert(scoring.buildSnsPrompt(withRoomUrl, "threads", "problem").includes(roomUrl), "SNS URL: Threads prompt includes saved ROOM URL");
const withRoomUrlCombinedPrompt = scoring.buildCombinedContentPrompt({ ...withRoomUrl, snsPosts: scoring.createSnsPosts() });
assert(withRoomUrlCombinedPrompt.includes(roomUrl) && withRoomUrlCombinedPrompt.includes("X_POST") && withRoomUrlCombinedPrompt.includes("THREADS_POST"), "SNS URL: combined prompt includes saved ROOM URL for both posts");
assert(scoring.buildCombinedSnsPrompt({ ...withRoomUrl, snsPosts: scoring.createSnsPosts() }).includes("===X_POST===") && scoring.buildCombinedSnsPrompt({ ...withRoomUrl, snsPosts: scoring.createSnsPosts() }).includes("===END_THREADS_POST==="), "SNS workflow: combined SNS prompt uses X and Threads markers");
assert(scoring.buildSnsPrompt(withRoomUrl, "x", "discovery").includes("必ず1回だけそのまま記載") && scoring.buildSnsPrompt(withRoomUrl, "threads", "problem").includes("省略・変更・短縮・推測は禁止"), "SNS URL: individual prompts require the exact URL once");
assert(withRoomUrlCombinedPrompt.includes("X_POSTとTHREADS_POSTの両方") && withRoomUrlCombinedPrompt.includes("1回だけそのまま記載"), "SNS URL: combined prompt requires the exact URL in both posts");
assert(withRoomUrlCombinedPrompt.includes("変動する可能性") && withRoomUrlCombinedPrompt.includes("現在有効であることが確認できない場合"), "SNS sale: changing sale data must not be asserted without confirmation");
const validLinkResult = { xText: `本文\n${roomUrl}\n#PR`, threadsText: `本文\n${roomUrl}\n#PR` };
assert(scoring.validateCombinedSnsLinks(withRoomUrl, validLinkResult) === "", "SNS URL: both generated posts contain the exact URL once");
assert(scoring.validateCombinedSnsLinks(withRoomUrl, { xText: "本文", threadsText: "本文" }).includes("1回ずつ"), "SNS URL: missing URL in generated posts is rejected");
const missingUrlPrompt = scoring.buildSnsPrompt(snsItem, "x", "discovery");
assert(missingUrlPrompt.includes("投稿本文には「ROOM個別URL未設定」という文言を書かず") && missingUrlPrompt.includes("URL部分を省略"), "SNS URL: missing URL is omitted from generated post");
assert(scoring.validateCombinedSnsLinks(snsItem, { xText: "本文", threadsText: "本文" }) === "" && scoring.validateCombinedSnsLinks(snsItem, { xText: "ROOM個別URL未設定", threadsText: "本文" }).includes("URL導線"), "SNS URL: missing URL does not create placeholder text");
assert(scoring.isLikelyRoomUrl(roomUrl) && !scoring.isLikelyRoomUrl("https://example.com/item"), "SNS URL: format check");
assert(scoring.getRoomUrlNotice({ postStatus: "投稿済み", roomUrl: "" })[0].includes("未登録"), "SNS URL: posted item without URL is clearly indicated");
assert(scoring.getRoomUrlNotice({ postStatus: "投稿待ち", roomUrl: "" })[0].includes("商品個別URLを入力"), "SNS workflow: URL is requested before registration");
const xPromptWithUrl = scoring.buildSnsPrompt(withRoomUrl, "x", "discovery");
assert(xPromptWithUrl.includes("140文字以内") && xPromptWithUrl.includes("改行を含む"), "SNS workflow: X prompt includes the full 140-character limit");
const threadsPromptWithUrl = scoring.buildSnsPrompt(withRoomUrl, "threads", "problem");
assert(!threadsPromptWithUrl.includes("140文字以内"), "SNS workflow: Threads has no X character limit");
const shortX = `発見ポイント\n${roomUrl}\n#PR`;
const shortThreads = `困りごとから紹介\n${roomUrl}\n#PR`;
assert(scoring.validateSnsPostText(withRoomUrl, "x", shortX) === "", "SNS workflow: valid X text passes URL, PR, and length checks");
assert(scoring.validateSnsPostText(withRoomUrl, "threads", shortThreads) === "", "SNS workflow: valid Threads text passes URL and PR checks");
assert(scoring.validateSnsPostText(withRoomUrl, "x", `${"あ".repeat(141)}\n${roomUrl}\n#PR`).includes("/140"), "SNS workflow: overlong X text is rejected");
assert(scoring.validateSnsPostText(withRoomUrl, "x", "本文\n#PR").includes("ROOM個別URL"), "SNS workflow: X without saved URL is rejected");
assert(scoring.validateSnsPostText(withRoomUrl, "x", `本文\n${roomUrl}`).includes("#PR"), "SNS workflow: X without PR disclosure is rejected");
assert(scoring.validateSnsPostText(withRoomUrl, "threads", `本文\n${roomUrl}\n#PR\n${roomUrl}`).includes("1回だけ"), "SNS workflow: duplicate Threads URL is rejected");
const snsOnlyResult = scoring.parseSnsPostsResult(`===X_POST===\n${shortX}\n===END_X_POST===\n===THREADS_POST===\n${shortThreads}\n===END_THREADS_POST===`);
assert(snsOnlyResult.xText === shortX && snsOnlyResult.threadsText === shortThreads && scoring.validateSnsPostsResult(withRoomUrl, snsOnlyResult) === "", "SNS workflow: X and Threads result format parses and validates");
assert(scoring.validateSnsPostsResult(withRoomUrl, { xText: "本文\n#PR", threadsText: shortThreads }).includes("ROOM個別URL"), "SNS workflow: incomplete X result is rejected without overwrite");
const preservedCopyItem = { ...withRoomUrl, introText: "保存済みROOM紹介文", hashTags: "#保存済み", snsPosts: scoring.createSnsPosts() };
scoring.applySnsPostsToItem(preservedCopyItem, snsOnlyResult);
assert(preservedCopyItem.introText === "保存済みROOM紹介文" && preservedCopyItem.hashTags === "#保存済み" && preservedCopyItem.snsPosts.x.text === shortX && preservedCopyItem.snsPosts.threads.text === shortThreads, "SNS workflow: SNS-only apply preserves ROOM copy and hashtags");
const combinedItem = { ...snsItem, snsPosts: { x: { postType: "info" }, threads: { postType: "problem" } } };
const combinedPrompt = scoring.buildCombinedContentPrompt(combinedItem);
assert(combinedPrompt.includes("ROOM紹介文") && combinedPrompt.includes("ROOMハッシュタグ") && combinedPrompt.includes("X投稿文") && combinedPrompt.includes("Threads投稿文"), "SNS combined: all four generation instructions are included");
assert(combinedPrompt.includes("===ROOM_INTRO===") && combinedPrompt.includes("===END_ROOM_INTRO===") && combinedPrompt.includes("===END_THREADS_POST==="), "SNS combined: machine-readable output markers are included");
assert(combinedPrompt.includes("情報型（info）") && combinedPrompt.includes("困りごと型（problem）"), "SNS combined: independent post types are included");
assert(combinedPrompt.includes("使用経験・断定を絶対に書かない") && combinedPrompt.includes("ROOM個別URL未設定"), "SNS combined: unused and missing URL safety rules");
const combinedResult = scoring.parseCombinedContentResult(`===ROOM_INTRO===\n紹介文です。\n===END_ROOM_INTRO===\n===ROOM_HASHTAGS===\n#タグ1 #タグ2\n===END_ROOM_HASHTAGS===\n===X_POST===\nX本文です。\n===END_X_POST===\n===THREADS_POST===\nThreads本文です。\n===END_THREADS_POST===`);
assert(combinedResult.introText === "紹介文です。" && combinedResult.hashTags === "#タグ1 #タグ2" && combinedResult.xText === "X本文です。" && combinedResult.threadsText === "Threads本文です。", "SNS combined: four blocks parse correctly");
const invalidCombinedResult = scoring.parseCombinedContentResult("===ROOM_INTRO===\n紹介文だけ\n===END_ROOM_INTRO===");
assert(!invalidCombinedResult.hashTags && !invalidCombinedResult.xText && !invalidCombinedResult.threadsText, "SNS combined: incomplete result is rejected");

console.log(JSON.stringify({
  caseA: { trendFit: caseA.selectionScore.trendFit, opportunity: caseA.selectionScore.opportunity, total: caseA.selectionScore.total },
  caseB: { trendFit: caseB.selectionScore.trendFit, opportunity: caseB.selectionScore.opportunity, total: caseB.selectionScore.total },
  caseC: { trendFit: caseC.selectionScore.trendFit, opportunity: caseC.selectionScore.opportunity, total: caseC.selectionScore.total },
  caseD: { trendFit: caseD.selectionScore.trendFit, opportunity: caseD.selectionScore.opportunity, total: caseD.selectionScore.total },
  caseE: { trendFit: caseE.selectionScore.trendFit, reviewEvidence: caseE.selectionScore.reviewEvidence, total: caseE.selectionScore.total },
  regularRankingOne: regularBefore.selectionScore.total
}, null, 2));
console.log("scoring cases A-J and ranking page cases: passed");
