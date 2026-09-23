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
  crypto: { randomUUID: () => "test-uuid" },
  setTimeout,
  clearTimeout,
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { innerHTML: "", textContent: "" }; } },
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch: async () => { throw new Error("fetch is not used in scoring tests"); },
  window: {}
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.__scoring = { calculateSelectionScore, calculateTrendSelectionScore, calculateTrendFitScore, calculateTrendOpportunityScore, calculateRankingScore, getSelectionTotal, trendSelectionGrade, checkProductTrust, getRankingPageForRange, applyOfficialRankingRank, createSnsPosts, buildSnsPrompt, buildThreadsPerformancePrompt, buildThreadsOnlyCodexInstructions, buildCombinedSnsPrompt, buildCombinedContentPrompt, buildSnsCodexInstructions, canStartSnsCodex, parseCombinedContentResult, validateCombinedSnsLinks, validateSnsPostText, parseSnsPostsResult, validateSnsPostsResult, applySnsPostsToItem, isLikelyRoomUrl, getRoomUrlNotice, findPostedHistoryRecord, recordRoomPosting, normalizeSnsRecords, normalizeRakutenItems, addAffiliateIdParam, getThreadsLink, isValidAffiliateShortUrl, isThreadsOnlyItem, isRoomCandidate, createThreadsOnlyCandidate, buildThreadsOnlyDraft, ensureThreadsOnlyDraft, validateThreadsOnlyResult, applyThreadsOnlyResultToItem, getCouponEvidence, matchesCouponDiscountFilter, prepareCouponSearchProduct, getCouponDisplayState, getImage, getPerformanceAudienceGuidance, getPerformanceAudience, getPerformanceProductFeature, getPerformanceBenefitLine, data };`, context);

const scoring = context.__scoring;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
scoring.data.eventSettings = {};
const noAffiliateParams = new URLSearchParams({ format: "json" });
scoring.data.settings.affiliateId = "";
scoring.addAffiliateIdParam(noAffiliateParams);
assert(!noAffiliateParams.has("affiliateId"), "Affiliate A: missing affiliateId keeps the request unchanged");
const affiliateParams = new URLSearchParams({ format: "json" });
scoring.data.settings.affiliateId = "test-affiliate-id";
scoring.addAffiliateIdParam(affiliateParams);
assert(affiliateParams.get("affiliateId") === "test-affiliate-id", "Affiliate B: configured affiliateId is added to requests");
const wrappedAffiliate = scoring.normalizeRakutenItems({ Items: [{ Item: { itemName: "商品", itemUrl: "https://example.com/item", affiliateUrl: "https://hb.afl.rakuten.co.jp/xyz" }, affiliateUrl: "https://hb.afl.rakuten.co.jp/outer" }] });
assert(wrappedAffiliate[0].itemName === "商品" && wrappedAffiliate[0].affiliateUrl === "https://hb.afl.rakuten.co.jp/xyz", "Affiliate C: API affiliateUrl is preserved from the item payload");
scoring.data.settings.affiliateId = "";
const keyword = "iPhone 18 Pro ケース";
const base = { matchedTrendKeywords: [keyword], itemPrice: 1980, reviewAverage: 4.5, reviewCount: 1200, itemCaption: "MagSafe対応", itemUrl: "https://example.com/item" };
const trend = (itemName, extra = {}) => scoring.calculateTrendSelectionScore({ ...base, itemName, ...extra }, { matchedTrendKeywords: [keyword], postedIdentities: new Set(), queuedIdentities: new Set() });
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

// Threads限定投稿: same storage, explicit destination, no ROOM coupling.
const threadsOnlyProduct = { itemCode: "threads-only-1", itemName: "50%OFF収納ケース", itemPrice: 1980, shopName: "生活ショップ", categoryName: "日用品・生活雑貨", itemUrl: "https://example.com/threads-only", saleInfo: { discountRate: 50, coupon: "50%OFFクーポン", salePeriod: "2026-09-24 01:59まで" } };
const threadsOnlyCandidate = scoring.createThreadsOnlyCandidate(threadsOnlyProduct, "threads-only-candidate");
assert(scoring.isRoomCandidate({}) && !scoring.isThreadsOnlyItem({}), "Threads-only A: legacy records remain ROOM candidates");
assert(scoring.isThreadsOnlyItem(threadsOnlyCandidate) && !scoring.isRoomCandidate(threadsOnlyCandidate), "Threads-only B: destination separates the Threads-only candidate");
assert(threadsOnlyCandidate.snsPosts.threads.threadsPostType === "performance_v1" && !threadsOnlyCandidate.roomUrl, "Threads-only C/E: no ROOM URL is required and performance mode is default");
const threadsOnlyPrompt = scoring.buildThreadsPerformancePrompt(threadsOnlyCandidate);
assert(threadsOnlyPrompt.includes("誰向け") && threadsOnlyPrompt.includes("どんなお得") && threadsOnlyPrompt.includes("期限・今見る理由"), "Threads-only E: performance prompt is reused");
assert(threadsOnlyPrompt.includes("50%OFFクーポン") && threadsOnlyPrompt.includes("2026-09-24 01:59まで"), "Threads-only K: only stored sale facts are used");

const affiliateLongUrl = "https://hb.afl.rakuten.co.jp/hgc/example";
const affiliateShortUrl = "https://a.r10.to/AbCd12";
const shortUrlCandidate = scoring.createThreadsOnlyCandidate({ ...threadsOnlyProduct, affiliateUrl: affiliateLongUrl }, "short-url-candidate");
shortUrlCandidate.affiliateShortUrl = affiliateShortUrl;
shortUrlCandidate.snsPosts.threads.performanceUrlMode = "reply";
const shortUrlDraft = scoring.buildThreadsOnlyDraft(shortUrlCandidate);
assert(scoring.isValidAffiliateShortUrl(affiliateShortUrl), "Short URL G: official a.r10.to URL is accepted");
assert(!scoring.isValidAffiliateShortUrl("https://bit.ly/example") && !scoring.isValidAffiliateShortUrl("https://item.rakuten.co.jp/example"), "Short URL F: external and product URLs are rejected");
assert(scoring.getThreadsLink(shortUrlCandidate) === affiliateShortUrl, "Short URL A: short URL has priority over affiliateUrl");
assert(!shortUrlDraft.text.includes(affiliateShortUrl) && shortUrlDraft.replyText.includes(affiliateShortUrl) && shortUrlDraft.replyText.split(affiliateShortUrl).length === 2, "Short URL D/E: parent omits URL and reply uses short URL once");
const fallbackCandidate = scoring.createThreadsOnlyCandidate({ ...threadsOnlyProduct, affiliateUrl: affiliateLongUrl }, "fallback-url-candidate");
fallbackCandidate.snsPosts.threads.performanceUrlMode = "reply";
assert(scoring.getThreadsLink(fallbackCandidate) === affiliateLongUrl && scoring.buildThreadsOnlyDraft(fallbackCandidate).replyText.includes(affiliateLongUrl), "Short URL B: affiliateUrl remains the fallback");
const noUrlCandidate = scoring.createThreadsOnlyCandidate(threadsOnlyProduct, "no-url-candidate");
noUrlCandidate.snsPosts.threads.performanceUrlMode = "reply";
assert(scoring.getThreadsLink(noUrlCandidate) === "" && scoring.buildThreadsOnlyDraft(noUrlCandidate).replyText === "", "Short URL C: missing URLs are not invented");
assert(scoring.normalizeSnsRecords([{ ...shortUrlCandidate }])[0].affiliateShortUrl === affiliateShortUrl, "Short URL J/L: normalization preserves optional short URL and legacy records remain loadable");
const threadsOnlyCodex = scoring.buildThreadsOnlyCodexInstructions(threadsOnlyCandidate);
assert(threadsOnlyCodex.includes("楽天アフィリエイトURL未取得") && threadsOnlyCodex.includes("ROOM URL取得、X文章作成は行いません"), "Threads-only URL: missing affiliate URL is explicit and no ROOM URL is generated");
const threadsOnlyText = "セール商品を探している人へ\n50%OFFクーポンあり\n期間：2026-09-24 01:59まで\n#PR";
scoring.applyThreadsOnlyResultToItem(threadsOnlyCandidate, { threadsText: threadsOnlyText, threadsReplyText: "" });
assert(scoring.validateThreadsOnlyResult(threadsOnlyCandidate, { threadsText: threadsOnlyText, threadsReplyText: "" }) === "" && threadsOnlyCandidate.threadsStatus === "確認待ち", "Threads-only: text is saved and enters confirmation wait");
assert(!threadsOnlyCandidate.introText && !threadsOnlyCandidate.hashTags, "Threads-only J: ROOM intro and hashtags are untouched");
assert(scoring.isRoomCandidate({ id: "legacy-record", itemCode: "legacy" }), "Threads-only H: legacy data without destination restores as ROOM");
const backupRoundTrip = JSON.parse(JSON.stringify(scoring.normalizeSnsRecords([threadsOnlyCandidate, { id: "legacy", itemCode: "legacy", snsPosts: {} }])));
assert(backupRoundTrip[0].destination === "threads_only" && backupRoundTrip[0].snsPosts.threads.threadsPostType === "performance_v1" && backupRoundTrip[1].destination === "room", "Threads-only L: JSON backup/restore preserves the new destination and legacy default");
const replyCandidate = scoring.createThreadsOnlyCandidate(threadsOnlyProduct, "threads-only-reply");
replyCandidate.snsPosts.threads.performanceUrlMode = "reply";
assert(scoring.validateThreadsOnlyResult(replyCandidate, { threadsText: "お得情報です\n#PR", threadsReplyText: "" }) === "", "Threads-only: reply mode remains available without affiliate URL");
const affiliateUrl = "https://hb.afl.rakuten.co.jp/xyz123";
const threadsOnlyWithAffiliate = scoring.createThreadsOnlyCandidate({ ...threadsOnlyProduct, affiliateUrl }, "threads-only-affiliate");
assert(threadsOnlyWithAffiliate.affiliateUrl === affiliateUrl && threadsOnlyWithAffiliate.product.affiliateUrl === affiliateUrl, "Affiliate D: Threads-only candidate preserves affiliateUrl");
const affiliatePrompt = scoring.buildThreadsPerformancePrompt(threadsOnlyWithAffiliate);
assert(affiliatePrompt.includes("楽天アフィリエイトURL") && affiliatePrompt.includes(affiliateUrl) && affiliatePrompt.includes("楽天アフィリエイトURLと#PRを含む"), "Affiliate F: performance prompt uses affiliateUrl, not ROOM URL");
const affiliateText = `お得情報です\n${affiliateUrl}\n#PR`;
assert(scoring.validateThreadsOnlyResult(threadsOnlyWithAffiliate, { threadsText: affiliateText, threadsReplyText: "" }) === "", "Affiliate E: Threads-only body validates the exact affiliateUrl");
threadsOnlyWithAffiliate.snsPosts.threads.performanceUrlMode = "reply";
assert(scoring.validateThreadsOnlyResult(threadsOnlyWithAffiliate, { threadsText: "お得情報です\n#PR", threadsReplyText: `商品はこちら\n${affiliateUrl}` }) === "", "Affiliate I: reply mode validates the exact affiliateUrl");
assert(scoring.validateThreadsOnlyResult(threadsOnlyWithAffiliate, { threadsText: "お得情報です\n#PR", threadsReplyText: "商品はこちら" }).includes("アフィリエイトURL"), "Affiliate I: reply mode rejects missing affiliateUrl");

