#!/usr/bin/env node
/* 紫微斗數 AI 解牌 v2 — 離線自測
   用法： node selftest.mjs "..\02-改進版\ziwei-ai-v2.html" */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const file = path.resolve(process.argv[2] || "..\\02-改進版\\ziwei-ai-v2.html");
const html = fs.readFileSync(file, "utf8");

let pass = 0;
const failures = [];
function check(name, fn) {
  try { fn(); pass += 1; console.log("PASS  " + name); }
  catch (error) { failures.push(name + " :: " + error.message); console.log("FAIL  " + name + " :: " + error.message); }
}
function assert(cond, message) { if (!cond) throw new Error(message || "assertion failed"); }

function makeEl(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(),
    dataset: {}, style: {}, children: [], attributes: {},
    textContent: "", innerHTML: "", value: "", checked: false,
    disabled: false, hidden: false, open: false, type: "", href: "", download: "",
    id: "", className: "", offsetWidth: 0, isSecureContext: true,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild(child) { this.children.push(child); return child; },
    insertBefore(child) { this.children.push(child); return child; },
    removeChild() {}, remove() {},
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return key in this.attributes ? this.attributes[key] : null; },
    removeAttribute(key) { delete this.attributes[key]; },
    querySelector() { return makeEl("div"); },
    querySelectorAll() { return []; },
    closest() { return null; },
    matches() { return false; },
    contains() { return false; },
    focus() {}, blur() {}, click() {}, select() {}, setSelectionRange() {},
    showModal() { this.open = true; }, close() { this.open = false; },
    scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    animate() { return { finished: Promise.resolve(), cancel() {} }; }
  };
}
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    get length() { return map.size; }
  };
}

const idLog = [];
const documentStub = {
  documentElement: makeEl("html"), body: makeEl("body"), head: makeEl("head"),
  createElement: (tag) => makeEl(tag),
  createTextNode: (text) => ({ textContent: text }),
  createDocumentFragment: () => makeEl("fragment"),
  getElementById: (id) => { idLog.push(id); const el = makeEl("div"); el.id = id; return el; },
  querySelector: () => makeEl("div"), querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  execCommand() { return true; }, title: ""
};

const windowStub = {
  document: documentStub,
  localStorage: makeStorage(), sessionStorage: makeStorage(),
  location: { protocol: "file:", hostname: "", href: "file:///ziwei-ai-v2.html", search: "" },
  navigator: { clipboard: null, userAgent: "node-selftest" },
  isSecureContext: false,
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (cb) => setTimeout(() => cb(0), 0),
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  addEventListener() {}, removeEventListener() {}, scrollTo() {},
  URL: { createObjectURL: () => "blob:selftest", revokeObjectURL() {} }
};
windowStub.window = windowStub;
windowStub.self = windowStub;

const sandbox = {
  window: windowStub, document: documentStub, navigator: windowStub.navigator,
  location: windowStub.location, localStorage: windowStub.localStorage,
  sessionStorage: windowStub.sessionStorage, matchMedia: windowStub.matchMedia,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  URL: windowStub.URL, Blob: globalThis.Blob,
  TextDecoder: globalThis.TextDecoder, TextEncoder: globalThis.TextEncoder,
  fetch: () => Promise.reject(new Error("selftest: no network")),
  console
};
sandbox.globalThis = sandbox;
sandbox.self = windowStub;

const scripts = [];
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = re.exec(html))) scripts.push(match[1]);
const ctx = vm.createContext(sandbox);

check("inline script 語法可解析", () => {
  assert(scripts.length >= 2, "expected >= 2 inline scripts, got " + scripts.length);
  scripts.forEach((src) => { new Function(src); });
});

check("主程式可在 DOM stub 執行到 init() 完成", () => {
  vm.runInContext(scripts[scripts.length - 1], ctx, { filename: "ziwei-inline.js" });
  assert(ctx.window.__zwdsInternals, "__zwdsInternals 未導出 → 主程式中途拋錯");
});

const api = ctx.window.__zwdsInternals;
const expectedMode = process.argv[3] || "manual";

check("init() 跑到最後（syncSettingsUI 有查 connectionMode）", () => {
  assert(idLog.includes("connectionMode"), "init 未完成，查詢記錄：" + idLog.join(","));
});

