"use strict";
/** Web 仪表盘：数据生成、纯函数、静态一致性 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { test, tests, eqJson } = require("../util");
const { PLUGIN_DIR } = require("../tools/check-css-coverage");

const WEB_DIR = path.join(PLUGIN_DIR, "web");
/** 导出脚本的测试夹具：仓库自带的小 vault，任何人都能跑，不依赖本机真实知识库 */
const FIXTURE_VAULT = path.join(PLUGIN_DIR, "tests", "fixtures", "vault");

const appPath = path.join(WEB_DIR, "app.js");

function loadApp() {
  const source = fs.readFileSync(appPath, "utf8");
  const context = {
    module: { exports: {} },
    window: { location: { hash: "" }, addEventListener() {}, clearTimeout, setTimeout },
    document: { readyState: "loading", addEventListener() {}, getElementById: () => null, querySelector: () => null },
    console, setTimeout, clearTimeout, setInterval, clearInterval
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: appPath });
  return context.module.exports;
}

/** 极简 DOM 桩：只满足 app.js 渲染所需的最小接口，用来真实跑一遍渲染函数 */
function createDom() {
  const nodes = new Map();
  const makeNode = (id) => ({
    id, innerHTML: "", textContent: "", hidden: true, disabled: false, value: "",
    setAttribute() {}, getAttribute: () => null, focus() {}, setSelectionRange() {}, scrollIntoView() {}, addEventListener() {}
  });
  return {
    readyState: "complete",
    getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); },
    createElement: () => makeNode("created"),
    addEventListener() {}, querySelector: () => null,
    body: { appendChild() {}, removeChild() {} },
    nodes
  };
}

/** 在 DOM 桩里真实启动 app.js，返回 { app, dom, html(view) } */
function bootApp() {
  const source = fs.readFileSync(appPath, "utf8");
  const dom = createDom();
  const context = {
    module: { exports: {} },
    window: {
      location: { hash: "#/overview" },
      addEventListener() {},
      clearTimeout, setTimeout,
      DASHBOARD_DATA: vaultData(),
      DASHBOARD_DATA_SAMPLE: readData("data.sample.js")
    },
    document: dom,
    localStorage: { getItem: () => null, setItem() {} },
    navigator: {},
    console, setTimeout, clearTimeout, setInterval, clearInterval
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: appPath });
  return { app: context.module.exports, dom, html: (id) => dom.getElementById(id).innerHTML };
}

/** data.js 是「本机 vault 导出」的产物（不进仓库，见 .gitignore）：没有它时用仓库夹具现导一份 */
function hasVaultExport() {
  return fs.existsSync(path.join(WEB_DIR, "data.js"));
}

function evalDataFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: file });
  return context.window.DASHBOARD_DATA || context.window.DASHBOARD_DATA_SAMPLE;
}

function readData(fileName) {
  const file = path.join(WEB_DIR, fileName);
  if (!fs.existsSync(file)) return null;
  return evalDataFile(file);
}

let cachedVaultExport;
/**
 * 「真实数据」的来源：本机导过 web/data.js 就直接用它（真实知识库），
 * 否则用仓库自带的夹具 vault 现导一份到系统临时目录。
 * 两条路验证的是同一件事：export-data.mjs 产出的 payload 能被页面正常渲染。
 */
function vaultData() {
  if (cachedVaultExport !== undefined) return cachedVaultExport;
  const local = readData("data.js");
  if (local) {
    cachedVaultExport = local;
    return local;
  }
  const out = path.join(os.tmpdir(), "ppd-fixture-data-" + process.pid + ".js");
  const result = spawnSync(
    process.execPath,
    [path.join(WEB_DIR, "tools", "export-data.mjs"), "--vault", FIXTURE_VAULT, "--out", out, "--no-history"],
    { cwd: WEB_DIR, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("夹具 vault 导出失败：" + (result.stderr || "").slice(0, 400));
  cachedVaultExport = evalDataFile(out);
  fs.rmSync(out, { force: true });
  return cachedVaultExport;
}

test("web/index.html 引用的本地资源都存在", async () => {
  const html = fs.readFileSync(path.join(WEB_DIR, "index.html"), "utf8");
  ["styles.css", "app.js", "data.sample.js"].forEach((file) => {
    assert.ok(html.includes(file), "index.html 未引用 " + file);
    assert.ok(fs.existsSync(path.join(WEB_DIR, file)), "缺少文件 " + file);
  });
  /* data.js 只在"本机导出了真实数据"时存在：仓库里只放演示数据，缺它时页面回落到演示集 */
  assert.ok(html.includes("data.js"), "index.html 应把 data.js 作为可选的真实数据源引用");
  assert.ok(
    /<script[^>]*data\.js[^>]*>\s*<\/script>/.test(html),
    "data.js 必须是独立的 <script>（缺文件时浏览器只跳过这一条，页面继续用演示数据）",
  );
  assert.ok(html.includes('lang="zh-CN"'));
  assert.ok(html.includes('charset="utf-8"'));
  assert.equal((html.match(/<script /g) || []).length, (html.match(/<\/script>/g) || []).length, "script 标签应成对");
  assert.equal((html.match(/<section /g) || []).length, (html.match(/<\/section>/g) || []).length);
  // app.js 在启动与渲染时会查询这些节点，缺一个就会整页报错
  ["view", "tabs", "drawer", "scrim", "footer", "source-toggle", "date-chip"].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), "index.html 缺少 #" + id);
    assert.ok(fs.readFileSync(appPath, "utf8").includes('"' + id + '"'), "app.js 未使用 #" + id);
  });
});

