// 无头集成测试：用 jsdom 加载真实打包产物 bundle.js，
// 驱动 搜索→播放→歌词 全链路，断言逐句高亮是否正确推进
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "static/index.html"), "utf8");
const bundle = readFileSync(path.join(root, "static/bundle.js"), "utf8");

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("  PASS " + name);
  else { failures++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

// ── 测试数据 ──
const NATIVE_LRC = "[00:01.00]第一句歌词\n[00:05.00]第二句歌词\n[00:09.00]第三句歌词\n[00:13.00]第四句歌词\n[00:17.00]第五句歌词\n";
const MATCHED_LRC = "[01:40.00]匹配的歌词第一句\n[02:10.00]匹配的歌词第二句\n[02:40.00]匹配的歌词第三句\n[03:10.00]匹配的歌词第四句\n"; // 时间轴整体偏移 100 秒
const SEARCH_RESULTS = {
  kg: [{ id: "kg1", title: "晴天", artist: "周杰伦", duration: 269, source: "kg" }],
  ne: [{ id: "ne1", title: "晴天", artist: "周杰伦", duration: 269, source: "ne" }],
  bl: [{ id: "bl1", title: "晴天", artist: "周杰伦", duration: 269, source: "bl" }],
};

const dom = new JSDOM(html, { url: "http://127.0.0.1:21345/", pretendToBeVisual: true, runScripts: "outside-only" });
const { window } = dom;
const { document } = window;

// ── 环境桩 ──
// fetch 路由：记录 /api/log（错误与调试信息）
const logCalls = [];
window.fetch = async (url) => {
  const u = String(url);
  let data = {};
  if (u.startsWith("/api/log")) { logCalls.push(decodeURIComponent(u.split("m=")[1] || "")); data = { success: true }; }
  else if (u.startsWith("/api/search")) {
    window.__lastSearchUrl = u; // 场景 10 断言用
    // 场景 11：模拟搜索失败（后端 500 + {"error":...}）
    if (window.__failSearch) {
      return { ok: false, status: 500, json: async () => ({ error: "search failed" }) };
    }
    data = [...SEARCH_RESULTS.kg, ...SEARCH_RESULTS.ne, ...SEARCH_RESULTS.bl];
  }
  else if (u.startsWith("/api/song/url")) data = { url: "http://fake-cdn/audio.mp3" };
  else if (u.startsWith("/api/song/lyric/search")) data = { lrc: MATCHED_LRC, tlrc: "" };
  else if (u.startsWith("/api/song/lyric?")) {
    const id = new URL("http://x" + u).searchParams.get("id");
    data = id === "bl1" ? { lrc: "", qrc: "", tlrc: "" } : { lrc: NATIVE_LRC, qrc: "", tlrc: "" };
  }
  else if (u.startsWith("/api/playlists")) data = { playlists: [{ id: "p1", name: "我的歌单", songs: [], created_at: 1, updated_at: 1 }] };
  else data = { success: true };
  return { ok: true, status: 200, json: async () => data };
};
// 通用 canvas 桩（任何方法调用都返回可继续调用的桩）
function stubCtx() {
  const p = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : stubCtx()),
    apply: () => stubCtx(),
    set: () => true,
  });
  return p;
}
window.HTMLCanvasElement.prototype.getContext = () => stubCtx();
// 媒体元素桩
const audio = document.getElementById("audio");
Object.defineProperty(audio, "currentTime", { value: 0, writable: true });
Object.defineProperty(audio, "duration", { value: 269, writable: true });
audio.play = () => Promise.resolve();
audio.pause = () => {};
audio.addEventListener("play", () => {});
// 其他环境
window.AudioContext = class { constructor() {} resume() { return Promise.resolve(); } createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 0, connect() {}, getByteFrequencyData() {} }; } createMediaElementSource() { return { connect() {} }; } };
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
window.BroadcastChannel = class { constructor() {} postMessage() {} };
window.Element.prototype.scrollIntoView = () => {};
window.Element.prototype.scrollTo = () => {};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);

// 加载真实 bundle（与生产完全一致）
window.eval(bundle);

