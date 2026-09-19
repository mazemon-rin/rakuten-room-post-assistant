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
const OPPORTUNITY_CONFIG = Object.freeze({ priceBands: [[1000, 1999, 6], [2000, 4999, 5], [5000, 9999, 4], [10000, 29999, 3], [30000, Infinity, 1], [0, 999, 2]] });
const SELECTION_SCORE_CONFIG = Object.freeze({
  ranking: 30, reviewRating: 20, reviewCount: 20, price: 15, category: 10, freshness: 5,
  categories: { "食品": 10, "美容・コスメ・香水": 10, "日用品・生活雑貨": 8, "キッチン用品・食器・調理器具": 8, "家電": 5, "パソコン・周辺機器": 5 }
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
  { id: "100939", name: "美容・コスメ・香水" }
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
    defaultTone: "やさしい",
    defaultEmoji: "少なめ",
    defaultTagCount: 8,
    rankingCategoryIds: rankingCategories.map((category) => category.id)
  },
  candidates: [],
  history: [],
  favorites: [],
  trendSettings: { keywords: [], updatedAt: null },
  eventSettings: { eventName: "", startDate: "", endDate: "", enabled: false }
};

let data = loadData();
let currentProduct = null;
let searchResults = [];
let rankingCategoryStates = new Map();
let rankingRequestContext = null;
let rankingRetryInProgress = false;
const codexPasteErrors = new Map();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindForms();
  fillSettings();
  renderAll();
});

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaultData, ...saved, settings: { ...defaultData.settings, ...(saved?.settings || {}) }, trendSettings: { ...defaultData.trendSettings, ...(saved?.trendSettings || {}) }, eventSettings: { ...defaultData.eventSettings, ...(saved?.eventSettings || {}) } };
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
}

function bindForms() {
  $("#searchForm").addEventListener("submit", searchProducts);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#candidateFilter").addEventListener("input", renderCandidates);
  $("#candidateStatusFilter").addEventListener("change", renderCandidates);
  $("#apply-codex-result").addEventListener("click", applyCodexResult);
  $("#historyFilter").addEventListener("input", renderHistory);
  $("#favoriteFilter").addEventListener("input", renderFavorites);
  $("#favoriteTypeFilter").addEventListener("change", renderFavorites);
  $("#calendarMonth").addEventListener("change", renderCalendar);
  $("#rankingForm").addEventListener("submit", loadRanking);
  $("#trendSearchForm")?.addEventListener("submit", (event) => { event.preventDefault(); searchTrendProducts(); });
  $("#rankingSortOrder").addEventListener("change", () => renderRankingResults(searchResults));
  $("#queue-selected-ranking").addEventListener("click", queueSelectedRanking);
  $("#start-sequential-processing").addEventListener("click", startSequentialProcessing);
  $("#retry-failed-ranking").addEventListener("click", retryFailedRanking);
  $$("input[name='rankingCategory']").forEach((input) => input.addEventListener("change", saveRankingCategorySelection));
  $("#exportJson").addEventListener("click", exportJson);
  $("#importJson").addEventListener("change", importJson);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#clearData").addEventListener("click", clearData);
}

