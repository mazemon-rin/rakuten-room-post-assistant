(function exposeAffiliateRateDiagnostic(root) {
  "use strict";

  const ITEM_CODE = "sunshine-osaka:kuro50-siso50";
  const CONDITIONS = Object.freeze([
    Object.freeze({ id: "A", label: "A：keyword=しそ餃子 / 料率指定なし", searchType: "keyword", keyword: "しそ餃子", minAffiliateRate: null, hits: 30 }),
    Object.freeze({ id: "B", label: "B：対象itemCode / 料率指定なし", searchType: "itemCode", keyword: "", minAffiliateRate: null, hits: 1 }),
    Object.freeze({ id: "C", label: "C：keyword=しそ餃子 / minAffiliateRate=5", searchType: "keyword", keyword: "しそ餃子", minAffiliateRate: 5, hits: 30 }),
    Object.freeze({ id: "D", label: "D：対象itemCode / minAffiliateRate=5", searchType: "itemCode", keyword: "", minAffiliateRate: 5, hits: 1 })
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

  function summarizeResponse(status, payload, itemCode = ITEM_CODE) {
    const apiError = payload?.error || payload?.error_description || payload?.Error || null;
    const errorCode = getSafeApiErrorCode(payload);
    const entries = Array.isArray(payload?.Items) ? payload.Items : Array.isArray(payload?.items) ? payload.items : [];
    const item = entries.find((entry) => entry?.itemCode === itemCode) || null;
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
      affiliateRateType: item && rawRate != null ? typeof rawRate : "unavailable"
    };
  }

  function buildDiagnosticParams(applicationId, accessKey, conditionId) {
    const condition = CONDITIONS.find((item) => item.id === conditionId);
    if (!condition) throw new Error("診断条件が不正です。");
    const params = new URLSearchParams({
      format: "json",
      applicationId,
      accessKey,
      hits: String(condition.hits)
    });
    if (condition.searchType === "keyword") params.set("keyword", condition.keyword);
    else params.set("itemCode", ITEM_CODE);
    if (condition.minAffiliateRate != null) params.set("minAffiliateRate", String(condition.minAffiliateRate));
    return params;
  }

  async function runDiagnosticCondition({ applicationId, accessKey, conditionId, fetchImpl, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now() }) {
    if (!applicationId || !accessKey) throw new Error("楽天API認証情報が未設定です。");
    if (typeof fetchImpl !== "function") throw new Error("API通信機能を利用できません。");
    const condition = CONDITIONS.find((item) => item.id === conditionId);
    if (!condition) throw new Error("診断条件が不正です。");
    const execute = async () => {
      while (lastRequestStartedAt && now() - lastRequestStartedAt < MIN_REQUEST_INTERVAL_MS) {
        await wait(MIN_REQUEST_INTERVAL_MS - (now() - lastRequestStartedAt));
      }
      lastRequestStartedAt = now();
      try {
        const params = buildDiagnosticParams(applicationId, accessKey, conditionId);
        const response = await fetchImpl(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" }
        });
        let payload = {};
        try { payload = await response.json(); } catch { /* HTTP statusだけを返し、生レスポンスは露出しない */ }
        return { conditionId, condition: condition.label, ...summarizeResponse(response.status, payload) };
      } catch (error) {
        // Fetch例外の文面にはURL等が含まれる可能性があるため、詳細は表示・記録しない。
        return { conditionId, condition: condition.label, state: "api_error", httpStatus: null, apiCount: null, fetchedCount: 0, targetFound: false, affiliateRate: null, affiliateRateType: "unavailable", errorCode: null, errorType: error?.name === "TypeError" ? "network_error" : "request_error" };
      }
    };
    const pending = requestQueue.then(execute, execute);
    requestQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  root.AffiliateRateDiagnostic = Object.freeze({ ITEM_CODE, CONDITIONS, summarizeResponse, buildDiagnosticParams, getSafeApiErrorCode, runDiagnosticCondition });
})(typeof window !== "undefined" ? window : globalThis);
