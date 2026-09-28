const fs = require("fs");
const vm = require("vm");

function createStorage(initial = {}) {
  return {
    values: { ...initial },
    getItem(key) { return this.values[key] || null; },
    setItem(key, value) { this.values[key] = value; }
  };
}

const discoverySource = fs.readFileSync("src/sns-trend-discovery.js", "utf8");
const discoveryContext = { window: {}, document: { addEventListener() {}, querySelector() { return null; } }, Date, Math, JSON, Error };
vm.runInNewContext(discoverySource, discoveryContext);
const discovery = discoveryContext.window.snsTrendDiscovery;

const examples = [
  { keyword: "ps5 pro", news: [] },
  { keyword: "iPhone", news: [] },
  { keyword: "収納", news: [] },
  { keyword: "防災", news: [] },
  { keyword: "人物ニュース", news: [] },
  { keyword: "中河原駅", news: [{ title: "交通事故の速報", source: "ニュース" }] },
  { keyword: "速報", news: [{ title: "死亡が確認された", source: "ニュース" }] },
  { keyword: "国会", news: [{ title: "政治のニュース", source: "ニュース" }] },
  { keyword: "新しい話題", news: [] }
];
const expectedGrades = ["A", "A", "B", "B", "C", "C", "C", "C", "B"];
examples.forEach((item, index) => {
  if (discovery.classifyTrend(item).grade !== expectedGrades[index]) throw new Error(`stage 4 grade ${index + 1} failed`);
});
const sorted = discovery.classifyTrendItems(examples);
if (sorted.map((entry) => entry.classification.grade).join("") !== "AABBBCCCC") throw new Error("stage 4 sort failed");

const previewNode = { innerHTML: "" };
const previewContext = {
  window: {},
  document: { addEventListener() {}, querySelector(selector) { return selector === "#googleTrendsWorkerPreview" ? previewNode : null; } },
  Date, Math, JSON, Error
};
vm.runInNewContext(discoverySource, previewContext);
const previewApi = previewContext.window.snsTrendDiscovery;
previewApi.renderWorkerPreview({ items: examples.map((item) => ({ ...item, traffic: "1000+", publishedAt: "2026-09-29T00:00:00.000Z" })) }, { candidates: [] });
if (!previewNode.innerHTML.includes("ROOM向き A") || !previewNode.innerHTML.includes("ROOM向き B") || !previewNode.innerHTML.includes("対象外 C")) throw new Error("stage 4 preview grade display failed");
if (previewNode.innerHTML.indexOf("ps5 pro") > previewNode.innerHTML.indexOf("収納")) throw new Error("stage 4 A-before-B sort failed");
if (previewNode.innerHTML.includes("data-google-trends-quick-search-index=\"4\"")) throw new Error("stage 4 C quick action must be hidden");

const payload = { source: "google_trends", region: "JP", fetchedAt: "2026-09-29T00:00:00.000Z", items: [{ keyword: "PS5 Pro", traffic: "1000+", publishedAt: "2026-09-28T23:00:00Z", news: [] }] };
const storage = createStorage({ roomAssistantDataV1: "room-before", history: "history-before", sales: "sales-before" });
let v1State = { products: [] };
const searchCalls = [];
const snsApi = {
  readState() { return v1State; },
  writeState(next) { v1State = next; },
  upsertProduct(input, current) { const product = { id: "trend-1", name: input.name, keyword: input.keyword, itemUrl: input.itemUrl || "", notes: input.notes || "" }; return { state: { products: [...current.products, product] }, product }; },
  searchByTrendId(id, context) { searchCalls.push({ id, context }); }
};
let state = previewApi.readState(storage);
const quick = previewApi.acceptAndSearchCandidate(payload.items[0], payload, state, { storage, snsApi, now: "2026-09-29T01:00:00.000Z" });
state = quick.state;
if (!quick.created || quick.candidate.status !== "accepted" || quick.candidate.humanReviewed !== true || !quick.roomTrendId) throw new Error("stage 5 accept failed");
if (v1State.products.length !== 1 || searchCalls.length !== 1 || searchCalls[0].context.grade !== "A" || searchCalls[0].context.keyword !== "PS5 Pro") throw new Error("stage 5 search bridge failed");
if (storage.values.roomAssistantDataV1 !== "room-before" || storage.values.history !== "history-before" || storage.values.sales !== "sales-before") throw new Error("stage 5 unrelated storage changed");
const again = previewApi.acceptAndSearchCandidate(payload.items[0], payload, state, { storage, snsApi, now: "2026-09-29T01:01:00.000Z" });
if (again.created || v1State.products.length !== 1 || searchCalls.length !== 2) throw new Error("stage 5 duplicate accept failed");

const searchElements = {
  "#keyword": { value: "" },
  '[data-tab="search"]': { clickCount: 0, click() { this.clickCount += 1; } },
  "#snsTrendSearchContext": { hidden: true, innerHTML: "" }
};
const snsSource = fs.readFileSync("src/sns-trend.js", "utf8");
const snsContext = {
  window: { localStorage: createStorage({ roomSnsTrendDataV1: JSON.stringify({ products: [{ id: "trend-1", keyword: "PS5 Pro", name: "PS5 Pro" }] }) }) },
  document: { addEventListener() {}, querySelector(selector) { return searchElements[selector] || null; }, querySelectorAll() { return []; } },
  MutationObserver: class { observe() {} }, Date, Math, JSON, Error
};
vm.runInNewContext(snsSource, snsContext);
snsContext.window.snsTrend.searchByTrendId("trend-1", { grade: "A", keyword: "PS5 Pro", reasons: ["商品関連"] });
if (searchElements["#keyword"].value !== "PS5 Pro" || searchElements['[data-tab="search"]'].clickCount !== 1) throw new Error("stage 6 keyword bridge failed");
if (searchElements["#snsTrendSearchContext"].hidden || !searchElements["#snsTrendSearchContext"].innerHTML.includes("ROOM向き：A")) throw new Error("stage 6 context display failed");
console.log("sns trend discovery stages 4-6 cases: passed");
