const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("src/core/discount-rules.js", "utf8");
const context = { console, globalThis: {}, window: undefined };
context.globalThis = context;
vm.runInNewContext(source, context);
const rules = context.discountRules;

assert.deepStrictEqual(Array.from(rules.DISCOUNT_RATES), [20, 30, 40, 50, 60, 70, 80, 90]);
for (const text of ["80%OFF", "80％OFF", "最大80%OFF", "最大80％OFF", "80%OFFクーポン", "最大80%OFFクーポン"]) {
assert.strictEqual(rules.extractDiscountCandidate(text).discountRate, 80, text);
}
const couponTitle = rules.extractDiscountCandidate("《クーポンご利用で50%OFF》リンツ クリアランスバッグ 500g");
assert(couponTitle.discountRate === 50 && couponTitle.discountType === "coupon" && couponTitle.discountCondition === "クーポン利用", "Conditional coupon title is classified with its condition");
assert(rules.evaluateDealStatus({ itemName: "《クーポンご利用で50%OFF》リンツ クリアランスバッグ 500g" }, "50").status === "confirmed", "Conditional coupon is visibly confirmed with its condition");
assert.strictEqual(rules.buildDealHeader({ itemName: "《クーポンご利用で50%OFF》リンツ クリアランスバッグ 500g", itemPrice: 7200 }), "🉐 クーポン利用で50%OFF", "Conditional coupon keeps the condition without inventing a deadline");
assert.strictEqual(rules.buildDealHeader({ regularPrice: 11000, salePrice: 5500, itemPrice: 5500, rateConfirmed: true, discountRateType: "exact", discountRate: 50 }), "11,000円→5,500円🉐 50%OFF", "Price reduction with matching rate is usable");
assert.strictEqual(rules.buildDealHeader({ regularPrice: 10000, salePrice: 8000, itemPrice: 8000, rateConfirmed: true, discountRateType: "exact", discountRate: 50 }), "", "Contradictory price reduction is not asserted");
assert.strictEqual(rules.buildDealHeader({ itemName: "最大50%OFFセール", itemPrice: 5000 }), "", "Maximum discount remains unconfirmed");
assert.strictEqual(rules.buildDealHeader({ itemName: "50%OFF対象商品あり", itemPrice: 5000 }), "", "Target-product wording remains unconfirmed");
assert.strictEqual(rules.buildDealHeader({ itemName: "クーポン利用で30%OFF", itemPrice: 3000 }), "🉐 クーポン利用で30%OFF", "Conditional rate remains usable without a deadline");
assert.strictEqual(rules.evaluateDealStatus({ itemName: "最大80%OFFクーポン" }, "80").status, "candidate");
assert.strictEqual(rules.evaluateDealStatus({ discountRate: 80, rateConfirmed: true, discountRateType: "exact" }, "80").status, "confirmed");
assert.strictEqual(rules.evaluateDealStatus({ itemName: "通常商品" }, "80").status, "unknown");
assert.strictEqual(rules.evaluateDealStatus({ discountRate: 80, rateConfirmed: false, discountRateType: "unknown" }, "80").status, "unknown");
assert.strictEqual(rules.buildDealHeader({ regularPrice: 2080, salePrice: 416, itemPrice: 416, rateConfirmed: true, discountRateType: "exact", confirmedDiscountLabel: "80%OFF" }), "2,080円→416円🉐 80%OFF");
assert.strictEqual(rules.buildDealHeader({ regularPrice: 1100, salePrice: 220, itemPrice: 220, rateConfirmed: true, discountRateType: "exact", confirmedDiscountLabel: "最大80%OFFクーポン" }), "1,100円→220円🉐 最大80%OFFクーポン");
assert.strictEqual(rules.buildDealHeader({ regularPrice: 2080, salePrice: 416, itemPrice: 416, rateConfirmed: false, discountRateType: "unknown", confirmedDiscountLabel: "" }), "");
assert.strictEqual(rules.buildDealHeader({ itemPrice: 416, rateConfirmed: true, discountRateType: "exact", discountRate: 80, confirmedDiscountLabel: "最大80%OFFクーポン", deadlineConfirmed: false, couponDeadline: "9/30" }), "🉐 最大80%OFFクーポン");
for (const [minimum, expected] of [[20, 8], [50, 5], [80, 2], [90, 1]]) {
  assert.strictEqual(rules.buildDiscountSearchTermsForMinimum(minimum).length, expected * 8, `${minimum}%以上`);
}
assert(rules.matchesCouponDiscountFilter({ discountRate: 80, rateConfirmed: true, discountRateType: "exact" }, ["80"]));
assert(!rules.matchesCouponDiscountFilter({ discountRate: 80, rateConfirmed: false, discountRateType: "unknown" }, ["80"]));
console.log("discount rules regression cases: passed");