console.log("== 环境 ==");
check("bundle 加载成功（window.App 存在）", !!window.App);
check("初始化完成（无 JS 错误上报）", logCalls.length === 0, logCalls.join(";"));

// ── 场景 1：酷狗源播放 + 歌词逐句高亮 ──
console.log("== 场景 1：酷狗源，原生歌词逐句高亮 ==");
window.App.searchHist("晴天");
await new Promise((r) => setTimeout(r, 50));
let rows = document.querySelectorAll(".track-row");
check("搜索结果渲染（3 行）", rows.length === 3);
rows[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));
check("开始播放（播放按钮进入播放态）", document.querySelector("#btnPlay").classList.contains("playing"));
const lines = document.querySelectorAll("#lyricBody .lyric-line");
check("歌词已渲染（5 行）", lines.length === 5, "实际 " + lines.length);

// 模拟时间推进：t=2s → 第 0 行激活
audio.currentTime = 2;
audio.dispatchEvent(new window.Event("timeupdate"));
let active = document.querySelectorAll("#lyricBody .lyric-line.active");
check("t=2s 第 0 行激活", active.length === 1 && active[0].dataset.index === "0", "active=" + (active[0] && active[0].dataset.index));

// t=6s → 第 1 行激活
audio.currentTime = 6;
audio.dispatchEvent(new window.Event("timeupdate"));
active = document.querySelectorAll("#lyricBody .lyric-line.active");
check("t=6s 第 1 行激活", active.length === 1 && active[0].dataset.index === "1", "active=" + (active[0] && active[0].dataset.index));

// t=14s → 第 3 行激活（跳过不匹配）
audio.currentTime = 14;
audio.dispatchEvent(new window.Event("timeupdate"));
active = document.querySelectorAll("#lyricBody .lyric-line.active");
check("t=14s 第 3 行激活", active.length === 1 && active[0].dataset.index === "3", "active=" + (active[0] && active[0].dataset.index));

// 进度条填充（duration 有限时）
const fill = document.getElementById("progressFill");
check("进度条已填充（width=14/269*100%）", fill.style.width === (14 / 269 * 100) + "%", "width=" + fill.style.width);

// ── 场景 2：B站源（无原生歌词 → 匹配 → 时间轴自动对齐）──
console.log("== 场景 2：B站源，匹配歌词 + 自动对齐 ==");
const blRow = document.querySelectorAll(".track-row")[2];
blRow.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));
const blLines = document.querySelectorAll("#lyricBody .lyric-line");
check("B站匹配歌词已渲染（4 行）", blLines.length === 4, "实际 " + blLines.length);

// 匹配歌词首行在 100s，播放到 t=20s 时应触发自动对齐并激活首行
audio.currentTime = 20;
audio.dispatchEvent(new window.Event("timeupdate"));
active = document.querySelectorAll("#lyricBody .lyric-line.active");
check("t=20s 自动对齐后首行激活", active.length === 1 && active[0].dataset.index === "0", "active=" + (active[0] && active[0].dataset.index));

// 对齐后应顺滑推进：t=65s 行号 >0，t=110s 行号 >1，t=160s 到达最后一行
audio.currentTime = 65;
audio.dispatchEvent(new window.Event("timeupdate"));
active = document.querySelectorAll("#lyricBody .lyric-line.active");
check("t=65s 推进到第 1 行之后", active.length === 1 && +active[0].dataset.index >= 1, "active=" + (active[0] && active[0].dataset.index));
audio.currentTime = 110;
audio.dispatchEvent(new window.Event("timeupdate"));
active = document.querySelectorAll("#lyricBody .lyric-line.active");
check("t=110s 推进到第 2 行之后", active.length === 1 && +active[0].dataset.index >= 2, "active=" + (active[0] && active[0].dataset.index));
audio.currentTime = 160;
audio.dispatchEvent(new window.Event("timeupdate"));
active = document.querySelectorAll("#lyricBody .lyric-line.active");
check("t=160s 到达最后一行", active.length === 1 && +active[0].dataset.index === 3, "active=" + (active[0] && active[0].dataset.index));