const autoDraftCandidate = scoring.createThreadsOnlyCandidate({ itemName: "ナイキ トレーニングバッグ", categoryName: "スポーツ・アウトドア", itemPrice: 6160, itemUrl: "https://example.com/bag", affiliateUrl, couponCandidate: true, discountRate: 50, rateConfirmed: false, discountRateType: "unknown" }, "auto-draft");
autoDraftCandidate.snsPosts.threads.performanceUrlMode = "reply";
assert(scoring.ensureThreadsOnlyDraft(autoDraftCandidate) === true, "Auto draft A: registration creates a Threads draft");
assert(autoDraftCandidate.snsPosts.threads.text.includes("荷物を整理して持ち歩きたい人") && autoDraftCandidate.snsPosts.threads.text.includes("#PR"), "Auto draft B: audience and PR marker are included");
assert(!autoDraftCandidate.snsPosts.threads.text.includes("50%OFF"), "Auto draft C: unconfirmed discount is not asserted");
assert(autoDraftCandidate.snsPosts.threads.replyText.includes(affiliateUrl) && autoDraftCandidate.snsPosts.threads.replyText.split(affiliateUrl).length - 1 === 1, "Auto draft D: affiliateUrl is included exactly once in reply");
const noAffiliateDraft = scoring.createThreadsOnlyCandidate({ itemName: "収納ボックス", categoryName: "インテリア", itemUrl: "https://example.com/box" }, "no-affiliate-draft");
noAffiliateDraft.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(noAffiliateDraft);
assert(!noAffiliateDraft.snsPosts.threads.replyText.includes("http") && !noAffiliateDraft.snsPosts.threads.replyText.includes("ROOM"), "Auto draft E: missing affiliateUrl does not create a guessed reply URL");
const confirmedDraft = scoring.createThreadsOnlyCandidate({ itemName: "収納チェスト", categoryName: "インテリア", itemUrl: "https://example.com/chest", affiliateUrl, couponCandidate: true, discountRate: 50, rateConfirmed: true, discountRateType: "exact" }, "confirmed-draft");
confirmedDraft.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(confirmedDraft);
assert(confirmedDraft.snsPosts.threads.replyText.includes("50%OFFクーポン対象はこちら"), "Auto draft F: confirmed discount can be used in reply");
const confirmedDeadlineDraft = scoring.createThreadsOnlyCandidate({ itemName: "収納チェスト", categoryName: "インテリア", itemUrl: "https://example.com/chest", affiliateUrl, couponCandidate: true, discountRate: 50, rateConfirmed: true, discountRateType: "exact", couponDeadline: "2026/09/24 01:59", deadlineConfirmed: true }, "confirmed-deadline-draft");
confirmedDeadlineDraft.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(confirmedDeadlineDraft);
assert(confirmedDeadlineDraft.snsPosts.threads.text.includes("50%OFFクーポン対象") && confirmedDeadlineDraft.snsPosts.threads.text.includes("9/24 1:59まで。"), "Performance A: confirmed discount and deadline are used in the parent post");
assert(!confirmedDeadlineDraft.snsPosts.threads.text.includes("お得情報を確認できる商品") && !confirmedDeadlineDraft.snsPosts.threads.text.includes("商品ページで確認してから判断したい"), "Performance H: confirmed facts do not fall back to internal confirmation wording");
const confirmedRateNoDeadline = scoring.createThreadsOnlyCandidate({ itemName: "収納チェスト", categoryName: "インテリア", itemUrl: "https://example.com/chest", affiliateUrl, couponCandidate: true, discountRate: 50, rateConfirmed: true, discountRateType: "exact", couponDeadline: "2026/09/24 01:59", deadlineConfirmed: false }, "confirmed-rate-only-draft");
confirmedRateNoDeadline.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(confirmedRateNoDeadline);
assert(confirmedRateNoDeadline.snsPosts.threads.text.includes("50%OFFクーポン対象") && !confirmedRateNoDeadline.snsPosts.threads.text.includes("まで。") && !confirmedRateNoDeadline.snsPosts.threads.text.includes("期限は商品ページで確認"), "Performance B: unconfirmed deadline is omitted without explanatory filler");
const unconfirmedDraft = scoring.createThreadsOnlyCandidate({ itemName: "収納チェスト", categoryName: "インテリア", itemUrl: "https://example.com/chest", affiliateUrl, couponCandidate: true, discountRate: 50, rateConfirmed: false, discountRateType: "unknown", couponDeadline: "2026/09/24 01:59", deadlineConfirmed: false }, "unconfirmed-draft");
unconfirmedDraft.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(unconfirmedDraft);
assert(!unconfirmedDraft.snsPosts.threads.text.includes("50%OFF") && !unconfirmedDraft.snsPosts.threads.text.includes("期限") && !unconfirmedDraft.snsPosts.threads.replyText.includes("50%OFF"), "Performance C: unconfirmed rate and deadline are not asserted");
assert(confirmedDeadlineDraft.snsPosts.threads.replyText.split(affiliateUrl).length - 1 === 1 && !confirmedDeadlineDraft.snsPosts.threads.text.includes(affiliateUrl), "Performance D/F: reply mode keeps the URL only in the comment once");
const shortConfirmedDraft = scoring.createThreadsOnlyCandidate({ itemName: "収納チェスト", categoryName: "インテリア", itemUrl: "https://example.com/chest", affiliateUrl, affiliateShortUrl: "https://a.r10.to/shortConfirmed", couponCandidate: true, discountRate: 50, rateConfirmed: true, discountRateType: "exact" }, "short-confirmed-draft");
shortConfirmedDraft.affiliateShortUrl = "https://a.r10.to/shortConfirmed";
shortConfirmedDraft.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(shortConfirmedDraft);
assert(shortConfirmedDraft.snsPosts.threads.replyText.includes("https://a.r10.to/shortConfirmed") && !shortConfirmedDraft.snsPosts.threads.replyText.includes(affiliateUrl), "Performance D: short URL is preferred over the long affiliate URL");
const manualAudienceDraft = scoring.createThreadsOnlyCandidate({ itemName: "収納チェスト", categoryName: "インテリア", itemUrl: "https://example.com/chest", affiliateUrl, couponCandidate: true, discountRate: 50, rateConfirmed: true, discountRateType: "exact" }, "manual-audience-draft");
manualAudienceDraft.snsPosts.threads.performanceAudience = "クローゼットの収納が足りない人";
manualAudienceDraft.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(manualAudienceDraft);
assert(manualAudienceDraft.snsPosts.threads.text.startsWith("クローゼットの収納が足りない人へ。"), "Performance G: manual audience is prioritized");
const normalizedAutoDraft = scoring.normalizeSnsRecords([{ ...autoDraftCandidate, snsPosts: { ...autoDraftCandidate.snsPosts, threads: { ...autoDraftCandidate.snsPosts.threads, text: "", replyText: "" } } }])[0];
assert(normalizedAutoDraft.snsPosts.threads.text && normalizedAutoDraft.snsPosts.threads.replyText.includes(affiliateUrl) && normalizedAutoDraft.threadsStatus === "確認待ち", "Auto draft G: empty legacy Threads candidate is filled on reload");

