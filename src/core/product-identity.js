(function exposeProductIdentity(root) {
  function normalizeItemCode(itemCode) {
    return itemCode == null ? "" : String(itemCode).trim();
  }

  function getItemCodes(record = {}) {
    return [...new Set([
      normalizeItemCode(record.itemCode),
      normalizeItemCode(record.product?.itemCode)
    ].filter(Boolean))];
  }

  function getItemCode(record = {}) {
    return getItemCodes(record)[0] || "";
  }

  function normalizeItemUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
    } catch {
      return String(url).split("?")[0].replace(/\/$/, "").toLowerCase();
    }
  }

  function rankingIdentity(product) {
    const itemCode = getItemCode(product);
    if (itemCode) return `code:${itemCode}`;
    const url = normalizeItemUrl(product.itemUrl || product.affiliateUrl);
    if (url) return `url:${url}`;
    return `shop:${product.shopName || ""}|name:${product.itemName || ""}`.toLowerCase();
  }

  root.ProductIdentity = Object.freeze({
    normalizeItemCode,
    getItemCodes,
    getItemCode,
    normalizeItemUrl,
    rankingIdentity
  });
})(typeof window !== "undefined" ? window : globalThis);