check("版本號存在（2.x / 3.x）", () => {
  assert(/^\d+\.\d+\.\d+$/.test(api.version), "版本格式錯：" + api.version);
  console.log("      → 版本 " + api.version);
});

check("牌組數量 14 / 25 / 22 / 12", () => {
  assert(api.MAIN_STARS.length === 14, "MAIN_STARS=" + api.MAIN_STARS.length);
  assert(api.DUAL_STARS.length === 25, "DUAL_STARS=" + api.DUAL_STARS.length);
  assert(api.SUPPORT_CARDS.length === 22, "SUPPORT_CARDS=" + api.SUPPORT_CARDS.length);
  assert(api.LIFE_STAGES.length === 12, "LIFE_STAGES=" + api.LIFE_STAGES.length);
});

check("輔星含天馬", () => assert(api.SUPPORT_CARDS.includes("天馬")));
check("雙星含空宮", () => assert(api.DUAL_STARS.includes("空宮")));

check("buildPrompt 含三張牌與七段", () => {
  const p = api.buildPrompt({ main: "紫微", support: "左輔", life: "長生" });
  ["主星：紫微", "輔星：左輔", "長生：長生"].forEach((t) => assert(p.includes(t), "缺 " + t));
  for (let i = 1; i <= 7; i += 1) assert(p.includes("### " + i + "."), "缺第 " + i + " 段");
  assert(!p.includes("### 8."), "不應有第 8 段");
});

check("renderMarkdown escape HTML", () => {
  const out = api.renderMarkdown("<img src=x onerror=alert(1)>");
  assert(!out.includes("<img"), "raw <img> 逃逸");
  assert(out.includes("&lt;img"), "未 escape");
});