// Threads成果型 Ver.1: existing normal records remain normal and the new mode is isolated.
const performanceItem = {
  ...withRoomUrl,
  itemName: "iPhone18Pro ケース",
  title: "iPhone18Pro ケース",
  categoryName: "スマートフォン・タブレット",
  saleInfo: { discountRate: 50, coupon: "50%OFFクーポン", salePeriod: "2026-09-24 01:59まで" },
  snsPosts: scoring.createSnsPosts({ threads: { postType: "problem", threadsPostType: "performance_v1" } })
};
assert(scoring.createSnsPosts({ threads: { postType: "problem" } }).threads.threadsPostType === "normal", "Performance A: legacy Threads records default to normal");
const performancePrompt = scoring.buildThreadsPerformancePrompt(performanceItem);
assert(performancePrompt.includes("誰向け") && performancePrompt.includes("どんなお得") && performancePrompt.includes("期限・今見る理由"), "Performance B: prompt includes the three-part structure");
assert(scoring.buildSnsPrompt(performanceItem, "threads", "problem") === performancePrompt, "Performance B: Threads prompt route uses the selected performance mode");
assert(performancePrompt.includes("50%OFFクーポン") && performancePrompt.includes("2026-09-24 01:59まで") && performancePrompt.includes(roomUrl), "Performance C: verified sale facts and exact ROOM URL are included");
const noSalePrompt = scoring.buildThreadsPerformancePrompt({ ...performanceItem, saleInfo: {}, roomUrl: "" });
assert(noSalePrompt.includes("確認済みのセール情報なし") && noSalePrompt.includes("期限が確認できない場合") && !noSalePrompt.includes("50%OFF"), "Performance D: unavailable discount and deadline are not invented");
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
scoring.data.eventSettings = { enabled: true, eventName: "テストイベント", startDate: today, endDate: tomorrow };
const eventPrompt = scoring.buildThreadsPerformancePrompt(performanceItem);
assert(eventPrompt.includes("テストイベント") && eventPrompt.includes(today), "Performance E: active eventSettings can be used with dates");
scoring.data.eventSettings = {};
const bodyPerformance = { ...performanceItem, snsPosts: scoring.createSnsPosts({ threads: { threadsPostType: "performance_v1", performanceUrlMode: "body" } }) };
const bodyThreads = `iPhone18を買った人へ\n50%OFFクーポンあり\n${roomUrl}\n#PR`;
assert(scoring.validateSnsPostsResult(bodyPerformance, { xText: shortX, threadsText: bodyThreads }) === "", "Performance F: body mode requires exact URL once and #PR");
const replyPerformance = { ...performanceItem, snsPosts: scoring.createSnsPosts({ threads: { threadsPostType: "performance_v1", performanceUrlMode: "reply" } }) };
assert(scoring.buildCombinedSnsPrompt(replyPerformance).includes("===THREADS_REPLY===") && scoring.buildSnsCodexInstructions(replyPerformance).includes("===THREADS_REPLY==="), "Performance F: combined and Codex prompts include the reply block");
const replyThreads = "iPhone18を買った人へ\n50%OFFクーポンあり\n#PR";
const replyResult = scoring.parseSnsPostsResult(`===X_POST===\n${shortX}\n===END_X_POST===\n===THREADS_POST===\n${replyThreads}\n===END_THREADS_POST===\n===THREADS_REPLY===\n商品はこちら\n${roomUrl}\n===END_THREADS_REPLY===`);
assert(scoring.validateSnsPostsResult(replyPerformance, replyResult) === "", "Performance G: reply mode validates body and exact URL in reply");
const appliedPerformance = { ...replyPerformance, introText: "保存済み紹介文", hashTags: "#保存済み" };
scoring.applySnsPostsToItem(appliedPerformance, replyResult);
assert(appliedPerformance.introText === "保存済み紹介文" && appliedPerformance.hashTags === "#保存済み" && appliedPerformance.snsPosts.threads.replyText === `商品はこちら\n${roomUrl}`, "Performance H: apply preserves ROOM text and stores reply text");
scoring.data.eventSettings = {};