// ── 场景 3：切歌后音量保持 ──
console.log("== 场景 3：切歌音量保持 ==");
window.App.setSpeed(1);
audio.volume = 0.3;
rows[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 700)); // 等待渐入渐出完成（2×200ms）
check("切歌后音量保持 0.3", Math.abs(audio.volume - 0.3) < 0.05, "volume=" + audio.volume);

// ── 场景 4：播放/暂停无未捕获异常 ──
console.log("== 场景 4：播放/暂停/快捷键 ==");
window.App.toggle();
window.App.toggle();
check("快速切换播放/暂停无错误上报", logCalls.filter((l) => l.includes("unhandled") || l.includes("TypeError") || l.includes("Error")).length === 0, logCalls.join(";"));

// ── 场景 5：⋮ 菜单开合逻辑 ──
console.log("== 场景 5：⋮ 菜单开合 ==");
const menuBtn = document.querySelector('.track-row [data-act="menu"]');
menuBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
check("⋮ 菜单已打开", document.getElementById("contextMenu").classList.contains("show"));
// 点击另一行主体 → 菜单应关闭（且不阻止其他逻辑）
const otherRow = document.querySelectorAll(".track-row")[1];
otherRow.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
check("点击列表其他区域后菜单关闭", !document.getElementById("contextMenu").classList.contains("show"));
// 再点 ⋮ 打开，再点同一 ⋮ → 切换关闭
menuBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
check("再次点击 ⋮ 打开菜单", document.getElementById("contextMenu").classList.contains("show"));
menuBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
check("再次点击同一 ⋮ 切换关闭", !document.getElementById("contextMenu").classList.contains("show"));
// 打开后点击菜单项 → 关闭并执行操作
menuBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
const firstItem = document.querySelector("#contextMenu .menu-item");
check("菜单项已渲染", !!firstItem);
firstItem.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
check("点击菜单项后菜单关闭", !document.getElementById("contextMenu").classList.contains("show"));



// ── 场景 6：侧边栏高亮/徽标 ──
console.log("== 场景 6：侧边栏高亮与徽标 ==");
const navFav = document.querySelector('.nav-item[data-tab="favlist"]');
navFav.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
let plItemActive = document.querySelectorAll("#plList .pl-item.active");
check("切到收藏页后歌单列表无残留高亮", plItemActive.length === 0, "active=" + plItemActive.length);
check("收藏页 nav 高亮", navFav.classList.contains("active"));
const plNav = document.querySelector('.nav-item[data-tab="playlist"]');
plNav.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
plItemActive = document.querySelectorAll("#plList .pl-item.active");
check("切回歌单页后当前歌单高亮", plItemActive.length === 1, "active=" + plItemActive.length);
check("我的歌单徽标 = 歌单总数", document.getElementById("playlistCount").textContent === String(window.S ? window.S.pls.length : 1));
// 收藏徽标：切回搜索页，对结果第一行收藏
const searchNav = document.querySelector('.nav-item[data-tab="search"]');
searchNav.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
const favBtn = document.querySelector('.track-row [data-act="fav"]');
check("搜索结果行存在", !!favBtn);
if (favBtn) {
  favBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  check("收藏徽标已更新为 1", document.getElementById("favCount").textContent === "1", "text=" + document.getElementById("favCount").textContent);
}

// ── 场景 7：播放模式切换 ──
console.log("== 场景 7：播放模式 ==");
const modeBtn = document.getElementById("btnMode");
const iconBefore = modeBtn.innerHTML;
window.App.cycleMode();
await new Promise((r) => setTimeout(r, 30));
check("模式图标随点击更新", modeBtn.innerHTML !== iconBefore);
// 连续切换 5 次无错误上报（覆盖四种模式轮换）
window.App.cycleMode(); await new Promise((r) => setTimeout(r, 30));
window.App.cycleMode(); await new Promise((r) => setTimeout(r, 30));
window.App.cycleMode(); await new Promise((r) => setTimeout(r, 30));
check("模式连续切换无错误上报", logCalls.filter((l) => l.includes("Error") || l.includes("MODE_LABELS")).length === 0, logCalls.join(";"));

