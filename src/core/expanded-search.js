(function exposeExpandedSearch(root) {
  const seasonal = Object.freeze({
    spring: ["新生活 収納", "入園 入学 準備", "春 掃除"],
    summer: ["暑さ対策 日用品", "夏 旅行 便利", "夏 家事 時短"],
    autumn: ["防災 グッズ", "衣替え 収納", "秋 旅行 用品"],
    winter: ["防寒 グッズ", "大掃除 便利", "年末年始 キッチン"],
    newlife: ["新生活 収納", "引っ越し 便利"],
    school: ["入園 入学 準備", "通学 用品"],
    travel: ["旅行 便利 グッズ", "旅行 収納"],
    disaster: ["防災 グッズ", "非常用 収納"],
    cleaning: ["大掃除 便利", "掃除 時短"]
  });
  const modes = ["problem", "related", "seasonal"];
  const invalid = /[<>\x00-\x1f\x7f]/;
  const clean = (value, max = 80) => String(value || "").trim().slice(0, max);

  function validateKeywords(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 5) throw new Error("検索語は1〜5件にしてください。");
    const terms = values.map((value) => {
      if (typeof value !== "string") throw new Error("検索語は文字列で入力してください。");
      const term = value.trim();
      if (term.length < 2 || term.length > 40 || invalid.test(term) || /^(?:https?:\/\/|javascript:)/i.test(term)) throw new Error("検索語は2〜40文字の文字列で入力してください。URLや制御文字は使えません。");
      return term;
    });
    if (new Set(terms).size !== terms.length) throw new Error("同じ検索語が重複しています。");
    return terms;
  }

  function parseCodexResult(raw, expected) {
    if (typeof raw !== "string" || raw.length > 8192) throw new Error("JSONは8KiB以内にしてください。");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("JSONの形式が正しくありません。"); }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || parsed.schemaVersion !== 1 || parsed.requestId !== expected.requestId || parsed.searchMode !== expected.searchMode || !modes.includes(parsed.searchMode)) throw new Error("schemaVersion・requestId・searchModeが一致しません。");
    return validateKeywords(parsed.keywords);
  }

  function suggestProblem(problem, targetUser) {
    const p = clean(problem, 40);
    const target = clean(targetUser, 25);
    if (p.length < 2) throw new Error("悩みを2文字以上入力してください。");
    if (/(デスク|机)/.test(p) && /(狭|収納|片付|スペース)/.test(p)) {
      const terms = ["デスク収納ラック", "モニター台 収納", "デスク下 収納", "デスク上 収納"];
      if (/在宅|ワーカー|仕事/.test(target)) terms.push("在宅ワーク デスク収納");
      return validateKeywords([...new Set(terms)].slice(0, 5));
    }
    const terms = [p, `${p} 便利`, target ? `${p} ${target}` : `${p} 対策`];
    if (/狭|収納|片付/.test(p)) terms.push("省スペース 収納");
    else if (/掃除|洗濯|家事/.test(p)) terms.push("家事 時短 グッズ");
    return validateKeywords([...new Set(terms)].slice(0, 5));
  }

  function suggestRelated(product, relation, problem = "") {
    const title = clean(product?.itemName || product?.title, 70);
    const category = clean(product?.categoryName || product?.product?.categoryName, 35);
    if (!title) throw new Error("起点商品の名前を確認できません。");
    const base = title.split(/[\s　【】()（）]/).filter(Boolean)[0]?.slice(0, 28) || title.slice(0, 28);
    const p = clean(problem, 35);
    const terms = relation === "same" ? [base, category && `${category} ${base}`]
      : relation === "compare" ? [`${base} 比較`, category && `${category} 比較`]
      : relation === "together" ? [`${base} 併用`, category && `${category} 関連用品`]
      : relation === "problem" ? [p, p && `${p} 対策`] : [];
    const valid = terms.filter((term) => term && term.trim().length >= 2).slice(0, 5);
    if (!valid.length) throw new Error("検索語の根拠が不足しています。起点商品の情報または悩みを確認してください。");
    return validateKeywords([...new Set(valid)]);
  }

  function suggestSeasonal(key) {
    if (!Object.hasOwn(seasonal, key)) throw new Error("季節・イベントを選んでください。");
    return validateKeywords(seasonal[key]);
  }

  function mergeResults(results, identity) {
    const seen = new Set();
    const merged = [];
    results.forEach((group) => group.forEach((item) => {
      const key = identity(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    }));
    return merged;
  }

  function makeSearchContext(input) {
    return {
      version: 1,
      searchMode: input.searchMode,
      targetUser: clean(input.targetUser, 80),
      problem: clean(input.problem, 120),
      selectionReason: clean(input.selectionReason, 160),
      searchKeywords: validateKeywords(input.searchKeywords),
      origin: input.origin?.itemCode ? { kind: input.origin.kind, itemCode: clean(input.origin.itemCode, 100) } : null
    };
  }

  function supportedSelectionReason(reason, product) {
    const text = clean(reason, 160);
    if (!text) return "";
    // 商品固有の説明はAPIで確認した文字列そのものだけを認める。
    const evidence = [product.itemName, product.itemCaption, product.categoryName].filter(Boolean).join(" ");
    if (!evidence.includes(text)) throw new Error("選定理由は商品名・商品説明・カテゴリーで確認できた表現だけにしてください。");
    return text;
  }

  function suggestSelectionReason(product) {
    const caption = String(product?.itemCaption || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    if (/(最安|人気|売れ|絶対|必ず|効果|クーポン|セール|%\s*OFF|％\s*OFF|期間限定|使ってみた)/i.test(caption)) {
      // 販促や体験表現を含む説明文から、文全体を理由として転載しない。
      const safeCaption = caption.split(/[。\n]/).filter((part) => !/(最安|人気|売れ|絶対|必ず|効果|クーポン|セール|%\s*OFF|％\s*OFF|期間限定|使ってみた)/i.test(part)).join("。");
      return extractShortEvidence(safeCaption);
    }
    return extractShortEvidence(caption);
  }

  function extractShortEvidence(text) {
    const patterns = [
      /(?:デスク|机|卓上)[^、。！？\n]{0,40}(?:収納|整理|配線)[^、。！？\n]{0,18}/,
      /(?:折りたたみ|洗える|保温|保冷|軽量|通気性|防水|撥水|耐熱|耐冷|抗菌)[^、。！？\n]{0,12}/,
      /(?:収納|ポケット|引き出し|棚|容量|サイズ|素材|材質|対応|付属)[^、。！？\n]{0,14}/
    ];
    for (const pattern of patterns) {
      const match = String(text || "").match(pattern);
      const evidence = match?.[0]?.trim() || "";
      if (evidence && evidence.length <= 48) return evidence;
    }
    return "";
  }

  function classifyRelevance(product, context = {}) {
    const text = [product?.itemName, product?.itemCaption, product?.categoryName].filter(Boolean).join(" ").replace(/<[^>]*>/g, " ").toLowerCase();
    const problem = String(context.problem || "");
    if (/(デスク|机)/.test(problem) && /(狭|収納|片付|スペース)/.test(problem)) {
      const deskCues = ["デスク収納ラック", "デスク周り", "デスク下", "机下", "デスク上", "机上", "机の上", "モニター台", "モニタースタンド", "卓上ラック", "デスクラック", "パソコンラック", "pcラック", "配線収納", "ケーブル収納", "文具収納", "デスクオーガナイザー"];
      const matched = deskCues.find((cue) => text.includes(cue.toLowerCase()));
      if (matched) return { status: "relevant", reason: `商品情報に「${matched}」の記載があります。` };
      return { status: "low", reason: "商品名・説明にデスク周辺の収納・整理との関連を確認できません。" };
    }
    const terms = Array.isArray(context.keywords) ? context.keywords : [];
    const matched = terms.find((term) => {
      const words = String(term).toLowerCase().split(/[\s　]+/).filter((word) => word.length >= 2 && !/^(便利|対策|比較|併用|関連用品)$/.test(word));
      return words.some((word) => text.includes(word));
    });
    if (matched) return { status: "relevant", reason: `商品情報に検索語「${matched}」と一致する語があります。` };
    return { status: "review", reason: "商品情報だけでは検索条件との関連を判定できません。内容を確認してください。" };
  }

  root.RoomExpandedSearch = Object.freeze({ modes, seasonal, validateKeywords, parseCodexResult, suggestProblem, suggestRelated, suggestSeasonal, mergeResults, makeSearchContext, supportedSelectionReason, suggestSelectionReason, classifyRelevance });
})(typeof window !== "undefined" ? window : globalThis);
