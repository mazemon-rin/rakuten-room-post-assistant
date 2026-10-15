(function exposeRoomProcessingState(root) {
  const ACTIVE_STATUSES = new Set(["Codex処理中", "確認待ち", "要手動確認"]);

  function getItemCode(item = {}) {
    return String(item.itemCode || item.product?.itemCode || "").trim();
  }

  function findPendingRelation(candidate, pending) {
    if (!pending) return "なし";
    const candidateIdMatch = Boolean(candidate.id && pending.candidateId && candidate.id === pending.candidateId);
    const candidateCode = getItemCode(candidate);
    const pendingCode = String(pending.itemCode || "").trim();
    const itemCodeMatch = Boolean(candidateCode && pendingCode && candidateCode === pendingCode);
    if (candidateIdMatch && itemCodeMatch) return "候補ID・itemCodeとも一致";
    if (candidateIdMatch) return "候補ID一致・itemCode不一致";
    if (itemCodeMatch) return "itemCode一致・候補ID不一致";
    return "一致なし";
  }

  function inspectRoomProcessingState(candidates = [], history = [], pending = null, options = {}) {
    const isRoomCandidate = options.isRoomCandidate || (() => true);
    const isVisibleRoomCandidate = options.isVisibleRoomCandidate || (() => true);
    const postedHistoryMatch = options.postedHistoryMatch || (() => false);
    const roomCandidates = candidates.filter(isRoomCandidate);
    const issues = roomCandidates
      .filter((candidate) => ACTIVE_STATUSES.has(candidate.postStatus))
      .map((candidate) => {
        const historyMatch = history.find((entry) => postedHistoryMatch(candidate, [entry])) || null;
        const visible = Boolean(isVisibleRoomCandidate(candidate));
        const pendingRelation = findPendingRelation(candidate, pending);
        const hiddenReason = visible
          ? "非表示ではありません（検索・状態フィルターを確認）"
          : historyMatch
            ? "投稿履歴との重複として候補一覧から非表示"
            : "候補一覧の表示条件外（理由未確認）";
        return {
          candidateId: candidate.id || "",
          title: String(candidate.title || candidate.product?.itemName || "未確認"),
          itemCode: getItemCode(candidate) || "未確認",
          postStatus: String(candidate.postStatus || "未確認"),
          visible,
          hiddenReason,
          historyMatch: historyMatch
            ? { title: String(historyMatch.title || historyMatch.product?.itemName || "未確認"), itemCode: getItemCode(historyMatch) || "未確認" }
            : null,
          pendingRelation
        };
      });

    let pendingIssue = null;
    let pendingStatus = null;
    if (pending) {
      const byId = roomCandidates.find((candidate) => candidate.id && candidate.id === pending.candidateId) || null;
      const byCode = roomCandidates.find((candidate) => getItemCode(candidate) && getItemCode(candidate) === String(pending.itemCode || "").trim()) || null;
      const linked = byId || byCode;
      const relation = linked ? findPendingRelation(linked, pending) : "一致する候補なし";
      pendingStatus = {
        title: String(pending.title || "未確認"),
        itemCode: String(pending.itemCode || "未確認"),
        candidateId: String(pending.candidateId || "未確認"),
        relation
      };
      if (!linked || relation !== "候補ID・itemCodeとも一致") {
        pendingIssue = pendingStatus;
      }
    }

    return { issues, pendingIssue, pendingStatus };
  }

  function isPendingLinkedToCandidate(candidate, pending) {
    return findPendingRelation(candidate, pending) === "候補ID・itemCodeとも一致";
  }

  function isPendingAssociatedWithCandidate(candidate, pending) {
    return findPendingRelation(candidate, pending) !== "なし" && findPendingRelation(candidate, pending) !== "一致なし";
  }

  root.RoomProcessingState = Object.freeze({ inspectRoomProcessingState, isPendingLinkedToCandidate, isPendingAssociatedWithCandidate });
})(typeof window !== "undefined" ? window : globalThis);
