const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element() {
  return { value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, replaceChildren() { this.innerHTML = ""; } };
}
const ids = Object.fromEntries(["expandedSearch", "expandedMode", "expandedOriginType", "expandedOrigin", "expandedRelation", "expandedProblem", "expandedTarget", "expandedSeason", "expandedSeasonPurpose", "expandedSeasonIntent", "expandedSuggest", "expandedPrompt", "expandedKeywords", "expandedJson", "expandedImport", "expandedRun", "expandedRetryFailed", "expandedFailures", "expandedMessage", "expandedTermStats", "expandedResults", "expandedSave", "expandedSaveMessage", "expandedClearResults"].map((id) => [id, element()]));
ids.expandedMode.value = "problem";
ids.expandedOriginType.value = "history";
ids.expandedRelation.value = "same";
ids.expandedSeason.value = "spring";
const selected = [];
const document = { listeners: {}, getElementById(id) { return ids[id] || null; }, querySelectorAll(selector) { return selector === ".expanded-select:checked" ? selected.filter((input) => input.checked !== false) : []; }, addEventListener(name, callback) { this.listeners[name] = callback; } };
const history = [{ id: "history-1", itemCode: "old:1", title: "投稿済み商品", postedAt: "2025-01-01" }];
let current = { candidates: [], history, sales: [] };
let persisted = structuredClone(current);
let quota = false;
let calls = [];
const waits = [];
let inFlight = 0;
let maxInFlight = 0;
let termFourCalls = 0;
let persistent429 = false;
let fakeNow = 0;
let sequence = 0;
let copiedPrompt = "";
const catalog = {
  "検索 1": [{ itemCode: "a:1", itemName: "商品A", itemCaption: "収納に便利", shopName: "店A", itemUrl: "https://item.rakuten.co.jp/shop/item/?scid=affiliate-value", mediumImageUrls: [{ imageUrl: "https://example.test/a.jpg" }] }, { itemCode: "old:1", itemName: "投稿済み商品" }],
  "検索 2": [{ itemCode: "a:1", itemName: "商品A" }, { itemCode: "b:2", itemName: "商品B" }, { itemCode: "unavailable:1", itemName: "販売終了商品" }],
  "検索 3": [{ itemCode: "c:3", itemName: "商品C" }],
  "検索 4": [{ itemCode: "d:4", itemName: "商品D" }],
  "検索 5": [{ itemCode: "e:5", itemName: "商品E" }],
  "メンズ ニットパンツ": [
    { itemCode: "pants:2", itemName: "メンズ ニットパンツ" },
    { itemCode: "cover:2", itemName: "ゴルフ用ヘッドカバー", itemCaption: "30%OFF 比較" },
    { itemCode: "outerwear:1", itemName: "メンズ スイングトップ" },
    { itemCode: "generic-pants:1", itemName: "メンズ パンツ" }
  ]
};
const context = {
  console, document, data: current, searchResults: [], Date: { now: () => fakeNow }, crypto: { randomUUID: () => `candidate-${++sequence}` }, navigator: { clipboard: { writeText: async (text) => { copiedPrompt = text; } } },
  hasRakutenCredentials: () => true,
  requestRakutenItemSearch: async (term) => {
    calls.push(term);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    if (persistent429 && term === "検索 2") { const error = new Error("HTTP 429"); error.status = 429; throw error; }
    if (term === "検索 4" && termFourCalls++ === 0) { const error = new Error("HTTP 500"); error.status = 500; throw error; }
    return { status: "ok", products: catalog[term] || [] };
  },
  sleep: async (milliseconds) => { waits.push(milliseconds); fakeNow += milliseconds; },
  isUnavailableProduct: (product) => product.itemCode === "unavailable:1",
  rankingIdentity: (product) => product.itemCode,
  getItemCode: (product) => product.itemCode || "",
  normalizeItemCode: (code) => String(code || "").trim(),
  canSaveRoomCandidate: (product) => ![...current.candidates, ...current.history].some((item) => item.itemCode === product.itemCode),
  buildQueueCandidate: (product) => ({ id: `candidate-${++sequence}`, itemCode: product.itemCode, title: product.itemName, product, postStatus: "投稿待ち", savedAt: new Date().toISOString() }),
  saveData: (next) => { if (quota) return { ok: false }; persisted = structuredClone(next); current = next; context.data = next; return { ok: true }; },
  loadData: () => structuredClone(persisted),
  formatYen: () => "1,000円", escapeHtml: (s) => String(s).replaceAll("<", "&lt;"), escapeAttr: (s) => String(s).replaceAll('"', "&quot;"),
  getImage: (product) => product.mediumImageUrls?.[0]?.imageUrl || "",
  window: { DuplicateDetection: { canSaveRoomCandidate: (product, candidates, entries) => ![...candidates, ...entries].some((item) => item.itemCode === product.itemCode) } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("src/core/expanded-search.js", "utf8"), context);
vm.runInContext(fs.readFileSync("src/expanded-search-ui.js", "utf8"), context);
document.listeners.DOMContentLoaded();
const click = async (id) => ids[id].listeners.click();
const copiedRequestId = () => ids.expandedMessage.textContent.match(/照合ID: (\S+)/)?.[1] || "";

(async () => {
  assert.match(ids.expandedSeasonPurpose.innerHTML, /value="newlife"/, "initial season purpose options are populated for the default spring season");
  ids.expandedKeywords.value = "手動編集済み検索語";
  ids.expandedSeason.value = "winter";
  ids.expandedSeason.listeners.change();
  assert.equal(ids.expandedKeywords.value, "手動編集済み検索語", "changing season never regenerates or overwrites search terms");
  assert.match(ids.expandedSeasonPurpose.innerHTML, /value="dry"/, "purpose options follow the selected season");
  ids.expandedMode.value = "seasonal";
  ids.expandedMode.listeners.change();
  ids.expandedSeasonPurpose.value = "cold";
  await click("expandedSuggest");
  assert.equal(ids.expandedKeywords.value, "電気毛布\n湯たんぽ\n防寒手袋\n断熱カーテン\nあったか靴下", "winter cold purpose suggests concrete product categories");
  const winterTerms = ids.expandedKeywords.value;
  ids.expandedSeasonPurpose.value = "dry";
  assert.equal(ids.expandedKeywords.value, winterTerms, "changing purpose does not overwrite the current keywords");
  await click("expandedSuggest");
  assert.equal(ids.expandedKeywords.value, "加湿器\n卓上加湿器\n保湿クリーム\nリップクリーム\n加湿フィルター");
  ids.expandedSeasonIntent.value = "在宅ワーク中の足元の寒さ対策";
  await click("expandedSuggest");
  assert.equal(ids.expandedKeywords.value, "デスクヒーター\n足元パネルヒーター\n電気フットウォーマー\nルームシューズ 防寒\n足元用ブランケット", "free intent takes priority and maps to relevant categories");
  const savedTermsBeforeConflict = ids.expandedKeywords.value;
  ids.expandedSeasonIntent.value = "夏の暑さ対策";
  await click("expandedSuggest");
  assert.equal(ids.expandedKeywords.value, savedTermsBeforeConflict, "conflicting input leaves existing terms untouched");
  assert.match(ids.expandedMessage.textContent, /矛盾/);
  ids.expandedSeasonIntent.value = "在宅ワーク中の足元の寒さ対策";
  await click("expandedPrompt");
  const seasonalRequestId = copiedRequestId();
  assert.match(copiedPrompt, /検索語を1〜5件、1行に1件ずつ/);
  assert.match(copiedPrompt, /各検索語は2〜40文字/);
  assert.match(copiedPrompt, /引用符・カンマ・番号を付けず、JSON・説明文・Markdownは出力しない/);
  assert.match(copiedPrompt, /同義語の重複を避け/);
  assert.match(copiedPrompt, /具体的な商品カテゴリを優先/);
  assert.doesNotMatch(copiedPrompt, /JSONのみ|schemaVersion=1|keywords=2〜40文字/);
  assert.match(copiedPrompt, /"seasonPurpose":"dry"/);
  assert.match(copiedPrompt, /"customIntent":"在宅ワーク中の足元の寒さ対策"/);
  ids.expandedJson.value = JSON.stringify({ schemaVersion: 1, requestId: seasonalRequestId, searchMode: "seasonal", keywords: ["検索語 1", "検索語 2"] });
  await click("expandedImport");
  assert.equal(ids.expandedKeywords.value, "検索語 1\n検索語 2", "matching seasonal JSON replaces terms without automatic regeneration");

  ids.expandedMode.value = "problem";
  ids.expandedMode.listeners.change();
  ids.expandedProblem.value = "冬の寒さ対策";
  ids.expandedTarget.value = "在宅ワーカー";
  await click("expandedSuggest");
  assert.match(ids.expandedKeywords.value, /デスクヒーター|足元パネルヒーター/, "target user influences problem suggestions");
  assert.doesNotMatch(ids.expandedKeywords.value, /便利|対策|おすすめ/);

  ids.expandedKeywords.value = "";
  await click("expandedPrompt");
  const initialRequestId = copiedRequestId();
  ids.expandedJson.value = JSON.stringify({ schemaVersion: 1, requestId: "wrong", searchMode: "problem", keywords: ["誤った 語句"] });
  await click("expandedImport");
  assert.equal(ids.expandedKeywords.value, "", "invalid Codex JSON never changes search terms");
  const fiveKeywords = [1, 2, 3, 4, 5].map((n) => `検索 ${n}`);
  ids.expandedJson.value = JSON.stringify({ schemaVersion: 1, requestId: initialRequestId, searchMode: "problem", keywords: fiveKeywords });
  await click("expandedImport");
  assert.equal(ids.expandedKeywords.value, fiveKeywords.join("\n"), "all five matching JSON terms replace the previous field content");
  const firstRun = click("expandedRun");
  const duplicateRun = click("expandedRun");
  await Promise.all([firstRun, duplicateRun]);
  assert.deepEqual(calls.slice(0, 5), fiveKeywords, "the API receives the exact five terms imported from JSON");
  assert.equal(calls.length, 5, "five searches are attempted");
  assert.match(ids.expandedMessage.textContent, /今回5\/5検索語を実行（成功4・失敗1）/);
  assert.equal(maxInFlight, 1, "search requests never run concurrently");
  assert.deepEqual(waits, [1000, 1000, 1000, 1000], "sequential requests are separated by one second");
  assert.match(ids.expandedMessage.textContent, /失敗・未実行1件/);
  assert.match(ids.expandedFailures.innerHTML, /検索 4.*HTTP 500/);
  assert.equal(ids.expandedRetryFailed.hidden, false, "retry control appears only when there are failed terms");
  assert.equal((ids.expandedResults.innerHTML.match(/class="expanded-result"/g) || []).length, 5, "five groups merge, duplicate product deduplicated");
  assert.match(ids.expandedResults.innerHTML, /投稿済み商品[\s\S]*登録済み/);
  assert.match(ids.expandedResults.innerHTML, /class="expanded-result-image" src="https:\/\/example\.test\/a\.jpg"/, "product image is visible in search result");
  assert.match(ids.expandedResults.innerHTML, /href="https:\/\/item\.rakuten\.co\.jp\/shop\/item\/\?scid=affiliate-value" target="_blank" rel="noopener noreferrer">楽天市場で商品を見る ↗<\/a>/, "product URL is retained as a safe external link");
  assert.doesNotMatch(ids.expandedResults.innerHTML, /商品URL：|商品URL:/, "long product URLs are not printed as text");
  assert.match(ids.expandedResults.innerHTML, /この商品を候補登録/, "eligible product cards have an individual registration action");
  assert.match(ids.expandedResults.innerHTML, /取得元の検索語：検索 1 \/ 検索 2/, "merged product retains all successful query sources");
  assert.match(ids.expandedResults.innerHTML, /商品固有の選定理由（任意・手入力）[\s\S]*value="" placeholder="任意。根拠がある場合だけ入力"/, "product description is not automatically extracted into a new selection reason");
  assert.match(ids.expandedTermStats.innerHTML, /検索 1[\s\S]*API取得<\/dt><dd>2件<\/dd>/, "per-query API count uses the response item count");
  assert.match(ids.expandedTermStats.innerHTML, /検索 2[\s\S]*API取得<\/dt><dd>3件<\/dd>[\s\S]*重複除外<\/dt><dd>1件<\/dd>[\s\S]*販売状態による除外<\/dt><dd>1件<\/dd>/, "duplicates and unavailable products are counted separately for the query");
  assert.match(ids.expandedTermStats.innerHTML, /検索 4[\s\S]*API：失敗：HTTP 500[\s\S]*API取得<\/dt><dd>—件<\/dd>/, "failed query shows failure without fabricating a zero result count");
  assert.match(ids.expandedResults.innerHTML, /class="secondary-button expanded-register" data-index="1" disabled\s*>登録済み<\/button>/, "duplicate product registration button is disabled");
  const productBCard = ids.expandedResults.innerHTML.split(/<article class="expanded-result">/).find((card) => card.includes("商品B")) || "";
  assert.doesNotMatch(productBCard, /expanded-result-link/, "products without a URL do not render a link");
  assert.equal(ids.expandedSave.hidden, false);

  await click("expandedRetryFailed");
  assert.deepEqual(calls, ["検索 1", "検索 2", "検索 3", "検索 4", "検索 5", "検索 4"], "retry runs only the failed search term");
  assert.deepEqual(waits, [1000, 1000, 1000, 1000, 1000], "retry also respects the interval from the previous request");
  assert.equal((ids.expandedResults.innerHTML.match(/class="expanded-result"/g) || []).length, 6, "successful earlier results remain and retried results are merged");
  assert.equal(ids.expandedRetryFailed.hidden, true, "retry control hides after recovery");

  const manualReasonInput = { dataset: { index: "0" }, value: "収納", closest: () => null };
  ids.expandedResults.listeners.input({ target: { closest: (selector) => selector === ".expanded-reason" ? manualReasonInput : null } });
  selected.push({ dataset: { index: "0" }, closest: () => ({ querySelector: () => manualReasonInput }) });
  selected.push({ dataset: { index: "1" }, closest: () => ({ querySelector: () => ({ value: "" }) }) });
  await click("expandedSave");
  assert.equal(persisted.candidates.length, 1, "posted product is excluded");
  assert.equal(persisted.candidates[0].itemCode, "a:1");
  assert.equal(persisted.candidates[0].searchContext.selectionReason, "収納");
  assert.match(ids.expandedResults.innerHTML, /class="expanded-reason" data-index="0" maxlength="160" value="収納"/, "manual selection reason remains after successful registration rerender");
  assert.match(ids.expandedSaveMessage.textContent, /登録成功1件、重複除外1件/);
  assert.equal(persisted.history.length, 1, "history remains unchanged");

  const candidateCountBeforeSingle = persisted.candidates.length;
  const productCard = { querySelector: () => ({ value: "" }) };
  const singleButton = { dataset: { index: "2" }, closest: () => productCard };
  await ids.expandedResults.listeners.click({ target: { closest: (selector) => selector === ".expanded-register" ? singleButton : null } });
  assert.equal(persisted.candidates.length, candidateCountBeforeSingle + 1, "individual registration saves exactly one product");
  assert.equal(persisted.candidates.at(-1).itemCode, "b:2", "individual registration uses the clicked card itemCode");
  assert.match(ids.expandedResults.innerHTML, /候補または履歴に登録済み[\s\S]*登録済み/, "successful individual registration updates the card");
  await ids.expandedResults.listeners.click({ target: { closest: (selector) => selector === ".expanded-register" ? singleButton : null } });
  assert.equal(persisted.candidates.length, candidateCountBeforeSingle + 1, "registered product cannot be registered twice");
  assert.match(ids.expandedSaveMessage.textContent, /登録成功0件、重複除外1件/);

  selected.length = 0;
  selected.push({ dataset: { index: "3" }, closest: () => ({ querySelector: () => ({ value: "" }) }) });
  quota = true;
  await click("expandedSave");
  assert.match(ids.expandedMessage.textContent, /保存に失敗/);
  assert.equal(persisted.candidates.length, candidateCountBeforeSingle + 1, "quota failure keeps persisted snapshot");

  const old = { id: "legacy", itemCode: "legacy:1", product: { itemName: "旧候補" } };
  persisted.candidates.push(old);
  assert.equal(persisted.candidates.at(-1).searchContext, undefined, "old candidate needs no search context");
  assert.equal(persisted.candidates.at(-1).product.itemName, "旧候補");

  ids.expandedMode.value = "related";
  ids.expandedMode.listeners.change();
  ids.expandedRelation.value = "compare";
  assert.equal(ids.expandedKeywords.value, fiveKeywords.join("\n"), "switching modes leaves the visible keyword field unchanged");
  assert.match(ids.expandedOrigin.innerHTML, /old:1/, "posted history can be a related-search origin");
  ids.expandedJson.value = JSON.stringify({ schemaVersion: 1, requestId: initialRequestId, searchMode: "problem", keywords: ["古い条件"] });
  await click("expandedImport");
  assert.equal(ids.expandedKeywords.value, fiveKeywords.join("\n"), "JSON from an earlier mode cannot overwrite the current keywords");
  assert.match(ids.expandedMessage.textContent, /現在の条件でCodex用プロンプト/);
  const previousPrompt = copiedPrompt;
  await click("expandedPrompt");
  assert.equal(copiedPrompt, previousPrompt, "compare prompt is not generated when the origin category is unknown");
  assert.match(ids.expandedMessage.textContent, /カテゴリを特定できません/);
  ids.expandedOriginType.value = "sales";
  ids.expandedOriginType.listeners.change();
  assert.match(ids.expandedOrigin.innerHTML, /照合できる商品がありません/, "unlinked sales are not treated as identified products");
  current.sales = [{ historyId: "history-1", itemCode: "old:1" }];
  ids.expandedOriginType.listeners.change();
  assert.match(ids.expandedOrigin.innerHTML, /old:1/, "linked sales can be a related-search origin");

  history.unshift({ id: "pants-history", itemCode: "nb:1", title: "ニューバランス メンズ ニットワイドテーパードパンツ", product: { itemName: "ニューバランス メンズ ニットワイドテーパードパンツ", categoryName: "メンズファッション > ズボン・パンツ" } });
  ids.expandedOriginType.value = "history";
  ids.expandedOriginType.listeners.change();
  ids.expandedOrigin.value = "0";
  ids.expandedTarget.value = "メンズ";
  await click("expandedSuggest");
  assert.match(ids.expandedKeywords.value, /メンズ テーパードパンツ[\s\S]*メンズ ワイドパンツ/);
  ids.expandedKeywords.value = "メンズ ニットパンツ";
  await click("expandedRun");
  assert.match(ids.expandedResults.innerHTML, /関連性あり/);
  assert.match(ids.expandedResults.innerHTML, /関連性なし（候補登録対象外）/);
  assert.match(ids.expandedResults.innerHTML, /data-index="1" disabled/);
  assert.match(ids.expandedResults.innerHTML, /data-index="2" disabled/);
  assert.match(ids.expandedResults.innerHTML, /要確認（判定確定まで候補登録不可）/);
  assert.match(ids.expandedResults.innerHTML, /data-index="3" disabled/, "ambiguous category cannot be selected for candidate registration");
  const candidatesBeforeAmbiguousSave = current.candidates.length;
  const prohibitedCard = { querySelector: () => ({ value: "" }) };
  const prohibitedButton = { dataset: { index: "1" }, closest: () => prohibitedCard };
  await ids.expandedResults.listeners.click({ target: { closest: (selector) => selector === ".expanded-register" ? prohibitedButton : null } });
  assert.equal(current.candidates.length, candidatesBeforeAmbiguousSave, "individual registration rejects a different-category product in comparison mode");
  assert.match(ids.expandedSaveMessage.textContent, /失敗1件/);
  selected.length = 0;
  selected.push({ dataset: { index: "3" }, closest: () => ({ querySelector: () => ({ value: "" }) }) });
  await click("expandedSave");
  assert.equal(current.candidates.length, candidatesBeforeAmbiguousSave, "save handler rejects an ambiguous product even if a checked input is supplied");
  assert.match(ids.expandedSaveMessage.textContent, /失敗1件/);
  selected.length = 0;

  ids.expandedMode.value = "problem";
  ids.expandedMode.listeners.change();
  await click("expandedPrompt");
  const singleRequestId = copiedRequestId();
  ids.expandedJson.value = JSON.stringify({ schemaVersion: 1, requestId: singleRequestId, searchMode: "problem", keywords: ["単独の検索語"] });
  await click("expandedImport");
  assert.equal(ids.expandedKeywords.value, "単独の検索語", "one JSON term replaces prior five terms without being padded");
  calls = [];
  await click("expandedRun");
  assert.deepEqual(calls, ["単独の検索語"], "one imported term triggers one API request");
  assert.match(ids.expandedMessage.textContent, /今回1\/1検索語を実行（成功1・失敗0）/);

  calls = [];
  waits.length = 0;
  persistent429 = true;
  ids.expandedKeywords.value = ["検索 1", "検索 2", "検索 3"].join("\n");
  await click("expandedRun");
  assert.deepEqual(calls, ["検索 1", "検索 2"], "persistent rate limit stops later API requests");
  assert.deepEqual(waits.slice(-2), [1000, 1000], "new searches retain the request interval across batches");
  assert.match(ids.expandedMessage.textContent, /HTTP 429が続いたため、残りの検索語を停止/);
  assert.match(ids.expandedFailures.innerHTML, /検索 3.*未実行/);
  assert.match(ids.expandedTermStats.innerHTML, /検索 2[\s\S]*API：失敗：HTTP 429[\s\S]*API取得<\/dt><dd>—件<\/dd>/, "rate-limited query is marked failed without an invented count");
  assert.match(ids.expandedTermStats.innerHTML, /検索 3[\s\S]*API：未実行：HTTP 429が続いたため今回の検索では実行していません。[\s\S]*API取得<\/dt><dd>—件<\/dd>/, "deferred query is distinguished from an attempted failure");
  assert.match(ids.expandedResults.innerHTML, /商品A/, "successful query results remain visible after a later 429");
  ids.expandedKeywords.value = "手動編集した検索語";
  const searchesBeforeClear = calls.length;
  const savedCountsBeforeClear = [persisted.candidates.length, persisted.history.length, persisted.sales.length];
  selected.push({ checked: true, dataset: { index: "0" } });
  await click("expandedClearResults");
  assert.equal((ids.expandedResults.innerHTML.match(/class="expanded-result"/g) || []).length, 0, "clear removes result cards");
  assert.equal(ids.expandedFailures.innerHTML, "", "clear resets failed-term details");
  assert.equal(ids.expandedRetryFailed.hidden, true, "clear hides the failed-term retry control");
  assert.equal(ids.expandedSave.hidden, true, "clear hides bulk registration when no results remain");
  assert.equal(ids.expandedTermStats.innerHTML, "", "clear removes per-search-term statistics");
  assert.equal(ids.expandedKeywords.value, "手動編集した検索語", "clear preserves the search terms");
  assert.equal(ids.expandedMessage.textContent, "検索結果をクリアしました。検索条件と検索語は保持しています。");
  assert.equal(selected.at(-1).checked, false, "clear unchecks selected products");
  assert.equal(calls.length, searchesBeforeClear, "clear does not call the API");
  assert.deepEqual([persisted.candidates.length, persisted.history.length, persisted.sales.length], savedCountsBeforeClear, "clear leaves saved candidates, history and sales untouched");
  console.log("expanded search mocked API, partial failure, batch duplicate and quota cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
