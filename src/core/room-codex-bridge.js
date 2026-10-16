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

  function normalizeItemCode(code) {
    return root.ProductIdentity?.normalizeItemCode
      ? root.ProductIdentity.normalizeItemCode(code)
      : String(code || "").trim().toLowerCase();
  }

  function createQueue(entries = [], requestedCount, createdAt, queueId) {
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || entries.length !== requestedCount) {
      return { ok: false, error: "固定キューの件数が指定件数と一致しません。" };
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
        version: 1,
        queueId: String(queueId || "").trim(),
        requestedCount,
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

  function isSavedQueueConsistent(queue, candidates = []) {
    if (!queue) return true;
    const statuses = Object.values(QUEUE_STATUS);
    const entries = queue.entries;
    if (!statuses.includes(queue.status) || !Array.isArray(entries) || !entries.length
        || !queue.queueId || queue.requestedCount !== entries.length
        || !Number.isInteger(queue.currentIndex) || queue.currentIndex < 0 || queue.currentIndex >= entries.length) return false;
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
    if ([QUEUE_STATUS.ACTIVE, QUEUE_STATUS.ADVANCE_READY, QUEUE_STATUS.HUMAN_ACTION_REQUIRED].includes(previousQueue?.status)) {
      return { ok: false, error: "前のROOMキューが継続中または人間操作待ちです。" };
    }
    const pendingCodes = new Set();
    for (const candidate of candidates) {
      const attempt = candidate?.roomAttempt;
      if (!BLOCKING_ATTEMPTS.has(attempt?.status)) continue;
      if (attempt.status === "processing" || !isOperationClosed(attempt)) {
        return { ok: false, error: "ROOM操作の終了を確認できない処理中・結果確認待ち商品があります。" };
      }
      pendingCodes.add(normalizeItemCode(attempt.itemCode));
    }
    if (entries.some((entry) => pendingCodes.has(normalizeItemCode(getEntryCode(entry))))) {
      return { ok: false, error: "結果確認待ちのitemCodeが新しいキューに含まれています。" };
    }
    if (previousQueue?.status === QUEUE_STATUS.RESULT_CHECK_REQUIRED) {
      const current = previousQueue.entries?.[previousQueue.currentIndex];
      const candidate = candidates.find((item) => item.id === current?.candidateId);
      if (!candidate || current.itemCode !== candidate.roomAttempt?.itemCode || !isOperationClosed(candidate.roomAttempt)) {
        return { ok: false, error: "前回のROOM操作終了を確認できません。" };
      }
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
      next.status = next.currentIndex + 1 >= next.entries.length ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.ADVANCE_READY;
    } else if (outcome === "duplicate") {
      if (proof.duplicateWarningConfirmed !== true || !proof.operationClosedAt || !String(proof.closeReason || "").trim()) {
        return { ok: false, error: "ROOM重複警告と画面終了の根拠を確認できないため次へ進めません。" };
      }
      current.outcome = "duplicate";
      next.operationClosedAt = String(proof.operationClosedAt);
      next.operationCloseReason = String(proof.closeReason).trim();
      next.status = next.currentIndex + 1 >= next.entries.length ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.ADVANCE_READY;
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
    createQueue, isOperationClosed, isSavedQueueConsistent, canStartQueue, recordOutcome, advanceQueue });
})(typeof window !== "undefined" ? window : globalThis);
