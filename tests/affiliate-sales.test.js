const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const context = {
  console, URLSearchParams, Intl, Date, Math, Number, String, Boolean, Object, Array, Set, Map, RegExp, JSON, Promise,
  structuredClone: (value) => JSON.parse(JSON.stringify(value)),
  setTimeout, clearTimeout,
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { innerHTML: "", textContent: "" }; } },
  localStorage: { getItem() { return null; }, setItem() {} }, window: {}
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.__sales = { parseAffiliateCsv, getAffiliateImportKey, classifyAffiliateSale, buildAffiliateImportPreview };`, context);
const sales = context.__sales;
const csv = fs.readFileSync(path.join(__dirname, "fixtures", "affiliate-sales.csv"), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const rows = sales.parseAffiliateCsv(csv);
assert(rows.length === 1, "fixture should contain one result row");
assert(rows[0].occurredAt === "2026-09-19 20:58:57", "occurredAt should be read by header");
assert(rows[0].amount === 3492 && rows[0].reward === 349, "amount and reward should be numeric");
assert(rows[0].affiliateStatus === "未確定", "status code should be normalized");
assert(rows[0].measurementId === "楽天ROOM", "measurementId should be preserved");

const history = [{ id: "history-torras", itemCode: "torras-code", title: rows[0].productName, shopName: "TORRASLife", postedAt: "2026-09-17T10:00:00+09:00" }];
const preview = sales.buildAffiliateImportPreview(rows, history);
assert(preview[0].classification === "introduced", "TORRAS should match as introduced");
assert(preview[0].source === "rakuten_room", "楽天ROOM measurement should be classified as source");
assert(preview[0].matchedHistoryId === "history-torras", "historyId should be exact");
assert(sales.getAffiliateImportKey(rows[0]) === sales.getAffiliateImportKey(rows[0]), "same source row should deduplicate");

const other = sales.classifyAffiliateSale({ ...rows[0], productName: "別の商品", shopName: "別ショップ" }, history);
assert(other.classification === "other", "unmatched product should be other");
const review = sales.classifyAffiliateSale({ ...rows[0], productName: "TORRAS iPhone18Pro ケース", shopName: "別ショップ" }, history);
assert(review.classification === "review", "similar product with shop mismatch should require review");

console.log("affiliate CSV parsing, classification, duplicate-key, and review cases: passed");
