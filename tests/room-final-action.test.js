const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.match(source, /通常投稿はユーザーの追加確認を求めず、開始指示を事前承認として扱う/);
assert.match(source, /完了を押すまでROOM投稿編集画面を開いたまま維持し、アプリへ戻らず、別ページへ移動せず、戻る操作・タブ切替・タブ閉鎖・ブラウザ操作終了を行わない/);
assert.match(source, /実在するROOMの「完了」ボタンを通常のGoogle Chrome操作で1回クリックする/);
assert.match(source, /オリジナル写真追加・編集.*操作せず.*「完了」も押さず/);
assert.match(source, /ROOM投稿編集画面を開いた状態のまま維持/);
assert.match(source, /写真を確認後、ROOMの「完了」を手動で押してください/);
assert.ok(!source.includes("押してよければ『完了を押して』と返信してください"));

console.log("ROOM final action branching regression cases: passed");
