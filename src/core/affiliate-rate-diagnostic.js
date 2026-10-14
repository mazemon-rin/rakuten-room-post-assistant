(function exposeAffiliateRateDiagnostic(root) {
  "use strict";

  const ITEM_CODE = "sunshine-osaka:kuro50-siso50";
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

  function buildDiagnosticParams(applicationId, minAffiliateRate) {
    const params = new URLSearchParams({
      format: "json",
      applicationId,
      itemCode: ITEM_CODE,
      hits: "1"
    });
    if (minAffiliateRate != null) params.set("minAffiliateRate", String(minAffiliateRate));
    return params;
  }

  async function runDiagnostic({ applicationId, accessKey, fetchImpl, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
    if (!applicationId || !accessKey) throw new Error("楽天API認証情報が未設定です。");
    if (typeof fetchImpl !== "function") throw new Error("API通信機能を利用できません。");

    const results = [];
    for (const minimum of [null, 5]) {
      if (results.length) await wait(1200);
      try {
        const params = buildDiagnosticParams(applicationId, minimum);
        const response = await fetchImpl(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json", accessKey }
        });
        let payload = {};
        try { payload = await response.json(); } catch { /* HTTP statusだけを表示し、生レスポンスは露出しない */ }
        results.push({ condition: minimum == null ? "minAffiliateRate指定なし" : "minAffiliateRate=5", ...summarizeResponse(response.status, payload) });
      } catch (error) {
        // Fetch例外の文面にはURL等が含まれる可能性があるため、詳細は表示・記録しない。
        results.push({ condition: minimum == null ? "minAffiliateRate指定なし" : "minAffiliateRate=5", state: "api_error", httpStatus: null, apiCount: null, fetchedCount: 0, targetFound: false, affiliateRate: null, affiliateRateType: "unavailable", errorType: error?.name === "TypeError" ? "network_error" : "request_error" });
      }
    }
    return results;
  }

  root.AffiliateRateDiagnostic = Object.freeze({ ITEM_CODE, summarizeResponse, buildDiagnosticParams, getSafeApiErrorCode, runDiagnostic });
})(typeof window !== "undefined" ? window : globalThis);