assert(!scoring.canStartSnsCodex({ roomUrl: "" }), "SNS Codex: cannot start before ROOM URL registration");
assert(scoring.canStartSnsCodex(withRoomUrl), "SNS Codex: can start after valid ROOM URL registration");
const snsCodexInstructions = scoring.buildSnsCodexInstructions({ ...withRoomUrl, itemCode: "shop:iphone-case", snsPosts: scoring.createSnsPosts() });
assert(snsCodexInstructions.includes("ITEM_CODE：shop:iphone-case") && snsCodexInstructions.includes(roomUrl), "SNS Codex: itemCode and exact ROOM URL are included");
assert(snsCodexInstructions.includes("発見性の高い特徴") && snsCodexInstructions.includes("日常の具体的な小さな困りごと"), "SNS Codex: X discovery and Threads problem rules are included");
assert(snsCodexInstructions.includes("140文字以内") && snsCodexInstructions.includes("#PRは必須"), "SNS Codex: X length and PR rules are included");
assert(snsCodexInstructions.includes("使用経験を作らない") && snsCodexInstructions.includes("現在有効であることが確認できない場合"), "SNS Codex: unused and changing-sale safety rules are included");
assert(snsCodexInstructions.includes("===X_POST===") && snsCodexInstructions.includes("===END_THREADS_POST==="), "SNS Codex: direct result markers are included");
const preservedCopyItem = { ...withRoomUrl, introText: "保存済みROOM紹介文", hashTags: "#保存済み", snsPosts: scoring.createSnsPosts() };
scoring.applySnsPostsToItem(preservedCopyItem, snsOnlyResult);
assert(preservedCopyItem.introText === "保存済みROOM紹介文" && preservedCopyItem.hashTags === "#保存済み" && preservedCopyItem.snsPosts.x.text === shortX && preservedCopyItem.snsPosts.threads.text === shortThreads, "SNS workflow: SNS-only apply preserves ROOM copy and hashtags");

