(function exposeRoomCodexBridge(root) {
  const QUEUE_STATUS = Object.freeze({
    ACTIVE: "active",
    ADVANCE_READY: "advance_ready",
    RESULT_CHECK_REQUIRED: "result_check_required",
    HUMAN_ACTION_REQUIRED: "human_action_required",
    COMPLETED: "completed",
    STOPPED: "stopped"
  });

  const BLOCKING_ATTEMPTS = new Set(["processing", "result_check_required"]);

  function japaneseCount(value) {
    const text = String(value || "");
    if (/^\d+$/.test(text)) return Number(text);
    const digit = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
    if (!text.includes("十")) return [...text].reduce((total, char) => total * 10 + (digit[char] ?? NaN), 0);
    const [tens = "", ones = ""] = text.split("十");
    if (text.split("十").length > 2) return NaN;
    const tensValue = tens ? digit[tens] : 1;
    const onesValue = ones ? digit[ones] : 0;
    return Number.isFinite(tensValue) && Number.isFinite(onesValue) ? tensValue * 10 + onesValue : NaN;
  }

  function parseRequestedCount(prompt = "") {
    const text = String(prompt || "").replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
    const matches = [...text.matchAll(/([0-9]{1,3}|[〇零一二三四五六七八九十]+)\s*件(?!目)/g)];
    const counts = [...new Set(matches.map((match) => japaneseCount(match[1])).filter(Number.isInteger))];
    if (counts.length !== 1 || counts[0] < 1 || counts[0] > 100) {
      return { ok: false, error: counts.length > 1 ? "投稿件数が複数あり、指定を一意に判断できません。" : "投稿件数を「3件」の形式で1つ指定してください。" };
    }
    return { ok: true, requestedCount: counts[0] };
  }

  function hasExplicitPostingIntent(prompt = "") {
    const text = String(prompt || "");
    if (/投稿しない|実投稿しない|投稿は禁止|投稿は行わない|確認だけ|準備だけ|文章作成だけ/.test(text)) return false;
    return /(?:ROOM|楽天ROOM)[^。\n]{0,70}(?:投稿|実投稿)[^。\n]{0,35}(?:してください|して|する|実行|実施|開始|進めて)|(?:連続実投稿|連続投稿を実行|実投稿してください)/i.test(text);
  }

  function getEntryCode(entry = {}) {
    return String(entry.itemCode || "").trim();
  }

  function getCandidateCode(candidate = {}) {
    const top = String(candidate.itemCode || "").trim();
    const nested = String(candidate.product?.itemCode || "").trim();
    return top && nested && normalizeItemCode(top) !== normalizeItemCode(nested) ? "" : top || nested;
  }

  function normalizeItemCode(code) {
    return root.ProductIdentity?.normalizeItemCode
      ? root.ProductIdentity.normalizeItemCode(code)
      : String(code || "").trim().toLowerCase();
  }

  function createQueue(entries = [], requestedCount, createdAt, queueId, options = {}) {
    const successTarget = options.successTarget === true;
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || !entries.length
        || (!successTarget && entries.length !== requestedCount)) {
      return { ok: false, error: "投稿目標とキュー候補の条件が一致しません。" };
    }
    const ids = new Set();
    const codes = new Set();
    const fixedEntries = [];
    for (const source of entries) {
      const candidateId = String(source?.candidateId || "").trim();
      const itemCode = getEntryCode(source);
      if (!candidateId || !itemCode || ids.has(candidateId) || codes.has(itemCode)) {
        return { ok: false, error: "固定キューに候補ID・itemCodeの欠落または重複があります。" };
      }
      ids.add(candidateId);
      codes.add(itemCode);
      fixedEntries.push({ candidateId, itemCode, outcome: "pending" });
    }
    return {
      ok: true,
      queue: {
        version: successTarget ? 2 : 1,
        policy: successTarget ? "successful_posts" : "fixed_items",
        queueId: String(queueId || "").trim(),
        requestedCount,
        successCount: 0,
        failureCount: 0,
        deletedCount: 0,
        unknownCount: 0,
        createdAt: String(createdAt || ""),
        currentIndex: 0,
        mode: "continuous",
        status: QUEUE_STATUS.ACTIVE,
        stopReason: "",
        operationClosedAt: null,
        operationCloseReason: "",
        entries: fixedEntries
      }
    };
  }

  function isOperationClosed(attempt) {
    return Boolean(attempt?.roomOperationClosedAt && Date.parse(attempt.roomOperationClosedAt) >= 0
      && String(attempt.roomOperationCloseReason || "").trim());
  }

  function matchStaleQueueCurrent(queue, candidate) {
    const openStatuses = [QUEUE_STATUS.ACTIVE, QUEUE_STATUS.ADVANCE_READY,
      QUEUE_STATUS.RESULT_CHECK_REQUIRED, QUEUE_STATUS.HUMAN_ACTION_REQUIRED];
    if (!queue || !openStatuses.includes(queue.status) || !Array.isArray(queue.entries)
        || !Number.isInteger(queue.currentIndex) || queue.currentIndex < 0) {
      return { ok: false, error: "保存キューの状態または現在位置を確認できません。" };
    }
    const entry = queue.entries[queue.currentIndex];
    const candidateId = String(candidate?.id || "").trim();
    const topCode = String(candidate?.itemCode || "").trim();
    const nestedCode = String(candidate?.product?.itemCode || "").trim();
    const candidateCode = topCode && nestedCode && topCode !== nestedCode ? "" : topCode || nestedCode;
    if (!entry?.candidateId || !entry.itemCode || !candidateId || !candidateCode
        || entry.candidateId !== candidateId || normalizeItemCode(entry.itemCode) !== normalizeItemCode(candidateCode)) {
      return { ok: false, error: "保存キューの現在候補ID・itemCodeが一致しません。" };
    }
    return { ok: true, entry };
  }

  function isSavedQueueConsistent(queue, candidates = []) {
    if (!queue) return true;
    const statuses = Object.values(QUEUE_STATUS);
    const entries = queue.entries;
    if (!statuses.includes(queue.status) || !Array.isArray(entries)
        || (!entries.length && queue.status !== QUEUE_STATUS.COMPLETED)
        || !queue.queueId || !Number.isInteger(queue.requestedCount) || queue.requestedCount < 1
        || (queue.policy !== "successful_posts" && queue.requestedCount !== entries.length)
        || (queue.policy === "successful_posts" && (queue.version !== 2
          || !Number.isInteger(queue.successCount) || queue.successCount < 0
          || !Number.isInteger(queue.failureCount) || queue.failureCount < 0
          || !Number.isInteger(queue.deletedCount) || queue.deletedCount < 0
          || (queue.unknownCount !== undefined && (!Number.isInteger(queue.unknownCount) || queue.unknownCount < 0))))
        || !Number.isInteger(queue.currentIndex) || queue.currentIndex < 0
        || (entries.length ? queue.currentIndex >= entries.length : queue.status !== QUEUE_STATUS.COMPLETED)) return false;
    const ids = new Set();
    const codes = new Set();
    for (const entry of entries) {
      const id = String(entry?.candidateId || "").trim();
      const code = getEntryCode(entry);
      if (!id || !code || ids.has(id) || codes.has(normalizeItemCode(code))) return false;
      ids.add(id);
      codes.add(normalizeItemCode(code));
      const matches = candidates.filter((candidate) => String(candidate?.id || "") === id);
      if (matches.length !== 1) return false;
      const candidate = matches[0];
      const topCode = String(candidate.itemCode || "").trim();
      const nestedCode = String(candidate.product?.itemCode || "").trim();
      const candidateCode = topCode && nestedCode && topCode !== nestedCode ? "" : topCode || nestedCode;
      if (!candidateCode || normalizeItemCode(candidateCode) !== normalizeItemCode(code)) return false;
    }
    return true;
  }

  function canStartQueue(candidates = [], entries = [], previousQueue = null) {
    if (!isSavedQueueConsistent(previousQueue, candidates)) {
      return { ok: false, error: "保存済みキューの件数・候補ID・itemCodeを整合確認できません。" };
    }
    if ([QUEUE_STATUS.ACTIVE, QUEUE_STATUS.ADVANCE_READY, QUEUE_STATUS.RESULT_CHECK_REQUIRED,
      QUEUE_STATUS.HUMAN_ACTION_REQUIRED].includes(previousQueue?.status)) {
      return { ok: false, error: "前のROOMキューが継続中または人間操作待ちです。" };
    }
    const targetIds = new Set();
    const targetCodes = new Set();
    for (const entry of entries) {
      const id = String(entry?.candidateId || "").trim();
      const code = normalizeItemCode(getEntryCode(entry));
      const matches = candidates.filter((candidate) => String(candidate?.id || "") === id);
      if (!id || !code || matches.length !== 1 || normalizeItemCode(getCandidateCode(matches[0])) !== code
          || targetIds.has(id) || targetCodes.has(code)) {
        return { ok: false, error: "新しいキューの候補ID・itemCodeを一意に照合できません。" };
      }
      targetIds.add(id);
      targetCodes.add(code);
    }
    for (const candidate of candidates) {
      const attempt = candidate?.roomAttempt;
      if (!BLOCKING_ATTEMPTS.has(attempt?.status)) continue;
      const candidateCode = normalizeItemCode(getCandidateCode(candidate));
      if (attempt.candidateId && attempt.candidateId !== candidate.id) {
        return { ok: false, error: "ROOM試行の候補IDが保存候補と一致しません。" };
      }
      if (attempt.itemCode && normalizeItemCode(attempt.itemCode) !== candidateCode) {
        return { ok: false, error: "ROOM試行のitemCodeが保存候補と一致しません。" };
      }
      if (attempt.status === "result_check_required" && isOperationClosed(attempt)) {
        if (targetCodes.has(candidateCode)) return { ok: false, error: "投稿結果不明の同一itemCodeは再投稿できません。" };
        continue;
      }
      return { ok: false, error: "ROOM操作の終了を確認できない処理中・結果確認待ち商品があります。" };
    }
    return { ok: true };
  }

  function recordOutcome(queue, candidateId, itemCode, outcome, proof = {}) {
    const entry = queue?.entries?.[queue.currentIndex];
    if (![QUEUE_STATUS.ACTIVE, QUEUE_STATUS.HUMAN_ACTION_REQUIRED, QUEUE_STATUS.RESULT_CHECK_REQUIRED].includes(queue?.status)
        || !entry || entry.candidateId !== candidateId || entry.itemCode !== itemCode) {
      return { ok: false, error: "現在の商品が固定キューの候補ID・itemCodeと一致しません。" };
    }
    const next = structuredClone(queue);
    const current = next.entries[next.currentIndex];
    if (outcome === "posted") {
      if (proof.roomCompletionConfirmed !== true || proof.historySaved !== true) {
        return { ok: false, error: "ROOM完了と履歴保存の両方を確認できないため成功を記録できません。" };
      }
      current.outcome = "posted";
      if (next.policy === "successful_posts") {
        next.successCount += 1;
        next.entries.shift();
        next.currentIndex = 0;
        next.status = proof.stopAfterHumanResolution === true && next.successCount < next.requestedCount && next.entries.length
          ? QUEUE_STATUS.STOPPED
          : next.successCount >= next.requestedCount || !next.entries.length ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.ACTIVE;
        next.stopReason = proof.stopAfterHumanResolution === true && next.status === QUEUE_STATUS.STOPPED
          ? "結果不明の商品を人間確認で整理しました。旧キューは停止しました。次は新しい明示指示で開始してください。"
          : next.successCount >= next.requestedCount
          ? "指定した投稿成功件数に到達しました。"
          : next.entries.length ? "投稿成功を保存しました。次候補へ進みます。" : "投稿可能な候補がなくなりました。";
      } else {
        next.status = proof.stopAfterHumanResolution === true ? QUEUE_STATUS.STOPPED
          : next.currentIndex + 1 >= next.entries.length ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.ADVANCE_READY;
        if (proof.stopAfterHumanResolution === true) next.stopReason = "結果不明の商品を人間確認で整理しました。旧キューは停止しました。次は新しい明示指示で開始してください。";
      }
    } else if (outcome === "duplicate") {
      if (proof.duplicateWarningConfirmed !== true || !proof.operationClosedAt || !String(proof.closeReason || "").trim()) {
        return { ok: false, error: "ROOM重複警告と画面終了の根拠を確認できないため次へ進めません。" };
      }
      current.outcome = "duplicate";
      next.operationClosedAt = String(proof.operationClosedAt);
      next.operationCloseReason = String(proof.closeReason).trim();
      if (next.policy === "successful_posts") {
        next.failureCount += 1;
        next.deletedCount += 1;
        next.entries.shift();
        next.currentIndex = 0;
        next.status = proof.stopAfterHumanResolution === true && next.entries.length
          ? QUEUE_STATUS.STOPPED
          : next.successCount >= next.requestedCount || !next.entries.length ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.ACTIVE;
        next.stopReason = proof.stopAfterHumanResolution === true && next.status === QUEUE_STATUS.STOPPED
          ? "結果不明の商品をROOM重複確認で整理しました。旧キューは停止しました。次は新しい明示指示で開始してください。"
          : next.entries.length ? "重複を確認して対象を除外しました。次候補へ進みます。" : "投稿可能な候補がなくなりました。";
      } else {
        next.status = proof.stopAfterHumanResolution === true ? QUEUE_STATUS.STOPPED
          : next.currentIndex + 1 >= next.entries.length ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.ADVANCE_READY;
        if (proof.stopAfterHumanResolution === true) next.stopReason = "結果不明の商品をROOM重複確認で整理しました。旧キューは停止しました。次は新しい明示指示で開始してください。";
      }
    } else if (outcome === "not_posted") {
      if (proof.humanConfirmed !== true || !proof.operationClosedAt || !String(proof.closeReason || "").trim()) {
        return { ok: false, error: "ROOM側の未投稿確認と操作終了の根拠が必要です。" };
      }
      current.outcome = "not_posted_confirmed";
      next.operationClosedAt = String(proof.operationClosedAt);
      next.operationCloseReason = String(proof.closeReason).trim();
      next.status = QUEUE_STATUS.STOPPED;
      next.stopReason = "ROOM側で未投稿を確認しました。旧キューは停止しました。次は新しい明示指示で開始してください。";
    } else if (outcome === "unknown") {
      current.outcome = "result_check_required";
      next.status = QUEUE_STATUS.RESULT_CHECK_REQUIRED;
      next.stopReason = "投稿結果を確認できないため停止しました。";
      if (proof.operationClosedAt && String(proof.closeReason || "").trim()) {
        next.operationClosedAt = String(proof.operationClosedAt);
        next.operationCloseReason = String(proof.closeReason).trim();
      }
    } else if (outcome === "original_photo") {
      current.outcome = "human_action_required";
      next.status = QUEUE_STATUS.HUMAN_ACTION_REQUIRED;
      next.stopReason = "オリジナル写真の追加を人間へ引き渡しました。";
    } else {
      current.outcome = "stopped";
      next.status = QUEUE_STATUS.STOPPED;
      next.stopReason = String(proof.reason || "投稿処理を停止しました。");
    }
    return { ok: true, queue: next };
  }

  function recordConfirmedFailure(queue, candidateId, itemCode, reasonCode, proof = {}) {
    const allowedReasons = new Set(["product_missing", "duplicate", "identity_mismatch", "discontinued", "confirmed_unposted_error"]);
    const entry = queue?.entries?.[queue.currentIndex];
    if (queue?.policy !== "successful_posts" || queue.status !== QUEUE_STATUS.ACTIVE
        || !entry || entry.candidateId !== candidateId || entry.itemCode !== itemCode) {
      return { ok: false, error: "現在の商品が成功目標キューと一致しません。" };
    }
    if (!allowedReasons.has(reasonCode) || !String(proof.evidence || "").trim()
        || proof.roomOperationMayBeActive !== false || !Number.isFinite(Date.parse(proof.confirmedAt))
        || !Number.isFinite(Date.parse(proof.operationClosedAt))
        || !String(proof.closeReason || "").trim()) {
      return { ok: false, error: "確認済みの投稿不能理由と根拠が必要です。" };
    }
    const next = structuredClone(queue);
    next.failureCount += 1;
    next.deletedCount += 1;
    next.entries.shift();
    next.currentIndex = 0;
    next.status = next.successCount >= next.requestedCount || !next.entries.length
      ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.ACTIVE;
    next.stopReason = next.entries.length ? "投稿不能を確認して候補を除外しました。次候補へ進みます。" : "投稿可能な候補がなくなりました。";
    return { ok: true, queue: next, done: next.status === QUEUE_STATUS.COMPLETED };
  }

  function releaseClosedUnknown(queue, candidateId, itemCode, attempt, proof = {}) {
    const entry = queue?.entries?.[queue.currentIndex];
    if (queue?.status !== QUEUE_STATUS.RESULT_CHECK_REQUIRED || !entry
        || entry.candidateId !== candidateId || normalizeItemCode(entry.itemCode) !== normalizeItemCode(itemCode)
        || attempt?.status !== "result_check_required" || attempt.candidateId !== candidateId
        || normalizeItemCode(attempt.itemCode) !== normalizeItemCode(itemCode)
        || !isOperationClosed(attempt) || !String(proof.evidence || "").trim()
        || (proof.operationClosedAt && proof.operationClosedAt !== attempt.roomOperationClosedAt)) {
      return { ok: false, error: "結果確認待ち商品の候補ID・itemCode、ROOM操作終了の根拠を照合できません。キューは進めません。" };
    }
    const next = structuredClone(queue);
    next.entries.shift();
    next.currentIndex = 0;
    next.unknownCount = (Number.isInteger(next.unknownCount) ? next.unknownCount : 0) + 1;
    next.operationClosedAt = attempt.roomOperationClosedAt;
    next.operationCloseReason = attempt.roomOperationCloseReason;
    next.status = next.entries.length ? QUEUE_STATUS.ACTIVE : QUEUE_STATUS.COMPLETED;
    next.stopReason = next.entries.length
      ? "投稿結果不明の商品は保留・再投稿禁止のまま、ROOM操作終了を確認したため固定済みの別候補へ進みます。"
      : "投稿結果不明の商品を保留しました。固定キューに次候補はありません。";
    return { ok: true, queue: next, done: next.status === QUEUE_STATUS.COMPLETED,
      entry: next.entries[0] || null };
  }

  function advanceQueue(queue) {
    if (queue?.status !== QUEUE_STATUS.ADVANCE_READY
        || !["posted", "duplicate"].includes(queue.entries?.[queue.currentIndex]?.outcome)) {
      return { ok: false, error: "ROOM結果が保存・確認済みではないため次候補へ進みません。" };
    }
    const next = structuredClone(queue);
    next.currentIndex += 1;
    if (next.currentIndex >= next.entries.length) next.status = QUEUE_STATUS.COMPLETED;
    else {
      next.status = QUEUE_STATUS.ACTIVE;
      next.stopReason = "";
    }
    return { ok: true, queue: next, done: next.status === QUEUE_STATUS.COMPLETED,
      entry: next.entries[next.currentIndex] || null };
  }

  root.RoomCodexBridge = Object.freeze({ QUEUE_STATUS, parseRequestedCount, hasExplicitPostingIntent,
    createQueue, isOperationClosed, matchStaleQueueCurrent, isSavedQueueConsistent, canStartQueue, recordOutcome,
    recordConfirmedFailure, releaseClosedUnknown, advanceQueue });
})(typeof window !== "undefined" ? window : globalThis);
