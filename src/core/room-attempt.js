(function exposeRoomAttempt(root) {
  const STATUS = Object.freeze({
    PROCESSING: "processing",
    RESULT_CHECK_REQUIRED: "result_check_required",
    POSTED_CONFIRMED: "posted_confirmed",
    NOT_POSTED_CONFIRMED: "not_posted_confirmed",
    DUPLICATE_CONFIRMED: "duplicate_confirmed"
  });
  const SOURCE = Object.freeze({
    COMPLETION: "room_completion_screen",
    HISTORY: "room_post_history",
    NOT_POSTED: "room_not_posted_check",
    DUPLICATE: "room_duplicate_warning"
  });
  const SOURCE_LABELS = Object.freeze({
    [SOURCE.COMPLETION]: "ROOM投稿完了画面",
    [SOURCE.HISTORY]: "ROOM投稿履歴",
    [SOURCE.NOT_POSTED]: "ROOM側で未投稿を確認",
    [SOURCE.DUPLICATE]: "ROOMの重複警告"
  });
  const STATUS_LABELS = Object.freeze({
    [STATUS.PROCESSING]: "処理中",
    [STATUS.RESULT_CHECK_REQUIRED]: "結果確認待ち",
    [STATUS.POSTED_CONFIRMED]: "ROOM投稿済み確認",
    [STATUS.NOT_POSTED_CONFIRMED]: "ROOM未投稿確認",
    [STATUS.DUPLICATE_CONFIRMED]: "ROOM重複確認済み"
  });

  function getItemCode(candidate = {}) {
    const top = String(candidate.itemCode || "").trim();
    const nested = String(candidate.product?.itemCode || "").trim();
    return top && nested && top !== nested ? "" : top || nested;
  }

  function isUnresolved(attempt) {
    return Boolean(attempt && (attempt.status === STATUS.PROCESSING || attempt.status === STATUS.RESULT_CHECK_REQUIRED));
  }

  function matchesCandidate(candidate = {}, attempt = candidate.roomAttempt) {
    return Boolean(attempt && String(candidate.id || "") === String(attempt.candidateId || "")
      && getItemCode(candidate) && getItemCode(candidate) === String(attempt.itemCode || ""));
  }

  function create(candidate, attemptId, startedAt) {
    const itemCode = getItemCode(candidate);
    if (!candidate?.id || !itemCode || !attemptId || !startedAt) return null;
    if (candidate.roomAttempt && (!matchesCandidate(candidate)
        || ![STATUS.NOT_POSTED_CONFIRMED, STATUS.POSTED_CONFIRMED, STATUS.DUPLICATE_CONFIRMED].includes(candidate.roomAttempt.status))) return null;
    // A confirmed post or duplicate cannot be silently retried.
    if (candidate.roomAttempt?.status === STATUS.DUPLICATE_CONFIRMED
        || (candidate.roomAttempt?.status === STATUS.POSTED_CONFIRMED && !candidate.repostOfHistoryId)) return null;
    return { attemptId, candidateId: candidate.id, itemCode, startedAt,
      status: STATUS.PROCESSING, confirmedAt: null, confirmationSource: null };
  }

  function interrupt(candidate) {
    const attempt = candidate?.roomAttempt;
    if (!matchesCandidate(candidate) || !isUnresolved(attempt)) return null;
    return { ...attempt, status: STATUS.RESULT_CHECK_REQUIRED, confirmedAt: null, confirmationSource: null };
  }

  function confirm(candidate, status, source, confirmedAt, attemptId) {
    const sources = {
      [STATUS.POSTED_CONFIRMED]: [SOURCE.COMPLETION, SOURCE.HISTORY],
      [STATUS.NOT_POSTED_CONFIRMED]: [SOURCE.NOT_POSTED],
      [STATUS.DUPLICATE_CONFIRMED]: [SOURCE.DUPLICATE]
    };
    if (!sources[status]?.includes(source) || !confirmedAt || !getItemCode(candidate) || !candidate?.id) return null;
    const existing = candidate.roomAttempt;
    if (existing && (!matchesCandidate(candidate, existing) || !isUnresolved(existing))) return null;
    // Old candidates have no known start time. A ROOM confirmation may still resolve them.
    const attempt = existing || { attemptId, candidateId: candidate.id, itemCode: getItemCode(candidate), startedAt: null };
    if (!attempt.attemptId) return null;
    return { ...attempt, status, confirmedAt, confirmationSource: source };
  }

  root.RoomAttempt = Object.freeze({ STATUS, SOURCE, SOURCE_LABELS, STATUS_LABELS,
    getItemCode, isUnresolved, matchesCandidate, create, interrupt, confirm });
})(typeof window !== "undefined" ? window : globalThis);
