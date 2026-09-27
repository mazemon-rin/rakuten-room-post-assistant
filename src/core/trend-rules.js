(function exposeRoomTrendRules(root) {
  "use strict";
  function normalizeTrendText(value = "") { return String(value).normalize("NFKC").toLowerCase().replace(/[\s\-_‐‑‒–—―・/\\.,、。()[\]{}「」『』【】]/g, ""); }
  function tokenizeTrendKeyword(keyword = "") {
    const original = String(keyword).trim();
    const normalized = normalizeTrendText(original);
    const rawTokens = original.normalize("NFKC").toLowerCase().split(/[\s\-_‐‑‒–—―・/\\.,、。()[\]{}「」『』【】]+/).map((token) => token.trim()).filter(Boolean);
    const tokens = rawTokens.length > 1 ? rawTokens : (normalized.match(/[a-z]+\d+[a-z]*|\d+[a-z]+|[a-z]+|\d+|[ぁ-んァ-ヶ一-龯ー]+/g) || [normalized]);
    return { original, normalized, tokens: [...new Set(tokens.filter(Boolean))] };
  }
  function isTrendProductTypeToken(token = "") { return /(ケース|フィルム|ガラス|充電器|ケーブル|バッテリー|イヤホン|バッグ|ラック|マスク|クリーム|セラム|ギフト|水筒|フライパン|鍋)/i.test(token); }
  function calculateTrendFitScore(product = {}, matchedTrendKeywords = [], stripHtmlFn = (value) => String(value).replace(/<[^>]*>/g, "")) {
    const source = normalizeTrendText(`${product.itemName || ""} ${stripHtmlFn(product.itemCaption || "")}`);
    const keywordDetails = [...new Set(matchedTrendKeywords)].filter(Boolean).map(tokenizeTrendKeyword);
    if (!keywordDetails.length || !source) return { total: 0, matchedKeywords: [], matchedTokenRatio: 0, typeMatch: false, exactMatch: false };
    let best = { total: 0, matchedKeywords: [], matchedTokenRatio: 0, typeMatch: false, exactMatch: false };
    keywordDetails.forEach((keyword) => {
      const matchedTokens = keyword.tokens.filter((token) => source.includes(normalizeTrendText(token)));
      const ratio = keyword.tokens.length ? matchedTokens.length / keyword.tokens.length : 0;
      const keywordType = keyword.tokens.find(isTrendProductTypeToken);
      const typeMatch = Boolean(keywordType && source.includes(normalizeTrendText(keywordType)));
      const exactMatch = keyword.normalized.length >= 4 && source.includes(keyword.normalized);
      const modelTokens = keyword.tokens.filter((token) => /[a-z]+\d+|\d+[a-z]+/i.test(token));
      const modelMatch = modelTokens.length > 0 && modelTokens.every((token) => source.includes(normalizeTrendText(token)));
      let score = 0;
      if (exactMatch && typeMatch) score = 30;
      else if (ratio >= 0.9 && typeMatch) score = 27;
      else if (modelMatch && typeMatch) score = 25;
      else if (ratio >= 0.75 && typeMatch) score = 23;
      else if (modelMatch || ratio >= 0.75) score = 18;
      else if (ratio >= 0.5) score = 12;
      else if (ratio > 0) score = 6;
      if (!typeMatch && keywordType && modelMatch) score = Math.min(score, 18);
      const candidate = { total: score, matchedKeywords: score ? [keyword.original] : [], matchedTokenRatio: ratio, typeMatch, exactMatch };
      if (candidate.total > best.total) best = candidate;
    });
    return best;
  }
  function calculateTrendReviewEvidenceScore(product = {}, trendFit = {}) {
    const count = Number(product.reviewCount); const rating = Number(product.reviewAverage);
    if (count >= 1000 && rating >= 4.5) return 15;
    if (count >= 500 && rating >= 4.3) return 13;
    if (count >= 100 && rating >= 4.3) return 11;
    if (count >= 30 && rating >= 4) return 8;
    if (count > 0 && rating >= 4) return 6;
    if (trendFit.total >= 27 && (product.releaseDate || product.isNewProduct || product.newProduct)) return 7;
    if (trendFit.total >= 27 && count <= 10) return 6;
    return count > 0 ? 4 : 3;
  }
  function calculateTrendScore(product = {}, matchedTrendKeywords = [], stripHtmlFn = (value) => String(value).replace(/<[^>]*>/g, "")) {
    const keywords = [...new Set(matchedTrendKeywords)].filter(Boolean);
    const title = String(product.itemName || "").toLowerCase();
    const description = stripHtmlFn(product.itemCaption || "").toLowerCase();
    const keywordMatch = keywords.length ? (keywords.some((word) => title.includes(word.toLowerCase())) ? 10 : keywords.some((word) => description.includes(word.toLowerCase())) ? 6 : 3) : 0;
    const multiKeyword = keywords.length >= 3 ? 5 : keywords.length === 2 ? 3 : 0;
    const searchPosition = Number(product.trendSearchPosition) >= 1 && Number(product.trendSearchPosition) <= 5 ? 6 - Number(product.trendSearchPosition) : 0;
    return { total: Math.min(20, keywordMatch + multiKeyword + searchPosition), keywordMatch, multiKeyword, searchPosition };
  }
  function calculateEventTiming(eventSettings = {}, now = new Date()) {
    if (!eventSettings.enabled || !eventSettings.startDate) return { score: 0, label: "" };
    const start = new Date(`${eventSettings.startDate}T00:00:00`); const end = eventSettings.endDate ? new Date(`${eventSettings.endDate}T23:59:59`) : null;
    const days = Math.ceil((start - now) / 86400000);
    if (days >= 3 && days <= 5) return { score: 8, label: "イベント開始3〜5日前" };
    if (days >= 1 && days <= 2) return { score: 7, label: "イベント開始1〜2日前" };
    if (now >= start && (!end || now <= end)) return { score: 6, label: "イベント期間中" };
    return { score: 0, label: "" };
  }
  root.RoomTrendRules = Object.freeze({ normalizeTrendText, tokenizeTrendKeyword, isTrendProductTypeToken, calculateTrendFitScore, calculateTrendReviewEvidenceScore, calculateTrendScore, calculateEventTiming });
})(typeof window !== "undefined" ? window : globalThis);
