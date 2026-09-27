const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const context = {
  console, URLSearchParams, Intl, Date, Math, Number, String, Boolean, Object, Array, Set, Map, RegExp, JSON, Promise,
  crypto: { randomUUID: () => "contract-test-uuid" }, setTimeout, clearTimeout,
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { innerHTML: "", textContent: "" }; } },
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch: async () => { throw new Error("fetch is not used in scoring contract tests"); }, window: null
};
context.window = context;
vm.createContext(context);
[
  "src/core/discount-rules.js",
  "src/core/utils.js",
  "src/core/affiliate-sales.js",
  "src/core/product-normalization.js",
  "src/core/ranking-rules.js",
  "src/core/trend-rules.js",
  "src/core/product-identity.js",
  "src/core/duplicate-detection.js",
  "script.js"
].forEach((file) => vm.runInContext(read(file), context, { filename: file }));
vm.runInContext("this.__contract = { calculateSelectionScore, calculateTrendSelectionScore, getSelectionTotal, applySelectionScore, applyStrategyScores, scoreProductSelection, calculateFreshnessScore, selectionGrade, trendSelectionGrade, data };", context);

const api = context.__contract;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
api.data.eventSettings = {};
api.data.history = [];
api.data.candidates = [];

const normalProduct = { itemCode: "contract-normal", itemName: "通常商品", itemUrl: "https://example.com/normal", itemPrice: 1980, categoryName: "家電", reviewAverage: 4.5, reviewCount: 1200, sourceRank: 1 };
const normal = api.calculateSelectionScore(normalProduct, { postedIdentities: new Set(), queuedIdentities: new Set() });
[
  "selectionScore", "selectionScoreTotal", "selectionBreakdown", "selectionReason", "selectionReasons", "selectionVersion", "selectionGrade"
].forEach((key) => assert(has(normal, key), `regular contract: missing ${key}`));
assert(normal.selectionScore.total === normal.selectionScoreTotal, "regular contract: total fields stay aligned");
assert(normal.selectionBreakdown.total === undefined && normal.selectionBreakdown.ranking !== undefined, "regular contract: breakdown remains component-only");
assert(Array.isArray(normal.selectionReason) && Array.isArray(normal.selectionReasons), "regular contract: reasons remain arrays");

const trendProduct = { ...normalProduct, itemCode: "contract-trend", itemName: "iPhone18Pro ケース", matchedTrendKeywords: ["iPhone 18 Pro ケース"], trendSearchPosition: 1 };
const trend = api.calculateTrendSelectionScore(trendProduct, { matchedTrendKeywords: trendProduct.matchedTrendKeywords, postedIdentities: new Set(), queuedIdentities: new Set() });
["selectionScore", "selectionScoreTotal", "selectionBreakdown", "selectionReasons", "selectionVersion", "selectionGrade", "trendScore", "opportunityScore"].forEach((key) => assert(has(trend, key), `trend contract: missing ${key}`));
assert(trend.selectionVersion.endsWith("-trend-v2"), "trend contract: version remains trend-v2");
assert(trend.selectionScore.trendFit !== undefined && trend.selectionScore.opportunity !== undefined, "trend contract: trend components remain present");

assert(api.getSelectionTotal({ selectionScore: { total: 42 } }) === 42, "compatibility: object score has priority");
assert(api.getSelectionTotal({ selectionScoreTotal: 37 }) === 37, "compatibility: selectionScoreTotal fallback remains");
assert(api.getSelectionTotal({ selectionScore: 31 }) === 31, "compatibility: numeric legacy score remains");
assert(api.getSelectionTotal({ selectionScore: { total: 0 }, selectionScoreTotal: 99 }) === 0, "compatibility: object total remains first");
assert(api.getSelectionTotal({}) === 0 && api.getSelectionTotal(undefined) === 0, "compatibility: incomplete records remain safe");
let nullScoreThrows = false;
try { api.getSelectionTotal(null); } catch (error) { nullScoreThrows = error.name === "TypeError"; }
assert(nullScoreThrows, "compatibility: null input preserves the current TypeError behavior");

const preserved = { ...normalProduct, customField: "preserve-me" };
const appliedNormal = api.applySelectionScore(preserved);
["selectionScore", "selectionScoreTotal", "selectionBreakdown", "selectionReasons", "selectionGrade"].forEach((key) => assert(has(appliedNormal, key), `applySelectionScore regular: missing ${key}`));
assert(appliedNormal.customField === "preserve-me" && appliedNormal.itemCode === "contract-normal", "applySelectionScore regular: unrelated fields remain");

const appliedTrend = api.applySelectionScore({ ...trendProduct, customField: "preserve-trend" });
["selectionScore", "selectionScoreTotal", "selectionBreakdown", "selectionReasons", "selectionGrade"].forEach((key) => assert(has(appliedTrend, key), `applySelectionScore trend: missing ${key}`));
assert(appliedTrend.customField === "preserve-trend" && appliedTrend.selectionScore.trendFit !== undefined, "applySelectionScore trend: branch remains distinct");

const strategyNormal = api.applyStrategyScores({ ...normalProduct, selectionScore: normal.selectionScore, selectionScoreTotal: normal.selectionScoreTotal });
["trendScore", "opportunityScore", "todayPriorityScore", "priorityReasons", "salesPoints", "postPerspective", "buyAroundCandidate", "trendFetchedAt"].forEach((key) => assert(has(strategyNormal, key), `strategy regular: missing ${key}`));
assert(strategyNormal.todayPriorityScore <= 140, "strategy regular: 140 point cap remains");
const strategyTrend = api.applyStrategyScores({ ...trendProduct, selectionScore: trend.selectionScore, selectionScoreTotal: trend.selectionScoreTotal });
["trendScore", "opportunityScore", "todayPriorityScore", "priorityReasons", "salesPoints", "postPerspective", "buyAroundCandidate", "trendFetchedAt"].forEach((key) => assert(has(strategyTrend, key), `strategy trend: missing ${key}`));
assert(strategyTrend.trendScore && strategyTrend.opportunityScore, "strategy trend: score objects remain");

const freshProduct = { itemCode: "freshness-contract" };
assert(api.calculateFreshnessScore(freshProduct, { postedIdentities: new Set(), queuedIdentities: new Set() }) > 0, "freshness: new product remains fresh");
assert(api.calculateFreshnessScore(freshProduct, { postedIdentities: new Set(["code:freshness-contract"]), queuedIdentities: new Set() }) === 0, "freshness: history match is zero");
assert(api.calculateFreshnessScore(freshProduct, { postedIdentities: new Set(), queuedIdentities: new Set(["code:freshness-contract"]) }) === 0, "freshness: candidate match is zero");
assert(api.calculateFreshnessScore(freshProduct, { postedIdentities: new Set(["code:freshness-contract"]), queuedIdentities: new Set(["code:freshness-contract"]) }) === 0, "freshness: both matches are zero");
assert(api.calculateFreshnessScore({}, { postedIdentities: new Set(), queuedIdentities: new Set() }) > 0, "freshness: missing identity remains safe");

assert(api.selectionGrade(90) === api.selectionGrade(95), "grade: high boundary remains stable");
assert(api.trendSelectionGrade(80) === api.trendSelectionGrade(85), "trend grade: high boundary remains stable");
console.log("scoring-contract tests passed");
