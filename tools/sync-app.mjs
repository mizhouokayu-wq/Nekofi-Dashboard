/**
 * 把 Web 渲染层同步进插件的 main.js 生成区块。
 *
 * 为什么需要这一步：Obsidian 只会加载插件目录下的 main.js / styles.css / manifest.json，
 * 插件必须自包含；而 web/app.js 又要能被浏览器直接双击打开。为了只维护一份渲染层，
 * 这里把 web/app.js 作为唯一事实来源，生成到 main.js 末尾的「生成区块」里。
 * 生成出的内容不参与手写维护，任何漂移都由 --check 拦住。
 *
 * 用法（在仓库任意位置执行均可）：
 *   node tools/sync-app.mjs            # 重新生成
 *   node tools/sync-app.mjs --check    # 只校验是否漂移，不写盘（测试用）
 */
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_DIR, WEB_DIR } from "../web/tools/plugin-helpers.mjs";

const APP_FILE = path.join(WEB_DIR, "app.js");
const CSS_FILE = path.join(WEB_DIR, "styles.css");
/* --target <path>：把生成结果写到别处（构建脚本的 --check 用它构建到系统临时目录，
   这样"校验 main.js 是否与源码同步"就不必改动真正的产物）。缺省仍是插件的 main.js。 */
const targetArgIndex = process.argv.indexOf("--target");
const TARGET_MAIN = targetArgIndex >= 0 && process.argv[targetArgIndex + 1]
  ? path.resolve(process.argv[targetArgIndex + 1])
  : "";
const MAIN_FILE = TARGET_MAIN || path.join(PLUGIN_DIR, "main.js");
const PLUGIN_CSS_FILE = path.join(PLUGIN_DIR, "styles.css");

const START = "/* ===== PP_WEB_RENDERER_START";
const END = "/* ===== PP_WEB_RENDERER_END ===== */";
const FACTORY = "function ppWebAppFactory(window, document, navigator, localStorage, module, exports) {";
const FACTORY_END = ";return module.exports; }";

/** 插件 styles.css 里由 web 同步的调色板：配色只维护一份，避免「改了 web 忘了插件」。
 *  区域之外的排版令牌（圆角、间距、字体、Obsidian 变量覆盖）仍然是插件手写的。 */
const PALETTE_KEYS = [
  "--pp-bg-0", "--pp-bg-1", "--pp-bg-2", "--pp-bg-3", "--pp-bg-4",
  "--pp-line-1", "--pp-line-2", "--pp-line-3",
  "--pp-ink-1", "--pp-ink-2", "--pp-ink-3", "--pp-ink-4",
  "--pp-coral", "--pp-coral-hi", "--pp-coral-soft",
  "--pp-mint", "--pp-mint-soft", "--pp-lilac", "--pp-lilac-soft",
  "--pp-amber", "--pp-amber-soft", "--pp-rose", "--pp-rose-soft",
  "--pp-glass", "--pp-glass-strong", "--pp-lift-1", "--pp-lift-2", "--pp-glow",
  "--pp-grad-cta", "--pp-grad-active", "--pp-grad-fill", "--pp-grad-hero", "--pp-halo", "--pp-on-ink"
];
const PALETTE_REGIONS = [
  { start: "/* ===== PP_PALETTE_DARK_START ===== */", end: "/* ===== PP_PALETTE_DARK_END ===== */", source: "dark" },
  { start: "/* ===== PP_PALETTE_LIGHT_START ===== */", end: "/* ===== PP_PALETTE_LIGHT_END ===== */", source: "light" }
];

/** 取含 --pp-bg-0 的那一段 `:root { ... }`（web/styles.css 有两套 :root） */
function auroraRoot(css) {
  const blocks = [];
  const finder = /:root\s*\{/g;
  let match = finder.exec(css);
  while (match) {
    let depth = 0;
    for (let index = css.indexOf("{", match.index); index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") {
        depth -= 1;
        if (depth === 0) { blocks.push(css.slice(match.index, index + 1)); break; }
      }
    }
    match = finder.exec(css);
  }
  return blocks.find((block) => block.includes("--pp-bg-0")) || "";
}

