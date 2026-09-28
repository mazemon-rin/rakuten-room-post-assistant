const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("src/sns-trend.js", "utf8");
const context = { window: {}, document: { addEventListener() {}, querySelector() { return null; } }, Date, Math, JSON, Error };
vm.runInNewContext(source, context);
const api = context.window.snsTrend;
const storage = { values: {}, getItem(key) { return this.values[key] || null; }, setItem(key, value) { this.values[key] = value; } };
let state = api.readState(storage);
if (state.products.length !== 0) throw new Error("empty state failed");
const saved = api.upsertProduct({ id: "one", name: "トレンド商品", keyword: "SNS検索語", itemCode: "shop:100", itemUrl: "https://item.rakuten.co.jp/shop/100/", shopName: "ショップ" }, state);
api.writeState(saved.state, storage);
state = api.readState(storage);
if (state.products.length !== 1 || state.products[0].itemCode !== "shop:100" || state.products[0].keyword !== "SNS検索語") throw new Error("save/reload/keyword failed");
state = api.removeProduct("one", state);
if (state.products.length !== 0) throw new Error("delete failed");
state = api.upsertProduct({ id: "two", name: "商品", keyword: "キーワード" }, state).state;
state = api.setMatch("two", { itemCode: "shop:200", title: "楽天商品", itemUrl: "https://item.rakuten.co.jp/shop/200/" }, state);
if (state.products[0].rakutenMatch.itemCode !== "shop:200") throw new Error("match failed");
state = api.clearMatch("two", state);
if (state.products[0].rakutenMatch) throw new Error("unmatch failed");
if (api.setMatch("two", { title: "codeなし" }, state).products[0].rakutenMatch) throw new Error("itemCode-less match should fail");
if (!api.STORAGE_KEY || api.STORAGE_KEY === "roomAssistantDataV1") throw new Error("storage isolation failed");

// Integration-like storage contract: register -> match -> roomCandidate -> reload.
const integrationStorage = { values: {}, getItem(key) { return this.values[key] || null; }, setItem(key, value) { this.values[key] = value; } };
let integration = api.upsertProduct({ id: "integration", name: "統合確認", keyword: "トートバッグ" }, api.readState(integrationStorage)).state;
api.writeState(integration, integrationStorage); // CASE 1
if (api.readState(integrationStorage).products[0].rakutenMatch) throw new Error("case 1 unexpected match");
integration = api.setMatch("integration", { itemCode: "shop:tote-002", title: "トート", itemUrl: "https://item.rakuten.co.jp/shop/tote-002/" }, integration); // CASE 2
api.writeState(integration, integrationStorage);
if (api.readState(integrationStorage).products[0].rakutenMatch?.itemCode !== "shop:tote-002") throw new Error("case 2 match save failed");
if (api.readState(integrationStorage).products[0].rakutenMatch?.itemCode !== "shop:tote-002") throw new Error("case 3 reload failed");
api.render(api.readState(integrationStorage)); // CASE 4: render receives state only and does not replace storage.
if (api.readState(integrationStorage).products[0].rakutenMatch?.itemCode !== "shop:tote-002") throw new Error("case 4 render changed match");
let reloaded = api.readState(integrationStorage); // CASE 5
if (reloaded.products[0].rakutenMatch?.itemCode !== "shop:tote-002") throw new Error("case 5 init reload failed");
reloaded.products[0].roomCandidate = { itemCode: "shop:tote-002", savedAt: "2026-09-28T00:00:00.000Z" }; // CASE 6-7 candidate bridge equivalent, no ROOM storage touched.
api.writeState(reloaded, integrationStorage);
const both = api.readState(integrationStorage).products[0];
if (both.rakutenMatch?.itemCode !== "shop:tote-002" || both.roomCandidate?.itemCode !== "shop:tote-002") throw new Error("case 7 dual state failed");
const finalReload = api.readState(integrationStorage).products[0]; // CASE 8
if (!finalReload.rakutenMatch || !finalReload.roomCandidate) throw new Error("case 8 dual reload failed");
if (!api.renderRoomCandidateStatus({ roomCandidate: { itemCode: "shop:tote-002" } }).includes("ROOM候補連携済み") || !api.renderRoomCandidateStatus({ roomCandidate: { itemCode: "shop:tote-002" } }).includes("shop:tote-002")) throw new Error("roomCandidate display failed");
if (api.renderRoomCandidateStatus({}).trim() !== "") throw new Error("roomCandidate-less display failed");
if (api.renderRoomCandidateStatus({ rakutenMatch: { itemCode: "shop:tote-002" } }).trim() !== "") throw new Error("rakutenMatch must not imply roomCandidate");
console.log("sns trend isolated storage CRUD cases: passed");
console.log("sns trend integration storage cases 1-8: passed");
