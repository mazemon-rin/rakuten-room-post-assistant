const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("src/sns-trend-discovery.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
if (!["STEP 1：候補を取得", "STEP 2：AI分析用プロンプト", "STEP 3：約10テーマを追加調査", "STEP 3-1：AI結果を読み込む", "STEP 3-2：追加調査を実行", "STEP 4：Phase 2結果をJSON保存", "STEP 5：最終5選をAIで決める", "STEP 5：最終5選判断用プロンプトをコピー"].every((label) => html.includes(label))) throw new Error("ROOM trend five STEP UI labels missing");
if (!html.includes("このプロンプトをChatGPT／Codexへ渡してください") || !html.includes("楽天商品が見つかっただけでは自動採用しません")) throw new Error("ROOM trend five guidance missing");
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
api.writeRoomTrendPhaseTwo(saved, storage);
if (api.verifyRoomTrendPhaseTwoSave(saved, storage).results.length !== 1) throw new Error("Phase 2 save verification failed");
const backup = api.exportRoomTrendPhaseTwoJson(saved, new Date("2026-09-30T12:00:00Z"));
const parsedBackup = JSON.parse(backup.text);
if (!backup.filename.startsWith("rakuten-room-phase2-20260930-")) throw new Error("Phase 2 export filename failed");
if (parsedBackup.results[0].rakutenEvidence.representativeProducts[0].itemCode !== "shop:1" || parsedBackup.prompt !== saved.prompt) throw new Error("Phase 2 export data failed");
if (backup.text.includes("applicationId") || backup.text.includes("accessKey") || backup.text.includes("affiliateId")) throw new Error("Phase 2 export leaked secrets");
if (api.validateRoomTrendPhaseTwoBackup(parsedBackup).results.length !== 1) throw new Error("Phase 2 import validation failed");
for (const invalid of [{ ...parsedBackup, schemaVersion: 2 }, { ...parsedBackup, results: "bad" }, { ...parsedBackup, prompt: null }]) {
  try { api.validateRoomTrendPhaseTwoBackup(invalid); throw new Error("invalid Phase 2 backup accepted"); } catch (error) { if (error.message === "invalid Phase 2 backup accepted") throw error; }
}
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
  const phaseTwoJson = JSON.stringify([{ theme: "おせち早割・年末準備", reason: "年末需要", purchaseWindow: "現在〜12月上旬", categories: ["おせち", "冷凍おせち"], rakutenQueries: ["おせち 2026 早割", "冷凍おせち"], purchaseIntent: "high", confidence: "high", sourceKeywords: ["おせち 2026 早割"] }]);
  for (const wrapped of [phaseTwoJson, `\n  ${phaseTwoJson}\n`, `\`\`\`json\n${phaseTwoJson}\n\`\`\``, `\`\`\`\n${phaseTwoJson}\n\`\`\``]) {
    if (api.parseRoomTrendPhaseTwoJson(wrapped).length !== 1) throw new Error("Phase 2 JSON fence/whitespace parsing failed");
  }
  try { api.parseRoomTrendPhaseTwoJson("[broken"); throw new Error("invalid JSON accepted"); } catch (error) { if (!error.message.includes("JSONの形式が正しくありません") || error.message === "invalid JSON accepted") throw error; }
  try { api.parseRoomTrendPhaseTwoJson(JSON.stringify({ themes: [] })); throw new Error("top-level object accepted"); } catch (error) { if (!error.message.includes("1〜20件のJSON配列") || error.message === "top-level object accepted") throw error; }
  try { api.parseRoomTrendPhaseTwoJson(JSON.stringify([{ theme: "秋冬の照明・省エネ", reason: "季節", categories: ["照明"], rakutenQueries: ["LED照明"], purchaseIntent: "high", confidence: "high", sourceKeywords: ["照明"] }])); throw new Error("missing field accepted"); } catch (error) { if (!error.message.includes("テーマ1『秋冬の照明・省エネ』：purchaseWindowがありません") || error.message === "missing field accepted") throw error; }
  for (const field of ["categories", "rakutenQueries", "sourceKeywords"]) {
    const invalid = { theme: "秋冬の照明・省エネ", reason: "季節", purchaseWindow: "今後30日", categories: ["照明"], rakutenQueries: ["LED照明"], purchaseIntent: "high", confidence: "high", sourceKeywords: ["照明"] };
    invalid[field] = "文字列";
    try { api.parseRoomTrendPhaseTwoJson(JSON.stringify([invalid])); throw new Error(`${field} accepted`); } catch (error) { if (!error.message.includes(`：${field}は配列で指定してください`) || error.message === `${field} accepted`) throw error; }
  }
  const tooManyQueries = JSON.parse(phaseTwoJson); tooManyQueries[0].rakutenQueries = ["1", "2", "3", "4", "5", "6"];
  try { api.parseRoomTrendPhaseTwoJson(JSON.stringify(tooManyQueries)); throw new Error("too many queries accepted"); } catch (error) { if (!error.message.includes("rakutenQueriesは1〜5件") || error.message === "too many queries accepted") throw error; }
  const tenThemes = JSON.stringify(Array.from({ length: 10 }, (_, index) => ({ ...JSON.parse(phaseTwoJson)[0], theme: `テーマ${index + 1}` })));
  if (api.parseRoomTrendPhaseTwoJson(tenThemes).length !== 10) throw new Error("10-theme JSON validation failed");
  const smartQuotedInput = tenThemes.replace(/"([^"\\]*)"(?=\s*:|\s*,|\s*\]|\s*\})/g, "“$1”");
  const smartParsed = api.parseRoomTrendPhaseTwoJson(smartQuotedInput);
  if (smartParsed.length !== 10 || smartParsed[0].reason !== "年末需要" || smartParsed[0].theme !== "テーマ1") throw new Error("smart quote 10-theme JSON validation failed");
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
