const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("src/sns-trend-discovery.js", "utf8");
const context = { window: {}, document: { addEventListener() {}, querySelector() { return null; } }, Date, Math, JSON, Error };
vm.runInNewContext(source, context);
const api = context.window.snsTrendDiscovery;
const storage = { values: {}, getItem(key) { return this.values[key] || null; }, setItem(key, value) { this.values[key] = value; } };
let state = api.readState(storage);
let result = api.upsertCandidate({ id: "discovery-1", source: "google_trends", keyword: "収納ボックス", title: "収納ボックス", metrics: { trend: "rising" } }, state);
state = result.state;
api.writeState(state, storage);
state = api.readState(storage);
if (state.candidates.length !== 1 || state.candidates[0].source !== "google_trends") throw new Error("discovery create/reload failed");
state = api.upsertCandidate({ ...state.candidates[0], title: "収納ボックス特集" }, state).state;
if (state.candidates[0].title !== "収納ボックス特集") throw new Error("discovery edit failed");
const snsStorage = { values: {}, getItem(key) { return this.values[key] || null; }, setItem(key, value) { this.values[key] = value; } };
const snsApi = {
  readState(s) { const parsed = JSON.parse(s.getItem("roomSnsTrendDataV1") || "null"); return parsed || { products: [] }; },
  writeState(v, s) { s.setItem("roomSnsTrendDataV1", JSON.stringify(v)); },
  upsertProduct(input, v1) { const product = { id: "v1-1", name: input.name, keyword: input.keyword, itemUrl: input.itemUrl || "", notes: input.notes || "" }; return { state: { products: [...v1.products, product] }, product }; }
};
let accepted = api.acceptCandidate("discovery-1", state, snsApi, snsStorage);
if (!accepted.created || !accepted.roomTrendId || accepted.state.candidates[0].status !== "accepted") throw new Error("accept failed");
if (JSON.parse(snsStorage.values.roomSnsTrendDataV1).products.length !== 1) throw new Error("v1 was not updated once");
const again = api.acceptCandidate("discovery-1", accepted.state, snsApi, snsStorage);
if (again.created || JSON.parse(snsStorage.values.roomSnsTrendDataV1).products.length !== 1) throw new Error("duplicate accept failed");
let rejected = api.upsertCandidate({ id: "discovery-2", source: "manual", keyword: "別候補", title: "別候補" }, accepted.state).state;
rejected = api.rejectCandidate("discovery-2", rejected);
if (rejected.candidates.find((item) => item.id === "discovery-2").status !== "rejected") throw new Error("reject failed");
if (snsApi.readState(snsStorage).products.length !== 1) throw new Error("reject changed v1");
const removed = api.removeCandidate("discovery-2", rejected);
if (removed.candidates.some((item) => item.id === "discovery-2")) throw new Error("delete failed");
if (api.STORAGE_KEY !== "roomSnsTrendDiscoveryV2") throw new Error("storage isolation failed");
console.log("sns trend discovery v2 stage 1 cases: passed");

const stage2Storage = { values: {}, getItem(key) { return this.values[key] || null; }, setItem(key, value) { this.values[key] = value; } };
let stage2State = api.readState(stage2Storage);
let google = api.upsertCandidate({
  id: "stage2-google-1",
  source: "google_trends",
  keyword: "V2_GOOGLE_TRENDS_TEST_20260928",
  title: "V2_GOOGLE_TRENDS_TEST_20260928",
  sourceUrl: "",
  observedAt: "2026-09-28T22:51",
  relatedKeywords: "収納, 整理, 収納,",
  searchVolumeLabel: "テスト値"
}, stage2State);
stage2State = google.state;
if (google.candidate.source !== "google_trends") throw new Error("google trends source failed");
if (google.candidate.keyword !== "V2_GOOGLE_TRENDS_TEST_20260928") throw new Error("google trends keyword failed");
if (JSON.stringify(google.candidate.metrics.relatedKeywords) !== JSON.stringify(["収納", "整理"])) throw new Error("related keyword normalization failed");
if (google.candidate.metrics.searchVolumeLabel !== "テスト値") throw new Error("search volume label failed");
if (google.candidate.sourceUrl !== "") throw new Error("empty source url failed");
api.writeState(stage2State, stage2Storage);
stage2State = api.readState(stage2Storage);
const reloadedGoogle = stage2State.candidates.find((item) => item.id === "stage2-google-1");
if (!reloadedGoogle || reloadedGoogle.metrics.relatedKeywords.length !== 2 || reloadedGoogle.metrics.searchVolumeLabel !== "テスト値") throw new Error("google trends reload failed");