function saveRankingCategorySelection() {
  data.settings.rankingCategoryIds = $$("input[name='rankingCategory']:checked").map((input) => input.value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function fillSettings() {
  $("#applicationId").value = data.settings.applicationId || "";
  $("#accessKey").value = data.settings.accessKey || "";
  $("#defaultTone").value = data.settings.defaultTone;
  $("#defaultEmoji").value = data.settings.defaultEmoji;
  $("#defaultTagCount").value = data.settings.defaultTagCount;
  $("#eventEnabled").checked = Boolean(data.eventSettings?.enabled);
  $("#eventName").value = data.eventSettings?.eventName || "";
  $("#eventStartDate").value = data.eventSettings?.startDate || "";
  $("#eventEndDate").value = data.eventSettings?.endDate || "";
  if ($("#trendKeywords")) $("#trendKeywords").value = (data.trendSettings?.keywords || []).join("、");
  const selectedIds = data.settings.rankingCategoryIds || rankingCategories.map((category) => category.id);
  $$("input[name='rankingCategory']").forEach((input) => {
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
    page: String(page),
    genreId: category.id
  });
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
      logRakutenRankingRawStructure({ json, requestedPage: page, genreId: category.id });
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

function applyOfficialRankingRank(product = {}) {
  const officialRank = Number(product.rank);
  if (!Number.isFinite(officialRank) || officialRank <= 0) {
    return { ...product, apiRank: null, sourceRank: null, rank: null };
  }
  return { ...product, apiRank: officialRank, sourceRank: officialRank, rank: officialRank };
}

// 開発用の一時診断。順位ロジックへ渡す前のJSON構造だけを確認します。
// 認証情報、URL、商品名、商品コード、商品内容は出力しません。
function logRakutenRankingRawStructure({ json, requestedPage, genreId }) {
  const listKey = Array.isArray(json?.items) ? "items" : Array.isArray(json?.Items) ? "Items" : null;
  const entries = listKey ? json[listKey] : [];
  const findRankCandidates = (value, path = "") => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) => {
      const childPath = path ? `${path}.${key}` : key;
      const results = /rank/i.test(key) ? [{ path: childPath, value: typeof child === "string" || typeof child === "number" ? child : "[non-scalar]" }] : [];
      return results.concat(child && typeof child === "object" ? findRankCandidates(child, childPath) : []);
    });
  };
  const inspectEntry = (entry) => ({
    entryKeys: entry && typeof entry === "object" ? Object.keys(entry) : [],
    hasItem: Boolean(entry && typeof entry === "object" && entry.item && typeof entry.item === "object"),
    hasItemUpper: Boolean(entry && typeof entry === "object" && entry.Item && typeof entry.Item === "object"),
    itemKeys: entry?.item && typeof entry.item === "object" ? Object.keys(entry.item) : [],
    itemUpperKeys: entry?.Item && typeof entry.Item === "object" ? Object.keys(entry.Item) : [],
    rankCandidates: findRankCandidates(entry)
  });
  console.warn("[Rakuten Ranking Debug]", {
    requestedPage,
    genreId,
    listKey,
    itemsLength: entries.length,
    topLevelKeys: json && typeof json === "object" ? Object.keys(json) : [],
    firstThree: entries.slice(0, 3).map(inspectEntry)
  });
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
    .replaceAll(data.settings.accessKey || "no-access-key", "[accessKey]");
}

function normalizeRakutenItems(json) {
  const items = json.items || json.Items || [];
  return items.map((entry) => entry.item || entry.Item || entry);
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
    queuedIdentities: new Set(data.candidates.map((item) => rankingIdentity(item.product || item)))
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
    queuedIdentities: new Set(data.candidates.map((item) => rankingIdentity(item.product || item))),
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
  return products.filter((product) => !isUnavailableProduct(product));
}