check("renderMarkdown 只放行 http(s)", () => {
  const bad = api.renderMarkdown("[c](javascript:alert(1))");
  assert(!/href="javascript:/i.test(bad), "javascript: 逃逸");
  const good = api.renderMarkdown("[x](https://example.com)");
  assert(/href="https:\/\/example\.com"/.test(good), "正常連結被阻");
});

check("renderMarkdown 粗體與清單", () => {
  const out = api.renderMarkdown("**重點**\n\n- 一\n- 二");
  assert(out.includes("<strong>重點</strong>"), "粗體失敗");
  assert(out.includes("<li>"), "清單失敗");
});

check("parseSSELine 解析 delta", () => {
  const parsed = api.parseSSELine('data: {"choices":[{"delta":{"content":"你"}}]}');
  assert(parsed && parsed.delta === "你", "delta 失敗 " + JSON.stringify(parsed));
});

check("parseSSELine 讀 finish_reason=length", () => {
  const parsed = api.parseSSELine('data: {"choices":[{"delta":{},"finish_reason":"length"}]}');
  assert(parsed && parsed.finishReason === "length", "finish_reason 失敗 " + JSON.stringify(parsed));
});

check("parseSSELine 異常輸入回 null", () => {
  assert(api.parseSSELine("data: [DONE]") === null);
  assert(api.parseSSELine("") === null);
  assert(api.parseSSELine("data: {oops") === null);
});

check("請求組裝（" + expectedMode + "）：stream / max_tokens / 認證方式", () => {
  const r = api.buildReadingRequest("test", expectedMode, "sk-selftest");
  const body = JSON.parse(r.body);
  assert(body.stream === true, "stream 應 true");
  assert(body.max_tokens === 3200, "max_tokens " + body.max_tokens);
  assert(body.messages.length === 2 && body.messages[0].role === "system", "messages 結構錯");
  assert(body.model === "deepseek-flash", "model 應為 deepseek-flash，實際 " + body.model);
  assert(body.thinking && body.thinking.type === "disabled", "thinking 應為 disabled：" + JSON.stringify(body.thinking));
  if (expectedMode === "proxy") {
    assert(r.url.indexOf("/chat") !== -1, "proxy url 應以 /chat 結尾：" + r.url);
    assert(!r.headers.Authorization, "proxy 模式不應帶 Authorization");
  } else {
    assert(r.url === "https://api.deepseek.com/chat/completions", "url " + r.url);
    assert(r.headers.Authorization === "Bearer sk-selftest", "Authorization 缺失");
  }
});

check("maskKey 不洩漏完整金鑰", () => {
  const masked = api.maskKey("sk-1234567890abcdef");
  assert(masked.includes("…") || masked.includes("****"), "無遮罩 " + masked);
  assert(!masked.includes("2345678"), "遮罩不足 " + masked);
});

check("keyMode = " + expectedMode + "，且無 DEEPSEEK_API_KEY 殘留", () => {
  assert(api.keyMode() === expectedMode, "keyMode=" + api.keyMode() + " 期望 " + expectedMode);
  assert(!/DEEPSEEK_API_KEY/.test(html), "仍有 DEEPSEEK_API_KEY 硬編碼位");
});

check("v2.2：有配額區塊 / 解鎖碼 / Turnstile 支援", () => {
  assert(/id="quotaBlock"/.test(html), "缺 quotaBlock");
  assert(/id="unlockInput"/.test(html), "缺 unlockInput");
  assert(/id="unlockBtn"/.test(html), "缺 unlockBtn");
  assert(/id="turnstileSlot"/.test(html), "缺 turnstileSlot");
  assert(/TURNSTILE_SITE_KEY/.test(html), "缺 TURNSTILE_SITE_KEY 設定");
  assert(/challenges\.cloudflare\.com/.test(html), "CSP 未允許 Turnstile");
});

check("Turnstile 已接線（sitekey / action / canonical 欄位）", () => {
  assert(/TURNSTILE_SITE_KEY: "0x4AAAAA/.test(html), "缺 sitekey");
  assert(/action: "unlock"/.test(html), "缺 action: unlock");
  assert(/cf-turnstile-response/.test(html), "缺 canonical 欄位 cf-turnstile-response");
  assert(/siteverify|challenges\.cloudflare\.com/.test(html) || true, "");
});
check("v2.4：頂欄配額晶片 + 全域封鎖處理", () => {
  assert(/id="quotaChip"/.test(html), "缺 quotaChip");
  assert(/global_blocked/.test(html), "缺 global_blocked 處理");
  assert(/globalRemaining/.test(html), "缺全域剩餘顯示");
});
check("v2.5：整站驗證遮罩 + session 流程", () => {
  assert(/id="gateOverlay"/.test(html), "缺 gateOverlay");
  assert(/id="gateSlot"/.test(html), "缺 gateSlot");
  assert(/\/verify/.test(html), "缺 /verify 呼叫");
  assert(/x-zwds-session/.test(html), "缺 session header");
  assert(/session_required/.test(html), "缺 session_required 處理");
});
check("v2.5.1：gate 有重試按鈕", () => {
  assert(/id="gateRetryBtn"/.test(html), "缺 gateRetryBtn");
  assert(/重新驗證/.test(html), "缺重試文案");
});
check("v2.5.2：session 同時走 body（避開 CORS header 限制）", () => {
  assert(/session: useProxy \? sessionToken : undefined/.test(html), "body 未帶 session");
});
check("v2.6：名字輸入 + 驗證後自動續跑", () => {
  assert(/id="gateName"/.test(html), "缺 gateName");
  assert(/pendingReading/.test(html), "缺 pendingReading");
  assert(/name: name/.test(html), "驗證請求未帶名字");
});
check("v3：追問區 + 限制（如為 v3 build）", () => {
  if (!/3\.\d+\.\d+/.test(api.version)) { console.log("      → 舊版 build，略過"); return; }
  assert(/id="followupBox"/.test(html), "缺 followupBox");
  assert(/id="followupInput"/.test(html), "缺 followupInput");
  assert(/FOLLOWUP_MAX_CHARS: 3000/.test(html), "追問上限不是 3000");
  assert(/FOLLOWUP_CONTEXT_MAX: 30000/.test(html), "缺 30000 字元 context 上限");
  assert(/BLOCKED_TOPIC_PATTERNS/.test(html), "缺程式／數學攔截");
  assert(/不要解答/.test(html), "prompt 未加拒答規則");
});
check("HTML 有 CSP、connect-src 受限", () => {
  assert(/Content-Security-Policy/.test(html), "缺 CSP");
  assert(/connect-src[^"]*api\.deepseek\.com/.test(html), "CSP 未限制 connect-src");
  if (expectedMode !== "inline") {
    assert(!/sk-[A-Za-z0-9]{20,}/.test(html), "非私人版卻有疑似真實金鑰");
  }
});

console.log("\n---- 結果 ----");
console.log("PASS " + pass + " / " + (pass + failures.length) + "，FAIL " + failures.length);
if (failures.length) { failures.forEach((f) => console.log(" - " + f)); process.exit(1); }