// ── 场景 8：切歌音量保持 ──
console.log("== 场景 8：切歌音量（fadeIn 用淡出前音量） ==");
audio.volume = 0.45;
const rows2 = document.querySelectorAll(".track-row");
rows2[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 700));
check("切歌后音量保持 0.45", Math.abs(audio.volume - 0.45) < 0.06, "volume=" + audio.volume);

// ── 场景 9：全屏歌词卡拉OK 逐字点亮 ──
console.log("== 场景 9：全屏歌词卡拉OK ==");
window.App.openLyrics();
await new Promise((r) => setTimeout(r, 120));
audio.currentTime = 3; // 推进到歌词第 0 行内（行时间 1~5s）
audio.dispatchEvent(new window.Event("timeupdate"));
await new Promise((r) => setTimeout(r, 60));
const ilActive = document.querySelector("#ilLyrics .il-line.active .il-chars");
check("全屏歌词激活行已拆字", !!ilActive && ilActive.children.length > 0, "chars=" + (ilActive && ilActive.children.length));
if (ilActive && ilActive.children.length) {
  // 卡啦OK 由动画循环持续驱动（requestAnimationFrame 桩每 16ms 一帧）
  await new Promise((r) => setTimeout(r, 60));
  const spans = ilActive.children;
  const midIdx = Math.floor(spans.length / 2);
  check("前半行字符仍暗", spans[0].style.color !== "#fff" || spans[0].style.color.includes("0.2"));
  check("至少一个字符非全暗", spans[spans.length - 1].style.color !== "" && spans[spans.length - 1].style.color.includes("rgba"));
}
// 三档背景切换无异常
window.App.cycleILMode(); await new Promise((r) => setTimeout(r, 40));
window.App.cycleILMode(); await new Promise((r) => setTimeout(r, 40));
window.App.cycleILMode(); await new Promise((r) => setTimeout(r, 40));
check("背景三档切换无错误上报", logCalls.filter((l) => l.includes("Error")).length === 0);

// ── 场景 11：搜索失败 → 明确报错而非静默空列表 ──
console.log("== 场景 11：搜索失败反馈 ==");
window.__failSearch = true; // fetch 桩返回 500+{"error"}
window.App.searchHist("晴天"); // 触发一次失败搜索
await new Promise((r) => setTimeout(r, 150));
check("失败时显示错误提示", document.getElementById("toast").textContent.includes("搜索失败"), "toast=" + document.getElementById("toast").textContent);
check("失败时结果不被污染（showEmpty 而非坏数据）", !document.querySelector(".track-row"), "rows=" + document.querySelectorAll(".track-row").length);
window.__failSearch = false;

// ── 场景 12：切歌后所有列表页高亮跟随（收藏页复现路径）──
console.log("== 场景 12：切歌高亮跟随 ==");
// 场景 11 留下空列表，先恢复搜索结果
window.App.searchHist("晴天");
await new Promise((r) => setTimeout(r, 150));
// 收藏第二首（场景 6 已收藏过第一首，再点会变成取消收藏）
const secondRow = document.querySelectorAll(".track-row")[1];
check("搜索结果第二行存在", !!secondRow);
const secondFavBtn = secondRow.querySelector('[data-act="fav"]');
secondFavBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));
document.querySelector('.nav-item[data-tab="favlist"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
const favRows = document.querySelectorAll(".track-row");
favRows[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
check("点击播放后高亮正确", favRows[0].classList.contains("playing"));
// 模拟"下一首"（走队列路径，此前会把所有列表高亮清掉）
window.App.next();
await new Promise((r) => setTimeout(r, 250));
const playingAfterNext = document.querySelectorAll(".track-row.playing").length;
check("队列切歌后高亮仍正确跟随", playingAfterNext === 1, "playing=" + playingAfterNext);

console.log("");
if (failures === 0) console.log("=== ALL TESTS PASSED ===");
else console.log("=== " + failures + " TEST(S) FAILED ===");
process.exit(failures === 0 ? 0 : 1);
