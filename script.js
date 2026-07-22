const STORAGE_KEY = "roomAssistantDataV1";

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
    defaultTone: "やさしい",
    defaultEmoji: "少なめ",
    defaultTagCount: 8
  },
  candidates: [],
  history: [],
  favorites: []
};

let data = loadData();
let currentProduct = null;
let searchResults = [];

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
  $("#historyFilter").addEventListener("input", renderHistory);
  $("#favoriteFilter").addEventListener("input", renderFavorites);
  $("#favoriteTypeFilter").addEventListener("change", renderFavorites);
  $("#calendarMonth").addEventListener("change", renderCalendar);
  $("#rankingForm").addEventListener("submit", loadRanking);
  $("#exportJson").addEventListener("click", exportJson);
  $("#importJson").addEventListener("change", importJson);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#clearData").addEventListener("click", clearData);
}

function fillSettings() {
  $("#applicationId").value = data.settings.applicationId || "";
  $("#defaultTone").value = data.settings.defaultTone;
  $("#defaultEmoji").value = data.settings.defaultEmoji;
  $("#defaultTagCount").value = data.settings.defaultTagCount;
  $("#hits").value = data.settings.defaultHits || "10";
  $("#calendarMonth").value = new Date().toISOString().slice(0, 7);
}

async function searchProducts(event) {
  event.preventDefault();
  const message = $("#searchMessage");
  const keyword = $("#keyword").value.trim();
  message.textContent = "検索しています...";

  if (!data.settings.applicationId) {
    const filtered = sampleProducts.filter((product) => product.itemName.includes(keyword) || product.itemCaption.includes(keyword));
    renderResults(filtered.length ? filtered : sampleProducts);
    message.textContent = "楽天アプリID未設定のため、サンプル商品を表示しています。";
    return;
  }

  const params = new URLSearchParams({
    format: "json",
    applicationId: data.settings.applicationId,
    keyword,
    hits: $("#hits").value,
    sort: $("#sortOrder").value
  });
  addParam(params, "minPrice", $("#minPrice").value);
  addParam(params, "maxPrice", $("#maxPrice").value);
  addParam(params, "reviewAverage", $("#minReview").value);
  addParam(params, "genreId", $("#genreId").value);

  try {
    const response = await fetch(`https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params.toString()}`);
    if (!response.ok) throw new Error("楽天APIの検索に失敗しました。");
    const json = await response.json();
    const products = (json.Items || []).map((entry) => entry.Item);
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

function quickSaveByIndex(index) {
  const product = searchResults[index];
  if (product) quickSave(product);
}

function openDetail(product) {
  currentProduct = product;
  const duplicate = findDuplicate(product);
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
        <label>紹介文<textarea id="introText" placeholder="ChatGPTで作った文章、または自分で書いた紹介文を貼り付けます。"></textarea></label>
        <label>ハッシュタグ<textarea id="hashTags" placeholder="#楽天ROOM #買ってよかった など"></textarea></label>
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
  const duplicate = findDuplicate(product);
  const candidate = {
    id: crypto.randomUUID(),
    product,
    title: product.itemName,
    imageUrl: getImage(product),
    itemUrl: product.itemUrl,
    itemCode: product.itemCode,
    price: product.itemPrice,
    shopName: product.shopName,
    genreId: product.genreId || "",
    introText: $("#introText")?.value || "",
    hashTags: $("#hashTags")?.value || makeTags(product, data.settings.defaultTagCount).join(" "),
    savedAt: new Date().toISOString(),
    plannedDate: new Date().toISOString().slice(0, 10),
    memo: duplicate ? duplicate : "",
    status: $("#introText")?.value ? "文章作成済み" : "未作成",
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

function candidateCard(item) {
  return `
    <article class="record-card">
      <img src="${escapeAttr(item.imageUrl)}" alt="">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p><span class="badge">${escapeHtml(item.status)}</span> ${formatYen(item.price)} / ${escapeHtml(item.shopName)}</p>
        <label>紹介文<textarea onchange="updateCandidate('${item.id}', 'introText', this.value)">${escapeHtml(item.introText)}</textarea></label>
        <label>ハッシュタグ<textarea onchange="updateCandidate('${item.id}', 'hashTags', this.value)">${escapeHtml(item.hashTags)}</textarea></label>
        <label>投稿予定日<input type="date" value="${escapeAttr(item.plannedDate || "")}" onchange="updateCandidate('${item.id}', 'plannedDate', this.value)"></label>
        <div class="record-actions">
          <button class="secondary-button" type="button" onclick="copyText(${JSON.stringify(`${item.introText}\n${item.hashTags}`)})">全文コピー</button>
          <button class="secondary-button" type="button" onclick="markPosted('${item.id}')">投稿済みにする</button>
          <select onchange="updateCandidate('${item.id}', 'status', this.value)">${["未作成", "文章作成済み", "投稿待ち", "投稿済み", "保留", "対象外"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
          <button class="danger-button" type="button" onclick="deleteCandidate('${item.id}')">削除</button>
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
  saveData();
}

function markPosted(id) {
  const item = data.candidates.find((candidate) => candidate.id === id);
  if (!item) return;
  const roomUrl = prompt("ROOM投稿URLがあれば入力してください。空欄でも記録できます。") || "";
  item.status = "投稿済み";
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

function deleteCandidate(id) {
  if (!confirm("この投稿候補を削除しますか？")) return;
  data.candidates = data.candidates.filter((item) => item.id !== id);
  saveData();
}

function saveSettings(event) {
  event.preventDefault();
  data.settings = {
    applicationId: $("#applicationId").value.trim(),
    defaultTone: $("#defaultTone").value,
    defaultEmoji: $("#defaultEmoji").value,
    defaultTagCount: Number($("#defaultTagCount").value) || 8
  };
  saveData();
  toast("設定を保存しました。");
}

function findDuplicate(product, ignoreId = "") {
  const allItems = [...data.candidates, ...data.history].filter((item) => item.id !== ignoreId);
  const found = allItems.find((item) => {
    const saved = item.product || item;
    return saved.itemCode === product.itemCode ||
      saved.itemUrl === product.itemUrl ||
      saved.itemName === product.itemName ||
      (saved.shopName === product.shopName && saved.itemName === product.itemName);
  });
  if (!found) return "";
  return `この商品は${formatDate(found.postedAt || found.savedAt)}に${found.postedAt ? "投稿済み" : "保存済み"}です。`;
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

async function copyText(text) {
  await navigator.clipboard.writeText(text || "");
  toast("コピーしました。");
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
  if (!data.settings.applicationId) {
    renderRankingResults(sampleProducts);
    message.textContent = "楽天アプリID未設定のため、サンプル商品を表示しています。";
    return;
  }
  const params = new URLSearchParams({
    format: "json",
    applicationId: data.settings.applicationId,
    page: "1"
  });
  const genreId = $("#rankingGenreId").value.trim();
  if (genreId) params.set("genreId", genreId);
  try {
    const response = await fetch(`https://app.rakuten.co.jp/services/api/IchibaItem/Ranking/20220601?${params.toString()}`);
    if (!response.ok) throw new Error("ランキングの取得に失敗しました。");
    const json = await response.json();
    const products = (json.Items || []).map((entry) => entry.Item).slice(0, Number($("#rankingHits").value));
    renderRankingResults(products);
    message.textContent = `${products.length}件のランキング商品を表示しました。`;
  } catch (error) {
    renderRankingResults(sampleProducts);
    message.textContent = `${error.message} サンプル商品を表示します。`;
  }
}

function renderRankingResults(products) {
  searchResults = products;
  const container = $("#rankingResults");
  container.innerHTML = products.map((product, index) => `
    <article class="product-card">
      <img src="${escapeAttr(getImage(product))}" alt="">
      <div class="product-body"><div class="product-title">${index + 1}位 ${escapeHtml(product.itemName)}</div><p class="price">${formatYen(product.itemPrice)}</p><p class="meta">${escapeHtml(product.shopName)}</p></div>
      <div class="button-row"><button class="secondary-button" type="button" onclick="openDetailByIndex(${index})">詳細・紹介文</button><button class="primary-button" type="button" onclick="quickSaveByIndex(${index})">投稿候補に保存</button><button class="secondary-button" type="button" onclick="addFavoriteByIndex(${index})">お気に入り</button></div>
    </article>`).join("");
}