let duplicateBlocked = false;
try {
  api.upsertCandidate({ source: "google_trends", keyword: " V2_GOOGLE_TRENDS_TEST_20260928 ", title: "重複" }, stage2State);
} catch (error) {
  duplicateBlocked = true;
}
if (!duplicateBlocked) throw new Error("unprocessed google trends duplicate was allowed");

stage2State = api.upsertCandidate({ id: "stage2-manual-1", source: "manual", keyword: "V2_GOOGLE_TRENDS_TEST_20260928", title: "手動候補" }, stage2State).state;
if (!stage2State.candidates.some((item) => item.source === "manual")) throw new Error("manual candidate coexistence failed");
const editedGoogle = api.upsertCandidate({ id: "stage2-google-1", title: "Google Trends編集後" }, stage2State).state.candidates.find((item) => item.id === "stage2-google-1");
if (editedGoogle.title !== "Google Trends編集後" || editedGoogle.metrics.searchVolumeLabel !== "テスト値" || editedGoogle.metrics.relatedKeywords.length !== 2) throw new Error("google trends edit compatibility failed");
if (api.normalizeCandidate({ id: "legacy-1", source: "manual", keyword: "旧データ" }).metrics.relatedKeywords) throw new Error("legacy metrics compatibility failed");

const stage2V1Storage = { values: { roomSnsTrendDataV1: JSON.stringify({ products: [] }), roomAssistantDataV1: "before-room-data" }, getItem(key) { return this.values[key] || null; }, setItem(key, value) { this.values[key] = value; } };
const stage2Accepted = api.acceptCandidate("stage2-google-1", stage2State, snsApi, stage2V1Storage);
if (!stage2Accepted.created || !stage2Accepted.roomTrendId) throw new Error("google trends accept failed");
const acceptedGoogle = stage2Accepted.state.candidates.find((item) => item.id === "stage2-google-1");
if (acceptedGoogle.status !== "accepted" || acceptedGoogle.humanReviewed !== true || acceptedGoogle.roomTrendId !== stage2Accepted.roomTrendId) throw new Error("google trends acceptance state failed");
if (JSON.parse(stage2V1Storage.values.roomSnsTrendDataV1).products.length !== 1) throw new Error("google trends v1 bridge failed");
const acceptedAgain = api.acceptCandidate("stage2-google-1", stage2Accepted.state, snsApi, stage2V1Storage);
if (acceptedAgain.created || JSON.parse(stage2V1Storage.values.roomSnsTrendDataV1).products.length !== 1) throw new Error("google trends double accept failed");
if (stage2V1Storage.values.roomAssistantDataV1 !== "before-room-data") throw new Error("room data changed");

const rejectedState = api.rejectCandidate("stage2-manual-1", stage2Accepted.state);
if (rejectedState.candidates.find((item) => item.id === "stage2-manual-1").status !== "rejected") throw new Error("google trends reject failed");
if (JSON.parse(stage2V1Storage.values.roomSnsTrendDataV1).products.length !== 1) throw new Error("reject changed v1");
console.log("sns trend discovery v2 stage 2 cases: passed");

