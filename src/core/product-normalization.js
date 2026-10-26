(function exposeRoomProductNormalization(root) {
  "use strict";

  function normalizeRakutenItems(json) {
    const items = json.items || json.Items || [];
    return items.map((entry) => {
      const nested = entry.item || entry.Item;
      return nested ? { ...entry, ...nested } : entry;
    });
  }

  function isUnavailableProduct(product) {
    const availability = product.availability ?? product.itemAvailability;
    if (availability === 0 || availability === "0" || availability === false) return true;
    const status = String(product.stockStatus ?? product.saleStatus ?? "").toLowerCase();
    return /(販売終了|売り切れ|売切れ|sold\s*out|discontinued)/i.test(status);
  }

  // 各商品に最初に該当した除外理由だけを数え、件数の二重計上を防ぎます。
  function classifySearchResults(products = [], options = {}) {
    const result = {
      products: [],
      counts: {
        api: products.length,
        keyword: 0,
        unavailable: 0,
        posted: 0,
        rankRange: 0,
        displayed: 0
      }
    };
    for (const product of products) {
      if (options.isKeywordExcluded?.(product)) {
        result.counts.keyword += 1;
        continue;
      }
      if (isUnavailableProduct(product)) {
        result.counts.unavailable += 1;
        continue;
      }
      if (options.isPosted?.(product)) {
        result.counts.posted += 1;
        continue;
      }
      if (options.rankRange) {
        const rank = Number(product.rank);
        if (!Number.isFinite(rank) || rank < options.rankRange.start || rank > options.rankRange.end) {
          result.counts.rankRange += 1;
          continue;
        }
      }
      result.products.push(product);
    }
    result.counts.displayed = result.products.length;
    return result;
  }

  function getImageCandidates(product = {}) {
    return [...new Set([
      ...(product.mediumImageUrls || []).map((item) => item?.imageUrl),
      ...(product.smallImageUrls || []).map((item) => item?.imageUrl),
      product.imageUrl
    ].filter(Boolean).map((image) => String(image).replace("?_ex=128x128", "")))];
  }

  function getImage(product) {
    return getImageCandidates(product)[0] || "";
  }

  function addParam(params, key, value) {
    if (value) params.set(key, value);
  }

  root.RoomProductNormalization = Object.freeze({ normalizeRakutenItems, isUnavailableProduct, classifySearchResults, getImageCandidates, getImage, addParam });
})(typeof window !== "undefined" ? window : globalThis);
