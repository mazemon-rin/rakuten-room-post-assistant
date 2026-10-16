(function exposeRoomSequentialQueue(root) {
  function getItemCode(candidate = {}) {
    return String(candidate.itemCode || candidate.product?.itemCode || "").trim();
  }

  function buildRoomSequentialQueue(displayedCandidates = [], requestedCount) {
    if (!Number.isInteger(requestedCount) || requestedCount < 1) {
      return { ok: false, error: "処理件数は1以上の整数で指定してください。" };
    }
    const eligible = displayedCandidates.filter((candidate) => candidate.postStatus === "投稿待ち");
    if (eligible.length < requestedCount) {
      return { ok: false, error: `指定件数 ${requestedCount}件に対して、表示中の投稿待ちは${eligible.length}件です。件数を調整してください。` };
    }
    const entries = [];
    const ids = new Set();
    const itemCodes = new Set();
    for (const candidate of eligible.slice(0, requestedCount)) {
      const id = String(candidate.id || "").trim();
      const itemCode = getItemCode(candidate);
      if (!id || !itemCode) return { ok: false, error: "候補IDまたはitemCodeがない候補があるため連続処理を開始できません。" };
      if (ids.has(id)) return { ok: false, error: "候補IDが重複しているため連続処理を開始できません。" };
      if (itemCodes.has(itemCode)) return { ok: false, error: "itemCodeが重複しているため連続処理を開始できません。" };
      ids.add(id);
      itemCodes.add(itemCode);
      entries.push(Object.freeze({ candidateId: id, itemCode }));
    }
    return { ok: true, entries: Object.freeze(entries) };
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
    if (nextResult.candidate.postStatus !== "投稿待ち") {
      return { ok: false, error: "次候補が投稿待ちではないため連続処理を停止しました。" };
    }
    return { ok: true, done: false, nextIndex, entry: nextEntry, candidate: nextResult.candidate };
  }

  function formatRoomSequentialProgress(candidate, queueState) {
    if (!candidate) return "処理対象の商品はありません。";
    const entry = queueState?.entries?.[queueState.currentIndex];
    if (entry?.candidateId === candidate.id && entry.itemCode === getItemCode(candidate)) {
      return `現在の処理商品：${candidate.title || candidate.product?.itemName || "商品名未確認"}（${queueState.currentIndex + 1} / ${queueState.entries.length}件） / 状態：${candidate.postStatus || "未確認"}`;
    }
    return `現在の処理商品：${candidate.title || candidate.product?.itemName || "商品名未確認"} / 状態：${candidate.postStatus || "未確認"}（開始時のキュー件数は復元できません）`;
  }

  root.RoomSequentialQueue = Object.freeze({ buildRoomSequentialQueue, resolveRoomQueueCandidate, advanceRoomSequentialQueue, formatRoomSequentialProgress });
})(typeof window !== "undefined" ? window : globalThis);
