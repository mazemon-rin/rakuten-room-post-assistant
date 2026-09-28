(function () {
  "use strict";

  const STORAGE_KEY = "roomSnsTrendDiscoveryV2";
  const GOOGLE_TRENDS_WORKER_URL = "https://rakuten-room-trends-worker.rinrin8nana.workers.dev/google-trends";
  const GOOGLE_TRENDS_SOURCE_URL = "https://trends.google.com/trending?geo=JP";
  const SOURCES = ["google_trends", "youtube", "threads", "x", "manual"];
  const SOURCE_LABELS = {
    google_trends: "Google Trends",
    youtube: "YouTube",
    threads: "Threads",
    x: "X",
    manual: "手動"
  };
  const EMPTY_STATE = { candidates: [] };

  function readState(storage = window.localStorage) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
      return parsed && Array.isArray(parsed.candidates) ? parsed : { ...EMPTY_STATE };
    } catch (error) {
      return { ...EMPTY_STATE };
    }
  }

  function writeState(state, storage = window.localStorage) {
    storage.setItem(STORAGE_KEY, JSON.stringify({ candidates: state.candidates }));
  }

  function normalizeRelatedKeywords(value) {
    const values = Array.isArray(value) ? value : String(value || "").split(/[,【】\n]/);
    return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function normalizeCandidate(input = {}) {
    const keyword = String(input.keyword || "").trim();
    const title = String(input.title || keyword).trim();
    const metrics = input.metrics && typeof input.metrics === "object" && !Array.isArray(input.metrics)
      ? { ...input.metrics }
      : {};

    if (Object.prototype.hasOwnProperty.call(metrics, "relatedKeywords")) {
      metrics.relatedKeywords = normalizeRelatedKeywords(metrics.relatedKeywords);
    }
    if (Object.prototype.hasOwnProperty.call(input, "relatedKeywords")) {
      metrics.relatedKeywords = normalizeRelatedKeywords(input.relatedKeywords);
    }
    if (Object.prototype.hasOwnProperty.call(input, "searchVolumeLabel")) {
      metrics.searchVolumeLabel = String(input.searchVolumeLabel || "").trim();
    }

    return {
      id: String(input.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      source: SOURCES.includes(input.source) ? input.source : "manual",
      keyword,
      title,
      sourceUrl: String(input.sourceUrl || "").trim(),
      detectedAt: String(input.detectedAt || new Date().toISOString()),
      observedAt: String(input.observedAt || new Date().toISOString()),
      status: ["unreviewed", "accepted", "rejected"].includes(input.status) ? input.status : "unreviewed",
      humanReviewed: input.humanReviewed === true,
      roomTrendId: input.roomTrendId ? String(input.roomTrendId) : null,
      metrics
    };
  }

  function isUnprocessedCandidate(candidate) {
    return !candidate.roomTrendId && candidate.status !== "accepted" && candidate.status !== "rejected";
  }

  function findUnprocessedDuplicate(candidate, candidates = []) {
    if (candidate.source !== "google_trends" || !candidate.keyword) return null;
    return candidates.find((item) =>
      item.id !== candidate.id &&
      item.source === "google_trends" &&
      item.keyword === candidate.keyword &&
      isUnprocessedCandidate(item)
    ) || null;
  }

  function workerError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function validateWorkerPayload(payload) {
    if (!payload || typeof payload !== "object" || payload.source !== "google_trends" || payload.region !== "JP" || !Array.isArray(payload.items)) {
      return { valid: false, code: "invalid_response", message: "Workerのレスポンス形式が不正です。" };
    }
    const validItems = payload.items.every((item) => item && typeof item === "object" && typeof item.keyword === "string" && item.keyword.trim() &&
      (item.traffic === null || typeof item.traffic === "string") &&
      (item.publishedAt === null || typeof item.publishedAt === "string") &&
      (item.pictureUrl === null || typeof item.pictureUrl === "string") &&
      (item.pictureSource === null || typeof item.pictureSource === "string") &&
      Array.isArray(item.news) && item.news.every((news) => news && typeof news === "object" &&
        (news.title === null || typeof news.title === "string") &&
        (news.url === null || typeof news.url === "string") &&
        (news.source === null || typeof news.source === "string")));
    return validItems
      ? { valid: true, payload }
      : { valid: false, code: "invalid_response", message: "Workerのトレンド項目が不正です。" };
  }

  async function fetchGoogleTrends(fetchImpl) {
    if (typeof fetchImpl !== "function") throw workerError("network_error", "Workerへ接続できません。");
    let response;
    try {
      response = await fetchImpl(GOOGLE_TRENDS_WORKER_URL, { method: "GET", headers: { Accept: "application/json" } });
    } catch (error) {
      throw workerError("network_error", "Workerへの通信に失敗しました。");
    }
    if (!response || !response.ok) throw workerError("http_error", `WorkerがHTTPエラーを返しました（${response ? response.status : "不明"}）。`);
    let payload;
    try { payload = await response.json(); } catch (error) { throw workerError("invalid_json", "WorkerのJSONを読み取れませんでした。"); }
    const validation = validateWorkerPayload(payload);
    if (!validation.valid) throw workerError(validation.code, validation.message);
    return payload;
  }

  function buildGoogleTrendsCandidateInput(item, payload, now = new Date().toISOString()) {
    const keyword = String(item?.keyword || "").trim();
    return {
      source: "google_trends",
      keyword,
      title: keyword,
      sourceUrl: GOOGLE_TRENDS_SOURCE_URL,
      detectedAt: String(item?.publishedAt || now),
      observedAt: String(payload?.fetchedAt || now),
      status: "unreviewed",
      humanReviewed: false,
      roomTrendId: null,
      metrics: {
        searchVolumeLabel: item?.traffic == null ? "" : String(item.traffic).trim(),
        relatedKeywords: []
      }
    };
  }

  function addGoogleTrendsCandidate(item, payload, state = readState(), now = new Date().toISOString()) {
    if (!item || !String(item.keyword || "").trim()) throw workerError("invalid_item", "キーワードがないため登録できません。");
    return upsertCandidate(buildGoogleTrendsCandidateInput(item, payload, now), state);
  }

  function upsertCandidate(input, state = readState()) {
    const existing = state.candidates.find((item) => item.id === input.id);
    const mergedInput = existing
      ? { ...existing, ...input, metrics: Object.prototype.hasOwnProperty.call(input, "metrics") ? input.metrics : existing.metrics }
      : input;
    const candidate = normalizeCandidate(mergedInput);
    if (!candidate.keyword && !candidate.title) throw new Error("キーワードまたはタイトルを入力してください。");
    if (!existing && findUnprocessedDuplicate(candidate, state.candidates)) {
      throw new Error("同じGoogle Trendsキーワードの未処理候補がすでにあります。");
    }
    const next = { ...state, candidates: state.candidates.slice() };
    const index = next.candidates.findIndex((item) => item.id === candidate.id);
    if (index >= 0) next.candidates[index] = candidate;
    else next.candidates.unshift(candidate);
    return { state: next, candidate };
  }

  function removeCandidate(id, state = readState()) {
    return { ...state, candidates: state.candidates.filter((item) => item.id !== id) };
  }

  function acceptCandidate(id, state, snsApi, storage = window.localStorage) {
    const target = state.candidates.find((item) => item.id === id);
    if (!target) throw new Error("トレンド候補が見つかりません。");
    if (target.roomTrendId) return { state, roomTrendId: target.roomTrendId, created: false };
    if (!snsApi || typeof snsApi.readState !== "function" || typeof snsApi.upsertProduct !== "function" || typeof snsApi.writeState !== "function") {
      throw new Error("既存SNSトレンド機能を利用できません。");
    }
    const v1State = snsApi.readState(storage);
    const duplicate = v1State.products.find((item) =>
      (target.keyword && item.keyword === target.keyword) ||
      (target.title && item.name === target.title)
    );
    const result = duplicate
      ? { state: v1State, product: duplicate }
      : snsApi.upsertProduct({ name: target.title || target.keyword, keyword: target.keyword || target.title, itemUrl: target.sourceUrl, notes: `発見元: ${target.source}` }, v1State);
    if (!duplicate) snsApi.writeState(result.state, storage);
    const next = { ...state, candidates: state.candidates.map((item) => item.id === id ? { ...item, status: "accepted", humanReviewed: true, roomTrendId: result.product.id } : item) };
    return { state: next, roomTrendId: result.product.id, created: !duplicate };
  }

  function rejectCandidate(id, state = readState()) {
    return { ...state, candidates: state.candidates.map((item) => item.id === id ? { ...item, status: "rejected", humanReviewed: true } : item) };
  }

  function escapeText(value) {
    return String(value || "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  function renderMetrics(candidate) {
    const metrics = candidate.metrics && typeof candidate.metrics === "object" ? candidate.metrics : {};
    const related = normalizeRelatedKeywords(metrics.relatedKeywords);
    const rows = [];
    if (candidate.source === "google_trends") {
      if (related.length) rows.push(`関連キーワード：${escapeText(related.join("、"))}`);
      if (metrics.searchVolumeLabel) rows.push(`検索ボリューム：${escapeText(metrics.searchVolumeLabel)}`);
      if (candidate.observedAt) rows.push(`確認日時：${escapeText(candidate.observedAt)}`);
    }
    return rows.length ? `<p class="sns-trend-meta">${rows.join("<br>")}</p>` : "";
  }

  function renderWorkerPreview(payload, state = readState()) {
    const preview = document.querySelector("#googleTrendsWorkerPreview");
    if (!preview) return;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      preview.innerHTML = "<p class=\"message\">取得できるトレンドはありません。</p>";
      return;
    }
    preview.innerHTML = items.map((item, index) => {
      const candidateInput = buildGoogleTrendsCandidateInput(item, payload);
      const duplicate = findUnprocessedDuplicate(normalizeCandidate({ ...candidateInput, id: `preview-${index}` }), state.candidates);
      const news = Array.isArray(item.news) ? item.news.slice(0, 3) : [];
      const newsHtml = news.length ? `<ul>${news.map((entry) => `<li>${escapeText(entry.title || "ニュースタイトル未取得")}</li>`).join("")}</ul>` : "<p class=\"sns-trend-meta\">関連ニュース：0件</p>";
      return `<article class="sns-trend-worker-card"><h4>${escapeText(item.keyword)}</h4><p class="sns-trend-meta">検索ボリューム：${escapeText(item.traffic || "未取得")}<br>公開日時：${escapeText(item.publishedAt || "未取得")}<br>関連ニュース：${news.length}件</p>${newsHtml}<button type="button" class="secondary-button" data-google-trends-add-index="${index}" ${duplicate ? "disabled" : ""}>${duplicate ? "登録済み" : "Discoveryへ追加"}</button></article>`;
    }).join("");
  }

  function render(state = readState()) {
    const list = document.querySelector("#snsTrendDiscoveryList");
    if (!list) return;
    list.innerHTML = state.candidates.length ? state.candidates.map((candidate) => `<article class="sns-trend-discovery-card"><div><h3>${escapeText(candidate.title || "タイトル未入力")}</h3><p class="sns-trend-meta">${escapeText(SOURCE_LABELS[candidate.source] || candidate.source)} ／ ${escapeText(candidate.keyword)}</p>${renderMetrics(candidate)}<p>状態：${escapeText(candidate.status)}${candidate.roomTrendId ? `<br>Ver.1 trend ID：${escapeText(candidate.roomTrendId)}` : ""}</p></div><div class="button-row"><button type="button" class="secondary-button" data-discovery-edit="${escapeText(candidate.id)}">編集</button><button type="button" class="primary-button" data-discovery-accept="${escapeText(candidate.id)}" ${candidate.roomTrendId || candidate.status === "rejected" ? "disabled" : ""}>採用</button><button type="button" class="secondary-button" data-discovery-reject="${escapeText(candidate.id)}" ${candidate.roomTrendId || candidate.status === "rejected" ? "disabled" : ""}>却下</button><button type="button" class="danger-button" data-discovery-delete="${escapeText(candidate.id)}">削除</button></div></article>`).join("") : "<p class=\"message\">登録したトレンド発見候補はありません。</p>";
  }

  function setField(id, value) {
    const field = document.querySelector(id);
    if (field) field.value = value || "";
  }

  function setForm(candidate = {}) {
    ["id", "source", "keyword", "title", "sourceUrl", "detectedAt", "observedAt"].forEach((key) => {
      setField(`#discovery${key[0].toUpperCase()}${key.slice(1)}`, candidate[key]);
    });
    const metrics = candidate.metrics && typeof candidate.metrics === "object" ? candidate.metrics : {};
    setField("#googleTrendsKeyword", candidate.source === "google_trends" ? candidate.keyword : "");
    setField("#googleTrendsRelatedKeywords", normalizeRelatedKeywords(metrics.relatedKeywords).join(", "));
    setField("#googleTrendsSearchVolumeLabel", metrics.searchVolumeLabel);
    setField("#googleTrendsSourceUrl", candidate.source === "google_trends" ? candidate.sourceUrl : "");
    setField("#googleTrendsObservedAt", candidate.source === "google_trends" ? candidate.observedAt : "");
  }

  function setMessage(message) {
    const node = document.querySelector("#snsTrendDiscoveryMessage");
    if (node) node.textContent = message;
  }

  function init() {
    const form = document.querySelector("#snsTrendDiscoveryForm");
    const googleForm = document.querySelector("#googleTrendsDiscoveryForm");
    const list = document.querySelector("#snsTrendDiscoveryList");
    if (!form || !list) return;
    const storage = window.localStorage;
    let state = readState(storage);
    let workerPayload = null;
    let workerLoading = false;
    render(state);

    function saveForm(formElement, sourceOverride = null) {
      const raw = Object.fromEntries(new FormData(formElement).entries());
      if (sourceOverride) raw.source = sourceOverride;
      if (sourceOverride === "google_trends") {
        raw.title = raw.title || raw.keyword;
        raw.metrics = {
          relatedKeywords: normalizeRelatedKeywords(raw.relatedKeywords),
          searchVolumeLabel: String(raw.searchVolumeLabel || "").trim()
        };
      }
      const result = upsertCandidate(raw, state);
      state = result.state;
      writeState(state, storage);
      setForm();
      render(state);
      setMessage(sourceOverride === "google_trends" ? "Google Trends候補を保存しました。" : "トレンド発見候補を保存しました。");
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try { saveForm(form); } catch (error) { setMessage(error.message); }
    });
    if (googleForm) {
      googleForm.addEventListener("submit", (event) => {
        event.preventDefault();
        try { saveForm(googleForm, "google_trends"); } catch (error) { setMessage(error.message); }
      });
    }
    document.querySelector("#discoveryClear")?.addEventListener("click", () => setForm());
    document.querySelector("#googleTrendsClear")?.addEventListener("click", () => setForm());
    const workerFetchButton = document.querySelector("#googleTrendsFetch");
    const workerMessage = document.querySelector("#googleTrendsWorkerMessage");
    workerFetchButton?.addEventListener("click", async () => {
      if (workerLoading) return;
      workerLoading = true;
      workerFetchButton.disabled = true;
      if (workerMessage) workerMessage.textContent = "取得中…";
      try {
        workerPayload = await fetchGoogleTrends(window.fetch.bind(window));
        renderWorkerPreview(workerPayload, state);
        if (workerMessage) workerMessage.textContent = workerPayload.items.length ? `取得完了：${workerPayload.items.length}件。登録する項目を選択してください。` : "取得完了：0件でした。";
      } catch (error) {
        workerPayload = null;
        const message = error?.message || "Worker取得に失敗しました。";
        if (workerMessage) workerMessage.textContent = message;
        const preview = document.querySelector("#googleTrendsWorkerPreview");
        if (preview) preview.innerHTML = "";
      } finally {
        workerLoading = false;
        workerFetchButton.disabled = false;
      }
    });
    document.querySelector("#googleTrendsWorkerPreview")?.addEventListener("click", (event) => {
      const index = event.target.dataset.googleTrendsAddIndex;
      if (index === undefined || !workerPayload || workerLoading) return;
      try {
        const result = addGoogleTrendsCandidate(workerPayload.items[Number(index)], workerPayload, state);
        state = result.state;
        writeState(state, storage);
        renderWorkerPreview(workerPayload, state);
        render(state);
        if (workerMessage) workerMessage.textContent = "Google Trends候補を1件追加しました。";
      } catch (error) {
        if (workerMessage) workerMessage.textContent = error.message;
      }
    });
    list.addEventListener("click", (event) => {
      const id = event.target.dataset.discoveryEdit || event.target.dataset.discoveryAccept || event.target.dataset.discoveryReject || event.target.dataset.discoveryDelete;
      if (!id) return;
      if (event.target.dataset.discoveryEdit) { setForm(state.candidates.find((item) => item.id === id) || {}); return; }
      try {
        if (event.target.dataset.discoveryAccept) { const result = acceptCandidate(id, state, window.snsTrend, storage); state = result.state; writeState(state, storage); setMessage(result.created ? "Ver.1のSNSトレンドへ採用しました。" : "既存のVer.1トレンドへ紐付けました。"); }
        if (event.target.dataset.discoveryReject) { state = rejectCandidate(id, state); writeState(state, storage); setMessage("候補を却下しました。"); }
        if (event.target.dataset.discoveryDelete && window.confirm("このトレンド発見候補を削除しますか？")) { state = removeCandidate(id, state); writeState(state, storage); }
        render(state);
      } catch (error) { setMessage(error.message); }
    });
  }

  window.snsTrendDiscovery = { STORAGE_KEY, SOURCES, GOOGLE_TRENDS_WORKER_URL, GOOGLE_TRENDS_SOURCE_URL, readState, writeState, normalizeRelatedKeywords, normalizeCandidate, isUnprocessedCandidate, findUnprocessedDuplicate, upsertCandidate, removeCandidate, acceptCandidate, rejectCandidate, validateWorkerPayload, fetchGoogleTrends, buildGoogleTrendsCandidateInput, addGoogleTrendsCandidate, renderWorkerPreview, render };
  document.addEventListener("DOMContentLoaded", init);
}());
