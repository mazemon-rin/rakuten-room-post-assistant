const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const moduleContext = { Object, String, Array };
moduleContext.globalThis = moduleContext;
vm.runInNewContext(fs.readFileSync("src/core/backup-security.js", "utf8"), moduleContext);
const security = moduleContext.RoomBackupSecurity;

const current = {
  settings: {
    applicationId: "SENTINEL_APP_ID", accessKey: "SENTINEL_ACCESS_KEY", affiliateId: "affiliate-123",
    defaultTone: "やさしい", rankingCategoryIds: ["1"], apiToken: "SENTINEL_NESTED_TOKEN"
  },
  candidates: [{ id: "candidate-1", itemCode: "shop:1", introText: "紹介文", hashTags: "#タグ", product: { itemName: "商品", apiKey: "SENTINEL_PRODUCT_KEY" }, searchContext: { searchMode: "problem", problem: "机が狭い" } }],
  history: [{ id: "history-1", itemCode: "posted:1", postedAt: "2026-01-01" }],
  sales: [{ itemCode: "posted:1", amount: 1200 }],
  pendingRoomPost: { candidateId: "pending-1", itemCode: "pending:1" },
  trendSettings: { keywords: ["春"], updatedAt: "2026-01-01" },
  eventSettings: { eventName: "新生活", enabled: true }
};
const original = JSON.stringify(current);
const backup = security.createBackupSnapshot(current);
const backupJson = JSON.stringify(backup);
for (const secret of ["SENTINEL_APP_ID", "SENTINEL_ACCESS_KEY", "SENTINEL_NESTED_TOKEN", "SENTINEL_PRODUCT_KEY"]) {
  assert.equal(backupJson.includes(secret), false, `backup omits ${secret}`);
}
for (const forbiddenKey of ["applicationId", "accessKey", "apiToken", "apiKey"]) {
  assert.equal(backupJson.includes(`"${forbiddenKey}"`), false, `backup omits key ${forbiddenKey}`);
}
assert.equal(backup.settings.affiliateId, "affiliate-123", "non-auth affiliate setting is retained");
assert.deepEqual(JSON.parse(JSON.stringify(backup.candidates)), [{ id: "candidate-1", itemCode: "shop:1", introText: "紹介文", hashTags: "#タグ", product: { itemName: "商品" }, searchContext: { searchMode: "problem", problem: "机が狭い" } }]);
assert.equal(backup.history[0].id, "history-1");
assert.equal(backup.sales[0].amount, 1200);
assert.equal(backup.pendingRoomPost.itemCode, "pending:1");
assert.equal(JSON.stringify(current), original, "creating backup does not mutate saved data");

const oldBackup = {
  settings: { applicationId: "LEGACY_APP_SECRET", accessKey: "LEGACY_KEY_SECRET", apiRefreshToken: "LEGACY_TOKEN", affiliateId: "affiliate-old", defaultTone: "明るい" },
  candidates: [{ id: "legacy-candidate", itemCode: "legacy:1", product: { itemName: "旧商品", accessToken: "LEGACY_PRODUCT_TOKEN" } }],
  history: [{ id: "legacy-history", itemCode: "legacy:posted" }],
  sales: [{ itemCode: "legacy:posted", amount: 500 }]
};
const restoredWithCredentials = security.mergeImportedData(oldBackup, { settings: { applicationId: "CURRENT_APP_ID", accessKey: "CURRENT_ACCESS_KEY", apiSecret: "CURRENT_SECRET", affiliateId: "affiliate-current" } });
assert.equal(restoredWithCredentials.settings.applicationId, "CURRENT_APP_ID");
assert.equal(restoredWithCredentials.settings.accessKey, "CURRENT_ACCESS_KEY");
assert.equal(restoredWithCredentials.settings.apiSecret, "CURRENT_SECRET", "other current auth settings are preserved");
assert.equal(restoredWithCredentials.settings.affiliateId, "affiliate-old", "ordinary operational settings restore from backup");
assert.equal(restoredWithCredentials.settings.defaultTone, "明るい");
const restoredJson = JSON.stringify(restoredWithCredentials);
for (const legacySecret of ["LEGACY_APP_SECRET", "LEGACY_KEY_SECRET", "LEGACY_TOKEN", "LEGACY_PRODUCT_TOKEN"]) assert.equal(restoredJson.includes(legacySecret), false);
assert.equal(restoredWithCredentials.candidates[0].product.itemName, "旧商品");
assert.equal(restoredWithCredentials.history[0].id, "legacy-history");
assert.equal(restoredWithCredentials.sales[0].amount, 500);

