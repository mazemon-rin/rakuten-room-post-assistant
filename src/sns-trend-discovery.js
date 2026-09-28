(function () {
  "use strict";

  const STORAGE_KEY = "roomSnsTrendDiscoveryV2";
  const SOURCES = ["google_trends", "youtube", "threads", "x", "manual"];
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

  function normalizeCandidate(input = {}) {
    const keyword = String(input.keyword || "").trim();
    const title = String(input.title || keyword).trim();
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
      metrics: input.metrics && typeof input.metrics === "object" ? { ...input.metrics } : {}
    };
  }

  function upsertCandidate(input, state = readState()) {
    const candidate = normalizeCandidate(input);
    if (!candidate.keyword && !candidate.title) throw new Error("キーワードまたはタイトルを入力してください。");
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

  function escapeText(value) { return String(value || "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[character])); }
  function render(state = readState()) {
    const list = document.querySelector("#snsTrendDiscoveryList");
    if (!list) return;
    list.innerHTML = state.candidates.length ? state.candidates.map((candidate) => `<article class="sns-trend-discovery-card"><div><h3>${escapeText(candidate.title || "タイトル未入力")}</h3><p class="sns-trend-meta">${escapeText(candidate.source)} ／ ${escapeText(candidate.keyword)}</p><p>状態：${escapeText(candidate.status)}${candidate.roomTrendId ? `<br>Ver.1 trend ID：${escapeText(candidate.roomTrendId)}` : ""}</p></div><div class="button-row"><button type="button" class="secondary-button" data-discovery-edit="${escapeText(candidate.id)}">編集</button><button type="button" class="primary-button" data-discovery-accept="${escapeText(candidate.id)}" ${candidate.roomTrendId || candidate.status === "rejected" ? "disabled" : ""}>採用</button><button type="button" class="secondary-button" data-discovery-reject="${escapeText(candidate.id)}" ${candidate.roomTrendId || candidate.status === "rejected" ? "disabled" : ""}>却下</button><button type="button" class="danger-button" data-discovery-delete="${escapeText(candidate.id)}">削除</button></div></article>`).join("") : "<p class=\"message\">登録したトレンド発見候補はありません。</p>";
  }

  function setForm(candidate = {}) {
    ["id", "source", "keyword", "title", "sourceUrl", "detectedAt", "observedAt"].forEach((key) => {
      const field = document.querySelector(`#discovery${key[0].toUpperCase()}${key.slice(1)}`);
      if (field) field.value = candidate[key] || "";
    });
  }

  function init() {
    const form = document.querySelector("#snsTrendDiscoveryForm");
    if (!form) return;
    const storage = window.localStorage;
    let state = readState(storage);
    render(state);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const result = upsertCandidate(Object.fromEntries(new FormData(form).entries()), state);
        state = result.state;
        writeState(state, storage);
        setForm();
        render(state);
        document.querySelector("#snsTrendDiscoveryMessage").textContent = "トレンド発見候補を保存しました。";
      } catch (error) { document.querySelector("#snsTrendDiscoveryMessage").textContent = error.message; }
    });
    document.querySelector("#snsTrendDiscoveryList").addEventListener("click", (event) => {
      const id = event.target.dataset.discoveryEdit || event.target.dataset.discoveryAccept || event.target.dataset.discoveryReject || event.target.dataset.discoveryDelete;
      if (!id) return;
      if (event.target.dataset.discoveryEdit) { setForm(state.candidates.find((item) => item.id === id) || {}); return; }
      try {
        if (event.target.dataset.discoveryAccept) { const result = acceptCandidate(id, state, window.snsTrend, storage); state = result.state; writeState(state, storage); document.querySelector("#snsTrendDiscoveryMessage").textContent = result.created ? "Ver.1のSNSトレンドへ採用しました。" : "既存のVer.1トレンドへ紐付けました。"; }
        if (event.target.dataset.discoveryReject) { state = rejectCandidate(id, state); writeState(state, storage); document.querySelector("#snsTrendDiscoveryMessage").textContent = "候補を却下しました。"; }
        if (event.target.dataset.discoveryDelete && window.confirm("このトレンド発見候補を削除しますか？")) { state = removeCandidate(id, state); writeState(state, storage); }
        render(state);
      } catch (error) { document.querySelector("#snsTrendDiscoveryMessage").textContent = error.message; }
    });
  }

  window.snsTrendDiscovery = { STORAGE_KEY, SOURCES, readState, writeState, normalizeCandidate, upsertCandidate, removeCandidate, acceptCandidate, rejectCandidate, render };
  document.addEventListener("DOMContentLoaded", init);
}());