test("web/app.js 语法可解析且不依赖第三方库", async () => {
  const source = fs.readFileSync(appPath, "utf8");
  assert.doesNotThrow(() => new vm.Script(source, { filename: "app.js" }));
  assert.ok(!/import\s+.*from/.test(source), "不应使用 ESM import");
  assert.ok(!/cdn\.|unpkg|jsdelivr/.test(source), "不应引用 CDN 资源");
  assert.ok(!/\bfetch\(/.test(source), "file:// 下不应依赖 fetch");
});

test("数据文件结构完整（真实数据 + 演示数据）", async () => {
  [["data.js", "DASHBOARD_DATA"], ["data.sample.js", "DASHBOARD_DATA_SAMPLE"]].forEach(([file, globalName]) => {
    const data = file === "data.js" ? vaultData() : readData(file);
    assert.ok(data, file + " 未导出 " + globalName);
    ["generatedAt", "vaultName", "today", "settings", "stats", "projects", "tasks", "inbox", "timePlan", "resources", "hierarchy"].forEach((key) => {
      assert.ok(data[key] !== undefined, file + " 缺少字段 " + key);
    });
    /* 只断言"自洽"：用户随时会归档/删任务，写死数量只会因为库变化而红 */
    assert.equal(data.stats.tasks, data.tasks.length, file + " stats.tasks 与 tasks 数组长度不一致");
    assert.equal(data.stats.projects, data.projects.length, file + " stats.projects 与 projects 数组长度不一致");
    assert.ok(data.timePlan.days.length === data.settings.planningHorizonDays, file + " 时间规划天数应等于 planningHorizonDays");
    assert.ok(Array.isArray(data.tasks) && Array.isArray(data.projects));
    data.tasks.forEach((task) => {
      ["path", "title", "status", "taskSet", "taskGroup", "milestone", "priority", "duration"].forEach((key) => {
        assert.ok(task[key] !== undefined, file + " 任务缺少字段 " + key + "：" + task.title);
      });
    });
    data.projects.forEach((project) => {
      ["path", "title", "status", "progress", "milestones", "blockers"].forEach((key) => {
        assert.ok(project[key] !== undefined, file + " 项目缺少字段 " + key);
      });
      assert.ok(project.progress >= 0 && project.progress <= 100);
    });
  });
});

test("真实数据来自 vault：找到笔记且排除索引页", async () => {
  const data = vaultData();
  const paths = data.tasks.map((task) => task.path).concat(data.inbox.map((item) => item.path)).concat((data.projects || []).map((project) => project.path));
  assert.ok(paths.some((item) => item.includes("20 项目库/示例项目")), "应采集到项目库笔记，实际：" + paths.join(", "));
  assert.ok(!paths.some((item) => item.includes("AI禁止阅读")), "禁阅路径不应出现");
  assert.ok(!data.tasks.some((task) => task.path.endsWith("50 日程待办/日程待办.md")), "索引页不应被当成任务");
  assert.ok(data.projects.length >= 1);
  assert.match(data.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(data.settings.folders.project, "20 项目库");
  assert.ok(data.vaultName, "数据里应带 vault 名称");
});

test("演示数据包含逾期、超载与完整的任务集层级", async () => {
  const data = readData("data.sample.js");
  const app = loadApp();
  assert.ok(data.tasks.length >= 15, "演示数据任务太少：" + data.tasks.length);
  assert.ok(data.projects.length >= 3);
  assert.ok(data.tasks.some((task) => app.isOverdue(task)), "演示数据应包含逾期任务");
  assert.ok(data.timePlan.days.some((day) => day.overloaded), "演示数据应包含超载日");
  assert.ok(data.tasks.some((task) => task.status === "blocked"));
  assert.ok(data.tasks.some((task) => task.status === "doing"));
  assert.ok(data.tasks.some((task) => task.status === "paused"));
  assert.ok(data.gaps.length >= 2, "演示数据应包含知识缺口");
  assert.ok(data.resources.knowledge.length && data.resources.books.length && data.resources.people.length);
  assert.ok(data.hierarchy.length >= 2, "演示数据应有多个任务集");
  eqJson(data.settings.folders.project, "20 项目库");
});

test("app.js 纯函数：格式化与状态判断", async () => {
  const app = loadApp();
  assert.equal(app.escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
  assert.equal(app.statusLabelOf("todo"), "待办");
  assert.equal(app.statusLabelOf("expired"), "过期");
  assert.equal(app.dueLabel(-3), "逾期 3 天");
  assert.equal(app.dueLabel(0), "今天到期");
  assert.equal(app.dueLabel(1), "明天到期");
  assert.equal(app.dueLabel(9), "9 天后");
  assert.equal(app.dueLabel(null), "无 DDL");
  assert.equal(app.dueTone(-1), "danger");
  assert.equal(app.dueTone(0), "warn");
  assert.equal(app.dueTone(5), "muted");
  assert.equal(app.minutesLabel(45), "45 分钟");
  assert.equal(app.minutesLabel(60), "1 小时");
  assert.equal(app.minutesLabel(135), "2 小时 15 分");
  assert.equal(app.pct(1, 4), 25);
  assert.equal(app.pct(3, 0), 0);
  assert.equal(app.formatDate("2026-09-30"), "2026/09/30");
  assert.equal(app.shortDate("2026-09-02"), "9/2");
  assert.equal(app.weekdayLabel("2026-09-25"), "周五");
  assert.equal(app.checkProgress({ done: 2, open: 2, total: 4 }).percent, 50);
  assert.equal(app.priorityRank("high"), 0);
  assert.equal(app.priorityInfo("unknown").label, "中");
});

test("app.js 纯函数：筛选、排序与分组", async () => {
  const app = loadApp();
  const tasks = [
    { path: "a", title: "写方案", projectTitle: "网站", milestone: "MVP", taskSet: "本周维护", taskGroup: "资料整理", status: "todo", priority: "high", due: "2026-09-27", duration: 90 },
    { path: "b", title: "整理收件箱", projectTitle: "", milestone: "未分组", taskSet: "本周维护", taskGroup: "执行", status: "doing", priority: "medium", due: "2026-09-26", duration: 30 },
    { path: "c", title: "读书笔记", projectTitle: "", milestone: "未分组", taskSet: "学习", taskGroup: "阅读", status: "todo", priority: "low", due: "", duration: 60 }
  ];
  assert.equal(app.filterTasks(tasks, { query: "方案" }).length, 1);
  assert.equal(app.filterTasks(tasks, { query: "网站" }).length, 1, "搜索应覆盖项目名");
  assert.equal(app.filterTasks(tasks, { query: "MVP" }).length, 1, "搜索应覆盖节点名");
  assert.equal(app.filterTasks(tasks, { taskSet: "本周维护" }).length, 2);
  assert.equal(app.filterTasks(tasks, { status: "doing" }).length, 1);
  assert.equal(app.filterTasks(tasks, { priority: "high" }).length, 1);
  assert.equal(app.filterTasks(tasks, {}).length, 3);

  eqJson(app.sortTasks(tasks, "due").map((task) => task.path), ["b", "a", "c"], "无 DDL 应排在最后");
  eqJson(app.sortTasks(tasks, "priority").map((task) => task.path), ["a", "b", "c"]);
  eqJson(app.sortTasks(tasks, "duration").map((task) => task.path), ["a", "c", "b"]);
  assert.equal(tasks[0].path, "a", "排序不应修改原数组");

  const sets = app.groupTasks(tasks);
  eqJson(sets.map((set) => set.name), ["本周维护", "学习"]);
  eqJson(sets[0].groups.map((group) => group.name), ["资料整理", "执行"]);
  assert.equal(sets[0].groups[0].tasks.length, 1);
});

test("app.js 纯函数：焦点任务与 Obsidian 链接", async () => {
  const app = loadApp();
  const focus = app.focusTask([
    { path: "a", title: "普通", status: "todo", due: "2026-09-30", daysLeft: 5, duration: 30, priority: "low" },
    { path: "b", title: "最久的逾期", status: "todo", due: "2026-09-01", daysLeft: -10, duration: 30, priority: "low" },
    { path: "c", title: "次久逾期", status: "doing", due: "2026-09-05", daysLeft: -6, duration: 30, priority: "high" }
  ]);
  assert.equal(focus.path, "b");
  assert.equal(app.focusTask([{ path: "x", title: "已归档", status: "archived", daysLeft: -3 }]), null, "已完成任务不应成为焦点");
  assert.equal(
    app.obsidianUri("示例库+知识库", "20 项目库/仪表盘搭建/111.md"),
    "obsidian://open?vault=" + encodeURIComponent("示例库+知识库") + "&file=" + encodeURIComponent("20 项目库/仪表盘搭建/111")
  );
});

test("app.js 使用的样式类都在 styles.css 中定义", async () => {
  const source = fs.readFileSync(appPath, "utf8");
  const css = fs.readFileSync(path.join(WEB_DIR, "styles.css"), "utf8");
  const used = new Set();
  for (const match of source.matchAll(/class="([^"{}]+)"/g)) {
    match[1].split(/\s+/).forEach((token) => { if (/^[a-zA-Z][\w-]*$/.test(token)) used.add(token); });
  }
  for (const match of source.matchAll(/"span-(\d+)"/g)) used.add("span-" + match[1]);
  ["span-3", "span-4", "span-5", "span-6", "span-7", "span-8", "span-12"].forEach((token) => {
    assert.ok(css.includes("." + token), "styles.css 缺少栅格类 ." + token);
  });
  const missing = [...used].filter((token) => !css.includes("." + token)).sort();
  eqJson(missing, [], "以下 class 在 app.js 中使用但没有样式定义");
  assert.ok(used.size > 30, "样式检查覆盖的 class 太少：" + used.size);
});

test("app.js 的数据动作与视图 id 都被处理", async () => {
  const source = fs.readFileSync(appPath, "utf8");
  const app = loadApp();
  const actions = new Set();
  for (const match of source.matchAll(/data-action="([a-z-]+)"/g)) actions.add(match[1]);
  assert.ok(actions.size >= 5, "应有多个交互动作：" + [...actions].join(", "));
  actions.forEach((action) => {
    assert.ok(new RegExp('action === "' + action + '"').test(source), "handleClick 未处理动作：" + action);
  });
  const viewIds = new Set();
  for (const match of source.matchAll(/data-view="([a-z-]+)"/g)) viewIds.add(match[1]);
  const known = app.VIEWS.map((view) => view.id);
  viewIds.forEach((id) => assert.ok(known.includes(id), "未知视图 id：" + id));
  assert.ok(known.includes("overview") && known.includes("tasks") && known.includes("projects") && known.includes("knowledge") && known.includes("inbox"));
});

test("渲染层交给宿主的每个动作，插件都真的处理（动作表覆盖）", async () => {
  const appSource = fs.readFileSync(appPath, "utf8");
  const mainSource = fs.readFileSync(path.join(PLUGIN_DIR, "main.js"), "utf8");
  /* 插件侧：webPerform 的动作表 + 早退分支 */
  const start = mainSource.indexOf("async webPerform(action, target, extra) {");
  const end = mainSource.indexOf("/** 打开（或复用）Web 渲染层视图 */", start);
  assert.ok(start > 0 && end > start, "应能找到 webPerform");
  const region = mainSource.slice(start, end);
  const handled = new Set();
  for (const match of region.matchAll(/"([a-z][a-z0-9-]*)":/g)) handled.add(match[1]);
  for (const match of region.matchAll(/(?:action|key) === "([a-z-]+)"/g)) handled.add(match[1]);
  assert.ok(handled.size >= 15, "动作表应有足够多的动作，实际：" + handled.size);

  /* 渲染层侧：所有 perform("x", …) —— 这些会真的走到宿主 */
  const forwarded = new Set();
  for (const match of appSource.matchAll(/perform\("([a-z][a-z0-9-]*)"/g)) forwarded.add(match[1]);
  /* 多数动作是通过 actionButton(action, …) / perform(action, …) 变量形式发出的，字面量只是"显式转发"的那部分 */
  assert.ok(forwarded.size >= 4, "渲染层应有若干动作显式交给宿主，实际：" + forwarded.size);
  const unhandled = [...forwarded].filter((action) => !handled.has(action));
  assert.equal(unhandled.length, 0, "这些动作渲染层会发、插件却不处理：" + unhandled.join(", "));

  /* 盲区补上：用 actionButton("x", …) 造出来的按钮**不是**字面量 data-action，
     只扫 HTML 字符串会漏掉它们 —— 之前 undo-archive-project 就这么"点了没反应"。
     这类动作必须同时在 handleClick 里有 action === "x" 分支（分发链路没有兜底转发）。 */
  const built = new Set();
  for (const match of appSource.matchAll(/actionButton\("([a-z][a-z0-9-]*)"/g)) built.add(match[1]);
  assert.ok(built.size >= 6, "应有多处 actionButton，实际：" + built.size);
  const notDispatched = [...built].filter((action) => !new RegExp('action === "' + action + '"').test(appSource));
  assert.equal(notDispatched.length, 0, "这些按钮渲染出来了但 handleClick 不转发（点了没反应）：" + notDispatched.join(", "));
});
test("头图与导航卡素材链路：manifest → 导出的数据 → 页面引用", async () => {
  const manifestPath = path.join(WEB_DIR, "assets", "manifest.json");
  assert.ok(fs.existsSync(manifestPath), "应存在 assets/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  ["hero", "cardBuild", "cardLearn", "cardGrow"].forEach((key) => {
    const asset = manifest[key];
    assert.ok(asset, "manifest 缺少 " + key);
    assert.ok(fs.existsSync(path.join(WEB_DIR, asset.file)), asset.file + " 不存在");
    assert.equal(typeof asset.luminance, "number", key + " 应记录实测平均亮度");
    assert.ok(asset.tone === "light" || asset.tone === "dark", key + " 的 tone 必须是 light/dark");
    assert.match(asset.suggestedInk, /^#[0-9a-fA-F]{6}$/, key + " 应有建议文字色");
  });

  const payloads = [vaultData(), readData("data.sample.js")];
  payloads.forEach((payload, index) => {
    const label = index === 0 ? "导出数据" : "data.sample.js";
    assert.ok(payload.assets, label + " 应带 assets 字段");
    ["hero", "cardBuild", "cardLearn", "cardGrow"].forEach((key) => {
      assert.ok(payload.assets[key], label + " 缺少 assets." + key);
      assert.equal(payload.assets[key].file, manifest[key].file);
    });
  });
});

test("夜航极光主题：墨紫 5 级抬升 + 珊瑚/紫藤/薄荷 + 玻璃拟态", async () => {
  const css = fs.readFileSync(path.join(WEB_DIR, "styles.css"), "utf8");
  // 令牌与插件 styles.css 的「夜航极光（v0.3.0）」段逐条一致：5 级底色 + 4 级文字 + 5 个语义色
  ["#0a0814", "#110e1f", "#171331", "#201a3d", "#2a2350"].forEach((hex, index) => {
    assert.ok(new RegExp("--pp-bg-" + index + ":\\s*" + hex).test(css), "styles.css 缺少第 " + index + " 级底色 " + hex);
  });
  ["--pp-ink-1", "--pp-ink-2", "--pp-ink-3", "--pp-ink-4",
    "--pp-line-1", "--pp-line-2", "--pp-line-3",
    "--pp-coral", "--pp-coral-hi", "--pp-coral-soft",
    "--pp-mint", "--pp-mint-soft", "--pp-lilac", "--pp-lilac-soft",
    "--pp-amber", "--pp-amber-soft", "--pp-rose", "--pp-rose-soft",
    "--pp-glass", "--pp-lift-1", "--pp-lift-2", "--pp-glow",
    "--pp-grad-cta", "--pp-grad-active", "--pp-grad-fill", "--pp-halo",
    "--pp-r-sm", "--pp-r-md", "--pp-r-lg", "--pp-r-xl", "--pp-r-pill"].forEach((token) => {
    assert.ok(css.includes(token + ":"), "styles.css 缺少设计令牌 " + token);
  });
  assert.ok(/--pp-coral:\s*#ff8fa3/.test(css), "主色应为落日珊瑚 #ff8fa3");
  assert.ok(/--pp-lilac:\s*#a78bfa/.test(css), "信息色应为紫藤 #a78bfa");
  assert.ok(/--pp-mint:\s*#5fe3c0/.test(css), "结构色应为极光青 #5fe3c0");
  assert.ok(/--pp-amber:\s*#ffc46b/.test(css), "告警色应为琥珀 #ffc46b");
  assert.ok(/--pp-rose:\s*#ff5f7a/.test(css), "危险色应为玫瑰 #ff5f7a");
  assert.ok(/--pp-grad-cta:\s*linear-gradient\(/.test(css), "主操作渐变应为珊瑚色系");
  assert.ok(/--pp-lift-1:\s*0 1px 0/.test(css), "玻璃面板应有一线内高光 + 柔和投影");
  // 与极简主义基线共用的旧令牌名仍然存在：既有规则靠它们继承新配色
  ["--pp-canvas", "--pp-ink", "--pp-body", "--pp-muted", "--pp-hairline", "--pp-serif", "--pp-sans",
    "--pp-xs", "--pp-sm", "--pp-md", "--pp-lg", "--pp-xl"].forEach((token) => {
    assert.ok(css.includes(token + ":"), "styles.css 缺少设计令牌 " + token);
  });
  // 旧的「深夜书房」取值必须彻底消失（#ffc46b 保留，但语义已变成告警琥珀）
  ["#120e17", "#ff7fa8", "#7de3c4", "#ff6b7d"].forEach((hex) => {
    assert.ok(!css.includes(hex), "styles.css 仍残留深夜书房颜色 " + hex);
  });
  assert.ok((css.match(/backdrop-filter/g) || []).length >= 3, "应有多处玻璃拟态面板");
  assert.ok((css.match(/border-radius:\s*(?:999px|var\(--pp-r-pill\))/g) || []).length >= 3, "导航与按钮应使用胶囊圆角");
  assert.ok((css.match(/linear-gradient\(/g) || []).length >= 5, "应有渐变（遮罩 / 主操作 / 进度）");
  assert.ok(css.includes(".hero"), "应定义头图横幅样式");
  assert.ok(css.includes(".waypoint"), "应定义图像导航卡样式");
  assert.ok(css.includes('[data-tone="light"]'), "遮罩应按实测亮度分档");
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"), "应尊重 prefers-reduced-motion");
  assert.ok(css.includes("@media (max-width: 640px)"), "缺少 640px 断点");
  assert.ok(css.includes("@media (max-width: 1024px)"), "缺少 1024px 断点");
  assert.ok(css.includes("1140px"), "最大内容宽应为 1140px");
});

test("web 工具链复用插件的素材纯函数并把 assets 写进数据", async () => {
  const helpers = fs.readFileSync(path.join(WEB_DIR, "tools", "plugin-helpers.mjs"), "utf8");
  ["isImageAssetPath", "resolveAssetPath"].forEach((name) => {
    assert.ok(helpers.includes(name), "plugin-helpers 应重新导出 " + name);
  });
  ["export-data.mjs", "build-sample.mjs"].forEach((file) => {
    const source = fs.readFileSync(path.join(WEB_DIR, "tools", file), "utf8");
    assert.ok(source.includes("loadAssets"), file + " 应读取 assets/manifest.json");
    assert.ok(source.includes("assets: loadAssets()"), file + " 应把 assets 写进 payload");
  });
});

test("导出脚本可运行，并对夹具 vault 复现「导出结果 == 目录里实际有什么」", async () => {
  const script = path.join(WEB_DIR, "tools", "export-data.mjs");
  assert.ok(fs.existsSync(script));
  assert.ok(fs.existsSync(FIXTURE_VAULT), "仓库应自带 tests/fixtures/vault 夹具");
  const result = spawnSync(process.execPath, [script, "--stdout", "--vault", FIXTURE_VAULT], {
    cwd: WEB_DIR,
    encoding: "utf8",
  });
  assert.ok(!result.error, "无法启动子进程运行导出脚本（" + (result.error && result.error.code) + "）：这条检查不能静默跳过");
  assert.equal(result.status, 0, "导出失败：" + (result.stderr || "").slice(0, 400));
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.stats.capacityMinutes, 120);
  /* 断言"导出结果 == 夹具里实际有什么"，而不是写死数字：
     夹具是仓库的一部分，所以这条用例在任何机器上（含 CI）都能跑出同样的结论。 */
  const mdFiles = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.name.startsWith(".")) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) mdFiles.push(full);
    });
  };
  assert.ok(Array.isArray(summary.folders) && summary.folders.length, "导出摘要应回显它扫描的目录");
  summary.folders.filter(Boolean).forEach((folder) => walk(path.join(FIXTURE_VAULT, folder)));
  const contents = mdFiles.map((file) => fs.readFileSync(file, "utf8"));
  assert.equal(
    summary.projects,
    contents.filter((text) => /^type:\s*project\s*$/m.test(text)).length,
    "项目数应与夹具里 type: project 的笔记数一致",
  );
  /* 知识缺口（type: knowledge-gap）在插件里就是任务的一种：它会出现在任务列表、算进项目完成度。
     所以这里必须按同样口径统计，否则用户一建知识缺口这条用例就红 —— 那种红没有意义。 */
  assert.equal(
    summary.tasks,
    contents.filter((text) => /^type:\s*(?:task|knowledge-gap)\s*$/m.test(text)).length,
    "任务数应与夹具里 type: task / knowledge-gap 的笔记数一致",
  );
  assert.ok(summary.projects >= 1, "夹具至少要有一个项目才算跑通");
});

test("在 DOM 桩中真实启动并渲染全部视图", async () => {
  const { app, html } = bootApp();
  assert.equal(app.state.view, "overview");
  assert.equal(app.state.source, "vault", "默认应展示真实数据");

  app.setSource("sample");
  assert.equal(app.state.source, "sample");
  const overview = html("view");
  assert.ok(overview.includes('class="hero'), "页首应是头图横幅");
  assert.ok(overview.includes("assets/hero.jpg"), "横幅应使用生成好的缩略图");
  assert.ok(overview.includes("把今天的行动，放回长期方向里。"), "横幅应有展示标题");
  assert.ok(overview.includes("PERSONAL OPERATING SYSTEM"), "横幅应有眉标");
  assert.ok(overview.includes("background-image:url"), "横幅与导航卡应使用素材背景");
  assert.ok(overview.includes('class="waypoint'), "概览应渲染图像导航卡");
  ["assets/card-build.jpg", "assets/card-learn.jpg", "assets/card-grow.jpg"].forEach((file) => {
    assert.ok(overview.includes(file), "导航卡应使用 " + file);
  });
  assert.ok(overview.includes("任务执行") && overview.includes("知识沉淀") && overview.includes("项目推演"), "导航卡应有标题");
  assert.ok(overview.includes('class="kpi'), "概览应渲染 KPI");
    assert.ok(/class="kpi kpi-link"[^>]*data-view="(projects|tasks|inbox)"/.test(overview), "KPI 卡应带目标页签（点了能跳）");
  assert.ok(overview.includes('class="timeline"'), "概览应渲染时间规划");
  assert.ok(overview.includes("项目推演") && overview.includes("知识缺口"));
  assert.ok(html("tabs").includes('aria-current="page"'));
  assert.ok(html("footer").includes("演示数据集"));

  app.switchView("tasks");
  const tasks = html("view");
  assert.ok(tasks.includes('id="q"'), "任务页应有搜索框");
  assert.ok(tasks.includes('class="task-set"'), "任务页应按任务集分组");
  assert.ok(tasks.includes('class="task-group"'), "任务页应按任务组分组");
  assert.ok(tasks.includes('class="task-row"'));
  assert.ok(tasks.includes('data-action="detail-task"'));
  assert.ok(tasks.includes('data-action="open-note"'));

  app.state.filters.query = "训练";
  app.render();
  assert.ok(html("view").includes("本周三次力量训练"), "筛选后应保留匹配任务");

  app.state.filters.query = "不存在的任务";
  app.render();
  assert.ok(html("view").includes("没有符合筛选的任务"));

  app.state.filters.query = "";
  app.switchView("projects");
  const projects = html("view");
  assert.ok(projects.includes('class="project-card"'));
  assert.ok(projects.includes('class="progress-line"'), "项目卡应显示 1px 细线完成度");
  assert.ok(projects.includes("阻塞"), "有阻塞项的项目应显示阻塞");

  app.switchView("knowledge");
  const knowledge = html("view");
  assert.ok(knowledge.includes("知识笔记") && knowledge.includes("图书") && knowledge.includes("长期领域"));
  assert.ok(knowledge.includes('class="area-card"'));

  app.switchView("inbox");
  assert.ok(html("view").includes("待分诊"));
  assert.equal(app.state.view, "inbox");
});

test("详情抽屉可以渲染任务与项目", async () => {
  const { app, html } = bootApp();
  app.setSource("sample");
  const data = app.state.data;
  const task = data.tasks.find((item) => item.projectPath);
  const taskHtml = app.drawerTask(data, task);
  assert.ok(taskHtml.includes(task.title));
  assert.ok(taskHtml.includes("笔记路径"));
  assert.ok(taskHtml.includes(task.path));
  assert.ok(taskHtml.includes("关键节点"));

  const project = data.projects[0];
  const projectHtml = app.drawerProject(data, project);
  assert.ok(projectHtml.includes(project.title));
  assert.ok(projectHtml.includes("最终结果（终点画像）"));
  assert.ok(projectHtml.includes("验收标准"));
  assert.ok(projectHtml.includes("关键节点"));
  assert.equal(projectHtml.includes("阻塞项"), false, "阻塞项不再是独立卡片：它是任务的状态");
  assert.ok(projectHtml.includes(project.path));

  /* 阻塞 = 该项目下有 status: blocked 的任务；红点数字与节点标红都由它推导 */
  const blockedTask = { path: "50 日程待办/被阻塞的任务.md", title: "被阻塞的任务", status: "blocked", projectPath: project.path, milestone: (project.milestones || [])[0] || "未分组", checklist: { done: 0, total: 0 } };
  const withBlocked = Object.assign({}, data, { tasks: (data.tasks || []).concat([blockedTask]) });
  const blockedHtml = app.drawerProject(withBlocked, project);
  assert.ok(blockedHtml.includes('data-tone="blocked"'), "抽屉里应出现阻塞计数标签");
  assert.equal(blockedHtml.includes('class="blockers"'), false, "不该再有独立阻塞项容器");
  app.setData(withBlocked);
  app.switchView("projects");
  const projectsHtml = html("view");
  assert.ok(projectsHtml.includes("blocked-badge"), "项目卡片右上角应有阻塞红点");
  assert.ok(/blocked-badge[^>]*>1</.test(projectsHtml), "红点数字应是阻塞任务数");
});

test("真实数据下每个视图都能渲染（遍历 app.VIEWS，含数据页签）", async () => {
  const { app, html } = bootApp();
  app.setSource("vault");
  const ids = app.VIEWS.map((view) => view.id);
  assert.ok(ids.includes("data"), "VIEWS 应包含数据页签，实际：" + ids.join(", "));
  const markers = { overview: 'class="hero', tasks: 'class="filters"', projects: 'class="panel', knowledge: 'class="panel', inbox: 'class="panel', data: 'id="qd"' };
  ids.forEach((id) => {
    app.switchView(id);
    const rendered = html("view");
    assert.ok(rendered.length > 50, id + " 视图应渲染出内容");
    assert.ok(rendered.includes(markers[id]), id + " 视图应渲染特征节点（" + markers[id] + "）");
  });
});

test("空数据与脏数据都不抛错，也不把 undefined / NaN 渲染到界面", async () => {
  const { app, dom } = bootApp();
  const base = {
    live: true, vaultName: "测试库", today: "2026-09-27", generatedAt: "2026-09-27 10:00",
    settings: { dailyCapacityMinutes: 120, planningHorizonDays: 7, folders: {} },
    stats: { activeProjects: 0, projects: 0, tasks: 0, activeTasks: 0, overdue: 0, upcoming: 0, inbox: 0, gaps: 0, knowledge: 0, people: 0, areas: 0, capacityMinutes: 120 },
    projects: [], tasks: [], inbox: [], notes: [], gaps: [], areas: [],
    timePlan: { days: [], unscheduled: [] }, resources: {}, hierarchy: [], history: [], assets: {}
  };
  // 脏数据：和真实可能出现的「字段缺失 / 类型不对 / 非法日期」一致
  const messy = JSON.parse(JSON.stringify(base));
  messy.stats = { activeProjects: 1, projects: 1, tasks: 1, overdue: 1, inbox: 1, gaps: 1, capacityMinutes: 120 };
  messy.projects = [{ path: "20 项目库/甲/甲.md", name: "甲", title: "", status: "active", progress: 5, done: 0, total: 3, taskPaths: ["不存在.md"], milestones: null, blockers: null, deadline: "不是日期", daysLeft: null, checklist: [] }];
  messy.tasks = [{ path: "50 日程待办/脏任务.md", name: "脏任务", title: "超长标题".repeat(30), status: "todo", taskStatus: "todo", priority: "未知优先级", due: "2026-13-45", duration: null, projectPath: "不存在.md", knowledgeRefs: null, blockers: null }];
  messy.inbox = [{ path: "00 草稿箱/脏.md", name: "脏", title: "", stage: "", mtime: null, words: null }];
  messy.notes = [{ path: "00 草稿箱/脏.md", name: "脏", kind: "note", type: null, stage: null, title: null, mtime: null, words: null, archived: false }];
  messy.gaps = [{ path: "50 日程待办/缺口.md", title: "缺口", tags: null }];
  messy.assets = { hero: { file: null, url: null }, cardBuild: null };

  const BAD = ["undefined", "NaN", "[object Object]"];
  [["空数据", base], ["脏数据", messy]].forEach(([name, payload]) => {
    app.setData(payload);
    app.VIEWS.forEach((view) => {
      app.switchView(view.id);
      const rendered = dom.getElementById("view").innerHTML || "";
      assert.ok(rendered.length > 20, name + " / " + view.id + " 应渲染出内容");
      BAD.forEach((token) => {
        const at = rendered.indexOf(token);
        assert.equal(at, -1, name + " / " + view.id + " 不应把 " + token + " 渲染到界面：" + rendered.slice(Math.max(0, at - 60), at + 30));
      });
    });
  });

  // 示例数据（独立页可以切过去）必须带整库索引，否则数据页签在示例模式下永远是空
  const sample = readData("data.sample.js");
  assert.ok(Array.isArray(sample.notes) && sample.notes.length > 0, "示例数据必须包含 notes 整库索引");
  app.setData(sample);
  app.switchView("data");
  assert.ok((dom.getElementById("view").innerHTML || "").includes("整库索引：" + sample.notes.length), "示例数据的数据页签应列出整库条数");
});

module.exports = { title: "07 Web 仪表盘", tests };