scoring.data.candidates = [];
scoring.data.history = [];
scoring.data.sales = [{ id: "sale-keep", historyId: "history-existing" }];
const roomPostingCandidate = { id: "candidate-room", itemCode: "shop:iphone-case", status: "文章作成済み", postStatus: "投稿待ち", roomUrl: "", snsPosts: scoring.createSnsPosts() };
scoring.data.candidates.push(roomPostingCandidate);
const firstHistory = scoring.recordRoomPosting(roomPostingCandidate, { roomUrl, postedAt: "2026-09-22T10:00:00.000Z" });
assert(roomPostingCandidate.status === "投稿済み" && roomPostingCandidate.postStatus === "投稿済み", "ROOM URL registration: candidate becomes posted");
assert(firstHistory.roomUrl === roomUrl && firstHistory.postedAt === "2026-09-22T10:00:00.000Z" && scoring.data.history.length === 1, "ROOM URL registration: URL and postedAt are stored in one history record");
const originalPostedAt = firstHistory.postedAt;
scoring.recordRoomPosting(roomPostingCandidate, { roomUrl });
assert(scoring.data.history.length === 1 && scoring.data.history[0].postedAt === originalPostedAt, "ROOM URL registration: repeated completion does not duplicate history or reset postedAt");
scoring.data.history[0].id = "history-existing";
const sameItemLegacyCandidate = { id: "legacy-candidate", itemCode: "shop:iphone-case", status: "投稿待ち", postStatus: "投稿待ち", roomUrl: "", snsPosts: scoring.createSnsPosts() };
scoring.recordRoomPosting(sameItemLegacyCandidate, { roomUrl });
assert(scoring.data.history.length === 1 && scoring.data.history[0].id === "history-existing" && scoring.data.history[0].itemCode === "shop:iphone-case", "ROOM URL registration: exact itemCode updates the existing history identity");
assert(scoring.data.sales.length === 1 && scoring.data.sales[0].historyId === "history-existing", "ROOM URL registration: existing sales linkage is unchanged");
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

