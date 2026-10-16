const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {
  ProductIdentity: {},
  DuplicateDetection: {
    postedHistoryMatch(candidate, history = []) {
      const code = String(candidate.itemCode || candidate.product?.itemCode || "").trim().toLowerCase();
      return Boolean(code && history.some((entry) => String(entry.itemCode || entry.product?.itemCode || "").trim().toLowerCase() === code));
    }
  },
  Set, String, Array
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/core/candidate-list-view.js"), "utf8"), context);
const api = context.CandidateListView;
const records = [
  { id: "pending", itemCode: "s:pending", title: "Pending", postStatus: "投稿待ち", status: "未作成", destination: "room" },
  { id: "copy", itemCode: "s:copy", title: "Copy ready", postStatus: "投稿待ち", status: "文章作成済み", introText: "copy", hashTags: "#tag", destination: "room" },
  { id: "waiting", itemCode: "s:waiting", title: "Waiting", postStatus: "結果確認待ち", roomAttempt: { status: "result_check_required" }, destination: "room" },
  { id: "processing", itemCode: "s:processing", title: "Processing", postStatus: "Codex処理中", roomAttempt: { status: "processing" }, destination: "room" },
  { id: "unknown-state", itemCode: "s:invalid", title: "Invalid attempt", postStatus: "投稿待ち", roomAttempt: { status: "unexpected" }, destination: "room" },
  { id: "posted", itemCode: "s:posted", title: "Posted", postStatus: "投稿済み", destination: "room" },
  { id: "sns", itemCode: "s:sns", title: "SNS", postStatus: "投稿待ち", destination: "threads_only" }
];

assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "unposted" }).map((item) => item.id))), ["pending", "copy"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "review" }).map((item) => item.id))), ["waiting", "processing", "unknown-state"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "all" }).map((item) => item.id))), ["pending", "copy", "waiting", "processing", "unknown-state", "posted"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "unposted", history: [{ itemCode: " S:COPY " }] }).map((item) => item.id))), ["pending"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "all", keyword: "posted" }).map((item) => item.id))), ["posted"]);
assert.strictEqual(api.isReviewCandidate(records[2]), true);
assert.strictEqual(api.isPostedCandidate(records[5]), true);

console.log("Candidate list filters and status groups: passed");
