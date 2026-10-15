(function exposeAffiliateRateDiagnostic(root) {
  "use strict";

  const ITEM_CODE = "sunshine-osaka:kuro50-siso50";
  const CONDITIONS = Object.freeze([
    Object.freeze({ id: "A", label: "A：keyword=しそ餃子 / 料率指定なし", searchType: "keyword", keyword: "しそ餃子", minAffiliateRate: null, hits: 30 }),
    Object.freeze({ id: "B", label: "B：対象itemCode / 料率指定なし", searchType: "itemCode", keyword: "", minAffiliateRate: null, hits: 1 }),
    Object.freeze({ id: "C", label: "C：keyword=しそ餃子 / minAffiliateRate=5", searchType: "keyword", keyword: "しそ餃子", minAffiliateRate: 5, hits: 30 }),
    Object.freeze({ id: "D", label: "D：対象itemCode / minAffiliateRate=5", searchType: "itemCode", keyword: "", minAffiliateRate: 5, hits: 1 }),
    Object.freeze({ id: "E", label: "E：対象shopCode / hits=30", searchType: "shopCode", shopCode: "sunshine-osaka", minAffiliateRate: null, hits: 30 })
  ]);
  const MIN_REQUEST_INTERVAL_MS = 1200;
  let requestQueue = Promise.resolve();
  let lastRequestStartedAt = 0;
  // 楽天公式ドキュメントに掲載されているコードだけを診断表示に使います。
  const SAFE_API_ERROR_CODES = new Set([
    "wrong_parameter",
    "not_found",
    "too_many_requests",
    "system_error",
    "service_unavailable"
  ]);

  function getSafeApiErrorCode(payload) {
    const value = typeof payload?.error === "string" ? payload.error
      : typeof payload?.Error === "string" ? payload.Error
        : "";
    return SAFE_API_ERROR_CODES.has(value) ? value : null;
  }

  function getSafeApiErrorReason(payload) {
    const description = typeof payload?.error_description === "string" ? payload.error_description : "";
    const parameterLabels = {
      applicationId: "applicationId", accessKey: "Access Key", keyword: "keyword",
      itemCode: "itemCode", shopCode: "shopCode", genreId: "genreId", hits: "hits",
      page: "page", sort: "sort", minAffiliateRate: "minAffiliateRate", format: "format", affiliateId: "affiliateId"
    };
    const parameterNames = Object.keys(parameterLabels).join("|");
    let match = description.match(new RegExp(`^\\s*(${parameterNames})\\s+parameter\\s+is\\s+not\\s+valid\\b`, "i"));
    if (match) {
      const key = Object.keys(parameterLabels).find((name) => name.toLowerCase() === match[1].toLowerCase());
      return `${parameterLabels[key]}パラメータが無効です。`;
    }
    match = description.match(new RegExp(`^\\s*specify\\s+valid\\s+(${parameterNames})\\b`, "i"));
    if (match) {
      const key = Object.keys(parameterLabels).find((name) => name.toLowerCase() === match[1].toLowerCase());
      return `${parameterLabels[key]}が有効ではありません。`;
    }
    match = description.match(new RegExp(`^\\s*(${parameterNames})\\s+must\\s+be\\s+(?:a\\s+)?number\\b`, "i"));
    if (match) {
      const key = Object.keys(parameterLabels).find((name) => name.toLowerCase() === match[1].toLowerCase());
      return `${parameterLabels[key]}は数値で指定してください。`;
    }
    return "詳細不明（APIのパラメータエラー）";
  }

  function getResponseItems(payload) {
    return Array.isArray(payload?.Items) ? payload.Items : Array.isArray(payload?.items) ? payload.items : [];
  }

  function getProductData(entry) {
    return entry?.Item || entry?.item || entry || {};
  }

  function parseAffiliateRate(rawRate, hasRate) {
    if (!hasRate || rawRate == null || (typeof rawRate === "string" && rawRate.trim() === "")) {
      return { status: "unavailable", value: null };
    }
    let value;
    if (typeof rawRate === "number") value = rawRate;
    else if (typeof rawRate === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawRate.trim())) value = Number(rawRate.trim());
    else return { status: "invalid", value: null };
    if (!Number.isFinite(value) || value < 0 || value > 100) return { status: "invalid", value: null };
    return { status: "valid", value };
  }

  function summarizeAffiliateRateDistribution(payload) {
    const entries = getResponseItems(payload);
    const buckets = { below1: 0, from1To2: 0, from2To3: 0, from3To4: 0, from4To5: 0, from5: 0, unavailable: 0, invalid: 0 };
    const dataTypes = { number: 0, string: 0, null: 0, undefined: 0, boolean: 0, object: 0, other: 0 };
    const validRates = [];
    for (const entry of entries) {
      const product = getProductData(entry);
      const hasRate = Object.prototype.hasOwnProperty.call(product, "affiliateRate");
      const rawRate = product.affiliateRate;
      const type = rawRate === null ? "null" : rawRate === undefined ? "undefined" : typeof rawRate;
      dataTypes[Object.hasOwn(dataTypes, type) ? type : "other"] += 1;
      const parsed = parseAffiliateRate(rawRate, hasRate);
      if (parsed.status === "unavailable") buckets.unavailable += 1;
      else if (parsed.status === "invalid") buckets.invalid += 1;
      else {
        const rate = parsed.value;
        validRates.push(rate);
        if (rate < 1) buckets.below1 += 1;
        else if (rate < 2) buckets.from1To2 += 1;
        else if (rate < 3) buckets.from2To3 += 1;
        else if (rate < 4) buckets.from3To4 += 1;
        else if (rate < 5) buckets.from4To5 += 1;
        else buckets.from5 += 1;
      }
    }
    const sum = validRates.reduce((total, rate) => total + rate, 0);
    return {
      fetchedCount: entries.length,
      classifiedCount: Object.values(buckets).reduce((total, count) => total + count, 0),
      buckets,
      dataTypes,
      minimum: validRates.length ? Math.min(...validRates) : null,
      maximum: validRates.length ? Math.max(...validRates) : null,
      average: validRates.length ? sum / validRates.length : null,
      validCount: validRates.length
    };
  }

  function summarizeResponse(status, payload, itemCode = ITEM_CODE) {
    const apiError = payload?.error || payload?.error_description || payload?.Error || null;
    const errorCode = getSafeApiErrorCode(payload);
    const entries = getResponseItems(payload);
    const item = entries.map(getProductData).find((product) => product?.itemCode === itemCode) || null;
    const rawRate = item?.affiliateRate;
    const count = payload?.count ?? payload?.Count;
    const hasCount = count != null && String(count).trim() !== "" && Number.isFinite(Number(count));
    const malformed = !apiError && status >= 200 && status < 300 && (!hasCount || (!Array.isArray(payload?.Items) && !Array.isArray(payload?.items)));
    const normalZero = !apiError && !malformed && status >= 200 && status < 300 && Number(count) === 0 && entries.length === 0;
    return {
      state: apiError || malformed || status < 200 || status >= 300 ? "api_error" : normalZero ? "zero_results" : "success",
      httpStatus: Number.isFinite(Number(status)) ? Number(status) : null,
      errorCode,
      apiCount: payload?.count ?? payload?.Count ?? null,
      fetchedCount: entries.length,
      targetFound: Boolean(item),
      affiliateRate: item ? (rawRate ?? null) : null,
      affiliateRateType: item && rawRate != null ? typeof rawRate : "unavailable",
      product: item ? {
        itemCode: item.itemCode,
        itemName: typeof item.itemName === "string" ? item.itemName : "",
        itemPrice: Number.isFinite(Number(item.itemPrice)) ? Number(item.itemPrice) : null,
        itemUrl: typeof item.itemUrl === "string" ? item.itemUrl : "",
        shopName: typeof item.shopName === "string" ? item.shopName : "",
        hasMediumImageUrl: Array.isArray(item.mediumImageUrls) && item.mediumImageUrls.some((image) => typeof image?.imageUrl === "string" && image.imageUrl.length > 0)
      } : null
    };
  }

  function buildDiagnosticParams(applicationId, accessKey, conditionId, page = 1) {
    const condition = CONDITIONS.find((item) => item.id === conditionId);
    if (!condition) throw new Error("診断条件が不正です。");
    const params = new URLSearchParams({
      format: "json",
      applicationId,
      accessKey,
      hits: String(condition.hits)
    });
    if (condition.searchType === "keyword") params.set("keyword", condition.keyword);
    else if (condition.searchType === "shopCode") params.set("shopCode", condition.shopCode);
    else params.set("itemCode", ITEM_CODE);
    if (condition.minAffiliateRate != null) params.set("minAffiliateRate", String(condition.minAffiliateRate));
    if (conditionId === "E") params.set("page", String(page));
    return params;
  }

  function getUniqueProductEntries(entries) {
    const seenItemCodes = new Set();
    return entries.filter((entry) => {
      const itemCode = getProductData(entry)?.itemCode;
      // itemCodeを確認できない行は、重複のない商品として全件確認数に加えない。
      if (typeof itemCode !== "string" || itemCode.trim() === "") return false;
      if (seenItemCodes.has(itemCode)) return false;
      seenItemCodes.add(itemCode);
      return true;
    });
  }

  function createRequestError(condition, error) {
    return {
      conditionId: condition.id,
      condition: condition.label,
      state: "api_error",
      httpStatus: null,
      apiCount: null,
      fetchedCount: 0,
      targetFound: false,
      affiliateRate: null,
      affiliateRateType: "unavailable",
      errorCode: null,
      errorType: error?.name === "TypeError" ? "network_error" : "request_error"
    };
  }

  async function runDiagnosticCondition({ applicationId, accessKey, conditionId, fetchImpl, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now() }) {
    if (!applicationId || !accessKey) throw new Error("楽天API認証情報が未設定です。");
    if (typeof fetchImpl !== "function") throw new Error("API通信機能を利用できません。");
    const condition = CONDITIONS.find((item) => item.id === conditionId);
    if (!condition) throw new Error("診断条件が不正です。");
    const execute = async () => {
      const requestPage = async (page) => {
        while (lastRequestStartedAt && now() - lastRequestStartedAt < MIN_REQUEST_INTERVAL_MS) {
          await wait(MIN_REQUEST_INTERVAL_MS - (now() - lastRequestStartedAt));
        }
        lastRequestStartedAt = now();
        try {
          const params = buildDiagnosticParams(applicationId, accessKey, conditionId, page);
          const response = await fetchImpl(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`, {
            method: "GET",
            headers: { Accept: "application/json" }
          });
          let payload = {};
          try { payload = await response.json(); } catch { /* 生レスポンスは露出しない */ }
          const summary = summarizeResponse(response.status, payload);
          return {
            summary,
            entries: getResponseItems(payload),
            payload,
            responsePage: Number.isFinite(Number(payload?.page ?? payload?.Page)) ? Number(payload.page ?? payload.Page) : null,
            pageCount: Number.isFinite(Number(payload?.pageCount ?? payload?.PageCount)) ? Number(payload.pageCount ?? payload.PageCount) : null,
            ...(summary.state === "api_error" ? { safeErrorReason: getSafeApiErrorReason(payload) } : {})
          };
        } catch (error) {
          return { summary: createRequestError(condition, error), entries: [], payload: {} };
        }
      };

      const firstPage = await requestPage(1);
      if (conditionId === "E") {
        const pageOne = firstPage.summary;
        const initialEntries = firstPage.entries;
        const firstUniqueEntries = getUniqueProductEntries(initialEntries);
        const firstTarget = firstUniqueEntries.some((entry) => getProductData(entry)?.itemCode === ITEM_CODE);
        const apiCount = Number(pageOne.apiCount);
        const needsSecondPage = pageOne.state !== "api_error" && !firstTarget && Number.isFinite(apiCount) && apiCount > 30;
        const firstPageNumberMatches = firstPage.responsePage === 1;
        const expectedPageCount = Number.isFinite(apiCount) ? Math.ceil(apiCount / 30) : null;

        if (pageOne.state === "api_error" || !needsSecondPage) {
          const scanComplete = pageOne.state !== "api_error"
            && Number.isFinite(apiCount)
            && firstPageNumberMatches
            && (apiCount === 0
              ? firstUniqueEntries.length === 0
              : firstPage.pageCount === expectedPageCount && expectedPageCount === 1 && firstUniqueEntries.length === apiCount);
          return {
            ...pageOne,
            conditionId,
            condition: condition.label,
            fetchedCount: initialEntries.length,
            uniqueFetchedCount: firstUniqueEntries.length,
            pagesChecked: 1,
            pagesToCheck: needsSecondPage ? 2 : 1,
            responsePage: firstPage.responsePage,
            pageCount: firstPage.pageCount,
            scanComplete
          };
        }

        const secondPage = await requestPage(2);
        const allEntries = initialEntries.concat(secondPage.entries);
        const uniqueEntries = getUniqueProductEntries(allEntries);
        const mergedPayload = { count: pageOne.apiCount, Items: uniqueEntries };
        const combined = summarizeResponse(secondPage.summary.httpStatus, mergedPayload);
        const countsMatch = Number(secondPage.summary.apiCount) === apiCount;
        const scanComplete = secondPage.summary.state !== "api_error"
          && countsMatch
          && firstPageNumberMatches
          && secondPage.responsePage === 2
          && firstPage.pageCount === expectedPageCount
          && secondPage.pageCount === firstPage.pageCount
          && expectedPageCount === 2
          && uniqueEntries.length === apiCount;

        return {
          ...combined,
          ...(secondPage.summary.state === "api_error" ? {
            state: "api_error",
            errorCode: secondPage.summary.errorCode,
            errorType: secondPage.summary.errorType,
            safeErrorReason: secondPage.safeErrorReason
          } : {}),
          conditionId,
          condition: condition.label,
          httpStatus: secondPage.summary.httpStatus,
          apiCount: pageOne.apiCount,
          fetchedCount: allEntries.length,
          uniqueFetchedCount: uniqueEntries.length,
          pagesChecked: secondPage.summary.state === "api_error" ? 1 : 2,
          pagesAttempted: 2,
          pagesToCheck: 2,
          responsePage: secondPage.responsePage,
          pageCount: secondPage.pageCount,
          scanComplete
        };
      }

      const { summary, payload } = firstPage;
      return {
        conditionId,
        condition: condition.label,
        ...summary,
        ...(summary.state === "api_error" ? { safeErrorReason: getSafeApiErrorReason(payload) } : {}),
        ...(conditionId === "A" && summary.state !== "api_error" ? { rateDistribution: summarizeAffiliateRateDistribution(payload) } : {})
      };
    };
    const pending = requestQueue.then(execute, execute);
    requestQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  root.AffiliateRateDiagnostic = Object.freeze({ ITEM_CODE, CONDITIONS, summarizeResponse, summarizeAffiliateRateDistribution, buildDiagnosticParams, getSafeApiErrorCode, getSafeApiErrorReason, runDiagnosticCondition });
})(typeof window !== "undefined" ? window : globalThis);
