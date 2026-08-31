// 前端打包脚本：JS 与 CSS 分别打包到 static/bundle.js 和 static/bundle.css
import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

const options = [
  {
    entryPoints: [path.join(root, "static/js/app.js")],
    bundle: true,
    minify: true,
    // 模块间通过共享全局作用域互相引用（非 ESM 导出），必须关闭 tree-shaking
    treeShaking: false,
    outfile: path.join(root, "static/bundle.js"),
    target: ["chrome110"],
    logLevel: "info",
  },
  {
    entryPoints: [path.join(root, "static/js/mini.js")],
    bundle: true,
    minify: true,
    treeShaking: false,
    outfile: path.join(root, "static/bundle-mini.js"),
    target: ["chrome110"],
    logLevel: "info",
  },
  {
    entryPoints: [path.join(root, "static/css/app.css")],
    bundle: true,
    minify: true,
    outfile: path.join(root, "static/bundle.css"),
    logLevel: "info",
  },
];

if (watch) {
  for (const opt of options) {
    const ctx = await context(opt);
    await ctx.watch();
  }
  console.log("watching static/ ...");
} else {
  for (const opt of options) {
    await build(opt);
  }
  console.log("build done: static/bundle.js + static/bundle.css");
}