const restoredWithoutCredentials = security.mergeImportedData(oldBackup, { settings: { applicationId: "", accessKey: "" } });
assert.equal(restoredWithoutCredentials.settings.applicationId, "", "legacy credentials are not imported when current settings are empty");
assert.equal(restoredWithoutCredentials.settings.accessKey, "");
assert.equal(security.isSensitiveKey("Refresh-Token"), true);

const appSource = fs.readFileSync("script.js", "utf8");
const exportFunction = appSource.match(/function exportJson\(\) \{[\s\S]*?\n\}/)?.[0];
const importFunction = appSource.match(/function importJson\(event\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(exportFunction, "exportJson function is available for integration test");
assert.ok(importFunction, "importJson function is available for integration test");

let downloaded = null;
const exportContext = {
  data: JSON.parse(original),
  window: { RoomBackupSecurity: security },
  dateStamp: () => "20261026",
  downloadFile: (filename, content, type) => { downloaded = { filename, content, type }; }
};
vm.createContext(exportContext);
vm.runInContext(exportFunction, exportContext);
vm.runInContext("exportJson()", exportContext);
assert.equal(downloaded.filename, "room-assistant-backup-20261026.json");
assert.equal(downloaded.type, "application/json");
assert.equal(JSON.parse(downloaded.content).candidates[0].introText, "紹介文");
assert.equal(downloaded.content.includes("SENTINEL"), false, "actual exported JSON excludes secret values");
assert.equal(JSON.stringify(exportContext.data), original, "export does not mutate the source data");

function runImport(initialData, fileData, shouldFailSave = false) {
  let persisted = JSON.parse(JSON.stringify(initialData));
  const messages = [];
  const errors = [];
  class MockFileReader {
    readAsText(file) { this.result = file.text; this.onload(); }
  }
  const context = {
    data: JSON.parse(JSON.stringify(initialData)),
    window: { RoomBackupSecurity: security },
    FileReader: MockFileReader,
    normalizeStoredData: (value) => value,
    saveData() {
      if (shouldFailSave) {
        context.data = JSON.parse(JSON.stringify(persisted));
        return { ok: false };
      }
      persisted = JSON.parse(JSON.stringify(context.data));
      return { ok: true };
    },
    fillSettings() {},
    toast: (message) => messages.push(message),
    alert: (message) => errors.push(message),
    fileText: JSON.stringify(fileData)
  };
  vm.createContext(context);
  vm.runInContext(importFunction, context);
  vm.runInContext('importJson({ target: { files: [{ text: fileText }] } })', context);
  return { data: context.data, persisted, messages, errors };
}

const importResult = runImport(
  { settings: { applicationId: "CURRENT_APP_ID", accessKey: "CURRENT_ACCESS_KEY", defaultTone: "やさしい" }, candidates: [{ id: "before" }], history: [], sales: [] },
  oldBackup
);
assert.equal(importResult.persisted.settings.applicationId, "CURRENT_APP_ID", "import keeps existing API credentials");
assert.equal(importResult.persisted.settings.accessKey, "CURRENT_ACCESS_KEY");
assert.equal(importResult.persisted.settings.defaultTone, "明るい", "ordinary settings come from imported backup");
assert.equal(importResult.persisted.candidates[0].id, "legacy-candidate");
assert.equal(importResult.persisted.sales[0].amount, 500);
assert.match(importResult.messages[0], /現在のブラウザーに保存済みのAPI認証設定は維持/);

const importWithoutCredentials = runImport(
  { settings: { applicationId: "", accessKey: "" }, candidates: [], history: [], sales: [] }, oldBackup
);
assert.equal(importWithoutCredentials.persisted.settings.applicationId, "");
assert.match(importWithoutCredentials.messages[0], /設定画面で再設定/);

const beforeFailedImport = { settings: { applicationId: "KEEP_APP", accessKey: "KEEP_KEY" }, candidates: [{ id: "keep" }], history: [], sales: [] };
const failedImport = runImport(beforeFailedImport, oldBackup, true);
assert.deepEqual(JSON.parse(JSON.stringify(failedImport.persisted)), beforeFailedImport, "failed save keeps the prior persisted data");
assert.deepEqual(JSON.parse(JSON.stringify(failedImport.data)), beforeFailedImport, "failed save restores the prior in-memory data");
assert.equal(failedImport.messages.length, 0, "failed import is not reported as successful");
assert.equal(failedImport.errors.length, 0, "save failure is handled by saveData without import error dialogs");

console.log("backup credential filtering, legacy restore, import retention, and failed-save protection: passed");
