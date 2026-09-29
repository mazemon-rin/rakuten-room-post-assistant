const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("src/sns-trend-discovery.js", "utf8");
const context = { window: {}, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } }, Date, Math, JSON, Error, Set, Map };
vm.runInNewContext(source, context);
const api = context.window.snsTrendDiscovery;
const payload = {
  source: "yahoo_shopping_keyword", rankingType: "up", count: 20,
  items: Array.from({ length: 20 }, (_, index) => ({ rank: index + 1, keyword: `Yahoo候補${index + 1}`, preRank: index === 0 ? 9999 : index + 1, vector: index === 0 ? null : "up", score: index + 1, url: null }))
};
if (!api.validateYahooRankingPayload(payload).valid) throw new Error("Yahoo payload validation failed");
let calls = 0;
api.fetchYahooRanking(async (url, options) => { calls += 1; if (options.method !== "GET" || !url.includes("yahoo-shopping-ranking?type=up")) throw new Error("Yahoo request mismatch"); return { ok: true, status: 200, async json() { return payload; } }; }).then((fetched) => {
  if (calls !== 1 || fetched.items.length !== 20) throw new Error("Yahoo fetch failed");
  const before = { candidates: [] };
  const added = api.addYahooCandidate(fetched.items[0], fetched, before, "2026-09-29T00:00:00.000Z");
  if (added.state.candidates.length !== 1 || added.candidate.source !== "yahoo_shopping_keyword" || added.candidate.metrics.rank !== 1) throw new Error("Yahoo candidate mapping failed");
  let duplicateBlocked = false;
  try { api.addYahooCandidate(fetched.items[0], fetched, added.state); } catch (error) { duplicateBlocked = true; }
  if (!duplicateBlocked) throw new Error("Yahoo duplicate prevention failed");
  console.log("Yahoo discovery cases: passed");
}).catch((error) => { console.error(error); process.exitCode = 1; });
