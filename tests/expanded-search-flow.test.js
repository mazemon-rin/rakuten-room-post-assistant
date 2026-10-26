const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element() {
  return { value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, replaceChildren() { this.innerHTML = ""; } };
}
const ids = Object.fromEntries(["expandedSearch", "expandedMode", "expandedOriginType", "expandedOrigin", "expandedRelation", "expandedProblem", "expandedTarget", "expandedSeason", "expandedSuggest", "expandedPrompt", "expandedKeywords", "expandedJson", "expandedImport", "expandedRun", "expandedMessage", "expandedResults", "expandedSave", "expandedSaveMessage"].map((id) => [id, element()]));
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
let sequence = 0;
const catalog = {
  "検索 1": [{ itemCode: "a:1", itemName: "商品A", itemCaption: "収納に便利", shopName: "店A", mediumImageUrls: [{ imageUrl: "https://example.test/a.jpg" }] }, { itemCode: "old:1", itemName: "投稿済み商品" }],
  "検索 2": [{ itemCode: "a:1", itemName: "商品A" }, { itemCode: "b:2", itemName: "商品B" }],
  "検索 3": [{ itemCode: "c:3", itemName: "商品C" }],
  "検索 4": [{ itemCode: "d:4", itemName: "商品D" }],
  "検索 5": [{ itemCode: "e:5", itemName: "商品E" }]
};
const context = {
  console, document, data: current, searchResults: [], crypto: { randomUUID: () => `candidate-${++sequence}` }, navigator: { clipboard: { writeText: async () => {} } },
  hasRakutenCredentials: () => true,
  requestRakutenItemSearch: async (term) => { calls.push(term); if (term === "検索 4") throw new Error("HTTP 500"); return { status: "ok", products: catalog[term] || [] }; },
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
  ids.expandedJson.value = JSON.stringify({ schemaVersion: 1, requestId: "wrong", searchMode: "problem", keywords: ["誤った 語句"] });
  await click("expandedImport");
  assert.equal(ids.expandedKeywords.value, "", "invalid Codex JSON never changes search terms");
  ids.expandedJson.value = JSON.stringify({ schemaVersion: 1, requestId: "candidate-1", searchMode: "problem", keywords: ["収納 ラック"] });
  await click("expandedImport");
  assert.equal(ids.expandedKeywords.value, "収納 ラック", "matching Codex JSON is imported for review");
  ids.expandedKeywords.value = [1, 2, 3, 4, 5].map((n) => `検索 ${n}`).join("\n");
  await click("expandedRun");
  assert.equal(calls.length, 5, "five searches are attempted");
  assert.match(ids.expandedMessage.textContent, /1件の検索語は失敗/);
  assert.equal((ids.expandedResults.innerHTML.match(/class="expanded-result"/g) || []).length, 5, "five groups merge, duplicate product deduplicated");
  assert.match(ids.expandedResults.innerHTML, /投稿済み商品[\s\S]*登録済み/);
  assert.match(ids.expandedResults.innerHTML, /class="expanded-result-image" src="https:\/\/example\.test\/a\.jpg"/, "product image is visible in search result");
  assert.equal(ids.expandedSave.hidden, false);

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
  assert.match(ids.expandedOrigin.innerHTML, /old:1/, "posted history can be a related-search origin");
  ids.expandedOriginType.value = "sales";
  ids.expandedOriginType.listeners.change();
  assert.match(ids.expandedOrigin.innerHTML, /照合できる商品がありません/, "unlinked sales are not treated as identified products");
  current.sales = [{ historyId: "history-1", itemCode: "old:1" }];
  ids.expandedOriginType.listeners.change();
  assert.match(ids.expandedOrigin.innerHTML, /old:1/, "linked sales can be a related-search origin");
  console.log("expanded search mocked API, partial failure, batch duplicate and quota cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
