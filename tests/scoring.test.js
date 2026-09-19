const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const context = {
  console,
  URLSearchParams,
  Intl,
  Date,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Set,
  Map,
  RegExp,
  JSON,
  Promise,
  setTimeout,
  clearTimeout,
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { innerHTML: "", textContent: "" }; } },
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch: async () => { throw new Error("fetch is not used in scoring tests"); },
  window: {}
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.__scoring = { calculateSelectionScore, calculateTrendSelectionScore, calculateTrendFitScore, calculateTrendOpportunityScore, calculateRankingScore, getSelectionTotal, trendSelectionGrade, checkProductTrust, data };`, context);

const scoring = context.__scoring;
scoring.data.eventSettings = {};
const keyword = "iPhone 18 Pro ケース";
const base = { matchedTrendKeywords: [keyword], itemPrice: 1980, reviewAverage: 4.5, reviewCount: 1200, itemCaption: "MagSafe対応", itemUrl: "https://example.com/item" };
const trend = (itemName, extra = {}) => scoring.calculateTrendSelectionScore({ ...base, itemName, ...extra }, { matchedTrendKeywords: [keyword], postedIdentities: new Set(), queuedIdentities: new Set() });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const caseA = trend("iPhone18Pro ケース MagSafe対応");
assert(caseA.selectionScore.trendFit >= 27, "A: exact model and product type should score high");
const caseB = trend("iPhone18Pro ガラスフィルム");
assert(caseB.selectionScore.trendFit < caseA.selectionScore.trendFit && caseB.selectionScore.trendFit >= 12, "B: related accessory should be lower but relevant");
const caseC = trend("Android用スマホケース");
assert(caseC.selectionScore.trendFit <= 6, "C: unrelated model should score low");
const caseD = trend("iPhone18Pro ケース", { saleInfo: { coupon: "20%OFFクーポン", discountRate: 20, salePeriod: "本日限定" }, coupon: "20%OFFクーポン", discountRate: 20 });
assert(caseD.selectionScore.opportunity >= 13, "D: strong purchase timing should score high");
const caseE = trend("iPhone18Pro ケース", { reviewAverage: 0, reviewCount: 0, releaseDate: "2026-09-19" });
assert(caseE.selectionScore.reviewEvidence >= 6, "E: new strong-match products should not be heavily penalized");
const caseF = { ...base, itemName: "iPhone18Pro ケース", itemCaption: "超高速 最強", itemUrl: "https://example.com/item" };
const trustF = scoring.checkProductTrust(caseF);
assert(trustF.trustStatus !== "通常投稿候補" || trustF.needsManualReview === false, "F: trust check remains independent");
const regularBefore = scoring.calculateSelectionScore({ sourceRank: 1, itemPrice: 1980, categoryName: "家電", reviewAverage: 4.5, reviewCount: 1200, itemName: "通常商品", itemUrl: "https://example.com/item" }, { postedIdentities: new Set(), queuedIdentities: new Set() });
const regularAfter = scoring.calculateSelectionScore({ sourceRank: 1, itemPrice: 1980, categoryName: "家電", reviewAverage: 4.5, reviewCount: 1200, itemName: "通常商品", itemUrl: "https://example.com/item" }, { postedIdentities: new Set(), queuedIdentities: new Set() });
assert(regularBefore.selectionScore.total === regularAfter.selectionScore.total && scoring.calculateRankingScore({ sourceRank: 1 }) === 30, "G: regular ranking score remains unchanged");
assert(caseD.selectionScore.total >= 70, "H: strong trend product should be at least a strong candidate");
assert(caseB.selectionScore.trendFit !== caseA.selectionScore.trendFit, "I: accessory type mismatch must not equal exact case match");
assert(caseA.selectionScore.total === scoring.getSelectionTotal(caseA) && caseA.selectionScore.total <= 100, "J: trend score is one 100-point total without duplicate priority add-on");

console.log(JSON.stringify({
  caseA: { trendFit: caseA.selectionScore.trendFit, opportunity: caseA.selectionScore.opportunity, total: caseA.selectionScore.total },
  caseB: { trendFit: caseB.selectionScore.trendFit, opportunity: caseB.selectionScore.opportunity, total: caseB.selectionScore.total },
  caseC: { trendFit: caseC.selectionScore.trendFit, opportunity: caseC.selectionScore.opportunity, total: caseC.selectionScore.total },
  caseD: { trendFit: caseD.selectionScore.trendFit, opportunity: caseD.selectionScore.opportunity, total: caseD.selectionScore.total },
  caseE: { trendFit: caseE.selectionScore.trendFit, reviewEvidence: caseE.selectionScore.reviewEvidence, total: caseE.selectionScore.total },
  regularRankingOne: regularBefore.selectionScore.total
}, null, 2));
console.log("scoring cases A-J: passed");
