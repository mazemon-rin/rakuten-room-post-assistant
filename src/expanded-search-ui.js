(function () {
  const SEARCH_REQUEST_INTERVAL_MS = 1000;
  const rules = window.RoomExpandedSearch;
  const state = { requestId: "", mode: "", keywords: [], products: [], origins: [], origin: null, context: null, relevanceContext: null, termResults: new Map(), failedTerms: [], lastRequestAt: null, busy: false };
  const el = (id) => document.getElementById(id);
  const value = (id) => el(id)?.value?.trim() || "";
  const message = (text) => { el("expandedMessage").textContent = text; };
  const countLabel = (list) => `${list.length}件`;

  function updateMode() {
    const mode = value("expandedMode");
    document.querySelectorAll("[data-expanded]").forEach((node) => { node.hidden = !node.dataset.expanded.split(" ").includes(mode); });
    state.requestId = "";
    state.mode = "";
    state.products = [];
    state.context = null;
    state.relevanceContext = null;
    el("expandedResults").replaceChildren();
    el("expandedSave").hidden = true;
    el("expandedSaveMessage").textContent = "";
    if (mode === "related") updateOrigins();
  }

  function updateOrigins() {
    const type = value("expandedOriginType");
    const records = type === "history" ? data.history.map((record) => ({ record, product: record.product || record }))
      : type === "result" ? searchResults.map((product) => ({ record: product, product }))
      : data.sales.map((sale) => {
          const record = data.history.find((item) => item.id === sale.historyId && (!sale.itemCode || normalizeItemCode(item.itemCode) === normalizeItemCode(sale.itemCode)));
          return record ? { record, product: record.product || record } : null;
        }).filter(Boolean);
    const unique = new Map();
    records.forEach((entry) => {
      const code = getItemCode(entry.record) || getItemCode(entry.product);
      if (code && !unique.has(code)) unique.set(code, { ...entry, code, kind: type });
    });
    state.origins = [...unique.values()];
    el("expandedOrigin").innerHTML = state.origins.map((entry, index) => `<option value="${index}">${escapeHtml((entry.product.itemName || entry.record.title || "商品") + " / " + entry.code)}</option>`).join("");
    if (!state.origins.length) el("expandedOrigin").innerHTML = "<option value=''>照合できる商品がありません</option>";
  }

  function updateSeasonalPurposes() {
    const control = el("expandedSeasonPurpose");
    if (!control) return;
    const key = value("expandedSeason");
    const previous = control.value;
    const options = rules.seasonalPurposeOptions(key);
    control.innerHTML = options.map((option) => `<option value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</option>`).join("");
    control.value = options.some((option) => option.value === previous) ? previous : "general";
  }

  function selectedOrigin() {
    const selected = state.origins[Number(value("expandedOrigin"))];
    if (!selected) throw new Error("起点の商品を確認できません。売上履歴は投稿履歴に紐付く行のみ利用できます。");
    return selected;
  }

  function suggest() {
    const mode = value("expandedMode");
    let terms;
    if (mode === "problem") terms = rules.suggestProblem(value("expandedProblem"), value("expandedTarget"));
    if (mode === "related") {
      const selected = selectedOrigin();
      terms = rules.suggestRelated(selected.product, value("expandedRelation"), value("expandedProblem"), value("expandedTarget"));
    }
    if (mode === "seasonal") terms = rules.suggestSeasonal(value("expandedSeason"), value("expandedSeasonPurpose"), value("expandedSeasonIntent"));
    el("expandedKeywords").value = terms.join("\n");
    message(`${countLabel(terms)}の検索語を提案しました。確認・編集してから検索してください。`);
  }

  function readTerms() {
    return rules.validateKeywords(el("expandedKeywords").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }

  function currentContext(terms) {
    const mode = value("expandedMode");
    const origin = mode === "related" ? selectedOrigin() : null;
    const problem = mode === "seasonal" ? value("expandedSeasonIntent") : value("expandedProblem");
    // 選定理由は商品カードごとに入力する。検索条件だけで商品性能を断定しない。
    return { ...rules.makeSearchContext({ searchMode: mode, targetUser: mode === "seasonal" ? "" : value("expandedTarget"), problem, season: mode === "seasonal" ? value("expandedSeason") : "", seasonPurpose: mode === "seasonal" ? value("expandedSeasonPurpose") : "", searchKeywords: terms, origin: origin ? { kind: origin.kind, itemCode: origin.code } : null, selectionReason: "" }), relation: mode === "related" ? value("expandedRelation") : null };
  }

  async function copyPrompt() {
    const mode = value("expandedMode");
    const origin = mode === "related" ? selectedOrigin() : null;
    const relation = mode === "related" ? value("expandedRelation") : "";
    const originCategory = relation === "compare" ? rules.identifyProductCategory(origin.product) : null;
    if (relation === "compare" && !originCategory) throw new Error("比較元の商品カテゴリを特定できません。商品情報を確認してから検索語を作成してください。");
    const requestId = crypto.randomUUID();
    const conditions = { searchMode: mode, problem: mode === "seasonal" ? "" : value("expandedProblem"), targetUser: mode === "seasonal" ? "" : value("expandedTarget"), season: mode === "seasonal" ? value("expandedSeason") : "", seasonPurpose: mode === "seasonal" ? value("expandedSeasonPurpose") : "", customIntent: mode === "seasonal" ? value("expandedSeasonIntent") : "", relation, origin: origin ? { itemCode: origin.code, itemName: origin.product.itemName || origin.record.title || "", categoryName: origin.product.categoryName || "", detectedCategory: originCategory?.label || null } : null };
    const relatedInstruction = relation === "compare" ? `比較検索では起点商品と同じカテゴリ（${originCategory.label}）を優先し、別カテゴリの商品を示す語や販促語だけの検索語は提案しないでください。` : "";
    const intentInstruction = ["problem", "seasonal"].includes(mode) ? "悩み・目的から具体的な商品カテゴリを優先し、同義語を重複させず、便利・対策・おすすめ等だけを機械的に足さないでください。対象者と季節・イベント条件を検索語へ適切に反映し、確かでない商品性能や効果は推測しないでください。" : "";
    const prompt = `楽天市場の商品検索キーワードだけを提案してください。商品情報や効果を推測しないでください。${intentInstruction}${relatedInstruction}条件: ${JSON.stringify(conditions)}。出力は説明文やMarkdownを付けずJSONのみ。schemaVersion=1、requestId=${requestId}、searchMode=${mode}、keywords=2〜40文字の重複しない検索語1〜5件。`;
    await navigator.clipboard.writeText(prompt);
    state.requestId = requestId;
    state.mode = mode;
    message(`Codex用プロンプトをコピーしました。照合ID: ${requestId}`);
  }

  function importJson() {
    if (!state.requestId || state.mode !== value("expandedMode")) throw new Error("先に現在の条件でCodex用プロンプトを作成してください。");
    const terms = rules.parseCodexResult(el("expandedJson").value, { requestId: state.requestId, searchMode: state.mode });
    el("expandedKeywords").value = terms.join("\n");
    message("検索語を取り込みました。内容を確認・編集してから検索してください。");
  }

  function renderProducts(products) {
    state.products = products;
    el("expandedResults").innerHTML = products.map((product, index) => {
      const duplicate = !canSaveRoomCandidate(product);
      const code = String(product.itemCode || "");
      const relevance = rules.classifyRelevance(product, state.relevanceContext || { problem: state.context?.problem || "", keywords: state.keywords });
      const compareSearch = state.context?.searchMode === "related" && state.context.relation === "compare";
      const imageUrl = getImage(product);
      const image = imageUrl ? `<img class="expanded-result-image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(product.itemName || "商品画像")}" loading="lazy">` : "<p>商品画像なし</p>";
      const relevanceLabel = relevance.status === "low" ? "関連性なし（候補登録対象外）" : relevance.status === "review" ? (compareSearch ? "要確認（判定確定まで候補登録不可）" : "要確認") : "関連性あり";
      const disabled = duplicate || !code || relevance.status === "low" || (compareSearch && relevance.status !== "relevant");
      return `<article class="expanded-result"><label><input type="checkbox" class="expanded-select" data-index="${index}" ${disabled ? "disabled" : ""}> <strong>${escapeHtml(product.itemName || "商品名未設定")}</strong></label>${image}<p>${escapeHtml(product.shopName || "ショップ未設定")} / 商品ID（itemCode）: ${escapeHtml(code || "未記録")}</p><p>商品URL: ${escapeHtml(product.itemUrl || "未記録")}</p><p>${duplicate ? "候補または履歴に登録済み" : !code ? "商品コード未記録のため登録不可" : formatYen(product.itemPrice)}</p><p class="expanded-relevance expanded-relevance-${relevance.status}"><strong>${escapeHtml(relevanceLabel)}</strong>：${escapeHtml(relevance.reason)}</p><label>商品固有の選定理由（商品情報の確認済み表現のみ。任意）<input class="expanded-reason" data-index="${index}" maxlength="160" value="${escapeAttr(rules.suggestSelectionReason(product))}" placeholder="根拠がなければ空欄"></label></article>`;
    }).join("");
    el("expandedSave").hidden = products.length === 0;
    el("expandedSaveMessage").textContent = "";
  }

  function renderFailures() {
    const failures = state.failedTerms;
    el("expandedFailures").innerHTML = failures.map(({ term, reason, deferred }) => `<li><strong>${escapeHtml(term)}</strong>：${escapeHtml(deferred ? `未実行。${reason}` : reason)}</li>`).join("");
    el("expandedRetryFailed").hidden = failures.length === 0;
  }

  function renderMergedResults() {
    const merged = rules.mergeResults([...state.termResults.values()], rankingIdentity);
    renderProducts(merged);
    return merged;
  }

  async function executeTerms(terms, { reset = false } = {}) {
    if (state.busy) return;
    state.busy = true;
    el("expandedRun").disabled = true;
    el("expandedRetryFailed").disabled = true;
    if (reset) {
      state.termResults.clear();
      state.failedTerms = [];
      renderProducts([]);
      el("expandedFailures").replaceChildren();
    }
    message(`${countLabel(terms)}の検索語で順番に検索します（API呼び出し間隔 ${SEARCH_REQUEST_INTERVAL_MS / 1000}秒）。`);
    let stoppedByRateLimit = false;
    let attemptedTerms = 0;
    let successfulTerms = 0;
    try {
      for (let index = 0; index < terms.length; index += 1) {
        const term = terms[index];
        if (state.lastRequestAt !== null) {
          const waitMs = Math.max(0, SEARCH_REQUEST_INTERVAL_MS - (Date.now() - state.lastRequestAt));
          if (waitMs > 0) await sleep(waitMs);
        }
        try {
          attemptedTerms += 1;
          const response = await requestRakutenItemSearch(term, { hits: 10, retry429: true });
          if (response.status !== "ok") throw new Error("楽天APIを利用できません。");
          state.termResults.set(term, response.products.filter((item) => !isUnavailableProduct(item)));
          successfulTerms += 1;
          state.failedTerms = state.failedTerms.filter((failure) => failure.term !== term);
        } catch (error) {
          state.failedTerms = state.failedTerms.filter((failure) => failure.term !== term);
          state.failedTerms.push({ term, reason: error.message || "検索エラー", deferred: false });
          if (error.status === 429) {
            stoppedByRateLimit = true;
            for (const unattempted of terms.slice(index + 1)) state.failedTerms.push({ term: unattempted, reason: "HTTP 429が続いたため今回の検索では実行していません。", deferred: true });
            break;
          }
        } finally {
          // API関数内で429再試行した場合も含め、実際の処理完了から次の語まで間隔を取ります。
          state.lastRequestAt = Date.now();
        }
      }
      const merged = renderMergedResults();
      renderFailures();
      const status = stoppedByRateLimit ? "HTTP 429が続いたため、残りの検索語を停止しました。" : "";
      message(`今回${attemptedTerms}/${terms.length}検索語を実行（成功${successfulTerms}・失敗${attemptedTerms - successfulTerms}）。入力全体は${state.keywords.length}語、商品${countLabel(merged)}。${state.failedTerms.length ? `失敗・未実行${state.failedTerms.length}件は下に表示しています。` : "失敗なし。"} ${status}`);
    } finally {
      state.busy = false;
      el("expandedRun").disabled = false;
      el("expandedRetryFailed").disabled = false;
    }
  }

  async function runSearch() {
    if (state.busy) return;
    if (!hasRakutenCredentials()) throw new Error("楽天APIの設定が必要です。サンプル商品を候補登録に使用しません。");
    const terms = readTerms();
    state.keywords = terms;
    state.context = currentContext(terms);
    const origin = value("expandedMode") === "related" ? selectedOrigin() : null;
    state.relevanceContext = { searchMode: state.context.searchMode, relation: state.context.relation, originProduct: origin?.product || null, targetUser: state.context.targetUser, problem: state.context.problem, keywords: terms };
    await executeTerms(terms, { reset: true });
  }

  async function retryFailedTerms() {
    if (state.busy) return;
    if (!state.failedTerms.length) return;
    const terms = readTerms();
    if (JSON.stringify(currentContext(terms)) !== JSON.stringify(state.context) || JSON.stringify(terms) !== JSON.stringify(state.keywords)) throw new Error("検索条件が変わっています。内容を確認して新しい検索を実行してください。");
    const failed = state.failedTerms.map((item) => item.term);
    state.failedTerms = [];
    await executeTerms(failed);
  }

  function saveSelected() {
    if (!state.context || JSON.stringify(currentContext(readTerms())) !== JSON.stringify(state.context)) throw new Error("検索条件が変わりました。検索し直してください。");
    const checked = [...document.querySelectorAll(".expanded-select:checked")];
    if (!checked.length) throw new Error("登録する商品を選択してください。");
    const next = { ...data, candidates: [...data.candidates] };
    const added = [];
    let duplicates = 0;
    let failed = 0;
    const seenCodes = new Set();
    checked.forEach((input) => {
      const index = Number(input.dataset.index);
      const product = state.products[index];
      const code = getItemCode(product);
      if (!product || !code || code !== String(product.itemCode || "")) { failed++; return; }
      const relevance = rules.classifyRelevance(product, state.relevanceContext || { problem: state.context.problem, keywords: state.keywords });
      const compareSearch = state.context.searchMode === "related" && state.context.relation === "compare";
      if (relevance.status === "low" || (compareSearch && relevance.status !== "relevant")) { failed++; return; }
      if (seenCodes.has(code) || !window.DuplicateDetection.canSaveRoomCandidate(product, next.candidates, next.history)) { duplicates++; return; }
      const card = input.closest(".expanded-result");
      const reason = card?.querySelector(".expanded-reason")?.value.trim() || "";
      let verifiedReason;
      try { verifiedReason = rules.supportedSelectionReason(reason, product); }
      catch { failed++; return; }
      const candidate = buildQueueCandidate(product);
      if (!candidate.id || normalizeItemCode(candidate.itemCode) !== normalizeItemCode(code)) { failed++; return; }
      candidate.searchContext = rules.makeSearchContext({ ...state.context, selectionReason: verifiedReason });
      next.candidates.push(candidate);
      added.push(candidate);
      seenCodes.add(code);
    });
    if (!added.length) { el("expandedSaveMessage").textContent = `登録成功0件、重複除外${duplicates}件、失敗${failed}件。選定理由が商品情報と一致するか確認してください。`; return; }
    const result = saveData(next);
    if (!result.ok) throw new Error("保存に失敗しました。既存データは維持されています。");
    const persisted = loadData();
    const verified = added.every((candidate) => persisted.candidates.some((item) => item.id === candidate.id && normalizeItemCode(item.itemCode) === normalizeItemCode(candidate.itemCode) && item.searchContext?.searchMode === candidate.searchContext.searchMode));
    if (!verified) throw new Error("保存後の候補ID・itemCode照合に失敗しました。再登録せず保存状態を確認してください。");
    renderProducts(state.products);
    el("expandedSaveMessage").textContent = `登録成功${added.length}件、重複除外${duplicates}件、失敗${failed}件。保存後の照合も完了しました。${failed ? "失敗した商品のitemCodeと選定理由を確認してください。" : ""}`;
  }

  function bind(id, handler) {
    el(id).addEventListener("click", async () => {
      try { await handler(); } catch (error) { message(error.message || "処理に失敗しました。"); }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!el("expandedSearch")) return;
    el("expandedMode").addEventListener("change", updateMode);
    el("expandedSeason").addEventListener("change", updateSeasonalPurposes);
    el("expandedOriginType").addEventListener("change", updateOrigins);
    el("expandedSearch").addEventListener("toggle", () => { if (el("expandedSearch").open && value("expandedMode") === "related") updateOrigins(); });
    bind("expandedSuggest", suggest);
    bind("expandedPrompt", copyPrompt);
    bind("expandedImport", importJson);
    bind("expandedRun", runSearch);
    bind("expandedRetryFailed", retryFailedTerms);
    bind("expandedSave", saveSelected);
    updateMode();
    updateSeasonalPurposes();
  });
})();
