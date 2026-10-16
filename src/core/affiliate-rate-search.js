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

  function processHighRateSearchResponses(responses = [], options = {}) {
    const getIdentity = options.getIdentity || ((product) => product.itemCode || product.itemUrl || product.itemName);
    const isUnavailable = options.isUnavailable || (() => false);
    const isPosted = options.isPosted || (() => false);
    const requestedCount = Math.max(1, Number(options.requestedCount) || 10);
    const merged = new Map();
    let fetchedCount = 0;
    let apiTotalCount = 0;
    let apiTotalCountComplete = responses.length > 0;

    responses.forEach((response = {}) => {
      const items = Array.isArray(response.items) ? response.items : [];
      fetchedCount += items.length;
      const count = response.count == null || String(response.count).trim() === "" ? NaN : Number(response.count);
      if (Number.isFinite(count) && count >= 0) apiTotalCount += count;
      else apiTotalCountComplete = false;
      mergeApiResultsByIdentity(merged, items, getIdentity);
    });

    const uniqueProducts = [...merged.values()];
    const availableProducts = uniqueProducts.filter((product) => !isUnavailable(product));
    const unavailableExcludedCount = uniqueProducts.length - availableProducts.length;
    const eligibleProducts = availableProducts.filter((product) => !isPosted(product));
    const postedExcludedCount = availableProducts.length - eligibleProducts.length;
    const displayProducts = sortByApiAffiliateRate(eligibleProducts).slice(0, requestedCount);

    return {
      apiTotalCount: apiTotalCountComplete ? apiTotalCount : null,
      fetchedCount,
      duplicateExcludedCount: fetchedCount - uniqueProducts.length,
      unavailableExcludedCount,
      postedExcludedCount,
      rateMissingCount: uniqueProducts.filter((product) => product.apiAffiliateRate == null).length,
      uniqueCount: uniqueProducts.length,
      displayedCount: displayProducts.length,
      products: displayProducts
    };
  }

  function formatHighRateSearchDiagnostics(diagnostics = {}) {
    const countLabel = diagnostics.apiTotalCount == null ? "未取得" : `${diagnostics.apiTotalCount}件`;
    return [
      `API総件数（応答count合計）：${countLabel}`,
      `今回取得：${Number(diagnostics.fetchedCount) || 0}件 / 重複除外：${Number(diagnostics.duplicateExcludedCount) || 0}件`,
      `販売終了除外：${Number(diagnostics.unavailableExcludedCount) || 0}件 / 既存商品除外：${Number(diagnostics.postedExcludedCount) || 0}件`,
      `API参考料率未取得（重複除外後）：${Number(diagnostics.rateMissingCount) || 0}件`,
      `最終表示：${Number(diagnostics.displayedCount) || 0}件`
    ].join("\n");
  }

  function getHighRateSearchState(diagnostics = {}, successfulResponseCount = 0, minimumRate = 5) {
    if (!successfulResponseCount) return "検索失敗（API応答を取得できませんでした）";
    if (diagnostics.displayedCount === 0 && diagnostics.fetchedCount === 0) return "検索成功（API応答は正常ですが、該当商品は0件です）";
    if (diagnostics.displayedCount === 0) return "API商品を取得しましたが、販売終了・既存商品除外後の表示商品は0件です";
    return `検索成功：API参考料率${minimumRate}%以上の商品を表示しています`;
  }

  function redactSensitiveText(value) {
    return String(value || "").replace(/(^|[?&\s])((?:applicationId|accessKey|affiliateId)=)[^&\s]+/gi, "$1$2[REDACTED]");
  }

  function formatHighRateApiErrors(errors = []) {
    return errors.map((error) => {
      const status = error.status ? `HTTP ${error.status}` : "HTTP status未取得";
      const type = redactSensitiveText(error.type || "通信エラー");
      const detail = redactSensitiveText(error.detail || "").trim();
      return `${error.category || "検索"}: ${status} / ${type}${detail ? `：${detail}` : ""}`;
    }).join("\n");
  }

  function resetSearchModeState(resultsContainer, messageElement) {
    if (resultsContainer) resultsContainer.innerHTML = "";
    if (messageElement) messageElement.textContent = "検索条件を設定して商品を検索してください。";
    return { highRateResults: [], normalResults: [] };
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

  root.AffiliateRateSearch = Object.freeze({
    applyHighAffiliateRateParams, withApiAffiliateRate, sortByApiAffiliateRate,
    mergeApiResultsByIdentity, processHighRateSearchResponses,
    formatHighRateSearchDiagnostics, getHighRateSearchState, formatHighRateApiErrors, redactSensitiveText,
    resetSearchModeState, buildHighRateCandidateProduct
  });
})(typeof window !== "undefined" ? window : globalThis);
