const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("src/sns-trend-discovery.js", "utf8");
if (!source.includes("function initRoomTrendPhaseTwo()")) throw new Error("Phase 2 initializer missing");
if (!source.includes("initRoomTrendPhaseTwo();")) throw new Error("Phase 2 initializer is not called from init");
if (!source.includes('panel.dataset.initialized === "true"')) throw new Error("Phase 2 initializer is not idempotent");
const context = { window: { RoomRakutenApi: { hasCredentials: () => true, requestItemSearch: async (query) => ({ status: "ok", query, products: [{ itemCode: "shop:1", itemName: "秋服", itemPrice: 2980, reviewAverage: 4.5, reviewCount: 12 }] }) } }, document: { addEventListener() {}, querySelector() { return null; } }, Date, Math, JSON, Error, URLSearchParams };
vm.runInNewContext(source, context);
const api = context.window.snsTrendDiscovery;
const storage = { data: {}, getItem(key) { return this.data[key] || null; }, setItem(key, value) { this.data[key] = value; }, removeItem(key) { delete this.data[key]; } };
const saved = api.writeRoomTrendPhaseTwo({ savedAt: "2026-09-30T00:00:00.000Z", inputThemes: [{ theme: "秋雨・台風対策" }], results: [{ theme: "秋雨・台風対策", webEvidence: { results: [{ title: "web" }] }, youtubeMetrics: { videoCount: 1 }, rakutenEvidence: { productCount: 10, representativeProducts: [{ itemCode: "shop:1", reviewAverage: 4.5, reviewCount: 12 }], themeMatch: "要確認" } }], prompt: "最終5選用プロンプト" }, storage);
if (saved.results.length !== 1 || saved.prompt !== "最終5選用プロンプト") throw new Error("Phase 2 persistence failed");
const restored = api.readRoomTrendPhaseTwo(storage);
if (restored.savedAt !== saved.savedAt || restored.results[0].rakutenEvidence.representativeProducts[0].itemCode !== "shop:1") throw new Error("Phase 2 restore failed");
storage.data[api.ROOM_TREND_PHASE_TWO_STORAGE_KEY] = "{broken";
if (api.readRoomTrendPhaseTwo(storage) !== null) throw new Error("Broken Phase 2 JSON handling failed");
api.writeRoomTrendPhaseTwo(saved, storage); api.clearRoomTrendPhaseTwo(storage);
if (storage.getItem(api.ROOM_TREND_PHASE_TWO_STORAGE_KEY) !== null) throw new Error("Phase 2 clear failed");
console.log("ROOM trend Phase 2 persistence cases: passed");

const google = { items: [
  { keyword: "秋服", traffic: "10K+", publishedAt: "2026-09-30T00:00:00Z", news: [] },
  { keyword: "事件", traffic: "20K+", publishedAt: "2026-09-30T00:00:00Z", news: [{ title: "事件情報", source: "ニュース" }] },
  { keyword: "ハロウィン", traffic: "5K+", publishedAt: "2026-09-30T00:00:00Z", news: [] }
] };
const yahoo = { items: [
  { keyword: "秋服", rank: 1, preRank: 4, vector: "↑" },
  { keyword: "ライトアウター", rank: 2, preRank: 8, vector: "↑" },
  { keyword: "キャラクター限定グッズ", rank: 3, preRank: 10, vector: "↑" }
] };
const merged = api.mergeRoomTrendFiveCandidates(google, yahoo, 30);
if (merged.candidates.length !== 4) throw new Error(`unexpected candidate count: ${merged.candidates.length}`);
if (merged.duplicateCount !== 1) throw new Error(`duplicate count failed: ${merged.duplicateCount}`);
if (merged.excludedCount !== 1) throw new Error(`excluded count failed: ${merged.excludedCount}`);
if (!merged.candidates.find((item) => item.keyword === "秋服").sources.includes("google_trends")) throw new Error("google source missing");
if (!merged.candidates.find((item) => item.keyword === "秋服").sources.includes("yahoo_shopping_keyword")) throw new Error("yahoo source missing");
const capped = api.mergeRoomTrendFiveCandidates({ items: Array.from({ length: 35 }, (_, i) => ({ keyword: `商品テーマ${i}` })) }, { items: [] }, 30);
if (capped.candidates.length !== 30) throw new Error("candidate cap failed");
const prompt = api.buildRoomTrendFivePrompt(merged.candidates, new Date("2026-09-30T12:00:00Z"));
for (const required of ["現在日付：2026-09-30", "theme", "reason", "purchaseWindow", "categories", "rakutenQueries", "purchaseIntent", "confidence", "sourceKeywords", "JSON配列", "今後7〜30日"]) {
  if (!prompt.includes(required)) throw new Error(`prompt requirement missing: ${required}`);
}
if (!prompt.includes("秋服") || !prompt.includes("ライトアウター")) throw new Error("prompt candidate data missing");
console.log("ROOM trend five Phase 1 cases: passed");

