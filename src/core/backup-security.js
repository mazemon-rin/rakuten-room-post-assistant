(function exposeRoomBackupSecurity(root) {
  const sensitiveKeyFragments = Object.freeze([
    "apikey", "accesskey", "applicationid", "appid", "clientsecret", "secret",
    "token", "password", "credential", "authorization", "cookie", "privatekey"
  ]);

  function isSensitiveKey(key) {
    const normalized = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
  }

  // JSON形式の保存データをコピーし、認証情報を含むキーだけを再帰的に除外します。
  function removeSensitiveValues(value) {
    if (Array.isArray(value)) return value.map(removeSensitiveValues);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, child]) => [key, removeSensitiveValues(child)]));
  }

  function createBackupSnapshot(data) {
    return removeSensitiveValues(data);
  }

  // 旧バックアップに残る秘密値は採用せず、現在のブラウザーの設定だけを引き継ぎます。
  function mergeImportedData(imported, currentData) {
    const safeImported = removeSensitiveValues(imported);
    const settings = { ...(safeImported.settings || {}) };
    Object.entries(currentData?.settings || {}).forEach(([key, value]) => {
      if (isSensitiveKey(key)) settings[key] = value;
    });
    return { ...safeImported, settings };
  }

  root.RoomBackupSecurity = Object.freeze({ isSensitiveKey, removeSensitiveValues, createBackupSnapshot, mergeImportedData });
})(typeof window !== "undefined" ? window : globalThis);
