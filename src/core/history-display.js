(function exposeHistoryDisplay(root) {
  function getStoredValue(record, key) {
    const value = [record?.[key], record?.product?.[key]].find((candidate) => candidate !== null && candidate !== undefined && String(candidate).trim() !== "");
    return value === undefined ? "未記録" : String(value);
  }

  function getProductUrl(record) {
    const value = [record?.itemUrl, record?.product?.itemUrl].find((candidate) => candidate !== null && candidate !== undefined && String(candidate).trim() !== "");
    return value === undefined ? "" : String(value).trim();
  }

  function isSafeProductUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  root.HistoryDisplay = Object.freeze({ getStoredValue, getProductUrl, isSafeProductUrl });
})(typeof window !== "undefined" ? window : globalThis);
