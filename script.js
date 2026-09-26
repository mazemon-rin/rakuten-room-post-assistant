const STORAGE_KEY = "roomAssistantDataV1";
const RANKING_INTERVAL_SHORT_MS = 1200;
const RANKING_INTERVAL_LONG_MS = 1800;
const RANKING_RETRY_SAFETY_MARGIN_MS = 200;
const RANKING_MAX_RETRIES = 1;
const RANKING_REQUEST_TIMEOUT_MS = 15000;
const SELECTION_SCORE_VERSION = "2.7.1";
const APP_VERSION = "2.7.1.2";
const RECOMMENDATION_TITLE_MAX_LENGTH = 40;
const TREND_KEYWORD_MAX = 5;
const TREND_PRODUCTS_PER_KEYWORD = 5;
const TREND_RESULT_COUNT_OPTIONS = [5, 10, 20];
const OPPORTUNITY_CONFIG = Object.freeze({ priceBands: [[1000, 1999, 6], [2000, 4999, 5], [5000, 9999, 4], [10000, 29999, 3], [30000, Infinity, 1], [0, 999, 2]] });
const SELECTION_SCORE_CONFIG = Object.freeze({
  ranking: 30, reviewRating: 20, reviewCount: 20, price: 15, category: 10, freshness: 5,
  categories: { "食品": 10, "美容・コスメ・香水": 10, "日用品・生活雑貨": 8, "キッチン用品・食器・調理器具": 8, "インテリア・寝具・収納": 8, "スポーツ・アウトドア": 8, "ベビー・キッズ・マタニティ": 8, "ペット・ペットグッズ": 8, "家電": 5, "パソコン・周辺機器": 5 }
});
// 既存UIの内訳表示との互換用。新しい選定スコアは上記設定を正本とします。
const SELECTION_SCORING = Object.freeze({ click: 30, problem: 20, purchase: 15, trust: 15, roomFit: 10, season: 10 });
const COLLECTIONS = Object.freeze([
  { id: "pre_purchase_check", name: "🔍 買う前に確認したい商品", type: "warning", enabled: true }
]);

// These top-level Rakuten market categories were verified from Rakuten category pages.
const rankingCategories = [
  { id: "562637", name: "家電" },
  { id: "100026", name: "パソコン・周辺機器" },
  { id: "100554", name: "日用品・生活雑貨" },
  { id: "558944", name: "キッチン用品・食器・調理器具" },
  { id: "100227", name: "食品" },
  { id: "100939", name: "美容・コスメ・香水" },
  { id: "100804", name: "インテリア・寝具・収納" },
  { id: "101070", name: "スポーツ・アウトドア" },
  { id: "100533", name: "ベビー・キッズ・マタニティ" },
  { id: "101213", name: "ペット・ペットグッズ" }
];

const sampleProducts = [
  {
    itemName: "大容量モバイルバッテリー 10000mAh USB-C対応",
    itemPrice: 2980,
    shopName: "くらし便利ショップ",
    reviewAverage: 4.42,
    reviewCount: 1260,
    postageFlag: 1,
    itemCaption: "通勤、旅行、防災用にも使いやすい薄型モバイルバッテリーです。USB-C入出力に対応。",
    itemUrl: "https://www.rakuten.co.jp/",
    affiliateUrl: "",
    itemCode: "sample-shop:mobilebattery-001",
    genreId: "564500",
    mediumImageUrls: [{ imageUrl: "https://placehold.co/600x450/f4d7c8/24302f?text=Battery" }]
  },
  {
    itemName: "軽量トートバッグ A4収納 洗える シンプルデザイン",
    itemPrice: 2490,
    shopName: "毎日バッグ研究所",
    reviewAverage: 4.31,
    reviewCount: 842,
    postageFlag: 1,
    itemCaption: "仕事、買い物、習い事に使いやすいA4対応トートバッグ。内ポケット付き。",
    itemUrl: "https://www.rakuten.co.jp/",
    affiliateUrl: "",
    itemCode: "sample-shop:tote-002",
    genreId: "110933",
    mediumImageUrls: [{ imageUrl: "https://placehold.co/600x450/cfe5dc/24302f?text=Tote" }]
  },
  {
    itemName: "ステンレス保温マグ 350ml ふた付き",
    itemPrice: 1880,
    shopName: "キッチン日和",
    reviewAverage: 4.55,
    reviewCount: 531,
    postageFlag: 0,
    itemCaption: "デスクや自宅時間で使いやすい、ふた付きの保温マグです。落ち着いたカラー展開。",
    itemUrl: "https://www.rakuten.co.jp/",
    affiliateUrl: "",
    itemCode: "sample-shop:mug-003",
    genreId: "566157",
    mediumImageUrls: [{ imageUrl: "https://placehold.co/600x450/f6e3ab/24302f?text=Mug" }]
  }
];

// 信頼性チェックの回帰確認用。実際の検索結果や投稿候補には混ぜません。
const trustCheckTestCases = [
  {
    name: "大容量SSD・低価格・メーカー型番不明",
    product: {
      itemName: "8TB SSD 超高速 大容量",
      itemPrice: 3980,
      shopName: "テストショップ",
      itemCaption: "大容量で高速転送に対応。メーカー名、型番、保証内容の記載なし。",
      itemUrl: "https://www.rakuten.co.jp/",
      categoryName: "パソコン・周辺機器",
      reviewAverage: 4.8,
      reviewCount: 1200
    },
    expectedStatus: "注意喚起候補"
  }
];

const defaultData = {
  settings: {
    applicationId: "",
    accessKey: "",
    affiliateId: "",
    defaultTone: "やさしい",
    defaultEmoji: "少なめ",
    defaultTagCount: 8,
    rankingCategoryIds: []
  },
  candidates: [],
  history: [],
  pendingRoomPost: null,
  sales: [],
  favorites: [],
  trendSettings: { keywords: [], updatedAt: null },
  eventSettings: { eventName: "", startDate: "", endDate: "", enabled: false }
};

const SNS_POST_TYPES = Object.freeze({
  discovery: "発見型",
  problem: "困りごと型",
  info: "情報型",
  sale: "セール型",
  experience: "体験型"
});
const SNS_X_MAX_LENGTH = 140;
const DISCOUNT_RATES = Object.freeze([20, 30, 40, 50, 60, 70, 80, 90]);
function buildDiscountSearchTerms(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return [];
  return [`${value}%OFF`, `${value}％OFF`, `最大${value}%OFF`, `最大${value}％OFF`, `${value}%OFFクーポン`, `${value}％OFFクーポン`, `最大${value}%OFFクーポン`, `最大${value}％OFFクーポン`];
}
function buildDiscountSearchTermsForMinimum(minimum) {
  const threshold = Number(minimum);
  if (!Number.isFinite(threshold)) return [];
  return DISCOUNT_RATES.filter((rate) => rate >= threshold).flatMap(buildDiscountSearchTerms);
}
const COUPON_SEARCH_OPTIONS = Object.freeze(Object.fromEntries([
  ["10", { label: "10%以上", queries: ["10%OFF", "10％OFF", "10%OFFクーポン", "10％OFFクーポン", ...buildDiscountSearchTermsForMinimum(20)] }],
  ...DISCOUNT_RATES.map((rate) => [String(rate), { label: `${rate}%以上`, queries: buildDiscountSearchTermsForMinimum(rate) }]),
  ["50plus", { label: "50%以上", queries: buildDiscountSearchTermsForMinimum(50) }]
]));

function createSnsPosts(existing = {}) {
  const makePost = (post = {}, defaultType) => ({
    postType: post.postType || defaultType,
    text: typeof post.text === "string" ? post.text : "",
    prompt: typeof post.prompt === "string" ? post.prompt : "",
    status: post.status === "posted" ? "posted" : "draft",
    generatedAt: post.generatedAt || "",
    postedAt: post.postedAt || ""
  });
  return {
    x: makePost(existing.x, "discovery"),
    threads: {
      ...makePost(existing.threads, "problem"),
      threadsPostType: existing.threads?.threadsPostType === "performance_v1" ? "performance_v1" : "normal",
      performanceAudience: typeof existing.threads?.performanceAudience === "string" ? existing.threads.performanceAudience : "",
      performanceUrlMode: existing.threads?.performanceUrlMode === "reply" ? "reply" : "body",
      replyText: typeof existing.threads?.replyText === "string" ? existing.threads.replyText : ""
    }
  };
}

function getThreadsPostModeLabel(mode = "normal") {
  return mode === "performance_v1" ? "Threads成果型 Ver.1" : "通常Threads紹介文";
}

function normalizeSnsRecords(records = []) {
  return records.map((record) => {
    const normalized = { ...record, destination: record.destination === "threads_only" ? "threads_only" : "room", snsPosts: createSnsPosts(record.snsPosts) };
    if (isThreadsOnlyItem(normalized)) ensureThreadsOnlyDraft(normalized);
    return normalized;
  });
}

function isThreadsOnlyItem(item = {}) {
  return item.destination === "threads_only";
}

function isRoomCandidate(item = {}) {
  return !isThreadsOnlyItem(item);
}

let data = loadData();
let currentProduct = null;
let searchResults = [];
let couponSearchResults = [];
let couponVisibleCount = 30;
const couponSearchInputOverrides = new Map();
let rankingCategoryStates = new Map();
let rankingRequestContext = null;
let rankingRetryInProgress = false;
const codexPasteErrors = new Map();
let affiliateImportDraft = [];
let salesDashboardView = "all";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindForms();
  fillSettings();
  setProductSearchMode();
  renderAll();
});

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaultData, ...saved, candidates: normalizeSnsRecords(Array.isArray(saved?.candidates) ? saved.candidates : []), history: normalizeSnsRecords(Array.isArray(saved?.history) ? saved.history : []), sales: Array.isArray(saved?.sales) ? saved.sales : [], settings: { ...defaultData.settings, ...(saved?.settings || {}) }, trendSettings: { ...defaultData.trendSettings, ...(saved?.trendSettings || {}) }, eventSettings: { ...defaultData.eventSettings, ...(saved?.eventSettings || {}) } };
  } catch {
    return structuredClone(defaultData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
}

function bindTabs() {
  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });
}

