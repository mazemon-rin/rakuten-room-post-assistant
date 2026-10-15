const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src/core/affiliate-rate-diagnostic.js"), "utf8");
const context = { URLSearchParams, Number, String, Object, Array, Promise, setTimeout };
context.globalThis = context;
vm.runInNewContext(source, context);
const api = context.AffiliateRateDiagnostic;
const itemCode = api.ITEM_CODE;
const appId = "app-secret";
const accessKey = "access-secret";

assert.deepStrictEqual(Array.from(api.CONDITIONS, ({ id }) => id), ["A", "B", "C", "D", "E"]);
const expected = {
  A: { keyword: "しそ餃子", itemCode: null, hits: "30", minimum: null },
  B: { keyword: null, itemCode, hits: "1", minimum: null },
  C: { keyword: "しそ餃子", itemCode: null, hits: "30", minimum: "5" },
  D: { keyword: null, itemCode, hits: "1", minimum: "5" }
};
for (const [id, values] of Object.entries(expected)) {
  const params = api.buildDiagnosticParams(appId, accessKey, id);
  assert.strictEqual(params.get("format"), "json");
  assert.strictEqual(params.get("applicationId"), appId);
  assert.strictEqual(params.get("accessKey"), accessKey);
  assert.strictEqual(params.get("keyword"), values.keyword);
  assert.strictEqual(params.get("itemCode"), values.itemCode);
  assert.strictEqual(params.get("hits"), values.hits);
  assert.strictEqual(params.get("minAffiliateRate"), values.minimum);
}
const shopCodeParams = api.buildDiagnosticParams(appId, accessKey, "E");
assert.strictEqual(api.CONDITIONS.find(({ id }) => id === "E").label, "E：対象shopCode / 最大2ページ・60件");
assert.strictEqual(shopCodeParams.get("shopCode"), "sunshine-osaka");
assert.strictEqual(shopCodeParams.get("itemCode"), null);
assert.strictEqual(shopCodeParams.get("keyword"), null);
assert.strictEqual(shopCodeParams.get("hits"), "30");
assert.strictEqual(shopCodeParams.get("format"), "json");
assert.strictEqual(shopCodeParams.get("page"), "1");
assert.strictEqual(api.buildDiagnosticParams(appId, accessKey, "E", 2).get("page"), "2");
for (const id of ["A", "B", "C", "D"]) assert.strictEqual(api.buildDiagnosticParams(appId, accessKey, id).get("page"), null);
assert.throws(() => api.buildDiagnosticParams(appId, accessKey, "X"), /診断条件が不正/);

const success = api.summarizeResponse(200, { count: 2, Items: [
  { itemCode: "another-shop:other-item", affiliateRate: 2 },
  { itemCode, affiliateRate: "20" }
] });
assert.strictEqual(success.state, "success");
assert.strictEqual(success.httpStatus, 200);
assert.strictEqual(success.apiCount, 2);
assert.strictEqual(success.fetchedCount, 2);
assert.strictEqual(success.targetFound, true);
assert.strictEqual(success.affiliateRate, "20");
assert.strictEqual(success.affiliateRateType, "string");
const nestedProduct = api.summarizeResponse(200, { count: 1, items: [{ item: {
  itemCode, itemName: "対象商品", itemPrice: 2980, itemUrl: "https://item.rakuten.co.jp/sunshine-osaka/kuro50-siso50/",
  shopName: "一龍堂", mediumImageUrls: [{ imageUrl: "https://example.test/item.jpg" }]
} }] });
assert.strictEqual(nestedProduct.targetFound, true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(nestedProduct.product)), {
  itemCode, itemName: "対象商品", itemPrice: 2980,
  itemUrl: "https://item.rakuten.co.jp/sunshine-osaka/kuro50-siso50/",
  shopName: "一龍堂", hasMediumImageUrl: true
});

const noTarget = api.summarizeResponse(200, { count: 2, Items: [
  { itemCode: "shop:one", affiliateRate: 1 }, { itemCode: "shop:two", affiliateRate: 3 }
] });
assert.strictEqual(noTarget.state, "success");
assert.strictEqual(noTarget.targetFound, false);
assert.strictEqual(noTarget.affiliateRate, null);
assert.strictEqual(api.summarizeResponse(200, { count: 0, Items: [] }).state, "zero_results");
assert.strictEqual(api.summarizeResponse(200, { count: 1, Items: [{ itemCode }] }).affiliateRateType, "unavailable");
assert.strictEqual(api.summarizeResponse(200, {}).state, "api_error");

