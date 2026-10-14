(function exposeAffiliateRateSearch(root) {
  "use strict";

  const CANDIDATE_PRODUCT_FIELDS = Object.freeze([
    "itemCode", "itemName", "itemPrice", "itemUrl", "affiliateUrl", "shopName", "shopUrl",
    "itemCaption", "imageUrl", "mediumImageUrls", "smallImageUrls", "availability", "genreId",
    "categoryId", "categoryName", "reviewAverage", "reviewCount", "postageFlag", "apiAffiliateRate",
    "apiAffiliateRateSource"
  ]);

  function applyHighAffiliateRateParams(params, minimumRate) {
    const rate = Number(minimumRate);
    if (![5, 10, 15, 20].includes(rate)) throw new RangeError("料率フィルターは5、10、15、20のいずれかを指定してください。");
    params.set("minAffiliateRate", String(rate));
    params.set("sort", "-affiliateRate");
    return params;
  }

  function withApiAffiliateRate(product = {}) {
    const rawRate = product.affiliateRate;
    const rate = rawRate == null || String(rawRate).trim() === "" ? NaN : Number(rawRate);
    return {
      ...product,
      apiAffiliateRate: Number.isFinite(rate) && rate >= 0 ? rate : null,
      apiAffiliateRateSource: "Rakuten Ichiba Item Search API"
    };
  }

  function sortByApiAffiliateRate(products = []) {
    return [...products].sort((left, right) => (right.apiAffiliateRate ?? -1) - (left.apiAffiliateRate ?? -1));
  }

  function mergeApiResultsByIdentity(target, products, getIdentity) {
    products.forEach((item) => {
      const product = withApiAffiliateRate(item);
      const identity = getIdentity(product);
      if (!target.has(identity)) target.set(identity, product);
    });
    return target;
  }

  function buildHighRateCandidateProduct(product = {}) {
    const compact = {};
    CANDIDATE_PRODUCT_FIELDS.forEach((field) => {
      const rawRate = product.affiliateRate;
      const fallbackRate = rawRate == null || String(rawRate).trim() === "" ? NaN : Number(rawRate);
      const value = field === "apiAffiliateRate" && product.apiAffiliateRate == null
        ? (Number.isFinite(fallbackRate) ? fallbackRate : null)
        : product[field];
      if (value === undefined || value === null || value === "") return;
      if (field === "mediumImageUrls" || field === "smallImageUrls") {
        compact[field] = Array.isArray(value)
          ? value.slice(0, 5).map((entry) => ({ imageUrl: String(entry?.imageUrl || "") })).filter((entry) => entry.imageUrl)
          : [];
        return;
      }
      compact[field] = value;
    });
    if (compact.apiAffiliateRate !== undefined) compact.apiAffiliateRateSource = "Rakuten Ichiba Item Search API";
    return compact;
  }

  root.AffiliateRateSearch = Object.freeze({ applyHighAffiliateRateParams, withApiAffiliateRate, sortByApiAffiliateRate, mergeApiResultsByIdentity, buildHighRateCandidateProduct });
})(typeof window !== "undefined" ? window : globalThis);
