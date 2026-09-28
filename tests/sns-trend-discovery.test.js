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
