(function () {
  const rules = window.RoomExpandedSearch;
  const state = { requestId: "", mode: "", keywords: [], products: [], origins: [], origin: null, busy: false };
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
      terms = rules.suggestRelated(selected.product, value("expandedRelation"), value("expandedProblem"));
    }
    if (mode === "seasonal") terms = rules.suggestSeasonal(value("expandedSeason"));
    el("expandedKeywords").value = terms.join("\n");
    message(`${countLabel(terms)}の検索語を提案しました。確認・編集してから検索してください。`);
  }

  function readTerms() {
    return rules.validateKeywords(el("expandedKeywords").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }

  function currentContext(terms) {
    const mode = value("expandedMode");
    const origin = mode === "related" ? selectedOrigin() : null;
    // 選定理由は商品カードごとに入力する。検索条件だけで商品性能を断定しない。
    return rules.makeSearchContext({ searchMode: mode, targetUser: value("expandedTarget"), problem: value("expandedProblem"), searchKeywords: terms, origin: origin ? { kind: origin.kind, itemCode: origin.code } : null, selectionReason: "" });
  }

  async function copyPrompt() {
    const mode = value("expandedMode");
    const origin = mode === "related" ? selectedOrigin() : null;
    const requestId = crypto.randomUUID();
    const conditions = { searchMode: mode, problem: value("expandedProblem"), targetUser: value("expandedTarget"), season: mode === "seasonal" ? value("expandedSeason") : "", relation: mode === "related" ? value("expandedRelation") : "", origin: origin ? { itemCode: origin.code, itemName: origin.product.itemName || origin.record.title || "", categoryName: origin.product.categoryName || "" } : null };
    const prompt = `楽天市場の商品検索キーワードだけを提案してください。商品情報や効果を推測しないでください。条件: ${JSON.stringify(conditions)}。出力は説明文やMarkdownを付けずJSONのみ。schemaVersion=1、requestId=${requestId}、searchMode=${mode}、keywords=2〜40文字の重複しない検索語1〜5件。`;
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
      const imageUrl = getImage(product);
      const image = imageUrl ? `<img class="expanded-result-image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(product.itemName || "商品画像")}" loading="lazy">` : "<p>商品画像なし</p>";
      return `<article class="expanded-result"><label><input type="checkbox" class="expanded-select" data-index="${index}" ${duplicate || !code ? "disabled" : ""}> <strong>${escapeHtml(product.itemName || "商品名未設定")}</strong></label>${image}<p>${escapeHtml(product.shopName || "ショップ未設定")} / 商品ID（itemCode）: ${escapeHtml(code || "未記録")}</p><p>商品URL: ${escapeHtml(product.itemUrl || "未記録")}</p><p>${duplicate ? "候補または履歴に登録済み" : !code ? "商品コード未記録のため登録不可" : formatYen(product.itemPrice)}</p><label>商品固有の選定理由（商品説明の確認済み表現のみ。任意）<input class="expanded-reason" data-index="${index}" maxlength="160" value="${escapeAttr(rules.suggestSelectionReason(product))}" placeholder="根拠がなければ空欄"></label></article>`;
    }).join("");
    el("expandedSave").hidden = products.length === 0;
    el("expandedSaveMessage").textContent = "";
  }

  async function runSearch() {
    if (state.busy) return;
    if (!hasRakutenCredentials()) throw new Error("楽天APIの設定が必要です。サンプル商品を候補登録に使用しません。");
    const terms = readTerms();
    const context = currentContext(terms);
    state.busy = true;
    el("expandedRun").disabled = true;
    renderProducts([]);
    message(`${countLabel(terms)}の検索語で検索中です。`);
    const results = [];
    const failures = [];
    try {
      for (const term of terms) {
        try {
          const response = await requestRakutenItemSearch(term, { hits: 10 });
          if (response.status !== "ok") throw new Error("楽天APIを利用できません。");
          results.push(response.products.filter((item) => !isUnavailableProduct(item)));
        } catch (error) { failures.push(`${term}: ${error.message}`); }
      }
      if (!results.length) throw new Error(`全検索語の取得に失敗しました。${failures.join(" / ")}`);
      const merged = rules.mergeResults(results, rankingIdentity);
      state.keywords = terms;
      state.context = context;
      renderProducts(merged);
      message(`${countLabel(merged)}を表示しました。${failures.length ? `${failures.length}件の検索語は失敗しました: ${failures.join(" / ")}` : ""}`);
    } finally {
      state.busy = false;
      el("expandedRun").disabled = false;
    }
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
    el("expandedOriginType").addEventListener("change", updateOrigins);
    el("expandedSearch").addEventListener("toggle", () => { if (el("expandedSearch").open && value("expandedMode") === "related") updateOrigins(); });
    bind("expandedSuggest", suggest);
    bind("expandedPrompt", copyPrompt);
    bind("expandedImport", importJson);
    bind("expandedRun", runSearch);
    bind("expandedSave", saveSelected);
    updateMode();
  });
})();
