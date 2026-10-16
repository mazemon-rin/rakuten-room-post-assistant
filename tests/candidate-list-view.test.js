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
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/core/room-sequential-queue.js"), "utf8"), context);
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

const postableCandidateIds = new Set(["pending", "copy"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "unposted", postableCandidateIds }).map((item) => item.id))), ["pending", "copy"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "review" }).map((item) => item.id))), ["waiting", "processing", "unknown-state"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "all" }).map((item) => item.id))), ["pending", "copy", "waiting", "processing", "unknown-state", "posted"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "unposted", history: [{ itemCode: " S:COPY " }], postableCandidateIds: new Set(["pending"]) }).map((item) => item.id))), ["pending"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.filterRoomCandidates(records, { mode: "all", keyword: "posted" }).map((item) => item.id))), ["posted"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.summarizeRoomCandidates(records, { postableCandidateIds }))),
  { total: 6, postable: 2, review: 3, posted: 1, other: 0 },
  "saved total, eligible, review and posted counts are distinct; missing introduction remains postable");
assert.strictEqual(api.isReviewCandidate(records[2]), true);
assert.strictEqual(api.isPostedCandidate(records[5]), true);

// A large saved list must show the same postable count as the unposted list.
const bulkRecords = [
  { id: "ready-a", itemCode: "shop:ready-a", title: "Ready A", postStatus: "投稿待ち", status: "未作成" },
  { id: "ready-b", itemCode: "shop:ready-b", title: "Ready B", postStatus: "紹介文未作成", status: "未作成" },
  ...Array.from({ length: 300 }, (_, index) => ({
    id: "posted-" + index, itemCode: "shop:posted-" + index, title: "Posted " + index,
    postStatus: "投稿済み", status: "投稿済み"
  })),
  ...Array.from({ length: 34 }, (_, index) => ({
    id: "review-" + index, itemCode: "shop:review-" + index, title: "Review " + index,
    postStatus: "結果確認待ち", roomAttempt: { status: "result_check_required" }
  })),
  ...Array.from({ length: 34 }, (_, index) => ({
    id: "processing-" + index, itemCode: "shop:processing-" + index, title: "Processing " + index,
    postStatus: "Codex処理中", roomAttempt: { status: "processing" }
  })),
  { itemCode: "shop:invalid-id", title: "No candidate ID", postStatus: "投稿待ち" }
];
const queueApi = context.RoomSequentialQueue;
const eligible = queueApi.getEligibleRoomCandidates(bulkRecords, []);
const eligibleSet = new Set(eligible);
assert.strictEqual(bulkRecords.length, 371);
assert.strictEqual(eligible.length, 2, "only candidates that can be queued count as postable");
assert.strictEqual(api.filterRoomCandidates(bulkRecords, { mode: "unposted", postableCandidates: eligibleSet }).length, 2);
assert.strictEqual(api.filterRoomCandidates(bulkRecords, { mode: "all" }).length, 371,
  "the all filter preserves every saved candidate, including malformed legacy data");
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.summarizeRoomCandidates(bulkRecords, {
  postableCandidates: eligibleSet
}))), { total: 371, postable: 2, review: 68, posted: 300, other: 1 });

const reloadedRecords = JSON.parse(JSON.stringify(bulkRecords));
const reloadedEligible = queueApi.getEligibleRoomCandidates(reloadedRecords, []);
assert.strictEqual(reloadedEligible.length, 2, "recalculation after reload must produce the same postable count");
assert.strictEqual(api.filterRoomCandidates(reloadedRecords, {
  mode: "unposted", postableCandidates: new Set(reloadedEligible)
}).length, 2);

const duplicateIdentityRecords = [
  { id: "same-id", itemCode: "shop:first", postStatus: "投稿待ち" },
  { id: "same-id", itemCode: "shop:second", postStatus: "投稿待ち" },
  { id: "same-code-a", itemCode: "shop:duplicate", savedAt: "2026-10-01", postStatus: "投稿待ち" },
  { id: "same-code-b", itemCode: "SHOP:DUPLICATE", savedAt: "2026-10-02", postStatus: "投稿待ち" }
];
const uniqueEligible = queueApi.getEligibleRoomCandidates(duplicateIdentityRecords, []);
assert.deepStrictEqual(JSON.parse(JSON.stringify(uniqueEligible.map((candidate) => candidate.id))), ["same-code-a"],
  "ambiguous IDs are excluded and duplicate itemCodes are counted once using oldest savedAt");
assert.strictEqual(api.filterRoomCandidates(duplicateIdentityRecords, {
  mode: "unposted", postableCandidates: new Set(uniqueEligible)
}).length, 1);

console.log("Candidate list filters and status groups: passed");
