const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.match(source, /function normalizeOriginalPhoto\(value = false\)/);
assert.match(source, /originalPhoto: normalizeOriginalPhoto\(productWithUrl\.originalPhoto\)/);
assert.match(source, /candidate\.originalPhoto = normalizeOriginalPhoto\(options\.originalPhotoEnabled === true\)/);
assert.match(source, /📷 オリジナル写真で投稿/);
assert.match(source, /📷 オリジナル写真予定/);
assert.match(source, /写真を確認後、ROOMの「完了」を手動で押してください/);
assert.match(source, /isOriginalPhotoCandidate\(candidate\)/);
assert.match(source, /オリジナル写真追加・編集.*操作せず/);
assert.match(source, /originalPhoto: normalizeOriginalPhoto\(candidate\.originalPhoto\)/);
assert.ok(!source.includes("originalPhoto.enabled === true) {\n    document"));

console.log("original photo mode regression cases: passed");