// Threads限定のお得商品検索: 検索ヒットは候補であり、割引・期限の確認済み状態を分離する。
const confirmed70 = scoring.prepareCouponSearchProduct({ itemCode: "coupon-70", itemName: "収納用品 50%OFF候補", itemUrl: "https://example.com/70", affiliateUrl: "https://hb.afl.rakuten.co.jp/70", discountRate: 70, rateConfirmed: true, discountRateType: "exact", couponDeadline: "2026/09/24 01:59まで", deadlineConfirmed: true }, ["50plus"]);
const unconfirmed70 = scoring.prepareCouponSearchProduct({ itemCode: "coupon-max", itemName: "割引クーポン候補", itemUrl: "https://example.com/max", discountRate: 70, rateConfirmed: false, discountRateType: "up_to" }, ["50plus"]);
assert(scoring.matchesCouponDiscountFilter(confirmed70, ["50plus"]), "Coupon A/E: confirmed 70% matches 50%以上");
assert(scoring.matchesCouponDiscountFilter({ ...confirmed70, discountRate: 50 }, ["50"]), "Coupon B: confirmed exact 50% matches 50% option");
assert(scoring.matchesCouponDiscountFilter({ ...confirmed70, discountRate: 40 }, ["40"]), "Coupon C: confirmed exact 40% matches 40% option");
assert(!scoring.matchesCouponDiscountFilter(unconfirmed70, ["50plus"]), "Coupon F: up-to/unconfirmed discount is not treated as an exact confirmed rate");
assert(!scoring.matchesCouponDiscountFilter({ ...confirmed70, rateConfirmed: false }, ["50plus"]), "Coupon G: unconfirmed discount is excluded from confirmed filtering");
const couponCandidate = scoring.createThreadsOnlyCandidate(confirmed70, "coupon-candidate");
couponCandidate.couponCandidate = true;
couponCandidate.snsPosts.threads.performanceUrlMode = "reply";
const couponPrompt = scoring.buildThreadsPerformancePrompt(couponCandidate);
assert(couponPrompt.includes("70") && couponPrompt.includes("THREADS_REPLY") && couponPrompt.includes("楽天アフィリエイトURL"), "Coupon E/J/L: confirmed rate, reply mode, and affiliate link are represented");
const unconfirmedPrompt = scoring.buildThreadsPerformancePrompt(scoring.createThreadsOnlyCandidate(unconfirmed70, "coupon-unconfirmed"));
assert(unconfirmedPrompt.includes("確認済みのセール情報なし") && !unconfirmedPrompt.includes("70%OFF"), "Coupon F/G: unconfirmed rate is not asserted in performance prompt");
const legacyCandidate = scoring.createThreadsOnlyCandidate({ ...confirmed70, couponCandidate: false }, "coupon-legacy");
assert(legacyCandidate.snsPosts.threads.performanceUrlMode === "body", "Existing Threads-only records retain the legacy body URL mode");
assert(scoring.getPerformanceAudienceGuidance({ itemName: "チェスト 収納", itemCaption: "クローゼット用" }).includes("クローゼットの収納が足りない人"), "Performance audience: storage context is concrete");
assert(!scoring.getPerformanceAudienceGuidance({ itemName: "用途不明の商品" }).includes("具体的な利用場面または小さな困りごとを1つ選ぶ"), "Performance audience: fallback is post-ready text, not an instruction");
const wagyuProduct = { itemName: "★50%OFF！19日20:00〜24日01:59★ 国産 秋田県産 黒毛和牛 特上 サーロイン ステーキ 400g", itemCaption: "A4/A5ランク 送料無料", categoryName: "食品" };
assert(scoring.getPerformanceAudience(wagyuProduct) === "自宅でちょっと贅沢なステーキを楽しみたい人", "Performance audience: generic audience is replaced with a concrete food use case");
assert(scoring.getPerformanceProductFeature(wagyuProduct).includes("秋田県産の黒毛和牛サーロイン400g"), "Performance feature: food product facts are summarized without using unconfirmed sale text");
const staleDraft = scoring.createThreadsOnlyCandidate({ itemName: "用途不明の商品", affiliateUrl }, "stale-draft");
staleDraft.snsPosts.threads.text = "商品情報から、具体的な利用場面または小さな困りごとを1つ選ぶ（根拠がなければ人間が修正する）へ。\n\n対象は返信に👇\n#PR";
staleDraft.snsPosts.threads.replyText = "保存済みの返信\n#PR";
const repairedDraft = scoring.normalizeSnsRecords([staleDraft])[0];
assert(!repairedDraft.snsPosts.threads.text.includes("具体的な利用場面または小さな困りごとを1つ選ぶ") && repairedDraft.snsPosts.threads.replyText === "保存済みの返信\n#PR", "Performance stale draft: instruction text is repaired without overwriting the saved reply");
const performanceReplyPrompt = scoring.buildThreadsPerformancePrompt({ ...couponCandidate, snsPosts: scoring.createSnsPosts({ threads: { threadsPostType: "performance_v1", performanceUrlMode: "reply" } }) });
assert(performanceReplyPrompt.includes("広すぎる表現は避ける") && performanceReplyPrompt.includes("対象は返信に👇") && performanceReplyPrompt.includes("親投稿にURLを書かず"), "Performance audience/reply: concrete audience and parent-to-reply guidance are included");
assert(performanceReplyPrompt.includes("rateConfirmed===true") && performanceReplyPrompt.includes("deadlineConfirmed===true"), "Performance facts: only confirmed discount and deadline may be stated");
const wagyuUnconfirmed = scoring.createThreadsOnlyCandidate({ ...wagyuProduct, affiliateUrl, rateConfirmed: false, discountRate: 50, discountRateType: "unknown", deadlineConfirmed: false, couponDeadline: "2026/09/24 01:59" }, "wagyu-unconfirmed");
wagyuUnconfirmed.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(wagyuUnconfirmed);
assert(wagyuUnconfirmed.snsPosts.threads.text.includes("自宅でちょっと贅沢なステーキを楽しみたい人へ。") && wagyuUnconfirmed.snsPosts.threads.text.includes("秋田県産の黒毛和牛サーロイン400g") && !wagyuUnconfirmed.snsPosts.threads.text.includes("50%OFF") && !wagyuUnconfirmed.snsPosts.threads.text.includes("期限は"), "Performance A/J: unconfirmed sale facts are omitted while product features remain");
assert(wagyuUnconfirmed.snsPosts.threads.replyText.startsWith("商品はこちら👇") && !wagyuUnconfirmed.snsPosts.threads.replyText.includes("お得情報はこちら👇"), "Performance comment: unconfirmed discount uses a neutral product label");
const wagyuConfirmed = scoring.createThreadsOnlyCandidate({ ...wagyuProduct, affiliateUrl, rateConfirmed: true, discountRate: 50, discountRateType: "exact", deadlineConfirmed: true, couponDeadline: "2026/09/24 01:59" }, "wagyu-confirmed");
wagyuConfirmed.snsPosts.threads.performanceUrlMode = "reply";
scoring.ensureThreadsOnlyDraft(wagyuConfirmed);
assert(wagyuConfirmed.snsPosts.threads.text.includes("50%OFF") && wagyuConfirmed.snsPosts.threads.text.includes("9/24 1:59まで。") && !wagyuConfirmed.snsPosts.threads.text.includes("お得情報を確認できる商品"), "Performance B/H: confirmed discount and deadline are natural, not internal-status wording");
assert(wagyuConfirmed.snsPosts.threads.replyText.startsWith("50%OFFクーポン対象はこちら👇"), "Performance comment: confirmed discount keeps the confirmed-rate label");