function showTab(tabId) {
  $$(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  if (tabId === "dashboard") renderDashboard();
}

function bindForms() {
  $("#searchForm").addEventListener("submit", searchProducts);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#candidateFilter").addEventListener("input", renderCandidates);
  $("#candidateStatusFilter").addEventListener("change", renderCandidates);
  $("#reset-room-candidates")?.addEventListener("click", resetRoomCandidates);
  $$(".candidate-view-tab").forEach((button) => button.addEventListener("click", () => setCandidateView(button.dataset.candidateView)));
  $("#productSearchForm")?.addEventListener("submit", (event) => { event.preventDefault(); searchUnifiedProducts(); });
  $("#clearSearchConditions")?.addEventListener("click", clearSearchConditions);
  $("#openRaCoupon")?.addEventListener("click", () => window.open("https://event.rakuten.co.jp/coupon/", "_blank", "noopener,noreferrer"));
  $("#apply-codex-result").addEventListener("click", applyCodexResult);
  $("#historyFilter").addEventListener("input", renderHistory);
  $("#favoriteFilter").addEventListener("input", renderFavorites);
  $("#favoriteTypeFilter")?.addEventListener("change", renderFavorites);
  $("#calendarMonth").addEventListener("change", renderCalendar);
  $("#rankingForm").addEventListener("submit", loadRanking);
  $("#trendSearchForm")?.addEventListener("submit", (event) => { event.preventDefault(); searchTrendProducts(); });
  $("#rankingSortOrder").addEventListener("change", () => renderRankingResults(searchResults));
  $("#queue-selected-ranking").addEventListener("click", queueSelectedRanking);
  $("#start-sequential-processing").addEventListener("click", startSequentialProcessing);
  $("#retry-failed-ranking").addEventListener("click", retryFailedRanking);
  $$("input[name='unifiedCategory']").forEach((input) => input.addEventListener("change", saveRankingCategorySelection));
  $("#exportJson").addEventListener("click", exportJson);
  $("#importJson").addEventListener("change", importJson);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#exportSalesCsv").addEventListener("click", exportSalesCsv);
  $("#affiliateCsvInput").addEventListener("change", importAffiliateCsv);
  $("#saveAffiliateImport").addEventListener("click", saveAffiliateImport);
  $("#cancelAffiliateImport").addEventListener("click", closeAffiliateImport);
  $("#clearData").addEventListener("click", clearData);
}

function resetRoomCandidates() {
  const roomCount = data.candidates.filter(isRoomCandidate).length;
  if (!roomCount) {
    toast("リセット対象のROOM投稿候補はありません。");
    return;
  }
  if (!window.confirm(`ROOM投稿候補${roomCount}件を候補一覧からリセットします。投稿履歴・Threads候補・売上データは変更しません。`)) return;
  data.candidates = data.candidates.filter((item) => !isRoomCandidate(item));
  saveData();
  toast(`ROOM投稿候補${roomCount}件をリセットしました。`);
}

function setProductSearchMode() {
  const mode = $("input[name='productSearchMode']:checked")?.value || "ranking";
  const couponPanel = $("#couponSearchPanel");
  if (couponPanel) couponPanel.hidden = mode !== "coupon";
  const rankingCategoriesFieldset = $("#rankingForm .ranking-category-fieldset");
  if (rankingCategoriesFieldset) rankingCategoriesFieldset.hidden = mode === "coupon";
  const rankingGenre = $("#rankingGenreId")?.closest("label");
  const rankingRange = $("#rankingRangeStart")?.closest("label");
  if (rankingGenre) rankingGenre.hidden = mode === "coupon";
  if (rankingRange) rankingRange.hidden = mode === "coupon";
  ["queue-selected-ranking", "retry-failed-ranking"].forEach((id) => { const button = $(`#${id}`); if (button) button.hidden = mode === "coupon" || id === "retry-failed-ranking" && button.hidden; });
  const submitButton = $("#rankingForm button[type='submit']");
  if (submitButton) {
    submitButton.textContent = "ランキング取得";
    submitButton.hidden = mode === "coupon";
  }
}

function handleUnifiedProductSearch(event) {
  const mode = $("input[name='productSearchMode']:checked")?.value || "ranking";
  if (mode === "coupon") {
    event.preventDefault();
    searchCouponProducts();
    return;
  }
  loadRanking(event);
}

function setCandidateView(view) {
  const selectedView = view === "threads" ? "threads" : "room";
  $$(".candidate-view-tab").forEach((button) => {
    const active = button.dataset.candidateView === selectedView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$(".candidate-view-panel").forEach((panel) => {
    const active = panel.id === `candidate-${selectedView}-view`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function saveRankingCategorySelection() {
  data.settings.rankingCategoryIds = $$("input[name='unifiedCategory']:checked").map((input) => input.value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function fillSettings() {
  $("#applicationId").value = data.settings.applicationId || "";
  $("#accessKey").value = data.settings.accessKey || "";
  $("#affiliateId").value = data.settings.affiliateId || "";
  $("#defaultTone").value = data.settings.defaultTone;
  $("#defaultEmoji").value = data.settings.defaultEmoji;
  $("#defaultTagCount").value = data.settings.defaultTagCount;
  $("#eventEnabled").checked = Boolean(data.eventSettings?.enabled);
  $("#eventName").value = data.eventSettings?.eventName || "";
  $("#eventStartDate").value = data.eventSettings?.startDate || "";
  $("#eventEndDate").value = data.eventSettings?.endDate || "";
  if ($("#trendKeywords")) $("#trendKeywords").value = (data.trendSettings?.keywords || []).join("、");
  const selectedIds = data.settings.rankingCategoryIds || [];
  $$("input[name='unifiedCategory']").forEach((input) => {
    input.checked = selectedIds.includes(input.value);
  });
  $("#hits").value = data.settings.defaultHits || "10";
  $("#calendarMonth").value = new Date().toISOString().slice(0, 7);
}

async function searchProducts(event) {
  event.preventDefault();
  const message = $("#searchMessage");
  const keyword = $("#keyword").value.trim();
  message.textContent = "検索しています...";

  if (!hasRakutenCredentials()) {
    const filtered = sampleProducts.filter((product) => product.itemName.includes(keyword) || product.itemCaption.includes(keyword));
    renderResults(filtered.length ? filtered : sampleProducts);
    message.textContent = "楽天アプリIDまたはアクセスキーが未設定のため、サンプル商品を表示しています。";
    return;
  }

  const params = new URLSearchParams({
    format: "json",
    applicationId: data.settings.applicationId,
    accessKey: data.settings.accessKey,
    keyword,
    hits: $("#hits").value,
    sort: $("#sortOrder").value
  });
  addAffiliateIdParam(params);
  addParam(params, "minPrice", $("#minPrice").value);
  addParam(params, "maxPrice", $("#maxPrice").value);
  addParam(params, "reviewAverage", $("#minReview").value);
  addParam(params, "genreId", $("#genreId").value);

  try {
    const response = await fetch(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`);
    if (!response.ok) throw new Error(await readRakutenApiError(response));
    const json = await response.json();
    const products = normalizeRakutenItems(json);
    const excludeWords = $("#excludeWords").value.trim().split(/\s+/).filter(Boolean);
    const filtered = products.filter((product) => !excludeWords.some((word) => product.itemName.includes(word)));
    renderResults(filtered);
    message.textContent = `${filtered.length}件の商品を表示しました。`;
  } catch (error) {
    renderResults(sampleProducts);
    message.textContent = `${error.message} サンプル商品を表示します。`;
  }
}

function addParam(params, key, value) {
  if (value) params.set(key, value);
}

function hasRakutenCredentials() {
  return Boolean(data.settings.applicationId && data.settings.accessKey);
}

function addAffiliateIdParam(params) {
  const affiliateId = String(data.settings.affiliateId || "").trim();
  if (affiliateId) params.set("affiliateId", affiliateId);
  return params;
}

async function readRakutenApiError(response) {
  const fallback = `HTTP ${response.status}`;
  try {
    const raw = await response.text();
    if (!raw) return formatRakutenApiError(fallback);
    try {
      const errorBody = JSON.parse(raw);
      const detail = errorBody.error_description || errorBody.error || raw;
      return formatRakutenApiError(`${fallback}：${detail}`);
    } catch {
      return formatRakutenApiError(`${fallback}：${raw.slice(0, 240)}`);
    }
  } catch {
    return formatRakutenApiError(fallback);
  }
}

async function fetchRankingCategory(category, page = 1, fallbackWaitMs = RANKING_INTERVAL_SHORT_MS) {
  const params = new URLSearchParams({
    format: "json",
    applicationId: data.settings.applicationId,
    accessKey: data.settings.accessKey,
    page: String(page)
  });
  if (category.id) params.set("genreId", category.id);
  addAffiliateIdParam(params);
  const url = `https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601?${params.toString()}`;
  let retryCount = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RANKING_REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error.name === "AbortError") {
        throw createRankingApiError(408, "楽天ランキングAPIが15秒以内に応答しませんでした。", retryCount);
      }
      throw createRankingApiError(0, error.message || "楽天ランキングAPIへの接続に失敗しました。", retryCount);
    } finally {
      clearTimeout(timeoutId);
    }
    if (response.ok) {
      const json = await response.json();
      return normalizeRakutenItems(json);
    }
    const rawBody = await response.text().catch(() => "");
    if (response.status === 429 && retryCount < RANKING_MAX_RETRIES) {
      const waitMs = getRankingRetryWaitMs(response, rawBody, fallbackWaitMs);
      retryCount += 1;
      showRankingProgress(`${category.name}で429。${Math.ceil(waitMs / 1000)}秒待機して再試行...`);
      await sleep(waitMs);
      continue;
    }
    throw createRankingApiError(response.status, rawBody, retryCount);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRankingPageForRange(rankStart) {
  return Number(rankStart) >= 31 ? 2 : 1;
}

function getRankingPagesForRange(rankStart, count) {
  const start = Math.max(1, Number(rankStart) || 1);
  const end = Math.min(50, start + Math.max(1, Number(count) || 10) - 1);
  if (start <= 30 && end > 30) return [1, 2];
  return [start >= 31 ? 2 : 1];
}

function getRankingRange(rankStart, count) {
  const start = Math.max(1, Number(rankStart) || 1);
  return { start, end: Math.min(50, start + Math.max(1, Number(count) || 10) - 1) };
}

function applyOfficialRankingRank(product = {}) {
  const officialRank = Number(product.rank);
  if (!Number.isFinite(officialRank) || officialRank <= 0) {
    return { ...product, apiRank: null, sourceRank: null, rank: null };
  }
  return { ...product, apiRank: officialRank, sourceRank: officialRank, rank: officialRank };
}

function getRankingRequestInterval(categoryCount) {
  return categoryCount >= 4 ? RANKING_INTERVAL_LONG_MS : RANKING_INTERVAL_SHORT_MS;
}

function getRankingRetryWaitMs(response, rawBody, fallbackWaitMs) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 60) return Math.max(1000, seconds * 1000 + RANKING_RETRY_SAFETY_MARGIN_MS);
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(1000, Math.min(60000, retryDate - Date.now() + RANKING_RETRY_SAFETY_MARGIN_MS));
  }
  const bodySeconds = rawBody.match(/Try again in\s+(\d+(?:\.\d+)?)\s+seconds?/i)?.[1];
  if (bodySeconds) {
    const seconds = Number(bodySeconds);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 60) return Math.max(1000, seconds * 1000 + RANKING_RETRY_SAFETY_MARGIN_MS);
  }
  return fallbackWaitMs + RANKING_RETRY_SAFETY_MARGIN_MS;
}

function createRankingApiError(status, rawBody, retryCount) {
  const error = new Error(formatRakutenApiError(`HTTP ${status}：${extractRakutenApiErrorDetail(rawBody)}`));
  error.httpStatus = status;
  error.rawBody = rawBody;
  error.retryCount = retryCount;
  return error;
}

function extractRakutenApiErrorDetail(rawBody) {
  if (!rawBody) return "HTTPエラー";
  try {
    const errorBody = JSON.parse(rawBody);
    return errorBody.error_description || errorBody.error || errorBody.message || rawBody.slice(0, 240);
  } catch {
    return rawBody.slice(0, 240);
  }
}

function showRankingProgress(message) {
  const messageEl = $("#rankingMessage");
  if (messageEl) messageEl.textContent = message;
}

function renderRankingRetryControl() {
  const button = $("#retry-failed-ranking");
  if (!button) return;
  const hasFailed = [...rankingCategoryStates.values()].some((state) => state.status === "failed");
  button.hidden = !hasFailed;
  button.disabled = rankingRetryInProgress;
}

function formatRakutenApiError(message) {
  return `楽天APIエラー：${hideCredentials(String(message))}`;
}

function hideCredentials(text) {
  return text
    .replaceAll(data.settings.applicationId || "no-application-id", "[applicationId]")
    .replaceAll(data.settings.accessKey || "no-access-key", "[accessKey]")
    .replaceAll(data.settings.affiliateId || "no-affiliate-id", "[affiliateId]");
}

function normalizeRakutenItems(json) {
  const items = json.items || json.Items || [];
  return items.map((entry) => {
    const nested = entry.item || entry.Item;
    return nested ? { ...entry, ...nested } : entry;
  });
}

// 楽天APIの在庫・販売状態を確認し、販売終了商品をランキング候補から除外します。
// APIによってフィールド名や値の型が異なるため、確認できる状態だけを対象にします。
function isUnavailableProduct(product) {
  const availability = product.availability ?? product.itemAvailability;
  if (availability === 0 || availability === "0" || availability === false) return true;
  const status = String(product.stockStatus ?? product.saleStatus ?? "").toLowerCase();
  return /(販売終了|売り切れ|売切れ|sold\s*out|discontinued)/i.test(status);
}

function checkProductTrust(product = {}) {
  const text = stripHtml(`${product.itemName || ""} ${product.itemCaption || ""}`);
  const reasons = [];
  const add = (code, label, detail, severity = "info") => reasons.push({ code, label, detail, severity });
  const isStorage = /(SSD|USBメモリ|microSD|SDカード|ハードディスク|HDD)/i.test(text);
  const isPower = /(モバイルバッテリー|充電器|電源|ACアダプター)/i.test(text);
  const capacity = text.match(/(?:大容量|容量)?\s*(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i);
  const manufacturer = product.manufacturer || text.match(/(?:メーカー|ブランド)[:：]?\s*([^\s、,。]+)/i)?.[1] || "";
  const modelNumber = product.modelNumber || product.model || text.match(/\b[A-Z]{1,6}[-_]?[A-Z0-9]{2,}\b/)?.[0] || "";

  if (!manufacturer) add("manufacturer_missing", "メーカー不明", "メーカー名を商品情報から確認できません。", "warning");
  if (!modelNumber) add("model_missing", "型番不明", "正確な型番を商品情報から確認できません。", "warning");
  if (!String(product.itemName || "").trim() || !String(product.itemUrl || product.affiliateUrl || "").trim()) add("critical_identity_missing", "商品識別情報不足", "商品名または商品ページURLを確認できません。", "high");
  if (!String(product.itemCaption || "").trim()) add("description_missing", "商品説明不足", "商品説明が空または不足しています。", "warning");
  if (/(超高速|業界最高|最強|永久保証|無制限)/i.test(text)) add("spec_excessive", "過剰なスペック表現", "商品名・説明に確認が必要な強い表現があります。", "warning");
  if (/(メーカー|型番|保証).*(なし|不明|記載なし)/i.test(text)) add("warranty_or_identity_missing", "識別・保証情報不足", "メーカー、型番、保証に関する不足記載があります。", "warning");
  if (capacity && (isStorage || isPower) && Number(product.itemPrice) > 0) {
    const amount = Number(capacity[1]);
    const unit = capacity[2].toUpperCase();
    const tb = unit === "TB" ? amount : amount / 1024;
    if (tb >= 4 && Number(product.itemPrice) < 10000) add("capacity_price_balance", "容量と価格のバランス要確認", "大容量・高性能の記載に対して価格が極端に安く見えるため、型番・実容量・保証を確認してください。", "high");
  }
  if (/(SSD|USBメモリ|microSD|SDカード)/i.test(text) && /(防水|耐衝撃|高速|超高速)/i.test(text) && !modelNumber) add("storage_spec_consistency", "記憶媒体の仕様要確認", "記憶媒体の性能表現と型番を確認できません。", "high");
  if (/(\b[A-Za-z]+\b.*){2,}/.test(text) && /[ぁ-ん一-龯]/.test(text) && /送料無料|即納/.test(text)) add("description_mixture", "商品説明の整合性要確認", "異なる説明や定型句の混在がないか商品ページで確認してください。", "warning");
  if (product.reviewAverage && product.reviewCount) add("review_only_evidence", "レビュー情報のみ", "評価・件数は確認できますが、レビュー本文がないため安全性の根拠にはしません。", "info");

  const highCount = reasons.filter((reason) => reason.severity === "high").length;
  const warningCount = reasons.filter((reason) => reason.severity === "warning" || reason.severity === "high").length;
  const trustStatus = highCount >= 2 || (highCount >= 1 && warningCount >= 3)
    ? "注意喚起候補"
    : warningCount >= 1 ? "要確認" : "通常投稿候補";
  if (!String(product.itemName || "").trim() || !String(product.itemUrl || product.affiliateUrl || "").trim()) {
    return {
      trustStatus: "投稿対象外",
      trustScore: 0,
      trustReasons: reasons,
      manufacturer,
      modelNumber,
      specWarnings: [],
      priceWarning: null,
      descriptionWarnings: reasons,
      needsManualReview: true,
      warningContentCandidate: false,
      alternativeProductCandidate: false
    };
  }
  const trustScore = Math.max(0, Math.min(100, 100 - warningCount * 15 - highCount * 20));
  return {
    trustStatus,
    trustScore,
    trustReasons: reasons,
    manufacturer,
    modelNumber,
    specWarnings: reasons.filter((reason) => ["spec_excessive", "storage_spec_consistency", "capacity_price_balance"].includes(reason.code)),
    priceWarning: reasons.find((reason) => reason.code === "capacity_price_balance") || null,
    descriptionWarnings: reasons.filter((reason) => ["description_missing", "description_mixture", "warranty_or_identity_missing"].includes(reason.code)),
    needsManualReview: trustStatus !== "通常投稿候補",
    warningContentCandidate: trustStatus === "注意喚起候補",
    alternativeProductCandidate: trustStatus === "注意喚起候補"
  };
}

// 商品データに明記されたセール情報だけを紹介文プロンプトへ渡します。
// 価格差や割引率などを、項目がない状態から推測しないための共通処理です。
function getSaleInfo(product = {}) {
  const nested = product.saleInfo || product.campaign || {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = product[key] ?? nested[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  };
  const entries = [
    ["セール価格", pick("salePrice", "discountPrice", "campaignPrice")],
    ["通常価格", pick("regularPrice", "originalPrice", "listPrice")],
    ["割引率", pick("discountRate", "saleRate")],
    ["クーポン", pick("coupon", "couponInfo", "couponText")],
    ["セール期間", pick("salePeriod", "campaignPeriod", "saleStartEnd")],
    ["ポイント還元", pick("pointBack", "pointRate", "pointCampaign")],
    ["注意事項", pick("saleNotice", "campaignNotice", "limitedQuantity", "quantityLimit")]
  ];
  return entries.filter(([, value]) => value !== "").map(([label, value]) => `${label}：${value}`).join("\n");
}

function getRoomIntroDeadlineRule(product = {}) {
  const detected = extractCouponCandidates(product).detectedDeadline || product.detectedDeadline || "";
  const evidence = getCouponEvidence(product);
  if (evidence.deadlineConfirmed && evidence.couponDeadline) {
    return `確認済みのクーポン最終有効日「${evidence.couponDeadline}」がある場合は、紹介文の冒頭付近へ「${evidence.couponDeadline}まで」など自然に入力する。`;
  }
  if (detected) {
    return `商品タイトルから検出した期限候補「${detected}」があります。これは未確認の候補なので断定せず、商品ページ確認後に採用できる場合だけ、紹介文の冒頭付近へ「${detected}まで」など自然に入力する。確認前は期限を事実として書かない。`;
  }
  return "クーポン最終有効日が確認できた場合は、紹介文の冒頭付近へ自然に入力する。未確認の期限は書かない。";
}

function getCouponEvidence(item = {}) {
  const product = item.product || item;
  const rate = Number(item.discountRate ?? product.discountRate ?? item.saleRate ?? product.saleRate);
  const deadline = String(item.couponDeadline ?? product.couponDeadline ?? item.salePeriod ?? product.salePeriod ?? "").trim();
  return {
    discountRate: Number.isFinite(rate) && rate > 0 ? rate : null,
    rateConfirmed: item.rateConfirmed === true || product.rateConfirmed === true,
    discountRateType: item.discountRateType || product.discountRateType || "unknown",
    couponDeadline: deadline,
    deadlineConfirmed: item.deadlineConfirmed === true || product.deadlineConfirmed === true,
    couponSource: item.couponSource || product.couponSource || "",
    couponCheckedAt: item.couponCheckedAt || product.couponCheckedAt || ""
  };
}

function normalizeCouponCandidateText(value = "") {
  return String(value || "").normalize("NFKC").replace(/[～〜]/g, "〜").replace(/[‐‑‒–—−]/g, "-");
}

function extractDiscountCandidate(itemName = "") {
  const text = normalizeCouponCandidateText(itemName);
  const percentMatches = [...text.matchAll(/(\d{1,3})\s*%\s*(?:OFF|オフ)/gi)];
  for (const match of percentMatches) {
    const before = text.slice(Math.max(0, match.index - 8), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 4);
    if (/(実質|ポイント)/.test(before) || /^相当/.test(after)) continue;
    const rate = Number(match[1]);
    if (rate > 0 && rate <= 100) return { discountRate: rate, source: "itemName" };
  }
  const halfIndex = text.indexOf("半額");
  if (halfIndex >= 0) {
    const before = text.slice(Math.max(0, halfIndex - 8), halfIndex);
    const after = text.slice(halfIndex + 2, halfIndex + 6);
    if (!/(最大|実質|ポイント)/.test(before) && !/^相当/.test(after)) return { discountRate: 50, source: "itemName" };
  }
  return { discountRate: null, source: "" };
}

function extractDiscountLabel(itemName = "") {
  const text = normalizeCouponCandidateText(itemName);
  const match = text.match(/((?:最大)?\d{1,3}\s*%\s*(?:OFF|オフ)(?:クーポン)?)/i);
  return match ? match[1].replace(/\s+/g, "") : "";
}

function buildDealHeader(product = {}) {
  const evidence = getCouponEvidence(product);
  const label = evidence.rateConfirmed && evidence.discountRateType === "exact"
    ? (String(product.confirmedDiscountLabel || product.discountLabel || "").trim() || `${evidence.discountRate}%OFF`)
    : "";
  if (!label) return "";
  const regular = Number(product.regularPrice ?? product.originalPrice ?? product.listPrice);
  const current = Number(product.salePrice ?? product.discountPrice ?? product.campaignPrice ?? product.itemPrice);
  const pricePart = Number.isFinite(regular) && regular > 0 && Number.isFinite(current) && current > 0
    ? `${formatYen(regular)}→${formatYen(current)}🉐 `
    : "🉐 ";
  const deadline = evidence.deadlineConfirmed && evidence.couponDeadline ? `\n${evidence.couponDeadline}まで` : "";
  return `${pricePart}${label}${deadline}`;
}

function parseCouponDatePart(value = "") {
  const normalized = normalizeCouponCandidateText(value).trim();
  let match = normalized.match(/^(\d{1,2})[./月](\d{1,2})日?\s*(\d{1,2}):(\d{2})$/);
  if (match) return { month: Number(match[1]), day: Number(match[2]), hour: Number(match[3]), minute: Number(match[4]) };
  match = normalized.match(/^(\d{1,2})日\s*(\d{1,2}):(\d{2})$/);
  if (match) return { month: null, day: Number(match[1]), hour: Number(match[2]), minute: Number(match[3]) };
  return null;
}

function formatDetectedDeadline(part, eventSettings = {}) {
  if (!part) return "";
  const eventEnd = String(eventSettings.endDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const safeEventDate = eventEnd && (part.month === null || Number(eventEnd[2]) === part.month) && Number(eventEnd[3]) === part.day;
  if (safeEventDate) return `${eventEnd[1]}/${eventEnd[2]}/${eventEnd[3]} ${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
  return `${part.month ? `${part.month}/` : ""}${part.day} ${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
}

function extractDeadlineCandidate(itemName = "", eventSettings = data.eventSettings || {}) {
  const text = normalizeCouponCandidateText(itemName);
  const range = text.match(/(\d{1,2}(?:[./月]\d{1,2}日?|日)\s*\d{1,2}:\d{2})\s*〜\s*(\d{1,2}(?:[./月]\d{1,2}日?|日)\s*\d{1,2}:\d{2})/);
  if (!range) return { start: "", end: "", source: "" };
  const start = parseCouponDatePart(range[1]);
  const end = parseCouponDatePart(range[2]);
  if (!start || !end) return { start: "", end: "", source: "" };
  return { start: formatDetectedDeadline(start, eventSettings), end: formatDetectedDeadline(end, eventSettings), source: "itemName" };
}

function extractCouponCandidates(product = {}) {
  const itemName = product.itemName || product.title || "";
  const discount = extractDiscountCandidate(itemName);
  const deadline = extractDeadlineCandidate(itemName);
  return {
    detectedDiscountRate: discount.discountRate,
    detectedDiscountLabel: extractDiscountLabel(itemName),
    detectedDiscountSource: discount.source,
    detectedDeadline: deadline.end,
    detectedDeadlineStart: deadline.start,
    detectedDeadlineSource: deadline.source
  };
}

function getCouponCandidateInputValue(product = {}, field = "rate", override = {}) {
  if (Object.prototype.hasOwnProperty.call(override, field)) return override[field];
  const detected = extractCouponCandidates(product);
  if (field === "rate") {
    if (product.rateConfirmed && product.discountRateType === "exact" && Number.isFinite(Number(product.discountRate))) return product.discountRate;
    return product.detectedDiscountRate ?? detected.detectedDiscountRate ?? "";
  }
  if (product.deadlineConfirmed && product.couponDeadline) return product.couponDeadline;
  return product.detectedDeadline || detected.detectedDeadline || "";
}

function saveCouponSearchInput(safeId, field, value) {
  const current = couponSearchInputOverrides.get(safeId) || {};
  current[field] = value;
  couponSearchInputOverrides.set(safeId, current);
}

function getCouponSearchKeywords() {
  const selected = $("#unifiedDiscountFilter")?.value || "";
  return selected && COUPON_SEARCH_OPTIONS[selected] ? [selected] : [];
}

function getUnifiedSearchCategories() {
  return $$("input[name='unifiedCategory']:checked").map((input) => rankingCategories.find((category) => category.id === input.value)).filter(Boolean);
}

function summarizeDealStatuses(products = []) {
  return products.reduce((summary, product) => {
    const status = product.dealStatus?.status || "unknown";
    if (status === "confirmed") summary.confirmed += 1;
    else if (status === "candidate") summary.candidate += 1;
    else summary.unknown += 1;
    return summary;
  }, { confirmed: 0, candidate: 0, unknown: 0 });
}

function clearSearchConditions() {
  const setValue = (id, value) => { const element = $(`#${id}`); if (element) element.value = value; };
  setValue("unifiedProductKeyword", "");
  setValue("unifiedProductCount", "10");
  setValue("unifiedDiscountFilter", "");
  setValue("rankingGenreId", "");
  setValue("rankingRangeStart", "1");
  setValue("rankingRangeCount", "10");
  $$('input[name="unifiedCategory"]').forEach((input) => { input.checked = false; });

  searchResults = [];
  couponSearchResults = [];
  couponVisibleCount = 30;
  couponSearchInputOverrides.clear();
  rankingCategoryStates.clear();
  rankingRequestContext = null;
  rankingRetryInProgress = false;
  ["#results", "#rankingResults", "#todayRecommendations", "#couponSearchResults"].forEach((selector) => {
    const element = $(selector);
    if (element) element.innerHTML = "";
  });
  ["#searchMessage", "#rankingMessage", "#couponSearchMessage"].forEach((selector) => {
    const element = $(selector);
    if (element) element.textContent = "";
  });
  const retryButton = $("#retry-failed-ranking");
  if (retryButton) retryButton.hidden = true;
  toast("検索条件と検索結果をクリアしました。保存済みデータは変更していません。");
}

async function searchUnifiedProducts() {
  const keyword = $("#unifiedProductKeyword")?.value.trim() || "";
  const categories = getUnifiedSearchCategories();
  const filters = getCouponSearchKeywords();
  if (!keyword && !categories.length) {
    const message = $("#couponSearchMessage");
    message.textContent = "キーワードまたは対象カテゴリーを指定してください。";
    renderCouponSearchResults([]);
    return;
  }
  await searchCouponProducts({ keyword, categories, filters });
}

function matchesCouponDiscountFilter(item, filters = []) {
  const evidence = getCouponEvidence(item);
  if (!evidence.rateConfirmed || evidence.discountRateType === "up_to" || !Number.isFinite(evidence.discountRate)) return false;
  return filters.some((filter) => evidence.discountRate >= (filter === "50plus" ? 50 : Number(filter)));
}

function evaluateDealStatus(product = {}, dealCondition = "") {
  const evidence = getCouponEvidence(product);
  const detected = extractCouponCandidates(product);
  const threshold = dealCondition === "50plus" ? 50 : Number(dealCondition);
  const hasCondition = dealCondition === "50plus" || Number.isFinite(threshold) && threshold > 0;
  if (!hasCondition) return { status: "unknown", rate: null, label: "お買い得情報：指定なし" };
  if (evidence.rateConfirmed && evidence.discountRateType === "exact" && Number.isFinite(evidence.discountRate)) {
    const meets = evidence.discountRate >= threshold;
    const label = product.confirmedDiscountLabel || `${evidence.discountRate}%OFF`;
    return { status: meets ? "confirmed" : "unknown", rate: evidence.discountRate, label: meets ? `🟢 ${label}確認済み` : `割引率${evidence.discountRate}%（条件未達）` };
  }
  if (Number.isFinite(detected.detectedDiscountRate) && detected.detectedDiscountRate >= threshold) {
    return { status: "candidate", rate: detected.detectedDiscountRate, label: `🟡 ${detected.detectedDiscountLabel || `${detected.detectedDiscountRate}%OFF`}候補・要確認` };
  }
  return { status: "unknown", rate: null, label: "割引情報不明" };
}

function getSelectedDealCondition() {
  return $("#unifiedDiscountFilter")?.value || "";
}

function extractCandidateDiscountRate(product = {}) {
  const structured = getCouponEvidence(product);
  if (structured.rateConfirmed && structured.discountRateType === "exact") return structured.discountRate;
  return null;
}

function prepareCouponSearchProduct(product, searchFilters = []) {
  const evidence = getCouponEvidence(product);
  const detected = extractCouponCandidates(product);
  return {
    ...product,
    couponCandidate: true,
    couponSearchFilters: searchFilters,
    discountRate: evidence.discountRate,
    rateConfirmed: evidence.rateConfirmed,
    discountRateType: evidence.discountRateType,
    couponDeadline: evidence.couponDeadline,
    deadlineConfirmed: evidence.deadlineConfirmed,
    couponSource: evidence.couponSource || "楽天商品検索API（検索候補）",
    couponCheckedAt: evidence.couponCheckedAt,
    ...detected
  };
}

function applyCouponEvidenceToCandidate(candidate, source = {}) {
  const verifiedRate = source.rateConfirmed === true && source.discountRateType === "exact" && Number.isFinite(Number(source.discountRate));
  Object.assign(candidate, {
    regularPrice: source.regularPrice ?? candidate.regularPrice ?? null,
    salePrice: source.salePrice ?? candidate.salePrice ?? null,
    discountRate: verifiedRate ? Number(source.discountRate) : (source.discountRate ?? null),
    rateConfirmed: verifiedRate,
    discountRateType: source.discountRateType || "unknown",
    confirmedDiscountLabel: verifiedRate ? (source.confirmedDiscountLabel || extractDiscountLabel(candidate.product?.itemName || candidate.itemName) || `${source.discountRate}%OFF`) : "",
    couponDeadline: source.couponDeadline || "",
    deadlineConfirmed: source.deadlineConfirmed === true,
    couponSource: source.couponSource || "",
    couponCheckedAt: source.couponCheckedAt || "",
    detectedDiscountRate: source.detectedDiscountRate ?? null,
    detectedDiscountSource: source.detectedDiscountSource || "",
    detectedDeadline: source.detectedDeadline || "",
    detectedDeadlineStart: source.detectedDeadlineStart || "",
    detectedDeadlineSource: source.detectedDeadlineSource || ""
  });
  if (verifiedRate && source.discountStatus === "confirmed") candidate.discountStatus = "confirmed";
  if (source.couponConfirmed === true) {
    candidate.coupon = source.coupon || candidate.coupon || "";
    candidate.couponInfo = source.couponInfo || candidate.couponInfo || "";
  }
  if (candidate.product && typeof candidate.product === "object") {
    Object.assign(candidate.product, {
      regularPrice: candidate.regularPrice,
      salePrice: candidate.salePrice,
      discountRate: candidate.discountRate,
      rateConfirmed: candidate.rateConfirmed,
      discountRateType: candidate.discountRateType,
      confirmedDiscountLabel: candidate.confirmedDiscountLabel,
      couponDeadline: candidate.couponDeadline,
      deadlineConfirmed: candidate.deadlineConfirmed,
      ...(source.couponConfirmed === true ? { coupon: candidate.coupon, couponInfo: candidate.couponInfo } : {})
    });
  }
  return candidate;
}

function saveRoomDiscountEvidence(candidateId, source = {}) {
  const candidate = data.candidates.find((item) => item.id === candidateId && isRoomCandidate(item));
  if (!candidate) return false;
  applyCouponEvidenceToCandidate(candidate, source);
  saveData();
  const saved = data.candidates.find((item) => item.id === candidateId);
  return Boolean(saved && saved.rateConfirmed === true && saved.discountRateType === "exact" && saved.product?.rateConfirmed === true);
}

function getCouponDisplayState(product = {}) {
  const evidence = getCouponEvidence(product);
  const detected = extractCouponCandidates(product);
  const confirmed = evidence.rateConfirmed && evidence.discountRateType === "exact" && Number.isFinite(evidence.discountRate);
  const candidateRate = evidence.discountRate ?? detected.detectedDiscountRate;
  return {
    imageUrl: getImage(product),
    imageAvailable: Boolean(getImage(product)),
    rateLabel: confirmed ? `${evidence.discountRate}%OFF確認済み` : `${candidateRate ? `${candidateRate}%OFF` : "割引率"}候補`,
    rateConfirmed: confirmed,
    deadlineConfirmed: evidence.deadlineConfirmed,
    affiliateUrlAvailable: Boolean(product.affiliateUrl)
  };
}

function getSourceTypeLabel(type) {
  return ({ ranking: "ランキング", product: "商品検索", category: "カテゴリー検索", trend: "トレンド検索", deal: "お買い得候補" }[type] || type);
}

function renderUnifiedProductCard(product, index, options = {}) {
  const isCoupon = options.mode === "coupon";
  const rankText = options.rank != null ? `${options.rank}位 ` : product.rank ? `${product.rank}位 ` : "";
  const dealStatus = product.dealStatus || evaluateDealStatus(product, getSelectedDealCondition());
  const sourceTypes = [...new Set([...(product.sourceTypes || []), isCoupon ? "deal" : options.rank != null || product.rank ? "ranking" : "product"])];
  const sourceText = sourceTypes.map(getSourceTypeLabel).join(" / ");
  const alreadyPosted = postedHistoryMatch(product);
  const safeId = `coupon-${btoa(unescape(encodeURIComponent(product.itemCode || product.itemName || "item"))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
  const detected = extractCouponCandidates(product);
  const evidence = getCouponEvidence(product);
  const controls = isCoupon && dealStatus.status === "candidate" ? `<details class="deal-confirmation"><summary>割引・期限を確認</summary><label>確認した割引率<input id="${safeId}-rate" type="number" value="${escapeAttr(String(getCouponCandidateInputValue(product, "rate", couponSearchInputOverrides.get(safeId) || {})))}" oninput="saveCouponSearchInput('${safeId}', 'rate', this.value)"></label><label>確認した期限<input id="${safeId}-deadline" type="text" value="${escapeAttr(String(getCouponCandidateInputValue(product, "deadline", couponSearchInputOverrides.get(safeId) || {})))}" oninput="saveCouponSearchInput('${safeId}', 'deadline', this.value)"></label><label><input id="${safeId}-rate-ok" type="checkbox"> 割引率を確認済み</label><label><input id="${safeId}-deadline-ok" type="checkbox"> 期限を確認済み</label></details>` : "";
  const roomDuplicate = isCoupon && findDuplicate(product);
  const existingRoomCandidate = isCoupon && findRoomCandidate(product);
  const roomSaveButton = roomDuplicate && existingRoomCandidate && !postedHistoryMatch(product)
    ? `<button class="primary-button" type="button" onclick="restoreRoomCandidateFromSearch(${JSON.stringify(product).replaceAll('"', '&quot;')})">✓ ROOM投稿候補に保存済み（再表示）</button>`
    : roomDuplicate
    ? `<button class="primary-button" type="button" disabled>✓ ROOM投稿候補に保存済み</button>`
    : `<button class="primary-button" type="button" onclick="${isCoupon ? `saveCouponSearchRoomCandidate(${JSON.stringify(product).replaceAll('"', '&quot;')}, '${safeId}')` : `quickSaveByIndex(${index})`}">投稿候補に保存</button>`;
  const saveButtons = `${roomSaveButton}<button class="secondary-button" type="button" onclick="${isCoupon ? `saveCouponSearchCandidate(${JSON.stringify(product).replaceAll('"', '&quot;')}, '${safeId}')` : `threadsOnlySaveByIndex(${index})`}">Threads投稿</button>`;
  const imageCandidates = escapeAttr(JSON.stringify(getImageCandidates(product)));
  return `<article class="product-card unified-product-card" data-ranking-item-code="${escapeAttr(product.itemCode || "")}"><div class="coupon-image-wrap"><img src="${escapeAttr(getImage(product))}" data-image-candidates="${imageCandidates}" data-image-index="0" alt="" onerror="tryNextProductImage(this)"><span class="product-image-placeholder" hidden>画像なし</span></div><div class="product-body"><div class="product-title">${rankText}${escapeHtml(product.itemName || "商品名未設定")}</div><p class="price">${formatYen(product.itemPrice)}</p><p class="meta">${escapeHtml(product.categoryName || "カテゴリー未設定")} / ${escapeHtml(product.shopName || "ショップ未設定")} / 評価 ${product.reviewAverage || "-"}（${product.reviewCount || 0}件）</p><p class="meta">取得元：${escapeHtml(sourceText)}</p><p class="coupon-status">${escapeHtml(dealStatus.label)}</p><p class="selection-score">選定スコア：${getSelectionTotal(product)} / 100</p><p class="selection-score">今日の投稿優先度：${product.todayPriorityScore ?? getSelectionTotal(product)}</p>${alreadyPosted ? `<p class="ranking-post-status">投稿済み</p>` : ""}${controls}<div class="button-row"><button class="secondary-button" type="button" onclick="openDetailByIndex(${index})">詳細・紹介文</button>${saveButtons}${["要確認", "注意喚起候補"].includes(product.trustStatus) ? `<button class="secondary-button" type="button" onclick="saveWarningCandidateByIndex(${index})">注意喚起候補として保存</button>` : ""}<button class="secondary-button" type="button" onclick="addFavoriteByIndex(${index})">お気に入り</button><a class="secondary-button" href="${escapeAttr(product.itemUrl || "#")}" target="_blank" rel="noopener noreferrer">楽天で見る</a></div></div></article>`;
}

function renderCouponSearchCard(product) {
  return renderUnifiedProductCard(product, couponSearchResults.indexOf(product), { mode: "coupon" });
  /* Legacy markup is retained below for data compatibility during migration. */
  const evidence = getCouponEvidence(product);
  const detected = extractCouponCandidates(product);
  const safeId = `coupon-${btoa(unescape(encodeURIComponent(product.itemCode || product.itemName || "item"))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
  const inputOverride = couponSearchInputOverrides.get(safeId) || {};
  const rateInputValue = getCouponCandidateInputValue(product, "rate", inputOverride);
  const deadlineInputValue = getCouponCandidateInputValue(product, "deadline", inputOverride);
  const display = getCouponDisplayState(product);
  const itemCode = product.itemCode || "";
  const image = display.imageUrl;
  const imageHtml = image
    ? `<img src="${escapeAttr(image)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="product-image-placeholder" hidden>画像なし</span>`
    : `<span class="product-image-placeholder">画像なし</span>`;
  const rateLabel = display.rateLabel;
  const deadlineLabel = evidence.deadlineConfirmed
    ? "期限"
    : (detected.detectedDeadline || evidence.couponDeadline ? "期限候補" : "期限");
  const roomDuplicate = findDuplicate(product);
  return `<article class="product-card coupon-result-card" data-coupon-item-code="${escapeAttr(itemCode)}">
    <div class="coupon-image-wrap">${imageHtml}</div>
    <div class="product-body">
      <h3 class="product-title">${escapeHtml(product.itemName || "商品名未設定")}</h3>
      <p class="price">${formatYen(product.itemPrice)}</p>
      <p class="meta">${escapeHtml(product.categoryName || "カテゴリー未設定")} / ${escapeHtml(product.shopName || "ショップ未設定")} / 評価 ${product.reviewAverage || "-"}（${product.reviewCount || 0}件）</p>
      <p class="coupon-candidate-badge">検索条件：${escapeHtml((product.couponSearchFilters || []).map((key) => COUPON_SEARCH_OPTIONS[key]?.label || key).join("、") || "候補")}</p>
      <p class="coupon-status">${escapeHtml(rateLabel)} <span class="coupon-confirmation ${evidence.rateConfirmed && evidence.discountRateType === "exact" ? "confirmed" : "needs-confirmation"}">${evidence.rateConfirmed && evidence.discountRateType === "exact" ? "🟢 確認済み" : "🟡 要確認"}</span></p>
      <p class="coupon-status">${deadlineLabel}：${escapeHtml(evidence.couponDeadline || detected.detectedDeadline || "未確認")}（${evidence.deadlineConfirmed ? "🟢 確認済み" : "🟡 要確認"}）</p>
      <p class="affiliate-url-status">${product.affiliateUrl ? "楽天アフィリエイトURL取得済み" : "楽天アフィリエイトURL未取得"}</p>
      ${detected.detectedDiscountRate || detected.detectedDeadline ? `<p class="coupon-detected-note">🟡 商品名から検出した候補です。商品ページで現在有効か確認してください。</p>` : ""}
      <label>確認した割引率（候補）<input id="${safeId}-rate" type="number" min="1" max="100" value="${escapeAttr(String(rateInputValue))}" oninput="saveCouponSearchInput('${safeId}', 'rate', this.value)" placeholder="例：50"></label>
      <label>確認した期限（候補）<input id="${safeId}-deadline" type="text" value="${escapeAttr(String(deadlineInputValue))}" oninput="saveCouponSearchInput('${safeId}', 'deadline', this.value)" placeholder="例：2026/09/24 01:59まで"></label>
      <label><input id="${safeId}-rate-ok" type="checkbox"> 割引率を確認済み</label>
      <label><input id="${safeId}-deadline-ok" type="checkbox"> 期限を確認済み</label>
      <div class="record-actions"><a class="secondary-button" href="${escapeAttr(product.itemUrl || "#")}" target="_blank" rel="noopener noreferrer">割引・期限を確認</a></div>
      <div class="record-actions"><button class="primary-button" type="button" ${roomDuplicate ? "disabled" : `onclick="saveCouponSearchRoomCandidate(${JSON.stringify(product).replaceAll('"', '&quot;')}, '${safeId}')"`}>${roomDuplicate ? "✓ ROOM投稿候補に保存済み" : "ROOM投稿候補に保存"}</button><button class="secondary-button" type="button" onclick="saveCouponSearchCandidate(${JSON.stringify(product).replaceAll('"', '&quot;')}, '${safeId}')">Threads投稿</button></div>
    </div></article>`;
}

function renderCouponSearchResults(products = []) {
  const container = $("#couponSearchResults");
  const filters = getCouponSearchKeywords();
  couponSearchResults = products.filter((product) => !postedHistoryMatch(product) && (!filters.length || matchesCouponDiscountFilter(product, filters) || evaluateDealStatus(product, filters[0]).status === "candidate"));
  couponSearchResults.forEach((product) => { product.sourceTypes = [...new Set([...(product.sourceTypes || []), "deal"])]; });
  couponVisibleCount = Math.min(30, couponSearchResults.length);
  renderVisibleCouponSearchResults();
}

function renderVisibleCouponSearchResults() {
  const container = $("#couponSearchResults");
  if (!container) return;
  if (!couponSearchResults.length) {
    container.innerHTML = `<p class="message">該当する検索候補はありません。割引率を確認できた商品は、確認値を入力して保存してください。</p>`;
    return;
  }
  const visible = couponSearchResults.slice(0, couponVisibleCount).map(renderCouponSearchCard).join("");
  const more = couponVisibleCount < couponSearchResults.length
    ? `<button class="secondary-button coupon-more-button" type="button" onclick="showMoreCouponResults()">さらに表示（残り${couponSearchResults.length - couponVisibleCount}件）</button>`
    : "";
  container.innerHTML = `${visible}${more}`;
}

function showMoreCouponResults() {
  couponVisibleCount = Math.min(couponVisibleCount + 30, couponSearchResults.length);
  renderVisibleCouponSearchResults();
}

async function searchCouponProducts(options = {}) {
  const keyword = options.keyword || "";
  const categories = options.categories || getUnifiedSearchCategories();
  const filters = options.filters || getCouponSearchKeywords();
  const message = $("#couponSearchMessage");
  if (!hasRakutenCredentials()) { message.textContent = "楽天API認証情報が未設定のため検索できません。"; renderCouponSearchResults([]); return; }
  const merged = new Map();
  const queries = keyword
    ? (categories.length ? categories.map((category) => ({ filter: filters[0] || "", query: keyword, categories: [category] })) : [{ filter: filters[0] || "", query: keyword, categories: [] }])
    : (filters.length
      ? filters.flatMap((filter) => COUPON_SEARCH_OPTIONS[filter].queries.map((query) => ({ filter, query, categories })))
      : categories.map((category) => ({ filter: "", query: "", categories: [category] })));
  message.textContent = `${queries.length}通りの検索候補を確認しています...`;
  for (let index = 0; index < queries.length; index += 1) {
    if (index) await sleep(RANKING_INTERVAL_SHORT_MS);
    const { filter, query, categories: queryCategories } = queries[index];
    const params = new URLSearchParams({ format: "json", applicationId: data.settings.applicationId, accessKey: data.settings.accessKey, keyword: query, hits: String(Number($("#unifiedProductCount")?.value || 10) * 3), sort: "standard" });
    addParam(params, "genreId", queryCategories?.[0]?.id || "");
    addAffiliateIdParam(params);
    try {
      const response = await fetch(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      normalizeRakutenItems(await response.json()).forEach((product) => {
        const key = rankingIdentity(product);
        const current = merged.get(key) || prepareCouponSearchProduct(product, []);
        current.couponSearchFilters = [...new Set([...(current.couponSearchFilters || []), filter].filter(Boolean))];
        merged.set(key, current);
      });
    } catch (error) {
      if (message) message.textContent = `${query}の検索に失敗しました。成功した検索結果は保持しています。`;
    }
  }
  const preparedResults = [...merged.values()].map((product) => prepareCouponSearchProduct(product, product.couponSearchFilters));
  const results = preparedResults.map((product) => ({ ...product, dealStatus: evaluateDealStatus(product, filters[0] || "") }));
  const postedExcludedCount = preparedResults.filter((product) => postedHistoryMatch(product)).length;
  renderCouponSearchResults(results);
  const visibleResults = results.filter((product) => !postedHistoryMatch(product) && (!filters.length || matchesCouponDiscountFilter(product, filters) || product.dealStatus.status === "candidate"));
  const statusCounts = summarizeDealStatuses(visibleResults);
  message.textContent = filters.length
    ? `API取得：${preparedResults.length}件 / 投稿済み除外：${postedExcludedCount}件 / 確認済み：${statusCounts.confirmed}件 / 候補・要確認：${statusCounts.candidate}件 / 割引情報未確認：${statusCounts.unknown}件 / 表示：${couponSearchResults.length}件。\n${couponSearchResults.length}件のお買い得検索候補を表示しています。`
    : `API取得：${preparedResults.length}件 / 投稿済み除外：${postedExcludedCount}件 / 表示：${couponSearchResults.length}件。割引情報は確認前の検索候補です。`;
}

function getCouponSearchProductWithEvidence(rawProduct, elementPrefix) {
  const product = { ...rawProduct };
  const detected = extractCouponCandidates(product);
  const rateInput = document.getElementById(`${elementPrefix}-rate`);
  const deadlineInput = document.getElementById(`${elementPrefix}-deadline`);
  const rateConfirmed = Boolean(document.getElementById(`${elementPrefix}-rate-ok`)?.checked);
  const deadlineConfirmed = Boolean(document.getElementById(`${elementPrefix}-deadline-ok`)?.checked);
  const discountRate = Number(rateInput?.value || product.discountRate);
  if (rateConfirmed && (!Number.isFinite(discountRate) || discountRate <= 0 || discountRate > 100)) { toast("確認済みの割引率を入力してください。"); return; }
  return { ...product, discountRate: Number.isFinite(discountRate) && discountRate > 0 ? discountRate : null, rateConfirmed, discountRateType: rateConfirmed ? "exact" : "unknown", confirmedDiscountLabel: rateConfirmed ? (product.confirmedDiscountLabel || detected.detectedDiscountLabel || `${discountRate}%OFF`) : "", couponDeadline: deadlineInput?.value.trim() || product.couponDeadline || "", deadlineConfirmed, couponSource: product.couponSource || "楽天商品検索API（人間確認）", couponCheckedAt: new Date().toISOString(), detectedDiscountRate: product.detectedDiscountRate ?? detected.detectedDiscountRate, detectedDiscountSource: product.detectedDiscountSource || detected.detectedDiscountSource, detectedDiscountLabel: product.detectedDiscountLabel || detected.detectedDiscountLabel, detectedDeadline: product.detectedDeadline || detected.detectedDeadline, detectedDeadlineStart: product.detectedDeadlineStart || detected.detectedDeadlineStart, detectedDeadlineSource: product.detectedDeadlineSource || detected.detectedDeadlineSource };
}

function saveCouponSearchCandidate(rawProduct, elementPrefix) {
  const candidateProduct = getCouponSearchProductWithEvidence(rawProduct, elementPrefix);
  if (!candidateProduct) return;
  quickSaveThreadsOnly(candidateProduct);
  const saved = data.candidates.find((candidate) => isThreadsOnlyItem(candidate) && rankingIdentity(candidate.product || candidate) === rankingIdentity(candidateProduct));
  if (saved) {
    applyCouponEvidenceToCandidate(saved, candidateProduct);
    saved.couponCandidate = true;
    saved.snsPosts.threads.performanceUrlMode = "reply";
    saved.snsPosts.threads.prompt = buildThreadsPerformancePrompt(saved);
    saved.snsPosts.threads.text = "";
    saved.snsPosts.threads.replyText = "";
    ensureThreadsOnlyDraft(saved);
    saveData();
  }
  toast(candidateProduct.rateConfirmed ? "確認済み情報を付けて保存し、Threads文章の自動下書きを作成しました。" : "要確認の検索候補を保存し、Threads文章の自動下書きを作成しました。割引を断定せず確認してください。");
}

function saveCouponSearchRoomCandidate(rawProduct, elementPrefix) {
  const candidateProduct = getCouponSearchProductWithEvidence(rawProduct, elementPrefix);
  if (!candidateProduct) return;
  const duplicate = findDuplicate(candidateProduct);
  if (duplicate) {
    toast("すでにROOM投稿候補または投稿履歴に登録されています。");
    return;
  }
  const candidate = buildQueueCandidate(candidateProduct);
  candidate.couponCandidate = true;
  data.candidates.unshift(candidate);
  saveData();
  renderCandidates();
  renderVisibleCouponSearchResults();
  toast("ROOM投稿候補に保存しました。割引・期限の確認状態も保持しています。");
}

function findRoomCandidate(product, ignoreId = "") {
  const productCodes = getItemCodes(product);
  const identity = rankingIdentity(product);
  return data.candidates.find((item) => {
    if (!isRoomCandidate(item) || item.id === ignoreId) return false;
    const itemCodes = getItemCodes(item);
    if (productCodes.length && itemCodes.length) return itemCodes.some((code) => productCodes.includes(code));
    return rankingIdentity(item.product || item) === identity;
  }) || null;
}

function restoreRoomCandidateFromSearch(rawProduct) {
  if (postedHistoryMatch(rawProduct)) {
    toast("投稿履歴にある商品は再表示できません。");
    return;
  }
  const candidate = findRoomCandidate(rawProduct);
  if (!candidate) {
    toast("保存済みのROOM投稿候補を確認できませんでした。");
    return;
  }
  candidate.status = candidate.introText ? "文章作成済み" : "未作成";
  candidate.postStatus = candidate.introText ? "紹介文作成済み" : "紹介文未作成";
  saveData();
  toast("保存済みのROOM投稿候補を再表示しました。");
}

function getThreadsPerformanceFacts(item = {}) {
  const product = item.product || item;
  const couponCandidate = Boolean(item.couponCandidate || product.couponCandidate);
  const evidence = getCouponEvidence(item);
  const saleInfo = couponCandidate ? "" : getSaleInfo(product);
  const event = data.eventSettings || {};
  const structured = [
    ["割引率", couponCandidate ? (evidence.rateConfirmed && evidence.discountRateType === "exact" ? evidence.discountRate : undefined) : (product.discountRate ?? product.saleRate)],
    ["セール価格", couponCandidate ? undefined : (product.salePrice ?? product.discountPrice ?? product.campaignPrice)],
    ["通常価格", couponCandidate ? undefined : (product.regularPrice ?? product.originalPrice ?? product.listPrice)],
    ["クーポン", couponCandidate ? (evidence.rateConfirmed ? (product.coupon ?? product.couponInfo ?? product.couponText) : undefined) : (product.coupon ?? product.couponInfo ?? product.couponText)],
    ["セール期間", couponCandidate ? (evidence.deadlineConfirmed ? evidence.couponDeadline : undefined) : (product.salePeriod ?? product.campaignPeriod ?? product.saleStartEnd)],
    ["ポイント還元", couponCandidate ? undefined : (product.pointBack ?? product.pointRate ?? product.pointCampaign)],
    ["送料無料", product.postageFlag === 1 ? "確認済み" : ""],
    ["商品セール情報", saleInfo]
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");
  const eventTiming = calculateEventTiming(event);
  return {
    structured: structured.map(([label, value]) => `${label}：${value}`).join("\n") || "確認済みのセール情報なし",
    event: event.enabled && event.eventName && eventTiming.score ? `${event.eventName}（${event.startDate || ""}〜${event.endDate || ""}）` : "確認済みの有効イベントなし"
  };
}

function buildGenerationContext(product = {}, usageStatus = "不明") {
  const text = `${product.itemName || ""} ${stripHtml(product.itemCaption || "")} ${product.categoryName || ""}`;
  const category = product.categoryName || "このカテゴリーの商品";
  const rules = [
    [/(モバイルバッテリー|充電器|USB)/i, "外出先で充電切れが気になる方", "持ち歩きやすさや充電の確保"],
    [/(収納|ラック|ケース|ボックス|バッグ)/i, "物が散らかりやすく整理したい方", "収納しやすさや必要な物の取り出しやすさ"],
    [/(美容|コスメ|化粧|まつ毛|スキンケア|セラム|クリーム)/i, "毎日のケアを手軽に続けたい方", "使う部位やケア方法の取り入れやすさ"],
    [/(キッチン|調理|マグ|水筒|鍋|フライパン)/i, "家事や調理を少し楽にしたい方", "扱いやすさや日常での使いやすさ"],
    [/(HDD|ハードディスク|パソコン|周辺機器)/i, "データ保存やパソコン周りを整えたい方", "容量や対応機器など用途に合う点"]
  ];
  const matched = rules.find(([pattern]) => pattern.test(text));
  const targetUser = matched?.[1] || `${category}を探している方`;
  const problem = matched?.[2] || "商品説明に明記された特徴を比較して選びたい方";
  const mainBenefit = matched?.[2] || (product.itemCaption ? shorten(stripHtml(product.itemCaption), 80) : "商品情報に明記された特徴を確認できること");
  const usageScene = /(通勤|旅行|防災|デスク|仕事|家事|育児|テレビ録画|パソコン)/.exec(text)?.[1] || "日常の用途に合わせて";
  const saleInfo = getSaleInfo(product);
  const saleReason = saleInfo ? saleInfo.split("\n").slice(0, 2).join("、") : "";
  const safeUsageStatus = usageStatus.includes("実際") || usageStatus.includes("購入") ? "購入・使用済み（入力された体験のみ使用）" : "未使用または不明（使用体験を書かない）";
  return { targetUser, problem, mainBenefit, usageScene, usageStatus: safeUsageStatus, saleReason, generatedHook: `${targetUser}に。${problem}を確認したい方に向く商品です。` };
}

function getPerformanceAudienceGuidance(item = {}) {
  const product = item.product || item;
  const text = `${product.itemName || ""} ${stripHtml(product.itemCaption || "")} ${product.categoryName || ""}`;
  if (/(黒毛和牛|和牛|サーロイン|ステーキ|牛肉)/i.test(text)) return "自宅でちょっと贅沢なお肉を楽しみたい人";
  if (/(さば|鯖|鮭|サーモン|魚|海鮮|水産)/i.test(text)) return "魚を手軽に食卓へ取り入れたい人";
  if (/(スイーツ|ケーキ|チョコ|お菓子|アイス|和菓子)/i.test(text)) return "家でゆっくり甘いものを楽しみたい人";
  if (/(バッグ|トート|リュック)/i.test(text)) return "荷物を整理して持ち歩きたい人";
  if (/(チェスト|クローゼット|衣類|押入れ)/i.test(text)) return "クローゼットの収納が足りない人";
  if (/(収納|ラック|ボックス|ケース)/i.test(text)) return "収納を増やしたい人";
  if (/(モバイルバッテリー|充電器|バッテリー)/i.test(text)) return "外出先でスマホの充電切れが気になる人";
  if (/(日傘|晴雨兼用傘|UV|紫外線)/i.test(text)) return "通勤時の日差しが気になる人";
  if (/(キッチン|調理|鍋|フライパン|水筒|マグ)/i.test(text)) return "料理や家事の中で置き場所・扱いやすさに困る人";
  if (/(スマホ|iPhone|ケース|フィルム)/i.test(text)) return "スマホ本体やカメラまわりを守りたい人";
  return "";
}

function isGenericPerformanceAudience(value = "") {
  return [
    "用途に合う商品を探している人",
    "このカテゴリーの商品を探している方",
    "商品を探している人",
    "お得な商品を探している人",
    "楽天ユーザー",
    "買い物好きな人"
  ].includes(String(value || "").trim());
}

function getPerformanceAudience(item = {}) {
  const value = String(item.snsPosts?.threads?.performanceAudience || "").trim();
  return value && !isGenericPerformanceAudience(value) ? value : getPerformanceAudienceGuidance(item);
}

function getPerformanceProductFeature(item = {}) {
  const product = item.product || item;
  const plain = (value) => String(value || "").replace(/<[^>]*>/g, " ");
  const text = plain(`${product.itemName || ""} ${product.itemCaption || ""}`);
  const name = plain(product.itemName || product.title || "商品").replace(/[★☆【】\[\]（）()]/g, " ").replace(/\s+/g, " ").trim();
  if (/(黒毛和牛|和牛)/i.test(text) && /(サーロイン|ステーキ)/i.test(text)) {
    const origin = text.match(/(秋田県産)/i)?.[1] || text.match(/(国産)/i)?.[1] || text.match(/(A4\s*\/\s*A5ランク|A4・?A5ランク)/i)?.[1] || "黒毛和牛";
    const cut = /サーロイン/i.test(text) ? "サーロイン" : "ステーキ";
    const amount = text.match(/\b\d+(?:\.\d+)?\s*g\b/i)?.[0] || "";
    return `${origin}${origin === "黒毛和牛" ? "" : "の"}黒毛和牛${cut}${amount ? `${amount}` : ""}。`;
  }
  if (/(ポーク|豚肉|牛肉|ビーフ|和牛)/i.test(text)) {
    const origin = text.match(/([一-龥]{2,8}(?:都|道|府|県)産)/)?.[1] || (/(?:^|\s)国産(?:\s|$)/.test(text) ? "国産" : "");
    const brand = text.match(/([一-龥A-Za-z0-9・]{2,16}(?:ポーク|ビーフ|和牛|牛肉|豚肉))/i)?.[1] || "";
    const typeMatch = text.match(/(しゃぶしゃぶセット|焼肉(?:セット|詰め合わせ)?|ステーキ(?:用)?|サーロイン)/i);
    const type = typeMatch?.[1]
      ? typeMatch[1].replace(/焼肉詰め合わせ/i, "焼肉セット").replace(/ステーキ用/i, "ステーキ")
      : "";
    const amount = text.match(/\b\d+(?:\.\d+)?\s*g\b/i)?.[0] || "";
    if (brand && type) return `${origin ? `${origin}の` : ""}${brand}${type}${amount}。`;
  }
  if (/(八幡平ポーク|ポーク|豚肉)/i.test(text) && /(焼肉|焼き肉)/i.test(text)) {
    const origin = text.match(/(秋田県産)/i)?.[1] || text.match(/(国産)/i)?.[1] || "";
    const brand = text.match(/(八幡平ポーク)/i)?.[1] || "ポーク";
    const amount = text.match(/\b\d+(?:\.\d+)?\s*g\b/i)?.[0] || "";
    return `${origin ? `${origin}の` : ""}${brand}焼肉セット${amount ? `${amount}` : ""}。`;
  }
  if (/(さば|鯖|鮭|サーモン|魚)/i.test(text)) {
    const feature = /(骨取り|骨なし|個包装|切り身|国産|秋田県産)/i.exec(text)?.[1];
    return `${feature ? `${feature}で` : ""}魚を手軽に食卓へ取り入れられそう。`;
  }
  if (/チェスト|収納ラック|収納ボックス/i.test(text)) {
    const tiers = text.match(/(\d+)段/);
    return tiers ? `${tiers[1]}段の収納チェスト。` : "収納を増やせるチェスト。";
  }
  if (/モバイルバッテリー/i.test(text)) {
    const capacity = text.match(/\b\d+(?:\.\d+)?\s*mAh\b/i)?.[0] || "";
    return `${capacity ? `${capacity}の` : ""}モバイルバッテリー。`;
  }
  if (/日傘|晴雨兼用傘/i.test(text)) return `${/UV|紫外線|UVカット/i.test(text) ? "UVカットの" : ""}日傘。`;
  if (/バッグ|リュック|トート/i.test(text)) return `${/PC収納/i.test(text) ? "PC収納付きの" : ""}大容量バッグ。`;
  const cleaned = name
    .replace(/(?:最大|実質)?\d{1,3}\s*%\s*(?:OFF|オフ)(?:相当)?/gi, "")
    .replace(/半額(?:相当)?/gi, "")
    .replace(/\d{1,2}(?:[./月]\d{1,2}日?|日)\s*\d{1,2}:\d{2}\s*[〜～-]\s*\d{1,2}(?:[./月]\d{1,2}日?|日)\s*\d{1,2}:\d{2}/g, "")
    .replace(/送料無料|ポイント(?:最大)?\d+倍?|ギフト|贈り物|プレゼント|内祝い|誕生日|お歳暮|お中元|母の日|父の日|敬老の日/gi, "")
    .replace(/\s+/g, " ").trim();
  const shortName = cleaned.length > 40 ? `${cleaned.slice(0, 40).replace(/[\s、,]+$/, "")}…` : cleaned;
  return shortName ? `${shortName}。` : "";
}

function getPerformanceBenefitLine(item = {}, evidence = {}) {
  const feature = getPerformanceProductFeature(item);
  const confirmedRate = evidence.rateConfirmed && evidence.discountRateType === "exact" && Number.isFinite(evidence.discountRate);
  if (confirmedRate) {
    const baseFeature = feature.split("。", 1)[0].trim();
    if (baseFeature) return `${baseFeature}が${evidence.discountRate}%OFF。`;
    return `${evidence.discountRate}%OFFクーポン対象。`;
  }
  return feature;
}

function addSelectionReason(reasons, text) {
  if (text && !reasons.includes(text)) reasons.push(text);
}

function calculateRankingScore(product = {}) {
  const sourceRank = Number(product.sourceRank ?? product.rank);
  if (!Number.isFinite(sourceRank) || sourceRank <= 0) return 0;
  if (sourceRank === 1) return 30;
  if (sourceRank === 2) return 27;
  if (sourceRank === 3) return 24;
  if (sourceRank <= 10) return 20;
  if (sourceRank <= 20) return 15;
  return 10;
}

function calculateReviewRatingScore(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 0;
  if (rating >= 4.5) return 20;
  if (rating >= 4.3) return 16;
  if (rating >= 4) return 12;
  if (rating >= 3.5) return 6;
  return 2;
}

function calculateReviewCountScore(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count >= 1000) return 20;
  if (count >= 500) return 16;
  if (count >= 100) return 12;
  if (count >= 30) return 8;
  return 4;
}

function calculatePriceScore(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= 1000) return 5;
  if (price <= 3000) return 12;
  if (price <= 10000) return 15;
  if (price <= 30000) return 10;
  return 5;
}

function calculateCategoryScore(categoryName = "") {
  return SELECTION_SCORE_CONFIG.categories[categoryName] ?? 5;
}

function calculateFreshnessScore(product = {}, context = {}) {
  const identity = rankingIdentity(product);
  const isDuplicate = context.postedIdentities?.has(identity) || context.queuedIdentities?.has(identity);
  return isDuplicate ? 0 : 5;
}

function selectionGrade(total) {
  if (total >= 90) return "★★★★★ 最優先";
  if (total >= 80) return "★★★★★ 強くおすすめ";
  if (total >= 70) return "★★★★☆ おすすめ";
  if (total >= 60) return "★★★☆☆ 候補";
  return "★★☆☆☆ 優先度低";
}

function trendSelectionGrade(total) {
  if (total >= 80) return "★★★★★ 最優先候補";
  if (total >= 70) return "★★★★☆ 有力候補";
  if (total >= 60) return "★★★☆☆ 候補";
  if (total >= 50) return "★★☆☆☆ 要確認";
  return "★☆☆☆☆ 優先度低";
}

function getSelectionTotal(item = {}) {
  return Number(item.selectionScore?.total ?? item.selectionScoreTotal ?? (typeof item.selectionScore === "number" ? item.selectionScore : 0)) || 0;
}

function calculateSelectionScore(product = {}, context = {}) {
  const ranking = calculateRankingScore(product);
  const reviewRating = calculateReviewRatingScore(product.reviewAverage);
  const reviewCount = calculateReviewCountScore(product.reviewCount);
  const price = calculatePriceScore(product.itemPrice);
  const category = calculateCategoryScore(product.categoryName);
  const freshness = calculateFreshnessScore(product, context);
  const total = ranking + reviewRating + reviewCount + price + category + freshness;
  const selectionReason = [];
  if (ranking >= 24) selectionReason.push("ランキング上位");
  else if (ranking > 0) selectionReason.push("ランキング情報あり");
  if (reviewRating >= 16) selectionReason.push("レビュー評価が高い");
  if (reviewCount >= 16) selectionReason.push("レビュー件数が多い");
  if (price >= 12) selectionReason.push("購入しやすい価格帯");
  if (category >= 8) selectionReason.push("優先カテゴリー");
  if (freshness === 5) selectionReason.push("未投稿商品");
  if (!Number(product.reviewAverage) && !Number(product.reviewCount)) selectionReason.push("レビュー情報なし");
  return {
    selectionScore: { total, ranking, reviewRating, reviewCount, price, category, freshness },
    selectionReason,
    selectionVersion: SELECTION_SCORE_VERSION,
    selectionGrade: selectionGrade(total),
    selectionScoreTotal: total,
    selectionBreakdown: { ranking, reviewRating, reviewCount, price, category, freshness },
    selectionReasons: selectionReason
  };
}

function normalizeTrendText(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_‐‑‒–—―・/\\.,、。()[\]{}「」『』【】]/g, "");
}

function tokenizeTrendKeyword(keyword = "") {
  const original = String(keyword).trim();
  const normalized = normalizeTrendText(original);
  const rawTokens = original
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s\-_‐‑‒–—―・/\\.,、。()[\]{}「」『』【】]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const tokens = rawTokens.length > 1 ? rawTokens : (normalized.match(/[a-z]+\d+[a-z]*|\d+[a-z]+|[a-z]+|\d+|[ぁ-んァ-ヶ一-龯ー]+/g) || [normalized]);
  return { original, normalized, tokens: [...new Set(tokens.filter(Boolean))] };
}

function isTrendProductTypeToken(token = "") {
  return /(ケース|フィルム|ガラス|充電器|ケーブル|バッテリー|イヤホン|バッグ|ラック|マスク|クリーム|セラム|ギフト|水筒|フライパン|鍋)/i.test(token);
}

function calculateTrendFitScore(product = {}, matchedTrendKeywords = []) {
  const source = normalizeTrendText(`${product.itemName || ""} ${stripHtml(product.itemCaption || "")}`);
  const keywordDetails = [...new Set(matchedTrendKeywords)].filter(Boolean).map(tokenizeTrendKeyword);
  if (!keywordDetails.length || !source) return { total: 0, matchedKeywords: [], matchedTokenRatio: 0, typeMatch: false, exactMatch: false };
  let best = { total: 0, matchedKeywords: [], matchedTokenRatio: 0, typeMatch: false, exactMatch: false };
  keywordDetails.forEach((keyword) => {
    const matchedTokens = keyword.tokens.filter((token) => source.includes(normalizeTrendText(token)));
    const ratio = keyword.tokens.length ? matchedTokens.length / keyword.tokens.length : 0;
    const keywordType = keyword.tokens.find(isTrendProductTypeToken);
    const typeMatch = Boolean(keywordType && source.includes(normalizeTrendText(keywordType)));
    const exactMatch = keyword.normalized.length >= 4 && source.includes(keyword.normalized);
    const modelTokens = keyword.tokens.filter((token) => /[a-z]+\d+|\d+[a-z]+/i.test(token));
    const modelMatch = modelTokens.length > 0 && modelTokens.every((token) => source.includes(normalizeTrendText(token)));
    let score = 0;
    if (exactMatch && typeMatch) score = 30;
    else if (ratio >= 0.9 && typeMatch) score = 27;
    else if (modelMatch && typeMatch) score = 25;
    else if (ratio >= 0.75 && typeMatch) score = 23;
    else if (modelMatch || ratio >= 0.75) score = 18;
    else if (ratio >= 0.5) score = 12;
    else if (ratio > 0) score = 6;
    if (!typeMatch && keywordType && modelMatch) score = Math.min(score, 18);
    const candidate = { total: score, matchedKeywords: score ? [keyword.original] : [], matchedTokenRatio: ratio, typeMatch, exactMatch };
    if (candidate.total > best.total) best = candidate;
  });
  return best;
}

function calculateTrendReviewEvidenceScore(product = {}, trendFit = {}) {
  const count = Number(product.reviewCount);
  const rating = Number(product.reviewAverage);
  if (count >= 1000 && rating >= 4.5) return 15;
  if (count >= 500 && rating >= 4.3) return 13;
  if (count >= 100 && rating >= 4.3) return 11;
  if (count >= 30 && rating >= 4) return 8;
  if (count > 0 && rating >= 4) return 6;
  // A strong product/keyword match should not be treated as a major negative
  // merely because a newly launched product has not accumulated reviews yet.
  if (trendFit.total >= 27 && (product.releaseDate || product.isNewProduct || product.newProduct)) return 7;
  if (trendFit.total >= 27 && count <= 10) return 6;
  return count > 0 ? 4 : 3;
}

function calculateTrendSelectionScore(product = {}, context = {}) {
  const matched = [...new Set(product.matchedTrendKeywords || context.matchedTrendKeywords || [])];
  const trendFit = calculateTrendFitScore(product, matched);
  const reviewRating = calculateReviewRatingScore(product.reviewAverage);
  const reviewEvidence = calculateTrendReviewEvidenceScore(product, trendFit);
  const price = calculatePriceScore(product.itemPrice);
  const opportunity = calculateTrendOpportunityScore(product, matched, data.eventSettings);
  const freshness = calculateFreshnessScore(product, context);
  const total = trendFit.total + reviewRating + reviewEvidence + Math.round(price * (10 / 15)) + opportunity.total + freshness;
  const selectionReason = [];
  if (trendFit.total >= 23) selectionReason.push("検索意図と商品情報が強く一致");
  else if (trendFit.total >= 12) selectionReason.push("検索キーワードと商品情報が部分一致");
  if (opportunity.total >= 13) selectionReason.push("今投稿する材料がある");
  if (freshness === 5) selectionReason.push("未投稿商品");
  return {
    selectionScore: { total, trendFit: trendFit.total, reviewRating, reviewEvidence, price: Math.round(price * (10 / 15)), opportunity: opportunity.total, freshness },
    selectionReason,
    selectionVersion: `${SELECTION_SCORE_VERSION}-trend-v2`,
    selectionGrade: trendSelectionGrade(total),
    selectionScoreTotal: total,
    selectionBreakdown: { trendFit: trendFit.total, reviewRating, reviewEvidence, price: Math.round(price * (10 / 15)), opportunity: opportunity.total, freshness },
    selectionReasons: selectionReason,
    trendScore: { total: trendFit.total, keywordMatch: trendFit.total, matchedTokenRatio: trendFit.matchedTokenRatio, typeMatch: trendFit.typeMatch, exactMatch: trendFit.exactMatch },
    opportunityScore: opportunity
  };
}

function scoreProductSelection(product = {}) {
  return calculateSelectionScore(product, {
    postedIdentities: new Set(data.history.map((item) => rankingIdentity(item.product || item))),
    queuedIdentities: new Set(data.candidates.filter(isRoomCandidate).map((item) => rankingIdentity(item.product || item)))
  });
  /* legacy scoring fields retained below for backward-compatible saved data. */
  const trust = product.trustStatus ? product : { ...product, ...checkProductTrust(product) };
  const context = buildGenerationContext(product);
  const text = `${product.itemName || ""} ${stripHtml(product.itemCaption || "")} ${product.categoryName || ""}`;
  const saleInfo = getSaleInfo(product);
  const reasons = [];
  const warnings = [];
  const purchaseReasons = [];
  const selectionReasons = [];
  const selectionWarnings = [];

  if (trust.trustStatus !== "通常投稿候補") {
    return {
      selectionScore: null,
      selectionBreakdown: { click: 0, problem: 0, purchase: 0, trust: 0, roomFit: 0, season: 0 },
      clickScore: 0, problemScore: 0, purchaseScore: 0, trustSelectionScore: 0, roomFitScore: 0, seasonScore: 0,
      targetUser: context.targetUser, problem: context.problem, mainBenefit: context.mainBenefit, usageScene: context.usageScene,
      clickReason: "通常商品スコアの対象外：商品信頼性チェックで要確認",
      purchaseReasons: [], selectionReasons: [`${trust.trustStatus}のため通常商品スコアから分離`],
      selectionWarnings: (trust.trustReasons || []).map((reason) => reason.detail || reason.label),
      selectionStatus: trust.trustStatus === "投稿対象外" ? "excluded" : "review",
      scoreVersion: SELECTION_SCORE_VERSION
    };
  }

  let click = 0;
  if (product.itemName && product.itemCaption) { click += 7; addSelectionReason(reasons, "商品名と説明から用途を確認できる"); }
  if (context.targetUser && !context.targetUser.includes("カテゴリーの商品")) { click += 6; addSelectionReason(reasons, `対象者を整理できる：${context.targetUser}`); }
  if (context.usageScene !== "日常の用途に合わせて") { click += 5; addSelectionReason(reasons, `利用場面を整理できる：${context.usageScene}`); }
  if (context.problem && !context.problem.includes("特徴を比較")) { click += 5; addSelectionReason(reasons, `悩みを整理できる：${context.problem}`); }
  if (/(比較|違い|対応|軽量|大容量|折りたたみ|時短|収納|防災|送料無料)/i.test(text)) { click += 4; addSelectionReason(reasons, "比較・用途につながる特徴が商品情報にある"); }
  if (saleInfo) { click += 3; addSelectionReason(reasons, "商品データにセール関連情報がある"); }
  const clickScore = Math.min(SELECTION_SCORING.click, click);

  let problem = 0;
  if (context.targetUser && !context.targetUser.includes("カテゴリーの商品")) problem += 6;
  if (context.problem && !context.problem.includes("特徴を比較")) problem += 6;
  if (context.mainBenefit && product.itemCaption) problem += 4;
  if (context.usageScene !== "日常の用途に合わせて") problem += 4;
  const problemScore = Math.min(SELECTION_SCORING.problem, problem);
  if (problemScore >= 12) addSelectionReason(selectionReasons, "誰のどんな困りごとに役立つかを説明しやすい");
  else addSelectionReason(selectionWarnings, "対象者や悩みを商品情報から十分に整理できない");

  let purchase = 0;
  if (Number(product.itemPrice) > 0) { purchase += 3; purchaseReasons.push("価格を確認できる"); }
  if (saleInfo) { purchase += Math.min(5, saleInfo.split("\n").length); purchaseReasons.push("明記されたセール・クーポン等がある"); }
  if (product.postageFlag === 1) { purchase += 2; purchaseReasons.push("送料無料フラグを確認できる"); }
  if (Number(product.reviewAverage) > 0) { purchase += 2; purchaseReasons.push("レビュー評価を確認できる"); }
  if (Number(product.reviewCount) > 0) { purchase += 2; purchaseReasons.push("レビュー件数を確認できる"); }
  const purchaseScore = Math.min(SELECTION_SCORING.purchase, purchase);

  const trustSelectionScore = Math.min(SELECTION_SCORING.trust, Math.max(0, Math.round(Number(trust.trustScore ?? 0) * SELECTION_SCORING.trust / 100)));
  if (trustSelectionScore >= 12) selectionReasons.push("メーカー・型番・説明などの確認材料がそろっている");
  if (trust.needsManualReview) selectionWarnings.push("信頼性の手動確認が必要");

  let roomFit = 0;
  if (/(収納|家事|仕事|通勤|旅行|防災|美容|キッチン|パソコン|充電|バッグ|水筒|マグ)/i.test(text)) roomFit += 5;
  if (context.problem && !context.problem.includes("特徴を比較")) roomFit += 3;
  if (context.mainBenefit && product.itemCaption) roomFit += 2;
  const roomFitScore = Math.min(SELECTION_SCORING.roomFit, roomFit);
  if (roomFitScore >= 7) selectionReasons.push("暮らしの困りごとと関連し、購入理由を説明しやすい");

  let season = 0;
  if (saleInfo) season += 5;
  if (/(新生活|旅行|防災|暑さ|寒さ|年末|母の日|父の日|スーパーSALE|お買い物マラソン|5と0のつく日)/i.test(`${text} ${saleInfo}`)) season += 5;
  const seasonScore = Math.min(SELECTION_SCORING.season, season);
  if (!saleInfo && season === 0) warnings.push("季節・セール情報は取得できないため未評価");

  const selectionScore = clickScore + problemScore + purchaseScore + trustSelectionScore + roomFitScore + seasonScore;
  return {
    selectionScore,
    selectionBreakdown: { click: clickScore, problem: problemScore, purchase: purchaseScore, trust: trustSelectionScore, roomFit: roomFitScore, season: seasonScore },
    clickScore, problemScore, purchaseScore, trustSelectionScore, roomFitScore, seasonScore,
    targetUser: context.targetUser, problem: context.problem, mainBenefit: context.mainBenefit, usageScene: context.usageScene,
    clickReason: reasons.join("、") || "クリック理由を商品情報から整理できない",
    purchaseReasons,
    selectionReasons: [...selectionReasons, ...reasons],
    selectionWarnings: [...selectionWarnings, ...warnings],
    selectionStatus: selectionScore >= 70 ? "priority" : selectionScore >= 50 ? "review" : "low",
    scoreVersion: SELECTION_SCORE_VERSION
  };
}

function applySelectionScore(product = {}) {
  const source = product.product || product;
  const isTrendProduct = Array.isArray(source.matchedTrendKeywords) && source.matchedTrendKeywords.length > 0;
  Object.assign(product, isTrendProduct ? calculateTrendSelectionScore(source, {
    postedIdentities: new Set(data.history.map((item) => rankingIdentity(item.product || item))),
    queuedIdentities: new Set(data.candidates.filter(isRoomCandidate).map((item) => rankingIdentity(item.product || item))),
    matchedTrendKeywords: source.matchedTrendKeywords
  }) : scoreProductSelection(source));
  return product;
}

function getCollectionById(id) {
  return COLLECTIONS.find((collection) => collection.id === id) || null;
}

function getRecommendedCollection(product = {}) {
  const trust = product.trustStatus ? product : checkProductTrust(product);
  if (trust.trustStatus !== "注意喚起候補") return null;
  return COLLECTIONS.find((collection) => collection.enabled && collection.type === "warning") || null;
}

function classifyPostType(product = {}) {
  const trust = product.trustStatus ? product : checkProductTrust(product);
  if (trust.trustStatus === "注意喚起候補") return "warning";
  if (getSaleInfo(product)) return "sale";
  if (product.usageStatus === "used" || product.usageStatus === "購入・使用済み") return "used";
  return "normal";
}

function applyCollectionMetadata(record = {}) {
  const product = record.product || record;
  const trust = record.trustStatus ? record : checkProductTrust(product);
  const recommended = getRecommendedCollection(trust);
  const reasons = (trust.trustReasons || [])
    .filter((reason) => reason.severity === "high" || reason.severity === "warning")
    .slice(0, 4)
    .map((reason) => reason.detail || reason.label)
    .filter(Boolean);
  record.postType = trust.trustStatus === "注意喚起候補"
    ? "warning"
    : (record.postType || classifyPostType({ ...product, ...record }));
  record.recommendedCollection = record.recommendedCollection || (recommended?.id || "");
  record.collectionReason = record.collectionReason || (recommended ? reasons.join(" / ") || "購入前に商品情報を確認したい項目があります。" : "");
  record.collectionStatus = record.collectionStatus || (recommended ? "recommended" : "none");
  if (!record.selectedCollection) record.selectedCollection = "";
  return record;
}

function collectionOptions(selected = "") {
  return `<option value="">未選択</option>${COLLECTIONS.filter((collection) => collection.enabled).map((collection) => `<option value="${escapeAttr(collection.id)}" ${selected === collection.id ? "selected" : ""}>${escapeHtml(collection.name)}</option>`).join("")}`;
}

function validateGeneratedCopy(introText, product = {}) {
  const text = String(introText || "");
  const forbidden = /(絶対お得|最安値|必ず効果|買わないと損|売り切れる前に|残りわずか)/;
  if (forbidden.test(text)) return "確認できない煽り表現が含まれています。";
  if (/(使ってみて|愛用しています|買ってよかった|悩みが解決)/.test(text) && !product.usageStatus?.includes("used")) {
    return "使用状況が未確認のため、使用体験の表現は保存できません。";
  }
  return "";
}

function filterAvailableProducts(products) {
  return products.filter((product) => !isUnavailableProduct(product) && !postedHistoryMatch(product));
}

function renderResults(products) {
  searchResults = products.filter((product) => !isUnavailableProduct(product) && !postedHistoryMatch(product));
  searchResults.forEach((product) => { product.sourceTypes = [...new Set([...(product.sourceTypes || []), "product"])]; if (!product.trustStatus) Object.assign(product, checkProductTrust(product)); applySelectionScore(product); });
  $("#results").innerHTML = searchResults.map((product, index) => renderUnifiedProductCard(product, index, { mode: "product" })).join("");
  return;
  $("#results").innerHTML = searchResults.map((product) => {
    const index = searchResults.indexOf(product);
    const duplicate = findDuplicate(product);
    return `
      <article class="product-card">
        <img src="${escapeAttr(getImage(product))}" alt="">
        <div class="product-body">
          <div class="product-title">${escapeHtml(product.itemName)}</div>
          <p class="price">${formatYen(product.itemPrice)}</p>
          <p class="meta">${escapeHtml(product.shopName)} / 評価 ${product.reviewAverage || "-"}（${product.reviewCount || 0}件）</p>
          <p class="selection-score">選定スコア：${getSelectionTotal(product)} / 100</p><p class="selection-grade">${escapeHtml(product.selectionGrade || selectionGrade(getSelectionTotal(product)))}</p>
          <p>${escapeHtml(shorten(product.itemCaption || "", 90))}</p>
          ${duplicate ? `<p class="warning">${escapeHtml(duplicate)}</p>` : ""}
        </div>
        <div class="button-row">
          <button class="secondary-button" type="button" onclick="openDetailByIndex(${index})">詳細・紹介文</button>
          <button class="primary-button" type="button" onclick="quickSaveByIndex(${index})">投稿候補に保存</button>
          <button class="secondary-button" type="button" onclick="threadsOnlySaveByIndex(${index})">Threads投稿</button>
          <button class="secondary-button" type="button" onclick="addFavoriteByIndex(${index})">お気に入り</button>
          <a class="secondary-button" href="${escapeAttr(product.itemUrl)}" target="_blank" rel="noopener noreferrer">楽天で見る</a>
        </div>
      </article>
    `;
  }).join("");
}

function openDetailByIndex(index) {
  const product = searchResults[index];
  if (product) openDetail(product);
}

function openDetailByCandidate(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (candidate?.product) openDetail(candidate.product, candidate);
}

function quickSaveByIndex(index) {
  const product = searchResults[index];
  if (product) quickSave(product);
}

function threadsOnlySaveByIndex(index) {
  const product = searchResults[index];
  if (product) quickSaveThreadsOnly(product);
}

function saveWarningCandidateByIndex(index) {
  const product = searchResults[index];
  if (!product) return;
  const trust = checkProductTrust(product);
  if (!["要確認", "注意喚起候補"].includes(trust.trustStatus)) {
    toast("この商品は注意喚起候補ではありません。");
    return;
  }
  quickSave(product);
  const candidate = data.candidates[0];
  if (candidate && rankingIdentity(candidate.product || candidate) === rankingIdentity(product)) {
    candidate.warningContentCandidate = true;
    candidate.favoriteType = "注意喚起候補";
    saveData();
    toast("注意喚起候補として保存しました。");
  }
}

function openDetail(product, draft = {}) {
  currentProduct = product;
  const duplicate = findDuplicate(product);
  const savedIntroText = draft.introText || "";
  const savedHashTags = draft.hashTags || "";
  $("#detailArea").innerHTML = `
    <div class="detail-layout">
      <div>
        <img class="detail-image" src="${escapeAttr(getImage(product))}" alt="">
        <p class="price">${formatYen(product.itemPrice)}</p>
        <p class="meta">${escapeHtml(product.shopName)} / 評価 ${product.reviewAverage || "-"}（${product.reviewCount || 0}件）</p>
        ${duplicate ? `<p class="warning">${escapeHtml(duplicate)}</p>` : ""}
        <a class="secondary-button" href="${escapeAttr(product.itemUrl)}" target="_blank" rel="noopener noreferrer">商品詳細を見る</a>
      </div>
      <div>
        <h3>${escapeHtml(product.itemName)}</h3>
        <p>${escapeHtml(product.itemCaption || "商品説明は取得できませんでした。")}</p>
        <div class="prompt-controls">
          <label>投稿タイプ<select id="postType"><option>欲しい商品</option><option>実際に購入した商品</option><option>おすすめ商品</option><option>セール商品</option><option>季節商品</option><option>プレゼント向け</option><option>比較検討中の商品</option></select></label>
          <label>想定読者<input id="reader" value="楽天ROOMを見ている人"></label>
          <label>雰囲気<select id="tone"><option>${escapeHtml(data.settings.defaultTone)}</option><option>親しみやすい</option><option>シンプル</option><option>お得感重視</option><option>丁寧</option><option>家族向け</option></select></label>
          <label>文字量<select id="length"><option>標準</option><option>短め</option><option>詳しめ</option></select></label>
          <label>絵文字<select id="emoji"><option>${escapeHtml(data.settings.defaultEmoji)}</option><option>なし</option><option>あり</option><option>少なめ</option></select></label>
          <label class="wide">強調したい特徴<input id="focusPoint" placeholder="例：軽い、持ち歩きやすい、ギフト向け"></label>
          <label class="wide">注意事項<input id="caution" placeholder="例：使っていないので使用感は書かない"></label>
        </div>
        <div class="button-row">
          <button class="primary-button" type="button" onclick="generatePrompt()">紹介文プロンプトを作る</button>
          <button class="secondary-button" type="button" onclick="quickSave(currentProduct)">投稿候補に保存</button>
          <button class="secondary-button" type="button" onclick="quickSaveThreadsOnly(currentProduct)">Threads投稿</button>
          <button class="secondary-button" type="button" onclick="addFavorite(currentProduct)">お気に入り</button>
          <button class="secondary-button" type="button" onclick="openChatGPT()">ChatGPTで開く</button>
        </div>
        <label>ChatGPTへ渡すプロンプト<textarea id="promptOutput"></textarea></label>
        <label>紹介文<textarea id="introText" placeholder="ChatGPTで作った文章、または自分で書いた紹介文を貼り付けます。">${escapeHtml(savedIntroText)}</textarea></label>
        <label>ハッシュタグ<textarea id="hashTags" placeholder="#楽天ROOM #買ってよかった など">${escapeHtml(savedHashTags)}</textarea></label>
        <div class="button-row">
          <button class="secondary-button" type="button" onclick="copyValue('promptOutput')">プロンプトをコピー</button>
          <button class="secondary-button" type="button" onclick="copyValue('introText')">紹介文をコピー</button>
          <button class="secondary-button" type="button" onclick="copyValue('hashTags')">ハッシュタグをコピー</button>
        </div>
        <h3>事実確認欄</h3>
        <ul class="fact-list">
          <li>商品ページに記載された内容だけで作成する</li>
          <li>実際に使用していない商品を「使いました」と書かない</li>
          <li>効果や性能を断定しない</li>
          <li>最安値と断定しない</li>
          <li>セールや価格の期限を投稿前に確認する</li>
          <li>医療・健康・美容効果を断定しない</li>
          <li>商品提供などがある場合はPR表記の要否を確認する</li>
        </ul>
      </div>
    </div>
  `;
  showTab("detail");
}

function generatePrompt() {
  if (!currentProduct) return;
  const tagCount = Number(data.settings.defaultTagCount) || 8;
  const context = buildGenerationContext(currentProduct, $("#postType").value);
  const prompt = `楽天ROOM投稿用の紹介文を作ってください。

【商品情報】
商品名：${currentProduct.itemName}
価格：${currentProduct.itemPrice}円
ショップ名：${currentProduct.shopName}
カテゴリー：${currentProduct.categoryName || "未設定"}
ランキング順位：${currentProduct.rank || "未設定"}位
レビュー評価：${currentProduct.reviewAverage || "不明"}
レビュー件数：${currentProduct.reviewCount || "不明"}
送料情報：${currentProduct.postageFlag ? "送料無料の可能性あり" : "商品ページで確認"}
商品説明：${stripHtml(currentProduct.itemCaption || "")}
商品URL：${currentProduct.itemUrl}
セール情報（商品データに明記された項目のみ）：
${getSaleInfo(currentProduct) || "記載なし"}

確認済みのお得情報ヘッダー（確認済みの場合だけ紹介文の冒頭へ使用）：
${buildDealHeader(currentProduct) || "なし。未確認の割引率・クーポン・期限は書かない。"}

クーポン最終有効日の扱い：
${getRoomIntroDeadlineRule(currentProduct)}

【文章作成用の中間情報】
対象者：${context.targetUser}
悩み：${context.problem}
主なメリット：${context.mainBenefit}
利用シーン：${context.usageScene}
商品状態：${context.usageStatus}
今チェックする理由：${context.saleReason || "明記されたセール情報なし"}
クリック理由：${currentProduct.clickReason || "選定前のため未評価"}
購入材料：${(currentProduct.purchaseReasons || []).join("、") || "選定前のため未評価"}
信頼性判定：${currentProduct.trustStatus || "未確認"}

【投稿条件】
投稿タイプ：${$("#postType").value}
想定読者：${$("#reader").value}
文章の雰囲気：${$("#tone").value}
文字量：${$("#length").value}
絵文字：${$("#emoji").value}
強調したい特徴：${$("#focusPoint").value || "商品情報から自然に判断"}
注意事項：${$("#caution").value || "誇張せず、事実確認しやすい表現にする"}

【出力してほしい内容】
1. ROOM投稿用紹介文
2. 短い紹介文
3. ハッシュタグ候補を${tagCount}個
4. セール情報（セール情報がある場合のみ）
見出しは「紹介文:」「短い紹介文:」「ハッシュタグ:」「セール情報:」「状態:確認待ち」を使用してください。

【必ず守ること】
商品ページにない内容を勝手に追加しないでください。
実際に使っていない場合は「使いました」と書かないでください。
効果、最安値、在庫、セール期限を断定しないでください。
セール価格、割引率、クーポン、期間、ポイント還元、通常価格との比較、数量限定などは、上記のセール情報に明記されている場合だけ自然に紹介文へ反映してください。`;
  $("#promptOutput").value = prompt;
  $("#hashTags").value = makeTags(currentProduct, tagCount).join(" ");
  toast("プロンプトを作成しました。");
}

function quickSave(product) {
  const itemUrl = product.itemUrl || product.affiliateUrl || "";
  const productWithUrl = product.itemUrl === itemUrl ? product : { ...product, itemUrl };
  const sameProduct = currentProduct && (
    (currentProduct.itemCode && productWithUrl.itemCode && currentProduct.itemCode === productWithUrl.itemCode) ||
    (currentProduct.itemUrl && productWithUrl.itemUrl && currentProduct.itemUrl === productWithUrl.itemUrl) ||
    currentProduct.itemName === productWithUrl.itemName
  );
  const introText = sameProduct ? $("#introText")?.value.trim() || "" : "";
  const hashTags = sameProduct ? $("#hashTags")?.value.trim() || "" : "";
  const introPrompt = sameProduct ? $("#promptOutput")?.value || "" : "";
  if (!canSaveRoomCandidate(productWithUrl)) {
    toast("すでにROOM投稿候補または投稿履歴に登録されています。");
    return;
  }
  const candidate = {
    id: crypto.randomUUID(),
    destination: "room",
    product: productWithUrl,
    title: productWithUrl.itemName,
    imageUrl: getImage(productWithUrl),
    itemUrl,
    affiliateUrl: productWithUrl.affiliateUrl || "",
    itemCode: productWithUrl.itemCode,
    price: productWithUrl.itemPrice,
    shopName: productWithUrl.shopName,
    genreId: productWithUrl.genreId || "",
    categoryId: productWithUrl.categoryId || "",
    categoryName: productWithUrl.categoryName || "",
    rank: productWithUrl.rank || "",
    fetchedAt: productWithUrl.fetchedAt || "",
    introPrompt,
    introText,
    hashTags: hashTags || makeTags(productWithUrl, data.settings.defaultTagCount).join(" "),
    usageStatus: sameProduct && $("#postType")?.value === "実際に購入した商品" ? "used" : "unknown",
    savedAt: new Date().toISOString(),
    plannedDate: new Date().toISOString().slice(0, 10),
    memo: duplicate ? duplicate : "",
    status: introText ? "文章作成済み" : "未作成",
    postStatus: introText ? "紹介文作成済み" : "紹介文未作成",
    favoriteType: "今すぐ投稿",
    matchedTrendKeywords: productWithUrl.matchedTrendKeywords || [],
    trendSearchPosition: productWithUrl.trendSearchPosition || null,
    performance: productWithUrl.performance || { clicks: null, orders: null, reward: null },
    snsPosts: createSnsPosts()
  };
  Object.assign(candidate, checkProductTrust(productWithUrl));
  applySelectionScore(candidate);
  applyStrategyScores(candidate);
  applyCollectionMetadata(candidate);
  data.candidates.unshift(candidate);
  saveData();
  toast("投稿候補に保存しました。");
}

function createThreadsOnlyCandidate(product, id = crypto.randomUUID()) {
  const itemUrl = product.itemUrl || "";
  const affiliateUrl = product.affiliateUrl || "";
  const productWithUrl = { ...product, itemUrl, affiliateUrl };
  return {
    id,
    destination: "threads_only",
    product: productWithUrl,
    title: productWithUrl.itemName,
    imageUrl: getImage(productWithUrl),
    itemUrl,
    affiliateUrl,
    itemCode: productWithUrl.itemCode,
    price: productWithUrl.itemPrice,
    shopName: productWithUrl.shopName,
    genreId: productWithUrl.genreId || "",
    categoryId: productWithUrl.categoryId || "",
    categoryName: productWithUrl.categoryName || "",
    rank: productWithUrl.rank || "",
    fetchedAt: productWithUrl.fetchedAt || "",
    introPrompt: "",
    introText: "",
    hashTags: "",
    usageStatus: "unknown",
    savedAt: new Date().toISOString(),
    plannedDate: new Date().toISOString().slice(0, 10),
    memo: "Threads限定投稿",
    status: "確認待ち",
    postStatus: "Threads限定",
    threadsStatus: "確認待ち",
    favoriteType: "Threads限定",
    matchedTrendKeywords: productWithUrl.matchedTrendKeywords || [],
    trendSearchPosition: productWithUrl.trendSearchPosition || null,
    performance: productWithUrl.performance || { clicks: null, orders: null, reward: null },
    couponCandidate: Boolean(productWithUrl.couponCandidate),
    discountRate: productWithUrl.discountRate ?? null,
    rateConfirmed: productWithUrl.rateConfirmed === true,
    discountRateType: productWithUrl.discountRateType || "unknown",
    couponDeadline: productWithUrl.couponDeadline || "",
    deadlineConfirmed: productWithUrl.deadlineConfirmed === true,
    couponSource: productWithUrl.couponSource || "",
    couponCheckedAt: productWithUrl.couponCheckedAt || "",
    detectedDiscountRate: productWithUrl.detectedDiscountRate ?? null,
    detectedDiscountSource: productWithUrl.detectedDiscountSource || "",
    detectedDeadline: productWithUrl.detectedDeadline || "",
    detectedDeadlineStart: productWithUrl.detectedDeadlineStart || "",
    detectedDeadlineSource: productWithUrl.detectedDeadlineSource || "",
    snsPosts: createSnsPosts({ threads: { threadsPostType: "performance_v1", performanceUrlMode: productWithUrl.couponCandidate ? "reply" : "body" } })
  };
}

function quickSaveThreadsOnly(product) {
  const productWithUrl = { ...product, itemUrl: product.itemUrl || "", affiliateUrl: product.affiliateUrl || "" };
  const existing = data.candidates.find((item) => isThreadsOnlyItem(item) && rankingIdentity(item.product || item) === rankingIdentity(productWithUrl));
  if (existing) {
    toast("この商品はThreads限定候補へ保存済みです。");
    return;
  }
  const candidate = createThreadsOnlyCandidate(productWithUrl);
  candidate.snsPosts.threads.prompt = buildThreadsPerformancePrompt(candidate);
  candidate.snsPosts.threads.generatedAt = new Date().toISOString();
  ensureThreadsOnlyDraft(candidate);
  Object.assign(candidate, checkProductTrust(productWithUrl));
  applySelectionScore(candidate);
  applyStrategyScores(candidate);
  data.candidates.unshift(candidate);
  saveData();
  renderCandidates();
  toast("Threads限定候補へ保存し、文章の自動下書きを作成しました。ROOM投稿候補には追加していません。");
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderFavorites();
  renderCalendar();
  renderGenreChart();
  renderCandidates();
}

function renderDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const duplicateCount = data.candidates.filter((candidate) => isRoomCandidate(candidate) && findDuplicate(candidate.product, candidate.id)).length;
  const stats = [
    ["今日の投稿候補数", data.candidates.filter((item) => isVisibleRoomCandidate(item) && item.savedAt.slice(0, 10) === today).length],
    ["未投稿の商品数", data.candidates.filter((item) => isVisibleRoomCandidate(item) && item.status !== "投稿済み").length],
    ["今月の投稿数", data.history.filter((item) => item.postedAt.slice(0, 7) === month).length],
    ["重複候補数", duplicateCount]
  ];
  $("#statsGrid").innerHTML = stats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
  $("#recentCandidates").innerHTML = compactItems(data.candidates.filter(isRoomCandidate).slice(0, 5));
  $("#recentHistory").innerHTML = compactItems(data.history.slice(0, 5));
}

function compactItems(items) {
  if (!items.length) return `<p class="message">まだ記録がありません。</p>`;
  return items.map((item) => `<div class="compact-item"><strong>${escapeHtml(item.title)}</strong><br><span class="meta">${formatDate(item.savedAt || item.postedAt)} / ${escapeHtml(item.shopName || item.genreId || "")}</span></div>`).join("");
}

function renderCandidates() {
  let trustUpdated = false;
  data.candidates.forEach((item) => {
    if (!item.trustStatus) {
      Object.assign(item, checkProductTrust(item.product || item));
      trustUpdated = true;
    }
    if (item.scoreVersion !== SELECTION_SCORE_VERSION) {
      applySelectionScore(item);
      trustUpdated = true;
    }
    if (!item.trendScore || !item.opportunityScore || typeof item.todayPriorityScore !== "number") {
      applyStrategyScores(item);
      trustUpdated = true;
    }
    if (isRoomCandidate(item)) {
      const beforeCollectionState = `${item.postType}|${item.recommendedCollection}|${item.collectionStatus}`;
      applyCollectionMetadata(item);
      if (beforeCollectionState !== `${item.postType}|${item.recommendedCollection}|${item.collectionStatus}`) trustUpdated = true;
    }
  });
  if (trustUpdated) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("ROOM候補の補完保存に失敗しました。表示処理は継続します。", error);
    }
  }
  updateCandidateViewCounts();
  const keyword = $("#candidateFilter")?.value?.trim() || "";
  const status = $("#candidateStatusFilter")?.value || "";
  const items = data.candidates.filter((item) => {
    if (!isVisibleRoomCandidate(item)) return false;
    const text = `${item.title} ${item.shopName} ${item.memo}`.toLowerCase();
    const postStatus = item.postStatus || item.status || "投稿待ち";
    return (!keyword || text.includes(keyword.toLowerCase())) && (!status || postStatus === status || item.status === status);
  });
  $("#candidateList").innerHTML = items.length ? items.map(candidateCard).join("") : `<p class="message">投稿候補はまだありません。</p>`;
  renderThreadsOnlyCandidates();
  renderQueueProgress();
  renderCollectionSummary();
}

function updateCandidateViewCounts() {
  const roomCount = data.candidates.filter(isVisibleRoomCandidate).length;
  const threadsCount = data.candidates.filter(isThreadsOnlyItem).length;
  if ($("#roomCandidateCount")) $("#roomCandidateCount").textContent = roomCount;
  if ($("#threadsCandidateCount")) $("#threadsCandidateCount").textContent = threadsCount;
}

function renderThreadsOnlyCandidates() {
  const keyword = $("#candidateFilter")?.value?.trim().toLowerCase() || "";
  const status = $("#candidateStatusFilter")?.value || "";
  const items = data.candidates.filter((item) => {
    if (!isThreadsOnlyItem(item)) return false;
    const text = `${item.title} ${item.shopName} ${item.memo}`.toLowerCase();
    const itemStatus = item.threadsStatus || item.status || "文章作成待ち";
    return (!keyword || text.includes(keyword)) && (!status || itemStatus === status || item.status === status);
  });
  const container = $("#threadsOnlyList");
  if (container) container.innerHTML = items.length ? items.map(renderThreadsOnlyCard).join("") : `<p class="message">Threads限定候補はありません。</p>`;
}

function renderSnsPostEditor(item, medium, label) {
  const posts = item.snsPosts || createSnsPosts();
  const post = posts[medium];
  const options = Object.entries(SNS_POST_TYPES).map(([value, text]) => `<option value="${value}" ${post.postType === value ? "selected" : ""} ${value === "experience" && item.usageStatus !== "used" ? "disabled" : ""}>${text}</option>`).join("");
  const promptId = `sns-prompt-${medium}-${item.id}`;
  const textId = `sns-text-${medium}-${item.id}`;
  const textLength = Array.from(post.text || "").length;
  const lengthLabel = medium === "x" ? `${textLength} / ${SNS_X_MAX_LENGTH}` : textLength;
  const lengthWarning = medium === "x" && textLength > SNS_X_MAX_LENGTH ? "140文字を超えています" : "";
  const isThreadsReply = medium === "threads" && post.threadsPostType === "performance_v1" && post.performanceUrlMode === "reply";
  const performanceControls = medium === "threads" ? `<label>文章モード<select onchange="saveSnsPost('${item.id}', 'threads', 'threadsPostType', this.value); generateSnsPrompt('${item.id}', 'threads'); renderCandidates()"><option value="normal" ${post.threadsPostType !== "performance_v1" ? "selected" : ""}>通常Threads紹介文</option><option value="performance_v1" ${post.threadsPostType === "performance_v1" ? "selected" : ""}>Threads成果型 Ver.1</option></select></label>${post.threadsPostType === "performance_v1" ? `<label>誰向け（任意・修正可）<input value="${escapeAttr(post.performanceAudience || "")}" placeholder="例：iPhone18を買った人へ" oninput="saveSnsPost('${item.id}', 'threads', 'performanceAudience', this.value)"></label><label>${isThreadsOnlyItem(item) ? "投稿方式" : "ROOM URLの扱い"}<select onchange="saveSnsPost('${item.id}', 'threads', 'performanceUrlMode', this.value); generateSnsPrompt('${item.id}', 'threads'); renderCandidates()"><option value="reply" ${post.performanceUrlMode === "reply" ? "selected" : ""}>本文＋返信URL</option><option value="body" ${post.performanceUrlMode !== "reply" ? "selected" : ""}>本文にURL</option></select></label>` : ""}` : "";
  const replyEditor = isThreadsReply ? `<div class="threads-post-section"><h5>Threads生成文章｜コメント欄</h5><label>コメント本文<textarea id="sns-reply-text-${item.id}" oninput="saveSnsPost('${item.id}', 'threads', 'replyText', this.value)">${escapeHtml(post.replyText || "")}</textarea></label><div class="record-actions"><button class="secondary-button" type="button" onclick="copyValue('sns-reply-text-${item.id}')">コメントをコピー</button></div></div>` : "";
  const textHeading = isThreadsReply ? "Threads生成文章｜親投稿" : "生成文章";
  const copyLabel = isThreadsReply ? "親投稿をコピー" : "文章をコピー";
  return `<section class="sns-post-editor" data-sns-medium="${medium}">
    <h4>${label}</h4>
    ${performanceControls}
    <label>投稿タイプ<select onchange="saveSnsPost('${item.id}', '${medium}', 'postType', this.value); generateSnsPrompt('${item.id}', '${medium}')">${options}</select></label>
    <label>生成プロンプト<textarea id="${promptId}" readonly>${escapeHtml(post.prompt || "")}</textarea></label>
    <div class="record-actions"><button class="secondary-button" type="button" onclick="generateSnsPrompt('${item.id}', '${medium}')">生成プロンプトを作成</button><button class="secondary-button" type="button" onclick="copyValue('${promptId}')">生成プロンプトをコピー</button><button class="secondary-button" type="button" onclick="openSnsChatGPT('${item.id}', '${medium}')">ChatGPT用プロンプトをコピー</button></div>
    <div class="threads-post-section"><h5>${textHeading}</h5><label>投稿本文<textarea id="${textId}" oninput="saveSnsPost('${item.id}', '${medium}', 'text', this.value)">${escapeHtml(post.text || "")}</textarea></label>
    <p>文字数：<span data-sns-count="${textId}" class="${lengthWarning ? "sns-count-warning" : ""}">${lengthLabel}</span> <span data-sns-warning="${textId}" class="sns-count-warning">${lengthWarning}</span></p>
    <div class="record-actions"><button class="secondary-button" type="button" onclick="copyValue('${textId}')">${copyLabel}</button><button class="secondary-button" type="button" onclick="markSnsPosted('${item.id}', '${medium}')">投稿済みにする</button></div></div>
    ${replyEditor}
  </section>`;
}

function getSnsPostStatus(post) {
  if (!post) return "未作成";
  if (post.status === "posted") return "投稿済み";
  if (post.text?.trim()) return "文章作成済み";
  if (post.prompt?.trim()) return "プロンプト作成済み";
  return "未作成";
}

function renderSnsStatusSummary(item) {
  const posts = item.snsPosts || createSnsPosts();
  const xStatus = getSnsPostStatus(posts.x);
  const threadsStatus = getSnsPostStatus(posts.threads);
  return `<div class="sns-status-summary" aria-label="SNS文章の作成状況">
    <strong>SNS文章の作成状況</strong>
    <span class="sns-status sns-status-${xStatus === "文章作成済み" || xStatus === "投稿済み" ? "done" : "pending"}">X：${xStatus}</span>
    <span class="sns-status sns-status-${threadsStatus === "文章作成済み" || threadsStatus === "投稿済み" ? "done" : "pending"}">Threads：${threadsStatus}</span>
  </div>`;
}

function renderSnsEditor(item) {
  const posts = item.snsPosts || createSnsPosts();
  const snsCodexReady = canStartSnsCodex(item);
  const snsCodexPromptId = `sns-codex-prompt-${item.id}`;
  return `<details id="sns-editor-${escapeAttr(item.id)}" class="sns-posts"><summary>SNS文章（X：${getSnsPostStatus(posts.x)} / Threads：${getSnsPostStatus(posts.threads)}）</summary>
    <section class="sns-codex-actions" aria-label="CodexでSNS文章を作成">
      <h4>通常：CodexでX・Threads作成</h4>
      <p class="meta">ROOM個別URL登録後、CodexがX・Threads本文を作成し、この画面へ直接反映します。</p>
      <button class="primary-button" type="button" onclick="startSnsCodexPost('${item.id}')" ${snsCodexReady ? "" : "disabled"}>CodexでX・Threads作成</button>
      ${snsCodexReady ? `<details class="sns-codex-prompt"><summary>Codex用SNS指示文を確認</summary><textarea id="${snsCodexPromptId}" readonly>${escapeHtml(item.snsCodexPrompt || "")}</textarea><button class="secondary-button" type="button" onclick="copyValue('${snsCodexPromptId}')">指示文をコピー</button></details>` : `<p class="message">ROOM個別URLを登録完了すると実行できます。</p>`}
    </section>
    ${renderSnsPostEditor(item, "x", "X")}
    ${renderSnsPostEditor(item, "threads", "Threads")}
    <button class="primary-button" type="button" onclick="generateCombinedSnsPrompt('${item.id}')">X・Threads生成プロンプトをまとめてコピー</button>
    <label>AI生成結果をまとめて貼り付け<textarea id="sns-posts-result-${item.id}" placeholder="===X_POST===\n...\n===END_X_POST===\n\n===THREADS_POST===\n...\n===END_THREADS_POST==="></textarea></label>
    <button class="secondary-button" type="button" onclick="applySnsPostsResult('${item.id}')">X・Threadsに反映</button>
  </details>`;
}

function renderRoomUrlEditor(item) {
  const roomUrl = item.roomUrl || "";
  const [notice, noticeType] = getRoomUrlNotice(item);
  return `<div class="room-url-editor" aria-label="ROOM個別URL設定">
    <strong>ROOM個別URL</strong>
    <p id="room-url-status-${escapeAttr(item.id)}" class="room-url-status room-url-status-${noticeType}">${escapeHtml(notice)}</p>
    <label>ROOM個別URLを入力<input id="room-url-input-${escapeAttr(item.id)}" type="url" value="${escapeAttr(roomUrl)}" placeholder="https://room.rakuten.co.jp/room_xxxxx/1700..." oninput="updateRoomUrlInputState('${item.id}', this.value)"></label>
    <div class="record-actions"><button id="room-url-register-${escapeAttr(item.id)}" class="secondary-button" type="button" onclick="registerRoomUrl('${item.id}')" ${roomUrl ? "" : "disabled"}>登録完了</button></div>
    ${roomUrl && item.snsPosts?.x?.prompt && item.snsPosts?.threads?.prompt ? `<p class="room-url-ready">X・Threads文章生成準備完了</p>` : ""}
  </div>`;
}

function renderCombinedContentGenerator(item) {
  const promptId = `combined-sns-prompt-${item.id}`;
  const resultId = `combined-sns-result-${item.id}`;
  return `<section class="combined-content-generator" aria-label="ROOM・X・Threads一括作成">
    <h4>通常：ROOM・X・Threadsをまとめて作成</h4>
    <p class="meta">ChatGPTなどへ1回渡し、4項目をまとめてアプリへ反映できます。</p>
    ${renderRoomUrlEditor(item)}
    <div class="record-actions">
      <button class="primary-button" type="button" onclick="generateCombinedContentPrompt('${item.id}')">ROOM・X・Threadsをまとめて作成</button>
      <button class="secondary-button" type="button" onclick="copyValue('${promptId}')">統合プロンプトをコピー</button>
      <button class="primary-button" type="button" onclick="openCombinedContentChatGPT('${item.id}')">ChatGPT用統合プロンプトをコピー</button>
    </div>
    <label>統合生成プロンプト<textarea id="${promptId}" readonly>${escapeHtml(item.combinedPrompt || "")}</textarea></label>
    <label>AI生成結果をまとめて貼り付け<textarea id="${resultId}" placeholder="===ROOM_INTRO===\n...\n===END_ROOM_INTRO===\n\n===ROOM_HASHTAGS===\n...\n===END_ROOM_HASHTAGS===\n\n===X_POST===\n...\n===END_X_POST===\n\n===THREADS_POST===\n...\n===END_THREADS_POST==="></textarea></label>
    <button class="secondary-button" type="button" onclick="applyCombinedSnsResult('${item.id}')">4項目に反映</button>
    ${codexPasteErrors.has(item.id) ? `<p class="message" role="alert">${escapeHtml(codexPasteErrors.get(item.id))}</p>` : ""}
  </section>`;
}

function renderCollectionSummary() {
  const element = $("#collectionSummary");
  if (!element) return;
  const counts = new Map(COLLECTIONS.filter((collection) => collection.enabled).map((collection) => [collection.id, { recommended: 0, selected: 0 }]));
  data.candidates.filter(isRoomCandidate).forEach((item) => {
    if (counts.has(item.recommendedCollection)) counts.get(item.recommendedCollection).recommended += 1;
    if (counts.has(item.selectedCollection)) counts.get(item.selectedCollection).selected += 1;
  });
  element.innerHTML = COLLECTIONS.filter((collection) => collection.enabled).map((collection) => {
    const count = counts.get(collection.id);
    return `<p><strong>${escapeHtml(collection.name)}</strong><br>推奨 ${count.recommended}件 / 選択 ${count.selected}件</p>`;
  }).join("") || `<p class="message">有効なコレクションはありません。</p>`;
}

function renderQueueProgress() {
  const progress = $("#queue-progress");
  if (!progress) return;
  const roomCandidates = data.candidates.filter(isRoomCandidate);
  const queue = roomCandidates.filter((item) => !["投稿済み", "スキップ"].includes(item.postStatus));
  const active = roomCandidates.find((item) => ["Codex処理中", "確認待ち"].includes(item.postStatus));
  if (!queue.length) {
    progress.textContent = "処理対象の商品はありません。";
    return;
  }
  if (!active) {
    progress.textContent = `投稿待ち ${queue.filter((item) => item.postStatus === "投稿待ち").length}件。連続処理開始で先頭の商品を準備します。`;
    return;
  }
  const position = roomCandidates.findIndex((item) => item.id === active.id) + 1;
  progress.textContent = `現在の処理商品：${active.title}（${position} / ${roomCandidates.length}件） / 状態：${active.postStatus}`;
}

function buildQueueCandidate(product) {
  const itemUrl = product.itemUrl || product.affiliateUrl || "";
  const productWithUrl = product.itemUrl === itemUrl ? product : { ...product, itemUrl };
  const candidate = {
    id: crypto.randomUUID(),
    destination: "room",
    product: productWithUrl,
    title: productWithUrl.itemName,
    imageUrl: getImage(productWithUrl),
    itemUrl,
    affiliateUrl: productWithUrl.affiliateUrl || "",
    itemCode: productWithUrl.itemCode || productWithUrl.product?.itemCode || "",
    price: productWithUrl.itemPrice,
    shopName: productWithUrl.shopName || "",
    genreId: productWithUrl.genreId || "",
    categoryId: productWithUrl.categoryId || productWithUrl.genreId || "",
    categoryName: productWithUrl.categoryName || "",
    rank: productWithUrl.rank || "",
    fetchedAt: productWithUrl.fetchedAt || new Date().toISOString(),
    introPrompt: "",
    introText: "",
    hashTags: makeTags(productWithUrl, data.settings.defaultTagCount).join(" "),
    usageStatus: "unknown",
    savedAt: new Date().toISOString(),
    plannedDate: new Date().toISOString().slice(0, 10),
    memo: "",
    status: "未作成",
    postStatus: "投稿待ち",
    favoriteType: "今すぐ投稿",
    matchedTrendKeywords: productWithUrl.matchedTrendKeywords || [],
    trendSearchPosition: productWithUrl.trendSearchPosition || null,
    performance: productWithUrl.performance || { clicks: null, orders: null, reward: null },
    couponCandidate: Boolean(productWithUrl.couponCandidate),
    couponSearchFilters: productWithUrl.couponSearchFilters || []
  };
  applyCouponEvidenceToCandidate(candidate, productWithUrl);
  Object.assign(candidate, checkProductTrust(productWithUrl));
  applySelectionScore(candidate);
  applyStrategyScores(candidate);
  applyCollectionMetadata(candidate);
  return candidate;
}

function queueSelectedRanking() {
  const message = $("#rankingMessage");
  const selected = searchResults.filter((product) => product.selectionStatus === "selected");
  if (!selected.length) {
    message.textContent = "選択した順位帯に投稿可能な商品がありません。先にランキングを取得してください。";
    toast("投稿キューへ追加できる採用商品がありません。");
    return;
  }

  const existingIdentities = new Set([...data.candidates.filter(isRoomCandidate), ...data.history].map((item) => rankingIdentity(item.product || item)));
  const added = [];
  const skipped = [];
  selected.forEach((product) => {
    const identity = rankingIdentity(product);
    if (existingIdentities.has(identity)) {
      product.selectionStatus = "existing_duplicate";
      product.selectionReason = "投稿キューまたは投稿履歴に登録済み";
      skipped.push(product);
      return;
    }
    const candidate = buildQueueCandidate(product);
    data.candidates.push(candidate);
    existingIdentities.add(identity);
    added.push(candidate);
  });

  if (added.length) {
    saveData();
    renderRankingResults(searchResults);
    showTab("candidates");
    message.textContent = `${added.length}件を投稿キューへ追加しました。${skipped.length ? ` ${skipped.length}件は登録済みのため除外しました。` : ""}`;
    toast(`${added.length}件を投稿キューへ追加しました。`);
  } else {
    renderRankingResults(searchResults);
    message.textContent = "選択した順位帯に投稿可能な商品がありません。登録済みの商品は除外しました。";
    toast("登録済みの商品は投稿キューへ追加しませんでした。");
  }
}

function parseCodexResult(rawText) {
  const itemCode = rawText.match(/(?:^|\n)\s*ITEM_CODE:\s*([^\n]+)/)?.[1]?.trim() || "";
  const introText = rawText.match(/(?:^|\n)\s*紹介文:\s*([\s\S]*?)(?=\n\s*(?:短い紹介文|ハッシュタグ):)/)?.[1]?.trim() || "";
  const hashTags = rawText.match(/(?:^|\n)\s*ハッシュタグ:\s*([\s\S]*?)(?=\n\s*(?:セール情報|状態):|$)/)?.[1]?.trim() || "";
  const isConfirmationReady = /(?:^|\n)\s*状態:\s*確認待ち(?:\s|$)/.test(rawText);
  return { itemCode, introText, hashTags, isConfirmationReady };
}

function resetCodexCandidateAfterFailure(candidate) {
  if (!candidate) return false;
  candidate.postStatus = "エラー";
  candidate.status = "投稿待ち";
  return true;
}

function recoverCodexProcessingCandidate() {
  const candidate = data.candidates.find((item) => isRoomCandidate(item) && item.postStatus === "Codex処理中");
  if (!candidate) return false;
  resetCodexCandidateAfterFailure(candidate);
  saveData();
  renderCandidates();
  return true;
}

function applyCodexResult() {
  const message = $("#codex-result-message");
  const parsed = parseCodexResult($("#codex-result-input").value || "");
  const fail = (text) => { recoverCodexProcessingCandidate(); message.textContent = text; toast(text); };
  if (!parsed.itemCode) return fail("ITEM_CODEがないため保存していません。");
  const matches = data.candidates.filter(isRoomCandidate).filter((item) => (item.itemCode || item.product?.itemCode || "") === parsed.itemCode);
  if (matches.length !== 1) return fail(matches.length ? "ITEM_CODEが複数商品に一致したため保存していません。" : "ITEM_CODEが投稿キューに一致しないため保存していません。");
  if (!parsed.introText || !parsed.hashTags || !parsed.isConfirmationReady) return fail("紹介文・ハッシュタグ・状態:確認待ちを確認できないため保存していません。");
  const copyError = validateGeneratedCopy(parsed.introText, matches[0]);
  if (copyError) return fail(copyError);
  if (`${parsed.introText}\n${parsed.hashTags}`.length > 500) return fail("紹介文とハッシュタグが500文字を超えているため保存していません。");
  const candidate = matches[0];
  const blocker = getProcessingBlocker(candidate.id);
  if (blocker) return fail(`別の商品「${blocker.title}」が${blocker.postStatus}のため、同時に保存できません。`);
  candidate.introText = parsed.introText;
  candidate.hashTags = parsed.hashTags;
  candidate.status = "文章作成済み";
  candidate.postStatus = "確認待ち";
  saveData();
  const saved = data.candidates.find((item) => item.id === candidate.id);
  if (!saved || saved.introText !== parsed.introText || saved.hashTags !== parsed.hashTags) {
    if (saved) { saved.postStatus = "エラー"; saveData(); }
    return fail("保存後の内容確認に失敗したため、確認待ちにしていません。");
  }
  message.textContent = `ITEM_CODE ${parsed.itemCode} の商品へ保存しました。状態: 確認待ち`;
  toast("Codex結果を対象商品へ反映しました。");
}

function selectWarningReasons(trust = {}) {
  const reasons = Array.isArray(trust.trustReasons) ? trust.trustReasons : [];
  const severityOrder = { high: 0, warning: 1, info: 2 };
  return reasons
    .filter((reason) => reason && (reason.label || reason.detail))
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
    .slice(0, 4);
}

function warningEmojiFor(product = {}) {
  const text = stripHtml(`${product.itemName || ""} ${product.itemCaption || ""}`);
  if (/(SSD|USBメモリ|microSD|SDカード|ハードディスク|HDD)/i.test(text)) return "💾";
  if (/(モバイルバッテリー|充電器|電源|ACアダプター)/i.test(text)) return "🔋";
  if (/(スマホ|携帯|iPhone|Android)/i.test(text)) return "📱";
  if (/(旅行|スーツケース|キャリー)/i.test(text)) return "✈️";
  if (/(美容|コスメ|化粧)/i.test(text)) return "✨";
  if (/(キッチン|調理|フライパン|マグ)/i.test(text)) return "🍳";
  return "🛍️";
}

function generateWarningPrompt(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return;
  const trust = candidate.trustStatus ? candidate : { ...candidate, ...checkProductTrust(candidate.product || candidate) };
  const product = candidate.product || candidate;
  const selectedReasons = selectWarningReasons(trust);
  const reasons = selectedReasons.map((reason) => `- code=${reason.code || "未設定"} / severity=${reason.severity || "info"} / ${reason.label || "確認事項"}：${reason.detail || "詳細なし"}`).join("\n") || "- 商品情報だけでは判断材料が不足しています。";
  const reviewText = trust.reviewAverage && trust.reviewCount
    ? `${trust.reviewAverage} / ${trust.reviewCount}件`
    : "取得できたレビュー情報なし";
  const warningSources = [
    `trustReasons（重要度順・最大4件）：\n${reasons}`,
    `manufacturer：${trust.manufacturer || "取得情報から確認できない"}`,
    `modelNumber：${trust.modelNumber || "取得情報から確認できない"}`,
    `specWarnings：${JSON.stringify(trust.specWarnings || [])}`,
    `priceWarning：${JSON.stringify(trust.priceWarning || null)}`,
    `descriptionWarnings：${JSON.stringify(trust.descriptionWarnings || [])}`,
    `reviewAverage / reviewCount：${reviewText}`
  ].join("\n");
  const emoji = warningEmojiFor(product);
  candidate.warningContentCandidate = true;
  candidate.introPrompt = [
    "楽天ROOM向けの注意喚起文章を作成してください。",
    "目的は商品を攻撃することではなく、商品ページから確認できた事項を使って、購入前の確認を促すことです。",
    "",
    `商品名：${candidate.title || product.itemName || ""}`,
    `価格：${formatYen(candidate.price ?? product.itemPrice)}`,
    `ショップ名：${candidate.shopName || product.shopName || ""}`,
    `商品説明：${stripHtml(product.itemCaption || "")}`,
    "",
    "【使用してよい根拠】",
    warningSources,
    "",
    "【本文の構成】",
    "1. 冒頭40〜50文字：誰が何を買う前に確認した方がよいか。例『大容量SSDを安く探している方、容量と価格だけで決める前に少し確認を💾』。過度に煽らない。",
    "2. 気になる理由",
    "3. 確認できた事実",
    "4. 購入前に確認してほしい項目",
    "5. 中立的な締め：確認して、他の商品とも比較して判断する流れ。将来の代替商品紹介につなげやすくする。",
    "",
    "【事実と推測のルール】",
    "・上記の使用してよい根拠にない問題点を追加しない。trustReasonsから重要度がhigh→warning→infoの順に、存在する範囲で2〜4項目だけ自然に使う。",
    "・確認できない場合は『商品ページ上ではメーカー名を確認できませんでした』『取得情報から型番を確認できませんでした』と書く。『メーカー不明』『型番が存在しない』とは断定しない。",
    "・レビュー評価がある場合は隠さず書いてよいが、『レビューが高いから安全』とは書かない。",
    `・本文に商品カテゴリーの絵文字を1〜3個だけ自然に入れる。今回の候補：${emoji}。⚠️ 🚨 ❌ 🔥 😱 は使わない。絵文字で危険性を強調しない。`,
    "",
    "【禁止表現】",
    "『偽物』『詐欺』『詐欺商品』『危険商品』『粗悪品』『絶対買わない方がいい』『絶対に買ってはいけない』『容量偽装している』『騙されないで』『悪質ショップ』は禁止。実機検証していない容量や性能を断定しない。",
    "",
    "【出力形式】",
    "【注意喚起文】",
    "本文",
    "",
    "【確認ポイント】",
    "・購入前に確認する項目を2〜4個",
    "",
    "【ハッシュタグ】",
    "商品カテゴリーに合う中立的なタグを5〜7個。煽り系タグは禁止。ROOM投稿では注意喚起文とハッシュタグを使用する。"
  ].join("\n");
  saveData();
  copyText(candidate.introPrompt, { silent: true });
  toast("注意喚起文章の指示文を作成しました。");
}

function renderThreadsOnlyEditor(item) {
  const threads = item.snsPosts?.threads || createSnsPosts().threads;
  const textId = `threads-only-text-${item.id}`;
  const replyId = `threads-only-reply-${item.id}`;
  const promptId = `threads-only-prompt-${item.id}`;
  const shortUrl = String(item.affiliateShortUrl || "").trim();
  const affiliateUrl = String(item.affiliateUrl || item.product?.affiliateUrl || "").trim();
  const selectedUrl = shortUrl || affiliateUrl;
  const urlStatus = shortUrl ? "🟢 楽天公式短縮URL 登録済み" : affiliateUrl ? "🟡 API取得URLを使用" : "🔴 アフィリエイトURLなし";
  const replyEditor = threads.performanceUrlMode === "reply"
    ? `<div class="threads-post-section"><h5>Threads生成文章｜コメント欄</h5><label>コメント本文<textarea id="${replyId}" oninput="saveSnsPost('${item.id}', 'threads', 'replyText', this.value)">${escapeHtml(threads.replyText || "")}</textarea></label><p class="meta">${selectedUrl ? "選択中のURLを完全一致で1回だけ使用します。" : "アフィリエイトURL未取得のため、コメント用URLは作成していません。"}</p><div class="record-actions"><button class="secondary-button" type="button" onclick="copyValue('${replyId}')">コメントをコピー</button></div></div>`
    : "";
  return `<section class="threads-only-editor" aria-label="Threads限定文章">
    <h4>Threads限定文章（成果型 Ver.1）</h4>
    <label>誰向け（任意・修正可）<input value="${escapeAttr(threads.performanceAudience || "")}" placeholder="例：クローゼットの収納が足りない人" oninput="saveSnsPost('${item.id}', 'threads', 'performanceAudience', this.value)"></label>
    <p class="meta">ROOM URLは使用しません。${escapeHtml(urlStatus)}</p>
    <div class="affiliate-short-url-editor">
      <label>楽天公式短縮URL<input id="threads-short-url-${escapeAttr(item.id)}" type="url" value="${escapeAttr(shortUrl)}" placeholder="https://a.r10.to/xxxxxx"></label>
      <p class="small-note">楽天アフィリエイト公式で作成したa.r10.toの短縮URLを登録できます。未登録の場合はAPI取得済みaffiliateUrlを使用します。</p>
      <div class="record-actions"><button class="secondary-button" type="button" onclick="registerAffiliateShortUrl('${item.id}')">短縮URLを登録</button>${shortUrl ? `<button class="danger-button" type="button" onclick="removeAffiliateShortUrl('${item.id}')">短縮URLを削除</button>` : ""}</div>
    </div>
    <label>生成プロンプト<textarea id="${promptId}" readonly>${escapeHtml(threads.prompt || "")}</textarea></label>
    <div class="record-actions"><button class="secondary-button" type="button" onclick="generateThreadsOnlyPrompt('${item.id}')">成果型プロンプトを作成</button><button class="secondary-button" type="button" onclick="copyValue('${promptId}')">プロンプトをコピー</button><button class="primary-button" type="button" onclick="startThreadsOnlyCodex('${item.id}')">CodexでThreads文章作成</button></div>
    <p class="message">登録時に安全な自動下書きを作成済みです。必要に応じてCodexで書き直せます。</p>
    <div class="threads-post-section"><h5>Threads生成文章｜親投稿</h5><label>親投稿本文<textarea id="${textId}" oninput="saveSnsPost('${item.id}', 'threads', 'text', this.value)">${escapeHtml(threads.text || "")}</textarea></label>
    <p>文字数：<span>${Array.from(threads.text || "").length}</span></p>
    <div class="record-actions"><button class="secondary-button" type="button" onclick="copyValue('${textId}')">親投稿をコピー</button></div></div>
    ${replyEditor}
    <label>Codex結果をまとめて貼り付け<textarea id="threads-only-result-${item.id}" placeholder="===THREADS_POST===\n...\n===END_THREADS_POST==="></textarea></label>
    <div class="record-actions"><button class="secondary-button" type="button" onclick="applyThreadsOnlyResult('${item.id}')">Threads文章に反映</button><button class="secondary-button" type="button" onclick="markThreadsOnlyPosted('${item.id}')">投稿済みにする</button></div>
  </section>`;
}

function renderThreadsOnlyCard(item) {
  const threads = item.snsPosts?.threads || createSnsPosts().threads;
  const trust = item.trustStatus ? item : { ...item, ...checkProductTrust(item.product || item) };
  const affiliateUrl = String(item.affiliateUrl || item.product?.affiliateUrl || "").trim();
  const coupon = getCouponEvidence(item);
  const urlMode = threads.performanceUrlMode === "reply" ? "本文＋返信URL" : "本文にURL";
  return `<article class="record-card candidate-card threads-only-card" data-candidate-id="${escapeAttr(item.id)}" data-destination="threads_only">
    <img src="${escapeAttr(item.imageUrl)}" alt="">
    <div>
      <h3>${escapeHtml(item.title)}</h3>
      <p><span class="badge">Threads限定</span> ${formatYen(item.price)} / ${escapeHtml(item.shopName)}</p>
      <p class="meta">${escapeHtml(item.categoryName || "カテゴリー未設定")} / ${item.rank ? `${escapeHtml(item.rank)}位` : "順位未設定"}</p>
      <p class="affiliate-url-status">${item.affiliateShortUrl ? "楽天公式短縮URL 登録済み" : affiliateUrl ? "API取得URLを使用" : "アフィリエイトURLなし"}</p>
      ${item.couponCandidate ? `<p class="coupon-status">割引率：${coupon.discountRate ? `${coupon.discountRate}%OFF` : "未確認"}（${coupon.rateConfirmed && coupon.discountRateType === "exact" ? "確認済み" : "要確認"}）</p><p class="coupon-status">期限：${escapeHtml(coupon.couponDeadline || "未確認")}（${coupon.deadlineConfirmed ? "確認済み" : "要確認"}）</p><p class="coupon-status">投稿方式：${urlMode}</p>` : ""}
      <p class="trust-status" aria-label="商品信頼性判定">${escapeHtml(trust.trustStatus || "要確認")}（${trust.trustScore ?? "-"}点・検証中）</p>
      <p class="post-status-line"><span class="badge post-status-badge">${escapeHtml(item.threadsStatus || "文章作成待ち")}</span></p>
      ${renderThreadsOnlyEditor(item)}
      <div class="record-actions"><button class="secondary-button" type="button" onclick="setThreadsOnlyStatus('${item.id}', '確認待ち')">確認待ちにする</button><button class="danger-button" type="button" onclick="deleteCandidate('${item.id}')">削除</button></div>
    </div>
  </article>`;
}

function buildThreadsOnlyCodexInstructions(item) {
  const threads = item.snsPosts?.threads || createSnsPosts().threads;
  const affiliateUrl = getThreadsLink(item);
  const linkStatus = affiliateUrl ? `使用する楽天アフィリエイトURL：${affiliateUrl}` : "楽天アフィリエイトURL未取得。使用するURLなし。URLを推測・生成・代用しない。";
  return `Threads限定投稿の商品について、CodexがChrome上の楽天ROOM投稿アシスタントを操作して文章を作成し、結果欄へ直接反映してください。ROOM投稿、ROOM URL取得、X文章作成は行いません。\n\n【商品情報】\n${getSnsProductFacts(item)}\n商品URL：${item.itemUrl || "未設定"}\n${linkStatus}\n\n【文章モード】\nThreads成果型 Ver.1（performance_v1）\n誰向け：${threads.performanceAudience || "商品情報から根拠のある対象者を短く示し、人間が確認できるようにする"}\nROOM URL：使用しない（Threads限定投稿）\nThreads限定投稿用URLは保存済みの楽天公式短縮URLを優先し、未登録なら楽天APIが返したaffiliateUrlを使用する。itemUrlやROOM URLを代用しない。\n\n【作成ルール】\n${buildThreadsPerformancePrompt(item)}\n未確認のセール、割引率、クーポン、期限、イベント情報を追加しない。外部Threadsへ投稿せず、アプリへ反映して人間の確認待ちで停止する。`;
}

function generateThreadsOnlyPrompt(id) {
  const item = data.candidates.find((candidate) => candidate.id === id && isThreadsOnlyItem(candidate));
  if (!item) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts.threads.threadsPostType = "performance_v1";
  item.snsPosts.threads.prompt = buildThreadsPerformancePrompt(item);
  item.snsPosts.threads.generatedAt = new Date().toISOString();
  saveData();
  renderCandidates();
  copyText(item.snsPosts.threads.prompt, { silent: true });
  toast("Threads成果型プロンプトを作成しました。");
}

function startThreadsOnlyCodex(id) {
  const item = data.candidates.find((candidate) => candidate.id === id && isThreadsOnlyItem(candidate));
  if (!item) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts.threads.threadsPostType = "performance_v1";
  item.snsPosts.threads.prompt = buildThreadsPerformancePrompt(item);
  item.snsPosts.threads.generatedAt = new Date().toISOString();
  item.threadsCodexPrompt = buildThreadsOnlyCodexInstructions(item);
  item.threadsCodexGeneratedAt = new Date().toISOString();
  saveData();
  copyText(item.threadsCodexPrompt, { silent: true });
  toast("Threads限定用のCodex指示文を作成しました。Codexが文章を作成してアプリへ反映できます。");
}

function validateThreadsOnlyResult(item, parsed) {
  const threads = item.snsPosts?.threads || {};
  const bodyError = validateSnsPostText(threads.performanceUrlMode === "reply" ? { ...item, skipRequiredLink: true } : item, "threads", parsed.threadsText);
  if (bodyError) return bodyError;
  if (threads.performanceUrlMode === "reply") {
    const affiliateUrl = getThreadsLink(item);
    if (affiliateUrl && countTextOccurrences(parsed.threadsReplyText, affiliateUrl) !== 1) return "Threads返信用文章に登録済み楽天アフィリエイトURLを1回だけ含めてください。";
    if (!affiliateUrl && parsed.threadsReplyText) return "楽天アフィリエイトURL未設定時は返信用URLを作成しないでください。";
  }
  return "";
}

function applyThreadsOnlyResultToItem(item, parsed) {
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts.threads.threadsPostType = "performance_v1";
  item.snsPosts.threads.text = parsed.threadsText;
  item.snsPosts.threads.replyText = parsed.threadsReplyText || "";
  item.snsPosts.threads.status = "draft";
  item.threadsStatus = "確認待ち";
  item.status = "確認待ち";
  return item;
}

function applyThreadsOnlyResult(id) {
  const item = data.candidates.find((candidate) => candidate.id === id && isThreadsOnlyItem(candidate));
  const input = document.querySelector(`#threads-only-result-${id}`);
  if (!item || !input) return;
  const parsed = parseSnsPostsResult(input.value || "");
  const error = validateThreadsOnlyResult(item, parsed);
  if (error) {
    toast(`${error} 既存のThreads文章は保存していません。`);
    return;
  }
  applyThreadsOnlyResultToItem(item, parsed);
  saveData();
  renderCandidates();
  toast("Threads限定文章を保存しました。ROOM候補・ROOM文章・Xは変更していません。");
}

function setThreadsOnlyStatus(id, status) {
  const item = data.candidates.find((candidate) => candidate.id === id && isThreadsOnlyItem(candidate));
  if (!item) return;
  item.threadsStatus = status;
  item.status = status;
  saveData();
  renderCandidates();
}

function markThreadsOnlyPosted(id) {
  const item = data.candidates.find((candidate) => candidate.id === id && isThreadsOnlyItem(candidate));
  if (!item) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  const error = validateThreadsOnlyResult(item, { threadsText: item.snsPosts.threads.text, threadsReplyText: item.snsPosts.threads.replyText });
  if (error) {
    toast(`${error} 投稿済みには変更していません。`);
    return;
  }
  item.snsPosts.threads.status = "posted";
  item.snsPosts.threads.postedAt = new Date().toISOString();
  item.threadsStatus = "投稿済み";
  item.status = "投稿済み";
  saveData();
  renderCandidates();
  toast("Threads限定投稿を投稿済みにしました。");
}

function candidateCard(item) {
  const trust = item.trustStatus ? item : { ...item, ...checkProductTrust(item.product || item) };
  const coupon = item.couponCandidate ? getCouponEvidence(item) : null;
  const trustLabels = { "通常投稿候補": "🟢 通常投稿候補", "要確認": "🟡 要確認", "注意喚起候補": "🟠 注意喚起候補", "投稿対象外": "🔴 投稿対象外" };
  const trustReasonText = (trust.trustReasons || []).map((reason) => `${reason.label}：${reason.detail}`).join("\n");
  const itemUrl = item.itemUrl || item.product?.itemUrl || item.product?.affiliateUrl || "";
  const itemCode = item.itemCode || item.product?.itemCode || "";
  const productButtonLabel = `楽天商品ページを開く ${item.title || item.product?.itemName || ""}`;
  const productLink = itemUrl
    ? `<a class="secondary-button product-link-button" href="${escapeAttr(itemUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(productButtonLabel)}" data-item-code="${escapeAttr(itemCode)}" data-item-url="${escapeAttr(itemUrl)}">楽天商品ページを開く</a>`
    : `<button class="secondary-button product-link-button" type="button" disabled aria-label="商品URLなし ${escapeAttr(item.title || "")}" data-item-code="${escapeAttr(itemCode)}">商品URLなし</button>`;
  return `
    <article class="record-card candidate-card" data-candidate-id="${escapeAttr(item.id)}" data-item-code="${escapeAttr(item.itemCode || item.product?.itemCode || "")}" data-item-url="${escapeAttr(itemUrl)}">
      <img src="${escapeAttr(item.imageUrl)}" alt="">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="record-actions candidate-product-actions">${productLink}</div>
        <p><span class="badge">${escapeHtml(item.status)}</span> ${formatYen(item.price)} / ${escapeHtml(item.shopName)}</p>
        <p class="meta">${escapeHtml(item.categoryName || "カテゴリー未設定")} / ${item.rank ? `${escapeHtml(item.rank)}位` : "順位未設定"}</p>
        <p class="trust-status" aria-label="商品信頼性判定">${trustLabels[trust.trustStatus] || "🟡 要確認"}（${trust.trustScore ?? "-"}点・検証中）</p>
        <p class="collection-status"><strong>投稿タイプ：</strong>${escapeHtml({ normal: "通常商品", sale: "セール商品", used: "使用済み商品", warning: "注意喚起商品" }[item.postType] || "通常商品")}</p>
        ${coupon ? `<p class="coupon-status">割引率：${coupon.discountRate ? `${coupon.discountRate}%OFF` : "未確認"}（${coupon.rateConfirmed && coupon.discountRateType === "exact" ? "確認済み" : "要確認"}） / 期限：${escapeHtml(coupon.couponDeadline || "未確認")}（${coupon.deadlineConfirmed ? "確認済み" : "要確認"}）</p>` : ""}
        ${item.recommendedCollection ? `<p class="collection-status"><strong>推奨コレクション：</strong>${escapeHtml(getCollectionById(item.recommendedCollection)?.name || item.recommendedCollection)}</p><details class="collection-details"><summary>推奨理由を見る</summary><p>${escapeHtml(item.collectionReason || "既存の信頼性チェック結果に基づく推奨です。")}</p></details>` : ""}
        <label class="collection-select"><strong>選択コレクション</strong><select onchange="updateCandidate('${item.id}', 'selectedCollection', this.value)">${collectionOptions(item.selectedCollection)}</select></label>
        <p class="selection-score">選定スコア：${getSelectionTotal(item)} / 100</p><p class="selection-score">${item.matchedTrendKeywords?.length ? "購買トレンド適合" : "トレンド適合"}：${item.trendScore?.total ?? 0} / ${item.matchedTrendKeywords?.length ? 30 : 20}　投稿機会：${item.opportunityScore?.total ?? 0} / 20</p><p class="selection-score"><strong>今日の投稿優先度：${item.todayPriorityScore ?? getSelectionTotal(item)} / ${item.matchedTrendKeywords?.length ? 100 : 140}</strong></p><p class="selection-grade">${escapeHtml(item.selectionGrade || selectionGrade(getSelectionTotal(item)))}</p><details class="selection-details"><summary>選定理由・訴求材料を見る</summary><p>${escapeHtml((item.priorityReasons || item.selectionReason || item.selectionReasons || []).join("\n")).replaceAll("\n", "<br>")}</p><p>${item.buyAroundCandidate ? "買い回り候補" : ""}</p></details>
        ${trustReasonText ? `<details class="trust-details"><summary>判定理由を見る</summary><p>${escapeHtml(trustReasonText).replaceAll("\n", "<br>")}</p></details>` : ""}
        <label>紹介文<textarea id="candidate-intro-${escapeAttr(item.id)}" data-item-code="${escapeAttr(item.itemCode || item.product?.itemCode || "")}" data-item-url="${escapeAttr(itemUrl)}" onchange="updateCandidate('${item.id}', 'introText', this.value)">${escapeHtml(item.introText)}</textarea></label>
        <label>ハッシュタグ<textarea id="candidate-hashtags-${escapeAttr(item.id)}" data-item-code="${escapeAttr(item.itemCode || item.product?.itemCode || "")}" data-item-url="${escapeAttr(itemUrl)}" onchange="updateCandidate('${item.id}', 'hashTags', this.value)">${escapeHtml(item.hashTags)}</textarea></label>
        ${renderCombinedContentGenerator(item)}
        ${renderSnsStatusSummary(item)}
        ${renderSnsEditor(item)}
        <label>投稿予定日<input type="date" value="${escapeAttr(item.plannedDate || "")}" onchange="updateCandidate('${item.id}', 'plannedDate', this.value)"></label>
        <p class="post-status-line"><span class="badge post-status-badge">${escapeHtml(item.postStatus || "投稿待ち")}</span>${item.postStatus === "Codex処理中" ? " CodexでROOM投稿準備中" : ""}</p>
        ${codexPasteErrors.has(item.id) ? `<p class="message" role="alert">${escapeHtml(codexPasteErrors.get(item.id))}</p>` : ""}
        ${item.introText ? `<details class="candidate-intro"><summary>紹介文を確認</summary><p>${escapeHtml(item.introText)}</p><p>${escapeHtml(item.hashTags || "")}</p></details>` : ""}
        ${item.introPrompt ? `<details class="candidate-intro"><summary>Codex投稿指示文を確認</summary><textarea readonly>${escapeHtml(item.introPrompt)}</textarea><button class="secondary-button" type="button" onclick="copyCandidatePrompt('${item.id}')">指示文をコピー</button></details>` : ""}
        <div class="record-actions candidate-primary-actions">
          <button class="primary-button codex-post-button" type="button" onclick="startCodexPost('${item.id}')">Codex投稿開始</button>
          <button class="secondary-button" type="button" onclick="setPostStatus('${item.id}', '確認待ち')">確認待ちにする</button>
          <button class="secondary-button" type="button" onclick="setPostStatus('${item.id}', '要手動確認')">要手動確認にする</button>
          <button class="secondary-button" type="button" onclick="markPosted('${item.id}')">投稿済みにする</button>
          ${data.pendingRoomPost?.itemCode && data.pendingRoomPost.itemCode === (item.itemCode || item.product?.itemCode || "") ? `<button class="primary-button" type="button" onclick="completePendingRoomPost()">ROOM投稿完了を記録</button>` : ""}
          <button class="secondary-button" type="button" onclick="setPostStatus('${item.id}', 'スキップ')">スキップ</button>
          ${["注意喚起候補", "要確認"].includes(trust.trustStatus) ? `<button class="secondary-button" type="button" onclick="generateWarningPrompt('${item.id}')">注意喚起文を生成</button>` : ""}
          ${item.postStatus === "投稿済み" ? `<button class="secondary-button" type="button" onclick="startNextCandidate('${item.id}')">次の商品を処理</button>` : ""}
        </div>
        <details class="candidate-tools">
          <summary>手動操作・トラブル対応</summary>
          <div class="record-actions">
          <button class="primary-button" type="button" onclick="openDetailByCandidate('${item.id}')">商品詳細・紹介文作成</button>
          <button class="secondary-button" type="button" onclick="generateCandidatePrompt('${item.id}')">紹介文プロンプト</button>
          <button class="secondary-button" type="button" onclick="openCandidateForPaste('${item.id}')">紹介文を貼り付け</button>
          <button class="secondary-button" type="button" onclick="pasteCodexResult('${item.id}')">Codex結果を貼り付け</button>
          <button class="secondary-button" type="button" onclick="prepareCandidatePost('${item.id}')">投稿準備</button>
          <button class="secondary-button" type="button" onclick="copyText(${JSON.stringify(`${item.introText}\n${item.hashTags}`)})">全文コピー</button>
          <select aria-label="投稿状態" onchange="setPostStatus('${item.id}', this.value)">${["投稿待ち", "Codex処理中", "確認待ち", "要手動確認", "投稿済み", "スキップ", "エラー"].map((status) => `<option ${item.postStatus === status ? "selected" : ""}>${status}</option>`).join("")}</select>
          <select onchange="updateCandidate('${item.id}', 'status', this.value)">${["未作成", "文章作成済み", "投稿待ち", "投稿済み", "保留", "対象外"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
          <button class="danger-button" type="button" onclick="deleteCandidate('${item.id}')">削除</button>
          </div>
        </details>
        </div>
      </div>
    </article>
  `;
}

function renderHistory() {
  const keyword = $("#historyFilter")?.value?.trim().toLowerCase() || "";
  const items = data.history.filter((item) => `${item.title} ${item.genreId} ${item.memo}`.toLowerCase().includes(keyword));
  const historyList = $("#historyList");
  const getWeekKey = (dateValue) => {
    const date = new Date(dateValue || 0);
    if (Number.isNaN(date.getTime())) return "日付未設定";
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return date.toISOString().slice(0, 10);
  };
  const formatWeekLabel = (weekKey) => weekKey === "日付未設定" ? weekKey : `${formatDate(weekKey)}の週`;
  const groups = new Map();
  items.forEach((item) => {
    const key = getWeekKey(item.postedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const groupedItems = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  historyList.innerHTML = items.length ? groupedItems.map(([weekKey, weekItems], groupIndex) => `
    <details class="history-week" ${groupIndex === 0 ? "open" : ""}>
      <summary><span>${escapeHtml(formatWeekLabel(weekKey))}</span><time>${escapeHtml(weekKey === "日付未設定" ? "" : formatDate(weekKey))}</time><em>${weekItems.length}件</em></summary>
      <div class="history-week-list">${weekItems.map((item) => `
    <article class="record-card">
      <img src="${escapeAttr(item.imageUrl)}" alt="">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p><span class="badge">投稿済み</span> ${formatDate(item.postedAt)} / ${escapeHtml(item.genreId || "ジャンル未設定")}</p>
        <p class="collection-status">投稿タイプ：${escapeHtml({ normal: "通常商品", sale: "セール商品", used: "使用済み商品", warning: "注意喚起商品" }[item.postType] || "通常商品")} / 信頼性：${escapeHtml(item.trustStatus || "未確認")}</p>
        ${item.selectedCollection || item.recommendedCollection ? `<p class="collection-status">コレクション：${escapeHtml(getCollectionById(item.selectedCollection || item.recommendedCollection)?.name || item.selectedCollection || item.recommendedCollection)}</p>` : ""}
        <p>${escapeHtml(shorten(item.introText || "", 140))}</p>
        ${renderSalesSummary(item)}
        ${getSalesForHistory(item.id).length ? `<div class="record-actions"><button class="secondary-button" type="button" onclick="toggleSaleHistory('${escapeAttr(item.id)}')">売上履歴を見る</button></div>` : ""}
        <div id="sale-history-${escapeAttr(item.id)}" class="sale-history" hidden>${renderSaleHistory(item.id)}</div>
        ${item.roomUrl ? `<a href="${escapeAttr(item.roomUrl)}" target="_blank" rel="noopener noreferrer">ROOM投稿URL</a>` : ""}
      </div>
    </article>
  `).join("")}</div>
    </details>
  `).join("") : `<p class="message">投稿履歴はまだありません。</p>`;
  historyList.hidden = false;
  renderSalesDashboard();
}

function renderSalesDashboard() {
  const panel = $("#salesDashboard");
  if (!panel) return;
  const sales = (data.sales || []).filter((sale) => sale.status !== "キャンセル");
  if (!sales.length) {
    panel.innerHTML = `<div class="section-heading"><h3 id="salesDashboardTitle">売上状況</h3><p>楽天成果CSVを読み込んで保存すると、投稿商品との一致や売上状況を確認できます。</p></div><div class="button-row sales-view-buttons"><button class="secondary-button" type="button" disabled>紹介商品と一致</button><button class="secondary-button" type="button" disabled>投稿商品以外の売上</button><button class="secondary-button" type="button" disabled>売上状況をすべて見る</button></div>`;
    return;
  }
  const totals = sales.reduce((summary, sale) => ({ amount: summary.amount + Number(sale.amount || 0), reward: summary.reward + Number(sale.reward || 0), quantity: summary.quantity + Number(sale.quantity || 0) }), { amount: 0, reward: 0, quantity: 0 });
  const grouped = new Map();
  sales.forEach((sale) => {
    const key = `${sale.classification || "other"}|${sale.productName || sale.productSnapshot?.title || "商品名未設定"}`;
    const current = grouped.get(key) || { classification: sale.classification || "other", productName: sale.productName || sale.productSnapshot?.title || "商品名未設定", shopName: sale.shopName || sale.productSnapshot?.shopName || "", amount: 0, reward: 0, quantity: 0 };
    current.amount += Number(sale.amount || 0); current.reward += Number(sale.reward || 0); current.quantity += Number(sale.quantity || 0); grouped.set(key, current);
  });
  const groupedRows = [...grouped.values()].sort((a, b) => b.amount - a.amount);
  const count = (classification) => sales.filter((sale) => (sale.classification || "other") === classification).length;
  const visibleSales = salesDashboardView === "all" ? sales : sales.filter((sale) => (sale.classification || "other") === salesDashboardView);
  const visibleGrouped = new Map();
  visibleSales.forEach((sale) => {
    const key = `${sale.classification || "other"}|${sale.productName || sale.productSnapshot?.title || "商品名未設定"}`;
    const current = visibleGrouped.get(key) || { classification: sale.classification || "other", productName: sale.productName || sale.productSnapshot?.title || "商品名未設定", shopName: sale.shopName || sale.productSnapshot?.shopName || "", amount: 0, reward: 0, quantity: 0 };
    current.amount += Number(sale.amount || 0); current.reward += Number(sale.reward || 0); current.quantity += Number(sale.quantity || 0); visibleGrouped.set(key, current);
  });
  const visibleRows = [...visibleGrouped.values()].sort((a, b) => b.amount - a.amount);
  panel.innerHTML = `<div class="section-heading"><h3 id="salesDashboardTitle">売上状況</h3><p>楽天成果CSVを保存した売上を、投稿商品との一致状況別に確認できます。</p></div>
    <div class="button-row sales-view-buttons"><button class="${salesDashboardView === "introduced" ? "primary-button" : "secondary-button"}" type="button" data-sales-view="introduced">紹介商品と一致</button><button class="${salesDashboardView === "other" ? "primary-button" : "secondary-button"}" type="button" data-sales-view="other">投稿商品以外の売上</button><button class="${salesDashboardView === "all" ? "primary-button" : "secondary-button"}" type="button" data-sales-view="all">売上状況をすべて見る</button></div>
    <div class="sales-summary-grid"><div><span>売上合計</span><strong>${formatYen(totals.amount)}</strong></div><div><span>成果報酬</span><strong>${formatYen(totals.reward)}</strong></div><div><span>売上件数</span><strong>${totals.quantity}件</strong></div><div><span>紹介商品</span><strong>${count("introduced")}件</strong></div><div><span>その他購入</span><strong>${count("other")}件</strong></div><div><span>要確認</span><strong>${count("review")}件</strong></div></div>
    <div class="sales-table-wrap"><table class="sales-table"><thead><tr><th>分類</th><th>商品</th><th>ショップ</th><th>売上</th><th>報酬</th><th>件数</th></tr></thead><tbody>${visibleRows.map((row) => `<tr><td><span class="sales-label ${escapeAttr(row.classification)}">${affiliateClassificationLabel(row.classification)}</span></td><td>${escapeHtml(row.productName)}</td><td>${escapeHtml(row.shopName)}</td><td>${formatYen(row.amount)}</td><td>${formatYen(row.reward)}</td><td>${row.quantity}件</td></tr>`).join("")}</tbody></table></div>`;
  panel.querySelectorAll("[data-sales-view]").forEach((button) => button.addEventListener("click", () => { salesDashboardView = button.dataset.salesView; renderSalesDashboard(); }));
}

function parseCsvRows(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value !== "")) rows.push(row); }
  return rows;
}

function normalizeAffiliateHeader(value) { return String(value || "").trim().replace(/^\uFEFF/, "").toLowerCase(); }
function normalizeAffiliateStatus(value) {
  const text = String(value || "").trim();
  if (text === "0" || text.startsWith("0 -") || text.includes("未確定")) return "未確定";
  if (text === "1" || text.startsWith("1 -") || text.includes("確定")) return "確定";
  if (text === "2" || text.startsWith("2 -") || text.includes("破棄") || text.includes("キャンセル")) return "キャンセル";
  return text;
}

function parseAffiliateCsv(text) {
  const rows = parseCsvRows(text);
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeAffiliateHeader(cell) === "発生日"));
  if (headerIndex < 0) throw new Error("成果CSVの実データヘッダー（発生日）が見つかりません。");
  const headers = rows[headerIndex].map(normalizeAffiliateHeader);
  const dataRows = rows.slice(headerIndex + 1).filter((row) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(String(row[headers.indexOf("発生日")] || "").trim()));
  const get = (row, name) => row[headers.indexOf(normalizeAffiliateHeader(name))] || "";
  return dataRows.map((row) => ({
    occurredAt: get(row, "発生日"), reward: Number(String(get(row, "成果報酬")).replace(/,/g, "")) || 0,
    rewardRate: Number(String(get(row, "料率")).replace(/,/g, "")) || 0,
    amount: Number(String(get(row, "売上金額")).replace(/,/g, "")) || 0,
    category: get(row, "ジャンル名"), shopName: get(row, "ショップ名"), productName: get(row, "商品名"),
    affiliateStatus: normalizeAffiliateStatus(get(row, "ステータス")), linkType: get(row, "リンクタイプ"), device: get(row, "デバイスタイプ"), measurementId: get(row, "計測ID")
  }));
}

function normalizeAffiliateText(value) { return String(value || "").toLowerCase().normalize("NFKC").replace(/[\s　\-ー―‐]/g, "").replace(/[「」『』【】［］\[\]()（）]/g, ""); }

function getAffiliateImportKey(row) {
  return [row.occurredAt, row.reward, row.amount, row.shopName, row.productName, row.affiliateStatus, row.measurementId].map((value) => String(value || "").trim()).join("|");
}

function classifyAffiliateSale(row, history) {
  const productName = normalizeAffiliateText(row.productName);
  const shopName = normalizeAffiliateText(row.shopName);
  const candidates = (history || []).map((item) => {
    const title = normalizeAffiliateText(item.title || item.product?.itemName);
    const shop = normalizeAffiliateText(item.shopName || item.product?.shopName);
    const titleMatch = Boolean(productName && title && (productName === title || productName.includes(title) || title.includes(productName)));
    const sharedName = !titleMatch && productName && title && [...productName].some((_, index) => productName.slice(index, index + 10).length === 10 && title.includes(productName.slice(index, index + 10)));
    const shopMatch = Boolean(shopName && shop && shopName === shop);
    return { item, titleMatch, shopMatch, score: (titleMatch ? 2 : 0) + (sharedName ? 1 : 0) + (shopMatch ? 1 : 0) };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  let classification = "other";
  let reason = "投稿履歴に一致する商品を確認できません。";
  if (best?.titleMatch && best?.shopMatch) { classification = "introduced"; reason = "商品名とショップ名が投稿履歴と一致しました。"; }
  else if (best?.score >= 1) { classification = "review"; reason = "投稿履歴に似た商品があるため、同一商品か確認してください。"; }
  const source = normalizeAffiliateText(row.measurementId).includes("楽天room") ? "rakuten_room" : "unknown";
  return { ...row, importKey: getAffiliateImportKey(row), classification, source, reason, matchedHistoryId: classification === "introduced" ? best.item.id : "", matchedItemCode: classification === "introduced" ? (best.item.itemCode || best.item.product?.itemCode || "") : "", candidateHistoryId: best?.item.id || "" };
}

function buildAffiliateImportPreview(rows, history) { return rows.map((row) => classifyAffiliateSale(row, history)); }

function affiliateClassificationLabel(value) { return ({ introduced: "🟢 紹介商品", other: "🔵 その他購入", review: "🟡 要確認" })[value] || value; }

function renderAffiliateImportPreview() {
  const panel = $("#affiliateImportPanel");
  const preview = $("#affiliateImportPreview");
  panel.hidden = !affiliateImportDraft.length;
  if (!affiliateImportDraft.length) { preview.innerHTML = ""; $("#saveAffiliateImport").disabled = true; return; }
  preview.innerHTML = `<div class="affiliate-preview-list">${affiliateImportDraft.map((row, index) => `<article class="affiliate-preview-card ${escapeAttr(row.classification)}"><strong>${affiliateClassificationLabel(row.classification)}</strong><p>${escapeHtml(row.productName)}</p><p>${escapeHtml(row.shopName)} / ${formatYen(row.amount)} / 報酬 ${formatYen(row.reward)} / ${escapeHtml(row.affiliateStatus)}</p><p>${escapeHtml(row.reason)}${row.candidateHistoryId ? " 候補を確認できます。" : ""}</p><label>保存分類<select data-affiliate-classification="${index}"><option value="introduced" ${row.classification === "introduced" ? "selected" : ""}>紹介商品</option><option value="other" ${row.classification === "other" ? "selected" : ""}>その他購入</option><option value="review" ${row.classification === "review" ? "selected" : ""}>要確認</option></select></label>${row.candidateHistoryId ? `<label>投稿履歴候補<select data-affiliate-history="${index}"><option value="">未紐付け</option><option value="${escapeAttr(row.candidateHistoryId)}" ${row.matchedHistoryId === row.candidateHistoryId ? "selected" : ""}>候補に紐付ける</option></select></label>` : ""}</article>`).join("")}</div>`;
  preview.querySelectorAll("[data-affiliate-classification]").forEach((select) => select.addEventListener("change", (event) => { affiliateImportDraft[Number(event.target.dataset.affiliateClassification)].classification = event.target.value; renderAffiliateImportPreview(); }));
  preview.querySelectorAll("[data-affiliate-history]").forEach((select) => select.addEventListener("change", (event) => { const row = affiliateImportDraft[Number(event.target.dataset.affiliateHistory)]; row.matchedHistoryId = event.target.value; const item = data.history.find((historyItem) => historyItem.id === event.target.value); row.matchedItemCode = item?.itemCode || item?.product?.itemCode || ""; renderAffiliateImportPreview(); }));
  $("#saveAffiliateImport").disabled = false;
}

function importAffiliateCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      affiliateImportDraft = buildAffiliateImportPreview(parseAffiliateCsv(reader.result), data.history);
      $("#affiliateImportMessage").textContent = `${affiliateImportDraft.length}件を解析しました。内容を確認してから保存してください。`;
      renderAffiliateImportPreview();
    } catch (error) { $("#affiliateImportMessage").textContent = error.message; affiliateImportDraft = []; renderAffiliateImportPreview(); }
  };
  reader.readAsText(file, "UTF-8");
}

function saveAffiliateImport() {
  if (!affiliateImportDraft.length) return;
  const existing = new Map((data.sales || []).map((sale) => [sale.importKey, sale]));
  affiliateImportDraft.forEach((row) => {
    const historyItem = row.matchedHistoryId ? data.history.find((item) => item.id === row.matchedHistoryId) : null;
    const record = existing.get(row.importKey) || { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    Object.assign(record, { importKey: row.importKey, source: row.source, classification: row.classification, historyId: row.classification === "introduced" ? row.matchedHistoryId : "", itemCode: row.classification === "introduced" ? row.matchedItemCode : "", occurredAt: row.occurredAt, amount: row.amount, reward: row.reward, rewardRate: row.rewardRate, quantity: 1, status: row.affiliateStatus, category: row.category, shopName: row.shopName, productName: row.productName, linkType: row.linkType, device: row.device, measurementId: row.measurementId, productSnapshot: historyItem ? getHistoryProductSnapshot(historyItem) : { title: row.productName, shopName: row.shopName, categoryName: row.category, postedAt: "" }, daysFromPostToSale: historyItem ? calculateDaysFromPostToSale(historyItem.postedAt, row.occurredAt) : "" });
    if (!existing.has(row.importKey)) data.sales.unshift(record);
  });
  saveData(); closeAffiliateImport(); toast("確認した売上を保存しました。");
  renderHistory();
}

function closeAffiliateImport() { affiliateImportDraft = []; $("#affiliateCsvInput").value = ""; $("#affiliateImportMessage").textContent = ""; renderAffiliateImportPreview(); }

const SALE_STATUSES = ["未確定", "確定", "キャンセル"];

function getSalesForHistory(historyId) {
  return (data.sales || []).filter((sale) => sale.historyId === historyId);
}

function getValidSalesSummary(historyId) {
  return getSalesForHistory(historyId).filter((sale) => sale.status !== "キャンセル").reduce((summary, sale) => ({
    amount: summary.amount + Number(sale.amount || 0),
    reward: summary.reward + Number(sale.reward || 0),
    quantity: summary.quantity + Number(sale.quantity || 0)
  }), { amount: 0, reward: 0, quantity: 0 });
}

function renderSalesSummary(item) {
  const sales = getSalesForHistory(item.id);
  if (!sales.length) return "";
  const summary = getValidSalesSummary(item.id);
  return `<div class="sales-summary"><strong>✓ 売上実績あり</strong><br>売上合計：${formatYen(summary.amount)}<br>成果報酬：${formatYen(summary.reward)}<br>売上件数：${summary.quantity}件</div>`;
}

function renderSaleHistory(historyId) {
  const sales = getSalesForHistory(historyId);
  return sales.length ? `<h4>売上履歴</h4><ul>${sales.map((sale) => `<li>${escapeHtml(formatSaleDate(sale.occurredAt))} / 売上 ${formatYen(sale.amount)} / 報酬 ${formatYen(sale.reward)} / ${sale.quantity}件 / ${escapeHtml(sale.status)}</li>`).join("")}</ul>` : "";
}

function formatSaleDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

function toDateTimeLocalValue(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getHistoryProductSnapshot(historyItem) {
  const product = historyItem.product || {};
  const rank = historyItem.rank ?? historyItem.apiRank ?? historyItem.sourceRank ?? product.rank ?? product.apiRank ?? product.sourceRank ?? "";
  const selectionScore = getSelectionTotal(historyItem) || getSelectionTotal(product);
  return {
    title: historyItem.title || product.itemName || "",
    shopName: historyItem.shopName || product.shopName || "",
    itemUrl: historyItem.itemUrl || product.itemUrl || product.affiliateUrl || "",
    categoryName: historyItem.categoryName || product.categoryName || "",
    postedAt: historyItem.postedAt || "",
    rank,
    apiRank: historyItem.apiRank ?? product.apiRank ?? "",
    sourceRank: historyItem.sourceRank ?? product.sourceRank ?? "",
    selectionScore,
    selectionScoreTotal: historyItem.selectionScoreTotal ?? product.selectionScoreTotal ?? selectionScore,
    selectionGrade: historyItem.selectionGrade || product.selectionGrade || "",
    selectionVersion: historyItem.selectionVersion || product.selectionVersion || "",
    productType: (historyItem.matchedTrendKeywords || product.matchedTrendKeywords || []).length ? "trend" : "regular",
    matchedTrendKeywords: [...(historyItem.matchedTrendKeywords || product.matchedTrendKeywords || [])],
    postType: historyItem.postType || "",
    selectedCollection: historyItem.selectedCollection || "",
    price: historyItem.price ?? product.itemPrice ?? ""
  };
}

function openSaleForm(historyId) {
  const item = data.history.find((historyItem) => historyItem.id === historyId);
  if (!item) return;
  const itemCode = item.itemCode || item.product?.itemCode || "";
  if (!itemCode) {
    toast("ITEM_CODEがないため、安全に売上を紐付けできません。");
    return;
  }
  $("#saleHistoryId").value = historyId;
  $("#saleOccurredAt").value = toDateTimeLocalValue();
  $("#saleAmount").value = "";
  $("#saleReward").value = "";
  $("#saleQuantity").value = "1";
  $("#saleStatus").value = "未確定";
  $("#saleProductSummary").innerHTML = `<strong>${escapeHtml(item.title || item.product?.itemName || "")}</strong><br>ショップ：${escapeHtml(item.shopName || item.product?.shopName || "")}<br>ITEM_CODE：${escapeHtml(itemCode)}<br>投稿日：${escapeHtml(formatDate(item.postedAt))}`;
  $("#saleFormMessage").textContent = "";
  $("#saleFormPanel").hidden = false;
  $("#saleFormPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeSaleForm() {
  $("#saleFormPanel").hidden = true;
  $("#saleForm").reset();
}

function calculateDaysFromPostToSale(postedAt, occurredAt) {
  const posted = new Date(postedAt);
  const occurred = new Date(occurredAt);
  if (!postedAt || !occurredAt || Number.isNaN(posted.getTime()) || Number.isNaN(occurred.getTime())) return "";
  return Math.max(0, Math.floor((occurred.getTime() - posted.getTime()) / 86400000));
}

function saveSaleRecord(event) {
  event.preventDefault();
  const historyId = $("#saleHistoryId").value;
  const item = data.history.find((historyItem) => historyItem.id === historyId);
  const itemCode = item?.itemCode || item?.product?.itemCode || "";
  const occurredAt = $("#saleOccurredAt").value;
  const amount = Number($("#saleAmount").value);
  const reward = Number($("#saleReward").value);
  const quantity = Number($("#saleQuantity").value);
  const status = $("#saleStatus").value;
  const invalid = !item || !itemCode || !occurredAt || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(reward) || reward < 0 || !Number.isInteger(quantity) || quantity < 1 || !SALE_STATUSES.includes(status);
  if (invalid) {
    $("#saleFormMessage").textContent = "売上発生日時、金額、報酬、件数、ステータスを確認してください。ITEM_CODEがない商品には登録できません。";
    return;
  }
  const occurredIso = new Date(occurredAt).toISOString();
  data.sales.unshift({
    id: crypto.randomUUID(),
    historyId,
    itemCode,
    occurredAt: occurredIso,
    amount,
    reward,
    quantity,
    status,
    createdAt: new Date().toISOString(),
    productSnapshot: getHistoryProductSnapshot(item),
    daysFromPostToSale: calculateDaysFromPostToSale(item.postedAt, occurredIso)
  });
  saveData();
  closeSaleForm();
  toast("売上実績を保存しました。");
}

function toggleSaleHistory(historyId) {
  const element = $(`#sale-history-${historyId}`);
  if (element) element.hidden = !element.hidden;
}

function updateCandidate(id, field, value) {
  const item = data.candidates.find((candidate) => candidate.id === id);
  if (!item) return;
  item[field] = value;
  if (field === "introText" && value && item.status === "未作成") item.status = "文章作成済み";
  if (field === "introText") item.postStatus = value ? "紹介文作成済み" : "紹介文未作成";
  if (field === "selectedCollection") item.collectionStatus = value ? "selected" : (item.recommendedCollection ? "recommended" : "none");
  saveData();
  renderCandidates();
}

function getSnsProductFacts(item) {
  const product = item.product || item;
  return [
    `商品名：${item.title || product.itemName || "未設定"}`,
    `価格：${item.price ?? product.itemPrice ?? "未設定"}`,
    `ショップ名：${item.shopName || product.shopName || "未設定"}`,
    `商品説明：${product.itemCaption || "未設定"}`,
    `カテゴリー：${item.categoryName || product.categoryName || "未設定"}`,
    `ランキング：${item.rank || product.rank || "未設定"}`,
    `レビュー：評価${product.reviewAverage ?? "未設定"}／${product.reviewCount ?? "未設定"}件`,
    `セール・クーポン情報：${getSaleInfo(product) || product.couponInfo || product.pointInfo || "未設定"}`,
    `信頼性判定：${item.trustStatus || "未確認"}`,
    `ROOM紹介文：${item.introText || "未設定"}`,
    `ハッシュタグ：${item.hashTags || "未設定"}`,
    `usageStatus：${item.usageStatus || "unknown"}`,
    `ROOM個別URL：${item.roomUrl || "ROOM個別URL未設定"}`
  ].join("\n");
}

function isLikelyRoomUrl(value = "") {
  return /^https?:\/\/room\.rakuten\.co\.jp\/room_[^/\s]+\/[^/\s]+/i.test(String(value).trim());
}

function getRoomUrlNotice(item = {}) {
  const roomUrl = String(item.roomUrl || "").trim();
  if (!roomUrl) return [item.status === "投稿済み" || item.postStatus === "投稿済み" ? "ROOM投稿済みですが、個別URLが未登録です。商品個別URLを入力してください" : "ROOM投稿後、商品個別URLを入力してください", "missing"];
  if (!isLikelyRoomUrl(roomUrl)) return ["楽天ROOMの個別URLではない可能性があります。形式を確認してください。", "warning"];
  return ["ROOM個別URL登録済み", "saved"];
}

function getRoomUrlPromptRule(roomUrl = "") {
  if (String(roomUrl).trim()) return `ROOM個別URL：${roomUrl}\nROOM個別URLが登録済みの場合、投稿文にこの登録URLを必ず1回だけそのまま記載する。省略・変更・短縮・推測は禁止。Xは「ROOMで詳細をチェック👇」などの導線の直後、Threadsは「ROOMに載せています👇」などの導線の直後にURLを置く。`;
  return "ROOM URLは未設定。存在しないURLを生成しないこと。投稿本文には「ROOM個別URL未設定」という文言を書かず、URL部分を省略すること。";
}

function getSalePromptRule() {
  return "価格、クーポン、ポイント倍率、セール情報は変動する可能性がある。現在有効であることが確認できない場合は、SNS投稿文へ積極的に使用しない。商品名に含まれているだけのセール表現を、現在有効な情報として断定しない。アプリ側で確認済みとして保持された情報がある場合だけ、事実として自然に反映する。";
}

function getXLengthPromptRule() {
  return `Xの投稿全文（本文、導線文、ROOM個別URL、#PR、#楽天ROOMなどのハッシュタグ、改行を含む）を${SNS_X_MAX_LENGTH}文字以内にする。登録済みROOM個別URLと#PRは削除せず、超過しそうな場合は不要なハッシュタグ、セール情報、補足説明、特徴の数、導線文の順に短くする。`;
}

function getSnsTypeSpecificRule(medium, postType) {
  if (postType === "problem") return "商品説明から合理的に導ける、日常の具体的な小さな困りごとを1つだけ抽出し、冒頭1〜2文に置く。商品説明の単純な言い換えや一般論ではなく、「〜って意外と困りますよね」「〜になることありませんか」のような一般的な日常場面にする。「私は困っていました」「いつもこうなります」など、生成者自身の実体験を作らない。";
  if (postType === "discovery") return "商品情報の中から、知らなかった・そんな方法があるのか・そこまで対応しているのかと思える発見性の高い特徴を1つだけ選び、冒頭のフック候補にする。商品名やスペックの羅列から始めず、特徴は商品情報に明記された範囲に限定する。";
  return medium === "x" ? "特徴は1〜2個に絞り、冒頭を重視する。" : "共感・困りごと・発見から入り、なぜ気になったかを伝える。";
}

function getThreadsLink(item = {}) {
  const product = item.product || item;
  if (isThreadsOnlyItem(item)) return String(item.affiliateShortUrl || item.affiliateUrl || product.affiliateUrl || "").trim();
  return String(item.roomUrl || "").trim();
}

function isValidAffiliateShortUrl(value = "") {
  return /^https:\/\/a\.r10\.to\/[^\s/]+$/i.test(String(value || "").trim());
}

function refreshThreadsOnlyReply(item) {
  if (!isThreadsOnlyItem(item)) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  if (item.snsPosts.threads.performanceUrlMode !== "reply") return;
  item.snsPosts.threads.replyText = buildThreadsOnlyDraft(item).replyText;
  item.snsPosts.threads.prompt = buildThreadsPerformancePrompt(item);
}

function registerAffiliateShortUrl(id) {
  const item = data.candidates.find((candidate) => candidate.id === id && isThreadsOnlyItem(candidate));
  const input = document.querySelector(`#threads-short-url-${id}`);
  if (!item || !input) return;
  const value = String(input.value || "").trim();
  if (!isValidAffiliateShortUrl(value)) {
    toast("楽天公式短縮URL（a.r10.to）を入力してください。");
    return;
  }
  item.affiliateShortUrl = value;
  refreshThreadsOnlyReply(item);
  saveData();
  renderCandidates();
  toast("楽天公式短縮URLを登録し、コメント欄へ反映しました。");
}

function removeAffiliateShortUrl(id) {
  const item = data.candidates.find((candidate) => candidate.id === id && isThreadsOnlyItem(candidate));
  if (!item) return;
  item.affiliateShortUrl = "";
  refreshThreadsOnlyReply(item);
  saveData();
  renderCandidates();
  toast("楽天公式短縮URLを削除し、API取得URLへ戻しました。");
}

function getThreadsLinkLabel(item = {}) {
  return isThreadsOnlyItem(item) ? "楽天アフィリエイトURL" : "ROOM個別URL";
}

function formatThreadsPerformanceDeadline(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const matches = [...text.matchAll(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/g)];
  const match = matches.at(-1);
  if (!match) return text;
  const [, , month, day, hour, minute] = match;
  return `${Number(month)}/${Number(day)}${hour ? ` ${Number(hour)}:${minute}` : ""}`;
}

function buildThreadsPerformancePrompt(item, options = {}) {
  const product = item.product || item;
  const posts = item.snsPosts || createSnsPosts();
  const threads = posts.threads || createSnsPosts().threads;
  const urlMode = options.urlMode || threads.performanceUrlMode || "body";
  const audience = options.audience || getPerformanceAudience(item);
  const context = buildGenerationContext(product, item.usageStatus || "不明");
  const facts = getThreadsPerformanceFacts(item);
  const linkUrl = getThreadsLink(item);
  const linkLabel = getThreadsLinkLabel(item);
  const urlRule = linkUrl
    ? urlMode === "reply"
      ? `本文には${linkLabel}を入れず、返信用文章に登録済み${linkLabel}を完全一致で1回だけ記載する。URLは変更・短縮・省略・推測しない。`
      : `本文に登録済み${linkLabel}を完全一致で1回だけ記載する。URLは変更・短縮・省略・推測しない。`
    : `${linkLabel}は未設定。本文・返信用文章へURLを推測生成せず、内部状態を示す文言も投稿本文へ書かない。`;
  const output = urlMode === "reply"
    ? `===THREADS_POST===\n親投稿本文（URLなし。誰向け＋確認済みのお得情報＋期限または今見る理由＋「対象は返信に👇」等の返信導線＋#PR）\n===END_THREADS_POST===\n\n===THREADS_REPLY===\n返信用の短い導線、確認済みのお得情報、${linkLabel}（取得済みの場合のみ）、#PR\n===END_THREADS_REPLY===`
    : `===THREADS_POST===\n本文（${linkUrl ? `${linkLabel}と#PRを含む` : "URLなし・#PRを含む"}）\n===END_THREADS_POST===`;
  const outputWithLabel = output.replaceAll("ROOM URL（登録済みの場合のみ）", `${linkLabel}（登録済みの場合のみ）`);
  const evidence = getCouponEvidence(item);
  const confirmedRate = evidence.rateConfirmed && evidence.discountRateType === "exact" && Number.isFinite(evidence.discountRate);
  const confirmedDeadline = evidence.deadlineConfirmed && Boolean(evidence.couponDeadline);
  const feature = getPerformanceProductFeature(item);
  return `Threads成果型 Ver.1の投稿文章を作成してください。通常Threads紹介文とは別の短文モードです。\n\n【正式な2段構成】\n親投稿と、自分の親投稿への返信（コメント）を別々に作成してください。\n\n親投稿は次の順序にする：\n1. 誰向け\n2. どんなお得（確認済みのお得情報）\n3. 期限・今見る理由（確認済みの場合だけ）\n4. 返信への導線\n5. #PR\n具体的な実装内容：\n1. 商品情報から合理的に絞った具体的な誰向け\n2. ${confirmedRate ? "確認済み割引率を自然な1文で記載" : "確認済みでない割引率・クーポンは記載しない"}\n3. ${confirmedDeadline ? "確認済み期限を短く記載" : "期限の文章は省略"}\n4. 「対象は返信に👇」など返信への導線\n5. #PR\n確認済みの割引率または期限がある場合、「お得情報を確認できる商品」「割引・期限は商品ページで確認してから判断したい商品です」のような内部確認用の曖昧な説明文は使わない。\n\nコメントは次の形式にする：\n${confirmedRate ? "確認済み割引率を含む『○%OFFクーポン対象はこちら👇』などの導線" : "『商品はこちら👇』などの導線"}\n${linkUrl ? `${linkLabel}を完全一致で1回` : "URLなし"}\n#PR\n\n【基本構造】\n誰向け＋確認済みのお得情報＋期限または今見る理由＋返信への自然な導線＋#PR。親投稿ですべての商品説明を完結させず、読み手が返信を確認する理由を短く残す。過度な煽りや「知らないと損」「絶対買うべき」は使わない。\n\n【誰向けのルール】\n商品カテゴリー名だけでなく、商品情報から合理的に導ける具体的な利用場面・小さな困りごとを1つ選ぶ。「お得な商品を探している人」「楽天ユーザー」「買い物好きな人」など広すぎる表現は避ける。年齢、性別、家族構成、職業、生活状況は推測しない。手動指定がある場合はそれを優先する。\n${urlMode === "reply" ? "本文＋返信URL方式では、親投稿にURLを書かず、「対象は返信に👇」を基本として導線を置く。コメント欄にだけURLを記載する。" : "本文にURLを入れる方式では、登録URLを本文に1回だけ入れる。"}\n\n【商品情報】\n${getSnsProductFacts(item)}\n商品名：${product.itemName || product.title || "未設定"}\nカテゴリー：${product.categoryName || "未設定"}\n対象者の補助情報：${context.targetUser}\n誰向けの入力・指定：${audience}\n確認済みセール情報：\n${facts.structured}\n確認済みイベント：${facts.event}\n${linkLabel}：${linkUrl || "未設定"}\n\n【安全ルール】\n${getSalePromptRule()}\nusageStatusがusedでない場合、使用・購入体験、レビュー・効果・在庫を捏造しない。存在しない割引率、期限、ポイント倍率、イベント開催状況を推測しない。割引率はrateConfirmed===trueかつdiscountRateType===exactの場合だけ書き、期限はdeadlineConfirmed===trueかつcouponDeadlineが存在する場合だけ書く。${confirmedDeadline ? "確認済み期限だけを短く整形して使用する。" : "期限が確認できない場合、期限の文章を生成しない。"}${confirmedRate ? "確認済み割引率だけを具体的に使用する。" : "割引率が確認できない場合、具体的な割引率や半額表現を生成しない。"}\n${urlRule}\n親投稿にもコメントにも#PRを必ず含める。外部Threadsへ自動投稿しない。\n\n【出力形式】\n${outputWithLabel}`;
}

function buildThreadsOnlyDraft(item) {
  const posts = item.snsPosts || createSnsPosts();
  const threads = posts.threads || createSnsPosts().threads;
  const evidence = getCouponEvidence(item);
  const audience = getPerformanceAudience(item);
  const link = getThreadsLink(item);
  const urlMode = threads.performanceUrlMode || "body";
  const confirmedRate = evidence.rateConfirmed && evidence.discountRateType === "exact" && Number.isFinite(evidence.discountRate);
  const confirmedDeadline = evidence.deadlineConfirmed && evidence.couponDeadline;
  const benefit = getPerformanceBenefitLine(item, evidence);
  const timing = confirmedDeadline ? `${formatThreadsPerformanceDeadline(evidence.couponDeadline)}まで` : "";
  const benefitLine = [benefit.replace(/[。．]+$/, ""), timing].filter(Boolean).join("、");
  const direction = confirmedRate ? "対象はこちら、返信に👇" : "商品はこちら、返信に👇";
  const bodyParts = [
    ...(audience ? [`${audience}へ。`] : []),
    ...(benefitLine ? [`${benefitLine}。`] : []),
    urlMode === "reply" ? direction : link ? `商品はこちら👇\n${link}` : "",
    "#PR"
  ].filter(Boolean);
  const replyLabel = confirmedRate ? `${evidence.discountRate}%OFFクーポン対象はこちら👇` : "商品はこちら👇";
  const replyText = urlMode === "reply" && link ? `${replyLabel}\n${link}\n#PR` : "";
  return { text: bodyParts.join("\n"), replyText };
}

function hasThreadsInstructionText(text = "") {
  return /具体的な利用場面または小さな困りごとを1つ選ぶ|根拠がなければ人間が修正する/.test(String(text || ""));
}

function ensureThreadsOnlyDraft(item) {
  if (!isThreadsOnlyItem(item)) return false;
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts.threads.threadsPostType = "performance_v1";
  const existingText = item.snsPosts.threads.text?.trim() || "";
  const needsRepair = hasThreadsInstructionText(existingText);
  if (existingText && !needsRepair) return false;
  if (needsRepair) item.snsPosts.threads.text = "";
  if (item.couponCandidate) item.snsPosts.threads.performanceUrlMode = "reply";
  const draft = buildThreadsOnlyDraft(item);
  item.snsPosts.threads.text = draft.text;
  if (!item.snsPosts.threads.replyText?.trim()) item.snsPosts.threads.replyText = draft.replyText;
  item.snsPosts.threads.status = "draft";
  item.snsPosts.threads.generatedAt = item.snsPosts.threads.generatedAt || new Date().toISOString();
  item.threadsStatus = "確認待ち";
  item.status = "確認待ち";
  return true;
}

function buildSnsPrompt(item, medium, postType) {
  const threadsMode = item.snsPosts?.threads?.threadsPostType || "normal";
  if (medium === "threads" && threadsMode === "performance_v1") return buildThreadsPerformancePrompt(item);
  const typeLabel = SNS_POST_TYPES[postType] || SNS_POST_TYPES.discovery;
  const isX = medium === "x";
  const baseRules = isX
    ? `X向け。短めにし、最初の1〜2行で興味を引く。商品名の羅列から始めず、広告っぽさを抑える。絵文字は少なめ。#PRを付け、必要に応じて#楽天ROOMを付ける。${getXLengthPromptRule()}`
    : "Threads向け。Xより少し長めで会話調にする。共感・困りごと・発見から入り、なぜ気になったかを伝える。売り込み感を弱くし、X文章の単純な長文化にしない。絵文字は少なめ。#PRを付ける。";
  const rules = `${baseRules} ${getSnsTypeSpecificRule(medium, postType)} ${getRoomUrlPromptRule(item.roomUrl || "")}`;
  const usageRule = item.usageStatus === "used"
    ? "usageStatusはused。使用体験を書く場合も、商品情報と利用者が入力した事実の範囲だけに限定する。"
    : "usageStatusはusedではない。使ってみた、買ってみた、愛用している、使いやすかった、おすすめです、買ってよかった等の使用経験・断定を絶対に書かない。見つけました、気になりました、便利そう、チェックしておきたい等の安全な表現を使う。体験型の内容は生成しない。";
  return `SNS投稿文章生成プロンプトを作成してください。\n\n媒体：${isX ? "X" : "Threads"}\nSNS投稿タイプ：${typeLabel}（${postType}）\n\n${getSnsProductFacts(item)}\n\n${rules}\n${usageRule}\n${getSalePromptRule()}\n存在しない情報、レビュー、効果、在庫、最安値、セール期限、クーポン、使用体験を推測・捏造しない。商品情報とSNSルールに合った自然な文章を作る。\n\n出力は文章本文だけにし、ROOM個別URLが登録済みの場合は必ず1回だけ記載し、未設定の場合はURL導線を省略する。`;
}

function canStartSnsCodex(item = {}) {
  const roomUrl = String(item.roomUrl || "").trim();
  return Boolean(roomUrl && isLikelyRoomUrl(roomUrl));
}

function buildSnsCodexInstructions(item) {
  if (!canStartSnsCodex(item)) return "";
  const product = item.product || item;
  const posts = item.snsPosts || createSnsPosts();
  const itemCode = item.itemCode || product.itemCode || "";
  const usageRule = item.usageStatus === "used"
    ? "usageStatusはused。使用体験を書く場合も、利用者が入力した事実の範囲だけに限定する。"
    : "usageStatusはusedではない。使ってみた、買ってみた、愛用している、使いやすかった、おすすめです、買ってよかった等の使用経験を作らない。見つけました、気になりました、便利そう、チェックしておきたい等の安全な表現を使う。体験型の内容は生成しない。";
  const xType = posts.x.postType || "discovery";
  const threadsType = posts.threads.postType || "problem";
  return [
    "楽天ROOM投稿後のSNS文章を作成し、アプリへ直接反映してください。",
    "ChatGPTへ手動で貼り付けるための手順ではありません。この指示に従い、CodexがChrome上のアプリを操作します。",
    "",
    `ITEM_CODE：${itemCode}`,
    getSnsProductFacts(item),
    "",
    `X投稿タイプ：${SNS_POST_TYPES[xType] || xType}（${xType}）`,
    `Threads文章モード：${getThreadsPostModeLabel(posts.threads.threadsPostType)} / 投稿タイプ：${SNS_POST_TYPES[threadsType] || threadsType}（${threadsType}）`,
    `確定ROOM個別URL：${item.roomUrl}`,
    "登録済みのROOM個別URLをXとThreadsの各本文へ完全一致で1回だけ記載する。URLを変更、短縮、省略、推測しない。",
    "",
    "【Xの作成ルール】",
    "発見型を基本とし、商品情報から発見性の高い特徴を1つ選んで冒頭のフックにする。商品名の長い羅列から始めず、特徴は1〜2個に絞る。",
    `${getXLengthPromptRule()} #PRは必須。登録済みROOM URLと#PRは削除しない。`,
    "",
    "【Threadsの作成ルール】",
    posts.threads.threadsPostType === "performance_v1"
      ? `成果型 Ver.1：誰向け＋どんなお得＋期限・今見る理由を短くまとめる。確認済み情報だけを使い、${posts.threads.performanceUrlMode === "reply" ? "本文にはROOM URLを入れず、返信用文章へ完全一致で1回記載する" : "本文へROOM URLを完全一致で1回記載する"}。#PRは必須。`
      : "困りごと型を基本とし、商品説明から合理的に導ける日常の具体的な小さな困りごとを1つ選び、冒頭1〜2文に置く。Xを単純に長文化せず、会話調で困りごと→気になった点→ROOM導線の流れにする。140文字制限は設けない。#PRは必須。",
    "",
    "【共通の安全ルール】",
    usageRule,
    getSalePromptRule(),
    "存在しない使用体験、効果、在庫、最安値、レビュー内容、セール期限、クーポン条件を推測・捏造しない。ROOM紹介文とハッシュタグは変更・再生成しない。",
    "",
    "【Codexの操作】",
    "1. この商品情報と保存済みROOM紹介文・ハッシュタグを確認する。",
    "2. X本文とThreads本文を作成する。",
    "3. アプリの『AI生成結果をまとめて貼り付け』欄へ、下記の区切りを含む結果を直接入力する。",
    "4. 『X・Threadsに反映』を押す。",
    "5. エラーが表示された場合は既存SNS文章を変更せず、原因を報告する。",
    "",
    "【必須入力形式】",
    "===X_POST===",
    "X本文（ROOM URLと#PRを含めて140文字以内）",
    "===END_X_POST===",
    "",
    "===THREADS_POST===",
    posts.threads.threadsPostType === "performance_v1" && posts.threads.performanceUrlMode === "reply" ? "Threads成果型本文（URLなし、#PRを含める）" : "Threads本文（ROOM URLと#PRを含める）",
    "===END_THREADS_POST===",
    ...(posts.threads.threadsPostType === "performance_v1" && posts.threads.performanceUrlMode === "reply" ? ["", "===THREADS_REPLY===", "返信用文章（登録済みROOM URLを完全一致で1回）", "===END_THREADS_REPLY==="] : [])
  ].join("\n");
}

function buildCombinedSnsPrompt(item) {
  const posts = item.snsPosts || createSnsPosts();
  const replyBlock = posts.threads.threadsPostType === "performance_v1" && posts.threads.performanceUrlMode === "reply" ? "\n\n===THREADS_REPLY===\n返信用文章\n===END_THREADS_REPLY===" : "";
  return `次の商品について、X用とThreads用のSNS投稿文章を別々に作成してください。\n\n【X】投稿タイプ：${SNS_POST_TYPES[posts.x.postType] || posts.x.postType}\n${buildSnsPrompt(item, "x", posts.x.postType)}\n\n【Threads】文章モード：${getThreadsPostModeLabel(posts.threads.threadsPostType)} / 投稿タイプ：${SNS_POST_TYPES[posts.threads.postType] || posts.threads.postType}\n${buildSnsPrompt(item, "threads", posts.threads.postType)}\n\n次の区切りをそのまま使って、XとThreadsだけを返してください。ROOM紹介文とハッシュタグは返さないでください。\n===X_POST===\nX本文\n===END_X_POST===\n\n===THREADS_POST===\nThreads本文\n===END_THREADS_POST===${replyBlock}`;
}

function buildCombinedContentPrompt(item) {
  const product = item.product || item;
  const posts = item.snsPosts || createSnsPosts();
  const context = buildGenerationContext(product, item.usageStatus || "不明");
  const itemUrl = item.itemUrl || product.itemUrl || product.affiliateUrl || "";
  const roomUrl = item.roomUrl || "";
  const usageRule = item.usageStatus === "used"
    ? "usageStatusはused。使用体験を書く場合も、利用者が入力した事実の範囲だけに限定する。"
    : "usageStatusはusedではない。使ってみた、買ってみた、愛用しています、使いやすかった、おすすめです、買ってよかった等の使用経験・断定を絶対に書かない。便利そう、気になりました、チェックしておきたい等の安全な表現を使う。";
  const xRules = `Xは短め、冒頭の1〜2行を重視し、商品名の羅列から始めない。${getSnsTypeSpecificRule("x", posts.x.postType)} 投稿タイプは${SNS_POST_TYPES[posts.x.postType] || posts.x.postType}（${posts.x.postType}）。絵文字は少なめ、#PRを付け、必要なら#楽天ROOMを付ける。${getXLengthPromptRule()}`;
  const threadsRules = `ThreadsはXより少し長めの会話調にし、共感・困りごと・発見から始める。商品名や価格だけで始めず、なぜ気になったかを伝え、売り込み感を弱くする。Xの単純な長文化にしない。${getSnsTypeSpecificRule("threads", posts.threads.postType)} 投稿タイプは${SNS_POST_TYPES[posts.threads.postType] || posts.threads.postType}（${posts.threads.postType}）。絵文字は少なめ、#PRを付ける。`;
  return `商品情報を確認し、楽天ROOM紹介文・ハッシュタグ・X投稿文・Threads投稿文を一度に作成してください。存在しない情報、レビュー、効果、在庫、価格、クーポン、セール期限、使用体験を推測・捏造しないでください。\n\n【商品情報】\n${getSnsProductFacts(item)}\n商品URL：${itemUrl || "未設定"}\n${getRoomUrlPromptRule(roomUrl)}\n文章作成用中間情報：対象者=${context.targetUser} / 悩み=${context.problem} / 主なメリット=${context.mainBenefit} / 利用シーン=${context.usageScene} / 商品状態=${context.usageStatus} / 今チェックする理由=${context.saleReason || "なし"}\n\n【ROOM紹介文】\n商品情報だけを使い、対象者・困りごと・特徴・利用場面が伝わる自然な紹介文を作る。未使用または不明の商品は体験談を書かない。\n【ROOMハッシュタグ】\n商品情報とROOM紹介文に合うタグを作る。根拠のない人気・効果・最安表現は使わない。\n【X投稿文】\n${xRules}\n【Threads投稿文】\n${threadsRules}\n【共通の安全ルール】\n${usageRule}\n${getSalePromptRule()}\nURL未設定時は、投稿本文に「ROOM個別URL未設定」と書かず、URL部分を省略する。登録済みURLがある場合は、X_POSTとTHREADS_POSTの両方へ登録URLを1回だけそのまま記載する。\n\n【必須出力形式】\n===ROOM_INTRO===\nROOM紹介文\n===END_ROOM_INTRO===\n\n===ROOM_HASHTAGS===\n#タグ1 #タグ2 #タグ3\n===END_ROOM_HASHTAGS===\n\n===X_POST===\nX投稿文\nROOM個別URLが登録済みなら、URLを1回だけ記載する。\n===END_X_POST===\n\n===THREADS_POST===\nThreads投稿文\nROOM個別URLが登録済みなら、URLを1回だけ記載する。\n===END_THREADS_POST===`;
}

function parseCombinedContentResult(rawText = "") {
  const readBlock = (name) => rawText.match(new RegExp(`===${name}===\\s*([\\s\\S]*?)\\s*===END_${name}===`))?.[1]?.trim() || "";
  const result = {
    introText: readBlock("ROOM_INTRO"),
    hashTags: readBlock("ROOM_HASHTAGS"),
    xText: readBlock("X_POST"),
    threadsText: readBlock("THREADS_POST")
  };
  return result;
}

function countTextOccurrences(text = "", value = "") {
  if (!value) return 0;
  return String(text).split(value).length - 1;
}

function validateCombinedSnsLinks(item, parsed) {
  const roomUrl = String(item.roomUrl || "").trim();
  const snsText = `${parsed.xText}\n${parsed.threadsText}`;
  if (!roomUrl) {
    return snsText.includes("ROOM個別URL未設定") ? "ROOM個別URL未設定という文言をSNS本文へ入れず、URL導線を省略してください。" : "";
  }
  if (countTextOccurrences(parsed.xText, roomUrl) !== 1 || countTextOccurrences(parsed.threadsText, roomUrl) !== 1) {
    return "登録済みのROOM個別URLが、X・Threadsの各本文に1回ずつ含まれていません。既存データは保存していません。";
  }
  if (countTextOccurrences(snsText, roomUrl) !== 2) return "ROOM個別URLの記載回数を確認できないため、保存していません。";
  return "";
}

function validateSnsPostText(item, medium, text) {
  const value = String(text || "").trim();
  if (!value) return `${medium === "x" ? "X" : "Threads"}投稿文が空です。`;
  if (!value.includes("#PR")) return `${medium === "x" ? "X" : "Threads"}投稿に#PRがありません。`;
  if (medium === "x" && Array.from(value).length > SNS_X_MAX_LENGTH) {
    return `X投稿が${Array.from(value).length}文字を超えています（${Array.from(value).length}/${SNS_X_MAX_LENGTH}）。`;
  }
  const requiredUrl = item.skipRequiredLink ? "" : getThreadsLink(item);
  const linkLabel = getThreadsLinkLabel(item);
  if (requiredUrl && countTextOccurrences(value, requiredUrl) !== 1) {
    return `${medium === "x" ? "X" : "Threads"}投稿に登録済み${linkLabel}を1回だけ含めてください。`;
  }
  if (!requiredUrl && (value.includes("ROOM個別URL未設定") || value.includes("楽天アフィリエイトURL未取得") || value.includes("Threads限定投稿用URL未設定"))) {
    return `${linkLabel}未設定を示す内部文言をSNS本文へ入れず、URL導線を省略してください。`;
  }
  return "";
}

function parseSnsPostsResult(rawText = "") {
  const readBlock = (name) => rawText.match(new RegExp(`===${name}===\\s*([\\s\\S]*?)\\s*===END_${name}===`))?.[1]?.trim() || "";
  return { xText: readBlock("X_POST"), threadsText: readBlock("THREADS_POST"), threadsReplyText: readBlock("THREADS_REPLY") };
}

function validateSnsPostsResult(item, parsed) {
  const threads = item.snsPosts?.threads || {};
  if (threads.threadsPostType === "performance_v1" && threads.performanceUrlMode === "reply") {
    const bodyError = validateSnsPostText({ ...item, skipRequiredLink: true }, "threads", parsed.threadsText);
    if (bodyError) return bodyError;
    const requiredUrl = getThreadsLink(item);
    const linkLabel = getThreadsLinkLabel(item);
    if (requiredUrl && countTextOccurrences(parsed.threadsReplyText, requiredUrl) !== 1) return `Threads返信用文章に登録済み${linkLabel}を1回だけ含めてください。`;
    if (!requiredUrl && parsed.threadsReplyText) return `${linkLabel}未設定時は返信用URLを作成しないでください。`;
    return validateSnsPostText(item, "x", parsed.xText);
  }
  return validateSnsPostText(item, "x", parsed.xText) || validateSnsPostText(item, "threads", parsed.threadsText);
}

function applySnsPostsToItem(item, parsed) {
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts.x.text = parsed.xText;
  item.snsPosts.x.status = "draft";
  item.snsPosts.threads.text = parsed.threadsText;
  item.snsPosts.threads.status = "draft";
  if (item.snsPosts.threads.threadsPostType === "performance_v1" && item.snsPosts.threads.performanceUrlMode === "reply") item.snsPosts.threads.replyText = parsed.threadsReplyText || "";
  return item;
}

function applySnsPostsResult(id) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  const input = document.querySelector(`#sns-posts-result-${id}`);
  if (!item || !input) return;
  const parsed = parseSnsPostsResult(input.value || "");
  if (!parsed.xText || !parsed.threadsText) {
    toast("X_POSTとTHREADS_POSTを確認できません。既存のSNS文章は保存していません。");
    return;
  }
  const validationError = validateSnsPostsResult(item, parsed);
  if (validationError) {
    toast(`${validationError} 既存のSNS文章は保存していません。`);
    return;
  }
  applySnsPostsToItem(item, parsed);
  saveData();
  toast("X・Threads文章を保存しました。ROOM紹介文とハッシュタグは変更していません。");
}

function generateCombinedContentPrompt(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return;
  candidate.combinedPrompt = buildCombinedContentPrompt(candidate);
  saveData();
  renderCandidates();
  copyText(candidate.combinedPrompt, { silent: true });
  toast("ROOM・X・Threads用の統合プロンプトを作成しました。");
}

function applyCombinedSnsResult(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  const input = document.querySelector(`#combined-sns-result-${id}`);
  if (!candidate || !input) return;
  codexPasteErrors.delete(id);
  const parsed = parseCombinedContentResult(input.value || "");
  if (!parsed.introText || !parsed.hashTags || !parsed.xText || !parsed.threadsText) {
    codexPasteErrors.set(id, "4項目を確認できません。指定された4つの区切りを含めて貼り付けてください。既存データは保存していません。");
    renderCandidates();
    toast("4項目を解析できません。既存データは保存していません。");
    return;
  }
  const linkError = validateCombinedSnsLinks(candidate, parsed);
  if (linkError) {
    codexPasteErrors.set(id, linkError);
    renderCandidates();
    toast(linkError);
    return;
  }
  const snsResultError = validateSnsPostsResult(candidate, parsed);
  if (snsResultError) {
    codexPasteErrors.set(id, snsResultError);
    renderCandidates();
    toast(`${snsResultError} 既存データは保存していません。`);
    return;
  }
  const copyError = validateGeneratedCopy(parsed.introText, candidate);
  if (copyError) {
    codexPasteErrors.set(id, copyError);
    renderCandidates();
    toast(copyError);
    return;
  }
  if (`${parsed.introText}\n${parsed.hashTags}`.length > 500) {
    codexPasteErrors.set(id, "ROOM紹介文とハッシュタグが500文字を超えています。既存データは保存していません。");
    renderCandidates();
    toast("ROOM紹介文とハッシュタグが500文字を超えています。");
    return;
  }
  candidate.introText = parsed.introText;
  candidate.hashTags = parsed.hashTags;
  candidate.snsPosts = createSnsPosts(candidate.snsPosts);
  candidate.snsPosts.x.text = parsed.xText;
  candidate.snsPosts.x.status = "draft";
  candidate.snsPosts.threads.text = parsed.threadsText;
  candidate.snsPosts.threads.status = "draft";
  candidate.status = "文章作成済み";
  saveData();
  renderCandidates();
  toast("ROOM・X・Threadsの4項目を保存しました。");
}

function saveSnsPost(id, medium, field, value) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  if (!item || !["x", "threads"].includes(medium)) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  if (field === "postType" && value === "experience" && item.usageStatus !== "used") return;
  item.snsPosts[medium][field] = value;
  if (field === "text") {
    item.snsPosts[medium].status = "draft";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const counter = document.querySelector(`[data-sns-count="sns-text-${medium}-${id}"]`);
    const length = Array.from(value || "").length;
    if (counter) {
      counter.textContent = medium === "x" ? `${length} / ${SNS_X_MAX_LENGTH}` : length;
      counter.classList.toggle("sns-count-warning", medium === "x" && length > SNS_X_MAX_LENGTH);
    }
    const warning = document.querySelector(`[data-sns-warning="sns-text-${medium}-${id}"]`);
    if (warning) warning.textContent = medium === "x" && length > SNS_X_MAX_LENGTH ? "140文字を超えています" : "";
    return;
  }
  saveData();
}

function updateRoomUrlInputState(id, value) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  if (!item) return;
  const inputValue = String(value || "").trim();
  const registerButton = document.querySelector(`#room-url-register-${id}`);
  const status = document.querySelector(`#room-url-status-${id}`);
  if (registerButton) registerButton.disabled = !inputValue;
  if (status) {
    const isSavedValue = inputValue && inputValue === String(item.roomUrl || "").trim();
    const notice = isSavedValue ? getRoomUrlNotice(item)[0] : inputValue ? "ROOM個別URL入力済み・未登録" : getRoomUrlNotice(item)[0];
    const noticeType = isSavedValue ? getRoomUrlNotice(item)[1] : inputValue ? "pending" : "missing";
    status.textContent = notice;
    status.className = `room-url-status room-url-status-${noticeType}`;
  }
}

function registerRoomUrl(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  const item = candidate || data.history.find((historyItem) => historyItem.id === id);
  if (!item) return;
  const input = document.querySelector(`#room-url-input-${id}`);
  const roomUrl = String(input?.value || "").trim();
  if (!roomUrl) {
    toast("ROOM個別URLを入力してください。");
    return;
  }
  item.roomUrl = roomUrl;
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts.x.prompt = buildSnsPrompt(item, "x", item.snsPosts.x.postType);
  item.snsPosts.threads.prompt = buildSnsPrompt(item, "threads", item.snsPosts.threads.postType);
  item.snsPosts.x.generatedAt = item.snsPosts.threads.generatedAt = new Date().toISOString();
  if (candidate) recordRoomPosting(candidate, { roomUrl });
  saveData();
  const snsEditor = document.querySelector(`#sns-editor-${id}`);
  if (snsEditor) {
    snsEditor.open = true;
    snsEditor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const [notice, noticeType] = getRoomUrlNotice(item);
  toast(noticeType === "warning" ? `${notice} URLは保存しました。` : candidate ? "ROOM投稿済みとして履歴へ記録し、X・Threads文章生成の準備が完了しました。" : "ROOM個別URLを登録し、X・Threads文章生成の準備が完了しました。");
}

function generateSnsPrompt(id, medium) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  if (!item) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts[medium].prompt = buildSnsPrompt(item, medium, item.snsPosts[medium].postType);
  item.snsPosts[medium].generatedAt = new Date().toISOString();
  saveData();
  copyText(item.snsPosts[medium].prompt);
  toast(`${medium === "x" ? "X" : "Threads"}用プロンプトを作成しました。`);
}

async function startSnsCodexPost(id) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  if (!item) return;
  if (!canStartSnsCodex(item)) {
    toast("ROOM個別URLを登録完了してから実行してください。");
    return;
  }
  item.snsCodexPrompt = buildSnsCodexInstructions(item);
  item.snsCodexGeneratedAt = new Date().toISOString();
  saveData();
  const copied = await copyText(item.snsCodexPrompt, { silent: true });
  toast(copied ? "Codex用SNS指示文を作成しました。Codexが結果入力欄へ直接反映できます。" : "Codex用SNS指示文を作成しました。画面の指示文を確認してください。");
}

function openSnsChatGPT(id, medium) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  if (!item || !["x", "threads"].includes(medium)) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts[medium].prompt = buildSnsPrompt(item, medium, item.snsPosts[medium].postType);
  item.snsPosts[medium].generatedAt = new Date().toISOString();
  saveData();
  copyText(item.snsPosts[medium].prompt, { silent: true });
  window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  toast(`${medium === "x" ? "X" : "Threads"}用プロンプトをコピーしました。ChatGPTで文章を作成し、生成結果をアプリへ貼り付けてください。`);
}

function generateCombinedSnsPrompt(id) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  if (!item) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  item.snsPosts.x.prompt = buildSnsPrompt(item, "x", item.snsPosts.x.postType);
  item.snsPosts.threads.prompt = buildSnsPrompt(item, "threads", item.snsPosts.threads.postType);
  item.snsPosts.x.generatedAt = item.snsPosts.threads.generatedAt = new Date().toISOString();
  saveData();
  copyText(buildCombinedSnsPrompt(item));
  toast("X・Threads用プロンプトをまとめて作成しました。");
}

function openCombinedContentChatGPT(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return;
  candidate.combinedPrompt = buildCombinedContentPrompt(candidate);
  saveData();
  copyText(candidate.combinedPrompt, { silent: true });
  window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  toast("統合プロンプトをコピーしました。ChatGPTで4項目を作成し、生成結果をアプリへ貼り付けてください。");
}

function markSnsPosted(id, medium) {
  const item = data.candidates.find((candidate) => candidate.id === id) || data.history.find((historyItem) => historyItem.id === id);
  if (!item) return;
  item.snsPosts = createSnsPosts(item.snsPosts);
  const validationError = validateSnsPostText(item, medium, item.snsPosts[medium].text);
  if (validationError) {
    toast(`${validationError} 投稿済みには変更していません。`);
    return;
  }
  item.snsPosts[medium].status = "posted";
  item.snsPosts[medium].postedAt = new Date().toISOString();
  saveData();
  toast(`${medium === "x" ? "X" : "Threads"}を投稿済みにしました。`);
}

function setPostStatus(id, status) {
  const item = data.candidates.find((candidate) => candidate.id === id);
  if (!item) return;
  if (["Codex処理中", "確認待ち"].includes(status)) {
    const blocker = getProcessingBlocker(id);
    if (blocker) {
      toast(`別の商品「${blocker.title}」が${blocker.postStatus}のため変更できません。`);
      return;
    }
  }
  if (status === "投稿済み") {
    markPosted(id);
    return;
  }
  item.postStatus = status;
  if (status === "スキップ") item.status = "対象外";
  if (status === "確認待ち" || status === "投稿待ち" || status === "Codex処理中") item.status = "投稿待ち";
  saveData();
  toast(`投稿状態を「${status}」に変更しました。`);
}

async function copyCandidatePrompt(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate?.introPrompt) return;
  if (await copyText(candidate.introPrompt, { silent: true })) toast("Codex投稿指示文をコピーしました。");
  else toast("コピーに失敗しました。表示された指示文を手動でコピーしてください。");
}

async function pasteCodexResult(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return;
  codexPasteErrors.delete(id);
  let rawText;
  try {
    rawText = await navigator.clipboard.readText();
  } catch (error) {
    codexPasteErrors.set(id, "クリップボードを読み取れませんでした。紹介文とハッシュタグを手入力してください。");
    renderCandidates();
    toast("クリップボードを読み取れませんでした。手動入力へ切り替えてください。");
    return;
  }

  const introMatch = rawText.match(/(?:^|\n)\s*紹介文：\s*([\s\S]*?)(?=\n\s*(?:短い紹介文|ハッシュタグ)：)/);
  const hashTagsMatch = rawText.match(/(?:^|\n)\s*ハッシュタグ：\s*([\s\S]*?)(?=\n\s*(?:セール情報|状態)：|$)/);
  const introText = introMatch?.[1]?.trim() || "";
  const hashTags = hashTagsMatch?.[1]?.trim() || "";
  const isConfirmationReady = /(?:^|\n)\s*状態：\s*確認待ち(?:\s|$)/.test(rawText);
  if (!introText || !hashTags) {
    codexPasteErrors.set(id, "Codex結果の形式を確認できませんでした。『紹介文：』『ハッシュタグ：』『状態：確認待ち』を含む形式で手動入力してください。");
    renderCandidates();
    toast("Codex結果の形式を確認できません。保存していません。");
    return;
  }
  const copyError = validateGeneratedCopy(introText, candidate);
  if (copyError) {
    codexPasteErrors.set(id, copyError);
    renderCandidates();
    toast(copyError);
    return;
  }
  if (`${introText}\n${hashTags}`.length > 500) {
    codexPasteErrors.set(id, "紹介文とハッシュタグが500文字を超えています。保存していません。内容を手動で確認してください。");
    renderCandidates();
    toast("紹介文とハッシュタグが500文字を超えています。保存していません。");
    return;
  }
  if (!isConfirmationReady) {
    codexPasteErrors.set(id, "状態が「確認待ち」ではないため保存していません。指定形式を確認してください。");
    renderCandidates();
    toast("状態が確認待ちではありません。保存していません。");
    return;
  }

  const itemCode = candidate.itemCode || candidate.product?.itemCode || "";
  const itemUrl = candidate.itemUrl || candidate.product?.itemUrl || candidate.product?.affiliateUrl || "";
  const matchingCandidates = data.candidates.filter(isRoomCandidate).filter((item) => {
    const sameCode = itemCode && (item.itemCode || item.product?.itemCode) === itemCode;
    const sameUrl = itemUrl && (item.itemUrl || item.product?.itemUrl || item.product?.affiliateUrl) === itemUrl;
    const sameNameShop = item.title === candidate.title && item.shopName === candidate.shopName;
    return sameCode || (!itemCode && sameUrl) || (!itemCode && !itemUrl && sameNameShop);
  });
  if (matchingCandidates.length !== 1 || matchingCandidates[0].id !== candidate.id) {
    codexPasteErrors.set(id, "対象商品を一意に特定できないため保存していません。itemCodeと商品URLを確認してください。");
    renderCandidates();
    toast("対象商品を一意に特定できません。保存していません。");
    return;
  }

  const blocker = getProcessingBlocker(candidate.id);
  if (blocker) {
    codexPasteErrors.set(id, `別の商品「${blocker.title}」が${blocker.postStatus}のため保存していません。`);
    renderCandidates();
    toast("同時処理は禁止されています。先に現在の商品を完了してください。");
    return;
  }

  candidate.introText = introText;
  candidate.hashTags = hashTags;
  candidate.status = "文章作成済み";
  candidate.postStatus = "確認待ち";
  saveData();
  const savedCandidate = data.candidates.find((item) => item.id === id);
  if (savedCandidate?.introText !== introText || savedCandidate?.hashTags !== hashTags) {
    codexPasteErrors.set(id, "保存後の内容確認に失敗したため、確認待ちには変更していません。");
    savedCandidate.postStatus = "エラー";
    saveData();
    toast("保存内容を確認できませんでした。投稿状態をエラーにしました。");
    return;
  }
  renderCandidates();
  toast("Codex結果を商品単位で保存し、投稿キューへ反映しました。");
}

function focusNextCandidate(id) {
  const roomCandidates = data.candidates.filter(isRoomCandidate);
  const index = roomCandidates.findIndex((candidate) => candidate.id === id);
  const next = roomCandidates.slice(index + 1).find((candidate) => candidate.postStatus === "投稿待ち") ||
    roomCandidates.find((candidate) => candidate.postStatus === "投稿待ち");
  if (!next) {
    toast("次の「投稿待ち」商品はありません。");
    return;
  }
  const card = Array.from(document.querySelectorAll(".candidate-card")).find((element) => element.dataset.candidateId === next.id);
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
  toast(`次の商品「${next.title}」を処理できます。自動開始はしていません。`);
}

function getProcessingBlocker(excludeId = "") {
  return data.candidates.filter(isRoomCandidate).find((candidate) => candidate.id !== excludeId && ["Codex処理中", "確認待ち", "要手動確認"].includes(candidate.postStatus));
}

function startSequentialProcessing() {
  const message = $("#codex-result-message");
  const blocker = getProcessingBlocker();
  if (blocker) {
    const text = `別の商品「${blocker.title}」が${blocker.postStatus}です。ROOMの完了後に投稿済みへ変更してください。`;
    if (message) message.textContent = text;
    toast(text);
    return;
  }
  const next = data.candidates.filter(isRoomCandidate).find((candidate) => candidate.postStatus === "投稿待ち");
  if (!next) {
    const text = "投稿待ちの商品がありません。ランキング商品を投稿キューへ追加してください。";
    if (message) message.textContent = text;
    toast(text);
    return;
  }
  startCodexPost(next.id);
}

function startNextCandidate(id) {
  const current = data.candidates.find((candidate) => candidate.id === id);
  if (!current || current.postStatus !== "投稿済み") {
    toast("前の商品を投稿済みにしてから次の商品を処理してください。");
    return;
  }
  const blocker = getProcessingBlocker();
  if (blocker) {
    toast(`別の商品「${blocker.title}」が${blocker.postStatus}のため開始できません。`);
    return;
  }
  const roomCandidates = data.candidates.filter(isRoomCandidate);
  const index = roomCandidates.findIndex((candidate) => candidate.id === id);
  const next = roomCandidates.slice(index + 1).find((candidate) => candidate.postStatus === "投稿待ち") ||
    roomCandidates.find((candidate) => candidate.postStatus === "投稿待ち");
  if (!next) {
    toast("次の投稿待ち商品はありません。");
    return;
  }
  startCodexPost(next.id);
}

function findPostedHistoryRecord(item) {
  const byId = data.history.find((historyItem) => historyItem.id === item.id);
  if (byId) return byId;
  const itemCode = item.itemCode || item.product?.itemCode || "";
  if (!itemCode) return null;
  return data.history.find((historyItem) => (historyItem.itemCode || historyItem.product?.itemCode || "") === itemCode) || null;
}

function recordRoomPosting(item, { roomUrl = item.roomUrl || "", postedAt = "" } = {}) {
  const existingHistory = findPostedHistoryRecord(item);
  const resolvedPostedAt = existingHistory?.postedAt || item.postedAt || postedAt || new Date().toISOString();
  const resolvedRoomUrl = roomUrl || item.roomUrl || existingHistory?.roomUrl || "";
  const historyId = existingHistory?.id || item.id;
  item.status = "投稿済み";
  item.postStatus = "投稿済み";
  item.postedAt = resolvedPostedAt;
  item.roomUrl = resolvedRoomUrl;
  const historySnapshot = {
    ...item,
    id: historyId,
    postedAt: resolvedPostedAt,
    roomUrl: resolvedRoomUrl,
    snsPosts: createSnsPosts(item.snsPosts),
    originalPhoto: existingHistory?.originalPhoto ?? false
  };
  if (existingHistory) Object.assign(existingHistory, historySnapshot);
  else data.history.unshift(historySnapshot);
  return existingHistory || historySnapshot;
}

function completePendingRoomPost() {
  const pending = data.pendingRoomPost;
  if (!pending?.itemCode) {
    toast("投稿中の商品情報がありません。対象カードから投稿を開始してください。");
    return false;
  }
  const item = data.candidates.find((candidate) => (candidate.itemCode || candidate.product?.itemCode || "") === pending.itemCode);
  if (!item) {
    toast("投稿開始時の商品を候補から特定できません。pending情報を保持したまま停止しました。");
    return false;
  }
  if (findPostedHistoryRecord(item)) {
    data.pendingRoomPost = null;
    saveData();
    toast("この商品はすでに投稿履歴にあります。重複登録は行いません。");
    return true;
  }
  const previousPending = pending;
  try {
    recordRoomPosting(item, { postedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const savedHistory = (saved.history || []).find((entry) => (entry.itemCode || entry.product?.itemCode || "") === pending.itemCode);
    if (!savedHistory?.postedAt) throw new Error("投稿履歴の保存確認に失敗しました。");
    data.pendingRoomPost = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderAll();
    toast("ROOM投稿完了をアプリへ記録しました。");
    return true;
  } catch (error) {
    data.pendingRoomPost = previousPending;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (storageError) { console.warn("pending情報の復元保存にも失敗しました。", storageError); }
    toast(`投稿完了の記録に失敗しました。pending情報は保持しています。${error.message ? ` ${error.message}` : ""}`);
    return false;
  }
}

function markPosted(id) {
  const item = data.candidates.find((candidate) => candidate.id === id);
  if (!item) return;
  const existingHistory = findPostedHistoryRecord(item);
  if ((item.status === "投稿済み" || item.postStatus === "投稿済み") && existingHistory) {
    toast("この商品はすでに投稿済みです。");
    return;
  }
  // URL取得前の従来運用でもROOM投稿完了を記録できる。後のURL登録時は同じ履歴を更新する。
  recordRoomPosting(item);
  saveData();
  showTab("history");
  toast("投稿履歴に記録しました。");
}

function generateCandidatePrompt(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate?.product) return;
  applyCollectionMetadata(candidate);
  if (candidate.postType === "warning") {
    generateWarningPrompt(id);
    return;
  }
  currentProduct = candidate.product;
  openDetail(currentProduct);
  generatePrompt();
  candidate.introPrompt = $("#promptOutput").value;
  candidate.hashTags = $("#hashTags").value;
  saveData();
  showTab("detail");
  toast("紹介文プロンプトを作成しました。");
}

function buildCodexPostInstructions(candidate) {
  const product = candidate.product || candidate;
  const itemUrl = candidate.itemUrl || product.itemUrl || product.affiliateUrl || "";
  const context = buildGenerationContext(product, "不明");
  return [
    "楽天ROOM投稿準備をしてください。",
    "",
    "【商品情報】",
    `商品名：${candidate.title || product.itemName || ""}`,
    `価格：${formatYen(candidate.price || product.itemPrice)}`,
    `ショップ名：${candidate.shopName || product.shopName || ""}`,
    `商品説明：${stripHtml(product.itemCaption || "" )}`,
    `セール情報（明記された項目のみ）：${getSaleInfo(product) || "記載なし"}`,
    `クーポン最終有効日の扱い：${getRoomIntroDeadlineRule(product)}`,
    `文章作成用中間情報：対象者=${context.targetUser} / 悩み=${context.problem} / 主なメリット=${context.mainBenefit} / 利用シーン=${context.usageScene} / 商品状態=${context.usageStatus} / 今チェックする理由=${context.saleReason || "なし"}`,
    `商品選定情報：スコア=${getSelectionTotal(candidate)} / ${candidate.selectionGrade || "評価中"} / 選定理由=${(candidate.selectionReason || candidate.selectionReasons || []).join("、") || "未評価"} / 信頼性=${candidate.trustStatus || "未確認"}`,
    `商品URL：${itemUrl}`,
    `itemCode：${candidate.itemCode || product.itemCode || ""}`,
    `categoryId：${candidate.categoryId || product.categoryId || ""}`,
    `categoryName：${candidate.categoryName || product.categoryName || ""}`,
    `rank：${candidate.rank || product.rank || ""}`,
    `fetchedAt：${candidate.fetchedAt || product.fetchedAt || ""}`,
    "",
    "【手順】",
    "1. 商品情報を確認する",
    "2. 商品情報だけを使い、対象者・悩みを冒頭40〜50文字に含め、悩み→特徴・メリット→利用場面→選ぶ理由→必要ならセール情報→自然なCTAの順で楽天ROOM向け紹介文とハッシュタグを作成する",
    `3. #codex-result-inputでitemCode「${candidate.itemCode || product.itemCode || ""}」に一致する商品カードを1件だけ特定する`,
    `4. itemUrl「${itemUrl}」も照合し、商品名だけで判定しない`,
    "5. 作成した紹介文・ハッシュタグをアプリへ先に保存し、結果を反映する",
    `ITEM_CODE:\n${candidate.itemCode || product.itemCode || ""}\n\n紹介文:\n（作成した紹介文）\n\nハッシュタグ:\n（使用したハッシュタグ）\n\n状態:\n確認待ち`,
    "6. 「Codex結果を反映」を押す（Clipboard APIは使用しない）",
    "7. itemCode完全一致の商品だけに保存されたことを確認する",
    "8. アプリ自身が紹介文・ハッシュタグを解析し、localStorageへ保存したことを確認する",
    "9. 一致しない、複数一致、解析失敗、500文字超過、保存後の値不一致の場合は状態をエラーにして停止する",
    "10. 正常時だけpostStatusが確認待ちになったことを確認する",
    "11. 投稿キューの対象カードにある「楽天商品ページを開く」ボタンを通常のChrome操作で押す（itemCodeを保持する）",
    "12. 開いた楽天商品ページの商品名・ショップ名などが対象商品と一致することを確認する。不一致ならROOM操作へ進まず停止する",
    "13. 商品ページ上の「ROOMに投稿」リンクを通常のChrome操作で認識する（aria-label、リンク文字、role=link、アクセシビリティ上の操作可能リンクの順）",
    "14. 認識した実在の「ROOMに投稿」リンクを直接クリックする。JavaScript実行は必須にせず、商品番号・itemCode・商品URLからROOM URLを推測生成しない",
    "14a. クリック後にroom.rakuten.co.jpのROOM投稿画面へ遷移したか確認する。遷移しなければ同じ商品ページで実在する「ROOMに投稿」要素を再取得し、短く待ってから最大2回まで通常クリックを再試行する",
    "14b. 再試行でも遷移しない場合はリンクやURLを推測せず、『ROOM投稿画面へ遷移できませんでした。商品ページの「ROOMに投稿」リンクを手動で確認してください。』と表示し、アプリの投稿状態を「要手動確認」へ変更して停止する",
    "14c. 利用者が手動でROOM投稿画面を開いた後は、対象商品一致、#collect-content、保存済み文章、完了ボタンを確認してから処理を再開する",
    "15. 既存のGoogle Chrome楽天ROOM固定タブを優先して再利用する。商品ページ上のリンクが同一タブ遷移しかできない場合は、そのタブ内でクリックしてよい。ROOM用の新規タブは作成しない",
    "16. 遷移後の現在URLがroom.rakuten.co.jpで、可能なら/mixまたは/mix/collectを含むことを確認する",
    "17. ROOM投稿画面で対象商品、#collect-content、「完了」ボタンを確認する。違う商品なら入力せず停止する",
    "18. 保存済みの紹介文とハッシュタグを#collect-contentへ入力する",
    "19. 商品、文章、ハッシュタグ、500文字以内を確認する",
    "20. ROOMの「完了」は絶対にクリックしない",
    "21. 入力内容と対象商品を最終確認したら、ROOM固定タブを最前面にしたまま60秒間、人間の完了操作を待つ",
    "22. 待機開始時に『投稿準備が完了しました。60秒以内にROOMの「完了」ボタンを押してください。』と表示する",
    "23. 60秒以内に人間がROOMの「完了」を押したことを利用者から確認できた場合だけ、投稿済み記録へ進む。Codex自身は完了を押さない",
    "24. 60秒経過後も完了操作が確認できない場合は『60秒以内に完了操作が確認できなかったため停止しました。』と表示して停止する。自動投稿へ切り替えない",
    "",
    "【紹介文条件】",
    "楽天ROOM向け、親しみやすく、確認できる商品情報だけを使用する。100〜180文字程度、絵文字少なめ、ハッシュタグ5〜8個、全体500文字以内。明記されたセール価格、割引率、クーポン、期間、ポイント還元、通常価格との比較、注意事項がある場合は紹介文へ反映する。確認済みのクーポン最終有効日は、紹介文の冒頭付近へ優先して自然に入力する。商品タイトルからの検出だけでは確認済みにせず、確認前は断定しない。",
    "未使用または状態不明の商品は、使用体験を書かず『便利そう』『候補に入れてもよさそう』などの表現にする。レビューは取得できた情報だけを使う。",
    "生成後に、冒頭の具体性、商品固有性、使用状況、効果・レビュー・価格・クーポン・期限の事実性、煽り表現を自己点検し、条件を満たさなければ書き直す。",
    "出力は『紹介文:』『短い紹介文:』『ハッシュタグ:』『セール情報:（ある場合のみ）』『状態:確認待ち』の見出しを使う。",
    "「絶対」「必ず」「最安」「No.1」など根拠のない断定や効果保証は禁止。",
    "Safari、Codex内蔵ブラウザ、agent-browser、Playwrightは使用しない。Google Chromeだけを使用する。ROOMの完了、自動いいね、フォロー、コメントは実行しない。",
    "",
    "【必ず受け取り欄へ入力する形式】",
    `ITEM_CODE:\n${candidate.itemCode || product.itemCode || ""}`,
    "紹介文:",
    "（作成した紹介文）",
    "ハッシュタグ:",
    "（使用したハッシュタグを空白区切りで記載）",
    "状態:",
    "確認待ち",
    "この4項目を含む結果全体を改変せず、Google Chromeの#codex-result-inputへ入力する。Clipboard APIは使用しない。"
  ].join("\n");
}

async function startCodexPost(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return;
  const active = getProcessingBlocker(id);
  if (active) {
    toast(`別の商品「${active.title}」が${active.postStatus}です。先にROOM投稿を完了して投稿済みにしてください。`);
    return;
  }
  if (["Codex処理中", "確認待ち", "投稿済み", "スキップ"].includes(candidate.postStatus)) {
    toast(`この商品は現在「${candidate.postStatus}」のため、Codex投稿開始は実行しません。`);
    return;
  }
  const itemUrl = candidate.itemUrl || candidate.product?.itemUrl || candidate.product?.affiliateUrl || "";
  const itemCode = candidate.itemCode || candidate.product?.itemCode || "";
  if (!itemCode) {
    resetCodexCandidateAfterFailure(candidate);
    saveData();
    renderCandidates();
    toast("ITEM_CODEがないため、Codex投稿準備を開始できません。商品検索から候補を保存し直してください。");
    return;
  }
  if (!itemUrl) {
    setPostStatus(id, "エラー");
    toast("商品URLがないため、Codex投稿準備を開始できません。");
    return;
  }
  const instructions = buildCodexPostInstructions(candidate);
  data.pendingRoomPost = {
    candidateId: candidate.id,
    itemCode,
    title: candidate.title || candidate.product?.itemName || "",
    startedAt: new Date().toISOString()
  };
  candidate.introPrompt = instructions;
  candidate.postStatus = "Codex処理中";
  candidate.status = "投稿待ち";
  saveData();
  const copied = await copyText(instructions, { silent: true });
  if (copied) {
    toast("Codex投稿指示文をコピーしました。状態を「Codex処理中」にしました。");
  } else {
    toast("コピーに失敗しました。カード内の指示文を手動でコピーしてください。");
    openCandidateForPaste(id);
  }
}

function openCandidateForPaste(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate?.product) return;
  currentProduct = candidate.product;
  openDetail(currentProduct);
  $("#promptOutput").value = candidate.introPrompt || "";
  $("#introText").value = candidate.introText || "";
  $("#hashTags").value = candidate.hashTags || "";
  showTab("detail");
}

function prepareCandidatePost(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return;
  const itemUrl = candidate.itemUrl || candidate.product?.itemUrl || "";
  if (!itemUrl) {
    toast("商品URLがありません。");
    return;
  }
  if (!candidate.introText.trim()) {
    toast("先に紹介文を入力してください。");
    openDetailByCandidate(id);
    return;
  }
  const postText = `${candidate.introText.trim()}\n${candidate.hashTags || ""}`.trim();
  if (postText.length > 500) {
    toast("紹介文とハッシュタグを合わせて500文字以内にしてください。");
    return;
  }
  const instructions = [
    "楽天ROOM投稿準備の操作手順",
    `商品名：${candidate.title}`,
    `商品URL：${itemUrl}`,
    `カテゴリー：${candidate.categoryName || "未設定"}`,
    `ランキング順位：${candidate.rank || "未設定"}位`,
    "1. 開いた商品ページの「ROOMに投稿」をクリック",
    "2. ROOM投稿画面を開く",
    "3. 紹介文欄へ以下を入力する",
    candidate.introText.trim(),
    "4. ハッシュタグを紹介文末尾へ追加する",
    candidate.hashTags || "",
    "5. 内容を確認し、「完了」はクリックせず、60秒間人間の操作を待つ",
    "6. 待機開始時に『投稿準備が完了しました。60秒以内にROOMの「完了」ボタンを押してください。』と表示する",
    "7. 60秒経過後も完了操作が確認できなければ『60秒以内に完了操作が確認できなかったため停止しました。』と表示して停止する"
  ].join("\n");
  data.pendingRoomPost = {
    candidateId: candidate.id,
    itemCode: candidate.itemCode || candidate.product?.itemCode || "",
    title: candidate.title || candidate.product?.itemName || "",
    startedAt: new Date().toISOString()
  };
  candidate.postStatus = "確認待ち";
  candidate.status = "投稿待ち";
  saveData();
  copyText(instructions);
  window.open(itemUrl, "_blank", "noopener,noreferrer");
  toast("商品ページを開き、操作手順をコピーしました。");
}

function deleteCandidate(id) {
  data.candidates = data.candidates.filter((item) => item.id !== id);
  saveData();
}

function saveSettings(event) {
  event.preventDefault();
  data.settings = {
    applicationId: $("#applicationId").value.trim(),
    accessKey: $("#accessKey").value.trim(),
    affiliateId: $("#affiliateId").value.trim(),
    defaultTone: $("#defaultTone").value,
    defaultEmoji: $("#defaultEmoji").value,
    defaultTagCount: Number($("#defaultTagCount").value) || 8,
    rankingCategoryIds: data.settings.rankingCategoryIds || rankingCategories.map((category) => category.id)
  };
  data.eventSettings = {
    eventName: $("#eventName").value.trim(),
    startDate: $("#eventStartDate").value,
    endDate: $("#eventEndDate").value,
    enabled: $("#eventEnabled").checked
  };
  saveData();
  toast("設定を保存しました。");
}

function findDuplicate(product, ignoreId = "") {
  const allItems = [...data.candidates.filter(isRoomCandidate), ...data.history].filter((item) => item.id !== ignoreId);
  const productCodes = getItemCodes(product);
  const identity = rankingIdentity(product);
  const found = allItems.find((item) => {
    const itemCodes = getItemCodes(item);
    if (productCodes.length && itemCodes.length) return itemCodes.some((code) => productCodes.includes(code));
    return rankingIdentity(item.product || item) === identity;
  });
  if (!found) return "";
  return `この商品は${formatDate(found.postedAt || found.savedAt)}に${found.postedAt ? "投稿済み" : "保存済み"}です。`;
}

function canSaveRoomCandidate(product) {
  return !findDuplicate(product);
}

function normalizeItemUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url).split("?")[0].replace(/\/$/, "").toLowerCase();
  }
}

function rankingIdentity(product) {
  const itemCode = getItemCode(product);
  if (itemCode) return `code:${itemCode}`;
  const url = normalizeItemUrl(product.itemUrl || product.affiliateUrl);
  if (url) return `url:${url}`;
  return `shop:${product.shopName || ""}|name:${product.itemName || ""}`.toLowerCase();
}

function postedHistoryMatch(product) {
  return data.history.some((entry) => {
    const historyCodes = getItemCodes(entry);
    const productCodes = getItemCodes(product);
    if (historyCodes.length && productCodes.length) {
      return historyCodes.some((code) => productCodes.includes(code));
    }
    return rankingIdentity(entry.product || entry) === rankingIdentity(product);
  });
}

function normalizeItemCode(itemCode) {
  return itemCode == null ? "" : String(itemCode).trim();
}

function getItemCodes(record = {}) {
  return [...new Set([
    normalizeItemCode(record.itemCode),
    normalizeItemCode(record.product?.itemCode)
  ].filter(Boolean))];
}

function getItemCode(record = {}) {
  return getItemCodes(record)[0] || "";
}

function isVisibleRoomCandidate(item) {
  return isRoomCandidate(item) && !postedHistoryMatch(item);
}

function queuedCandidateMatch(product) {
  return data.candidates.filter(isRoomCandidate).some((entry) => rankingIdentity(entry.product || entry) === rankingIdentity(product));
}

function selectRankingCandidate(categoryItems, context) {
  const ordered = [...categoryItems].map((product) => {
    Object.assign(product, checkProductTrust(product));
    return applySelectionScore(product);
  }).sort((a, b) => {
    const aScore = getSelectionTotal(a);
    const bScore = getSelectionTotal(b);
    return bScore - aScore || (a.rank || 0) - (b.rank || 0);
  });
  const reasons = [];
  for (const product of ordered) {
    if (product.trustStatus !== "通常投稿候補") {
      product.selectionStatus = product.trustStatus === "投稿対象外" ? "trust_excluded" : "trust_review";
      product.selectionReason = `商品信頼性チェック：${product.trustStatus}`;
      reasons.push(`${product.rank}位は${product.trustStatus}`);
      continue;
    }
    const identity = rankingIdentity(product);
    if (postedHistoryMatch(product)) {
      product.selectionStatus = "posted_duplicate";
      product.selectionReason = "投稿済みのため除外";
      reasons.push(`${product.rank}位は投稿済み`);
      continue;
    }
    if (queuedCandidateMatch(product)) {
      product.selectionStatus = "existing_duplicate";
      product.selectionReason = "投稿キューに登録済みのため除外";
      reasons.push(`${product.rank}位は投稿キュー登録済み`);
      continue;
    }
    if (context.selectedIdentities.has(identity)) {
      product.selectionStatus = "session_duplicate";
      product.selectionReason = "今回の他カテゴリーで採用済みのため除外";
      reasons.push(`${product.rank}位は今回の採用済み`);
      continue;
    }
    product.selectionStatus = "selected";
    product.selectionReason = `${getSelectionTotal(product)}点：${(product.selectionReason || product.selectionReasons || []).join("、")}`;
    context.selectedIdentities.add(identity);
    return product;
  }
  return null;
}

function exportJson() {
  downloadFile(`room-assistant-backup-${dateStamp()}.json`, JSON.stringify(data, null, 2), "application/json");
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.candidates) || !Array.isArray(imported.history) || typeof imported.settings !== "object") {
        throw new Error("バックアップ形式が違います。");
      }
      data = { ...defaultData, ...imported, candidates: normalizeSnsRecords(Array.isArray(imported.candidates) ? imported.candidates : []), history: normalizeSnsRecords(Array.isArray(imported.history) ? imported.history : []), sales: Array.isArray(imported.sales) ? imported.sales : [], settings: { ...defaultData.settings, ...(imported.settings || {}) }, trendSettings: { ...defaultData.trendSettings, ...(imported.trendSettings || {}) }, eventSettings: { ...defaultData.eventSettings, ...(imported.eventSettings || {}) } };
      saveData();
      fillSettings();
      toast("バックアップを復元しました。");
    } catch (error) {
      alert(error.message);
    }
  };
  reader.readAsText(file);
}

