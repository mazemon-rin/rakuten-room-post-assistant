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

  root.RoomProductNormalization = Object.freeze({ normalizeRakutenItems, isUnavailableProduct, getImageCandidates, getImage, addParam });
})(typeof window !== "undefined" ? window : globalThis);
