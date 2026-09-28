const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.match(source, /追加の許可、承認、質問、返信要求は行わない/);
assert.match(source, /この再確認は利用者への確認・承認要求ではない/);
assert.match(source, /そのまま実在するROOMの「完了」ボタンを通常のGoogle Chrome操作で1回クリックする/);
assert.match(source, /60秒待機中から完了クリックまでROOM投稿編集画面を開いたまま維持し、アプリへ戻らず、別ページへ移動せず、戻る操作・タブ切替・タブ閉鎖・ブラウザ操作終了を行わない/);
assert.match(source, /実在するROOMの「完了」ボタンを通常のGoogle Chrome操作で1回クリックする/);
assert.match(source, /オリジナル写真追加・編集.*操作せず.*「完了」も押さず/);
assert.match(source, /ROOM投稿編集画面を開いた状態のまま維持/);
assert.match(source, /写真を確認後、ROOMの「完了」を手動で押してください/);
assert.ok(!source.includes("押してよければ『完了を押して』と返信してください"));

console.log("ROOM final action branching regression cases: passed");
