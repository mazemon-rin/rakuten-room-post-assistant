(function () {
  "use strict";

  const STORAGE_KEY = "roomSnsTrendDiscoveryV2";
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

  window.snsTrendDiscovery = { STORAGE_KEY, SOURCES, readState, writeState, normalizeRelatedKeywords, normalizeCandidate, isUnprocessedCandidate, findUnprocessedDuplicate, upsertCandidate, removeCandidate, acceptCandidate, rejectCandidate, render };
  document.addEventListener("DOMContentLoaded", init);
}());