const distribution = api.summarizeAffiliateRateDistribution({ Items: [
  { Item: { affiliateRate: 0.5 } },
  { item: { affiliateRate: 1 } },
  { affiliateRate: 2 },
  { affiliateRate: "3.5" },
  { affiliateRate: 4.99 },
  { affiliateRate: 5 },
  { affiliateRate: 20 },
  { affiliateRate: "" },
  { affiliateRate: null },
  {},
  { affiliateRate: "unknown" },
  { affiliateRate: -1 },
  { affiliateRate: 101 }
] });
assert.strictEqual(distribution.fetchedCount, 13);
assert.strictEqual(distribution.classifiedCount, 13);
assert.deepStrictEqual(JSON.parse(JSON.stringify(distribution.buckets)), {
  below1: 1, from1To2: 1, from2To3: 1, from3To4: 1, from4To5: 1, from5: 2, unavailable: 3, invalid: 3
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(distribution.dataTypes)), {
  number: 8, string: 3, null: 1, undefined: 1, boolean: 0, object: 0, other: 0
});
assert.strictEqual(distribution.minimum, 0.5);
assert.strictEqual(distribution.maximum, 20);
assert.strictEqual(distribution.average, (0.5 + 1 + 2 + 3.5 + 4.99 + 5 + 20) / 7);
const emptyDistribution = api.summarizeAffiliateRateDistribution({ Items: [] });
assert.strictEqual(emptyDistribution.fetchedCount, 0);
assert.strictEqual(emptyDistribution.classifiedCount, 0);
assert.strictEqual(emptyDistribution.minimum, null);
assert.strictEqual(emptyDistribution.average, null);
const malformedValues = api.summarizeAffiliateRateDistribution({ Items: [
  { affiliateRate: "NaN" }, { affiliateRate: "Infinity" }, { affiliateRate: true }
] });
assert.strictEqual(malformedValues.buckets.invalid, 3);
assert.strictEqual(malformedValues.dataTypes.string, 2);
assert.strictEqual(malformedValues.dataTypes.boolean, 1);

const failure = api.summarizeResponse(400, { error: "wrong_parameter", error_description: `applicationId=${appId} accessKey=${accessKey}` });
assert.strictEqual(failure.state, "api_error");
assert.strictEqual(failure.httpStatus, 400);
assert.strictEqual(failure.errorCode, "wrong_parameter");
assert.strictEqual(JSON.stringify(failure).includes(appId), false);
assert.strictEqual(JSON.stringify(failure).includes(accessKey), false);
assert.strictEqual(JSON.stringify(failure).includes("error_description"), false);
assert.strictEqual(api.summarizeResponse(400, { error: "unrecognized-secret", error_description: "sensitive details" }).errorCode, null);
assert.strictEqual(api.getSafeApiErrorReason({ error_description: "itemCode parameter is not valid" }), "itemCodeパラメータが無効です。");
assert.strictEqual(api.getSafeApiErrorReason({ error_description: "page must be a number; accessKey=do-not-show" }), "pageは数値で指定してください。");
assert.strictEqual(api.getSafeApiErrorReason({ error_description: `itemCode parameter is not valid ${appId} ${accessKey}` }), "itemCodeパラメータが無効です。");
assert.strictEqual(api.getSafeApiErrorReason({ error_description: "sensitive unknown description" }), "詳細不明（APIのパラメータエラー）");