function renderResults(products) {
  searchResults = products;
  products.forEach((product) => { if (!product.trustStatus) Object.assign(product, checkProductTrust(product)); applySelectionScore(product); });
  $("#results").innerHTML = products.map((product) => {
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
  const duplicate = findDuplicate(productWithUrl);
  const candidate = {
    id: crypto.randomUUID(),
    product: productWithUrl,
    title: productWithUrl.itemName,
    imageUrl: getImage(productWithUrl),
    itemUrl,
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
    performance: productWithUrl.performance || { clicks: null, orders: null, reward: null }
  };
  Object.assign(candidate, checkProductTrust(productWithUrl));
  applySelectionScore(candidate);
  applyStrategyScores(candidate);
  applyCollectionMetadata(candidate);
  data.candidates.unshift(candidate);
  saveData();
  toast("投稿候補に保存しました。");
}

function renderAll() {
  renderDashboard();
  renderCandidates();
  renderHistory();
  renderFavorites();
  renderCalendar();
  renderGenreChart();
}

function renderDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const duplicateCount = data.candidates.filter((candidate) => findDuplicate(candidate.product, candidate.id)).length;
  const stats = [
    ["今日の投稿候補数", data.candidates.filter((item) => item.savedAt.slice(0, 10) === today).length],
    ["未投稿の商品数", data.candidates.filter((item) => item.status !== "投稿済み").length],
    ["今月の投稿数", data.history.filter((item) => item.postedAt.slice(0, 7) === month).length],
    ["重複候補数", duplicateCount]
  ];
  $("#statsGrid").innerHTML = stats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
  $("#recentCandidates").innerHTML = compactItems(data.candidates.slice(0, 5));
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
    const beforeCollectionState = `${item.postType}|${item.recommendedCollection}|${item.collectionStatus}`;
    applyCollectionMetadata(item);
    if (beforeCollectionState !== `${item.postType}|${item.recommendedCollection}|${item.collectionStatus}`) trustUpdated = true;
  });
  if (trustUpdated) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const keyword = $("#candidateFilter")?.value?.trim() || "";
  const status = $("#candidateStatusFilter")?.value || "";
  const items = data.candidates.filter((item) => {
    const text = `${item.title} ${item.shopName} ${item.memo}`.toLowerCase();
    const postStatus = item.postStatus || item.status || "投稿待ち";
    return (!keyword || text.includes(keyword.toLowerCase())) && (!status || postStatus === status || item.status === status);
  });
  $("#candidateList").innerHTML = items.length ? items.map(candidateCard).join("") : `<p class="message">投稿候補はまだありません。</p>`;
  renderQueueProgress();
  renderCollectionSummary();
}

