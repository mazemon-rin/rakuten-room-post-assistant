(function exposeRoomAffiliateSales(root) {
  "use strict";

  function getAffiliateImportKey(row = {}) {
    return [row.occurredAt, row.reward, row.amount, row.shopName, row.productName, row.affiliateStatus, row.measurementId]
      .map((value) => String(value || "").trim()).join("|");
  }

  function classifyAffiliateSale(row, history, normalizeText) {
    const productName = normalizeText(row.productName);
    const shopName = normalizeText(row.shopName);
    const candidates = (history || []).map((item) => {
      const title = normalizeText(item.title || item.product?.itemName);
      const shop = normalizeText(item.shopName || item.product?.shopName);
      const titleMatch = Boolean(productName && title && (productName === title || productName.includes(title) || title.includes(productName)));
      const sharedName = !titleMatch && productName && title && [...productName].some((_, index) => productName.slice(index, index + 10).length === 10 && title.includes(productName.slice(index, index + 10)));
      const shopMatch = Boolean(shopName && shop && shopName === shop);
      return { item, titleMatch, shopMatch, score: (titleMatch ? 2 : 0) + (sharedName ? 1 : 0) + (shopMatch ? 1 : 0) };
    }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    let classification = "other";
    let reason = "投稿履歴に一致する商品を確認できません。";
    if (best?.titleMatch && best?.shopMatch) { classification = "introduced"; reason = "商品名とショップ名が投稿履歴と一致しました。"; }
    else if (best?.score >= 1) { classification = "review"; reason = "投稿履歴に似た商品があるため、同一商品か確認してください。"; }
    const source = normalizeText(row.measurementId).includes("楽天room") ? "rakuten_room" : "unknown";
    return { ...row, importKey: getAffiliateImportKey(row), classification, source, reason, matchedHistoryId: classification === "introduced" ? best.item.id : "", matchedItemCode: classification === "introduced" ? (best.item.itemCode || best.item.product?.itemCode || "") : "", candidateHistoryId: best?.item.id || "" };
  }

  function buildAffiliateImportPreview(rows, history, normalizeText) {
    return rows.map((row) => classifyAffiliateSale(row, history, normalizeText));
  }

  function affiliateClassificationLabel(value) {
    return ({ introduced: "🟢 紹介商品", other: "🔵 その他購入", review: "🟡 要確認" })[value] || value;
  }

  function calculateDaysFromPostToSale(postedAt, occurredAt) {
    const posted = new Date(postedAt);
    const occurred = new Date(occurredAt);
    if (!postedAt || !occurredAt || Number.isNaN(posted.getTime()) || Number.isNaN(occurred.getTime())) return "";
    return Math.max(0, Math.floor((occurred.getTime() - posted.getTime()) / 86400000));
  }

  function getHistoryProductSnapshot(historyItem, getSelectionTotal) {
    const product = historyItem.product || {};
    const rank = historyItem.rank ?? historyItem.apiRank ?? historyItem.sourceRank ?? product.rank ?? product.apiRank ?? product.sourceRank ?? "";
    const selectionScore = getSelectionTotal(historyItem) || getSelectionTotal(product);
    return {
      title: historyItem.title || product.itemName || "",
      shopName: historyItem.shopName || product.shopName || "",
      itemUrl: historyItem.itemUrl || product.itemUrl || product.affiliateUrl || "",
      categoryName: historyItem.categoryName || product.categoryName || "",
      postedAt: historyItem.postedAt || "",
      rank,
      apiRank: historyItem.apiRank ?? product.apiRank ?? "",
      sourceRank: historyItem.sourceRank ?? product.sourceRank ?? "",
      selectionScore,
      selectionScoreTotal: historyItem.selectionScoreTotal ?? product.selectionScoreTotal ?? selectionScore,
      selectionGrade: historyItem.selectionGrade || product.selectionGrade || "",
      selectionVersion: historyItem.selectionVersion || product.selectionVersion || "",
      productType: (historyItem.matchedTrendKeywords || product.matchedTrendKeywords || []).length ? "trend" : "regular",
      matchedTrendKeywords: [...(historyItem.matchedTrendKeywords || product.matchedTrendKeywords || [])],
      postType: historyItem.postType || "",
      selectedCollection: historyItem.selectedCollection || "",
      price: historyItem.price ?? product.itemPrice ?? ""
    };
  }

  function formatSaleDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
  }

  function toDateTimeLocalValue(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function getSalesRankBand(rank) {
    const value = Number(rank);
    if (!Number.isFinite(value) || value <= 0) return "順位なし";
    if (value <= 30) return "1〜30位";
    if (value <= 50) return "31〜50位";
    return "その他";
  }

  function getSalesForHistory(historyId, sales = []) {
    return sales.filter((sale) => sale.historyId === historyId);
  }

  function getValidSalesSummary(historyId, sales = []) {
    return getSalesForHistory(historyId, sales).filter((sale) => sale.status !== "キャンセル").reduce((summary, sale) => ({
      amount: summary.amount + Number(sale.amount || 0),
      reward: summary.reward + Number(sale.reward || 0),
      quantity: summary.quantity + Number(sale.quantity || 0)
    }), { amount: 0, reward: 0, quantity: 0 });
  }

  root.RoomAffiliateSales = Object.freeze({
    getAffiliateImportKey,
    classifyAffiliateSale,
    buildAffiliateImportPreview,
    affiliateClassificationLabel,
    calculateDaysFromPostToSale,
    getHistoryProductSnapshot,
    formatSaleDate,
    toDateTimeLocalValue,
    getSalesRankBand,
    getSalesForHistory,
    getValidSalesSummary
  });
})(typeof window !== "undefined" ? window : globalThis);