(async () => {
  const workerPayload = {
    source: "google_trends",
    region: "JP",
    fetchedAt: "2026-09-29T00:00:00.000Z",
    count: 2,
    items: [
      { keyword: "PS5 Pro", traffic: "1000+", publishedAt: "2026-09-28T23:00:00Z", pictureUrl: null, pictureSource: null, news: [{ title: "ゲームニュース", url: "https://example.com/news", source: "Example" }] },
      { keyword: "収納ボックス", traffic: null, publishedAt: null, pictureUrl: null, pictureSource: null, news: [] }
    ]
  };
  if (!api.validateWorkerPayload(workerPayload).valid) throw new Error("worker response validation failed");
  if (api.GOOGLE_TRENDS_WORKER_URL !== "https://rakuten-room-trends-worker.rinrin8nana.workers.dev/google-trends") throw new Error("worker URL failed");
  const workerInput = api.buildGoogleTrendsCandidateInput(workerPayload.items[0], workerPayload, "2026-09-29T01:00:00.000Z");
  if (workerInput.source !== "google_trends" || workerInput.keyword !== "PS5 Pro" || workerInput.metrics.searchVolumeLabel !== "1000+" || workerInput.detectedAt !== workerPayload.items[0].publishedAt || workerInput.observedAt !== workerPayload.fetchedAt) throw new Error("worker mapping failed");
  let workerState = api.readState({ values: {}, getItem() { return null; }, setItem() {} });
  const beforeWorkerStorage = JSON.stringify(workerState);
  const fetchCalls = [];
  const workerResponse = await api.fetchGoogleTrends(async (url, options) => { fetchCalls.push({ url, options }); return { ok: true, status: 200, async json() { return workerPayload; } }; });
  if (workerResponse.items.length !== 2 || fetchCalls.length !== 1 || fetchCalls[0].url !== api.GOOGLE_TRENDS_WORKER_URL || fetchCalls[0].options.method !== "GET") throw new Error("worker fetch failed");
  if (JSON.stringify(workerState) !== beforeWorkerStorage) throw new Error("fetch changed localStorage state");
  const addedWorker = api.addGoogleTrendsCandidate(workerPayload.items[0], workerPayload, workerState, "2026-09-29T01:00:00.000Z");
  workerState = addedWorker.state;
  if (workerState.candidates.length !== 1 || workerState.candidates[0].keyword !== "PS5 Pro" || workerState.candidates[0].metrics.searchVolumeLabel !== "1000+") throw new Error("worker candidate add failed");
  let workerDuplicateBlocked = false;
  try { api.addGoogleTrendsCandidate(workerPayload.items[0], workerPayload, workerState); } catch (error) { workerDuplicateBlocked = true; }
  if (!workerDuplicateBlocked) throw new Error("worker duplicate prevention failed");
  if (api.validateWorkerPayload({ ...workerPayload, source: "wrong" }).valid !== false) throw new Error("invalid source validation failed");
  if (api.validateWorkerPayload({ ...workerPayload, items: [] }).valid !== true) throw new Error("empty item response validation failed");
  if (api.validateWorkerPayload({ ...workerPayload, items: null }).valid !== false) throw new Error("missing items validation failed");
  let invalidJsonRejected = false;
  try { await api.fetchGoogleTrends(async () => ({ ok: true, status: 200, async json() { throw new Error("invalid json"); } })); } catch (error) { invalidJsonRejected = error.code === "invalid_json"; }
  if (!invalidJsonRejected) throw new Error("invalid JSON handling failed");
  let httpRejected = false;
  try { await api.fetchGoogleTrends(async () => ({ ok: false, status: 502, async json() { return {}; } })); } catch (error) { httpRejected = error.code === "http_error"; }
  if (!httpRejected) throw new Error("HTTP error handling failed");
  let networkRejected = false;
  try { await api.fetchGoogleTrends(async () => { throw new Error("offline"); }); } catch (error) { networkRejected = error.code === "network_error"; }
  if (!networkRejected) throw new Error("network error handling failed");
  console.log("sns trend discovery v2 stage 3-3 cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
