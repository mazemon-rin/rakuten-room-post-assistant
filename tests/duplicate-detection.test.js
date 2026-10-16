const fs = require("fs");
const path = require("path");
const vm = require("vm");

const identitySource = fs.readFileSync(path.join(__dirname, "..", "src", "core", "product-identity.js"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "..", "src", "core", "duplicate-detection.js"), "utf8");
const context = { URL, String, Set, Object, Date, Intl };
vm.createContext(context);
vm.runInContext(`${identitySource}\n${source}`, context);
const duplicate = context.DuplicateDetection;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const history = [
  { id: "h-top", itemCode: "top-code", title: "履歴A", postedAt: "2026-09-01T00:00:00.000Z" },
  { id: "h-nested", product: { itemCode: "nested-code" }, title: "履歴B" }
];

assert(duplicate.postedHistoryMatch({ itemCode: "top-code" }, history), "top-level itemCode matches history");
assert(duplicate.postedHistoryMatch({ product: { itemCode: "nested-code" } }, history), "nested itemCode matches history");
assert(duplicate.postedHistoryMatch({ itemCode: "top-code" }, [{ product: { itemCode: "top-code" } }]), "candidate top-level matches history nested");
assert(duplicate.postedHistoryMatch({ product: { itemCode: "nested-code" } }, [{ itemCode: "nested-code" }]), "candidate nested matches history top-level");
assert(duplicate.postedHistoryMatch({ itemCode: " top-code " }, history), "itemCode whitespace is normalized");
assert(!duplicate.postedHistoryMatch({ itemCode: "different", itemName: "履歴A" }, history), "different itemCode does not match by name");
assert(duplicate.postedHistoryMatch({ itemUrl: "https://example.com/item/" }, [{ itemUrl: "https://example.com/item?x=1" }]), "missing itemCode uses ranking identity fallback");

const candidates = [
  { id: "c-existing", itemCode: "candidate-code", destination: "room" },
  { id: "c-threads", itemCode: "threads-code", destination: "threads_only" }
];
assert(duplicate.findDuplicate({ itemCode: "candidate-code" }, candidates, []).includes("保存済み"), "candidate duplicate is detected");
assert(duplicate.findDuplicate({ itemCode: "top-code" }, candidates, history).includes("投稿済み"), "history duplicate is detected");
assert(duplicate.findDuplicate({ itemCode: "candidate-code" }, candidates, [], "c-existing") === "", "ignoreId excludes the matching candidate");
assert(duplicate.findDuplicate({ itemCode: "threads-code" }, candidates, []) === "", "Threads-only candidate is outside ROOM duplicate scope");
assert(duplicate.findDuplicate({ itemCode: "new-code" }, candidates, []) === "", "new product is not a duplicate");
assert(!duplicate.canSaveRoomCandidate({ itemCode: "candidate-code" }, candidates, []), "candidate duplicate cannot be saved");
assert(!duplicate.canSaveRoomCandidate({ itemCode: "top-code" }, candidates, history), "history duplicate cannot be saved");
assert(duplicate.canSaveRoomCandidate({ itemCode: "new-code" }, candidates, history), "new product can be saved");

assert(duplicate.isVisibleRoomCandidate({ itemCode: "new-room", destination: "room" }, history), "unposted ROOM candidate is visible");
assert(!duplicate.isVisibleRoomCandidate({ itemCode: "top-code", destination: "room" }, history), "posted ROOM candidate is hidden");
assert(!duplicate.isVisibleRoomCandidate({ itemCode: "new-threads", destination: "threads_only" }, history), "Threads-only candidate is hidden from ROOM");

// Phase 2 search exclusion uses exact normalized itemCode for all ROOM candidate states.
const searchCandidates = [
  { id: "waiting", itemCode: "shop:waiting", postStatus: "結果確認待ち" },
  { id: "processing", product: { itemCode: "shop:processing" }, postStatus: "Codex処理中" },
  { id: "posted", itemCode: "shop:posted", postStatus: "投稿済み" },
  { id: "duplicate", itemCode: "shop:duplicate", postStatus: "ROOM重複確認済み" },
  { id: "unposted", itemCode: "shop:unposted", postStatus: "投稿待ち" },
  { id: "threads", itemCode: "shop:threads", destination: "threads_only" }
];
for (const code of ["waiting", "processing", "posted", "duplicate", "unposted"]) {
  assert(duplicate.isExcludedFromRoomSearch({ itemCode: ` shop:${code} ` }, searchCandidates, []), `exclude ${code}`);
}
assert(duplicate.isExcludedFromRoomSearch({ itemCode: "shop:history" }, [], [{ product: { itemCode: "shop:history" }, repostRequested: true }]), "history remains excluded even if repost was requested");
assert(!duplicate.isExcludedFromRoomSearch({ itemCode: "shop:threads" }, searchCandidates, []), "Threads-only candidate does not block ROOM search");
assert(!duplicate.isExcludedFromRoomSearch({ itemCode: "shop:unposted-extra", itemName: "same name" }, searchCandidates, []), "itemCode must match completely");
assert(!duplicate.isExcludedFromRoomSearch({ itemName: "same name" }, searchCandidates, []), "missing itemCode is not guessed from name");
assert(searchCandidates.length === 6, "search exclusion must not delete saved candidates");

console.log("duplicate detection regression cases: passed");
