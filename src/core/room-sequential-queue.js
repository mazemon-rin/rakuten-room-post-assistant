(function exposeRoomSequentialQueue(root) {
  function normalizeItemCode(code) {
    return root.ProductIdentity?.normalizeItemCode
      ? root.ProductIdentity.normalizeItemCode(code)
      : String(code || "").trim().toLowerCase();
  }

  function getItemCode(candidate = {}) {
    const top = String(candidate.itemCode || "").trim();
    const nested = String(candidate.product?.itemCode || "").trim();
    return top && nested && normalizeItemCode(top) !== normalizeItemCode(nested) ? "" : top || nested;
  }

  function savedTime(candidate) {
    const raw = String(candidate.savedAt || "").trim();
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isEligible(candidate, postedCodes, normalizeCode) {
    const code = getItemCode(candidate);
    return candidate.destination !== "threads_only"
      && ["投稿待ち", "紹介文作成済み", "紹介文未作成"].includes(candidate.postStatus)
      && !["投稿済み", "保留", "対象外"].includes(candidate.status)
      && !candidate.postedAt && code && !postedCodes.has(normalizeCode(code))
      && !["processing", "result_check_required", "posted_confirmed", "duplicate_confirmed"].includes(candidate.roomAttempt?.status);
  }

  function getEligibleRoomCandidates(candidates = [], history = []) {
    const postedCodes = new Set(history.flatMap((entry) => [entry.itemCode, entry.product?.itemCode]
      .map(normalizeItemCode).filter(Boolean)));
    const roomCandidates = candidates.filter((candidate) => candidate.destination !== "threads_only");
    const blockedCodes = new Set(roomCandidates.filter((candidate) => {
      const status = candidate.roomAttempt?.status;
      return ["投稿済み", "ROOM重複確認済み"].includes(candidate.postStatus)
        || candidate.status === "投稿済み" || Boolean(candidate.postedAt)
        || ["processing", "result_check_required", "posted_confirmed", "duplicate_confirmed"].includes(status);
    }).map((candidate) => normalizeItemCode(getItemCode(candidate))).filter(Boolean));
    // Missing/invalid dates stay missing. They follow dated candidates, then use ID as a stable tie-breaker.
    const eligible = candidates.filter((candidate) => {
      const normalizedCode = normalizeItemCode(getItemCode(candidate));
      return isEligible(candidate, postedCodes, normalizeItemCode) && normalizedCode && !blockedCodes.has(normalizedCode);
    }).sort((a, b) => {
      const left = savedTime(a);
      const right = savedTime(b);
      if (left !== null && right !== null && left !== right) return left - right;
      if (left === null && right !== null) return 1;
      if (left !== null && right === null) return -1;
      return String(a.id || "").localeCompare(String(b.id || ""), "ja", { numeric: true })
        || getItemCode(a).localeCompare(getItemCode(b));
    });

    // A candidate can be queued only when its ID is unique and its itemCode
    // has not already been claimed by an older eligible candidate.
    const idCounts = new Map();
    candidates.forEach((candidate) => {
      const id = String(candidate.id || "").trim();
      if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
    });
    const seenItemCodes = new Set();
    return eligible.filter((candidate) => {
      const id = String(candidate.id || "").trim();
      const normalizedCode = normalizeItemCode(getItemCode(candidate));
      if (!id || idCounts.get(id) !== 1 || !normalizedCode || seenItemCodes.has(normalizedCode)) return false;
      seenItemCodes.add(normalizedCode);
      return true;
    });
  }

  function buildRoomSequentialQueue(candidates = [], requestedCount, history = [], options = {}) {
    if (!Number.isInteger(requestedCount) || requestedCount < 1) {
      return { ok: false, error: "処理件数は1以上の整数で指定してください。" };
    }
    const eligible = getEligibleRoomCandidates(candidates, history);
    const successTarget = options.successTarget === true;
    if (!successTarget && eligible.length < requestedCount) {
      return { ok: false, error: `指定件数 ${requestedCount}件に対して、投稿可能な保存済み候補は${eligible.length}件です。件数を調整してください。` };
    }
    const entries = [];
    const ids = new Set();
    const itemCodes = new Set();
    const normalizeCode = normalizeItemCode;
    // A success-target queue must be able to pass confirmed failures without
    // counting them toward the requested number of successful ROOM posts.
    const selected = successTarget ? eligible : eligible.slice(0, requestedCount);
    for (const candidate of selected) {
      const id = String(candidate.id || "").trim();
      const itemCode = getItemCode(candidate);
      if (!id || !itemCode) return { ok: false, error: "候補IDまたはitemCodeがない候補があるため連続処理を開始できません。" };
      if (ids.has(id)) return { ok: false, error: "候補IDが重複しているため連続処理を開始できません。" };
      if (itemCodes.has(normalizeCode(itemCode))) {
        if (successTarget) continue;
        return { ok: false, error: "itemCodeが重複しているため連続処理を開始できません。" };
      }
      ids.add(id);
      itemCodes.add(normalizeCode(itemCode));
      entries.push(Object.freeze({ candidateId: id, itemCode }));
    }
    return { ok: true, entries: Object.freeze(entries), successTarget, eligibleCount: eligible.length };
  }

  function resolveRoomQueueCandidate(entry, candidates = []) {
    if (!entry?.candidateId || !entry?.itemCode) return { ok: false, error: "連続キューの候補IDまたはitemCodeがありません。" };
    const matches = candidates.filter((candidate) => candidate.id === entry.candidateId);
    if (matches.length !== 1) return { ok: false, error: "候補IDに一致する商品を一意に特定できません。" };
    const candidate = matches[0];
    if (getItemCode(candidate) !== entry.itemCode) return { ok: false, error: "候補IDに紐づくitemCodeが開始時と一致しません。" };
    if (candidate.destination === "threads_only") return { ok: false, error: "ROOM投稿対象外の商品が連続キューに含まれています。" };
    return { ok: true, candidate };
  }

  function advanceRoomSequentialQueue(queue, currentIndex, currentCandidateId, candidates = []) {
    const currentEntry = queue?.[currentIndex];
    if (!currentEntry || currentEntry.candidateId !== currentCandidateId) {
      return { ok: false, error: "現在の商品が連続キューの対象と一致しません。" };
    }
    const currentResult = resolveRoomQueueCandidate(currentEntry, candidates);
    if (!currentResult.ok) return currentResult;
    if (currentResult.candidate.postStatus !== "投稿済み") {
      return { ok: false, error: "現在の商品が投稿済みと確認できないため次へ進みません。" };
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) return { ok: true, done: true, nextIndex };
    const nextEntry = queue[nextIndex];
    const nextResult = resolveRoomQueueCandidate(nextEntry, candidates);
    if (!nextResult.ok) return nextResult;
    if (!isEligible(nextResult.candidate, new Set(), (code) => String(code || "").trim().toLowerCase())) {
      return { ok: false, error: "次候補が投稿可能な状態ではないため連続処理を停止しました。" };
    }
    return { ok: true, done: false, nextIndex, entry: nextEntry, candidate: nextResult.candidate };
  }

  function formatRoomSequentialProgress(candidate, queueState) {
    if (!candidate) return queueState?.status === "active"
      ? "保存上ACTIVE・実行状態未確認（固定キューと候補の対応を確認してください）。"
      : "処理対象の商品はありません。";
    const queueStateLabel = queueState?.status === "active"
      ? " / キュー：保存上ACTIVE・実行状態未確認"
      : queueState?.status ? ` / 保存キュー状態：${queueState.status}` : "";
    const entry = queueState?.entries?.[queueState.currentIndex];
    if (queueState?.policy === "successful_posts") {
      const matches = entry?.candidateId === candidate.id && entry.itemCode === getItemCode(candidate);
      return `投稿成功目標：${queueState.successCount || 0} / ${queueState.requestedCount}件・失敗 ${queueState.failureCount || 0}件・削除 ${queueState.deletedCount || 0}件・結果不明保留 ${queueState.unknownCount || 0}件・残り候補 ${queueState.entries?.length || 0}件 / 現在：${matches ? candidate.title || candidate.product?.itemName || "商品名未確認" : "候補ID・itemCode未確認"}（${candidate.postStatus || "未確認"}）${queueStateLabel}`;
    }
    if (entry?.candidateId === candidate.id && entry.itemCode === getItemCode(candidate)) {
      return `現在の処理商品：${candidate.title || candidate.product?.itemName || "商品名未確認"}（${queueState.currentIndex + 1} / ${queueState.entries.length}件） / 状態：${candidate.postStatus || "未確認"}${queueStateLabel}`;
    }
    return `現在の処理商品：${candidate.title || candidate.product?.itemName || "商品名未確認"} / 状態：${candidate.postStatus || "未確認"}（開始時のキュー件数は復元できません）${queueStateLabel}`;
  }

  root.RoomSequentialQueue = Object.freeze({ getEligibleRoomCandidates, buildRoomSequentialQueue, resolveRoomQueueCandidate, advanceRoomSequentialQueue, formatRoomSequentialProgress });
})(typeof window !== "undefined" ? window : globalThis);