/** 取某个选择器后的第一段块体 */
function blockAfter(css, pattern) {
  const index = css.search(pattern);
  if (index < 0) return "";
  let depth = 0;
  for (let cursor = css.indexOf("{", index); cursor < css.length; cursor += 1) {
    if (css[cursor] === "{") depth += 1;
    if (css[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(css.indexOf("{", index) + 1, cursor);
    }
  }
  return "";
}

/** 从 web/styles.css 读出调色板声明（保持 web 里的书写顺序；多行值按目标换行符重排缩进） */
function readPalette(webCss, which, newline) {
  const block = which === "dark" ? auroraRoot(webCss) : blockAfter(webCss, /\.theme-light\s*\{/);
  const out = [];
  PALETTE_KEYS.forEach((key) => {
    const pattern = new RegExp("(?:^|[;{\\s])" + key + "\\s*:\\s*([^;]+);");
    const match = block.match(pattern);
    if (!match) return;
    const value = match[1].replace(/\s*\n\s*/g, newline + "    ").trim();
    out.push({ key, value });
  });
  return out;
}

/** 把插件 styles.css 的两个调色板区域重写成 web 的取值。
 *  必须用目标文件自己的换行符拼装、且不要再过一遍 normalize —— 插件 styles.css 是 CRLF，
 *  把已经含 CRLF 的文本再 "\n → \r\n" 一次会得到 \r\r\n，每跑一次多叠一层。 */
function syncPalette(pluginCss, webCss, newline) {
  let next = pluginCss;
  const report = [];
  PALETTE_REGIONS.forEach((region) => {
    const start = next.indexOf(region.start);
    if (start < 0) throw new Error("styles.css 缺少调色板标记：" + region.start);
    const end = next.indexOf(region.end, start);
    if (end < 0) throw new Error("styles.css 缺少调色板标记：" + region.end);
    const entries = readPalette(webCss, region.source, newline);
    if (!entries.length) throw new Error("web/styles.css 里找不到 " + region.source + " 调色板，无法同步");
    const body = newline + entries.map((entry) => "  " + entry.key + ": " + entry.value + ";").join(newline) + newline + "  ";
    next = next.slice(0, start + region.start.length) + body + next.slice(end);
    report.push({ region: region.source, keys: entries.length });
  });
  return { css: next, report };
}

const checkOnly = process.argv.slice(2).includes("--check");

function newlineOf(text) { return text.includes("\r\n") ? "\r\n" : "\n"; }
function toLf(text) { return String(text).replace(/\r\n/g, "\n"); }
function normalize(text, newline) { return newline === "\n" ? text : text.replace(/\n/g, newline); }
/** 去掉已有生成区块，返回可追加的基座（尾部统一用目标文件自己的换行符） */
function stripBlock(source, newline) {
  const start = source.indexOf(START);
  if (start < 0) return source.replace(/\s*$/, "") + newline;
  const end = source.indexOf(END, start);
  if (end < 0) throw new Error("main.js 里的生成区块只有开始标记、缺少结束标记，请手工修好后重试");
  return (source.slice(0, start) + source.slice(end + END.length)).replace(/\s*$/, "") + newline;
}

function buildBlock(appSource, css, newline) {
  const header = [
    START + " =================",
    " * 生成区块：Web 渲染层（不要手工编辑）",
    " *   源文件：web/app.js（渲染与交互）",
    " *           web/styles.css（夜航极光设计系统）",
    " *   重新生成：node tools/sync-app.mjs",
    " *   校验漂移：node tools/sync-app.mjs --check",
    " * 运行方式：ppWebAppFactory(...) 返回与浏览器版完全相同的 window.PPDashboard API；",
    " * 插件侧通过 api.mount({ data, host }) 把界面挂进 Shadow DOM，数据实时取自 Vault。",
    " * ================= */",
    "/** Web 版设计系统原文：挂载时注入 Shadow DOM，与宿主样式完全隔离 */",
    "const PP_WEB_CSS = " + JSON.stringify(css) + ";",
    "/** Web 版渲染层工厂：函数体就是 web/app.js 的原文，参数用于替代浏览器全局 */",
    FACTORY
  ].join("\n");
  const footer = [
    FACTORY_END,
    END
  ].join("\n");
  return normalize(header + "\n" + appSource.replace(/\s*$/, "") + "\n" + footer + "\n", newline);
}

function main() {
  /* 内联进 main.js 的源码一律先归一成 LF：main.js 会被「逐字节比较」（build.mjs --check），
     如果换行随检出的 git 设置变化（Windows 默认 autocrlf 会把 web/styles.css 变成 CRLF），
     克隆出来的仓库就会假报漂移。归一之后，产物只取决于源码内容、与平台无关。 */
  const appSource = toLf(fs.readFileSync(APP_FILE, "utf8"));
  const css = toLf(fs.readFileSync(CSS_FILE, "utf8"));
  const current = fs.readFileSync(MAIN_FILE, "utf8");
  /* 接缝同样用目标文件自己的换行符：硬编码 "\n" 会让「用别的换行符的编辑器保存一次」
     就触发一次假漂移，把交付闸门变成噪声。 */
  const newline = newlineOf(current);
  const next = stripBlock(current, newline) + newline + buildBlock(appSource, css, newline);

  /* 插件的调色板同样由 web/styles.css 生成：第二份"人手拷贝"是配色漂移的温床 */
  const pluginCssCurrent = fs.readFileSync(PLUGIN_CSS_FILE, "utf8");
  const pluginNewline = newlineOf(pluginCssCurrent);
  const palette = syncPalette(pluginCssCurrent, css, pluginNewline);
  const nextPluginCss = palette.css;

  if (checkOnly) {
    let drifted = false;
    if (next !== current) {
      console.error("生成区块与 web/ 源文件不一致（漂移）。请运行：node tools/sync-app.mjs");
      const before = current.split(/\r?\n/).length;
      const after = next.split(/\r?\n/).length;
      console.error("  main.js 当前 " + before + " 行 → 期望 " + after + " 行");
      drifted = true;
    }
    if (nextPluginCss !== pluginCssCurrent) {
      console.error("插件 styles.css 的调色板与 web/styles.css 不一致（漂移）。请运行：node tools/sync-app.mjs");
      console.error("  涉及 " + palette.report.map((item) => item.region).join(" / ") + " 两套令牌");
      drifted = true;
    }
    if (drifted) { process.exitCode = 1; return; }
    console.log("生成区块与 web/app.js + web/styles.css 一致（含插件 styles.css 调色板）。");
    return;
  }

  let wrote = false;
  if (next !== current) {
    fs.writeFileSync(MAIN_FILE, next, "utf8");
    wrote = true;
    console.log("已生成 Web 渲染层区块 → " + path.relative(PLUGIN_DIR, MAIN_FILE));
    console.log("  app.js " + appSource.split(/\r?\n/).length + " 行 · styles.css " + css.split(/\r?\n/).length + " 行 · main.js 现在 " + next.split(/\r?\n/).length + " 行");
  }
  if (nextPluginCss !== pluginCssCurrent && !TARGET_MAIN) {
    fs.writeFileSync(PLUGIN_CSS_FILE, nextPluginCss, "utf8");
    wrote = true;
    console.log("已同步插件 styles.css 调色板（" + palette.report.map((item) => item.region + " " + item.keys + " 个令牌").join(" / ") + "）");
  }
  if (!wrote) console.log("生成区块与调色板都已是最新，无需改动。");
}

main();
