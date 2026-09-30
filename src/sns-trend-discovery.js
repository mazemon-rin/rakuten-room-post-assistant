(function () {
  "use strict";

  const STORAGE_KEY = "roomSnsTrendDiscoveryV2";
  const GOOGLE_TRENDS_WORKER_URL = "https://rakuten-room-trends-worker.rinrin8nana.workers.dev/google-trends";
  const YOUTUBE_SEARCH_WORKER_URL = "https://rakuten-room-trends-worker.rinrin8nana.workers.dev/youtube-search";
  const WEB_SEARCH_WORKER_URL = "https://rakuten-room-trends-worker.rinrin8nana.workers.dev/web-search";
  const YAHOO_SHOPPING_RANKING_WORKER_URL = "https://rakuten-room-trends-worker.rinrin8nana.workers.dev/yahoo-shopping-ranking?type=up";
  const GOOGLE_TRENDS_SOURCE_URL = "https://trends.google.com/trending?geo=JP";
  const SOURCES = ["google_trends", "youtube", "yahoo_shopping_keyword", "threads", "x", "manual"];
  const SOURCE_LABELS = {
    google_trends: "Google Trends",
    youtube: "YouTube",
    yahoo_shopping_keyword: "Yahoo!ショッピング急上昇",
    threads: "Threads",
    x: "X",
    manual: "手動"
  };
  const ROOM_PRODUCT_TERMS = ["ps5", "iphone", "ipad", "android", "nintendo", "switch", "ゲーム機", "家電", "スマホ", "パソコン", "pc", "周辺機器", "食品", "飲料", "日用品", "コスメ", "化粧品", "ファッション", "ブランド", "無印良品", "玩具", "おもちゃ", "書籍", "季節用品", "ミスタードーナツ"];
  const ROOM_CONTEXT_TERMS = ["収納", "防災", "花粉", "暑さ対策", "旅行", "新生活", "ハロウィン", "クリスマス", "節電", "防寒"];
  const EXCLUDED_TREND_TERMS = ["事故", "事件", "犯罪", "死亡", "死去", "訃報", "病気", "インフルエンザ", "入院", "逮捕", "選挙", "政治", "議員", "大臣", "災害", "速報", "炎上", "人物ニュース", "教授", "俳優", "タレント", "選手", "駅"];
  const EMPTY_STATE = { candidates: [] };
  const RAKUTEN_ITEM_SEARCH_URL = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
  const ROOM_TREND_PHASE_TWO_REQUIRED_KEYS = ["theme", "reason", "purchaseWindow", "categories", "rakutenQueries", "purchaseIntent", "confidence", "sourceKeywords"];
  const ROOM_TREND_PHASE_TWO_STORAGE_KEY = "roomTrendPhaseTwoV1";

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

  function isAcceptedCandidate(candidate) {
    return Boolean(candidate?.roomTrendId) || candidate?.status === "accepted";
  }

  function findUnprocessedDuplicate(candidate, candidates = []) {
    if (!["google_trends", "youtube", "yahoo_shopping_keyword"].includes(candidate.source) || !candidate.keyword) return null;
    return candidates.find((item) =>
      item.id !== candidate.id &&
      item.source === candidate.source &&
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

  function validateYouTubePayload(payload) {
    const valid = payload && payload.source === "youtube" && typeof payload.keyword === "string" && Array.isArray(payload.items) &&
      payload.items.every((item) => item && typeof item.videoId === "string" && (item.title === null || typeof item.title === "string") &&
        (item.url === null || typeof item.url === "string") && (item.publishedAt === null || typeof item.publishedAt === "string") &&
        (item.viewCount === null || Number.isFinite(item.viewCount)));
    return valid ? { valid: true, payload } : { valid: false, code: "invalid_response", message: "YouTubeのレスポンス形式が不正です。" };
  }

  async function fetchYouTubeSearch(keyword, fetchImpl, now = new Date()) {
    if (typeof fetchImpl !== "function") throw workerError("network_error", "YouTube Workerへ接続できません。");
    const query = String(keyword || "").trim();
    if (!query) throw workerError("invalid_query", "YouTube検索語がありません。");
    const publishedAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = `${YOUTUBE_SEARCH_WORKER_URL}?q=${encodeURIComponent(query)}&maxResults=10&order=date&publishedAfter=${encodeURIComponent(publishedAfter)}`;
    let response;
    try { response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" } }); }
    catch (error) { throw workerError("network_error", "YouTube Workerへの通信に失敗しました。"); }
    if (!response || !response.ok) throw workerError("http_error", `YouTube WorkerがHTTPエラーを返しました（${response ? response.status : "不明"}）。`);
    let payload;
    try { payload = await response.json(); } catch (error) { throw workerError("invalid_json", "YouTube WorkerのJSONを読み取れませんでした。"); }
    const validation = validateYouTubePayload(payload);
    if (!validation.valid) throw workerError(validation.code, validation.message);
    return payload;
  }

  function validateYahooRankingPayload(payload) {
    const valid = payload && payload.source === "yahoo_shopping_keyword" && payload.rankingType === "up" && Array.isArray(payload.items) &&
      payload.items.every((item) => item && typeof item.keyword === "string" && item.keyword.trim() && Number.isFinite(item.rank) &&
        (item.preRank === null || Number.isFinite(item.preRank)) && (item.vector === null || typeof item.vector === "string") &&
        (item.score === null || typeof item.score === "number") && (item.url === null || typeof item.url === "string"));
    return valid ? { valid: true, payload } : { valid: false, code: "invalid_response", message: "Yahoo!ショッピングのレスポンス形式が不正です。" };
  }

  async function fetchYahooRanking(fetchImpl) {
    if (typeof fetchImpl !== "function") throw workerError("network_error", "Workerへ接続できません。");
    let response;
    try { response = await fetchImpl(YAHOO_SHOPPING_RANKING_WORKER_URL, { method: "GET", headers: { Accept: "application/json" } }); }
    catch (error) { throw workerError("network_error", "Yahoo!ショッピングWorkerへの通信に失敗しました。"); }
    if (!response || !response.ok) throw workerError("http_error", `Yahoo!ショッピングWorkerがHTTPエラーを返しました（${response ? response.status : "不明"}）。`);
    let payload;
    try { payload = await response.json(); } catch (error) { throw workerError("invalid_json", "Yahoo!ショッピングWorkerのJSONを読み取れませんでした。"); }
    const validation = validateYahooRankingPayload(payload);
    if (!validation.valid) throw workerError(validation.code, validation.message);
    return payload;
  }

  function buildYahooCandidateInput(item, payload, now = new Date().toISOString()) {
    const keyword = String(item?.keyword || "").trim();
    return {
      source: "yahoo_shopping_keyword", keyword, title: keyword, sourceUrl: String(item?.url || "").trim(),
      detectedAt: String(payload?.fetchedAt || now), observedAt: String(payload?.fetchedAt || now), status: "unreviewed", humanReviewed: false, roomTrendId: null,
      metrics: { rank: item?.rank ?? null, preRank: item?.preRank ?? null, vector: item?.vector ?? null, score: item?.score ?? null, rankingType: "up" }
    };
  }

  function addYahooCandidate(item, payload, state = readState(), now = new Date().toISOString()) {
    if (!item || !String(item.keyword || "").trim()) throw workerError("invalid_item", "Yahoo!ショッピング候補のキーワードがありません。");
    return upsertCandidate(buildYahooCandidateInput(item, payload, now), state);
  }

  function renderYahooPreview(payload, state = readState()) {
    const preview = document.querySelector("#yahooShoppingRankingPreview");
    if (!preview) return;
    const items = Array.isArray(payload?.items) ? payload.items.slice(0, 20) : [];
    preview.innerHTML = items.length ? items.map((item, index) => {
      const duplicate = Boolean(findUnprocessedDuplicate({ source: "yahoo_shopping_keyword", keyword: item.keyword }, state.candidates));
      const previous = item.preRank === 9999 ? "新規" : `${item.preRank ?? "不明"}位`;
      return `<article class="sns-trend-worker-card"><h4>${escapeText(item.keyword)}</h4><p class="sns-trend-meta">現在順位：${escapeText(item.rank)}位 ／ 前回順位：${escapeText(previous)} ／ 変動：${escapeText(item.vector || "不明")}</p><div class="button-row"><button type="button" class="primary-button" data-yahoo-add-index="${index}" ${duplicate ? "disabled" : ""}>${duplicate ? "登録済み" : "Discoveryに追加"}</button></div></article>`;
    }).join("") : "<p class=\"message\">急上昇ワードはありません。</p>";
    preview.querySelectorAll(".sns-trend-worker-card").forEach((card, index) => {
      const row = card.querySelector(".button-row");
      if (!row || row.querySelector("[data-yahoo-reason-index]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.dataset.yahooReasonIndex = String(index);
      button.textContent = "急上昇理由を調べる";
      row.insertBefore(button, row.firstChild);
      const output = document.createElement("div");
      output.className = "sns-trend-reason";
      output.dataset.yahooReasonOutput = String(index);
      card.appendChild(output);
    });
  }

  function renderYahooReasonOutput(output, keyword, payload) {
    const videos = Array.isArray(payload?.youtube?.items) ? payload.youtube.items : (Array.isArray(payload?.items) ? payload.items : []);
    const webResults = Array.isArray(payload?.web?.results) ? payload.web.results : [];
    const matching = videos.filter((video) => `${video.title || ""} ${video.description || ""}`.toLowerCase().includes(String(keyword || "").toLowerCase()));
    const recent = videos.filter((video) => video.publishedAt);
    const evidence = matching.length ? matching : recent;
    if (!output) return;
    const reason = classifyYahooReason(keyword, webResults, evidence);
    const webHtml = webResults.length ? `<p><strong>Web情報</strong></p>${webResults.map((item) => { let domain = ""; try { domain = new URL(item.url).hostname; } catch { domain = "URL不明"; } return `<p><a href="${escapeText(item.url)}" target="_blank" rel="noopener noreferrer">${escapeText(item.title || "タイトル未取得")}</a> ／ ${escapeText(domain)}<br>${escapeText(item.content.slice(0, 180))}${item.title.includes("公式") || item.content.includes("公式") ? "（公式情報候補）" : ""}</p>`; }).join("")}` : "<p><strong>Web情報</strong><br>取得できませんでした。</p>";
    const youtubeHtml = evidence.length ? `<p><strong>YouTube情報</strong></p>${evidence.slice(0, 3).map((video) => `<p>${escapeText(video.title || "タイトル未取得")} ／ ${escapeText(video.publishedAt || "公開日時未取得")} ／ 再生数：${escapeText(video.viewCount ?? "未取得")}</p>`).join("")}` : "<p><strong>YouTube情報</strong><br>取得できませんでした。</p>";
    output.innerHTML = `<p><strong>■ 急上昇理由</strong></p><p>判定：${escapeText(reason)}</p><p>※検索急上昇との直接的な因果関係を証明するものではありません。</p>${webHtml}${youtubeHtml}`;
  }

  async function investigateYahooReason(keyword, fetchImpl) {
    const query = String(keyword || "").trim();
    const requests = [
      fetchYouTubeSearch(query, fetchImpl).then((payload) => ({ payload })).catch((error) => ({ error })),
      fetchWebSearch(buildYahooReasonSearchQuery(query), fetchImpl).then((payload) => ({ payload })).catch((error) => ({ error }))
    ];
    const [youtube, web] = await Promise.all(requests);
    return { keyword: query, youtube: youtube.payload || null, web: web.payload || null, youtubeError: youtube.error || null, webError: web.error || null, videos: youtube.payload?.items || [], webResults: web.payload?.results || [] };
  }

  function buildYahooReasonSearchQuery(keyword) {
    const query = String(keyword || "").trim();
    return query ? `${query} 日本 急上昇 話題 発売 再販 セール ニュース` : "";
  }

  function validateWebSearchPayload(payload) {
    const valid = payload && payload.source === "tavily" && typeof payload.query === "string" && Array.isArray(payload.results) && payload.results.length <= 5 && payload.results.every((item) => item && typeof item.title === "string" && typeof item.url === "string" && typeof item.content === "string" && (item.score === null || typeof item.score === "number"));
    return valid ? { valid: true, payload } : { valid: false, code: "invalid_response", message: "Web検索のレスポンス形式が不正です。" };
  }

  async function fetchWebSearch(keyword, fetchImpl) {
    if (typeof fetchImpl !== "function") throw workerError("network_error", "Web検索Workerへ接続できません。");
    const query = String(keyword || "").trim();
    if (!query) throw workerError("invalid_query", "Web検索語がありません。");
    let response;
    try { response = await fetchImpl(`${WEB_SEARCH_WORKER_URL}?q=${encodeURIComponent(query)}`, { method: "GET", headers: { Accept: "application/json" } }); }
    catch { throw workerError("network_error", "Web検索Workerへの通信に失敗しました。"); }
    if (!response || !response.ok) throw workerError("http_error", `Web検索WorkerがHTTPエラーを返しました（${response ? response.status : "不明"}）。`);
    let payload;
    try { payload = await response.json(); } catch { throw workerError("invalid_json", "Web検索WorkerのJSONを読み取れませんでした。"); }
    const validation = validateWebSearchPayload(payload);
    if (!validation.valid) throw workerError(validation.code, validation.message);
    return payload;
  }

  function classifyYahooReason(keyword, webResults = [], videos = []) {
    const text = [keyword, ...webResults.flatMap((item) => [item.title, item.content]), ...videos.map((item) => `${item.title || ""} ${item.description || ""}`)].join(" ");
    const rules = [
      { label: "新商品・発売関連の可能性", terms: ["新商品", "新発売", "発売日", "発売"] },
      { label: "予約・抽選販売関連の可能性", terms: ["予約", "抽選", "抽選販売"] },
      { label: "再販関連の可能性", terms: ["再販", "再入荷"] },
      { label: "ニュース・話題関連の可能性", terms: ["ニュース", "話題", "発表", "テレビ"] },
      { label: "動画・SNS話題関連の可能性", terms: ["レビュー", "関連動画", "YouTube", "SNS"] },
      { label: "セール・キャンペーン関連の可能性", terms: ["セール", "キャンペーン", "限定"] }
    ];
    const matched = rules.find((rule) => rule.terms.some((term) => text.includes(term)));
    if (!matched) return "理由を特定できる十分な情報なし";
    const sourceCount = (webResults.length ? 1 : 0) + (videos.length ? 1 : 0);
    return `${matched.label}${sourceCount >= 2 ? "（複数情報源で関連語を確認）" : ""}`;
  }

  function summarizeYouTubeVideos(items = [], now = new Date()) {
    const recent3 = now.getTime() - 3 * 24 * 60 * 60 * 1000;
    const recent7 = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const withViews = items.filter((item) => Number.isFinite(item.viewCount));
    return {
      recent3DayCount: items.filter((item) => item.publishedAt && Date.parse(item.publishedAt) >= recent3).length,
      recent7DayCount: items.filter((item) => item.publishedAt && Date.parse(item.publishedAt) >= recent7).length,
      maxViewCount: withViews.length ? Math.max(...withViews.map((item) => item.viewCount)) : null,
      totalViewCount: withViews.length ? withViews.reduce((sum, item) => sum + item.viewCount, 0) : null,
    };
  }

  function buildYouTubeCandidateInput(item, payload, now = new Date().toISOString()) {
    const keyword = String(payload?.keyword || "").trim();
    return {
      source: "youtube", keyword, title: String(item?.title || keyword).trim(), sourceUrl: String(item?.url || "").trim(),
      detectedAt: String(item?.publishedAt || now), observedAt: String(payload?.fetchedAt || now), status: "unreviewed", humanReviewed: false, roomTrendId: null,
      metrics: { youtube: summarizeYouTubeVideos(payload?.items || [], new Date(now)), videoId: item?.videoId || null, channelTitle: item?.channelTitle || null }
    };
  }

  function addYouTubeCandidate(item, payload, state = readState(), now = new Date().toISOString()) {
    if (!item || !String(payload?.keyword || "").trim()) throw workerError("invalid_item", "YouTube候補の検索語がありません。");
    return upsertCandidate(buildYouTubeCandidateInput(item, payload, now), state);
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

  function includesTerm(text, terms) {
    const normalized = String(text || "").toLowerCase();
    return terms.find((term) => normalized.includes(String(term).toLowerCase())) || "";
  }

  function trendEvidenceText(item = {}) {
    const news = Array.isArray(item.news) ? item.news : [];
    return [item.keyword, ...news.flatMap((entry) => [entry?.title, entry?.source])].filter(Boolean).join(" ");
  }

  function classifyTrend(item = {}) {
    const keyword = String(item.keyword || "").trim();
    const keywordExcluded = includesTerm(keyword, EXCLUDED_TREND_TERMS);
    if (keywordExcluded) return { grade: "C", reasons: [`除外対象のキーワード（${keywordExcluded}）`] };
    const keywordProduct = includesTerm(keyword, ROOM_PRODUCT_TERMS);
    if (keywordProduct) return { grade: "A", reasons: [`商品・ブランド関連キーワード（${keywordProduct}）`] };
    const evidence = trendEvidenceText(item);
    const evidenceExcluded = includesTerm(evidence, EXCLUDED_TREND_TERMS);
    if (evidenceExcluded) return { grade: "C", reasons: [`ニュースに除外対象の情報（${evidenceExcluded}）`] };
    const contextTerm = includesTerm(evidence, ROOM_CONTEXT_TERMS);
    if (contextTerm) return { grade: "B", reasons: [`商品展開できるテーマ（${contextTerm}）`] };
    const evidenceProduct = includesTerm(evidence, ROOM_PRODUCT_TERMS);
    if (evidenceProduct) return { grade: "A", reasons: [`ニュースに商品関連語（${evidenceProduct}）`] };
    return { grade: "B", reasons: ["商品展開の可能性を人間が確認"] };
  }

  function classifyTrendItems(items = []) {
    return items.map((item, index) => ({ item, index, classification: classifyTrend(item) }))
      .sort((left, right) => ({ A: 0, B: 1, C: 2 }[left.classification.grade] - { A: 0, B: 1, C: 2 }[right.classification.grade]));
  }

  const ROOM_TREND_FIVE_MAX_CANDIDATES = 30;

  function normalizeRoomTrendFiveKeyword(value) {
    return String(value || "").trim().toLocaleLowerCase("ja-JP").replace(/[\s　]+/g, " ");
  }

  function mergeRoomTrendFiveCandidates(googlePayload = {}, yahooPayload = {}, maxCandidates = ROOM_TREND_FIVE_MAX_CANDIDATES) {
    const merged = new Map();
    const add = (item, source) => {
      const keyword = String(item?.keyword || "").trim();
      const key = normalizeRoomTrendFiveKeyword(keyword);
      if (!key) return;
      const existing = merged.get(key);
      const sourceKeywords = new Set(existing?.sourceKeywords || []);
      sourceKeywords.add(keyword);
      const sources = new Set(existing?.sources || []);
      sources.add(source);
      const classification = classifyTrend({ keyword, news: source === "google_trends" ? (item.news || []) : [] });
      merged.set(key, {
        ...(existing || {}),
        keyword: existing?.keyword || keyword,
        sources: [...sources],
        sourceKeywords: [...sourceKeywords],
        google: existing?.google || (source === "google_trends" ? { traffic: item.traffic ?? null, publishedAt: item.publishedAt ?? null, news: item.news || [] } : null),
        yahoo: existing?.yahoo || (source === "yahoo_shopping_keyword" ? { rank: item.rank ?? null, preRank: item.preRank ?? null, vector: item.vector ?? null, score: item.score ?? null } : null),
        classification
      });
    };
    (Array.isArray(googlePayload?.items) ? googlePayload.items : []).forEach((item) => add(item, "google_trends"));
    (Array.isArray(yahooPayload?.items) ? yahooPayload.items : []).forEach((item) => add(item, "yahoo_shopping_keyword"));
    const all = [...merged.values()];
    const excluded = all.filter((item) => item.classification.grade === "C");
    const included = all.filter((item) => item.classification.grade !== "C")
      .sort((a, b) => (a.sources.length === b.sources.length ? ({ A: 0, B: 1 }[a.classification.grade] - { A: 0, B: 1 }[b.classification.grade]) : b.sources.length - a.sources.length));
    return { candidates: included.slice(0, Math.max(1, Number(maxCandidates) || ROOM_TREND_FIVE_MAX_CANDIDATES)), duplicateCount: (Array.isArray(googlePayload?.items) ? googlePayload.items.length : 0) + (Array.isArray(yahooPayload?.items) ? yahooPayload.items.length : 0) - all.length, excludedCount: excluded.length, excluded, totalMergedCount: all.length };
  }

  function buildRoomTrendFivePrompt(candidates = [], now = new Date()) {
    const date = now instanceof Date ? now.toISOString().slice(0, 10) : String(now).slice(0, 10);
    const data = candidates.map((candidate) => ({ keyword: candidate.keyword, sources: candidate.sources, sourceKeywords: candidate.sourceKeywords, google: candidate.google, yahoo: candidate.yahoo, primaryClassification: candidate.classification }));
    return `あなたは楽天ROOMの商品テーマ調査担当です。\n現在日付：${date}\n\n以下はGoogle Trends日本RSSとYahoo!ショッピング急上昇を統合し、明らかな非購買候補を一次除外した候補です。単純な順位付けではなく、関連候補を購買テーマへ統合してください。\n\n判断条件：\n- 現在の検索需要\n- 購買意図\n- 季節性\n- 今後7〜30日の需要\n- イベントまでの日数と購入時期\n- 商品カテゴリーへの変換可能性\n- 楽天ROOMとの相性\n- 人名・作品名・イベント名は、購買需要が明確なら除外しない\n- ニュースだけで商品購入につながらない候補は除外する\n\nまず約10テーマへ整理し、次のPhaseでTavily、YouTube、楽天商品検索による追加調査を行うべき候補を選んでください。まだ最終5選を確定しないでください。価格、割引、在庫、レビュー、商品存在を推測しないでください。\n\n必ずJSON配列だけを返してください。各要素は次のキーを含めてください。\n- theme\n- reason\n- purchaseWindow\n- categories\n- rakutenQueries（2〜5個）\n- purchaseIntent\n- confidence\n- sourceKeywords\n\n候補データ：\n${JSON.stringify(data, null, 2)}`;
  }

  function renderRoomTrendFiveCandidates(result = {}) {
    const node = document.querySelector("#roomTrendFiveCandidates");
    if (!node) return;
    node.innerHTML = result.candidates?.length ? result.candidates.map((candidate) => `<article class="sns-trend-discovery-card"><div><h4>${escapeText(candidate.keyword)}</h4><p class="sns-trend-meta">${escapeText(candidate.sources.join(" / "))} ／ 判定 ${escapeText(candidate.classification.grade)} ／ ${escapeText(candidate.classification.reasons.join("、"))}</p></div></article>`).join("") : "<p class=\"message\">利用可能な候補はありません。</p>";
  }

  function parseRoomTrendPhaseTwoJson(value) {
    let parsed;
    if (typeof value === "string") {
      let input = value.trim();
      const fenced = input.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
      if (fenced) input = fenced[1].trim();
      input = input.replace(/[“”]/g, '"');
      try { parsed = JSON.parse(input); } catch (error) { throw new Error(`JSONの形式が正しくありません。ChatGPTの回答全体ではなく、JSON配列を貼り付けてください。${error?.message ? `（${error.message}）` : ""}`); }
    } else {
      parsed = value;
    }
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 20) throw new Error("AI分析結果は1〜20件のJSON配列で入力してください。");
    return parsed.map((item, index) => {
      const position = index + 1;
      const themeLabel = item && typeof item === "object" && String(item.theme || "").trim() ? `『${String(item.theme).trim()}』` : "";
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`テーマ${position}${themeLabel}：オブジェクト形式で指定してください。`);
      const missing = ROOM_TREND_PHASE_TWO_REQUIRED_KEYS.find((key) => item[key] == null);
      if (missing) throw new Error(`テーマ${position}${themeLabel}：${missing}がありません。`);
      const arrays = ["categories", "rakutenQueries", "sourceKeywords"].map((key) => {
        if (!Array.isArray(item[key])) throw new Error(`テーマ${position}${themeLabel}：${key}は配列で指定してください。`);
        return [key, item[key].map((value) => String(value || "").trim()).filter(Boolean)];
      });
      const normalized = Object.fromEntries(arrays);
      if (!normalized.categories.length) throw new Error(`テーマ${position}${themeLabel}：categoriesは1件以上の配列で指定してください。`);
      if (!normalized.rakutenQueries.length || normalized.rakutenQueries.length > 5) throw new Error(`テーマ${position}${themeLabel}：rakutenQueriesは1〜5件の配列で指定してください。`);
      if (!normalized.sourceKeywords.length) throw new Error(`テーマ${position}${themeLabel}：sourceKeywordsは1件以上の配列で指定してください。`);
      return { ...item, theme: String(item.theme).trim(), reason: String(item.reason).trim(), purchaseWindow: String(item.purchaseWindow).trim(), ...normalized, purchaseIntent: String(item.purchaseIntent).trim() };
    });
  }

  async function fetchRakutenThemeEvidence(theme, fetchImpl, settings = {}) {
    const queryResults = [];
    for (const query of theme.rakutenQueries.slice(0, 5)) {
      if (!window.RoomRakutenApi?.hasCredentials?.()) return { queries: theme.rakutenQueries.slice(0, 5), queryResults: [], status: "not_configured", message: "楽天API認証情報が未設定のため未調査", productCount: null, uniqueItemCount: null, priceRange: null, representativeProducts: [], themeMatch: "未調査" };
      try {
        const result = await window.RoomRakutenApi.requestItemSearch(query, { fetchImpl, hits: 10, sort: "standard" });
        const products = result.products;
        queryResults.push({ query, status: "ok", count: products.length, products: products.slice(0, 10).map((product) => ({ itemCode: product.itemCode || null, title: product.itemName || product.title || null, price: product.itemPrice ?? product.price ?? null, reviewAverage: product.reviewAverage ?? null, reviewCount: product.reviewCount ?? null, genreName: product.genreName || product.categoryName || null })) });
      } catch (error) { queryResults.push({ query, status: "error", error: error.message || "rakuten_api_error", count: 0, products: [] }); }
    }
    const products = queryResults.flatMap((result) => result.products || []);
    const prices = products.map((product) => Number(product.price)).filter(Number.isFinite);
    return { queries: theme.rakutenQueries.slice(0, 5), queryResults, status: "complete", productCount: products.length, uniqueItemCount: new Set(products.map((product) => product.itemCode).filter(Boolean)).size, priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null, representativeProducts: products.slice(0, 5), themeMatch: products.length > 0 ? "要確認" : "商品0件" };
  }

  async function investigateRoomTrendPhaseTwoTheme(theme, options = {}) {
    const fetchImpl = options.fetchImpl || window.fetch.bind(window);
    const now = options.now || new Date();
    const web = await fetchWebSearch(buildRoomTrendWebSearchQuery(theme), fetchImpl).catch((error) => ({ error: error.message, results: [] }));
    const youtube = await fetchYouTubeSearch(theme.theme, fetchImpl, now).catch((error) => ({ error: error.message, items: [] }));
    const rakuten = await fetchRakutenThemeEvidence(theme, fetchImpl, options.settings || {});
    return { ...theme, webEvidence: web.error ? { error: web.error, results: [] } : { query: web.query, results: web.results }, youtubeMetrics: youtube.error ? { error: youtube.error, videoCount: 0, recent3DayCount: 0, recent7DayCount: 0, maxViewCount: null, totalViewCount: 0 } : { videoCount: youtube.items.length, ...summarizeYouTubeVideos(youtube.items, now) }, rakutenEvidence: rakuten };
  }

  async function investigateRoomTrendPhaseTwoThemes(themes, options = {}) {
    const results = [];
    for (const theme of themes) results.push(await investigateRoomTrendPhaseTwoTheme(theme, options));
    return results;
  }

  function buildRoomTrendWebSearchQuery(theme = {}, maxLength = 100) {
    const themeKeyword = String(theme.theme || "").trim();
    const sourceKeywords = Array.isArray(theme.sourceKeywords) ? theme.sourceKeywords : [];
    const tokens = [themeKeyword, ...sourceKeywords.map((keyword) => String(keyword || "").trim()), "季節", "需要"]
      .filter(Boolean)
      .filter((token, index, values) => values.indexOf(token) === index);
    let query = "";
    for (const token of tokens) {
      const next = query ? `${query} ${token}` : token;
      if (next.length > maxLength) continue;
      query = next;
    }
    return query || themeKeyword.slice(0, maxLength);
  }

  function buildRoomTrendPhaseTwoPrompt(results = [], now = new Date()) {
    const date = now instanceof Date ? now.toISOString().slice(0, 10) : String(now).slice(0, 10);
    return `あなたは楽天ROOMの最終トレンド選定担当です。\n現在日付：${date}\n\n以下はPhase 1で整理した購買テーマと、Tavily Web検索、YouTube、楽天商品検索による追加調査結果です。10テーマを相対比較し、最終的に楽天ROOM向けの5テーマを選んでください。\n\n判断条件：\n- 現在の需要、購買意図、「今買う理由」\n- 今後7〜30日の需要と購入タイミング\n- 季節性、イベント、発売、セール等の根拠\n- Web情報の具体性と信頼性\n- YouTubeは話題性の補助指標として使い、数字だけで採用しない\n- 楽天市場で商品が成立しているか、商品数、価格帯、レビュー情報、テーマと商品の一致\n- 楽天ROOMとの相性\n- 楽天商品が複数存在するかを確認し、商品が存在するだけでは採用しない\n- 商品1件だけの存在や未確認情報だけでは採用しない\n- 事実が不明な価格、在庫、割引、レビューを推測しない\n\n必ずJSON配列だけを返してください。5件を選び、各要素に theme、reason、purchaseWindow、categories、rakutenQueries、purchaseIntent、confidence、sourceKeywords、webEvidence、youtubeMetrics、rakutenEvidence を含めてください。\n\n調査結果：\n${JSON.stringify(results, null, 2)}`;
  }

  function readRoomTrendPhaseTwo(storage = window.localStorage) {
    try {
      const parsed = JSON.parse(storage.getItem(ROOM_TREND_PHASE_TWO_STORAGE_KEY) || "null");
      return parsed && Array.isArray(parsed.results) ? parsed : null;
    } catch { return null; }
  }

  function writeRoomTrendPhaseTwo(data, storage = window.localStorage) {
    const payload = { schemaVersion: 1, savedAt: data.savedAt || new Date().toISOString(), inputThemes: Array.isArray(data.inputThemes) ? data.inputThemes : [], results: Array.isArray(data.results) ? data.results : [], prompt: String(data.prompt || "") };
    storage.setItem(ROOM_TREND_PHASE_TWO_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }

  function verifyRoomTrendPhaseTwoSave(expected, storage = window.localStorage) {
    const saved = readRoomTrendPhaseTwo(storage);
    if (!saved || saved.savedAt !== expected.savedAt || saved.results.length !== expected.results.length || saved.prompt !== expected.prompt) {
      throw new Error("Phase 2保存後の検証に失敗しました。");
    }
    return saved;
  }

  function validateRoomTrendPhaseTwoBackup(value) {
    if (!value || typeof value !== "object" || value.schemaVersion !== 1) throw new Error("Phase 2バックアップのschemaVersionが不正です。");
    if (typeof value.savedAt !== "string" || !Array.isArray(value.inputThemes) || !Array.isArray(value.results) || typeof value.prompt !== "string") throw new Error("Phase 2バックアップの必須項目が不足しています。");
    if (value.results.some((result) => !result || typeof result !== "object" || !String(result.theme || "").trim())) throw new Error("Phase 2バックアップのresultsが不正です。");
    return value;
  }

  function exportRoomTrendPhaseTwoJson(data, now = new Date()) {
    const payload = validateRoomTrendPhaseTwoBackup(data);
    const stamp = (now instanceof Date ? now : new Date()).toISOString().slice(0, 10).replace(/-/g, "");
    return { filename: `rakuten-room-phase2-${stamp}-${String(payload.savedAt).replace(/[^0-9]/g, "").slice(-6)}.json`, text: JSON.stringify(payload, null, 2) };
  }

  function clearRoomTrendPhaseTwo(storage = window.localStorage) { storage.removeItem(ROOM_TREND_PHASE_TWO_STORAGE_KEY); }

  function renderRoomTrendPhaseTwoResults(results = []) {
    const node = document.querySelector("#roomTrendPhaseTwoResults");
    if (!node) return;
    node.innerHTML = results.length ? results.map((result) => `<article class="sns-trend-discovery-card"><h4>${escapeText(result.theme)}</h4><p>${escapeText(result.reason)}</p><p class="sns-trend-meta">Web：${escapeText(formatRoomTrendWebEvidence(result.webEvidence))} ／ YouTube：${result.youtubeMetrics?.videoCount ?? 0}件（3日 ${result.youtubeMetrics?.recent3DayCount ?? 0} ／ 7日 ${result.youtubeMetrics?.recent7DayCount ?? 0}） ／ 楽天：${escapeText(result.rakutenEvidence?.message || (result.rakutenEvidence?.status === "not_configured" ? "楽天API認証情報が未設定のため未調査" : `商品${result.rakutenEvidence?.uniqueItemCount ?? 0}件 ／ 価格帯：${result.rakutenEvidence?.priceRange ? `${result.rakutenEvidence.priceRange.min}〜${result.rakutenEvidence.priceRange.max}円` : "未確認"}`))}</p></article>`).join("") : "<p class=\"message\">追加調査結果はありません。</p>";
  }

  function formatRoomTrendWebEvidence(evidence = {}) {
    if (evidence?.error) return `取得失敗（${evidence.error}）`;
    return `${Array.isArray(evidence?.results) ? evidence.results.length : 0}件`;
  }

  function findGoogleTrendsCandidate(keyword, candidates = []) {
    const normalized = String(keyword || "").trim();
    return candidates.find((candidate) => candidate.source === "google_trends" && candidate.keyword === normalized && candidate.status !== "rejected") || null;
  }

  function acceptAndSearchCandidate(item, payload, state = readState(), options = {}) {
    const storage = options.storage || window.localStorage;
    const snsApi = options.snsApi || window.snsTrend;
    const classification = options.classification || classifyTrend(item);
    const candidateInput = buildGoogleTrendsCandidateInput(item, payload, options.now);
    let nextState = state;
    let candidate = findGoogleTrendsCandidate(candidateInput.keyword, nextState.candidates);
    if (!candidate) {
      const added = addGoogleTrendsCandidate(item, payload, nextState, options.now);
      nextState = added.state;
      candidate = added.candidate;
    }
    const accepted = acceptCandidate(candidate.id, nextState, snsApi, storage);
    nextState = accepted.state;
    writeState(nextState, storage);
    if (typeof snsApi?.searchByTrendId !== "function") throw new Error("既存の楽天検索導線を利用できません。");
    snsApi.searchByTrendId(accepted.roomTrendId, { grade: classification.grade, reasons: classification.reasons, keyword: candidate.keyword });
    return { ...accepted, state: nextState, candidate: nextState.candidates.find((entry) => entry.id === candidate.id), classification };
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
    if (typeof snsApi.render === "function") snsApi.render(snsApi.readState(storage));
    const next = { ...state, candidates: state.candidates.map((item) => item.id === id ? { ...item, status: "accepted", humanReviewed: true, roomTrendId: result.product.id } : item) };
    return { state: next, roomTrendId: result.product.id, created: !duplicate };
  }

  function rejectCandidate(id, state = readState()) {
    return { ...state, candidates: state.candidates.map((item) => item.id === id ? { ...item, status: "rejected", humanReviewed: true } : item) };
  }

  const ANALYTICS_STORAGE_KEY = "roomTrendAnalyticsV1";
  const ANALYTICS_STATUSES = ["discovered", "accepted", "rakuten_matched", "room_candidate", "room_posted", "sold"];
  function exactItemCode(item) { return String(item?.itemCode || item?.product?.itemCode || "").trim(); }
  function safeRate(numerator, denominator) { return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0; }
  function buildAnalyticsRecords(discoveryState = { candidates: [] }, v1State = { products: [] }, roomData = {}) {
    const products = Array.isArray(v1State.products) ? v1State.products : [];
    const roomCandidates = Array.isArray(roomData.candidates) ? roomData.candidates : [];
    const history = Array.isArray(roomData.history) ? roomData.history : [];
    const sales = Array.isArray(roomData.sales) ? roomData.sales : [];
    return (discoveryState.candidates || []).map((candidate) => {
      const product = products.find((item) => item.id === candidate.roomTrendId) || null;
      const rakutenItemCode = String(product?.rakutenMatch?.itemCode || product?.roomCandidate?.itemCode || "").trim() || null;
      const roomCandidate = rakutenItemCode && roomCandidates.find((item) => item.destination === "room" && exactItemCode(item) === rakutenItemCode);
      const historyItem = rakutenItemCode && history.find((item) => exactItemCode(item) === rakutenItemCode);
      const sale = rakutenItemCode && sales.find((item) => String(item.itemCode || "").trim() === rakutenItemCode);
      let status = "discovered";
      if (sale) status = "sold";
      else if (historyItem) status = "room_posted";
      else if (roomCandidate || product?.roomCandidate?.itemCode) status = "room_candidate";
      else if (product?.rakutenMatch?.itemCode) status = "rakuten_matched";
      else if (candidate.roomTrendId) status = "accepted";
      return {
        id: String(candidate.id), discoveryId: String(candidate.id), roomTrendId: candidate.roomTrendId || null,
        source: candidate.source, keyword: candidate.keyword, discoveredAt: candidate.detectedAt, acceptedAt: candidate.acceptedAt || null,
        rakutenMatchedAt: product?.rakutenMatch?.matchedAt || null, roomCandidateAt: product?.roomCandidate?.savedAt || null,
        roomPostedAt: historyItem?.postedAt || null, soldAt: sale?.occurredAt || null, rakutenItemCode,
        status, salesMatch: sale ? "confirmed" : (rakutenItemCode ? "unknown" : null)
      };
    });
  }
  function summarizeAnalytics(records = []) {
    const count = (filter) => records.filter(filter).length;
    const summary = { discovered: records.length, accepted: count((r) => ANALYTICS_STATUSES.indexOf(r.status) >= 1), rakuten_matched: count((r) => ANALYTICS_STATUSES.indexOf(r.status) >= 2), room_candidate: count((r) => ANALYTICS_STATUSES.indexOf(r.status) >= 3), room_posted: count((r) => ANALYTICS_STATUSES.indexOf(r.status) >= 4), sold: count((r) => r.status === "sold") };
    return { ...summary, adoptionRate: safeRate(summary.accepted, summary.discovered), rakutenRate: safeRate(summary.rakuten_matched, summary.accepted), candidateRate: safeRate(summary.room_candidate, summary.accepted), postedRate: safeRate(summary.room_posted, summary.accepted), soldRate: safeRate(summary.sold, summary.accepted) };
  }
  function summarizeAnalyticsBySource(records = []) { return ["google_trends", "youtube"].map((source) => ({ source, records: records.filter((record) => record.source === source), summary: summarizeAnalytics(records.filter((record) => record.source === source)) })); }
  function analyticsRecordView(record, discoveryState = { candidates: [] }, v1State = { products: [] }) {
    const candidate = (discoveryState.candidates || []).find((item) => String(item.id) === String(record.discoveryId)) || {};
    const product = (v1State.products || []).find((item) => item.id === record.roomTrendId) || {};
    const metrics = candidate.metrics && typeof candidate.metrics === "object" ? candidate.metrics : {};
    const youtube = metrics.youtube && typeof metrics.youtube === "object" ? metrics.youtube : {};
    return { ...record, trendGrade: candidate.trendGrade || candidate.grade || metrics.trendGrade || null, traffic: metrics.searchVolumeLabel || metrics.traffic || null, relatedKeywords: Array.isArray(metrics.relatedKeywords) ? metrics.relatedKeywords : [], youtube: { videoCount: youtube.videoCount ?? youtube.count ?? null, recent3DayCount: youtube.recent3DayCount ?? null, recent7DayCount: youtube.recent7DayCount ?? null, maxViewCount: youtube.maxViewCount ?? null, totalViewCount: youtube.totalViewCount ?? null }, product };
  }
  function filterAnalyticsRecords(records, filter) { return records.filter((record) => filter === "all" || record.source === filter || (filter === "rakuten_matched" && record.rakutenItemCode) || (filter === "room_candidate" && ["room_candidate", "room_posted", "sold"].includes(record.status)) || (filter === "not_reached" && record.roomTrendId && !record.rakutenItemCode)); }
  function readAnalyticsState(storage = window.localStorage) { try { const parsed = JSON.parse(storage.getItem(ANALYTICS_STORAGE_KEY) || "null"); return parsed && Array.isArray(parsed.records) ? parsed : { records: [] }; } catch (error) { return { records: [] }; } }
  function writeAnalyticsState(records, storage = window.localStorage) { const state = { records: Array.isArray(records) ? records : [] }; storage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(state)); return state; }
  function collectAnalytics(storage = window.localStorage) { const roomData = JSON.parse(storage.getItem("roomAssistantDataV1") || "null") || {}; const records = buildAnalyticsRecords(readState(storage), window.snsTrend?.readState?.(storage) || { products: [] }, roomData); return { records, summary: summarizeAnalytics(records), bySource: summarizeAnalyticsBySource(records) }; }
  function renderAnalytics(storage = window.localStorage) {
    const summaryNode = document.querySelector("#trendAnalyticsSummary");
    if (!summaryNode) return;
    const analytics = collectAnalytics(storage); writeAnalyticsState(analytics.records, storage);
    const v1State = window.snsTrend?.readState?.(storage) || { products: [] };
    const views = analytics.records.map((record) => analyticsRecordView(record, readState(storage), v1State));
    const labels = [["discovered", "Discovery"], ["accepted", "採用"], ["rakuten_matched", "楽天商品"], ["room_candidate", "ROOM候補"], ["room_posted", "投稿"], ["sold", "売上"]];
    summaryNode.innerHTML = `<div class="trend-analytics-grid">${labels.map(([key, label]) => `<div><span>${label}</span><strong>${analytics.summary[key]}</strong></div>`).join("")}</div><p>採用率 ${analytics.summary.adoptionRate}% ／ 楽天商品化率 ${analytics.summary.rakutenRate}% ／ ROOM候補化率 ${analytics.summary.candidateRate}% ／ 投稿到達率 ${analytics.summary.postedRate}% ／ 売上到達率 ${analytics.summary.soldRate}%</p>`;
    const sourceNode = document.querySelector("#trendAnalyticsSources");
    if (sourceNode) sourceNode.innerHTML = `<h4>source別比較</h4>` + analytics.bySource.map(({ source, summary }) => `<article class="trend-analytics-source"><h4>${escapeText(SOURCE_LABELS[source] || source)}</h4><p>Discovery ${summary.discovered} → 採用 ${summary.accepted} → 楽天商品 ${summary.rakuten_matched} → ROOM候補 ${summary.room_candidate} → 投稿 ${summary.room_posted} → 売上 ${summary.sold}</p><p>採用率 ${summary.adoptionRate}% ／ 楽天商品化率 ${summary.rakutenRate}% ／ ROOM候補化率 ${summary.candidateRate}%</p>${summary.accepted < 5 ? "<small>参考値（データ少数）</small>" : ""}</article>`).join("") || "<p>分析対象はありません。</p>";
    const recordsNode = document.querySelector("#trendAnalyticsRecords");
    const renderRows = (rows) => rows.length ? rows.map((record) => `<article class="trend-analytics-record"><strong>${escapeText(SOURCE_LABELS[record.source] || record.source)} ／ ${escapeText(record.keyword)}</strong><br>ステータス：${escapeText(record.status)}${record.trendGrade ? `<br>判定：${escapeText(record.trendGrade)}` : ""}${record.traffic ? `<br>traffic：${escapeText(record.traffic)}` : ""}${record.rakutenItemCode ? `<br>itemCode：${escapeText(record.rakutenItemCode)}` : ""}${record.youtube.videoCount != null ? `<br>YouTube動画：${record.youtube.videoCount}件／3日 ${record.youtube.recent3DayCount ?? "unknown"}件／7日 ${record.youtube.recent7DayCount ?? "unknown"}件／最大再生 ${record.youtube.maxViewCount ?? "unknown"}／合計再生 ${record.youtube.totalViewCount ?? "unknown"}` : ""}${record.salesMatch === "unknown" ? "<br>売上確認不能" : ""}</article>`).join("") : "<p>該当データはありません。</p>";
    const filterNode = document.querySelector("#trendAnalyticsFilter");
    const renderFiltered = () => { const filtered = filterAnalyticsRecords(views, filterNode?.value || "all"); if (recordsNode) recordsNode.innerHTML = `<h4>候補一覧</h4>${renderRows(filtered)}`; const successNode = document.querySelector("#trendAnalyticsSuccess"); if (successNode) successNode.innerHTML = `<h4>商品化成功</h4>${renderRows(filtered.filter((r) => r.rakutenItemCode))}`; const unreachedNode = document.querySelector("#trendAnalyticsUnreached"); if (unreachedNode) unreachedNode.innerHTML = `<h4>楽天商品未到達</h4>${renderRows(filtered.filter((r) => r.roomTrendId && !r.rakutenItemCode))}`; };
    if (filterNode && !filterNode.dataset.bound) { filterNode.addEventListener("change", renderFiltered); filterNode.dataset.bound = "1"; }
    renderFiltered();
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
    if (candidate.source === "youtube") {
      const youtube = metrics.youtube && typeof metrics.youtube === "object" ? metrics.youtube : {};
      rows.push(`YouTube補助：直近3日 ${youtube.recent3DayCount ?? 0}件 ／ 直近7日 ${youtube.recent7DayCount ?? 0}件`);
      if (youtube.maxViewCount != null) rows.push(`最大再生数：${escapeText(youtube.maxViewCount)}`);
      if (youtube.channelTitle) rows.push(`チャンネル：${escapeText(youtube.channelTitle)}`);
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
    preview.innerHTML = classifyTrendItems(items).map(({ item, index, classification }) => {
      const candidateInput = buildGoogleTrendsCandidateInput(item, payload);
      const duplicate = findUnprocessedDuplicate(normalizeCandidate({ ...candidateInput, id: `preview-${index}` }), state.candidates);
      const existing = findGoogleTrendsCandidate(candidateInput.keyword, state.candidates);
      const news = Array.isArray(item.news) ? item.news.slice(0, 3) : [];
      const newsHtml = news.length ? `<ul>${news.map((entry) => `<li>${escapeText(entry.title || "ニュースタイトル未取得")}</li>`).join("")}</ul>` : "<p class=\"sns-trend-meta\">関連ニュース：0件</p>";
      const gradeLabel = classification.grade === "A" ? "ROOM向き A" : classification.grade === "B" ? "ROOM向き B" : "対象外 C";
      const quickAction = classification.grade === "C" ? "" : `<button type="button" class="primary-button" data-google-trends-quick-search-index="${index}" ${existing?.roomTrendId ? "disabled" : ""}>${existing?.roomTrendId ? "楽天検索へ移動済み" : "採用して楽天で探す"}</button>`;
      const youtubeAction = classification.grade === "C" ? "" : `<button type="button" class="secondary-button" data-youtube-confirm-index="${index}">YouTubeで確認</button>`;
      return `<article class="sns-trend-worker-card sns-trend-grade-${classification.grade.toLowerCase()}"><h4>${escapeText(item.keyword)}</h4><p class="sns-trend-grade-label">${gradeLabel}</p><p class="sns-trend-reason">理由：${classification.reasons.map((reason) => escapeText(reason)).join(" ／ ")}</p><p class="sns-trend-meta">検索ボリューム：${escapeText(item.traffic || "未取得")}<br>公開日時：${escapeText(item.publishedAt || "未取得")}<br>関連ニュース：${news.length}件</p>${newsHtml}<div class="button-row"><button type="button" class="secondary-button" data-google-trends-add-index="${index}" ${duplicate || existing ? "disabled" : ""}>${duplicate || existing ? "登録済み" : "Discoveryへ追加"}</button>${quickAction}${youtubeAction}</div></article>`;
    }).join("");
  }

  function renderYouTubePreview(payload, state = readState()) {
    const preview = document.querySelector("#youtubeSearchPreview");
    if (!preview) return;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const summary = summarizeYouTubeVideos(items);
    const summaryHtml = `<p class="sns-trend-meta">直近3日：${summary.recent3DayCount}件 ／ 直近7日：${summary.recent7DayCount}件 ／ 最大再生数：${summary.maxViewCount ?? "未取得"} ／ 合計再生数：${summary.totalViewCount ?? "未取得"}</p>`;
    preview.innerHTML = summaryHtml + (items.length ? items.map((item, index) => `<article class="sns-trend-youtube-card"><h4>${escapeText(item.title || "タイトル未取得")}</h4><p class="sns-trend-meta">${escapeText(item.channelTitle || "チャンネル未取得")} ／ ${escapeText(item.publishedAt || "公開日時未取得")} ／ 再生数：${item.viewCount ?? "未取得"}</p><div class="button-row"><a class="secondary-button" href="${escapeText(item.url || "#")}" target="_blank" rel="noopener">動画を見る</a><button type="button" class="primary-button" data-youtube-add-index="${index}">Discoveryへ追加</button></div></article>`).join("") : "<p class=\"message\">関連動画はありません。</p>");
  }

  function render(state = readState()) {
    renderAnalytics();
    const list = document.querySelector("#snsTrendDiscoveryList");
    if (!list) return;
    list.innerHTML = state.candidates.length ? state.candidates.map((candidate) => { const accepted = isAcceptedCandidate(candidate); return `<article class="sns-trend-discovery-card"><div><h3>${escapeText(candidate.title || "タイトル未入力")}</h3><p class="sns-trend-meta">${escapeText(SOURCE_LABELS[candidate.source] || candidate.source)} ／ ${escapeText(candidate.keyword)}</p>${renderMetrics(candidate)}<p>状態：${escapeText(candidate.status)}${candidate.roomTrendId ? `<br>Ver.1 trend ID：${escapeText(candidate.roomTrendId)}` : ""}</p></div><div class="button-row"><button type="button" class="secondary-button" data-discovery-edit="${escapeText(candidate.id)}">編集</button><button type="button" class="primary-button" data-discovery-accept="${escapeText(candidate.id)}" ${accepted || candidate.status === "rejected" ? "disabled" : ""}>${accepted ? "✓ 採用済み" : "採用"}</button><button type="button" class="secondary-button" data-discovery-reject="${escapeText(candidate.id)}" ${accepted || candidate.status === "rejected" ? "disabled" : ""}>却下</button><button type="button" class="danger-button" data-discovery-delete="${escapeText(candidate.id)}">削除</button></div></article>`; }).join("") : "<p class=\"message\">登録したトレンド発見候補はありません。</p>";
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

  function initRoomTrendPhaseTwo() {
    const panel = document.querySelector("#roomTrendPhaseTwo");
    if (!panel || panel.dataset.initialized === "true") return;
    panel.dataset.initialized = "true";
    let roomTrendPhaseTwoThemes = [];
    const phaseTwoInput = document.querySelector("#roomTrendPhaseTwoInput");
    const phaseTwoLoad = document.querySelector("#roomTrendPhaseTwoLoad");
    const phaseTwoRun = document.querySelector("#roomTrendPhaseTwoRun");
    const phaseTwoMessage = document.querySelector("#roomTrendPhaseTwoMessage");
    const phaseTwoSummary = document.querySelector("#roomTrendPhaseTwoSummary");
    const phaseTwoPrompt = document.querySelector("#roomTrendPhaseTwoPrompt");
    const phaseTwoPromptPanel = document.querySelector("#roomTrendPhaseTwoPromptPanel");
    const phaseTwoSavedAt = document.querySelector("#roomTrendPhaseTwoSavedAt");
    const phaseTwoStorageStatus = document.querySelector("#roomTrendPhaseTwoStorageStatus");
    const phaseTwoExport = document.querySelector("#roomTrendPhaseTwoExport");
    const phaseTwoImport = document.querySelector("#roomTrendPhaseTwoImport");
    const phaseTwoImportFile = document.querySelector("#roomTrendPhaseTwoImportFile");
    const phaseTwoClear = document.querySelector("#roomTrendPhaseTwoClear");
    const renderStorageStatus = (saved) => {
      if (!phaseTwoStorageStatus) return;
      phaseTwoStorageStatus.textContent = saved ? `保存状態：localStorage：あり ／ 保存日時：${saved.savedAt} ／ テーマ数：${saved.results.length} ／ 最終5選プロンプト：${saved.prompt ? "あり" : "なし"}` : "保存状態：localStorage：なし";
    };
    const saved = readRoomTrendPhaseTwo();
    renderStorageStatus(saved);
    if (saved) {
      renderRoomTrendPhaseTwoResults(saved.results);
      if (phaseTwoSummary) phaseTwoSummary.textContent = `${saved.results.length}テーマの保存済み結果を復元しました。`;
      if (phaseTwoPrompt && saved.prompt) phaseTwoPrompt.value = saved.prompt;
      if (phaseTwoPromptPanel && saved.prompt) phaseTwoPromptPanel.hidden = false;
      if (phaseTwoSavedAt) phaseTwoSavedAt.textContent = `保存日時：${saved.savedAt}`;
      if (phaseTwoMessage) phaseTwoMessage.textContent = "保存済みPhase 2結果を復元しました（API再通信なし）。";
    }
    phaseTwoExport?.addEventListener("click", () => {
      const current = readRoomTrendPhaseTwo();
      if (!current) { if (phaseTwoMessage) phaseTwoMessage.textContent = "保存済みPhase 2結果がありません。"; return; }
      try {
        const backup = exportRoomTrendPhaseTwoJson(current);
        const url = URL.createObjectURL(new Blob([backup.text], { type: "application/json;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = backup.filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (phaseTwoMessage) phaseTwoMessage.textContent = `Phase 2結果をJSON保存しました：${backup.filename}`;
      } catch (error) { if (phaseTwoMessage) phaseTwoMessage.textContent = error.message; }
    });
    phaseTwoImport?.addEventListener("click", () => phaseTwoImportFile?.click());
    phaseTwoImportFile?.addEventListener("change", async () => {
      const file = phaseTwoImportFile.files?.[0]; if (!file) return;
      try {
        const imported = validateRoomTrendPhaseTwoBackup(JSON.parse(await file.text()));
        const restored = writeRoomTrendPhaseTwo(imported);
        verifyRoomTrendPhaseTwoSave(restored);
        renderRoomTrendPhaseTwoResults(restored.results);
        if (phaseTwoSummary) phaseTwoSummary.textContent = `${restored.results.length}テーマのJSONバックアップを復元しました。`;
        if (phaseTwoPrompt) phaseTwoPrompt.value = restored.prompt;
        if (phaseTwoPromptPanel) phaseTwoPromptPanel.hidden = !restored.prompt;
        if (phaseTwoSavedAt) phaseTwoSavedAt.textContent = `保存日時：${restored.savedAt}`;
        renderStorageStatus(restored);
        if (phaseTwoMessage) phaseTwoMessage.textContent = "JSONからPhase 2結果を復元しました（API再通信なし）。";
      } catch (error) { if (phaseTwoMessage) phaseTwoMessage.textContent = error.message || "JSON復元に失敗しました。"; }
      finally { phaseTwoImportFile.value = ""; }
    });
    phaseTwoClear?.addEventListener("click", () => { clearRoomTrendPhaseTwo(); renderStorageStatus(null); if (phaseTwoSummary) phaseTwoSummary.textContent = "保存済みPhase 2結果を削除しました。"; if (phaseTwoSavedAt) phaseTwoSavedAt.textContent = ""; if (phaseTwoPrompt) phaseTwoPrompt.value = ""; if (phaseTwoPromptPanel) phaseTwoPromptPanel.hidden = true; if (phaseTwoMessage) phaseTwoMessage.textContent = "Phase 2専用の保存データだけを削除しました。"; });
    phaseTwoLoad?.addEventListener("click", () => {
      try { roomTrendPhaseTwoThemes = parseRoomTrendPhaseTwoJson(phaseTwoInput?.value || ""); phaseTwoRun.disabled = false; if (phaseTwoMessage) phaseTwoMessage.textContent = `${roomTrendPhaseTwoThemes.length}テーマを読み込みました。追加調査を実行できます。`; }
      catch (error) { roomTrendPhaseTwoThemes = []; phaseTwoRun.disabled = true; if (phaseTwoMessage) phaseTwoMessage.textContent = error.message; }
    });
    phaseTwoRun?.addEventListener("click", async () => {
      if (!roomTrendPhaseTwoThemes.length) return;
      phaseTwoRun.disabled = true;
      if (phaseTwoMessage) phaseTwoMessage.textContent = "Tavily、YouTube、楽天商品検索をテーマごとに調査中…";
      try {
        const settings = (() => { try { return JSON.parse(window.localStorage.getItem("roomAssistantDataV1") || "{}").settings || {}; } catch { return {}; } })();
        const results = await investigateRoomTrendPhaseTwoThemes(roomTrendPhaseTwoThemes, { settings });
        renderRoomTrendPhaseTwoResults(results);
        if (phaseTwoSummary) phaseTwoSummary.textContent = `${results.length}テーマを調査しました。Web・YouTube・楽天商品データを確認できます。`;
        if (phaseTwoPrompt) phaseTwoPrompt.value = buildRoomTrendPhaseTwoPrompt(results, new Date());
        if (phaseTwoPromptPanel) phaseTwoPromptPanel.hidden = false;
        const savedData = writeRoomTrendPhaseTwo({ inputThemes: roomTrendPhaseTwoThemes, results, prompt: phaseTwoPrompt?.value || "" });
        verifyRoomTrendPhaseTwoSave(savedData);
        renderStorageStatus(savedData);
        if (phaseTwoSavedAt) phaseTwoSavedAt.textContent = `保存日時：${savedData.savedAt}`;
        if (phaseTwoMessage) phaseTwoMessage.textContent = "追加調査が完了しました。最終5選判断用プロンプトを確認してください。";
      } catch (error) { if (phaseTwoMessage) phaseTwoMessage.textContent = error.message || "追加調査に失敗しました。"; }
      finally { phaseTwoRun.disabled = false; }
    });
    document.querySelector("#roomTrendPhaseTwoCopy")?.addEventListener("click", async () => { const text = phaseTwoPrompt?.value || ""; if (!text) return; try { await navigator.clipboard.writeText(text); if (phaseTwoMessage) phaseTwoMessage.textContent = "最終5選判断用プロンプトをコピーしました。"; } catch { phaseTwoPrompt.select(); if (phaseTwoMessage) phaseTwoMessage.textContent = "コピーできませんでした。表示された内容を手動でコピーしてください。"; } });
  }

  function init() {
    const form = document.querySelector("#snsTrendDiscoveryForm");
    const googleForm = document.querySelector("#googleTrendsDiscoveryForm");
    const list = document.querySelector("#snsTrendDiscoveryList");
    if (!form || !list) return;
    document.querySelectorAll(".discovery-accordion").forEach((section) => section.addEventListener("toggle", () => {
      if (!section.open) return;
      document.querySelectorAll(".discovery-accordion").forEach((other) => { if (other !== section) other.open = false; });
    }));
    const storage = window.localStorage;
    let state = readState(storage);
    let workerPayload = null;
    let workerLoading = false;
    render(state);
    initRoomTrendPhaseTwo();

    let roomTrendFiveLoading = false;
    let roomTrendFiveResult = null;
    const roomTrendFiveFetchButton = document.querySelector("#roomTrendFiveFetch");
    const roomTrendFiveMessage = document.querySelector("#roomTrendFiveMessage");
    const roomTrendFiveSummary = document.querySelector("#roomTrendFiveSummary");
    const roomTrendFivePromptPanel = document.querySelector("#roomTrendFivePromptPanel");
    const roomTrendFivePrompt = document.querySelector("#roomTrendFivePrompt");
    roomTrendFiveFetchButton?.addEventListener("click", async () => {
      if (roomTrendFiveLoading) return;
      roomTrendFiveLoading = true;
      roomTrendFiveFetchButton.disabled = true;
      if (roomTrendFiveMessage) roomTrendFiveMessage.textContent = "Google TrendsとYahoo!ショッピング急上昇を取得中…";
      try {
        const [google, yahoo] = await Promise.allSettled([
          fetchGoogleTrends(window.fetch.bind(window)),
          fetchYahooRanking(window.fetch.bind(window))
        ]);
        if (google.status === "rejected" && yahoo.status === "rejected") throw google.reason || yahoo.reason;
        const googlePayload = google.status === "fulfilled" ? google.value : { items: [] };
        const yahooPayload = yahoo.status === "fulfilled" ? yahoo.value : { items: [] };
        roomTrendFiveResult = mergeRoomTrendFiveCandidates(googlePayload, yahooPayload);
        const prompt = buildRoomTrendFivePrompt(roomTrendFiveResult.candidates, new Date());
        renderRoomTrendFiveCandidates(roomTrendFiveResult);
        if (roomTrendFiveSummary) roomTrendFiveSummary.textContent = `候補 ${roomTrendFiveResult.candidates.length}件 ／ Google由来 ${googlePayload.items.length}件 ／ Yahoo由来 ${yahooPayload.items.length}件 ／ 重複除外 ${roomTrendFiveResult.duplicateCount}件 ／ 一次除外 ${roomTrendFiveResult.excludedCount}件`;
        if (roomTrendFivePrompt) roomTrendFivePrompt.value = prompt;
        if (roomTrendFivePromptPanel) roomTrendFivePromptPanel.hidden = false;
        if (roomTrendFiveMessage) roomTrendFiveMessage.textContent = `候補を整理しました。AI分析用プロンプトを確認してください。${google.status === "rejected" || yahoo.status === "rejected" ? "一部の取得に失敗したため、取得できた情報だけを使用しています。" : ""}`;
      } catch (error) {
        roomTrendFiveResult = null;
        if (roomTrendFiveMessage) roomTrendFiveMessage.textContent = error?.message || "候補取得に失敗しました。";
        renderRoomTrendFiveCandidates({ candidates: [] });
      } finally {
        roomTrendFiveLoading = false;
        roomTrendFiveFetchButton.disabled = false;
      }
    });
    document.querySelector("#roomTrendFiveCopy")?.addEventListener("click", async () => {
      const text = roomTrendFivePrompt?.value || "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        if (roomTrendFiveMessage) roomTrendFiveMessage.textContent = "AI分析用プロンプトをコピーしました。";
      } catch (error) {
        roomTrendFivePrompt?.select();
        if (roomTrendFiveMessage) roomTrendFiveMessage.textContent = "コピーできませんでした。表示されたプロンプトを手動でコピーしてください。";
      }
    });

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
    let yahooPayload = null;
    let yahooLoading = false;
    const yahooFetchButton = document.querySelector("#yahooShoppingRankingFetch");
    const yahooMessage = document.querySelector("#yahooShoppingRankingMessage");
    yahooFetchButton?.addEventListener("click", async () => {
      if (yahooLoading) return;
      yahooLoading = true;
      yahooFetchButton.disabled = true;
      if (yahooMessage) yahooMessage.textContent = "取得中...";
      try {
        yahooPayload = await fetchYahooRanking(window.fetch.bind(window));
        renderYahooPreview(yahooPayload, state);
        if (yahooMessage) yahooMessage.textContent = `${yahooPayload.items.length}件取得。登録する候補を選択してください。`;
      } catch (error) {
        yahooPayload = null;
        if (yahooMessage) yahooMessage.textContent = error.message || "Yahoo!ショッピングの取得に失敗しました。";
        const preview = document.querySelector("#yahooShoppingRankingPreview");
        if (preview) preview.innerHTML = "";
      } finally { yahooLoading = false; yahooFetchButton.disabled = false; }
    });
    let youtubePayload = null;
    let youtubeLoading = false;
    const youtubeSearchButton = document.querySelector("#youtubeSearchButton");
    const youtubeQuery = document.querySelector("#youtubeSearchQuery");
    const youtubeMessage = document.querySelector("#youtubeSearchMessage");
    youtubeSearchButton?.addEventListener("click", async () => {
      if (youtubeLoading) return;
      youtubeLoading = true;
      youtubeSearchButton.disabled = true;
      if (youtubeMessage) youtubeMessage.textContent = "取得中…";
      try {
        youtubePayload = await fetchYouTubeSearch(youtubeQuery?.value || "", window.fetch.bind(window));
        renderYouTubePreview(youtubePayload, state);
        if (youtubeMessage) youtubeMessage.textContent = `取得完了：${youtubePayload.items.length}件。YouTube情報は補助根拠です。`;
      } catch (error) {
        youtubePayload = null;
        if (youtubeMessage) youtubeMessage.textContent = error.message;
        const preview = document.querySelector("#youtubeSearchPreview");
        if (preview) preview.innerHTML = "";
      } finally { youtubeLoading = false; youtubeSearchButton.disabled = false; }
    });
    document.querySelector("#googleTrendsWorkerPreview")?.addEventListener("click", (event) => {
      const index = event.target.dataset.googleTrendsAddIndex;
      const quickIndex = event.target.dataset.googleTrendsQuickSearchIndex;
      const youtubeIndex = event.target.dataset.youtubeConfirmIndex;
      if (quickIndex !== undefined) {
        if (!workerPayload || workerLoading) return;
        try {
          const item = workerPayload.items[Number(quickIndex)];
          const result = acceptAndSearchCandidate(item, workerPayload, state, { storage, classification: classifyTrend(item), snsApi: window.snsTrend });
          state = result.state;
          renderWorkerPreview(workerPayload, state);
          render(state);
          if (workerMessage) workerMessage.textContent = "採用して楽天検索へ移動しました。商品選択は人間が行ってください。";
        } catch (error) {
          if (workerMessage) workerMessage.textContent = error.message;
        }
        return;
      }
      if (youtubeIndex !== undefined) {
        if (!workerPayload || workerLoading) return;
        const query = workerPayload.items[Number(youtubeIndex)]?.keyword || "";
        if (youtubeQuery) youtubeQuery.value = query;
        youtubeSearchButton?.click();
        return;
      }
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
    document.querySelector("#youtubeSearchPreview")?.addEventListener("click", (event) => {
      const index = event.target.dataset.youtubeAddIndex;
      if (index === undefined || !youtubePayload || youtubeLoading) return;
      try {
        const result = addYouTubeCandidate(youtubePayload.items[Number(index)], youtubePayload, state);
        state = result.state;
        writeState(state, storage);
        renderYouTubePreview(youtubePayload, state);
        render(state);
        if (youtubeMessage) youtubeMessage.textContent = "YouTube候補をDiscoveryへ追加しました。採用後にVer.1へ渡せます。";
      } catch (error) { if (youtubeMessage) youtubeMessage.textContent = error.message; }
    });
    document.querySelector("#yahooShoppingRankingPreview")?.addEventListener("click", async (event) => {
      const reasonIndex = event.target.dataset.yahooReasonIndex;
      if (reasonIndex !== undefined && yahooPayload && !yahooLoading) {
        const output = document.querySelector(`[data-yahoo-reason-output="${reasonIndex}"]`);
        if (output) output.textContent = "調査中...";
        try {
          const evidence = await investigateYahooReason(yahooPayload.items[Number(reasonIndex)]?.keyword, window.fetch.bind(window));
          renderYahooReasonOutput(output, evidence.keyword, evidence);
        } catch (error) {
          if (output) output.textContent = "急上昇理由を確認できませんでした。";
        }
        return;
      }
      const index = event.target.dataset.yahooAddIndex;
      if (index === undefined || !yahooPayload || yahooLoading) return;
      try {
        const result = addYahooCandidate(yahooPayload.items[Number(index)], yahooPayload, state);
        state = result.state;
        writeState(state, storage);
        renderYahooPreview(yahooPayload, state);
        render(state);
        if (yahooMessage) yahooMessage.textContent = "Yahoo!候補をDiscoveryへ追加しました。";
      } catch (error) { if (yahooMessage) yahooMessage.textContent = error.message; }
    });
    list.addEventListener("click", (event) => {
      const id = event.target.dataset.discoveryEdit || event.target.dataset.discoveryAccept || event.target.dataset.discoveryReject || event.target.dataset.discoveryDelete;
      if (!id) return;
      if (event.target.dataset.discoveryEdit) { setForm(state.candidates.find((item) => item.id === id) || {}); return; }
      const adopting = Boolean(event.target.dataset.discoveryAccept);
      try {
        if (event.target.dataset.discoveryAccept) {
          event.target.disabled = true;
          event.target.textContent = "採用中…";
          const result = acceptCandidate(id, state, window.snsTrend, storage);
          state = result.state;
          writeState(state, storage);
          setMessage(result.created ? "Ver.1へ採用しました。" : "既存のVer.1トレンドへ紐付けました。");
        }
        if (event.target.dataset.discoveryReject) { state = rejectCandidate(id, state); writeState(state, storage); setMessage("候補を却下しました。"); }
        if (event.target.dataset.discoveryDelete) { state = removeCandidate(id, state); writeState(state, storage); }
        render(state);
      } catch (error) { render(state); setMessage(adopting ? "採用に失敗しました" : error.message); }
    });
  }

  window.snsTrendDiscovery = { STORAGE_KEY, ROOM_TREND_PHASE_TWO_STORAGE_KEY, ANALYTICS_STORAGE_KEY, SOURCES, GOOGLE_TRENDS_WORKER_URL, YOUTUBE_SEARCH_WORKER_URL, WEB_SEARCH_WORKER_URL, YAHOO_SHOPPING_RANKING_WORKER_URL, GOOGLE_TRENDS_SOURCE_URL, ROOM_TREND_FIVE_MAX_CANDIDATES, readState, writeState, readRoomTrendPhaseTwo, writeRoomTrendPhaseTwo, verifyRoomTrendPhaseTwoSave, validateRoomTrendPhaseTwoBackup, exportRoomTrendPhaseTwoJson, clearRoomTrendPhaseTwo, normalizeRelatedKeywords, normalizeCandidate, isUnprocessedCandidate, isAcceptedCandidate, findUnprocessedDuplicate, upsertCandidate, removeCandidate, acceptCandidate, acceptAndSearchCandidate, rejectCandidate, buildAnalyticsRecords, summarizeAnalytics, summarizeAnalyticsBySource, analyticsRecordView, filterAnalyticsRecords, readAnalyticsState, writeAnalyticsState, collectAnalytics, renderAnalytics, classifyTrend, classifyTrendItems, mergeRoomTrendFiveCandidates, buildRoomTrendFivePrompt, parseRoomTrendPhaseTwoJson, fetchRakutenThemeEvidence, investigateRoomTrendPhaseTwoTheme, investigateRoomTrendPhaseTwoThemes, buildRoomTrendPhaseTwoPrompt, validateWorkerPayload, fetchGoogleTrends, validateYouTubePayload, fetchYouTubeSearch, validateWebSearchPayload, fetchWebSearch, buildRoomTrendWebSearchQuery, formatRoomTrendWebEvidence, validateYahooRankingPayload, fetchYahooRanking, summarizeYouTubeVideos, buildYouTubeCandidateInput, addYouTubeCandidate, buildGoogleTrendsCandidateInput, addGoogleTrendsCandidate, buildYahooCandidateInput, addYahooCandidate, buildYahooReasonSearchQuery, investigateYahooReason, classifyYahooReason, renderYahooReasonOutput, renderWorkerPreview, renderYouTubePreview, renderYahooPreview, render };
  document.addEventListener("DOMContentLoaded", init);
}());
