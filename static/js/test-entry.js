// test-entry.js — 仅供自动化测试使用：导出服务层内部函数，
// 由 scripts/test-helpers.mjs 用 esbuild 打包后在 jsdom 环境求值。
// 不被 app.js 引用，不进入生产 bundle。
export { reorderQueue, removeFromQueue, clearQueue, playNextInsert } from "./player.js";
export { reorderPl, rmFromPl, addPlNamed, findPl, isFav, toggleFav, loadRecent } from "./playlist.js";
export { parseLrc, parseQrc, normalizeILMode, tokenizeLyrics } from "./lyrics.js";
export { setState, getState, subscribe } from "./store.js";
export { S } from "./state.js";
