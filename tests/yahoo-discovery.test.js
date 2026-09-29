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
api.fetchYahooRanking(async (url, options) => { calls += 1; if (options.method !== "GET" || !url.includes("yahoo-shopping-ranking?type=up")) throw new Error("Yahoo request mismatch"); return { ok: true, status: 200, async json() { return payload; } }; }).then(async (fetched) => {
  if (calls !== 1 || fetched.items.length !== 20) throw new Error("Yahoo fetch failed");
  const before = { candidates: [] };
  const added = api.addYahooCandidate(fetched.items[0], fetched, before, "2026-09-29T00:00:00.000Z");
  if (added.state.candidates.length !== 1 || added.candidate.source !== "yahoo_shopping_keyword" || added.candidate.metrics.rank !== 1) throw new Error("Yahoo candidate mapping failed");
  let duplicateBlocked = false;
  try { api.addYahooCandidate(fetched.items[0], fetched, added.state); } catch (error) { duplicateBlocked = true; }
  if (!duplicateBlocked) throw new Error("Yahoo duplicate prevention failed");
  let youtubeReasonCalls = 0;
  let webReasonCalls = 0;
  const reason = await api.investigateYahooReason("Yahoo候補1", async (url, options) => {
    if (url.includes("youtube-search")) { youtubeReasonCalls += 1; return { ok: true, status: 200, async json() { return { source: "youtube", keyword: "Yahoo候補1", count: 1, items: [{ videoId: "v1", title: "Yahoo候補1 新商品レビュー", url: null, channelTitle: "確認チャンネル", publishedAt: "2026-09-29T00:00:00Z", viewCount: 12, likeCount: 1, commentCount: 0, duration: "PT1M" }] }; } }; }
    if (url.includes("web-search?q=")) { webReasonCalls += 1; return { ok: true, status: 200, async json() { return { source: "tavily", query: "Yahoo候補1", count: 1, results: [{ title: "Yahoo候補1 新商品 発売情報", url: "https://example.com/news", content: "新商品として発売されました。", score: 0.9 }] }; } }; }
    throw new Error("reason query mismatch");
  });
  if (youtubeReasonCalls !== 1 || webReasonCalls !== 1 || reason.videos.length !== 1 || reason.webResults.length !== 1) throw new Error("Yahoo reason evidence failed");
  if (api.classifyYahooReason("Yahoo候補1", reason.webResults, reason.videos).includes("断定")) throw new Error("Yahoo reason must not be definitive");
  if (!api.renderYahooReasonOutput) throw new Error("Yahoo reason renderer is missing");
  console.log("Yahoo discovery cases: passed");
}).catch((error) => { console.error(error); process.exitCode = 1; });
