// test-helpers.mjs — 服务层测试共享设施：
// 用 esbuild 打包 test-entry.js（CJS），在 jsdom 环境内求值后暴露到 window.__test
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function waitFor(fn, ms = 2000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("waitFor timeout: " + label);
}

export async function bootServices(opts = {}) {
  // 1. 打包 test-entry（CJS 格式便于取 exports）
  const out = path.join(root, "node_modules", ".cache", "bundle-test.js");
  await esbuild.build({
    entryPoints: [path.join(root, "static/js/test-entry.js")],
    bundle: true,
    format: "cjs",
    outfile: out,
    target: "chrome110",
    logLevel: "silent",
  });
  const code = readFileSync(out, "utf8");

  // 2. jsdom 环境 + 桩
  const html = readFileSync(path.join(root, "static/index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://127.0.0.1:21345/", pretendToBeVisual: true, runScripts: "outside-only" });
  const w = dom.window, d = w.document;
  const fetchLog = [];
  w.fetch = async (url) => {
    const u = String(url); fetchLog.push(u);
    let data = { success: true };
    if (u.startsWith("/api/search")) {
      const q = new URL("http://x" + u).searchParams;
      const page = +(q.get("page") || 1);
      data = [{ id: "kg" + page, title: "晴天", artist: "周杰伦", duration: 269, source: "kg" }];
    } else if (u.startsWith("/api/playlists")) data = { playlists: opts.playlists || [{ id: "p1", name: "我的歌单", songs: [], created_at: 1, updated_at: 1 }] };
    else if (u.startsWith("/api/song/url")) data = { url: "http://fake-cdn/audio.mp3" };
    return { ok: true, status: 200, json: async () => data };
  };
  function stubCtx(){const p=new Proxy(function(){},{get:(t,k)=>(k===Symbol.toPrimitive?()=>0:stubCtx()),apply:()=>stubCtx(),set:()=>true});return p}
  w.HTMLCanvasElement.prototype.getContext = () => stubCtx();
  const audio = d.getElementById("audio");
  Object.defineProperty(audio, "currentTime", { value: 0, writable: true });
  Object.defineProperty(audio, "duration", { value: 269, writable: true });
  audio.play = () => Promise.resolve(); audio.pause = () => {};
  w.AudioContext = class { constructor(){} resume(){return Promise.resolve()} createAnalyser(){return{fftSize:0,smoothingTimeConstant:0,frequencyBinCount:0,connect(){},getByteFrequencyData(){}}} createMediaElementSource(){return{connect(){}}} };
  w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){} });
  w.Element.prototype.scrollIntoView = () => {};
  w.Element.prototype.scrollTo = () => {};
  w.requestAnimationFrame = () => 0;
  w.prompt = () => opts.promptValue ?? null;
  w.confirm = () => opts.confirmValue ?? true;

  // 3. 在 window 内求值 CJS 产物，取 exports
  w.eval('var module={exports:{}};var exports=module.exports;\n' + code + '\nwindow.__test=module.exports;');
  await waitFor(() => !!w.__test, 2000, "test bundle eval");
  return { window: w, document: d, test: w.__test, fetchLog };
}
