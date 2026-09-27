(function exposeRoomRankingRules(root) {
  "use strict";

  function getRankingRange(rankStart, count) {
    const start = Math.max(1, Number(rankStart) || 1);
    return { start, end: Math.min(50, start + Math.max(1, Number(count) || 10) - 1) };
  }

  function getRankingPageForRange(rankStart) {
    return Number(rankStart) >= 31 ? 2 : 1;
  }

  function getRankingPagesForRange(rankStart, count) {
    const start = Math.max(1, Number(rankStart) || 1);
    const end = Math.min(50, start + Math.max(1, Number(count) || 10) - 1);
    if (start <= 30 && end > 30) return [1, 2];
    return [start >= 31 ? 2 : 1];
  }

  function getRankingRequestInterval(categoryCount) {
    return categoryCount >= 4 ? 1800 : 1200;
  }

  function applyOfficialRankingRank(product = {}) {
    const officialRank = Number(product.rank);
    if (!Number.isFinite(officialRank) || officialRank <= 0) {
      return { ...product, apiRank: null, sourceRank: null, rank: null };
    }
    return { ...product, apiRank: officialRank, sourceRank: officialRank, rank: officialRank };
  }

  function calculateRankingScore(product = {}) {
    const sourceRank = Number(product.sourceRank ?? product.rank);
    if (!Number.isFinite(sourceRank) || sourceRank <= 0) return 0;
    if (sourceRank === 1) return 30;
    if (sourceRank === 2) return 27;
    if (sourceRank === 3) return 24;
    if (sourceRank <= 10) return 20;
    if (sourceRank <= 20) return 15;
    return 10;
  }

  function extractRakutenApiErrorDetail(rawBody) {
    if (!rawBody) return "HTTPエラー";
    try {
      const errorBody = JSON.parse(rawBody);
      return errorBody.error_description || errorBody.error || errorBody.message || rawBody.slice(0, 240);
    } catch {
      return rawBody.slice(0, 240);
    }
  }

  root.RoomRankingRules = Object.freeze({ getRankingRange, getRankingPageForRange, getRankingPagesForRange, getRankingRequestInterval, applyOfficialRankingRank, calculateRankingScore, extractRakutenApiErrorDetail });
})(typeof window !== "undefined" ? window : globalThis);
