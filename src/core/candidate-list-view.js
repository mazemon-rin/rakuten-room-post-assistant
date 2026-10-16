(function exposeCandidateListView(root) {
  const REVIEW_STATUSES = new Set([
    "Codex処理中", "確認待ち", "結果確認待ち", "要手動確認", "エラー", "保留"
  ]);
  const UNRESOLVED_ATTEMPTS = new Set(["processing", "result_check_required"]);
  const CONFIRMED_ATTEMPTS = new Set(["posted_confirmed", "not_posted_confirmed", "duplicate_confirmed"]);
  const POSTED_STATUSES = new Set(["投稿済み", "ROOM重複確認済み"]);

  function isReviewCandidate(candidate = {}) {
    return REVIEW_STATUSES.has(candidate.postStatus)
      || REVIEW_STATUSES.has(candidate.status)
      || UNRESOLVED_ATTEMPTS.has(candidate.roomAttempt?.status)
      || Boolean(candidate.roomAttempt && !CONFIRMED_ATTEMPTS.has(candidate.roomAttempt.status));
  }

  function isPostedCandidate(candidate = {}, history = []) {
    return POSTED_STATUSES.has(candidate.postStatus)
      || candidate.status === "投稿済み"
      || root.DuplicateDetection.postedHistoryMatch(candidate, history);
  }

  function filterRoomCandidates(candidates = [], options = {}) {
    const mode = options.mode || "unposted";
    const keyword = String(options.keyword || "").trim().toLocaleLowerCase("ja-JP");
    const history = Array.isArray(options.history) ? options.history : [];
    const isRoomCandidate = options.isRoomCandidate || ((candidate) => candidate.destination !== "threads_only");

    return candidates.filter((candidate) => {
      if (!isRoomCandidate(candidate)) return false;
      const searchable = [candidate.title, candidate.shopName, candidate.memo].join(" ").toLocaleLowerCase("ja-JP");
      if (keyword && !searchable.includes(keyword)) return false;
      if (mode === "all") return true;
      if (mode === "review") return isReviewCandidate(candidate);
      if (options.postableCandidateIds instanceof Set) return options.postableCandidateIds.has(String(candidate.id || ""));
      return !isPostedCandidate(candidate, history) && !isReviewCandidate(candidate);
    });
  }

  function summarizeRoomCandidates(candidates = [], options = {}) {
    const history = Array.isArray(options.history) ? options.history : [];
    const isRoomCandidate = options.isRoomCandidate || ((candidate) => candidate.destination !== "threads_only");
    const postableCandidateIds = options.postableCandidateIds instanceof Set ? options.postableCandidateIds : new Set();
    const roomCandidates = candidates.filter(isRoomCandidate);
    const review = roomCandidates.filter(isReviewCandidate).length;
    const posted = roomCandidates.filter((candidate) => !isReviewCandidate(candidate) && isPostedCandidate(candidate, history)).length;
    const postable = roomCandidates.filter((candidate) => postableCandidateIds.has(String(candidate.id || ""))).length;
    return { total: roomCandidates.length, postable, review, posted,
      other: Math.max(0, roomCandidates.length - postable - review - posted) };
  }

  root.CandidateListView = Object.freeze({ filterRoomCandidates, isReviewCandidate, isPostedCandidate, summarizeRoomCandidates });
})(typeof window !== "undefined" ? window : globalThis);
