const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "core", "product-identity.js"), "utf8");
const context = { URL, String, Set, Object };
vm.createContext(context);
vm.runInContext(source, context);
const identity = context.ProductIdentity;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(identity.normalizeItemCode("  shop:001  ") === "shop:001", "itemCode is trimmed");
assert(identity.normalizeItemCode(null) === "" && identity.normalizeItemCode(undefined) === "", "nullish itemCode is empty");
assert(identity.normalizeItemCode("") === "", "empty itemCode is empty");

const nested = { itemCode: " top:001 ", product: { itemCode: "nested:001" } };
assert(JSON.stringify(identity.getItemCodes(nested)) === JSON.stringify(["top:001", "nested:001"]), "both itemCode locations are retained");
assert(identity.getItemCode(nested) === "top:001", "top-level itemCode wins");
assert(identity.getItemCode({ product: { itemCode: " nested:001 " } }) === "nested:001", "nested itemCode is supported");
assert(identity.getItemCode({}) === "", "missing itemCode is empty");

assert(identity.normalizeItemUrl("HTTPS://Example.com/path/?x=1") === "https://example.com/path", "URL is normalized");
assert(identity.normalizeItemUrl("/path/?x=1") === "/path", "invalid URL fallback is normalized");
assert(identity.rankingIdentity({ itemCode: " code:1 ", itemUrl: "https://example.com/other", shopName: "S", itemName: "N" }) === "code:code:1", "itemCode has priority");
assert(identity.rankingIdentity({ itemUrl: "https://Example.com/item/?x=1", shopName: "S", itemName: "N" }) === "url:https://example.com/item", "URL is the second fallback");
assert(identity.rankingIdentity({ shopName: "Shop", itemName: "Name" }) === "shop:shop|name:name", "shop and name are the final fallback");
assert(identity.rankingIdentity({ itemCode: "same" }) === identity.rankingIdentity({ product: { itemCode: "same" } }), "same itemCode has same identity");
assert(identity.rankingIdentity({ itemCode: "one" }) !== identity.rankingIdentity({ itemCode: "two" }), "different itemCodes differ");

console.log("product identity regression cases: passed");
