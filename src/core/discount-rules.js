(function (root) {
  "use strict";

  const DISCOUNT_RATES = Object.freeze([20, 30, 40, 50, 60, 70, 80, 90]);

  function buildDiscountSearchTerms(rate) {
    const value = Number(rate);
    if (!Number.isFinite(value)) return [];
    return [`${value}%OFF`, `${value}％OFF`, `最大${value}%OFF`, `最大${value}％OFF`, `${value}%OFFクーポン`, `${value}％OFFクーポン`, `最大${value}%OFFクーポン`, `最大${value}％OFFクーポン`];
  }

  function buildDiscountSearchTermsForMinimum(minimum) {
    const threshold = Number(minimum);
    if (!Number.isFinite(threshold)) return [];
    return DISCOUNT_RATES.filter((rate) => rate >= threshold).flatMap(buildDiscountSearchTerms);
  }

  function getCouponEvidence(item = {}) {
    const product = item.product || item;
    const rate = Number(item.discountRate ?? product.discountRate ?? item.saleRate ?? product.saleRate);
    const deadline = String(item.couponDeadline ?? product.couponDeadline ?? item.salePeriod ?? product.salePeriod ?? "").trim();
    return {
      discountRate: Number.isFinite(rate) && rate > 0 ? rate : null,
      rateConfirmed: item.rateConfirmed === true || product.rateConfirmed === true,
      discountRateType: item.discountRateType || product.discountRateType || "unknown",
      discountType: item.discountType || product.discountType || "",
      discountCondition: item.discountCondition || product.discountCondition || "",
      couponDeadline: deadline,
      deadlineConfirmed: item.deadlineConfirmed === true || product.deadlineConfirmed === true,
      couponSource: item.couponSource || product.couponSource || "",
      couponCheckedAt: item.couponCheckedAt || product.couponCheckedAt || ""
    };
  }

  function normalizeCouponCandidateText(value = "") {
    return String(value || "").normalize("NFKC").replace(/[～〜]/g, "〜").replace(/[‐‑‒–—−]/g, "-");
  }

  function extractDiscountCandidate(itemName = "") {
    const text = normalizeCouponCandidateText(itemName);
    const couponMatch = text.match(/クーポン(?:ご利用|利用|使用|適用)?[^0-9%]{0,8}(\d{1,3})\s*%\s*(?:OFF|オフ)/i);
    if (couponMatch && Number(couponMatch[1]) > 0 && Number(couponMatch[1]) <= 100 && !/最大/.test(couponMatch[0])) {
      return { discountRate: Number(couponMatch[1]), source: "itemName", discountType: "coupon", discountCondition: "クーポン利用" };
    }
    const percentMatches = [...text.matchAll(/(\d{1,3})\s*%\s*(?:OFF|オフ)/gi)];
    for (const match of percentMatches) {
      const before = text.slice(Math.max(0, match.index - 8), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 4);
      if (/(実質|ポイント)/.test(before) || /^相当/.test(after)) continue;
      const rate = Number(match[1]);
      if (rate > 0 && rate <= 100) return { discountRate: rate, source: "itemName", discountType: "sale", discountCondition: "" };
    }
    const halfIndex = text.indexOf("半額");
    if (halfIndex >= 0) {
      const before = text.slice(Math.max(0, halfIndex - 8), halfIndex);
      const after = text.slice(halfIndex + 2, halfIndex + 6);
      if (!/(最大|実質|ポイント)/.test(before) && !/^相当/.test(after)) return { discountRate: 50, source: "itemName", discountType: "sale", discountCondition: "" };
    }
    return { discountRate: null, source: "", discountType: "", discountCondition: "" };
  }

  function extractDiscountLabel(itemName = "") {
    const text = normalizeCouponCandidateText(itemName);
    const match = text.match(/((?:最大)?\d{1,3}\s*%\s*(?:OFF|オフ)(?:クーポン)?)/i);
    return match ? match[1].replace(/\s+/g, "") : "";
  }

  function parseCouponDatePart(value = "") {
    const normalized = normalizeCouponCandidateText(value).trim();
    let match = normalized.match(/^(\d{1,2})[./月](\d{1,2})日?\s*(\d{1,2}):(\d{2})$/);
    if (match) return { month: Number(match[1]), day: Number(match[2]), hour: Number(match[3]), minute: Number(match[4]) };
    match = normalized.match(/^(\d{1,2})日\s*(\d{1,2}):(\d{2})$/);
    if (match) return { month: null, day: Number(match[1]), hour: Number(match[2]), minute: Number(match[3]) };
    return null;
  }

  function formatDetectedDeadline(part, eventSettings = {}) {
    if (!part) return "";
    const eventEnd = String(eventSettings.endDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const safeEventDate = eventEnd && (part.month === null || Number(eventEnd[2]) === part.month) && Number(eventEnd[3]) === part.day;
    if (safeEventDate) return `${eventEnd[1]}/${eventEnd[2]}/${eventEnd[3]} ${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
    return `${part.month ? `${part.month}/` : ""}${part.day} ${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
  }

  function extractCouponCandidates(product = {}, eventSettings = {}) {
    const itemName = product.itemName || product.title || "";
    const discount = extractDiscountCandidate(itemName);
    const text = normalizeCouponCandidateText(itemName);
    const range = text.match(/(\d{1,2}(?:[./月]\d{1,2}日?|日)\s*\d{1,2}:\d{2})\s*〜\s*(\d{1,2}(?:[./月]\d{1,2}日?|日)\s*\d{1,2}:\d{2})/);
    let deadline = { start: "", end: "", source: "" };
    if (range) {
      const start = parseCouponDatePart(range[1]);
      const end = parseCouponDatePart(range[2]);
      if (start && end) deadline = { start: formatDetectedDeadline(start, eventSettings), end: formatDetectedDeadline(end, eventSettings), source: "itemName" };
    }
    return {
      detectedDiscountRate: discount.discountRate,
      detectedDiscountLabel: extractDiscountLabel(itemName),
      detectedDiscountSource: discount.source,
      detectedDiscountType: discount.discountType || "",
      detectedDiscountCondition: discount.discountCondition || "",
      detectedDeadline: deadline.end,
      detectedDeadlineStart: deadline.start,
      detectedDeadlineSource: deadline.source
    };
  }

  function isPriceRateConsistent(product = {}, rate) {
    const regular = Number(product.regularPrice ?? product.originalPrice ?? product.listPrice);
    const current = Number(product.salePrice ?? product.discountPrice ?? product.campaignPrice ?? product.itemPrice);
    if (!Number.isFinite(regular) || regular <= 0 || !Number.isFinite(current) || current <= 0) return true;
    const calculated = ((regular - current) / regular) * 100;
    return Math.abs(calculated - Number(rate)) <= 1;
  }

  function matchesCouponDiscountFilter(item, filters = []) {
    const evidence = getCouponEvidence(item);
    if (!evidence.rateConfirmed || evidence.discountRateType === "up_to" || !Number.isFinite(evidence.discountRate)) return false;
    return filters.some((filter) => evidence.discountRate >= (filter === "50plus" ? 50 : Number(filter)));
  }

  function evaluateDealStatus(product = {}, dealCondition = "") {
    const evidence = getCouponEvidence(product);
    const detected = extractCouponCandidates(product);
    const threshold = dealCondition === "50plus" ? 50 : Number(dealCondition);
    const hasCondition = dealCondition === "50plus" || Number.isFinite(threshold) && threshold > 0;
    if (!hasCondition) return { status: "unknown", rate: null, label: "お買い得情報：指定なし" };
    if (detected.detectedDiscountType === "coupon" && Number.isFinite(detected.detectedDiscountRate) && detected.detectedDiscountRate >= threshold) {
      return { status: "confirmed", rate: detected.detectedDiscountRate, label: `🟢 クーポン利用で${detected.detectedDiscountRate}%OFF確認済み` };
    }
    if (evidence.rateConfirmed && evidence.discountRateType === "exact" && Number.isFinite(evidence.discountRate)) {
      const meets = evidence.discountRate >= threshold;
      if (meets && !isPriceRateConsistent(product, evidence.discountRate)) return { status: "unknown", rate: evidence.discountRate, label: `割引率${evidence.discountRate}%（価格情報と不整合）` };
      const label = product.confirmedDiscountLabel || `${evidence.discountRate}%OFF`;
      return { status: meets ? "confirmed" : "unknown", rate: evidence.discountRate, label: meets ? `🟢 ${label}確認済み` : `割引率${evidence.discountRate}%（条件未達）` };
    }
    if (Number.isFinite(detected.detectedDiscountRate) && detected.detectedDiscountRate >= threshold) {
      return { status: "candidate", rate: detected.detectedDiscountRate, label: `🟡 ${detected.detectedDiscountLabel || `${detected.detectedDiscountRate}%OFF`}候補・要確認` };
    }
    return { status: "unknown", rate: null, label: "割引情報不明" };
  }

  function summarizeDealStatuses(products = []) {
    return products.reduce((summary, product) => {
      const status = product.dealStatus?.status || "unknown";
      if (status === "confirmed") summary.confirmed += 1;
      else if (status === "candidate") summary.candidate += 1;
      else summary.unknown += 1;
      return summary;
    }, { confirmed: 0, candidate: 0, unknown: 0 });
  }

  function prepareCouponSearchProduct(product, searchFilters = [], eventSettings = {}) {
    const evidence = getCouponEvidence(product);
    const detected = extractCouponCandidates(product, eventSettings);
    return {
      ...product,
      couponCandidate: true,
      couponSearchFilters: searchFilters,
      discountRate: evidence.discountRate,
      rateConfirmed: evidence.rateConfirmed,
      discountRateType: evidence.discountRateType,
      couponDeadline: evidence.couponDeadline,
      deadlineConfirmed: evidence.deadlineConfirmed,
      couponSource: evidence.couponSource || "楽天商品検索API（検索候補）",
      couponCheckedAt: evidence.couponCheckedAt,
      ...detected
    };
  }

  function buildDealHeader(product = {}, formatYen = (value) => `${Number(value).toLocaleString("ja-JP")}円`) {
    const evidence = getCouponEvidence(product);
    const detected = extractCouponCandidates(product);
    const labelRate = String(product.confirmedDiscountLabel || product.discountLabel || "").match(/(\d{1,3})\s*%\s*(?:OFF|オフ)/i);
    const rate = Number.isFinite(evidence.discountRate)
      ? evidence.discountRate
      : (detected.detectedDiscountRate ?? (labelRate ? Number(labelRate[1]) : null));
    const discountType = evidence.discountType || detected.detectedDiscountType;
    const discountCondition = evidence.discountCondition || detected.detectedDiscountCondition;
    const exactConfirmed = evidence.rateConfirmed && evidence.discountRateType === "exact" && Number.isFinite(rate) && isPriceRateConsistent(product, rate);
    const conditionalConfirmed = discountType === "coupon" && Boolean(discountCondition) && Number.isFinite(rate);
    const label = exactConfirmed || conditionalConfirmed
      ? (conditionalConfirmed
        ? `${discountCondition}で${rate}%OFF`
        : (String(product.confirmedDiscountLabel || product.discountLabel || "").trim() || `${rate}%OFF`))
      : "";
    if (!label) return "";
    const regular = Number(product.regularPrice ?? product.originalPrice ?? product.listPrice);
    const current = Number(product.salePrice ?? product.discountPrice ?? product.campaignPrice ?? product.itemPrice);
    const pricePart = Number.isFinite(regular) && regular > 0 && Number.isFinite(current) && current > 0
      ? `${formatYen(regular)}→${formatYen(current)}🉐 `
      : "🉐 ";
    const deadline = evidence.deadlineConfirmed && evidence.couponDeadline ? `\n${evidence.couponDeadline}まで` : "";
    return `${pricePart}${label}${deadline}`;
  }

  root.discountRules = Object.freeze({
    DISCOUNT_RATES,
    buildDiscountSearchTerms,
    buildDiscountSearchTermsForMinimum,
    getCouponEvidence,
    normalizeCouponCandidateText,
    extractDiscountCandidate,
    extractDiscountLabel,
    parseCouponDatePart,
    formatDetectedDeadline,
    extractCouponCandidates,
    matchesCouponDiscountFilter,
    evaluateDealStatus,
    summarizeDealStatuses,
    prepareCouponSearchProduct,
    buildDealHeader,
    isPriceRateConsistent
  });
})(typeof window === "undefined" ? globalThis : window);