// 統合探索画面向けの商品カード表示データと保存区分。
const imageProduct = { itemCode: "image-1", itemName: "画像付き商品", itemPrice: 1200, itemUrl: "https://example.com/image", mediumImageUrls: [{ imageUrl: "https://example.com/image.jpg" }], affiliateUrl: "https://hb.afl.rakuten.co.jp/image" };
const noImageProduct = { itemCode: "image-2", itemName: "画像なし商品", itemPrice: 800, itemUrl: "https://example.com/no-image" };
const confirmedDisplay = scoring.getCouponDisplayState({ ...imageProduct, discountRate: 50, rateConfirmed: true, discountRateType: "exact" });
const unconfirmedDisplay = scoring.getCouponDisplayState({ ...noImageProduct, discountRate: 50, rateConfirmed: false, discountRateType: "unknown" });
assert(confirmedDisplay.imageAvailable && confirmedDisplay.imageUrl === "https://example.com/image.jpg", "Coupon UI G: existing mediumImageUrls are reused");
assert(unconfirmedDisplay.imageAvailable === false && unconfirmedDisplay.rateLabel === "50%OFF候補" && !unconfirmedDisplay.rateConfirmed, "Coupon UI H/N: missing image and unconfirmed rate are safe");
assert(confirmedDisplay.rateLabel === "50%OFF確認済み" && confirmedDisplay.affiliateUrlAvailable, "Coupon UI O/M: confirmed rate and affiliate URL are shown as available");
const roomSaved = scoring.createThreadsOnlyCandidate(imageProduct, "threads-ui");
assert(roomSaved.destination === "threads_only" && roomSaved.snsPosts.threads.threadsPostType === "performance_v1", "Coupon UI K/L: Threads save remains separated and performance_v1");
assert(scoring.normalizeSnsRecords([{ ...roomSaved }, { itemCode: "legacy-room" }])[1].destination === "room", "Coupon UI P: legacy records default to ROOM");

console.log(JSON.stringify({
  caseA: { trendFit: caseA.selectionScore.trendFit, opportunity: caseA.selectionScore.opportunity, total: caseA.selectionScore.total },
  caseB: { trendFit: caseB.selectionScore.trendFit, opportunity: caseB.selectionScore.opportunity, total: caseB.selectionScore.total },
  caseC: { trendFit: caseC.selectionScore.trendFit, opportunity: caseC.selectionScore.opportunity, total: caseC.selectionScore.total },
  caseD: { trendFit: caseD.selectionScore.trendFit, opportunity: caseD.selectionScore.opportunity, total: caseD.selectionScore.total },
  caseE: { trendFit: caseE.selectionScore.trendFit, reviewEvidence: caseE.selectionScore.reviewEvidence, total: caseE.selectionScore.total },
  regularRankingOne: regularBefore.selectionScore.total
}, null, 2));
console.log("scoring, ranking page, and Threads-only cases A-L: passed");