function renderCollectionSummary() {
  const element = $("#collectionSummary");
  if (!element) return;
  const counts = new Map(COLLECTIONS.filter((collection) => collection.enabled).map((collection) => [collection.id, { recommended: 0, selected: 0 }]));
  data.candidates.forEach((item) => {
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
  const queue = data.candidates.filter((item) => !["投稿済み", "スキップ"].includes(item.postStatus));
  const active = data.candidates.find((item) => ["Codex処理中", "確認待ち"].includes(item.postStatus));
  if (!queue.length) {
    progress.textContent = "処理対象の商品はありません。";
    return;
  }
  if (!active) {
    progress.textContent = `投稿待ち ${queue.filter((item) => item.postStatus === "投稿待ち").length}件。連続処理開始で先頭の商品を準備します。`;
    return;
  }
  const position = data.candidates.findIndex((item) => item.id === active.id) + 1;
  progress.textContent = `現在の処理商品：${active.title}（${position} / ${data.candidates.length}件） / 状態：${active.postStatus}`;
}

function buildQueueCandidate(product) {
  const itemUrl = product.itemUrl || product.affiliateUrl || "";
  const productWithUrl = product.itemUrl === itemUrl ? product : { ...product, itemUrl };
  const candidate = {
    id: crypto.randomUUID(),
    product: productWithUrl,
    title: productWithUrl.itemName,
    imageUrl: getImage(productWithUrl),
    itemUrl,
    itemCode: productWithUrl.itemCode || "",
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
    performance: productWithUrl.performance || { clicks: null, orders: null, reward: null }
  };
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

  const existingIdentities = new Set([...data.candidates, ...data.history].map((item) => rankingIdentity(item.product || item)));
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

function applyCodexResult() {
  const message = $("#codex-result-message");
  const parsed = parseCodexResult($("#codex-result-input").value || "");
  const fail = (text) => { message.textContent = text; toast(text); };
  if (!parsed.itemCode) return fail("ITEM_CODEがないため保存していません。");
  const matches = data.candidates.filter((item) => (item.itemCode || item.product?.itemCode || "") === parsed.itemCode);
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

function candidateCard(item) {
  const trust = item.trustStatus ? item : { ...item, ...checkProductTrust(item.product || item) };
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
        ${item.recommendedCollection ? `<p class="collection-status"><strong>推奨コレクション：</strong>${escapeHtml(getCollectionById(item.recommendedCollection)?.name || item.recommendedCollection)}</p><details class="collection-details"><summary>推奨理由を見る</summary><p>${escapeHtml(item.collectionReason || "既存の信頼性チェック結果に基づく推奨です。")}</p></details>` : ""}
        <label class="collection-select"><strong>選択コレクション</strong><select onchange="updateCandidate('${item.id}', 'selectedCollection', this.value)">${collectionOptions(item.selectedCollection)}</select></label>
        <p class="selection-score">選定スコア：${getSelectionTotal(item)} / 100</p><p class="selection-score">${item.matchedTrendKeywords?.length ? "購買トレンド適合" : "トレンド適合"}：${item.trendScore?.total ?? 0} / ${item.matchedTrendKeywords?.length ? 30 : 20}　投稿機会：${item.opportunityScore?.total ?? 0} / 20</p><p class="selection-score"><strong>今日の投稿優先度：${item.todayPriorityScore ?? getSelectionTotal(item)} / ${item.matchedTrendKeywords?.length ? 100 : 140}</strong></p><p class="selection-grade">${escapeHtml(item.selectionGrade || selectionGrade(getSelectionTotal(item)))}</p><details class="selection-details"><summary>選定理由・訴求材料を見る</summary><p>${escapeHtml((item.priorityReasons || item.selectionReason || item.selectionReasons || []).join("\n")).replaceAll("\n", "<br>")}</p><p>${item.buyAroundCandidate ? "買い回り候補" : ""}</p></details>
        ${trustReasonText ? `<details class="trust-details"><summary>判定理由を見る</summary><p>${escapeHtml(trustReasonText).replaceAll("\n", "<br>")}</p></details>` : ""}
        <label>紹介文<textarea id="candidate-intro-${escapeAttr(item.id)}" data-item-code="${escapeAttr(item.itemCode || item.product?.itemCode || "")}" data-item-url="${escapeAttr(itemUrl)}" onchange="updateCandidate('${item.id}', 'introText', this.value)">${escapeHtml(item.introText)}</textarea></label>
        <label>ハッシュタグ<textarea id="candidate-hashtags-${escapeAttr(item.id)}" data-item-code="${escapeAttr(item.itemCode || item.product?.itemCode || "")}" data-item-url="${escapeAttr(itemUrl)}" onchange="updateCandidate('${item.id}', 'hashTags', this.value)">${escapeHtml(item.hashTags)}</textarea></label>
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
  $("#historyList").innerHTML = items.length ? items.map((item) => `
    <article class="record-card">
      <img src="${escapeAttr(item.imageUrl)}" alt="">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p><span class="badge">投稿済み</span> ${formatDate(item.postedAt)} / ${escapeHtml(item.genreId || "ジャンル未設定")}</p>
        <p class="collection-status">投稿タイプ：${escapeHtml({ normal: "通常商品", sale: "セール商品", used: "使用済み商品", warning: "注意喚起商品" }[item.postType] || "通常商品")} / 信頼性：${escapeHtml(item.trustStatus || "未確認")}</p>
        ${item.selectedCollection || item.recommendedCollection ? `<p class="collection-status">コレクション：${escapeHtml(getCollectionById(item.selectedCollection || item.recommendedCollection)?.name || item.selectedCollection || item.recommendedCollection)}</p>` : ""}
        <p>${escapeHtml(shorten(item.introText || "", 140))}</p>
        ${item.roomUrl ? `<a href="${escapeAttr(item.roomUrl)}" target="_blank" rel="noopener noreferrer">ROOM投稿URL</a>` : ""}
      </div>
    </article>
  `).join("") : `<p class="message">投稿履歴はまだありません。</p>`;
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
  const matchingCandidates = data.candidates.filter((item) => {
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
  const index = data.candidates.findIndex((candidate) => candidate.id === id);
  const next = data.candidates.slice(index + 1).find((candidate) => candidate.postStatus === "投稿待ち") ||
    data.candidates.find((candidate) => candidate.postStatus === "投稿待ち");
  if (!next) {
    toast("次の「投稿待ち」商品はありません。");
    return;
  }
  const card = Array.from(document.querySelectorAll(".candidate-card")).find((element) => element.dataset.candidateId === next.id);
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
  toast(`次の商品「${next.title}」を処理できます。自動開始はしていません。`);
}

function getProcessingBlocker(excludeId = "") {
  return data.candidates.find((candidate) => candidate.id !== excludeId && ["Codex処理中", "確認待ち", "要手動確認"].includes(candidate.postStatus));
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
  const next = data.candidates.find((candidate) => candidate.postStatus === "投稿待ち");
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
  const index = data.candidates.findIndex((candidate) => candidate.id === id);
  const next = data.candidates.slice(index + 1).find((candidate) => candidate.postStatus === "投稿待ち") ||
    data.candidates.find((candidate) => candidate.postStatus === "投稿待ち");
  if (!next) {
    toast("次の投稿待ち商品はありません。");
    return;
  }
  startCodexPost(next.id);
}

function markPosted(id) {
  const item = data.candidates.find((candidate) => candidate.id === id);
  if (!item) return;
  if (item.status === "投稿済み" || item.postStatus === "投稿済み") {
    toast("この商品はすでに投稿済みです。");
    return;
  }
  // ROOM投稿URLの入力確認は省略し、利用者が完了を伝えた時点で記録する。
  const roomUrl = "";
  item.status = "投稿済み";
  item.postStatus = "投稿済み";
  data.history.unshift({
    ...item,
    postedAt: new Date().toISOString(),
    roomUrl,
    originalPhoto: false
  });
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
    "楽天ROOM向け、親しみやすく、確認できる商品情報だけを使用する。100〜180文字程度、絵文字少なめ、ハッシュタグ5〜8個、全体500文字以内。明記されたセール価格、割引率、クーポン、期間、ポイント還元、通常価格との比較、注意事項がある場合は紹介文へ反映する。",
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
  if (!itemUrl) {
    setPostStatus(id, "エラー");
    toast("商品URLがないため、Codex投稿準備を開始できません。");
    return;
  }
  const instructions = buildCodexPostInstructions(candidate);
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
  const allItems = [...data.candidates, ...data.history].filter((item) => item.id !== ignoreId);
  const identity = rankingIdentity(product);
  const found = allItems.find((item) => rankingIdentity(item.product || item) === identity);
  if (!found) return "";
  return `この商品は${formatDate(found.postedAt || found.savedAt)}に${found.postedAt ? "投稿済み" : "保存済み"}です。`;
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
  if (product.itemCode) return `code:${product.itemCode}`;
  const url = normalizeItemUrl(product.itemUrl || product.affiliateUrl);
  if (url) return `url:${url}`;
  return `shop:${product.shopName || ""}|name:${product.itemName || ""}`.toLowerCase();
}

function postedHistoryMatch(product) {
  return data.history.some((entry) => rankingIdentity(entry.product || entry) === rankingIdentity(product));
}

function queuedCandidateMatch(product) {
  return data.candidates.some((entry) => rankingIdentity(entry.product || entry) === rankingIdentity(product));
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
      data = { ...defaultData, ...imported };
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

function getImage(product) {
  const image = product.mediumImageUrls?.[0]?.imageUrl || product.smallImageUrls?.[0]?.imageUrl || "";
  return image.replace("?_ex=128x128", "");
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
  const items = data.candidates.filter((item) => (item.plannedDate || "").startsWith(month));
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
  const selectedCategories = $$("input[name='rankingCategory']:checked").map((input) => rankingCategories.find((category) => category.id === input.value)).filter(Boolean);
  if (!selectedCategories.length) {
    renderRankingResults([]);
    message.textContent = "カテゴリーを1つ以上選択してください。";
    return;
  }
  const legacyGenreId = $("#rankingGenreId").value.trim();
  if (legacyGenreId) selectedCategories.unshift({ id: legacyGenreId, name: `ジャンルID ${legacyGenreId}` });
  const rankStart = Number($("#rankingRangeStart").value || 1);
  const rankEnd = rankStart + 4;
  const page = getRankingPageForRange(rankStart);
  const requestInterval = getRankingRequestInterval(selectedCategories.length);
  rankingRequestContext = { categories: selectedCategories, page, requestInterval, rankStart, rankEnd };
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
      const products = filterAvailableProducts(await fetchRankingCategory(category, page, requestInterval));
      categoryState.status = "success";
      categoryState.httpStatus = 200;
      categoryState.errorMessage = "";
      categoryState.retryCount = 0;
      const categoryProducts = products.map((product) => applyOfficialRankingRank({
        ...product,
        categoryId: category.id,
        categoryName: category.name,
        fetchedAt: new Date().toISOString()
      })).filter((product) => product.rank !== null && product.rank >= rankStart && product.rank <= rankEnd);
      const actualRanks = categoryProducts.map((product) => product.rank);
      const actualRange = actualRanks.length ? `${Math.min(...actualRanks)}〜${Math.max(...actualRanks)}位` : "該当なし";
      diagnostics.push(`${category.name}(genreId:${category.id}, page:${page}): API取得${products.length}件 / 要求${rankStart}〜${rankEnd}位 / 実取得${actualRange}（${categoryProducts.length}件）`);
      if (!selectRankingCandidate(categoryProducts, selectionContext)) {
        categoryProducts.forEach((product) => {
          if (!product.selectionStatus) {
            product.selectionStatus = "no_candidate";
            product.selectionReason = `${rankStart}〜${rankEnd}位すべて除外`;
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
  renderRankingResults(allProducts);
  renderRankingRetryControl();
  if (!allProducts.length && errors.length) {
    message.textContent = `${errors.join(" / ")} サンプル商品を表示します。`;
    renderRankingResults(sampleProducts);
  } else if (errors.length) {
    message.textContent = `${allProducts.length}件を表示しました。一部カテゴリーで取得に失敗しました：${errors.join(" / ")}`;
  } else {
    message.textContent = allProducts.length
      ? `${allProducts.length}件のランキング商品を表示しました。${diagnostics.length ? `（${diagnostics.join("、")}）` : ""}`
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
      const products = filterAvailableProducts(await fetchRankingCategory(category, rankingRequestContext.page, rankingRequestContext.requestInterval));
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
      queuedIdentities: new Set(data.candidates.map((item) => rankingIdentity(item.product || item))),
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
    const params = new URLSearchParams({ format: "json", applicationId: data.settings.applicationId, accessKey: data.settings.accessKey, keyword: keywords[i], hits: String(TREND_PRODUCTS_PER_KEYWORD), sort: "standard" });
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
        items.slice(0, TREND_PRODUCTS_PER_KEYWORD).forEach((item, index) => {
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
  searchResults.forEach((product) => { if (!product.trustStatus) Object.assign(product, checkProductTrust(product)); applySelectionScore(product); applyStrategyScores(product); });
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
  const scoreReasons = (product) => `<div class="selection-reasons" aria-label="選定理由">${(product.selectionReason || []).map((reason) => `<div>✓ ${escapeHtml(reason)}</div>`).join("") || "<div>✓ 評価理由を確認中</div>"}</div>`;
  const productCard = (product, index, overallRank = null) => { const alreadyPosted = product.selectionStatus === "posted_duplicate" || postedHistoryMatch(product); return `<article id="ranking-item-${index}" class="product-card" data-ranking-item-code="${escapeAttr(product.itemCode || "")}" data-post-status="${alreadyPosted ? "投稿済み" : "未投稿"}">
          <img src="${escapeAttr(getImage(product))}" alt="">
          <div class="product-body"><div class="product-title">${overallRank ? `${overallRank}位 ` : product.rank ? `${product.rank}位 ` : ""}${escapeHtml(product.itemName)}</div>${alreadyPosted ? `<p class="ranking-post-status" aria-label="投稿済み">投稿済み</p>` : ""}<p class="price">${formatYen(product.itemPrice)}</p><p class="meta">${escapeHtml(product.categoryName || "カテゴリー未設定")} / ${escapeHtml(product.shopName)} / 評価 ${product.reviewAverage || "-"}（${product.reviewCount || 0}件）</p><p class="selection-score" aria-label="選定スコア">選定スコア：${getSelectionTotal(product)} / 100</p><p class="selection-grade" aria-label="推薦ランク">${escapeHtml(product.selectionGrade || selectionGrade(getSelectionTotal(product)))}</p><p class="selection-score" aria-label="トレンド適合と投稿機会">${product.matchedTrendKeywords?.length ? "購買トレンド適合" : "トレンド適合"}：${product.trendScore?.total ?? 0} / ${product.matchedTrendKeywords?.length ? 30 : 20}　投稿機会：${product.opportunityScore?.total ?? 0} / 20</p><p class="selection-score" aria-label="今日の投稿優先度"><strong>今日の投稿優先度：${product.todayPriorityScore ?? getSelectionTotal(product)} / ${product.matchedTrendKeywords?.length ? 100 : 140}</strong></p><details class="selection-details"><summary>スコア内訳・選定理由を見る</summary>${scoreBreakdown(product)}${scoreReasons(product)}<p>${escapeHtml((product.opportunityScore?.reasons || []).join("、"))}</p></details><p class="trust-status">${product.trustStatus === "通常投稿候補" ? "🟢 通常投稿候補" : product.trustStatus === "要確認" ? "🟡 要確認" : product.trustStatus === "注意喚起候補" ? "🟠 注意喚起候補" : product.trustStatus === "投稿対象外" ? "🔴 投稿対象外" : "信頼性未確認"}</p>${product.selectionStatus ? `<p class="ranking-selection"><strong>${product.selectionStatus === "selected" ? "今回の採用商品" : product.selectionStatus === "posted_duplicate" ? "投稿済みのため除外" : product.selectionStatus === "session_duplicate" ? "今回重複のため除外" : product.selectionStatus === "existing_duplicate" ? "投稿キュー登録済みのため除外" : product.trustStatus || "採用候補なし"}</strong><br>${escapeHtml(typeof product.selectionReason === "string" ? product.selectionReason : (product.selectionReason || []).join("、"))}</p>` : ""}</div>
          <div class="button-row"><button class="secondary-button" type="button" onclick="openDetailByIndex(${index})">詳細・紹介文</button><button class="primary-button" type="button" onclick="quickSaveByIndex(${index})">投稿候補に保存</button>${["要確認", "注意喚起候補"].includes(product.trustStatus) ? `<button class="secondary-button" type="button" onclick="saveWarningCandidateByIndex(${index})">注意喚起候補として保存</button>` : ""}<button class="secondary-button" type="button" onclick="addFavoriteByIndex(${index})">お気に入り</button><a class="secondary-button" href="${escapeAttr(product.itemUrl)}" target="_blank" rel="noopener noreferrer">楽天で見る</a></div>
        </article>`; };
  const sortOrder = $("#rankingSortOrder")?.value;
  if (["priority", "score"].includes(sortOrder)) {
    container.innerHTML = `<section class="ranking-scoreboard"><h3>選定スコアランキング</h3><div class="product-grid">${displayProducts.map((product, position) => productCard(product, searchResults.indexOf(product), position + 1)).join("")}</div></section>`;
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
}