function exportCsv() {
  const rows = [["投稿日", "商品名", "ジャンル", "ショップ名", "投稿タイプ", "信頼性", "選定スコア", "選定バージョン", "コレクション", "投稿文", "ハッシュタグ", "ROOM投稿URL", "メモ"]];
  data.history.forEach((item) => rows.push([formatDate(item.postedAt), item.title, item.genreId, item.shopName, item.postType, item.trustStatus, getSelectionTotal(item), item.selectionVersion || "", getCollectionById(item.selectedCollection || item.recommendedCollection)?.name || "", item.introText, item.hashTags, item.roomUrl, item.memo]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadFile(`room-history-${dateStamp()}.csv`, `\uFEFF${csv}`, "text/csv");
}

function getSalesRank(sale) {
  return sale.productSnapshot?.sourceRank || sale.productSnapshot?.apiRank || sale.productSnapshot?.rank || "";
}

function getSalesRankBand(rank) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value <= 0) return "順位なし";
  if (value <= 30) return "1〜30位";
  if (value <= 50) return "31〜50位";
  return "その他";
}

function exportSalesCsv() {
  const rows = [["売上発生日時", "ITEM_CODE", "商品名", "ショップ名", "商品URL", "売上金額", "成果報酬", "売上件数", "成果ステータス", "投稿日", "投稿から購入までの日数", "カテゴリー", "投稿タイプ", "選定スコア", "ランキング順位", "ランキング区分", "トレンド商品", "トレンドキーワード"]];
  (data.sales || []).forEach((sale) => {
    const snapshot = sale.productSnapshot || {};
    const rank = getSalesRank(sale);
    rows.push([sale.occurredAt, sale.itemCode, snapshot.title, snapshot.shopName, snapshot.itemUrl, sale.amount, sale.reward, sale.quantity, sale.status, snapshot.postedAt, sale.daysFromPostToSale ?? calculateDaysFromPostToSale(snapshot.postedAt, sale.occurredAt), snapshot.categoryName, snapshot.postType, snapshot.selectionScoreTotal ?? snapshot.selectionScore ?? "", rank, getSalesRankBand(rank), snapshot.productType === "trend" ? "はい" : "いいえ", (snapshot.matchedTrendKeywords || []).join("、")]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadFile(`room-sales-${dateStamp()}.csv`, `\uFEFF${csv}`, "text/csv");
}

function clearData() {
  if (!confirm("保存済みデータをすべて削除しますか？この操作は元に戻せません。")) return;
  data = structuredClone(defaultData);
  saveData();
  fillSettings();
  toast("全データを削除しました。");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function copyValue(id) {
  copyText($(`#${id}`).value);
}

async function copyText(text, options = {}) {
  try {
    await navigator.clipboard.writeText(text || "");
    if (!options.silent) toast("コピーしました。");
    return true;
  } catch {
    return false;
  }
}

function makeTags(product, count) {
  const source = `${stripHtml(product.itemName || "")} ${stripHtml(product.itemCaption || "")} ${product.categoryName || ""}`;
  const words = [];
  if (product.categoryName) words.push(`#${sanitizeTag(product.categoryName)}`);
  stripHtml(product.itemName || "").split(/[ 　/・\-]+/).filter((word) => word.length >= 2).slice(0, count).forEach((word) => words.push(`#${sanitizeTag(word)}`));
  [[/USB|充電|バッテリー/i, "#充電切れ対策"], [/通勤/i, "#通勤便利"], [/旅行/i, "#旅行準備"], [/防災/i, "#防災用品"], [/収納|ラック|ケース/i, "#収納"], [/美容|コスメ|スキンケア|まつ毛/i, "#美容ケア"], [/セール|クーポン|ポイント/i, "#楽天セール"]].forEach(([pattern, tag]) => { if (pattern.test(source)) words.push(tag); });
  words.push("#楽天ROOM");
  return [...new Set(words)].slice(0, count);
}

function getImageCandidates(product = {}) {
  return [...new Set([
    ...(product.mediumImageUrls || []).map((item) => item?.imageUrl),
    ...(product.smallImageUrls || []).map((item) => item?.imageUrl),
    product.imageUrl
  ].filter(Boolean).map((image) => String(image).replace("?_ex=128x128", "")))];
}

function getImage(product) {
  return getImageCandidates(product)[0] || "";
}

function tryNextProductImage(image) {
  const placeholder = image.nextElementSibling;
  let candidates = [];
  try { candidates = JSON.parse(image.dataset.imageCandidates || "[]"); } catch { candidates = []; }
  const nextIndex = Number(image.dataset.imageIndex || 0) + 1;
  if (candidates[nextIndex]) {
    image.dataset.imageIndex = String(nextIndex);
    image.src = candidates[nextIndex];
    return;
  }
  image.hidden = true;
  if (placeholder) placeholder.hidden = false;
}

function formatYen(value) {
  return `${Number(value || 0).toLocaleString("ja-JP")}円`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ja-JP");
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function shorten(text, length) {
  const clean = stripHtml(text);
  return clean.length > length ? `${clean.slice(0, length)}...` : clean;
}

function stripHtml(text) {
  const div = document.createElement("div");
  div.innerHTML = text;
  return div.textContent || div.innerText || "";
}

function sanitizeTag(text) {
  return stripHtml(text).replace(/[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}a-zA-Z0-9_]/gu, "").slice(0, 24);
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll("`", "&#96;");
}

function toast(message) {
  const toastEl = $("#toast");
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}


function addFavoriteByIndex(index) {
  const product = searchResults[index];
  if (product) addFavorite(product);
}

function addFavorite(product) {
  if (!product) return;
  const exists = data.favorites.some((item) => item.itemCode === product.itemCode || item.itemUrl === product.itemUrl);
  if (exists) {
    toast("すでにお気に入りに登録されています。");
    return;
  }
  data.favorites.unshift({
    id: crypto.randomUUID(),
    ...product,
    imageUrl: getImage(product),
    favoriteType: "今すぐ投稿",
    savedAt: new Date().toISOString()
  });
  saveData();
  toast("お気に入りに追加しました。");
}

function renderFavorites() {
  const list = $("#favoriteList");
  if (!list) return;
  const keyword = $("#favoriteFilter")?.value?.trim().toLowerCase() || "";
  const type = $("#favoriteTypeFilter")?.value || "";
  const items = data.favorites.filter((item) => {
    const text = `${item.itemName} ${item.shopName}`.toLowerCase();
    return (!keyword || text.includes(keyword)) && (!type || item.favoriteType === type);
  });
  list.innerHTML = items.length ? items.map((item) => `
    <article class="record-card">
      <img src="${escapeAttr(item.imageUrl || getImage(item))}" alt="">
      <div>
        <h3>${escapeHtml(item.itemName)}</h3>
        <p>${formatYen(item.itemPrice)} / ${escapeHtml(item.shopName)}</p>
        <label>分類<select onchange="updateFavorite('${item.id}', this.value)">${["今すぐ投稿", "セール待ち", "季節商品", "自分で購入予定", "実際に使った商品", "比較検討中"].map((name) => `<option ${item.favoriteType === name ? "selected" : ""}>${name}</option>`).join("")}</select></label>
        <div class="record-actions">
          <button class="primary-button" type="button" onclick="quickSaveFavorite('${item.id}')">投稿候補に追加</button>
          <a class="secondary-button" href="${escapeAttr(item.itemUrl)}" target="_blank" rel="noopener noreferrer">楽天で見る</a>
          <button class="danger-button" type="button" onclick="deleteFavorite('${item.id}')">削除</button>
        </div>
      </div>
    </article>`).join("") : `<p class="message">お気に入りはまだありません。</p>`;
}

function updateFavorite(id, value) {
  const item = data.favorites.find((favorite) => favorite.id === id);
  if (!item) return;
  item.favoriteType = value;
  saveData();
}

function quickSaveFavorite(id) {
  const item = data.favorites.find((favorite) => favorite.id === id);
  if (!item) return;
  quickSave(item);
}

function deleteFavorite(id) {
  data.favorites = data.favorites.filter((item) => item.id !== id);
  saveData();
}

function renderCalendar() {
  const grid = $("#calendarGrid");
  if (!grid) return;
  const month = $("#calendarMonth")?.value || new Date().toISOString().slice(0, 7);
  const items = data.candidates.filter(isRoomCandidate).filter((item) => (item.plannedDate || "").startsWith(month));
  const grouped = items.reduce((acc, item) => {
    (acc[item.plannedDate] ||= []).push(item);
    return acc;
  }, {});
  grid.innerHTML = Object.keys(grouped).length ? Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, records]) => `
    <section class="calendar-day">
      <h3>${new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}</h3>
      ${records.map((item) => `<div class="calendar-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.status)}</span></div>`).join("")}
    </section>`).join("") : `<p class="message">この月の投稿予定はありません。</p>`;
}

function renderGenreChart() {
  const chart = $("#genreChart");
  if (!chart) return;
  const counts = data.history.reduce((acc, item) => {
    const key = item.genreId || "未設定";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...entries.map(([, count]) => count), 1);
  chart.innerHTML = entries.length ? entries.map(([genre, count]) => `<div class="bar-row"><span>${escapeHtml(genre)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count / max * 100)}%"></div></div><strong>${count}</strong></div>`).join("") : `<p class="message">投稿履歴が増えるとジャンル別件数を表示します。</p>`;
}

function openChatGPT() {
  const promptText = $("#promptOutput")?.value || "";
  if (!promptText) {
    generatePrompt();
  }
  const finalPrompt = $("#promptOutput")?.value || "";
  copyText(finalPrompt);
  window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  toast("プロンプトをコピーしてChatGPTを開きました。");
}

async function loadRanking(event) {
  event.preventDefault();
  const message = $("#rankingMessage");
  message.textContent = "ランキングを取得しています...";
  if (!hasRakutenCredentials()) {
    renderRankingResults(sampleProducts);
    message.textContent = "楽天アプリIDまたはアクセスキーが未設定のため、サンプル商品を表示しています。";
    return;
  }
  const selectedCategories = getUnifiedSearchCategories();
  if (!selectedCategories.length) selectedCategories.push({ id: "", name: "総合ランキング" });
  const legacyGenreId = $("#rankingGenreId").value.trim();
  if (legacyGenreId) selectedCategories.unshift({ id: legacyGenreId, name: `ジャンルID ${legacyGenreId}` });
  const rankStart = Number($("#rankingRangeStart").value || 1);
  const rankCount = Math.max(1, Number($("#rankingRangeCount").value || 10));
  const { start: requestedStart, end: requestedEnd } = getRankingRange(rankStart, rankCount);
  const pages = getRankingPagesForRange(requestedStart, rankCount);
  const requestInterval = getRankingRequestInterval(selectedCategories.length);
  rankingRequestContext = { categories: selectedCategories, pages, page: pages[0], requestInterval, rankStart: requestedStart, rankEnd: requestedEnd, rankCount };
  rankingCategoryStates = new Map(selectedCategories.map((category) => [category.id, {
    categoryId: category.id,
    categoryName: category.name,
    status: "retrying",
    httpStatus: null,
    errorMessage: "",
    retryCount: 0,
    lastTriedAt: null
  }]));
  renderRankingRetryControl();
  data.settings.rankingCategoryIds = selectedCategories.map((category) => category.id);
  saveData();
  const allProducts = [];
  const errors = [];
  const diagnostics = [];
  const selectionContext = { selectedIdentities: new Set() };
  for (const [categoryIndex, category] of selectedCategories.entries()) {
    const categoryState = rankingCategoryStates.get(category.id);
    categoryState.status = "retrying";
    categoryState.lastTriedAt = new Date().toISOString();
    showRankingProgress(`${category.name}を取得中...`);
    try {
      const products = [];
      for (const page of pages) {
        if (products.length) await sleep(requestInterval);
        products.push(...filterAvailableProducts(await fetchRankingCategory(category, page, requestInterval)));
      }
      categoryState.status = "success";
      categoryState.httpStatus = 200;
      categoryState.errorMessage = "";
      categoryState.retryCount = 0;
      const categoryProducts = products.map((product) => applyOfficialRankingRank({
        ...product,
        categoryId: category.id,
        categoryName: category.name,
        fetchedAt: new Date().toISOString()
      })).filter((product) => product.rank !== null && product.rank >= requestedStart && product.rank <= requestedEnd);
      const actualRanks = categoryProducts.map((product) => product.rank);
      const actualRange = actualRanks.length ? `${Math.min(...actualRanks)}〜${Math.max(...actualRanks)}位` : "該当なし";
      diagnostics.push(`${category.name}(genreId:${category.id}, page:${pages.join("+")}): API取得${products.length}件 / 要求${requestedStart}〜${requestedEnd}位 / 実取得${actualRange}（${categoryProducts.length}件）`);
      if (!selectRankingCandidate(categoryProducts, selectionContext)) {
        categoryProducts.forEach((product) => {
          if (!product.selectionStatus) {
            product.selectionStatus = "no_candidate";
            product.selectionReason = `${requestedStart}〜${requestedEnd}位すべて除外`;
          }
        });
      }
      allProducts.push(...categoryProducts);
    } catch (error) {
      categoryState.status = "failed";
      categoryState.httpStatus = error.httpStatus || null;
      categoryState.errorMessage = error.message;
      categoryState.retryCount = error.retryCount || 0;
      errors.push(`${category.name}: ${error.message}`);
    }
    if (categoryIndex < selectedCategories.length - 1) {
      showRankingProgress(`${category.name}の取得完了。次のカテゴリーまで待機しています...`);
      await sleep(requestInterval);
    }
  }
  const postedExcludedCount = allProducts.filter((product) => postedHistoryMatch(product)).length;
  renderRankingResults(allProducts);
  renderRankingRetryControl();
  if (!allProducts.length && errors.length) {
    message.textContent = `${errors.join(" / ")} サンプル商品を表示します。`;
    renderRankingResults(sampleProducts);
  } else if (errors.length) {
    message.textContent = `${allProducts.length}件を表示しました。一部カテゴリーで取得に失敗しました：${errors.join(" / ")}`;
  } else {
    message.textContent = allProducts.length
      ? `${allProducts.length}件取得 / 投稿済み除外：${postedExcludedCount}件 / 表示：${searchResults.length}件。${diagnostics.length ? `（${diagnostics.join("、")}）` : ""}`
      : `ランキング結果が0件でした。${diagnostics.length ? ` 診断：${diagnostics.join("、")}` : ""}`;
  }
}

async function retryFailedRanking() {
  if (rankingRetryInProgress || !rankingRequestContext) return;
  const failedCategories = rankingRequestContext.categories.filter((category) => rankingCategoryStates.get(category.id)?.status === "failed");
  if (!failedCategories.length) {
    toast("再取得する失敗カテゴリーはありません。");
    renderRankingRetryControl();
    return;
  }

  rankingRetryInProgress = true;
  renderRankingRetryControl();
  const selectionContext = {
    selectedIdentities: new Set(searchResults.filter((product) => product.selectionStatus === "selected").map((product) => rankingIdentity(product)))
  };
  await sleep(rankingRequestContext.requestInterval);

  for (const [index, category] of failedCategories.entries()) {
    const state = rankingCategoryStates.get(category.id);
    state.status = "retrying";
    state.lastTriedAt = new Date().toISOString();
    showRankingProgress(`${category.name}を再取得中...`);
    try {
      const products = [];
      for (const page of rankingRequestContext.pages || [rankingRequestContext.page]) {
        if (products.length) await sleep(rankingRequestContext.requestInterval);
        products.push(...filterAvailableProducts(await fetchRankingCategory(category, page, rankingRequestContext.requestInterval)));
      }
      const categoryProducts = products.map((product) => applyOfficialRankingRank({
        ...product,
        categoryId: category.id,
        categoryName: category.name,
        fetchedAt: new Date().toISOString()
      })).filter((product) => product.rank !== null && product.rank >= rankingRequestContext.rankStart && product.rank <= rankingRequestContext.rankEnd);
      selectRankingCandidate(categoryProducts, selectionContext);
      searchResults = [...searchResults.filter((product) => product.categoryId !== category.id), ...categoryProducts];
      state.status = "success";
      state.httpStatus = 200;
      state.errorMessage = "";
      state.retryCount = 0;
    } catch (error) {
      state.status = "failed";
      state.httpStatus = error.httpStatus || null;
      state.errorMessage = error.message;
      state.retryCount = error.retryCount || 0;
    }
    renderRankingResults(searchResults);
    if (index < failedCategories.length - 1) await sleep(rankingRequestContext.requestInterval);
  }

  rankingRetryInProgress = false;
  renderRankingRetryControl();
  const remaining = [...rankingCategoryStates.values()].filter((state) => state.status === "failed");
  showRankingProgress(remaining.length ? `再取得後も${remaining.length}カテゴリーが失敗しています。` : "失敗カテゴリーの再取得が完了しました。");
}


function calculateTrendScore(product = {}, matchedTrendKeywords = []) {
  const keywords = [...new Set(matchedTrendKeywords)].filter(Boolean);
  const title = String(product.itemName || "").toLowerCase();
  const description = stripHtml(product.itemCaption || "").toLowerCase();
  const keywordMatch = keywords.length ? (keywords.some((word) => title.includes(word.toLowerCase())) ? 10 : keywords.some((word) => description.includes(word.toLowerCase())) ? 6 : 3) : 0;
  const multiKeyword = keywords.length >= 3 ? 5 : keywords.length === 2 ? 3 : 0;
  const searchPosition = Number(product.trendSearchPosition) >= 1 && Number(product.trendSearchPosition) <= 5 ? 6 - Number(product.trendSearchPosition) : 0;
  return { total: Math.min(20, keywordMatch + multiKeyword + searchPosition), keywordMatch, multiKeyword, searchPosition };
}

function calculateEventTiming(eventSettings = {}, now = new Date()) {
  if (!eventSettings.enabled || !eventSettings.startDate) return { score: 0, label: "" };
  const start = new Date(`${eventSettings.startDate}T00:00:00`);
  const end = eventSettings.endDate ? new Date(`${eventSettings.endDate}T23:59:59`) : null;
  const days = Math.ceil((start - now) / 86400000);
  if (days >= 3 && days <= 5) return { score: 8, label: "イベント開始3〜5日前" };
  if (days >= 1 && days <= 2) return { score: 7, label: "イベント開始1〜2日前" };
  if (now >= start && (!end || now <= end)) return { score: 6, label: "イベント期間中" };
  return { score: 0, label: "" };
}

function calculateOpportunityScore(product = {}, matchedTrendKeywords = [], eventSettings = {}) {
  const price = Number(product.itemPrice) || 0;
  const purchaseIntent = OPPORTUNITY_CONFIG.priceBands.find(([min, max]) => price >= min && price <= max)?.[2] || 0;
  const text = `${product.itemName || ""} ${product.itemCaption || ""}`;
  const materials = [];
  if (Number(product.reviewCount) >= 1000) materials.push("レビュー件数が多い");
  if (Number(product.reviewAverage) >= 4.5) materials.push("レビュー評価が高い");
  if (/\d+%OFF|\d+円OFF|クーポン/i.test(text)) materials.push("値引き・クーポン表記あり");
  if (/送料無料/i.test(text) || product.postageFlag === 1) materials.push("送料無料表記あり");
  if (matchedTrendKeywords.length >= 2) materials.push("複数トレンド一致");
  const clickPotential = Math.min(6, materials.length * 2);
  const event = calculateEventTiming(eventSettings);
  const reasons = [...materials]; if (event.label) reasons.push(event.label);
  return { total: Math.min(20, event.score + purchaseIntent + clickPotential), eventTiming: event.score, purchaseIntent, clickPotential, reasons };
}

function calculateTrendOpportunityScore(product = {}, matchedTrendKeywords = [], eventSettings = {}) {
  const saleInfo = getSaleInfo(product);
  const text = `${product.itemName || ""} ${stripHtml(product.itemCaption || "")}`;
  const reasons = [];
  let score = 0;
  const discountRate = Number(product.discountRate ?? product.saleRate);
  const discountText = text.match(/(\d+)\s*%\s*(?:OFF|オフ)/i);
  const textDiscountRate = discountText ? Number(discountText[1]) : /半額/.test(text) ? 50 : 0;
  const verifiedDiscountRate = Number.isFinite(discountRate) && discountRate > 0 ? discountRate : textDiscountRate;
  if (verifiedDiscountRate >= 30) { score += 5; reasons.push("明記された割引率が高い"); }
  else if (verifiedDiscountRate > 0) { score += 3; reasons.push("明記された割引率あり"); }
  else if (saleInfo && /セール価格|通常価格/i.test(saleInfo)) { score += 3; reasons.push("セール価格を確認できる"); }
  const hasCoupon = Boolean(saleInfo && /クーポン/i.test(saleInfo)) || /クーポン/.test(text);
  if (hasCoupon) { score += 5; reasons.push("クーポン情報あり"); }
  if (saleInfo && /ポイント還元/i.test(saleInfo)) { score += 3; reasons.push("ポイント還元情報あり"); }
  const hasLimitedTiming = Boolean(saleInfo && /セール期間|注意事項/i.test(saleInfo)) || /\d+\s*[時間H]|期間限定|本日限定|日間限定|タイムセール/i.test(text);
  if (hasLimitedTiming) { score += 3; reasons.push("期間・時間限定情報あり"); }
  if (product.isNewProduct || product.newProduct || product.releaseDate || /新発売|発売直後|新商品/i.test(`${text} ${saleInfo}`)) { score += 3; reasons.push("新商品・発売直後の情報あり"); }
  const event = calculateEventTiming(eventSettings);
  if (event.score) { score += Math.min(4, event.score); reasons.push(event.label); }
  if (matchedTrendKeywords.length >= 2) { score += 2; reasons.push("複数トレンド一致"); }
  if (product.rank || product.sourceRank) { score += Number(product.sourceRank ?? product.rank) <= 10 ? 3 : 1; reasons.push("楽天ランキング情報あり"); }
  if (Number(product.reviewCount) >= 1000 && Number(product.reviewAverage) >= 4.5) { score += 3; reasons.push("レビュー実績あり"); }
  return { total: Math.min(20, score), reasons, eventTiming: event.score };
}

function applyStrategyScores(product = {}) {
  const matched = [...new Set(product.matchedTrendKeywords || [])];
  const isTrendProduct = matched.length > 0;
  if (isTrendProduct) {
    const trendSelection = calculateTrendSelectionScore(product, {
      postedIdentities: new Set(data.history.map((item) => rankingIdentity(item.product || item))),
      queuedIdentities: new Set(data.candidates.filter(isRoomCandidate).map((item) => rankingIdentity(item.product || item))),
      matchedTrendKeywords: matched
    });
    product.trendScore = trendSelection.trendScore;
    product.opportunityScore = trendSelection.opportunityScore;
    product.todayPriorityScore = getSelectionTotal(trendSelection);
  } else {
    product.trendScore = calculateTrendScore(product, matched);
    product.opportunityScore = calculateOpportunityScore(product, matched, data.eventSettings);
    product.todayPriorityScore = Math.min(140, getSelectionTotal(product) + product.trendScore.total + product.opportunityScore.total);
  }
  product.priorityReasons = [...(Array.isArray(product.selectionReason) ? product.selectionReason : product.selectionReason ? [product.selectionReason] : []), ...(product.trendScore.total ? [`トレンド一致：${matched.join("、")}`] : []), ...product.opportunityScore.reasons];
  product.salesPoints = product.opportunityScore.reasons;
  product.postPerspective = product.postPerspective || (product.usageStatus === "used" ? "owned" : product.trustStatus === "注意喚起候補" ? "warning" : "wanted");
  product.buyAroundCandidate = Number(product.itemPrice) >= 900 && Number(product.itemPrice) <= 1100;
  product.trendFetchedAt = product.trendFetchedAt || null;
  return product;
}

async function searchTrendProducts() {
  const keywords = $(`#trendKeywords`)?.value.split(/[,、\n]/).map((word) => word.trim()).filter(Boolean).slice(0, TREND_KEYWORD_MAX) || [];
  data.trendSettings = { keywords, updatedAt: new Date().toISOString() }; localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const message = $("#trendMessage"); if (!keywords.length) { if (message) message.textContent = "トレンドワードを入力してください。"; return; }
  if (!hasRakutenCredentials()) { if (message) message.textContent = "楽天API認証情報が未設定のため検索できません。"; return; }
  const merged = new Map();
  for (let i = 0; i < keywords.length; i += 1) {
    if (i) await sleep(keywords.length <= 3 ? RANKING_INTERVAL_SHORT_MS : RANKING_INTERVAL_LONG_MS);
    const requestedCount = TREND_RESULT_COUNT_OPTIONS.includes(Number($("#trendResultCount")?.value)) ? Number($("#trendResultCount").value) : 10;
    const params = new URLSearchParams({ format: "json", applicationId: data.settings.applicationId, accessKey: data.settings.accessKey, keyword: keywords[i], hits: String(requestedCount), sort: "standard" });
    addAffiliateIdParam(params);
    let succeeded = false;
    for (let attempt = 0; attempt <= 1 && !succeeded; attempt += 1) {
      try {
        const response = await fetch(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`);
        if (response.status === 429 && attempt === 0) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (keywords.length <= 3 ? RANKING_INTERVAL_SHORT_MS : RANKING_INTERVAL_LONG_MS));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const items = normalizeRakutenItems(await response.json());
        items.slice(0, requestedCount).forEach((item, index) => {
          const key = rankingIdentity(item);
          const current = merged.get(key) || { ...item, matchedTrendKeywords: [], trendSearchPosition: index + 1 };
          current.matchedTrendKeywords = [...new Set([...current.matchedTrendKeywords, keywords[i]])];
          current.trendSearchPosition = Math.min(current.trendSearchPosition || index + 1, index + 1);
          merged.set(key, current);
        });
        succeeded = true;
      } catch (error) {
        if (attempt === 1 || error.message !== "HTTP 429") {
          if (message) message.textContent = `${keywords[i]}の検索に失敗しました。成功済みの結果は保持しています。`;
        }
      }
    }
  }
  const results = [...merged.values()].map((item) => applyStrategyScores(item)); searchResults = results; renderRankingResults(results); if (message) message.textContent = `${results.length}件のトレンド商品を表示しました。`;
}

function renderRankingResults(products) {
  searchResults = filterAvailableProducts(products);
  const dealCondition = getSelectedDealCondition();
  searchResults.forEach((product) => { if (!product.trustStatus) Object.assign(product, checkProductTrust(product)); product.dealStatus = evaluateDealStatus(product, dealCondition); applySelectionScore(product); applyStrategyScores(product); });
  const displayProducts = [...searchResults].sort((a, b) => {
    if ($("#rankingSortOrder")?.value === "priority") return (b.todayPriorityScore ?? getSelectionTotal(b)) - (a.todayPriorityScore ?? getSelectionTotal(a)) || (a.sourceRank ?? a.rank ?? 0) - (b.sourceRank ?? b.rank ?? 0);
    if ($("#rankingSortOrder")?.value === "score") return getSelectionTotal(b) - getSelectionTotal(a) || (a.sourceRank ?? a.rank ?? 0) - (b.sourceRank ?? b.rank ?? 0);
    return (a.sourceRank ?? a.rank ?? 0) - (b.sourceRank ?? b.rank ?? 0);
  });
  const recommendations = displayProducts.slice().sort((a, b) => (b.todayPriorityScore ?? getSelectionTotal(b)) - (a.todayPriorityScore ?? getSelectionTotal(a)) || (a.sourceRank ?? a.rank ?? 0) - (b.sourceRank ?? b.rank ?? 0)).slice(0, 3);
  const recommendationEl = $("#todayRecommendations");
  if (recommendationEl) recommendationEl.innerHTML = recommendations.length ? `<section aria-label="今日のおすすめ候補"><h3>今日のおすすめ候補</h3><ol class="recommendation-list">${recommendations.map((product, position) => { const targetIndex = searchResults.indexOf(product); const fullTitle = stripHtml(product.itemName || ""); const shortTitle = fullTitle.length > RECOMMENDATION_TITLE_MAX_LENGTH ? `${fullTitle.slice(0, RECOMMENDATION_TITLE_MAX_LENGTH)}…` : fullTitle; const ariaLabel = `おすすめ${position + 1}位 ${fullTitle} 選定スコア${getSelectionTotal(product)}点 ${product.categoryName || "カテゴリー未設定"} ${formatYen(product.itemPrice)}`; return `<li class="recommendation-item"><strong class="recommendation-rank">${position + 1}位</strong><button type="button" class="text-link recommendation-title" title="${escapeAttr(fullTitle)}" aria-label="${escapeAttr(ariaLabel)}" onclick="document.getElementById('ranking-item-${targetIndex}')?.scrollIntoView({behavior:'smooth',block:'center'})">${escapeHtml(shortTitle)}</button><span class="recommendation-meta">${getSelectionTotal(product)}点 / トレンド${product.trendScore?.total ?? 0}点 / 機会${product.opportunityScore?.total ?? 0}点 / 優先度${product.todayPriorityScore ?? getSelectionTotal(product)}点</span><span class="recommendation-meta">${escapeHtml(product.categoryName || "カテゴリー未設定")} / ${formatYen(product.itemPrice)}</span><span class="recommendation-grade">${escapeHtml(product.selectionGrade || selectionGrade(getSelectionTotal(product)))}</span></li>`; }).join("")}</ol></section>` : "";
  const container = $("#rankingResults");
  const scoreBreakdown = (product) => product.matchedTrendKeywords?.length
    ? `<div class="selection-breakdown" aria-label="スコア内訳">購買トレンド適合 ${product.selectionScore?.trendFit || 0} / 30<br>レビュー評価 ${product.selectionScore?.reviewRating || 0} / 20<br>レビュー実績 ${product.selectionScore?.reviewEvidence || 0} / 15<br>価格 ${product.selectionScore?.price || 0} / 10<br>投稿機会 ${product.selectionScore?.opportunity || 0} / 20<br>新規性 ${product.selectionScore?.freshness || 0} / 5</div>`
    : `<div class="selection-breakdown" aria-label="スコア内訳">ランキング ${product.selectionScore?.ranking || 0} / 30<br>レビュー評価 ${product.selectionScore?.reviewRating || 0} / 20<br>レビュー件数 ${product.selectionScore?.reviewCount || 0} / 20<br>価格 ${product.selectionScore?.price || 0} / 15<br>カテゴリー ${product.selectionScore?.category || 0} / 10<br>新規性 ${product.selectionScore?.freshness || 0} / 5</div>`;
  const scoreReasons = (product) => `${dealCondition ? `<div class="coupon-status" aria-label="お買い得判定">${escapeHtml(product.dealStatus.label)}</div>` : ""}<div class="selection-reasons" aria-label="選定理由">${(product.selectionReason || []).map((reason) => `<div>✓ ${escapeHtml(reason)}</div>`).join("") || "<div>✓ 評価理由を確認中</div>"}</div>`;
  const renderDealStatusOnCards = () => {
    if (!dealCondition) return;
    $$("#rankingResults [data-ranking-item-code]").forEach((card) => {
      const product = searchResults.find((item) => item.itemCode === card.dataset.rankingItemCode);
      const body = card.querySelector(".product-body");
      if (!product || !body || body.querySelector("[data-deal-status]") ) return;
      const status = document.createElement("p");
      status.className = "coupon-status";
      status.dataset.dealStatus = product.dealStatus.status;
      status.textContent = product.dealStatus.label;
      body.insertBefore(status, body.querySelector(".selection-score"));
    });
  };
  const productCard = (product, index, overallRank = null) => renderUnifiedProductCard(product, index, { rank: overallRank || product.rank });
  /* Legacy ranking markup remains below until the next cleanup; the shared renderer above is authoritative. */
  const legacyProductCard = (product, index, overallRank = null) => { const alreadyPosted = product.selectionStatus === "posted_duplicate" || postedHistoryMatch(product); return `<article id="ranking-item-${index}" class="product-card" data-ranking-item-code="${escapeAttr(product.itemCode || "")}" data-post-status="${alreadyPosted ? "投稿済み" : "未投稿"}">
          <img src="${escapeAttr(getImage(product))}" alt="">
          <div class="product-body"><div class="product-title">${overallRank ? `${overallRank}位 ` : product.rank ? `${product.rank}位 ` : ""}${escapeHtml(product.itemName)}</div>${alreadyPosted ? `<p class="ranking-post-status" aria-label="投稿済み">投稿済み</p>` : ""}<p class="price">${formatYen(product.itemPrice)}</p><p class="meta">${escapeHtml(product.categoryName || "カテゴリー未設定")} / ${escapeHtml(product.shopName)} / 評価 ${product.reviewAverage || "-"}（${product.reviewCount || 0}件）</p><p class="selection-score" aria-label="選定スコア">選定スコア：${getSelectionTotal(product)} / 100</p><p class="selection-grade" aria-label="推薦ランク">${escapeHtml(product.selectionGrade || selectionGrade(getSelectionTotal(product)))}</p><p class="selection-score" aria-label="トレンド適合と投稿機会">${product.matchedTrendKeywords?.length ? "購買トレンド適合" : "トレンド適合"}：${product.trendScore?.total ?? 0} / ${product.matchedTrendKeywords?.length ? 30 : 20}　投稿機会：${product.opportunityScore?.total ?? 0} / 20</p><p class="selection-score" aria-label="今日の投稿優先度"><strong>今日の投稿優先度：${product.todayPriorityScore ?? getSelectionTotal(product)} / ${product.matchedTrendKeywords?.length ? 100 : 140}</strong></p><details class="selection-details"><summary>スコア内訳・選定理由を見る</summary>${scoreBreakdown(product)}${scoreReasons(product)}<p>${escapeHtml((product.opportunityScore?.reasons || []).join("、"))}</p></details><p class="trust-status">${product.trustStatus === "通常投稿候補" ? "🟢 通常投稿候補" : product.trustStatus === "要確認" ? "🟡 要確認" : product.trustStatus === "注意喚起候補" ? "🟠 注意喚起候補" : product.trustStatus === "投稿対象外" ? "🔴 投稿対象外" : "信頼性未確認"}</p>${product.selectionStatus ? `<p class="ranking-selection"><strong>${product.selectionStatus === "selected" ? "今回の採用商品" : product.selectionStatus === "posted_duplicate" ? "投稿済みのため除外" : product.selectionStatus === "session_duplicate" ? "今回重複のため除外" : product.selectionStatus === "existing_duplicate" ? "投稿キュー登録済みのため除外" : product.trustStatus || "採用候補なし"}</strong><br>${escapeHtml(typeof product.selectionReason === "string" ? product.selectionReason : (product.selectionReason || []).join("、"))}</p>` : ""}</div>
          <div class="button-row"><button class="secondary-button" type="button" onclick="openDetailByIndex(${index})">詳細・紹介文</button><button class="primary-button" type="button" onclick="quickSaveByIndex(${index})">投稿候補に保存</button><button class="secondary-button" type="button" onclick="threadsOnlySaveByIndex(${index})">Threads投稿</button>${["要確認", "注意喚起候補"].includes(product.trustStatus) ? `<button class="secondary-button" type="button" onclick="saveWarningCandidateByIndex(${index})">注意喚起候補として保存</button>` : ""}<button class="secondary-button" type="button" onclick="addFavoriteByIndex(${index})">お気に入り</button><a class="secondary-button" href="${escapeAttr(product.itemUrl)}" target="_blank" rel="noopener noreferrer">楽天で見る</a></div>
        </article>`; };
  const sortOrder = $("#rankingSortOrder")?.value;
  if (["priority", "score"].includes(sortOrder)) {
    container.innerHTML = `<section class="ranking-scoreboard"><h3>選定スコアランキング</h3><div class="product-grid">${displayProducts.map((product, position) => productCard(product, searchResults.indexOf(product), position + 1)).join("")}</div></section>`;
    renderDealStatusOnCards();
    return;
  }
  const groups = displayProducts.reduce((result, product) => {
    const key = product.categoryId || "総合";
    (result[key] ||= { name: product.categoryName || "総合ランキング", products: [] }).products.push(product);
    return result;
  }, {});
  container.innerHTML = Object.values(groups).map((group) => `
    <section class="ranking-group">
      <h3>${escapeHtml(group.name)}</h3>
      <div class="product-grid">${group.products.map((product) => productCard(product, searchResults.indexOf(product))).join("")}</div>
    </section>`).join("");
  renderDealStatusOnCards();
}