(async () => {
  const phaseTwo = api.parseRoomTrendPhaseTwoJson(JSON.stringify([{ theme: "秋服", reason: "衣替え", purchaseWindow: "今後30日", categories: ["ライトアウター"], rakutenQueries: ["秋服 ライトアウター", "ウインドブレーカー"], purchaseIntent: "高", confidence: 0.8, sourceKeywords: ["秋服"] }]));
  if (phaseTwo.length !== 1 || phaseTwo[0].rakutenQueries.length !== 2) throw new Error("Phase 2 JSON validation failed");
  if (!api.buildRoomTrendPhaseTwoPrompt([{ ...phaseTwo[0], webEvidence: { results: [] }, youtubeMetrics: { videoCount: 0 }, rakutenEvidence: { productCount: 0 } }], new Date("2026-09-30T12:00:00Z")).includes("最終的に楽天ROOM向けの5テーマ")) throw new Error("Phase 2 prompt generation failed");
  const rakutenEvidence = await api.fetchRakutenThemeEvidence(phaseTwo[0], async () => { throw new Error("must use shared API helper"); }, {});
  if (rakutenEvidence.queryResults.length !== 2 || rakutenEvidence.uniqueItemCount !== 1 || rakutenEvidence.priceRange.min !== 2980) throw new Error("Phase 2 Rakuten evidence failed");
  context.window.RoomRakutenApi.hasCredentials = () => false;
  const notConfigured = await api.fetchRakutenThemeEvidence(phaseTwo[0], async () => { throw new Error("must not call API"); }, {});
  if (notConfigured.status !== "not_configured" || notConfigured.productCount !== null || !notConfigured.message.includes("未調査")) throw new Error("Phase 2 not-configured handling failed");
  context.window.RoomRakutenApi.hasCredentials = () => true;
  context.window.RoomRakutenApi.requestItemSearch = async (query) => {
    if (query === "ウインドブレーカー レディース") throw Object.assign(new Error("HTTP 400：invalid_application_id"), { status: 400 });
    return { status: "ok", query, products: query === "空の検索語" ? [] : [{ itemCode: "shop:1", itemName: "秋服", itemPrice: 2980, reviewAverage: 4.5, reviewCount: 12 }] };
  };
  const mixedTheme = { ...phaseTwo[0], rakutenQueries: ["秋服 ライトアウター", "ウインドブレーカー レディース", "空の検索語"] };
  const mixedEvidence = await api.fetchRakutenThemeEvidence(mixedTheme, async () => { throw new Error("must use shared API helper"); }, {});
  if (mixedEvidence.queryResults[1].status !== "error" || !mixedEvidence.queryResults[1].error.includes("HTTP 400") || mixedEvidence.queryResults[2].count !== 0 || mixedEvidence.uniqueItemCount !== 1) throw new Error("Phase 2 API error/zero/duplicate handling failed");
  console.log("ROOM trend Phase 2 cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
