(function exposeRoomUtils(root) {
  "use strict";
  function escapeHtml(text) { return String(text || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
  function escapeAttr(text) { return escapeHtml(text).replaceAll("`", "&#96;"); }
  function formatYen(value) { return `${Number(value || 0).toLocaleString("ja-JP")}円`; }
  function formatDate(value) { return value ? new Date(value).toLocaleDateString("ja-JP") : ""; }
  function dateStamp() { return new Date().toISOString().slice(0, 10); }
  function shorten(text, length) { const clean = String(text || ""); return clean.length > length ? `${clean.slice(0, length)}...` : clean; }
  function sanitizeTag(text) { return String(text || "").replace(/[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}a-zA-Z0-9_]/gu, "").slice(0, 24); }
  function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
  function parseCsvRows(text) {
    const rows = []; let row = [], cell = "", quoted = false; const source = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < source.length; i += 1) { const char = source[i];
      if (char === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
      else if (char === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && source[i + 1] === "\n") i += 1; row.push(cell); cell = ""; if (row.some((value) => value !== "")) rows.push(row); row = []; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell); if (row.some((value) => value !== "")) rows.push(row); } return rows;
  }
  function normalizeAffiliateHeader(value) { return String(value || "").trim().replace(/^\uFEFF/, "").toLowerCase(); }
  function normalizeAffiliateStatus(value) { const text = String(value || "").trim(); if (text === "0" || text.startsWith("0 -") || text.includes("未確定")) return "未確定"; if (text === "1" || text.startsWith("1 -") || text.includes("確定")) return "確定"; if (text === "2" || text.startsWith("2 -") || text.includes("破棄") || text.includes("キャンセル")) return "キャンセル"; return text; }
  function normalizeAffiliateText(value) { return String(value || "").toLowerCase().normalize("NFKC").replace(/[\s　\-ー―‐]/g, "").replace(/[「」『』【】［］\[\]()（）]/g, ""); }
  root.RoomUtils = Object.freeze({ escapeHtml, escapeAttr, formatYen, formatDate, dateStamp, shorten, sanitizeTag, sleep, parseCsvRows, normalizeAffiliateHeader, normalizeAffiliateStatus, normalizeAffiliateText });
})(typeof window !== "undefined" ? window : globalThis);
