const STORAGE_KEY = "roomAssistantDataV1";
const RANKING_INTERVAL_SHORT_MS = 1200;
const RANKING_INTERVAL_LONG_MS = 1800;
const RANKING_RETRY_SAFETY_MARGIN_MS = 200;
const RANKING_MAX_RETRIES = 1;

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
  favorites: []
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
    return { ...defaultData, ...saved, settings: { ...defaultData.settings, ...(saved?.settings || {}) } };
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
  $("#queue-selected-ranking").addEventListener("click", queueSelectedRanking);
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

async function fetchRankingCategory(category, limit, fallbackWaitMs = RANKING_INTERVAL_SHORT_MS) {
  const params = new URLSearchParams({
    format: "json",
    applicationId: data.settings.applicationId,
    accessKey: data.settings.accessKey,
    page: "1",
    genreId: category.id
  });
  const url = `https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601?${params.toString()}`;
  let retryCount = 0;
  while (true) {
    const response = await fetch(url);
    if (response.ok) {
      const json = await response.json();
      return normalizeRakutenItems(json).slice(0, limit);
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

function renderResults(products) {
  searchResults = products;
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
4. おすすめポイント
5. 誇張表現・断定表現の注意

【必ず守ること】
商品ページにない内容を勝手に追加しないでください。
実際に使っていない場合は「使いました」と書かないでください。
効果、最安値、在庫、セール期限を断定しないでください。`;
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
    savedAt: new Date().toISOString(),
    plannedDate: new Date().toISOString().slice(0, 10),
    memo: duplicate ? duplicate : "",
    status: introText ? "文章作成済み" : "未作成",
    postStatus: introText ? "紹介文作成済み" : "紹介文未作成",
    favoriteType: "今すぐ投稿"
  };
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
  const keyword = $("#candidateFilter")?.value?.trim() || "";
  const status = $("#candidateStatusFilter")?.value || "";
  const items = data.candidates.filter((item) => {
    const text = `${item.title} ${item.shopName} ${item.memo}`.toLowerCase();
    return (!keyword || text.includes(keyword.toLowerCase())) && (!status || item.status === status);
  });
  $("#candidateList").innerHTML = items.length ? items.map(candidateCard).join("") : `<p class="message">投稿候補はまだありません。</p>`;
}

function buildQueueCandidate(product) {
  const itemUrl = product.itemUrl || product.affiliateUrl || "";
  const productWithUrl = product.itemUrl === itemUrl ? product : { ...product, itemUrl };
  return {
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
    savedAt: new Date().toISOString(),
    plannedDate: new Date().toISOString().slice(0, 10),
    memo: "",
    status: "未作成",
    postStatus: "投稿待ち",
    favoriteType: "今すぐ投稿"
  };
}

function queueSelectedRanking() {
  const message = $("#rankingMessage");
  const selected = searchResults.filter((product) => product.selectionStatus === "selected");
  if (!selected.length) {
    message.textContent = "1〜3位に投稿可能な商品がありません。先にランキングを取得してください。";
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
    message.textContent = "1〜3位に投稿可能な商品がありません。登録済みの商品は除外しました。";
    toast("登録済みの商品は投稿キューへ追加しませんでした。");
  }
}

function parseCodexResult(rawText) {
  const itemCode = rawText.match(/(?:^|\n)\s*ITEM_CODE:\s*([^\n]+)/)?.[1]?.trim() || "";
  const introText = rawText.match(/(?:^|\n)\s*紹介文:\s*([\s\S]*?)(?=\n\s*ハッシュタグ:)/)?.[1]?.trim() || "";
  const hashTags = rawText.match(/(?:^|\n)\s*ハッシュタグ:\s*([\s\S]*?)(?=\n\s*状態:|$)/)?.[1]?.trim() || "";
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
  if (`${parsed.introText}\n${parsed.hashTags}`.length > 500) return fail("紹介文とハッシュタグが500文字を超えているため保存していません。");
  const candidate = matches[0];
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

function candidateCard(item) {
  const itemUrl = item.itemUrl || item.product?.itemUrl || item.product?.affiliateUrl || "";
  const productLink = itemUrl
    ? `<a class="secondary-button product-link-button" href="${escapeAttr(itemUrl)}" target="_blank" rel="noopener noreferrer">楽天商品ページを開く</a>`
    : `<button class="secondary-button product-link-button" type="button" disabled>商品URLがありません</button>`;
  return `
    <article class="record-card candidate-card" data-candidate-id="${escapeAttr(item.id)}" data-item-code="${escapeAttr(item.itemCode || item.product?.itemCode || "")}" data-item-url="${escapeAttr(itemUrl)}">
      <img src="${escapeAttr(item.imageUrl)}" alt="">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p><span class="badge">${escapeHtml(item.status)}</span> ${formatYen(item.price)} / ${escapeHtml(item.shopName)}</p>
        <p class="meta">${escapeHtml(item.categoryName || "カテゴリー未設定")} / ${item.rank ? `${escapeHtml(item.rank)}位` : "順位未設定"}</p>
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
          <button class="secondary-button" type="button" onclick="markPosted('${item.id}')">投稿済みにする</button>
          <button class="secondary-button" type="button" onclick="setPostStatus('${item.id}', 'スキップ')">スキップ</button>
          ${["確認待ち", "投稿済み", "スキップ"].includes(item.postStatus) ? `<button class="secondary-button" type="button" onclick="focusNextCandidate('${item.id}')">次の商品</button>` : ""}
        </div>
        <details class="candidate-tools">
          <summary>手動操作・トラブル対応</summary>
          <div class="record-actions">
          <button class="primary-button" type="button" onclick="openDetailByCandidate('${item.id}')">商品詳細・紹介文作成</button>
          <button class="secondary-button" type="button" onclick="generateCandidatePrompt('${item.id}')">紹介文プロンプト</button>
          <button class="secondary-button" type="button" onclick="openCandidateForPaste('${item.id}')">紹介文を貼り付け</button>
          <button class="secondary-button" type="button" onclick="pasteCodexResult('${item.id}')">Codex結果を貼り付け</button>
          <button class="secondary-button" type="button" onclick="prepareCandidatePost('${item.id}')">投稿準備</button>
          ${productLink}
          <button class="secondary-button" type="button" onclick="copyText(${JSON.stringify(`${item.introText}\n${item.hashTags}`)})">全文コピー</button>
          <select aria-label="投稿状態" onchange="setPostStatus('${item.id}', this.value)">${["投稿待ち", "Codex処理中", "確認待ち", "投稿済み", "スキップ", "エラー"].map((status) => `<option ${item.postStatus === status ? "selected" : ""}>${status}</option>`).join("")}</select>
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
  saveData();
}

function setPostStatus(id, status) {
  const item = data.candidates.find((candidate) => candidate.id === id);
  if (!item) return;
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

  const introMatch = rawText.match(/(?:^|\n)\s*紹介文：\s*([\s\S]*?)(?=\n\s*ハッシュタグ：)/);
  const hashTagsMatch = rawText.match(/(?:^|\n)\s*ハッシュタグ：\s*([\s\S]*?)(?=\n\s*状態：|$)/);
  const introText = introMatch?.[1]?.trim() || "";
  const hashTags = hashTagsMatch?.[1]?.trim() || "";
  const isConfirmationReady = /(?:^|\n)\s*状態：\s*確認待ち(?:\s|$)/.test(rawText);
  if (!introText || !hashTags) {
    codexPasteErrors.set(id, "Codex結果の形式を確認できませんでした。『紹介文：』『ハッシュタグ：』『状態：確認待ち』を含む形式で手動入力してください。");
    renderCandidates();
    toast("Codex結果の形式を確認できません。保存していません。");
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

function markPosted(id) {
  const item = data.candidates.find((candidate) => candidate.id === id);
  if (!item) return;
  if (item.status === "投稿済み" || item.postStatus === "投稿済み") {
    toast("この商品はすでに投稿済みです。");
    return;
  }
  const roomUrl = prompt("ROOM投稿URLがあれば入力してください。空欄でも記録できます。") || "";
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
  return [
    "楽天ROOM投稿準備をしてください。",
    "",
    "【商品情報】",
    `商品名：${candidate.title || product.itemName || ""}`,
    `価格：${formatYen(candidate.price || product.itemPrice)}`,
    `ショップ名：${candidate.shopName || product.shopName || ""}`,
    `商品説明：${stripHtml(product.itemCaption || "" )}`,
    `商品URL：${itemUrl}`,
    `itemCode：${candidate.itemCode || product.itemCode || ""}`,
    `categoryId：${candidate.categoryId || product.categoryId || ""}`,
    `categoryName：${candidate.categoryName || product.categoryName || ""}`,
    `rank：${candidate.rank || product.rank || ""}`,
    `fetchedAt：${candidate.fetchedAt || product.fetchedAt || ""}`,
    "",
    "【手順】",
    "1. 商品情報を確認する",
    "2. 商品情報だけを使い、楽天ROOM向け紹介文とハッシュタグを作成する",
    "3. Safariで商品ページを開く",
    "4. JavaScript実行後DOMから aria-label=\"ROOMに投稿\" のa要素を探す",
    "5. そのa要素の実hrefを取得する。商品番号からROOM URLを推測生成しない",
    "6. 取得したROOM URLを直接開く",
    "7. ROOM投稿画面の #collect-content を確認する",
    "8. 紹介文とハッシュタグを入力する",
    "9. 入力内容と文字数（500文字以内）を確認する",
    "10. ROOMの「完了」は絶対にクリックしない",
    "11. ROOM投稿画面の紹介文とハッシュタグを保持する",
    "12. Safariの楽天ROOM投稿アシスタントのタブへ戻る",
    `13. itemCode「${candidate.itemCode || product.itemCode || ""}」をdata-item-codeで検索し、1件だけ一致する商品カードを特定する`,
    `14. itemUrl「${itemUrl}」も照合し、商品名だけで判定しない`,
    "15. #codex-result-inputを特定し、ITEM_CODEを含む結果全文を入力する",
    `ITEM_CODE:\n${candidate.itemCode || product.itemCode || ""}\n\n紹介文:\n（作成した紹介文）\n\nハッシュタグ:\n（使用したハッシュタグ）\n\n状態:\n確認待ち`,
    "16. 「Codex結果を反映」を押す（Clipboard APIは使用しない）",
    "17. itemCode完全一致の商品だけに保存されたことを確認する",
    "18. アプリ自身が紹介文・ハッシュタグを解析し、localStorageへ保存したことを確認する",
    "19. 一致しない、複数一致、解析失敗、500文字超過、保存後の値不一致の場合は状態変更せずエラーとして報告する",
    "20. 正常時だけpostStatusが確認待ちになったことを確認する",
    "21. SafariのROOM投稿画面へ戻り、「完了」直前で停止する",
    "",
    "【紹介文条件】",
    "楽天ROOM向け、親しみやすく、確認できる商品情報だけを使用する。100〜180文字程度、絵文字少なめ、ハッシュタグ5〜8個、全体500文字以内。",
    "「絶対」「必ず」「最安」「No.1」など根拠のない断定や効果保証は禁止。",
    "Codex内蔵ブラウザ、Chrome、agent-browser、Playwright、ROOMの完了、自動いいね、フォロー、コメントは使用しない。Safariだけを使用する。",
    "",
    "【必ず受け取り欄へ入力する形式】",
    `ITEM_CODE:\n${candidate.itemCode || product.itemCode || ""}`,
    "紹介文:",
    "（作成した紹介文）",
    "ハッシュタグ:",
    "（使用したハッシュタグを空白区切りで記載）",
    "状態:",
    "確認待ち",
    "この4項目を含む結果全体を改変せず、Safariの#codex-result-inputへ入力する。Clipboard APIは使用しない。"
  ].join("\n");
}

async function startCodexPost(id) {
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return;
  const active = data.candidates.find((item) => item.id !== id && item.postStatus === "Codex処理中");
  if (active) {
    toast(`別の商品「${active.title}」がCodex処理中です。先に確認待ちまたは投稿済みにしてください。`);
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
    "5. 内容を確認し、「完了」はクリックせず停止する"
  ].join("\n");
  candidate.postStatus = "確認待ち";
  candidate.status = "投稿待ち";
  saveData();
  copyText(instructions);
  window.open(itemUrl, "_blank", "noopener,noreferrer");
  toast("商品ページを開き、操作手順をコピーしました。");
}

function deleteCandidate(id) {
  if (!confirm("この投稿候補を削除しますか？")) return;
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
  const ordered = [...categoryItems].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const reasons = [];
  for (const product of ordered) {
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
    product.selectionReason = reasons.length ? `${reasons.join("、")}のため${product.rank}位を採用` : `${product.rank}位を採用`;
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
  const rows = [["投稿日", "商品名", "ジャンル", "ショップ名", "投稿文", "ハッシュタグ", "ROOM投稿URL", "メモ"]];
  data.history.forEach((item) => rows.push([formatDate(item.postedAt), item.title, item.genreId, item.shopName, item.introText, item.hashTags, item.roomUrl, item.memo]));
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
  const words = ["#楽天ROOM", "#楽天市場", `#${sanitizeTag(product.shopName)}`, "#買い物メモ", "#おすすめ"];
  stripHtml(product.itemName).split(/[ 　/・\-]+/).filter((word) => word.length >= 2).slice(0, count).forEach((word) => words.push(`#${sanitizeTag(word)}`));
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
  const limit = Number($("#rankingHits").value);
  const requestInterval = getRankingRequestInterval(selectedCategories.length);
  rankingRequestContext = { categories: selectedCategories, limit, requestInterval };
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
  const selectionContext = { selectedIdentities: new Set() };
  for (const [categoryIndex, category] of selectedCategories.entries()) {
    const categoryState = rankingCategoryStates.get(category.id);
    categoryState.status = "retrying";
    categoryState.lastTriedAt = new Date().toISOString();
    showRankingProgress(`${category.name}を取得中...`);
    try {
      const products = await fetchRankingCategory(category, limit, requestInterval);
      categoryState.status = "success";
      categoryState.httpStatus = 200;
      categoryState.errorMessage = "";
      categoryState.retryCount = 0;
      const categoryProducts = products.map((product, index) => ({
        ...product,
        categoryId: category.id,
        categoryName: category.name,
        rank: product.rank || index + 1,
        fetchedAt: new Date().toISOString()
      }));
      if (!selectRankingCandidate(categoryProducts, selectionContext)) {
        categoryProducts.forEach((product) => {
          if (!product.selectionStatus) {
            product.selectionStatus = "no_candidate";
            product.selectionReason = "1〜3位すべて除外";
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
    message.textContent = allProducts.length ? `${allProducts.length}件のランキング商品を表示しました。` : "ランキング結果が0件でした。";
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
      const products = await fetchRankingCategory(category, rankingRequestContext.limit, rankingRequestContext.requestInterval);
      const categoryProducts = products.map((product, productIndex) => ({
        ...product,
        categoryId: category.id,
        categoryName: category.name,
        rank: product.rank || productIndex + 1,
        fetchedAt: new Date().toISOString()
      }));
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

function renderRankingResults(products) {
  searchResults = products;
  const container = $("#rankingResults");
  const groups = products.reduce((result, product) => {
    const key = product.categoryId || "総合";
    (result[key] ||= { name: product.categoryName || "総合ランキング", products: [] }).products.push(product);
    return result;
  }, {});
  container.innerHTML = Object.values(groups).map((group) => `
    <section class="ranking-group">
      <h3>${escapeHtml(group.name)}</h3>
      <div class="product-grid">${group.products.map((product) => {
        const index = searchResults.indexOf(product);
        return `<article class="product-card">
          <img src="${escapeAttr(getImage(product))}" alt="">
          <div class="product-body"><div class="product-title">${product.rank ? `${product.rank}位 ` : ""}${escapeHtml(product.itemName)}</div><p class="price">${formatYen(product.itemPrice)}</p><p class="meta">${escapeHtml(product.shopName)} / 評価 ${product.reviewAverage || "-"}（${product.reviewCount || 0}件）</p>${product.selectionStatus ? `<p class="ranking-selection"><strong>${product.selectionStatus === "selected" ? "今回の採用商品" : product.selectionStatus === "posted_duplicate" ? "投稿済みのため除外" : product.selectionStatus === "session_duplicate" ? "今回重複のため除外" : product.selectionStatus === "existing_duplicate" ? "登録済みのため除外" : "採用候補なし"}</strong><br>${escapeHtml(product.selectionReason)}</p>` : ""}</div>
          <div class="button-row"><button class="secondary-button" type="button" onclick="openDetailByIndex(${index})">詳細・紹介文</button><button class="primary-button" type="button" onclick="quickSaveByIndex(${index})">投稿候補に保存</button><button class="secondary-button" type="button" onclick="addFavoriteByIndex(${index})">お気に入り</button><a class="secondary-button" href="${escapeAttr(product.itemUrl)}" target="_blank" rel="noopener noreferrer">楽天で見る</a></div>
        </article>`;
      }).join("")}</div>
    </section>`).join("");
}
