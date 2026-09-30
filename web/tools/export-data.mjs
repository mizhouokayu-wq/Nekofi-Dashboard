/**
 * 从当前 vault 生成 Web 仪表盘数据：web/data.js
 *
 * 数据推导（项目 / 任务 / 时间规划 / 资源归类 / 统计）已经收敛到插件 main.js 的
 * buildWebPayload()：这里只负责扫描 vault、读取正文、维护历史快照并写文件。
 * 因此「浏览器里打开的 web 版」与「插件内嵌的 Web 渲染层视图」对同一条笔记的
 * 判定完全一致，不会再出现网页算一套、插件算另一套。
 *
 * 用法：
 *   node tools/export-data.mjs                      # 扫描 vault（默认按仓库位置回推）
 *   node tools/export-data.mjs --vault <目录>        # 扫描指定 vault（测试夹具也走这条）
 *   node tools/export-data.mjs --out data.js
 *   node tools/export-data.mjs --stdout             # 只打印摘要，不写文件
 *   node tools/export-data.mjs --no-history         # 不更新 data.history.json（测试用）
 */
import fs from "node:fs";
import path from "node:path";
import { loadPluginHelpers, loadPluginSettings, vaultName, vaultFromArgs, WEB_DIR } from "./plugin-helpers.mjs";

const args = process.argv.slice(2);
const stdoutOnly = args.includes("--stdout");
const skipHistory = args.includes("--no-history");
const outIndex = args.indexOf("--out");
const OUT_FILE = outIndex >= 0 ? path.resolve(WEB_DIR, args[outIndex + 1]) : path.join(WEB_DIR, "data.js");
const VAULT_DIR = vaultFromArgs(args);

const helpers = loadPluginHelpers();
const settings = loadPluginSettings(helpers);

const MANAGED_FOLDERS = [
  settings.inboxFolder, settings.areaFolder, settings.projectFolder,
  settings.knowledgeFolder, settings.bookFolder, settings.peopleFolder, settings.taskFolder
];

/* ----------------------------- 扫描 vault ----------------------------- */

/** 递归收集 .md 的绝对路径；跳过「AI禁止阅读」路径 */
function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (helpers.forbiddenPath(path.relative(VAULT_DIR, full).split(path.sep).join("/"))) continue;
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(full);
  }
  return files;
}

function isManaged(relative) {
  if (helpers.forbiddenPath(relative)) return false;
  return MANAGED_FOLDERS.filter(Boolean).some((folder) => helpers.inFolder(relative, folder));
}

/** 读取一条笔记：插件侧用 vault.cachedRead + parseFM，这里用 fs + parseFM，得到同一形状 */
function readNote(relative) {
  const full = path.join(VAULT_DIR, relative);
  const content = fs.readFileSync(full, "utf8");
  const parsed = helpers.parseFM(content);
  return { path: relative, name: helpers.nameOf(relative), frontmatter: parsed.data || {}, body: parsed.body || "" };
}

const allFiles = MANAGED_FOLDERS.filter(Boolean).flatMap((folder) => walk(path.join(VAULT_DIR, folder)))
  .map((full) => path.relative(VAULT_DIR, full).split(path.sep).join("/"));
const notes = [...new Set(allFiles)].filter(isManaged).map(readNote);

/* ------------------------------ 数据推导 ------------------------------ */

/** 读取 assets/manifest.json（由 tools/build_assets.py 生成）：横幅与导航卡的素材、平均亮度与建议文字色 */
function loadAssets() {
  try {
    return JSON.parse(fs.readFileSync(path.join(WEB_DIR, "assets", "manifest.json"), "utf8"));
  } catch (error) {
    console.warn("[assets] 未找到 assets/manifest.json，横幅与导航卡将回退到纯 CSS 渐变：" + error.message);
    return {};
  }
}

/* 整库索引（数据页签用）：跳过 .obsidian 与「AI禁止阅读」路径 */
function walkAll(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(VAULT_DIR, full).split(path.sep).join("/");
    if (helpers.forbiddenPath(relative) || relative.split(path.sep).some((segment) => segment.startsWith("."))) continue;
    if (entry.isDirectory()) walkAll(full, files);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(relative);
  }
  return files;
}

const noteIndex = [...new Set(walkAll(VAULT_DIR))].map((relative) => {
  const parsed = helpers.parseFM(fs.readFileSync(path.join(VAULT_DIR, relative), "utf8"));
  return { path: relative, name: helpers.nameOf(relative), frontmatter: parsed.data || {} };
});

const payload = helpers.buildWebPayload(notes, settings, {
  noteIndex,
  vaultName: vaultName(VAULT_DIR),
  assets: loadAssets(),
  generatedAt: new Date().toISOString()
});

/* ------------------------------ 历史记录 ------------------------------ */

const historyPath = path.join(WEB_DIR, "data.history.json");
let history = [];
if (fs.existsSync(historyPath)) { try { history = JSON.parse(fs.readFileSync(historyPath, "utf8")); } catch (error) { history = []; } }
const historyEntry = {
  at: payload.generatedAt,
  tasks: payload.stats.tasks,
  activeTasks: payload.stats.activeTasks,
  projects: payload.stats.projects,
  overdue: payload.stats.overdue,
  inbox: payload.stats.inbox
};
history = history.concat([historyEntry]).slice(-90);
payload.history = history;
if (!stdoutOnly && !skipHistory) fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8");

/* ------------------------------- 输出 ------------------------------- */

if (stdoutOnly) {
  /* folders 一起回显：调用方（测试）据此按同一套目录口径核对"导出结果 == 库里实际有什么"，
     这样无论本机 data.json 是什么目录配置，核对都是自洽的。 */
  console.log(
    JSON.stringify(
      { stats: payload.stats, projects: payload.projects.length, tasks: payload.tasks.length, folders: MANAGED_FOLDERS },
      null,
      2,
    ),
  );
} else {
  const banner = "/* 由 tools/export-data.mjs 生成，请勿手工编辑。重建：node tools/export-data.mjs */\n";
  fs.writeFileSync(OUT_FILE, banner + "window.DASHBOARD_DATA = " + JSON.stringify(payload, null, 2) + ";\n", "utf8");
  console.log("已生成 " + path.relative(VAULT_DIR, OUT_FILE));
  console.log("  项目 " + payload.projects.length + " · 任务 " + payload.tasks.length + "（进行中 " + payload.stats.activeTasks + "）· 草稿 " + payload.stats.inbox
    + " · 逾期 " + payload.stats.overdue + " · 知识 " + payload.stats.knowledge);
  console.log("  数据源自：" + payload.vaultName);
}