(async () => {
  let fakeNow = 10000;
  const waits = [];
  const rateLimitOptions = { now: () => fakeNow, wait: async (ms) => { waits.push(ms); fakeNow += ms; } };
  const requested = [];
  const result = await api.runDiagnosticCondition({
    applicationId: appId,
    accessKey,
    conditionId: "A",
    ...rateLimitOptions,
    fetchImpl: async (url, options) => {
      requested.push({ url: new URL(url), options });
      return { status: 200, json: async () => ({ count: 1, Items: [{ itemCode, affiliateRate: 20 }] }) };
    }
  });
  assert.strictEqual(requested.length, 1, "one condition must make exactly one request");
  assert.strictEqual(requested[0].url.searchParams.get("keyword"), "しそ餃子");
  assert.strictEqual(requested[0].url.searchParams.get("hits"), "30");
  assert.strictEqual(requested[0].url.searchParams.get("itemCode"), null);
  assert.strictEqual(requested[0].options.method, "GET");
  assert.strictEqual(requested[0].options.headers.accessKey, undefined);
  assert.strictEqual(result.conditionId, "A");
  assert.strictEqual(result.targetFound, true);
  assert.strictEqual(result.affiliateRate, 20);
  assert.strictEqual(result.rateDistribution.fetchedCount, 1);
  assert.strictEqual(result.rateDistribution.buckets.from5, 1);
  assert.strictEqual(JSON.stringify(result).includes(appId), false);
  assert.strictEqual(JSON.stringify(result).includes(accessKey), false);
  assert.strictEqual(JSON.stringify(result).includes("openapi.rakuten"), false);

  const shopResponse = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      assert.strictEqual(parsed.searchParams.get("shopCode"), "sunshine-osaka");
      assert.strictEqual(parsed.searchParams.get("hits"), "30");
      assert.strictEqual(parsed.searchParams.get("page"), "1");
      assert.strictEqual(parsed.searchParams.get("itemCode"), null);
      assert.strictEqual(parsed.searchParams.get("keyword"), null);
      return { status: 200, json: async () => ({ count: 33, page: 1, pageCount: 2, Items: [
        { Item: { itemCode, itemName: "一龍堂 しそ餃子", itemPrice: 3980, itemUrl: "https://item.rakuten.co.jp/sunshine-osaka/kuro50-siso50/", shopName: "一龍堂", mediumImageUrls: [{ imageUrl: "https://example.test/item.jpg" }] } },
        { Item: { itemCode: "sunshine-osaka:other", itemName: "別商品" } }
      ] }) };
    }
  });
  assert.strictEqual(shopResponse.state, "success");
  assert.strictEqual(shopResponse.apiCount, 33);
  assert.strictEqual(shopResponse.fetchedCount, 2);
  assert.strictEqual(shopResponse.targetFound, true);
  assert.strictEqual(shopResponse.product.itemName, "一龍堂 しそ餃子");
  assert.strictEqual(shopResponse.product.hasMediumImageUrl, true);
  assert.strictEqual(shopResponse.pagesChecked, 1, "a page-one match must not trigger page two");
  assert.strictEqual(shopResponse.scanComplete, false, "finding the target does not claim all shop products were scanned");
  assert.strictEqual(JSON.stringify(shopResponse).includes(appId), false);
  assert.strictEqual(JSON.stringify(shopResponse).includes(accessKey), false);

  let aRequestCount = 0;
  const thirtyItemsA = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "A", ...rateLimitOptions,
    fetchImpl: async () => {
      aRequestCount += 1;
      return { status: 200, json: async () => ({
        count: 234,
        Items: Array.from({ length: 30 }, (_, index) => ({ Item: { affiliateRate: String(index % 6) } }))
      }) };
    }
  });
  assert.strictEqual(aRequestCount, 1, "A distribution must reuse the same API response without another request");
  assert.strictEqual(thirtyItemsA.apiCount, 234);
  assert.strictEqual(thirtyItemsA.fetchedCount, 30);
  assert.strictEqual(thirtyItemsA.rateDistribution.fetchedCount, 30);
  assert.strictEqual(thirtyItemsA.rateDistribution.classifiedCount, 30);
  assert.strictEqual(thirtyItemsA.rateDistribution.validCount, 30);

  const noRatesA = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "A", ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 4, Items: [
      { Item: { affiliateRate: null } }, { Item: {} }, { Item: { affiliateRate: "" } }, { Item: { affiliateRate: "bad" } }
    ] }) })
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(noRatesA.rateDistribution.buckets)), {
    below1: 0, from1To2: 0, from2To3: 0, from3To4: 0, from4To5: 0, from5: 0, unavailable: 3, invalid: 1
  });
  assert.strictEqual(noRatesA.rateDistribution.classifiedCount, noRatesA.fetchedCount);
  assert.strictEqual(JSON.stringify(noRatesA).includes(appId), false);
  assert.strictEqual(JSON.stringify(noRatesA).includes(accessKey), false);

  const emptyA = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "A", ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 0, Items: [] }) })
  });
  assert.strictEqual(emptyA.state, "zero_results");
  assert.strictEqual(emptyA.rateDistribution.fetchedCount, 0);
  assert.strictEqual(emptyA.rateDistribution.average, null);

  const errorA = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "A", ...rateLimitOptions,
    fetchImpl: async () => ({ status: 400, json: async () => ({ error: "wrong_parameter", error_description: `${appId} ${accessKey}` }) })
  });
  assert.strictEqual(errorA.state, "api_error");
  assert.strictEqual(errorA.rateDistribution, undefined);
  assert.strictEqual(JSON.stringify(errorA).includes(appId), false);
  assert.strictEqual(JSON.stringify(errorA).includes(accessKey), false);

  const absent = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "C",
    ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 0, Items: [] }) })
  });
  assert.strictEqual(absent.state, "zero_results");
  assert.strictEqual(absent.targetFound, false);

  const http400 = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "D",
    ...rateLimitOptions,
    fetchImpl: async () => ({ status: 400, json: async () => ({ error: "wrong_parameter", error_description: `${appId} ${accessKey}` }) })
  });
  assert.strictEqual(http400.httpStatus, 400);
  assert.strictEqual(http400.errorCode, "wrong_parameter");
  assert.strictEqual(JSON.stringify(http400).includes(appId), false);
  assert.strictEqual(JSON.stringify(http400).includes(accessKey), false);

  const targetRateMissing = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "B",
    ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 1, Items: [{ itemCode }] }) })
  });
  assert.strictEqual(targetRateMissing.targetFound, true);
  assert.strictEqual(targetRateMissing.affiliateRate, null);
  assert.strictEqual(targetRateMissing.affiliateRateType, "unavailable");
  assert.strictEqual(targetRateMissing.rateDistribution, undefined, "condition B behavior must not be extended with A distribution");
  const makeShopItems = (start, count) => Array.from({ length: count }, (_, index) => ({
    Item: { itemCode: `sunshine-osaka:other-${start + index}`, itemName: `別商品${start + index}` }
  }));
  const pageRequests = [];
  const pageTwoMatch = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      pageRequests.push(parsed.searchParams.get("page"));
      const page = Number(parsed.searchParams.get("page"));
      return { status: 200, json: async () => ({
        count: 41,
        page,
        pageCount: 2,
        Items: page === 1 ? makeShopItems(1, 30) : [
          { Item: { itemCode, itemName: "対象商品", itemPrice: 3980, mediumImageUrls: [{ imageUrl: "https://example.test/target.jpg" }] } },
          ...makeShopItems(31, 10)
        ]
      }) };
    }
  });
  assert.deepStrictEqual(pageRequests, ["1", "2"]);
  assert.strictEqual(pageTwoMatch.targetFound, true);
  assert.strictEqual(pageTwoMatch.product.itemName, "対象商品");
  assert.strictEqual(pageTwoMatch.product.itemPrice, 3980);
  assert.strictEqual(pageTwoMatch.product.hasMediumImageUrl, true);
  assert.strictEqual(pageTwoMatch.apiCount, 41);
  assert.strictEqual(pageTwoMatch.fetchedCount, 41);
  assert.strictEqual(pageTwoMatch.uniqueFetchedCount, 41);
  assert.strictEqual(pageTwoMatch.pagesChecked, 2);
  assert.strictEqual(pageTwoMatch.pagesToCheck, 2);
  assert.strictEqual(pageTwoMatch.scanComplete, true);

  const allPagesNoMatch = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async (url) => ({ status: 200, json: async () => ({
      count: 41,
      page: Number(new URL(url).searchParams.get("page")),
      pageCount: 2,
      Items: Number(new URL(url).searchParams.get("page")) === 1
        ? makeShopItems(1, 30) : makeShopItems(31, 11)
    }) })
  });
  assert.strictEqual(allPagesNoMatch.targetFound, false);
  assert.strictEqual(allPagesNoMatch.scanComplete, true);
  assert.strictEqual(allPagesNoMatch.fetchedCount, 41);
  assert.strictEqual(allPagesNoMatch.uniqueFetchedCount, 41);

  const beyondTwoPages = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return { status: 200, json: async () => ({
        count: 61, page, pageCount: 3,
        Items: makeShopItems((page - 1) * 30 + 1, 30)
      }) };
    }
  });
  assert.strictEqual(beyondTwoPages.fetchedCount, 60);
  assert.strictEqual(beyondTwoPages.pageCount, 3);
  assert.strictEqual(beyondTwoPages.scanComplete, false, "60 rows do not certify all results when API reports a third page");

  let failedPageRequests = 0;
  const pageTwoError = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async () => {
      failedPageRequests += 1;
      if (failedPageRequests === 1) return { status: 200, json: async () => ({ count: 41, page: 1, pageCount: 2, Items: makeShopItems(1, 30) }) };
      return { status: 400, json: async () => ({ error: "wrong_parameter", error_description: "page parameter is not valid" }) };
    }
  });
  assert.strictEqual(failedPageRequests, 2);
  assert.strictEqual(pageTwoError.state, "api_error");
  assert.strictEqual(pageTwoError.pagesChecked, 1);
  assert.strictEqual(pageTwoError.pagesAttempted, 2);
  assert.strictEqual(pageTwoError.scanComplete, false);
  assert.strictEqual(pageTwoError.targetFound, false);
  assert.strictEqual(pageTwoError.safeErrorReason, "pageパラメータが無効です。");

  let shortCountRequests = 0;
  const shortCount = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async () => {
      shortCountRequests += 1;
      return { status: 200, json: async () => ({ count: 2, page: 1, pageCount: 1, Items: [
        { Item: { itemCode: "sunshine-osaka:other-a" } }, { Item: { itemCode: "sunshine-osaka:other-b" } }
      ] }) };
    }
  });
  assert.strictEqual(shortCountRequests, 1, "count <= 30 must not request page two");
  assert.strictEqual(shortCount.scanComplete, true);
  assert.strictEqual(shortCount.targetFound, false);

  const unidentifiedRows = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 1, page: 1, pageCount: 1, Items: [{ Item: { itemName: "itemCode未取得" } }] }) })
  });
  assert.strictEqual(unidentifiedRows.uniqueFetchedCount, 0);
  assert.strictEqual(unidentifiedRows.scanComplete, false, "rows without itemCode cannot certify complete matching");

  let duplicatePageRequests = 0;
  const duplicateAcrossPages = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async (url) => {
      duplicatePageRequests += 1;
      const page = Number(new URL(url).searchParams.get("page"));
      const firstPageItems = makeShopItems(1, 29);
      firstPageItems.push({ Item: { itemCode: "sunshine-osaka:repeated" } });
      return { status: 200, json: async () => ({ count: 32, page, pageCount: 2, Items: page === 1 ? firstPageItems : [
        { Item: { itemCode: "sunshine-osaka:repeated" } }, { Item: { itemCode } }
      ] }) };
    }
  });
  assert.strictEqual(duplicatePageRequests, 2);
  assert.strictEqual(duplicateAcrossPages.targetFound, true);
  assert.strictEqual(duplicateAcrossPages.fetchedCount, 32);
  assert.strictEqual(duplicateAcrossPages.uniqueFetchedCount, 31);
  assert.strictEqual(duplicateAcrossPages.scanComplete, false, "duplicates must not count as distinct scanned products");
  const emptyShop = await api.runDiagnosticCondition({
    applicationId: appId, accessKey, conditionId: "E", ...rateLimitOptions,
    fetchImpl: async () => ({ status: 200, json: async () => ({ count: 0, page: 1, pageCount: 0, Items: [] }) })
  });
  assert.strictEqual(emptyShop.state, "zero_results");
  assert.strictEqual(emptyShop.scanComplete, true);
  const missingImage = api.summarizeResponse(200, { count: 1, Items: [{ Item: { itemCode, itemName: "商品" } }] });
  assert.strictEqual(missingImage.product.hasMediumImageUrl, false);
  assert.ok(waits.length >= 1, "API request spacing should be exercised");
  assert.ok(waits.every((ms) => ms === 1200), "requests must remain at least 1.2 seconds apart");

  console.log("Affiliate rate diagnostic mock cases: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
