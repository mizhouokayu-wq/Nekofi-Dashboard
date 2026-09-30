/**
 * 在 Node 环境里加载 main.js 的纯函数层。
 *
 * 目的：Web 仪表盘与 Obsidian 插件共用同一套状态推导 / 目录规则，
 * 避免「网页算一套、插件算另一套」。这里用一个最小 obsidian 桩替换
 * require("obsidian")，再把需要的顶层函数导出。
 *
 * 路径：仓库根就是插件目录（manifest.json / main.js 在根上），web/ 是浏览器版渲染层。
 * 需要「真实 vault」的脚本（export-data.mjs / build_assets.py）默认按老布局回推
 * （仓库位于 <vault>/.obsidian/plugins/<id>），克隆到别处时用 --vault 或 PPD_VAULT 指定。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN_DIR = path.resolve(WEB_DIR, "..");
/** 仓库放在 .obsidian/plugins/<插件> 下时，回推出来的 vault 根目录 */
export const DEFAULT_VAULT_DIR = process.env.PPD_VAULT
  ? path.resolve(process.env.PPD_VAULT)
  : path.resolve(PLUGIN_DIR, "..", "..", "..");
/** 历史别名：老脚本按这个名字取 vault 目录 */
export const VAULT_DIR = DEFAULT_VAULT_DIR;

const HELPER_NAMES = [
  "DEFAULTS", "STATUS", "NON_TASK_TYPES",
  "today", "dateOf", "daysUntil", "addDays",
  "taskStatus", "projectStatus", "statusLabel", "shouldSplitTask",
  "buildTimePlan", "buildTaskHierarchy", "sortTaskList", "blockerItems", "buildResourceMap",
  "normalizeList", "refs", "nameOf", "cleanName", "text",
  "inFolder", "directChild", "forbiddenPath", "projectMatches",
  "parseFM", "isImageAssetPath", "resolveAssetPath",
  "buildWebPayload"
];

function localISODate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

/** 构造一个只满足 main.js 加载与纯函数调用的 obsidian 桩 */
function obsidianStub() {
  const moment = () => ({
    format: (pattern) => (pattern === "HH" || pattern === "H" ? String(new Date().getHours()).padStart(2, "0") : localISODate())
  });
  return {
    Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
    Setting: class {}, Notice: class {},
    TFile: class {}, TFolder: class {},
    normalizePath: (value) => String(value ?? "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, ""),
    moment,
    debounce: (fn) => fn
  };
}

export function loadPluginHelpers(mainPath = path.join(PLUGIN_DIR, "main.js")) {
  const source = fs.readFileSync(mainPath, "utf8");
  const context = {
    module: { exports: {} },
    require: (name) => {
      if (name === "obsidian") return obsidianStub();
      throw new Error("插件运行时不支持 require(" + name + ")");
    },
    window: { moment: obsidianStub().moment, setTimeout, clearTimeout, setInterval, clearInterval },
    document: { createElement: () => ({}), addEventListener() {}, removeEventListener() {} },
    URL: { createObjectURL: () => "", revokeObjectURL() {} },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  context.globalThis = context;
  const expose = "\n;module.exports.__helpers = { " +
    HELPER_NAMES.map((name) => `${name}: (typeof ${name} !== "undefined" ? ${name} : undefined)`).join(", ") +
    " };\n";
  vm.runInNewContext(source + expose, context, { filename: mainPath });
  const helpers = context.module.exports.__helpers;
  const missing = HELPER_NAMES.filter((name) => helpers[name] === undefined);
  if (missing.length) throw new Error("main.js 缺少纯函数：" + missing.join(", "));
  return helpers;
}

/** 读取插件设置（data.json），Web 端与插件使用同一套目录与容量配置 */
export function loadPluginSettings(helpers) {
  const dataPath = path.join(PLUGIN_DIR, "data.json");
  let stored = {};
  if (fs.existsSync(dataPath)) {
    try { stored = JSON.parse(fs.readFileSync(dataPath, "utf8")); } catch (error) { console.warn("[web] data.json 解析失败，使用默认配置：" + error.message); }
  }
  return Object.assign({}, helpers.DEFAULTS, stored);
}

export function vaultName(vaultDir = DEFAULT_VAULT_DIR) { return path.basename(vaultDir); }

/** 解析 `--vault <dir>` 参数：显式指定要扫描的 vault（克隆到别处、或指向测试夹具时用） */
export function vaultFromArgs(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--vault");
  return index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : DEFAULT_VAULT_DIR;
}
