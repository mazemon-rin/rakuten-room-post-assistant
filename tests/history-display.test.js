const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src/core/history-display.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const renderStart = appSource.indexOf("function renderHistory() {");
const renderEnd = appSource.indexOf("function renderSalesDashboard() {", renderStart);
assert(renderStart >= 0 && renderEnd > renderStart, "renderHistory function is available for integration test");
const historyList = { innerHTML: "", hidden: true };
const historyFilter = { value: "" };
const escapeTestHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const context = {
  URL, Object, String, Date, Map, Intl,
  window: null,
  data: { history: [], sales: [] },
  document: {},
  $(selector) { return selector === "#historyFilter" ? historyFilter : selector === "#historyList" ? historyList : null; },
  formatDate(value) { return String(value || ""); },
  escapeHtml: escapeTestHtml,
  escapeAttr: escapeTestHtml,
  shorten(value) { return String(value || ""); },
  getCollectionById() { return null; },
  renderSalesSummary() { return ""; },
  getSalesForHistory() { return []; },
  renderSaleHistory() { return ""; },
  hasRoomCandidateForHistory() { return false; },
  renderSalesDashboard() {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);
vm.runInContext(appSource.slice(renderStart, renderEnd), context);
const display = context.HistoryDisplay;

const history = {
  itemCode: "newbalance-store:10003302",
  shopName: "ニューバランス公式 楽天市場店",
  itemUrl: "https://item.rakuten.co.jp/newbalance-store/mt6145w6-aaz/",
  genreId: 201872,
  product: { itemCode: "nested-code", shopName: "nested shop" }
};
assert.strictEqual(display.getStoredValue(history, "itemCode"), "newbalance-store:10003302");
assert.strictEqual(display.getStoredValue(history, "genreId"), "201872");
assert.notStrictEqual(display.getStoredValue(history, "genreId"), display.getStoredValue(history, "itemCode"));
assert.strictEqual(display.getStoredValue({ product: { itemCode: "nested-code" } }, "itemCode"), "nested-code");
assert.strictEqual(display.getStoredValue({ itemCode: " ", product: { itemCode: "nested-code" } }, "itemCode"), "nested-code");
assert.strictEqual(display.getStoredValue({}, "shopName"), "未記録");
assert.strictEqual(display.getStoredValue({ genreId: " " }, "genreId"), "未記録");
assert.strictEqual(display.getProductUrl(history), history.itemUrl);
assert.strictEqual(display.getProductUrl({}), "");
assert.strictEqual(display.isSafeProductUrl(history.itemUrl), true);
assert.strictEqual(display.isSafeProductUrl("javascript:alert(1)"), false);
assert.strictEqual(display.isSafeProductUrl("http://item.rakuten.co.jp/shop/item/"), false);
assert.strictEqual(display.isSafeProductUrl("https://user:pass@example.com/item"), false);

context.data.history = [{
  id: "target-history",
  itemCode: "newbalance-store:10003302",
  title: "ニューバランス グラフィックTシャツ",
  shopName: "ニューバランス公式 楽天市場店",
  itemUrl: "https://item.rakuten.co.jp/newbalance-store/mt6145w6-aaz/",
  genreId: 201872,
  postedAt: "2026-10-03T00:00:00+09:00"
}];
context.renderHistory();
assert(historyList.innerHTML.includes("itemCode：<code>newbalance-store:10003302</code>"));
assert(historyList.innerHTML.includes("ジャンルID：<code>201872</code>"));
assert(historyList.innerHTML.includes('target="_blank" rel="noopener noreferrer"'));
assert(historyList.innerHTML.includes("ショップ名：ニューバランス公式 楽天市場店"));
assert(historyList.innerHTML.includes("投稿済み"));
assert(!historyList.innerHTML.includes("2026-10-03T00:00:00+09:00 / 201872"), "genre ID is no longer shown unlabeled beside the date");

context.data.history = [{ id: "legacy-history", title: "旧履歴", postedAt: "2026-10-03", itemUrl: "javascript:alert(1)" }];
context.renderHistory();
assert(historyList.innerHTML.includes("itemCode：<code>未記録</code>"));
assert(historyList.innerHTML.includes("ショップ名：未記録"));
assert(historyList.innerHTML.includes("ジャンルID：<code>未記録</code>"));
assert(historyList.innerHTML.includes("javascript:alert(1)（安全確認できないためリンクなし）"));
assert(!historyList.innerHTML.includes('href="javascript:alert(1)"'));

console.log("history display cases: passed");
