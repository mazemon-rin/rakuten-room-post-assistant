(function exposeDuplicateDetection(root) {
  const identity = root.ProductIdentity;

  function isRoomCandidate(item = {}) {
    return item.destination !== "threads_only";
  }

  function postedHistoryMatch(product, history = []) {
    return history.some((entry) => {
      const historyCodes = identity.getItemCodes(entry);
      const productCodes = identity.getItemCodes(product);
      if (historyCodes.length && productCodes.length) {
        return historyCodes.some((code) => productCodes.includes(code));
      }
      return identity.rankingIdentity(entry.product || entry) === identity.rankingIdentity(product);
    });
  }

  function findDuplicate(product, candidates = [], history = [], ignoreId = "", formatDate = defaultFormatDate) {
    const allItems = [...candidates.filter(isRoomCandidate), ...history].filter((item) => item.id !== ignoreId);
    const productCodes = identity.getItemCodes(product);
    const productIdentity = identity.rankingIdentity(product);
    const found = allItems.find((item) => {
      const itemCodes = identity.getItemCodes(item);
      if (productCodes.length && itemCodes.length) return itemCodes.some((code) => productCodes.includes(code));
      return identity.rankingIdentity(item.product || item) === productIdentity;
    });
    if (!found) return "";
    return `この商品は${formatDate(found.postedAt || found.savedAt)}に${found.postedAt ? "投稿済み" : "保存済み"}です。`;
  }

  function canSaveRoomCandidate(product, candidates = [], history = [], ignoreId = "", formatDate = defaultFormatDate) {
    return !findDuplicate(product, candidates, history, ignoreId, formatDate);
  }

  function isVisibleRoomCandidate(item, history = []) {
    return isRoomCandidate(item) && !postedHistoryMatch(item, history);
  }

  function defaultFormatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("ja-JP");
  }

  root.DuplicateDetection = Object.freeze({
    postedHistoryMatch,
    findDuplicate,
    canSaveRoomCandidate,
    isVisibleRoomCandidate
  });
})(typeof window !== "undefined" ? window : globalThis);
