const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element() {
  return { value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, replaceChildren() { this.innerHTML = ""; } };
}
const ids = Object.fromEntries(["expandedSearch", "expandedMode", "expandedOriginType", "expandedOrigin", "expandedRelation", "expandedProblem", "expandedTarget", "expandedSeason", "expandedSuggest", "expandedPrompt", "expandedKeywords", "expandedJson", "expandedImport", "expandedRun", "expandedRetryFailed", "expandedFailures", "expandedMessage", "expandedResults", "expandedSave", "expandedSaveMessage"].map((id) => [id, element()]));
ids.expandedMode.value = "problem";
ids.expandedOriginType.value = "history";
ids.expandedRelation.value = "same";
ids.expandedSeason.value = "spring";
const selected = [];
const document = { listeners: {}, getElementById(id) { return ids[id] || null; }, querySelectorAll(selector) { return selector === ".expanded-select:checked" ? selected : []; }, addEventListener(name, callback) { this.listeners[name] = callback; } };
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
  "検索 1": [{ itemCode: "a:1", itemName: "商品A", itemCaption: "収納に便利", shopName: "店A", mediumImageUrls: [{ imageUrl: "https://example.test/a.jpg" }] }, { itemCode: "old:1", itemName: "投稿済み商品" }],
  "検索 2": [{ itemCode: "a:1", itemName: "商品A" }, { itemCode: "b:2", itemName: "商品B" }],
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
  isUnavailableProduct: () => false,
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

(async () => {
  await click("expandedPrompt");
  const initialRequestId = copiedPrompt.match(/requestId=([^、]+)/)[1];
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
  assert.equal(ids.expandedSave.hidden, false);

  await click("expandedRetryFailed");
  assert.deepEqual(calls, ["検索 1", "検索 2", "検索 3", "検索 4", "検索 5", "検索 4"], "retry runs only the failed search term");
  assert.deepEqual(waits, [1000, 1000, 1000, 1000, 1000], "retry also respects the interval from the previous request");
  assert.equal((ids.expandedResults.innerHTML.match(/class="expanded-result"/g) || []).length, 6, "successful earlier results remain and retried results are merged");
  assert.equal(ids.expandedRetryFailed.hidden, true, "retry control hides after recovery");

  selected.push({ dataset: { index: "0" }, closest: () => ({ querySelector: () => ({ value: "収納" }) }) });
  selected.push({ dataset: { index: "1" }, closest: () => ({ querySelector: () => ({ value: "" }) }) });
  await click("expandedSave");
  assert.equal(persisted.candidates.length, 1, "posted product is excluded");
  assert.equal(persisted.candidates[0].itemCode, "a:1");
  assert.equal(persisted.candidates[0].searchContext.selectionReason, "収納");
  assert.match(ids.expandedSaveMessage.textContent, /登録成功1件、重複除外1件/);
  assert.equal(persisted.history.length, 1, "history remains unchanged");

  selected.length = 0;
  selected.push({ dataset: { index: "3" }, closest: () => ({ querySelector: () => ({ value: "" }) }) });
  quota = true;
  await click("expandedSave");
  assert.match(ids.expandedMessage.textContent, /保存に失敗/);
  assert.equal(persisted.candidates.length, 1, "quota failure keeps persisted snapshot");

  const old = { id: "legacy", itemCode: "legacy:1", product: { itemName: "旧候補" } };
  persisted.candidates.push(old);
  assert.equal(persisted.candidates[1].searchContext, undefined, "old candidate needs no search context");
  assert.equal(persisted.candidates[1].product.itemName, "旧候補");

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
  selected.length = 0;
  selected.push({ dataset: { index: "3" }, closest: () => ({ querySelector: () => ({ value: "" }) }) });
  await click("expandedSave");
  assert.equal(current.candidates.length, candidatesBeforeAmbiguousSave, "save handler rejects an ambiguous product even if a checked input is supplied");
  assert.match(ids.expandedSaveMessage.textContent, /失敗1件/);
  selected.length = 0;

  ids.expandedMode.value = "problem";
  ids.expandedMode.listeners.change();
  await click("expandedPrompt");
  const singleRequestId = copiedPrompt.match(/requestId=([^、]+)/)[1];
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
  assert.match(ids.expandedResults.innerHTML, /商品A/, "successful query results remain visible after a later 429");
  console.log("expanded search mocked API, partial failure, batch duplicate and quota cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
