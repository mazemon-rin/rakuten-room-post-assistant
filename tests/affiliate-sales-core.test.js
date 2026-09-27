const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("src/core/affiliate-sales.js", "utf8");
const utilsSource = fs.readFileSync("src/core/utils.js", "utf8");
const context = { console, globalThis: {}, window: undefined, Date, Number, String, Object, Array, Map, Set, RegExp, JSON };
context.globalThis = context;
vm.runInNewContext(utilsSource, context);
vm.runInNewContext(source, context);
const core = context.RoomAffiliateSales;
const normalizeText = context.RoomUtils.normalizeAffiliateText;

const row = { occurredAt: "2026-09-19 20:58:57", reward: 349, amount: 3492, shopName: "TORRASLife", productName: "TORRAS iPhone18Pro ケース", affiliateStatus: "未確定", measurementId: "楽天ROOM" };
const modernHistory = [{ id: "h1", itemCode: "torras-code", title: row.productName, shopName: row.shopName, postedAt: "2026-09-17T10:00:00+09:00", itemUrl: "https://example.com/item", categoryName: "家電", postType: "normal", selectionScoreTotal: 80 }];
const introduced = core.classifyAffiliateSale(row, modernHistory, normalizeText);
assert.strictEqual(introduced.classification, "introduced");
assert.strictEqual(introduced.matchedHistoryId, "h1");
assert.strictEqual(introduced.matchedItemCode, "torras-code");
assert.strictEqual(introduced.source, "rakuten_room");
assert.strictEqual(core.classifyAffiliateSale({ ...row, shopName: "別ショップ" }, modernHistory, normalizeText).classification, "review");
assert.strictEqual(core.classifyAffiliateSale({ ...row, productName: "別の商品", shopName: "別ショップ" }, modernHistory, normalizeText).classification, "other");

const legacy = [{ id: "legacy", product: { itemName: row.productName, shopName: row.shopName, itemPrice: 1980, itemUrl: row.productName } }];
assert.strictEqual(core.classifyAffiliateSale(row, legacy, normalizeText).matchedHistoryId, "legacy");
const multi = [{ id: "weak", title: "iPhone18Pro", shopName: "別" }, ...modernHistory];
assert.strictEqual(core.classifyAffiliateSale(row, multi, normalizeText).matchedHistoryId, "h1");

assert.strictEqual(core.getAffiliateImportKey(row), core.getAffiliateImportKey({ ...row }));
assert.notStrictEqual(core.getAffiliateImportKey(row), core.getAffiliateImportKey({ ...row, amount: 350 }));
assert.strictEqual(core.getAffiliateImportKey({}), "||||||");
assert.strictEqual(core.buildAffiliateImportPreview([row], modernHistory, normalizeText).length, 1);
assert.strictEqual(core.affiliateClassificationLabel("introduced"), "🟢 紹介商品");

const sales = [{ historyId: "h1", amount: 1000, reward: 100, quantity: 1, status: "確定" }, { historyId: "h1", amount: 500, reward: 50, quantity: 2, status: "キャンセル" }, { historyId: "other", amount: 999, reward: 99, quantity: 1, status: "確定" }];
assert.strictEqual(core.getSalesForHistory("h1", sales).length, 2);
assert.deepStrictEqual({ ...core.getValidSalesSummary("h1", sales) }, { amount: 1000, reward: 100, quantity: 1 });
assert.strictEqual(core.calculateDaysFromPostToSale("2026-09-01T00:00:00Z", "2026-09-01T23:00:00Z"), 0);
assert.strictEqual(core.calculateDaysFromPostToSale("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"), 1);
assert.strictEqual(core.calculateDaysFromPostToSale("2026-09-01T00:00:00Z", "2026-09-04T00:00:00Z"), 3);
assert.strictEqual(core.calculateDaysFromPostToSale("bad", "2026-09-04"), "");

const snapshot = core.getHistoryProductSnapshot(modernHistory[0], (item) => item.selectionScoreTotal || 0);
assert.strictEqual(snapshot.title, modernHistory[0].title);
assert.strictEqual(snapshot.itemCode, undefined);
assert.strictEqual(snapshot.selectionScoreTotal, 80);
assert.strictEqual(core.formatSaleDate("bad"), "bad");
assert(/^\d{4}-\d{2}-\d{2}T/.test(core.toDateTimeLocalValue("2026-09-01T00:00:00Z")));
assert.strictEqual(core.getSalesRankBand(1), "1〜30位");
assert.strictEqual(core.getSalesRankBand(40), "31〜50位");
assert.strictEqual(core.getSalesRankBand(99), "その他");
assert.strictEqual(core.getSalesRankBand("bad"), "順位なし");

console.log("affiliate sales core regression cases: passed");
