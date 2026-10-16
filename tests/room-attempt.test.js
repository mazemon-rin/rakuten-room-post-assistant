const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src/core/room-attempt.js"), "utf8");
const context = { Object, String };
context.globalThis = context;
vm.runInNewContext(source, context);
const api = context.RoomAttempt;
const candidate = { id: "candidate-1", itemCode: "shop:item-1", product: { itemCode: "shop:item-1" } };

const started = api.create(candidate, "attempt-1", "2026-10-16T01:00:00.000Z");
assert(started && started.candidateId === candidate.id && started.itemCode === candidate.itemCode);
assert.strictEqual(started.startedAt, "2026-10-16T01:00:00.000Z");
assert.strictEqual(started.confirmedAt, null);
candidate.roomAttempt = started;
assert.strictEqual(api.create(candidate, "attempt-2", "2026-10-16T02:00:00.000Z"), null);

const interrupted = api.interrupt(candidate);
assert.strictEqual(interrupted.status, api.STATUS.RESULT_CHECK_REQUIRED);
assert.strictEqual(interrupted.confirmedAt, null);
candidate.roomAttempt = interrupted;
assert.strictEqual(api.create(candidate, "attempt-2", "2026-10-16T02:00:00.000Z"), null);
assert.strictEqual(api.confirm(candidate, api.STATUS.POSTED_CONFIRMED, "", "2026-10-16T02:00:00.000Z"), null);
assert.strictEqual(api.confirm(candidate, api.STATUS.POSTED_CONFIRMED, api.SOURCE.DUPLICATE, "2026-10-16T02:00:00.000Z"), null);

const notPosted = api.confirm(candidate, api.STATUS.NOT_POSTED_CONFIRMED, api.SOURCE.NOT_POSTED, "2026-10-16T02:00:00.000Z");
assert.strictEqual(notPosted.confirmationSource, api.SOURCE.NOT_POSTED);
candidate.roomAttempt = notPosted;
assert(api.create(candidate, "attempt-2", "2026-10-16T03:00:00.000Z"));

candidate.roomAttempt = interrupted;
const posted = api.confirm(candidate, api.STATUS.POSTED_CONFIRMED, api.SOURCE.HISTORY, "2026-10-16T04:00:00.000Z");
assert.strictEqual(posted.status, api.STATUS.POSTED_CONFIRMED);
candidate.roomAttempt = posted;
assert.strictEqual(api.create(candidate, "attempt-3", "2026-10-16T05:00:00.000Z"), null);
assert.strictEqual(api.confirm(candidate, api.STATUS.NOT_POSTED_CONFIRMED, api.SOURCE.NOT_POSTED, "2026-10-16T05:00:00.000Z"), null);

candidate.roomAttempt = interrupted;
const duplicate = api.confirm(candidate, api.STATUS.DUPLICATE_CONFIRMED, api.SOURCE.DUPLICATE, "2026-10-16T06:00:00.000Z");
assert.strictEqual(duplicate.status, api.STATUS.DUPLICATE_CONFIRMED);
candidate.roomAttempt = duplicate;
assert.strictEqual(api.create(candidate, "attempt-4", "2026-10-16T07:00:00.000Z"), null);
assert.strictEqual(api.create({ ...candidate, repostOfHistoryId: "old-post" }, "attempt-4", "2026-10-16T07:00:00.000Z"), null);

const legacy = { id: "legacy", itemCode: "shop:legacy" };
const legacyConfirmed = api.confirm(legacy, api.STATUS.POSTED_CONFIRMED, api.SOURCE.COMPLETION, "2026-10-16T08:00:00.000Z", "legacy-attempt");
assert.strictEqual(legacyConfirmed.startedAt, null, "old candidates must not receive an invented start time");

const mismatch = { ...candidate, product: { itemCode: "shop:other" } };
assert.strictEqual(api.create(mismatch, "bad", "2026-10-16T09:00:00.000Z"), null);
assert.strictEqual(api.interrupt(mismatch), null);
assert.strictEqual(api.confirm(mismatch, api.STATUS.POSTED_CONFIRMED, api.SOURCE.HISTORY, "2026-10-16T09:00:00.000Z"), null);

console.log("ROOM attempt transitions and legacy compatibility: passed");
