const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const discovery = fs.readFileSync("src/sns-trend-discovery.js", "utf8");
const css = fs.readFileSync("src/sns-trend.css", "utf8");

if (!html.includes('id="clearSearchConditions"') || !html.includes('id="clearSearchConditions" class="secondary-button" type="button">クリア')) {
  throw new Error("search clear button is missing or mislabeled");
}
if ((html.match(/class="discovery-accordion"/g) || []).length < 4) throw new Error("discovery accordion sections are missing");
if (!html.includes('class="discovery-accordion"><summary>Google Trendsから追加</summary>')) throw new Error("Google Trends accordion is missing");
if (!html.includes('class="discovery-accordion"><summary>YouTubeから追加</summary>')) throw new Error("YouTube accordion is missing");
if (!css.includes(".discovery-accordion") || !css.includes("cursor: pointer")) throw new Error("accordion styles are missing");
if (!discovery.includes("if (event.target.dataset.discoveryDelete) { state = removeCandidate")) throw new Error("discovery delete handler is missing");
if (discovery.includes('dataset.discoveryDelete && window.confirm(')) throw new Error("discovery delete confirmation remains");
if (!discovery.includes('document.querySelectorAll(".discovery-accordion").forEach((section)')) throw new Error("discovery accordion behavior is missing");
if (!script.includes("searchResults = []") || !script.includes("couponSearchResults = []") || !script.includes("rankingCategoryStates.clear()")) throw new Error("search clear state reset is incomplete");
console.log("UI controls cases: passed");
