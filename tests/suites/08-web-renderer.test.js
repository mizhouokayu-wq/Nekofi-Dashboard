"use strict";
/**
 * Web 渲染层（路线 B）：把 web/ 的只读仪表盘挂进 Obsidian 的那一层。
 *
 * 覆盖四件事：
 *   1. buildWebPayload()：插件内嵌视图与 web/tools/export-data.mjs 共用的数据推导；
 *   2. Shadow DOM 适配：只改选择器不改声明、宿主桥接、插件 styles.css 不被污染；
 *   3. 挂载契约：ppWebAppFactory + mount/unmount 的渲染、事件委托与解绑；
 *   4. 漂移守护：main.js 末尾的生成区块必须与 web/app.js + web/styles.css 逐字节一致。
 *
 * 注意：buildWebPayload / ppWebAppFactory 在 vm 沙箱里执行，返回对象来自另一个 realm，
 * 因此字段比较一律走 eqJson（JSON 比较），不用 assert.deepEqual 去比原型。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, tests, setup, eqJson } = require("../util");
const { VIEW, fm, paths, exists, fill, submit, choose } = require("../drive");

const PLUGIN_DIR = path.resolve(__dirname, "..", "..");
/** 仓库根就是插件目录：浏览器版渲染层就在 web/ 下 */
const WEB_DIR = path.join(PLUGIN_DIR, "web");

const FACTORY_LINE = "function ppWebAppFactory(window, document, navigator, localStorage, module, exports) {";
const FACTORY_END = "\n;return module.exports; }";
const BLOCK_START = "/* ===== PP_WEB_RENDERER_START";
const BLOCK_END = "/* ===== PP_WEB_RENDERER_END ===== */";

function readText(file) { return fs.readFileSync(file, "utf8"); }
function normalize(text) { return String(text).replace(/\r\n/g, "\n"); }

/** 与 harness 夹具同构的一组笔记：项目 + 项目任务 + 孤立任务 + 草稿 + 知识 + 长期领域 */
const NOTES = [
  { path: "00 草稿箱/灵感随手记.md", name: "灵感随手记", frontmatter: { type: "note", stage: "inbox", title: "灵感随手记" }, body: "临时想法\n" },
  { path: "20 项目库/仪表盘搭建/仪表盘搭建.md", name: "仪表盘搭建", frontmatter: { type: "project", title: "仪表盘搭建", status: "active", deadline: "2026-10-31", milestones: ["未分组", "完成 MVP"] }, body: "## 项目推演\n\n- [x] 立项\n- [ ] 排期\n" },
  { path: "20 项目库/仪表盘搭建/完成首页文案.md", name: "完成首页文案", frontmatter: { type: "task", title: "完成首页文案", status: "todo", project: "20 项目库/仪表盘搭建/仪表盘搭建.md", milestone: "完成 MVP", due: "2026-09-30", duration: 45, priority: "high", task_set: "本周维护", task_group: "资料整理" }, body: "## 任务拆解\n\n- [ ] 写标题\n" },
  { path: "50 日程待办/整理收件箱.md", name: "整理收件箱", frontmatter: { type: "task", title: "整理收件箱", status: "planning", task_set: "本周维护", task_group: "执行", knowledge_refs: ["[[方法]]"] }, body: "" },
  { path: "30 知识库/方法.md", name: "方法", frontmatter: { type: "knowledge", title: "方法" }, body: "方法正文\n" },
  { path: "10 长期领域/健康.md", name: "健康", frontmatter: { type: "area", title: "健康" }, body: "" }
];

/* ------------------------------ 1. 数据推导 ------------------------------ */

test("buildWebPayload：统计、项目进度、任务层级与资源归类", async () => {
  const h = await setup({ seed: false, data: {} });
  const payload = h.helpers.buildWebPayload(NOTES, h.plugin.settings, { vaultName: "测试库", live: true });

  assert.equal(payload.vaultName, "测试库");
  assert.equal(payload.live, true);
  assert.equal(payload.settings.dailyCapacityMinutes, 120);
  assert.equal(payload.stats.projects, 1);
  assert.equal(payload.stats.tasks, 2);
  assert.equal(payload.stats.activeTasks, 2);
  assert.equal(payload.stats.inbox, 1);
  assert.equal(payload.stats.upcoming, 1, "9-30 的任务应在 7 天视野内");
  assert.equal(payload.stats.knowledge, 1);
  assert.equal(payload.stats.areas, 1);

  const project = payload.projects[0];
  assert.equal(project.title, "仪表盘搭建");
  assert.equal(project.total, 1, "只有一条任务归属该项目");
  assert.equal(project.done, 0);
  assert.equal(project.progress, 0);
  eqJson(project.milestones, ["未分组", "完成 MVP"]);
  eqJson([project.checklist.done, project.checklist.open, project.checklist.total], [1, 1, 2], "任务拆解计数");
  eqJson(project.checklist.items.map((item) => item.text), ["立项", "排期"], "任务拆解要带出条目本身（详情页要逐条编辑）");
  eqJson(project.blockers, []);
  assert.ok(project.summary.includes("立项"), "摘要应保留正文要点、去掉清单标记");

  const linked = payload.tasks.find((task) => task.title === "完成首页文案");
  assert.equal(linked.projectPath, "20 项目库/仪表盘搭建/仪表盘搭建.md");
  assert.equal(linked.projectTitle, "仪表盘搭建");
  assert.equal(linked.taskSet, "本周维护");
  assert.equal(linked.daysLeft, 5);
  assert.equal(linked.duration, 45);
  assert.equal(linked.priority, "high");
  eqJson([linked.checklist.done, linked.checklist.open, linked.checklist.total], [0, 1, 1], "拆解计数");
  eqJson(linked.checklist.items.map((item) => item.text), ["写标题"], "条目文本");

  const orphan = payload.tasks.find((task) => task.title === "整理收件箱");
  assert.equal(orphan.projectPath, "");
  assert.equal(orphan.taskGroup, "执行");
  eqJson(orphan.knowledgeRefs, ["方法"]);

  eqJson(payload.hierarchy.map((set) => set.name), ["本周维护"]);
  eqJson(payload.hierarchy[0].groups.map((group) => group.name), ["资料整理", "执行"]);
  assert.equal(payload.timePlan.days.length, h.plugin.settings.planningHorizonDays);
  eqJson(payload.resources.knowledge.map((item) => item.title), ["方法"]);
  assert.equal(payload.inbox[0].stage, "inbox");
});

test("buildWebPayload：live 标记与历史透传，缺省时不影响非 live 文案", async () => {
  const h = await setup({ seed: false, data: {} });
  const plain = h.helpers.buildWebPayload(NOTES, h.plugin.settings, {});
  assert.equal(plain.live, false, "未显式声明时应是非 live（浏览器版语义）");
  eqJson(plain.history, []);
  eqJson(plain.assets, {});

  const withHistory = h.helpers.buildWebPayload(NOTES, h.plugin.settings, { history: [{ at: "x" }], assets: { hero: { file: "a.jpg" } } });
  assert.equal(withHistory.history.length, 1);
  assert.equal(withHistory.assets.hero.file, "a.jpg");
});

test("buildNoteIndex：整库索引的字段与归档判定", async () => {
  const h = await setup({ seed: false, data: {} });
  const payload = h.helpers.buildWebPayload(NOTES, h.plugin.settings, {
    noteIndex: [
      { path: "20 项目库/仪表盘搭建/仪表盘搭建.md", name: "仪表盘搭建", frontmatter: { type: "project", title: "仪表盘搭建", status: "active" } },
      { path: "20 项目库/仪表盘搭建/完成首页文案.md", name: "完成首页文案", frontmatter: { type: "task", title: "完成首页文案", status: "todo", due: "2026-09-30" } },
      { path: "90 归档库/孤立任务/2026-09-01 旧任务.md", name: "2026-09-01 旧任务", frontmatter: { type: "task", title: "旧任务", status: "archived" } },
      { path: "30 知识库/方法.md", name: "方法", frontmatter: { type: "knowledge", title: "方法" } },
      { path: "（AI禁止阅读）秘密.md", name: "秘密", frontmatter: { type: "task" } },
      { path: ".dashboard-backup/草稿箱.2026-09-22T05-46-10-603Z.md", name: "草稿箱快照", frontmatter: { title: "草稿箱快照" } },
      { path: ".obsidian/plugins/personal-planning-dashboard/README.md", name: "README", frontmatter: { title: "README" } }
    ]
  });
  const notes = payload.notes;
  assert.equal(notes.length, 4, "禁阅路径与隐藏目录必须被排除");
  assert.ok(notes.every((note) => !note.path.split("/").some((segment) => segment.startsWith("."))), "隐藏目录（.obsidian / .dashboard-backup 等）必须被排除");
  const project = notes.find((note) => note.kind === "project");
  const task = notes.find((note) => note.title === "完成首页文案");
  const archived = notes.find((note) => note.title === "旧任务");
  const knowledge = notes.find((note) => note.type === "knowledge");
  assert.equal(project.folder, "20 项目库");
  assert.equal(task.kind, "task");
  assert.equal(task.status, "todo");
  assert.equal(archived.archived, true, "位于归档库或 status=archived 都应标记为已归档");
  assert.equal(knowledge.kind, "note");
  assert.equal(knowledge.statusLabel, "—");
  assert.ok(notes.every((note) => typeof note.path === "string" && typeof note.title === "string"));
});

/* --------------------------- 2. Shadow DOM 适配 --------------------------- */

test("shadowScopedCss：只改选择器不改声明，并追加宿主桥接", async () => {
  const h = await setup({ seed: false, data: {} });
  const input = [
    ":root { --pp-ink: #000; }",
    "html, body { margin: 0; }",
    "body { min-height: 100vh; color: var(--pp-ink); }",
    ".theme-dark { --pp-ink: #fff; }",
    ".theme-light { --pp-ink: #111; }",
    ".theme-light .topbar { background: #fff; }",
    ".drawer-body { padding: 0; }",
    "@media (max-width: 640px) {",
    "  body { font-size: 14px; }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .kpi { transition: none; }",
    "}"
  ].join("\n");
  const out = h.helpers.shadowScopedCss(input);

  assert.ok(out.includes(":host { --pp-ink: #000; }"), ":root 应改成 :host");
  assert.ok(out.includes(":host { margin: 0; }"), "html, body 应合并成 :host");
  assert.ok(out.includes(":host { min-height: 100vh; color: var(--pp-ink); }"), "body 应改成 :host 且声明不变");
  assert.ok(out.includes(":host(.theme-dark) { --pp-ink: #fff; }"), ".theme-dark 应改成 :host(.theme-dark)");
  assert.ok(out.includes(":host(.theme-light) { --pp-ink: #111; }"), ".theme-light 应改成 :host(.theme-light)");
  assert.ok(out.includes(":host(.theme-light) .topbar { background: #fff; }"), "带后代的 .theme-light 也要改成 :host(...)");
  assert.ok(out.includes(".drawer-body { padding: 0; }"), "类名里含 body 的规则不能被误伤");
  assert.ok(!out.includes("  body { font-size: 14px; }"), "媒体查询内的 body 也要改");
  assert.ok(out.includes(":host { font-size: 14px; }"), "媒体查询内的 body 应改成 :host");
  assert.ok(out.includes(":host { display: block; height: 100%"), "应追加宿主桥接样式");
  assert.ok(out.includes("container-type: inline-size"), "宿主应声明容器类型");
  assert.ok(out.includes("@container (max-width: 640px)"), "宽度断点应改为容器查询");
  assert.ok(!out.includes("@media (max-width: 640px)"), "不应残留基于窗口宽度的断点");
  assert.ok(out.includes("@media (prefers-reduced-motion: reduce)"), "非宽度断点应保持 @media");
});

test("shadowScopedCss 对真实 web/styles.css 不再残留 :root / body / .theme-dark / .theme-light", async () => {
  const h = await setup({ seed: false, data: {} });
  const raw = readText(path.join(WEB_DIR, "styles.css"));
  const scoped = h.helpers.shadowScopedCss(raw);

  assert.ok(!/(^|\n)[ \t]*:root[ \t]*\{/.test(scoped), "不应残留 :root 选择器（Shadow DOM 里 :root 选不到任何节点）");
  assert.ok(!/(^|\n)[ \t]*html,[ \t]*body[ \t]*\{/.test(scoped), "不应残留 html, body 选择器");
  assert.ok(!/(^|\n)[ \t]*body[ \t]*\{/.test(scoped), "不应残留 body 选择器");
  assert.ok(!/(^|\n)[ \t]*\.theme-dark[ \t]*\{/.test(scoped), "不应残留 .theme-dark 选择器");
  assert.ok(!/(^|\n)[ \t]*\.theme-light[ \t]*\{/.test(scoped), "不应残留 .theme-light 选择器（否则浅色主题接不上宿主）");
  assert.ok(!/(^|\n)[ \t]*\.theme-light [^{]*\{/.test(scoped), "带后代的 .theme-light 也要改：shadow 里的选择器匹配不到宿主");
  assert.ok(/(^|\n)[ \t]*:host[ \t]*\{/.test(scoped), "两组令牌块都应落在 :host 上");
  assert.ok(scoped.includes(":host(.theme-dark)"), "深色令牌块应改为 :host(.theme-dark)");
  assert.ok(scoped.includes(":host(.theme-light)"), "浅色令牌块应改为 :host(.theme-light)");
  assert.ok(scoped.includes(":host(.theme-light) .topbar"), "浅色主题的顶栏覆盖应接上宿主");
  assert.ok(scoped.length > raw.length, "应追加了宿主桥接样式");
  assert.ok(!/@media\s*\([^)]*(?:max|min)-width/.test(scoped), "真实样式表里的宽度断点也必须转为容器查询");
  assert.ok(scoped.includes("@container (max-width: 640px)") && scoped.includes("@container (max-width: 1024px)"));
});

test("Web 渲染层样式与插件样式隔离：web 的页面类不进插件 styles.css", async () => {
  const pluginCss = readText(path.join(PLUGIN_DIR, "styles.css"));
  const webCss = readText(path.join(WEB_DIR, "styles.css"));
  const h = await setup({ seed: false, data: {} });

  // 两版共用同一套语义化令牌名（设计系统同源），但页面类必须各自成套
  assert.ok(pluginCss.includes(".pp-web-host {"), "插件只应新增宿主容器规则");
  [".waypoint {", ".kpi {", ".topbar {", ".hero {"].forEach((selector) => {
    assert.ok(webCss.includes(selector), "web/styles.css 应包含 " + selector);
    assert.ok(!pluginCss.includes(selector), "插件 styles.css 不应被 web 页面类污染：" + selector);
  });
  assert.ok(h.helpers.PP_WEB_CSS.includes(".waypoint {"), "Web 设计系统应内嵌在 main.js 生成区块里");
  assert.ok(h.helpers.PP_WEB_CSS.includes("--pp-bg-0:"), "Web 设计令牌应随生成区块内嵌");
});

test("WEB_SHELL_HTML 覆盖渲染层需要的全部骨架 id", async () => {
  const h = await setup({ seed: false, data: {} });
  const shell = h.helpers.WEB_SHELL_HTML;
  ["pp-app", "tabs", "view", "footer", "date-chip", "source-toggle", "drawer", "scrim"].forEach((id) => {
    assert.ok(shell.includes('id="' + id + '"'), "骨架缺少 id=" + id);
  });
  assert.ok(shell.includes('class="topbar"') && shell.includes('class="brand"'), "骨架应与 web/index.html 同构");
});

test("写入成功后读屏会收到播报：刷新路径把新数据推给渲染层", async () => {
  const h = await setup();
  const app = await openRenderedApp(h);
  const live = app.shell.getElementById("live");
  assert.ok(live, "渲染层应有 #live 播报区");

  /* 切到任务页签并清空播报区：这里只想看"写入之后"那一次 */
  const tab = app.shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks");
  await tab.dispatch("click");
  await h.settle();
  live.textContent = "";

  /* 从列表进抽屉，再点界面上的状态按钮 —— 和用户点击完全同一条路径 */
  const detail = app.shell.querySelectorAll('[data-action="detail-task"]')[0];
  assert.ok(detail, "任务页签应能进入详情");
  const targetPath = detail.getAttribute("data-path");
  await detail.dispatch("click");
  await h.settle();

  const button = (app.shell.getElementById("drawer").querySelectorAll('[data-action="set-task-status"]') || [])
    .find((el) => el.getAttribute("data-path") === targetPath && el.getAttribute("data-status") !== "planning");
  assert.ok(button, "抽屉里应有改状态的按钮");
  const wanted = button.getAttribute("data-status");
  await button.dispatch("click");
  await h.settle();

  const file = h.vault.getFiles().find((item) => item.path === targetPath);
  assert.equal(String(h.plugin.fm(file).status), wanted, "点击应写回 frontmatter");
  assert.ok(String(live.textContent || "").includes("数据已更新"),
    "写入成功后的刷新应播报给读屏，实际：" + JSON.stringify(live.textContent));
});

test("读屏可达：骨架有 aria-live 播报区，切页签会播报，字段控件有可访问名", async () => {
  const h = await setup();
  const shell = h.helpers.WEB_SHELL_HTML;
  /* 视图切换、刷新数据、筛选都是"没有焦点变化的原地更新"，读屏需要 aria-live 才会播报 */
  assert.ok(/id="live"[^>]*aria-live="polite"/.test(shell), "骨架应包含 aria-live 播报区（id=live）");
  assert.ok(/role="status"/.test(shell), "播报区应是 role=status");

  const app = await openRenderedApp(h);
  const live = app.shell.getElementById("live");
  assert.ok(live, "真实渲染出来的骨架里应有 #live");

  /* 行为断言：点另一个页签后，播报区应写下"已切换到…"（而不是只把 aria 属性写在 HTML 上） */
  const tab = app.shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks");
  assert.ok(tab, "应有切到任务页签的入口");
  await tab.dispatch("click");
  await h.settle();
  assert.ok(String(live.textContent || "").includes("已切换"), "切页签后播报区应有文案，实际：" + JSON.stringify(live.textContent));

  /* 抽屉里的字段控件：可访问名走 aria-label；如果将来加了 for，就必须有对应 id */
  const detail = app.shell.querySelectorAll('[data-action="detail-task"]')[0];
  if (detail) {
    await detail.dispatch("click");
    await h.settle();
    const drawer = app.shell.getElementById("drawer");
    const control = drawer.querySelectorAll("[data-field]")[0];
    assert.ok(control, "抽屉里应有字段控件");
    assert.ok(control.getAttribute("aria-label"), "字段控件应有 aria-label 作为可访问名");
    const html = drawer.innerHTML || "";
    for (const match of html.matchAll(/<label[^>]*class="field-label"[^>]*for="([^"]+)"/g)) {
      assert.ok(html.includes('id="' + match[1] + '"'), "label for=" + match[1] + " 没有对应的控件 id");
    }
  }
});

/* ----------------------------- 3. 挂载契约 ----------------------------- */

test("浅色主题：令牌、画布底色与写死的深色底都被覆盖", async () => {
  const h = await setup({ seed: false, data: {} });
  const scoped = h.helpers.shadowScopedCss(readText(path.join(WEB_DIR, "styles.css")));
  const start = scoped.indexOf(":host(.theme-light) {");
  assert.ok(start >= 0, "浅色令牌块应存在");
  const block = scoped.slice(start, scoped.indexOf("}", start));
  assert.ok(block.includes("--pp-bg-0: #f2f2f4"), "浅色应重映射底色令牌");
  /* 只换令牌不够：Aurora 的 body 底色（插件里就是 :host）是写死的墨紫渐变，
     不一起覆盖的话整个画布仍是深色，看起来像「只有顶栏变浅了」。 */
  assert.ok(block.includes("background: var(--pp-halo), linear-gradient(180deg, #fbfbfc"), "画布底色也要换");
  assert.ok(block.includes("--pp-ink-1: #14111d"), "文字要换成深墨");
  assert.ok(scoped.includes(":host(.theme-light) .topbar"), "顶栏写死的深色底要覆盖");
  assert.ok(scoped.includes(":host(.theme-light) .drawer"), "抽屉写死的深色底要覆盖");
  assert.ok(scoped.includes(":host(.theme-light) .scrim"), "遮罩要覆盖");
});

/** 打开 Web 视图并取回真正渲染出来的 shadow 外壳（桩现在会解析 innerHTML，所以这里能拿到真实 DOM） */
async function openRenderedApp(h) {
  const leaf = h.workspace.getLeaf();
  await leaf.setViewState({ type: VIEW.app });
  await h.settle();
  const hosts = h.findByClass(leaf.view.contentEl, "pp-web-host");
  if (!hosts.length) throw new Error("没有建立 shadow 宿主：" + h.textOf(leaf.view.contentEl).slice(0, 120));
  /* host = 承载主题类与 shadow 的元素；shell = 内含骨架节点的那层（getElementById 要从这里找） */
  return { leaf, host: hosts[0], shell: hosts[0].children[1] };
}

test("素材 tone：按图片亮度判定（阈值与离线 manifest 一致），解码失败回落 dark", async () => {
  const h = await setup({ seed: false });
  assert.equal(h.helpers.toneFromLuminance(0.6932), "light", "亮度 0.69 应判为 light（离线 manifest 里横幅就是 light）");
  assert.equal(h.helpers.toneFromLuminance(0.626), "light");
  assert.equal(h.helpers.toneFromLuminance(0.62), "dark", "阈值是「大于 0.62」，与 build_assets.py 一致");
  assert.equal(h.helpers.toneFromLuminance(0.1265), "dark");
  assert.equal(h.helpers.toneFromLuminance(undefined), "dark", "拿不到亮度时回落 dark（重遮罩 + 白字永远可读）");

  /* 测试桩没有 createImageBitmap → 走回落分支，但文字色必须与 tone 配套 */
  h.seedFile("图片素材/a.png", "");
  h.plugin.settings.heroImage = "图片素材/a.png";
  h.plugin.webApiCache = null;
  const payload = await h.plugin.collectWebPayload();
  assert.equal(payload.assets.hero.tone, "dark", "无法解码时回落 dark");
  assert.equal(payload.assets.hero.suggestedInk, "#fdf7f4", "深色档要配近白文字色");
});

test("项目归属：同名项目 / 路径引用 / 前缀路径 / 目录归属的判定语义", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/甲/仪表盘搭建/仪表盘搭建.md", "---\ntype: project\ntitle: 仪表盘搭建\nstatus: active\nmilestones: [未分组, 第一版]\nprogress: 40\n---\n- [ ] 推演\n");
  h.seedFile("20 项目库/乙/仪表盘搭建/仪表盘搭建.md", "---\ntype: project\ntitle: 仪表盘搭建\nstatus: planning\n---\n");
  h.seedFile("20 项目库/甲/仪表盘搭建/任务-路径引用.md", "---\ntype: task\ntitle: 任务-路径引用\nstatus: todo\nproject: 20 项目库/甲/仪表盘搭建/仪表盘搭建.md\n---\n");
  h.seedFile("20 项目库/甲/仪表盘搭建/任务-带前缀路径.md", "---\ntype: task\ntitle: 任务-带前缀路径\nstatus: doing\nproject: 别的目录/仪表盘搭建/仪表盘搭建.md\n---\n");
  h.seedFile("20 项目库/甲/仪表盘搭建/任务-目录归属.md", "---\ntype: task\ntitle: 任务-目录归属\nstatus: todo\n---\n");
  h.seedFile("50 日程待办/同名项目任务.md", "---\ntype: task\ntitle: 同名项目任务\nstatus: todo\nproject: 仪表盘搭建\n---\n");

  const payload = await h.plugin.collectWebPayload();
  const byPath = new Map(payload.projects.map((project) => [project.path, project]));
  const jia = byPath.get("20 项目库/甲/仪表盘搭建/仪表盘搭建.md");
  const yi = byPath.get("20 项目库/乙/仪表盘搭建/仪表盘搭建.md");
  assert.ok(jia && yi, "两个同名项目都应存在");

  /* 同名项目：两个项目都"拥有"这三条任务（判定逐项目进行） */
  assert.equal(jia.total, 3, "甲应拥有 3 条任务，实际：" + jia.total);
  assert.equal(yi.total, 3, "乙也应拥有 3 条任务，实际：" + yi.total);
  /* 任务的所属项目按「引用越具体越优先」定序（见 core/paths.pickProject），
     绝不依赖 vault 枚举顺序 —— 同名项目时"谁在前"在不同机器/不同 Obsidian 版本上并不一致。 */
  const owner = new Map(payload.tasks.map((task) => [task.path, task.projectPath]));
  assert.equal(owner.get("20 项目库/甲/仪表盘搭建/任务-路径引用.md"), jia.path, "整路径引用归到甲（最具体）");
  assert.equal(owner.get("20 项目库/甲/仪表盘搭建/任务-带前缀路径.md"), jia.path, "同名时优先任务所在目录对应的项目（甲）");
  assert.equal(owner.get("50 日程待办/同名项目任务.md"), yi.path, "只写项目名时按路径码点序取最小者（乙），跨机器一致");
  /* 只有目录归属、没写 project 的任务不归任何项目（历史语义，改判定要同步改这里） */
  assert.equal(owner.get("20 项目库/甲/仪表盘搭建/任务-目录归属.md"), "", "仅有目录归属不算项目任务");
  assert.equal(jia.progress, 40, "显式 progress 优先");
  assert.equal(yi.progress, 0, "没有任务完成时推导为 0");
  assert.equal(jia.taskPaths.length, 2, "taskPaths 只列归属到自己的任务");
  assert.equal(yi.taskPaths.length, 1, "仅按名字命中的那条归到乙");
});

test("同名项目归属与 vault 枚举顺序无关（换顺序必须给出同一个答案）", async () => {
  const build = async (reverse) => {
    const h = await setup({ seed: false });
    const first = "20 项目库/甲/仪表盘搭建/仪表盘搭建.md";
    const second = "20 项目库/乙/仪表盘搭建/仪表盘搭建.md";
    const project = (path) => "---\ntype: project\ntitle: 仪表盘搭建\nstatus: active\n---\n";
    [first, second].sort().forEach((path) => h.seedFile(path, project(path)));
    if (reverse) {
      /* 先删后建，改变桩里的插入顺序 */
      h.vault.files.delete(first);
      h.vault.files.delete(second);
      h.seedFile(second, project(second));
      h.seedFile(first, project(first));
    }
    h.seedFile("50 日程待办/同名项目任务.md", "---\ntype: task\ntitle: 同名项目任务\nstatus: todo\nproject: 仪表盘搭建\n---\n");
    h.seedFile("20 项目库/甲/仪表盘搭建/任务-路径引用.md", "---\ntype: task\ntitle: 任务-路径引用\nstatus: todo\nproject: " + first + "\n---\n");
    const payload = await h.plugin.collectWebPayload();
    const owner = new Map(payload.tasks.map((task) => [task.path, task.projectPath]));
    return {
      nameOnly: owner.get("50 日程待办/同名项目任务.md"),
      explicit: owner.get("20 项目库/甲/仪表盘搭建/任务-路径引用.md"),
    };
  };
  const forward = await build(false);
  const backward = await build(true);
  assert.equal(forward.nameOnly, backward.nameOnly, "只写名字时两种枚举顺序必须给出同一个项目");
  assert.equal(forward.explicit, backward.explicit, "整路径引用同样与顺序无关");
  assert.equal(forward.explicit, "20 项目库/甲/仪表盘搭建/仪表盘搭建.md", "整路径引用始终归到被引用的那个项目");
});

test("两条路径的项目归属一致：原生 collectData 与 Web 载荷同口径", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/甲/仪表盘搭建/仪表盘搭建.md", "---\ntype: project\ntitle: 仪表盘搭建\nstatus: active\n---\n");
  h.seedFile("20 项目库/乙/仪表盘搭建/仪表盘搭建.md", "---\ntype: project\ntitle: 仪表盘搭建\nstatus: planning\n---\n");
  h.seedFile("20 项目库/甲/仪表盘搭建/任务-路径引用.md", "---\ntype: task\ntitle: 任务-路径引用\nstatus: todo\nproject: 20 项目库/甲/仪表盘搭建/仪表盘搭建.md\n---\n");
  h.seedFile("20 项目库/甲/仪表盘搭建/任务-带前缀路径.md", "---\ntype: task\ntitle: 任务-带前缀路径\nstatus: done\nproject: 别的目录/仪表盘搭建/仪表盘搭建.md\n---\n");
  h.seedFile("50 日程待办/同名项目任务.md", "---\ntype: task\ntitle: 同名项目任务\nstatus: todo\nproject: 仪表盘搭建\n---\n");

  const payload = await h.plugin.collectWebPayload();
  const data = await h.plugin.collectData();
  const webTotals = new Map(payload.projects.map((project) => [project.path, [project.total, project.done, project.progress]]));
  const nativeTotals = new Map(data.projects.map((project) => [project.file.path, [project.total, project.done, project.progress]]));
  assert.equal(webTotals.size, nativeTotals.size, "两条路径的项目数应一致");
  nativeTotals.forEach((value, path) => {
    eqJson(webTotals.get(path), value, "项目 " + path + " 的 total/done/progress 两条路径应一致");
  });
  /* 任务口径：payload.tasks 与 collectData().tasks 都排除已归档 */
  assert.equal(data.tasks.length, payload.tasks.length, "非归档任务数应一致：" + data.tasks.length + " vs " + payload.tasks.length);
});

test("采集复用笔记缓存：第二次不读盘，改一篇只失效那一篇", async () => {
  const h = await setup();
  h.seedFile("50 日程待办/缓存测试任务.md", "---\ntype: task\ntitle: 缓存测试任务\nstatus: todo\n---\n- [ ] 一步\n");
  h.seedFile("30 知识库/缓存测试知识.md", "---\ntype: knowledge\ntitle: 缓存测试知识\n---\n");
  let reads = 0;
  const originalRead = h.plugin.app.vault.cachedRead.bind(h.plugin.app.vault);
  h.plugin.app.vault.cachedRead = async (file) => { reads += 1; return originalRead(file); };

  await h.plugin.collectWebPayload();
  const first = reads;
  assert.ok(first > 0, "首次采集应读盘，实际：" + first);

  await h.plugin.collectWebPayload();
  assert.equal(reads, first, "内容没变时第二次采集不应再读盘（缓存命中），多读了 " + (reads - first) + " 篇");

  /* 改任务笔记：只应重读它 */
  const task = h.vault.getFiles().find((file) => file.path === "50 日程待办/缓存测试任务.md");
  h.vault.__writeRaw(task.path, (h.vault.__readRaw(task.path) || "") + "\n补充一行\n");
  task.stat.mtime = Date.now() + 1000;
  h.vault.emit("modify", task);
  await h.plugin.collectWebPayload();
  assert.equal(reads, first + 1, "只应重读被改的那一篇，实际多读 " + (reads - first) + " 篇");

  /* 改知识笔记：正文根本没人看，一次都不该读 */
  const knowledge = h.vault.getFiles().find((file) => file.path === "30 知识库/缓存测试知识.md");
  h.vault.__writeRaw(knowledge.path, (h.vault.__readRaw(knowledge.path) || "") + "\n补充一行\n");
  knowledge.stat.mtime = Date.now() + 1000;
  h.vault.emit("modify", knowledge);
  await h.plugin.collectWebPayload();
  assert.equal(reads, first + 1, "知识笔记不需要正文，改动不应触发读盘，实际多读 " + (reads - first - 1) + " 篇");
});

test("详情页直改字段：写 frontmatter、空值删字段、未知字段拒绝", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const project = data.projects[0];
  const task = data.allTasks[0];

  await h.plugin.webPerform("set-field", task.file.path, JSON.stringify({ key: "priority", value: "high" }));
  assert.equal(h.plugin.fm(task.file).priority, "high", "优先级应写回 frontmatter");
  await h.plugin.webPerform("set-field", task.file.path, JSON.stringify({ key: "duration", value: "45" }));
  assert.equal(h.plugin.fm(task.file).duration, 45, "数字字段应写成数字而不是字符串");

  await h.plugin.webPerform("set-field", project.file.path, JSON.stringify({ key: "outcome", value: "上线后每天有人用" }));
  assert.equal(h.plugin.fm(project.file).outcome, "上线后每天有人用", "项目最终结果应可直改");

  /* 空值 = 删掉字段，而不是留一个空字符串 */
  await h.plugin.webPerform("set-field", task.file.path, JSON.stringify({ key: "priority", value: "" }));
  assert.equal(h.plugin.fm(task.file).priority, undefined, "清空应删除该字段");

  /* 白名单外与标题一律拒绝（标题是笔记身份，改名要走重命名流程） */
  const before = h.vault.__readRaw(task.file.path);
  await h.plugin.webPerform("set-field", task.file.path, JSON.stringify({ key: "title", value: "改名试试" }));
  await h.plugin.webPerform("set-field", task.file.path, JSON.stringify({ key: "随便写的", value: "x" }));
  assert.equal(h.vault.__readRaw(task.file.path), before, "白名单外的字段不能被写入");
});

test("任务拆解直改：勾选 / 新增 / 删除 / 改名，且不动 frontmatter 一个字节", async () => {
  const h = await setup();
  h.seedFile("50 日程待办/拆解任务.md", "---\ntype: task\ntitle: 拆解任务\nstatus: todo\n---\n\n## 任务拆解\n\n- [ ] 第一步\n- [x] 已完成的一步\n");
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.file.path === "50 日程待办/拆解任务.md");
  assert.ok(task, "应能找到刚播下的任务");
  const frontmatterPart = () => {
    const raw = h.vault.__readRaw(task.file.path);
    return raw.slice(0, raw.indexOf("---", 3) + 3);
  };
  const before = frontmatterPart();
  const items = () => (h.helpers.webChecklistOf(h.vault.__readRaw(task.file.path)).items || []);
  assert.equal(items().length, 2, "前置：正文里有两步");

  await h.plugin.webPerform("checklist-op", task.file.path, JSON.stringify({ op: "toggle", index: 0 }));
  assert.equal(items()[0].done, true, "勾选应写回正文");

  await h.plugin.webPerform("checklist-op", task.file.path, JSON.stringify({ op: "add", text: "补一步" }));
  assert.ok(items().some((item) => item.text === "补一步"), "新增的步骤应出现在正文里");

  const index = items().findIndex((item) => item.text === "补一步");
  await h.plugin.webPerform("checklist-op", task.file.path, JSON.stringify({ op: "rename", index: index, text: "改过的一步" }));
  assert.ok(items().some((item) => item.text === "改过的一步"), "改名应落到正文");

  const removeIndex = items().findIndex((item) => item.text === "改过的一步");
  await h.plugin.webPerform("checklist-op", task.file.path, JSON.stringify({ op: "remove", index: removeIndex }));
  assert.equal(items().some((item) => item.text === "改过的一步"), false, "删除应移除该行");

  assert.equal(frontmatterPart(), before, "编辑任务拆解不能碰 frontmatter");
});

test("抽屉把字段渲染成可编辑控件，标题仍是纯文本", async () => {
  const h = await setup();
  const { shell } = await openRenderedApp(h);
  const payload = await h.plugin.collectWebPayload();
  const task = payload.tasks[0];
  const taskButton = shell.querySelectorAll('[data-action="detail-task"]').find((el) => el.getAttribute("data-path") === task.path);
  assert.ok(taskButton, "概览上应有进入任务详情的入口");
  await taskButton.dispatch("click");
  await h.settle();
  const taskHtml = shell.getElementById("drawer").innerHTML;
  assert.ok(taskHtml.includes('data-field="due"'), "DDL 应是可编辑控件");
  assert.ok(taskHtml.includes('data-field="milestone"'), "关键节点应是可编辑控件");
  assert.ok(taskHtml.includes('data-action="set-task-status"'), "状态仍是四选一");
  assert.ok(taskHtml.includes("<h2>" + task.title + "</h2>"), "标题仍是纯文本");
  assert.equal(/<h2>[^<]*<input/.test(taskHtml), false, "标题不能被包成输入框");

  await shell.getElementById("scrim").dispatch("click");
  await h.settle();
  const project = payload.projects[0];
  const projectButton = shell.querySelectorAll('[data-action="detail-project"]').find((el) => el.getAttribute("data-path") === project.path);
  await projectButton.dispatch("click");
  await h.settle();
  const projectHtml = shell.getElementById("drawer").innerHTML;
  assert.ok(projectHtml.includes('data-field="outcome"'), "最终结果应可直改");
  assert.ok(projectHtml.includes('data-field="acceptance"'), "验收标准应可直改");
  assert.ok(projectHtml.includes('data-field="area"'), "长期领域应可直改");
  assert.ok(projectHtml.includes("孤立任务"), "项目详情应把无节点任务放进孤立任务");
});

/** 播种一个双节点项目：两个关键节点各挂一条任务，另有一条不归节点的任务 */
function seedTwoNodeProject(h) {
  h.seedFile("20 项目库/双节点/双节点.md", "---\ntype: project\ntitle: 双节点\nstatus: active\nmilestones:\n  - 第一版\n  - 第二版\n---\n");
  h.seedFile("20 项目库/双节点/任务A.md", "---\ntype: task\ntitle: 任务A\nstatus: todo\nproject: 20 项目库/双节点/双节点.md\nmilestone: 第一版\n---\n\n## 任务拆解\n\n- [ ] A1\n- [ ] A2\n");
  h.seedFile("20 项目库/双节点/任务B.md", "---\ntype: task\ntitle: 任务B\nstatus: blocked\nproject: 20 项目库/双节点/双节点.md\nmilestone: 第二版\nblocking_reason: 等设计稿\n---\n");
  h.seedFile("20 项目库/双节点/孤立任务.md", "---\ntype: task\ntitle: 孤立任务\nstatus: todo\nproject: 20 项目库/双节点/双节点.md\n---\n");
}

test("项目详情：关键节点页签、孤立任务、方向键切换、阻塞标红", async () => {
  const h = await setup({ seed: false });
  seedTwoNodeProject(h);
  const { shell } = await openRenderedApp(h);
  const payload = await h.plugin.collectWebPayload();
  const project = payload.projects.find((item) => item.path === "20 项目库/双节点/双节点.md");
  assert.ok(project, "应识别出双节点项目");

  const openButton = shell.querySelectorAll('[data-action="detail-project"]').find((el) => el.getAttribute("data-path") === project.path);
  await openButton.dispatch("click");
  await h.settle();
  let drawer = shell.getElementById("drawer");

  const tabs = drawer.querySelectorAll(".milestone-tab");
  eqJson(tabs.map((tab) => tab.textContent), ["第一版1", "第二版1"], "两个节点各成一个页签并带任务数");
  assert.ok(String(tabs[1].className).includes("is-blocked"), "含阻塞任务的节点页签应标红");
  assert.ok(drawer.textContent.includes("任务A"), "默认显示第一个节点的任务");
  assert.equal(drawer.textContent.includes("任务B"), false, "不该同时显示另一个节点的任务");
  const sections = drawer.querySelectorAll(".drawer-section");
  const orphan = sections.find((section) => section.textContent.startsWith("孤立任务"));
  assert.ok(orphan, "应有孤立任务卡片");
  assert.ok(orphan.textContent.includes("孤立任务"), "孤立任务卡片里应有那条没归节点的任务");
  assert.equal(orphan.textContent.includes("任务A"), false, "归了节点的任务不该出现在孤立任务里");

  /* 方向键切换页签（ARIA tablist 的键盘契约） */
  tabs[0].focus();
  shell.dispatch("keydown", { key: "ArrowRight", target: tabs[0] });
  await h.settle();
  drawer = shell.getElementById("drawer");
  const activeTab = drawer.querySelectorAll(".milestone-tab").find((tab) => String(tab.className).includes("is-active"));
  assert.equal(activeTab.textContent, "第二版1", "ArrowRight 应切到下一个节点");
  assert.ok(drawer.textContent.includes("任务B"), "切过去的节点应显示自己的任务");
});

test("抽屉重绘保住滚动位置与正在编辑的字段", async () => {
  const h = await setup({ seed: false });
  seedTwoNodeProject(h);
  const { shell } = await openRenderedApp(h);
  const payload = await h.plugin.collectWebPayload();
  const task = payload.tasks.find((item) => item.path === "20 项目库/双节点/任务A.md");
  /* 概览只列焦点任务，先切到任务页签再找入口 */
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks").dispatch("click");
  await h.settle();
  const button = shell.querySelectorAll('[data-action="detail-task"]').find((el) => el.getAttribute("data-path") === task.path);
  assert.ok(button, "应能从列表进入这条任务");
  await button.dispatch("click");
  await h.settle();

  const drawer = shell.getElementById("drawer");
  drawer.scrollTop = 420;
  const field = drawer.querySelectorAll('[data-field="assignee"]')[0];
  assert.ok(field, "抽屉里应有执行者控件");
  field.focus();
  field.value = "小明";
  await field.dispatch("change");
  await h.settle();

  const updated = h.vault.getFiles().find((file) => file.path === "20 项目库/双节点/任务A.md");
  assert.equal(h.plugin.fm(updated).assignee, "小明", "change 应把值写回笔记");
  assert.equal(drawer.scrollTop, 420, "重绘后应保持滚动位置，不能跳回顶部");
  assert.equal(shell.activeElement && shell.activeElement.getAttribute && shell.activeElement.getAttribute("data-field"), "assignee", "焦点应回到同一个字段");
});

test("阻塞原因：阻塞时才出现，可写回 frontmatter", async () => {
  const h = await setup({ seed: false });
  seedTwoNodeProject(h);
  const { shell } = await openRenderedApp(h);
  const payload = await h.plugin.collectWebPayload();
  const task = payload.tasks.find((item) => item.path === "20 项目库/双节点/任务A.md");

  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks").dispatch("click");
  await h.settle();
  const button = shell.querySelectorAll('[data-action="detail-task"]').find((el) => el.getAttribute("data-path") === task.path);
  await button.dispatch("click");
  await h.settle();
  let html = shell.getElementById("drawer").innerHTML;
  assert.equal(html.includes("阻塞原因"), false, "未阻塞的任务不该出现阻塞原因段");

  await h.plugin.webPerform("set-task-status", task.path, "blocked");
  await h.settle();
  html = shell.getElementById("drawer").innerHTML;
  assert.ok(html.includes("阻塞原因"), "标成阻塞后应出现阻塞原因");
  assert.ok(html.includes('data-field="blocking_reason"'), "阻塞原因应可编辑");

  await h.plugin.webPerform("set-field", task.path, JSON.stringify({ key: "blocking_reason", value: "等接口联调" }));
  const file = h.vault.getFiles().find((item) => item.path === task.path);
  assert.equal(h.plugin.fm(file).blocking_reason, "等接口联调", "原因应写回 frontmatter");

  /* 项目卡右上角红点的 title 里应带上任务与原因 */
  const fresh = await h.plugin.collectWebPayload();
  const blockedTask = fresh.tasks.find((item) => item.path === task.path);
  assert.equal(blockedTask.status, "blocked", "刷新后仍应是阻塞状态（不被过期推导覆盖）");
});

test("字段规格与本地兜底合并：旧版导出数据不会让新字段消失", async () => {
  const h = await setup();
  const payload = await h.plugin.collectWebPayload();
  /* 模拟"离线页面用的是旧版 data.js"：fieldSpec 里没有后来新增的 blocking_reason */
  const trimmed = JSON.parse(JSON.stringify(payload));
  trimmed.fieldSpec.task = trimmed.fieldSpec.task.filter((spec) => spec.key !== "blocking_reason");
  const task = trimmed.tasks[0];
  assert.ok(task, "需要一条任务");
  task.status = "blocked";

  const nodes = new Map();
  const makeNode = () => ({ hidden: false, innerHTML: "", textContent: "", children: [], style: {}, classList: { add() {}, remove() {}, contains: () => false }, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, appendChild() {}, focus() {} });
  const doc = { readyState: "complete", getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); }, createElement: () => makeNode(), addEventListener() {}, querySelector: () => null, body: { appendChild() {}, removeChild() {} } };
  const api = h.helpers.ppWebAppFactory({ document: doc, setTimeout, clearTimeout }, doc, { userAgent: "node" }, { getItem: () => null, setItem() {} }, { exports: {} }, {});
  api.mount({ data: trimmed, host: { root: nodes.get("shell") || makeNode(), listeners: { addEventListener() {} }, activeElement: () => null, getHash: () => "", setHash() {}, onHashChange() {}, offHashChange() {}, openNote() {}, copyText() {}, perform() {}, storage: { getItem: () => null, setItem() {} }, sources: () => ({ vault: null, sample: null }) } });
  const html = api.drawerTask(trimmed, task);
  assert.ok(html.includes('data-field="blocking_reason"'), "即便数据里没有这个字段规格，本地兜底也要把它补上");
  assert.ok(html.includes('data-field="due"'), "数据里已有的字段仍按数据走");
});

test("任务拆解编辑保持换行符风格：CRLF 笔记不会被改成 LF", async () => {
  const h = await setup({ seed: false });
  const crlf = "---\r\ntype: task\r\ntitle: CRLF任务\r\nstatus: todo\r\n---\r\n\r\n## 任务拆解\r\n\r\n- [ ] 一步\r\n- [ ] 两步\r\n";
  h.seedFile("50 日程待办/CRLF任务.md", crlf);
  const path = "50 日程待办/CRLF任务.md";
  assert.equal(h.vault.__readRaw(path), crlf, "前置：正文确实是 CRLF");

  await h.plugin.webPerform("checklist-op", path, JSON.stringify({ op: "toggle", index: 0 }));
  const raw = h.vault.__readRaw(path);
  assert.ok(raw.includes("- [x] 一步"), "勾选应落到正文");
  assert.equal((raw.match(/(^|[^\r])\n/g) || []).length, 0, "不允许出现裸 LF（整篇会被 diff 成全改）");
  assert.ok(raw.startsWith("---\r\ntype: task\r\n"), "frontmatter 的 CRLF 也要原样保留");

  /* 纯 LF 笔记反过来也不能被改成 CRLF */
  const lf = "---\ntype: task\ntitle: LF任务\nstatus: todo\n---\n\n- [ ] 一步\n";
  h.seedFile("50 日程待办/LF任务.md", lf);
  await h.plugin.webPerform("checklist-op", "50 日程待办/LF任务.md", JSON.stringify({ op: "add", text: "新步骤" }));
  const lfRaw = h.vault.__readRaw("50 日程待办/LF任务.md");
  assert.equal(lfRaw.includes("\r"), false, "纯 LF 笔记不该出现 CR");
  assert.ok(lfRaw.includes("- [ ] 新步骤"), "新增步骤应落到正文");
});

test("日常顺滑度：项目卡节点可点、任务行可快速改状态、空项目有引导", async () => {
  const h = await setup({ seed: false });
  seedTwoNodeProject(h);
  h.seedFile("20 项目库/空项目/空项目.md", "---\ntype: project\ntitle: 空项目\nstatus: active\n---\n");
  const { shell } = await openRenderedApp(h);
  const payload = await h.plugin.collectWebPayload();

  /* ① 项目卡上的节点 chip 可以直接点开详情，并停在那个节点 */
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "projects").dispatch("click");
  await h.settle();
  const nodeChip = shell.querySelectorAll('[data-action="open-node"]').find((el) => el.getAttribute("data-name") === "第二版");
  assert.ok(nodeChip, "项目卡上每个节点都应有一个可点的 chip");
  await nodeChip.dispatch("click");
  await h.settle();
  const drawer = shell.getElementById("drawer");
  const activeTab = drawer.querySelectorAll(".milestone-tab").find((tab) => String(tab.className).includes("is-active"));
  assert.equal(activeTab.textContent, "第二版1", "点节点 chip 应打开详情并定位到该节点");
  assert.ok(drawer.textContent.includes("任务B"), "该节点的任务应显示出来");

  /* ② 任务行：节点下是紧凑列表（一条任务一行），就地「完成」；
        会移动文件的「完成并归档」不再挤在列表里，只在任务详情中出现 */
  const line = drawer.querySelectorAll(".task-line").find((item) => item.textContent.includes("任务B"));
  assert.ok(line, "节点下的任务应以紧凑列表行展示");
  assert.equal(line.querySelectorAll(".task-row").length, 0, "节点列表里不应再出现旧卡片结构");
  /* 省空间的关键：列表行里不许再堆标签（窄抽屉里 9 个标签会把一行撑到 350px+） */
  assert.equal(line.querySelectorAll(".chip").length, 0, "紧凑列表行里不应有 chip 标签");
  assert.equal(line.querySelectorAll(".task-line-title").length, 1, "每行只有一个可点的标题");
  assert.equal(line.textContent.includes("完成并归档"), false, "紧凑列表里不放会移动文件的操作");
  const taskBPath = "20 项目库/双节点/任务B.md";
  const doneButton = line.querySelectorAll('[data-action="set-task-status"]').find((button) => button.getAttribute("data-name") === "done");
  assert.ok(doneButton, "未完成的任务行应有「完成」");
  await doneButton.dispatch("click");
  await h.settle();
  assert.equal(h.plugin.fm(h.vault.getFiles().find((file) => file.path === taskBPath)).status, "done", "标记完成应写回 done");
  assert.ok(h.vault.getFiles().some((file) => file.path === taskBPath), "标记完成不该移动文件（移动是「完成并归档」）");

  /* 完成后同一行应改成「重开」 */
  const rowAfter = shell.getElementById("drawer").querySelectorAll(".task-line").find((item) => item.textContent.includes("任务B"));
  const reopen = rowAfter.querySelectorAll('[data-action="set-task-status"]').find((button) => button.getAttribute("data-name") === "todo");
  assert.ok(reopen, "完成后应出现「重开」");
  await reopen.dispatch("click");
  await h.settle();
  assert.equal(h.plugin.fm(h.vault.getFiles().find((file) => file.path === taskBPath)).status, "todo", "重开应写回 todo");
  assert.ok(h.vault.getFiles().some((file) => file.path === taskBPath), "重开同样不该移动文件");

  /* ②b 打开这条任务的详情：会移动文件的操作必须写清楚是归档 */
  const lineTitle = shell.getElementById("drawer").querySelectorAll(".task-line-title").find((el) => el.getAttribute("data-path") === taskBPath);
  assert.ok(lineTitle, "列表行标题应能点开详情");
  await lineTitle.dispatch("click");
  await h.settle();
  const archiveButton = shell.getElementById("drawer").querySelectorAll('[data-action="archive-task"]')[0];
  assert.ok(archiveButton, "任务详情里应保留归档操作");
  assert.ok(String(archiveButton.textContent).includes("归档"), "会移动文件的按钮必须写清楚是归档，实际：" + archiveButton.textContent);

  /* ③ 没有关键节点的项目要给出下一步引导 */
  await shell.getElementById("scrim").dispatch("click");
  await h.settle();
  const empty = payload.projects.find((item) => item.path === "20 项目库/空项目/空项目.md");
  assert.ok(empty, "空项目应被识别");
  const emptyCard = shell.querySelectorAll('[data-action="detail-project"]').find((el) => el.getAttribute("data-path") === empty.path);
  await emptyCard.dispatch("click");
  await h.settle();
  const emptyDrawer = shell.getElementById("drawer");
  assert.ok(emptyDrawer.textContent.includes("还没有关键节点"), "空项目应说明为什么空");
  assert.ok(emptyDrawer.querySelectorAll('[data-action="project-milestone"]').length >= 1, "空项目应就地给出「新建关键节点」");
  assert.ok(emptyDrawer.querySelectorAll('[data-action="new-task"]').length >= 1, "空项目应就地给出「新建任务」");
});

test("今日焦点：分桶计数 + 接下来三条可就地标记完成", async () => {
  const h = await setup({ seed: false });
  /* 日期相对"插件认为的今天"来造：写死日期会让用例跟着真实日期漂 */
  const first = await h.plugin.collectWebPayload();
  const shift = (days) => {
    const date = new Date(String(first.today) + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  h.seedFile("50 日程待办/逾期一天.md", "---\ntype: task\ntitle: 逾期一天\nstatus: todo\ndue: " + shift(-1) + "\n---\n");
  h.seedFile("50 日程待办/今天到期.md", "---\ntype: task\ntitle: 今天到期\nstatus: todo\ndue: " + shift(0) + "\n---\n");
  h.seedFile("50 日程待办/三天后.md", "---\ntype: task\ntitle: 三天后\nstatus: todo\ndue: " + shift(3) + "\n---\n");
  const { shell } = await openRenderedApp(h);
  const view = shell.getElementById("view");
  const text = view.textContent;
  assert.ok(text.includes("逾期 1"), "应显示逾期计数，实际：" + text.slice(0, 160));
  assert.ok(text.includes("今天 1"), "应显示今天到期计数");
  assert.ok(text.includes("未来 7 天 1"), "应显示未来 7 天计数");

  const items = view.querySelectorAll(".focus-item");
  assert.equal(items.length, 3, "接下来应列出三条（逾期优先）");
  assert.ok(items[0].textContent.includes("逾期一天"), "逾期最久的排在最前");

  /* 就地完成：不用先点进详情 */
  const doneButton = items[0].querySelectorAll('[data-action="set-task-status"]')[0];
  assert.ok(doneButton, "焦点条上的任务应能就地标记完成");
  await doneButton.dispatch("click");
  await h.settle();
  const overdueFile = h.vault.getFiles().find((file) => file.path === "50 日程待办/逾期一天.md");
  assert.equal(h.plugin.fm(overdueFile).status, "done", "就地标记完成应写回 frontmatter");
  assert.ok(h.vault.getFiles().some((file) => file.path === "50 日程待办/逾期一天.md"), "只改状态、不移动文件");
  assert.ok(shell.getElementById("view").textContent.includes("逾期 0"), "完成后计数应刷新");
});

test("草稿箱：页面内多选 + 就地导入为任务集（不开原生弹窗）", async () => {
  const h = await setup({ seed: false });
  h.seedFile("00 草稿箱/想法一.md", "---\r\ntype: note\r\ntitle: 想法一\r\n---\r\n\r\n# 想法一\r\n");
  h.seedFile("00 草稿箱/想法二.md", "---\ntype: note\ntitle: 想法二\n---\n\n# 想法二\n");
  /* 已有任务覆盖过的任务集 / 任务组：入口的 datalist 候选就该来自它们 */
  h.seedFile("50 日程待办/已有任务.md", "---\ntype: task\ntitle: 已有任务\nstatus: todo\ntask_set: 本周维护\ntask_group: 资料整理\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "inbox").dispatch("click");
  await h.settle();

  const view = shell.getElementById("view");
  const checks = view.querySelectorAll('[data-action="select-draft"]');
  assert.equal(checks.length, 2, "每条草稿都应有勾选框");
  assert.ok(view.querySelectorAll('[data-action="import-drafts"]')[0], "应有「导入为任务集」按钮");

  /* 任务集 / 任务组输入框要挂 datalist：既有任务集可下拉，也能写真新的 */
  ["taskSet", "taskGroup"].forEach((name) => {
    const input = view.querySelectorAll('[data-draft-field="' + name + '"]')[0];
    const listId = input.getAttribute("list");
    assert.ok(listId, name + " 应挂 datalist");
    const list = view.querySelectorAll("datalist").find((node) => node.getAttribute("id") === listId);
    assert.ok(list, name + " 应渲染对应的 datalist 元素");
  });
  const setList = view.querySelectorAll("datalist").find((node) => node.getAttribute("id") === view.querySelectorAll('[data-draft-field="taskSet"]')[0].getAttribute("list"));
  eqJson(setList.querySelectorAll("option").map((option) => option.value), ["本周维护"], "任务集候选应来自已有任务");

  /* 勾选一条 → 按钮数字跟着变；全选 → 覆盖两条 */
  /* 真实浏览器里点勾选框：先改 checked 再派发 click（键盘空格同理） */
  checks[0].checked = true;
  await checks[0].dispatch("click");
  await h.settle();
  assert.ok(shell.getElementById("view").textContent.includes("导入为任务集（1）"), "勾选后按钮应显示条数");
  await shell.getElementById("view").querySelectorAll('[data-action="select-all-drafts"]')[0].dispatch("click");
  await h.settle();
  assert.ok(shell.getElementById("view").textContent.includes("导入为任务集（2）"), "全选后应变成两条");

  /* 就地导入：两条都落到日程待办，任务集/组按输入框写入（不弹任何原生模态） */
  const modalsBefore = h.modals ? h.modals.length : 0;
  await shell.getElementById("view").querySelectorAll('[data-action="import-drafts"]')[0].dispatch("click");
  await h.settle();
  assert.equal(h.modals ? h.modals.length : 0, modalsBefore, "Web 端导入不应再弹原生表单");
  const moved = h.vault.getFiles().map((file) => file.path).filter((path) => path.startsWith("50 日程待办/想法"));
  eqJson(moved.sort(), ["50 日程待办/想法一.md", "50 日程待办/想法二.md"], "两条都应导入");
  assert.equal(h.plugin.fm(h.vault.getFiles().find((file) => file.path === "50 日程待办/想法一.md")).task_set, "本周维护");
  /* CRLF 草稿的换行风格也要保住 */
  assert.equal((h.vault.__readRaw("50 日程待办/想法一.md").match(/(^|[^\r])\n/g) || []).length, 0, "CRLF 草稿导入后仍是 CRLF");
});

test("资源页签：每个面板都能就地新建对应类型的笔记", async () => {
  const h = await setup({ seed: false });
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "knowledge").dispatch("click");
  await h.settle();
  const view = shell.getElementById("view");
  const kinds = view.querySelectorAll('[data-action="new-resource"]').map((el) => el.getAttribute("data-kind"));
  eqJson(kinds, ["knowledge", "book", "person", "area"], "知识 / 图书 / 人物 / 领域都应有新建入口");
  assert.ok(view.textContent.includes("新建知识笔记") || view.textContent.includes("新建知识"), "按钮文案要写清楚建什么");

  /* 点一次：走插件真实创建路径（原生表单 → 建文件 → 写 type frontmatter） */
  const before = h.vault.getFiles().length;
  await view.querySelectorAll('[data-action="new-resource"]').find((el) => el.getAttribute("data-kind") === "knowledge").dispatch("click");
  await h.settle();
  const form = h.lastFormModal();
  assert.ok(form, "应打开新建表单");
  fill(form, { title: "周复盘怎么做" });
  await submit(h, form);
  assert.equal(h.vault.getFiles().length, before + 1, "应真的创建了一条笔记");
  const created = h.vault.getFiles().find((file) => file.path.includes("周复盘怎么做"));
  assert.ok(created, "文件名应按标题生成，实际：" + h.vault.getFiles().map((file) => file.path).filter((path) => path.includes("知识")).join(", "));
  assert.equal(h.plugin.fm(created).type, "knowledge");
  assert.ok(h.vault.__readRaw(created.path).includes("## 结论"), "应带一个写作骨架，而不是空文件");
});
test("数据页签：勾选多条批量归档 / 撤销归档，一条失败不影响其它条", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/批量项目/批量项目.md", "---\ntype: project\ntitle: 批量项目\nstatus: active\n---\n");
  ["甲", "乙", "丙"].forEach((name) => {
    h.seedFile("20 项目库/批量项目/" + name + ".md", "---\ntype: task\ntitle: " + name + "\nstatus: todo\nproject: 20 项目库/批量项目/批量项目.md\n---\n");
  });
  /* 一条已归档的：批量归档时它应当被跳过而不是报错 */
  h.seedFile("90 归档库/批量项目/[批量项目] 丁.md", "---\ntype: task\ntitle: 丁\nstatus: archived\narchived_from: 20 项目库/批量项目/丁.md\narchived_to: 90 归档库/批量项目\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "data").dispatch("click");
  await h.settle();

  const view = shell.getElementById("view");
  const checks = view.querySelectorAll('[data-action="select-note"]');
  assert.ok(checks.length >= 4, "每条笔记都应有勾选框，实际：" + checks.length);
  /* 勾选三条任务 + 一条已归档任务 */
  const want = ["甲", "乙", "丙", "丁"];
  for (const name of want) {
    const box = view.querySelectorAll('[data-action="select-note"]').find((el) => el.getAttribute("data-path").indexOf(name + ".md") >= 0);
    box.checked = true;
    await box.dispatch("click");
    await h.settle();
  }
  const afterPicked = shell.getElementById("view");
  assert.ok(afterPicked.textContent.includes("归档（3）"), "应显示可归档条数（已归档的不计入、非任务不算），实际：" + afterPicked.textContent.slice(0, 220));
  assert.ok(afterPicked.textContent.includes("撤销归档（1）"), "应显示可撤销归档条数");

  await afterPicked.querySelectorAll('[data-action="bulk-archive"]')[0].dispatch("click");
  await h.settle();
  const archivedNow = h.vault.getFiles().map((file) => file.path).filter((path) => path.startsWith("90 归档库/"));
  assert.equal(archivedNow.length, 4, "三条新归档 + 原有的一条，实际：" + archivedNow.join(", "));
  assert.ok(!h.vault.getFiles().some((file) => file.path === "20 项目库/批量项目/甲.md"), "归档后原路径不应还在");

  /* 再批量撤销归档：四条（含先前那条）一起回到项目文件夹 */
  const view2 = shell.getElementById("view");
  await view2.querySelectorAll('[data-action="select-all-notes"]')[0].dispatch("click");
  await h.settle();
  const view3 = shell.getElementById("view");
  assert.ok(view3.textContent.includes("撤销归档（4）"), "全选后应能撤销全部四条归档");
  await view3.querySelectorAll('[data-action="bulk-undo-archive"]')[0].dispatch("click");
  await h.settle();
  const backInProject = h.vault.getFiles().map((file) => file.path).filter((path) => path.startsWith("20 项目库/批量项目/"));
  eqJson(backInProject.sort(), [
    "20 项目库/批量项目/丙.md",
    "20 项目库/批量项目/乙.md",
    "20 项目库/批量项目/甲.md",
    "20 项目库/批量项目/丁.md",
    "20 项目库/批量项目/批量项目.md"
  ].sort(), "四条任务都回项目文件夹并去掉项目名前缀；项目文档本身不得被搬动");
  /* 没有 project 字段的孤立任务按既定语义回日程待办 */
  /* 丁 没有 project 字段，但 archived_to 指向 90 归档库/批量项目 → 应回该项目文件夹并去掉前缀 */
  assert.ok(h.vault.getFiles().some((file) => file.path === "20 项目库/批量项目/丁.md"), "归档分桶信息应能反推项目，实际：" + h.vault.getFiles().map((file) => file.path).filter((path) => path.includes("丁")).join(", "));
  assert.ok(h.notices.some((message) => message.includes("撤销归档完成 4 / 5 条")), "批量操作要统一汇报（含跳过条数），实际：" + h.notices.join(" | "));
  assert.ok(h.notices.some((message) => message.includes("不是任务")), "勾到非任务时要说清楚为什么跳过，实际：" + h.notices.join(" | "));
});
test("任务页签：勾选多条一次改归属、一次改状态", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/批量归属/批量归属.md", "---\ntype: project\ntitle: 批量归属\nstatus: active\nmilestones:\n  - 第一步\n  - 第二步\n---\n");
  ["甲", "乙", "丙"].forEach((name) => {
    h.seedFile("50 日程待办/" + name + ".md", "---\ntype: task\ntitle: " + name + "\nstatus: todo\n---\n");
  });
  h.seedFile("00 草稿箱/不该被改.md", "---\ntype: note\ntitle: 不该被改\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks").dispatch("click");
  await h.settle();
  const view = () => shell.getElementById("view");
  const selectAll = async () => {
    await view().querySelectorAll('[data-action="select-all-tasks"]')[0].dispatch("click");
    await h.settle();
  };
  const status = (name) => h.plugin.fm(h.vault.getFiles().find((item) => item.path === "50 日程待办/" + name + ".md")).status;

  assert.equal(view().querySelectorAll('[data-action="select-task"]').length, 3, "每条在办任务都应有勾选框");
  await selectAll();
  assert.ok(view().textContent.includes("已选 3"), "应显示已选条数，实际：" + view().textContent.slice(0, 200));

  /* ① 一次挂到同一个项目与关键节点 */
  view().querySelectorAll("#bulk-project")[0].value = "20 项目库/批量归属/批量归属.md";
  view().querySelectorAll("#bulk-milestone")[0].value = "第二步";
  await view().querySelectorAll('[data-action="bulk-task-attribution"]')[0].dispatch("click");
  await h.settle();
  ["甲", "乙", "丙"].forEach((name) => {
    const file = h.vault.getFiles().find((item) => item.path === "50 日程待办/" + name + ".md");
    assert.equal(h.plugin.fm(file).project, "20 项目库/批量归属/批量归属.md", name + " 应挂到项目上");
    assert.equal(h.plugin.fm(file).milestone, "第二步", name + " 应挂到节点上");
  });

  /* ② 一次标记阻塞（阻塞仍然算在办，所以它们留在任务页签） */
  await selectAll();
  await view().querySelectorAll('[data-action="bulk-task-status"]').find((el) => el.getAttribute("data-status") === "blocked").dispatch("click");
  await h.settle();
  ["甲", "乙", "丙"].forEach((name) => assert.equal(status(name), "blocked", name + " 应被标成阻塞"));
  assert.ok(h.notices.some((message) => message.includes("已更新 3 条任务（状态）")), "批量改状态要统一汇报，实际：" + h.notices.join(" | "));
  assert.equal(view().querySelectorAll('[data-action="select-task"]').length, 3, "阻塞任务仍在任务页签");

  /* ③ 一次标记完成：完成后**留在**任务组里（is-done → 删除线 + 灰字），不再从列表消失；
        排序会把它们沉到组底（单独有一条用例守"沉底"）。 */
  await selectAll();
  await view().querySelectorAll('[data-action="bulk-task-status"]').find((el) => el.getAttribute("data-status") === "done").dispatch("click");
  await h.settle();
  ["甲", "乙", "丙"].forEach((name) => assert.equal(status(name), "done", name + " 应被标成完成"));
  assert.equal(view().querySelectorAll(".task-row.is-done").length, 3, "已完成的任务应留在列表里并带 is-done");
  assert.equal(view().querySelectorAll('[data-action="select-task"]').length, 3, "已完成的任务仍可勾选（可以批量重开）");
  assert.ok(!view().textContent.includes("没有符合筛选的任务"), "已完成不等于空列表");

  /* ④ 非任务（草稿）绝不能被批量入口改到 */
  const draft = h.vault.getFiles().find((item) => item.path === "00 草稿箱/不该被改.md");
  assert.equal(h.plugin.fm(draft).project, undefined, "草稿不能被当成任务改归属");
  assert.equal(h.plugin.fm(draft).status, undefined, "草稿不能被当成任务改状态");
});
test("主仪表盘：项目推演卡片不带批量勾选框，项目页签仍保留", async () => {
  const h = await setup();
  const { shell } = await openRenderedApp(h);

  const overview = shell.getElementById("view");
  assert.ok(String(overview.textContent).includes("项目推演"), "概览应有项目推演面板");
  assert.equal(
    overview.querySelectorAll('[data-action="select-project"]').length,
    0,
    "「项目推演」卡片左上角不该再出现勾选框",
  );

  /* 勾选属于项目页签的批量改状态交互，不能连它一起删掉 */
  await shell
    .querySelectorAll('[data-action="switch-view"]')
    .find((el) => el.getAttribute("data-view") === "projects")
    .dispatch("click");
  await h.settle();
  assert.ok(
    shell.getElementById("view").querySelectorAll('[data-action="select-project"]').length >= 1,
    "项目页签的批量勾选要保留",
  );
  assert.equal(h.consoleErrors.length, 0, "渲染不应报错：" + h.consoleErrors.join(" | "));
});

test("项目页签：勾选多个项目一次改状态（三处批量交互共用一套选择逻辑）", async () => {
  const h = await setup({ seed: false });
  ["甲项目", "乙项目", "丙项目"].forEach((name) => {
    h.seedFile("20 项目库/" + name + "/" + name + ".md", "---\ntype: project\ntitle: " + name + "\nstatus: active\n---\n");
  });
  h.seedFile("00 草稿箱/不该被改.md", "---\ntype: note\ntitle: 不该被改\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "projects").dispatch("click");
  await h.settle();
  const view = () => shell.getElementById("view");
  const status = (name) => h.plugin.fm(h.vault.getFiles().find((item) => item.path === "20 项目库/" + name + "/" + name + ".md")).status;

  assert.equal(view().querySelectorAll('[data-action="select-project"]').length, 3, "每个项目卡都应有勾选框");
  await view().querySelectorAll('[data-action="select-all-projects"]')[0].dispatch("click");
  await h.settle();
  assert.ok(view().textContent.includes("已选 3"), "应显示已选条数，实际：" + view().textContent.slice(0, 200));
  await view().querySelectorAll('[data-action="bulk-project-status"]').find((el) => el.getAttribute("data-status") === "completed").dispatch("click");
  await h.settle();
  ["甲项目", "乙项目", "丙项目"].forEach((name) => assert.equal(status(name), "completed", name + " 应被设为已完成"));
  assert.ok(h.notices.some((message) => message.includes("已把 3 个项目设为「已完成」")), "要统一汇报，实际：" + h.notices.join(" | "));

  /* 批量改状态只动 status，不移动文件 */
  assert.ok(h.vault.getFiles().some((file) => file.path === "20 项目库/甲项目/甲项目.md"), "改状态不该移动项目文件");
  /* 草稿不能被当成项目 */
  assert.equal(h.plugin.fm(h.vault.getFiles().find((file) => file.path === "00 草稿箱/不该被改.md")).status, undefined, "草稿不能被当成项目改状态");
});
test("知识页签：知识缺口就地「沉淀为知识」", async () => {
  const h = await setup({ seed: false });
  h.seedFile("50 日程待办/缺口一.md", "---\ntype: knowledge-gap\ntitle: 缺口一\nstatus: todo\n---\n");
  h.seedFile("50 日程待办/缺口二.md", "---\ntype: knowledge-gap\ntitle: 缺口二\nstatus: done\n---\n");
  h.seedFile("50 日程待办/普通任务.md", "---\ntype: task\ntitle: 普通任务\nstatus: todo\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "knowledge").dispatch("click");
  await h.settle();
  const view = shell.getElementById("view");
  assert.ok(view.textContent.includes("知识缺口"), "知识页签应有知识缺口面板");
  assert.ok(view.textContent.includes("缺口一"), "未沉淀的缺口应列出来");
  assert.ok(!view.textContent.includes("缺口二"), "已完成的缺口不该再催");
  assert.ok(!view.textContent.includes("普通任务"), "普通任务不是知识缺口");
  assert.ok(view.textContent.includes("1 个待沉淀"), "应显示待沉淀数量，实际：" + view.textContent.slice(0, 240));

  /* 就地沉淀：生成知识笔记，并把任务标成完成、回写引用 */
  const sink = view.querySelectorAll('[data-action="gap-sink"]')[0];
  assert.ok(sink, "应有「沉淀为知识」按钮");
  await sink.dispatch("click");
  await h.settle();
  /* 沉淀会先问"沉淀成哪篇知识"（原生表单），填完才真正创建 */
  const sinkForm = h.lastFormModal();
  assert.ok(sinkForm, "应弹出沉淀表单");
  fill(sinkForm, { title: "缺口一的答案" });
  await submit(h, sinkForm);
  const taskFile = h.vault.getFiles().find((file) => file.path === "50 日程待办/缺口一.md");
  assert.ok(h.plugin.fm(taskFile).knowledge_refs, "任务应回写知识引用");
  const created = h.vault.getFiles().find((file) => file.path.includes("知识库") && file.path !== taskFile.path);
  assert.ok(created, "应生成一条知识笔记，实际：" + h.vault.getFiles().map((file) => file.path).filter((path) => path.includes("知识")).join(", "));
  assert.equal(h.plugin.fm(created).type, "knowledge");
});
test("数据页签批量移动：只挪文件位置，不改语义，且要确认", async () => {
  const h = await setup({ seed: false });
  h.seedFile("00 草稿箱/待挪一.md", "---\ntype: note\ntitle: 待挪一\n---\n\n甲正文\n");
  h.seedFile("00 草稿箱/待挪二.md", "---\ntype: note\ntitle: 待挪二\n---\n\n乙正文\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "data").dispatch("click");
  await h.settle();
  const view = () => shell.getElementById("view");
  for (const name of ["待挪一", "待挪二"]) {
    const box = view().querySelectorAll('[data-action="select-note"]').find((el) => el.getAttribute("data-path").indexOf(name + ".md") >= 0);
    box.checked = true;
    await box.dispatch("click");
    await h.settle();
  }
  assert.ok(view().textContent.includes("移动（2）"), "应显示移动按钮与条数，实际：" + view().textContent.slice(0, 220));
  view().querySelectorAll("#bulk-move-target")[0].value = "knowledge";
  await view().querySelectorAll('[data-action="bulk-move-notes"]')[0].dispatch("click");
  await h.settle();

  /* 危险操作要一次确认（整批只弹一次） */
  const confirm = h.lastModal();
  assert.ok(confirm, "应弹出一次确认");
  await submit(h, confirm, "移动");
  const moved = h.vault.getFiles().map((file) => file.path).filter((path) => path.startsWith("30 知识库/") && path.includes("待挪"));
  assert.equal(moved.length, 2, "两条都应移动到知识库，实际：" + moved.join(", "));
  assert.ok(h.vault.__readRaw(moved.find((path) => path.includes("待挪一"))).includes("甲正文"), "正文不能被改");
  /* 只移动位置：语义字段保持原样（还是要用户在草稿箱里显式分诊） */
  const movedFile = h.vault.getFiles().find((file) => file.path.includes("待挪一"));
  assert.equal(h.plugin.fm(movedFile).type, "note", "批量移动不得顺手改 type");
  assert.equal(h.plugin.fm(movedFile).status, undefined, "批量移动不得顺手改 status");
});

test("批量移动部分失败：失败清单不重复计数（界面据此显示『N 条没成功』）", async () => {
  const h = await setup({ seed: false });
  h.seedFile("00 草稿箱/会失败.md", "---\ntype: note\ntitle: 会失败\n---\n\n甲\n");
  h.seedFile("00 草稿箱/能成功.md", "---\ntype: note\ntitle: 能成功\n---\n\n乙\n");

  const originalRename = h.vault.rename.bind(h.vault);
  h.vault.rename = async (...args) => {
    if (String(args[0] && args[0].path).includes("会失败")) throw new Error("目标被占用");
    return originalRename(...args);
  };

  h.plugin.bulkMoveNotes(["00 草稿箱/会失败.md", "00 草稿箱/能成功.md"], "knowledge");
  await h.settle();
  await submit(h, h.lastModal(), "移动");
  await h.settle();

  assert.ok(exists(h, "30 知识库/能成功.md"), "没失败的那条应移动成功");
  assert.ok(exists(h, "00 草稿箱/会失败.md"), "失败的那条应留在原处");

  /* 渲染层用 info.paths.length 显示"上次操作有 N 条没成功"、按钮写"重试这 N 条"，
     所以这里多推一次就会让计数翻倍、同一篇笔记列两遍。 */
  const info = h.plugin.lastBulkFailures;
  assert.ok(info, "应记录失败");
  assert.equal(info.paths.length, 1, "只失败 1 条，计数不该翻倍：" + JSON.stringify(info.paths));
  assert.equal(new Set(info.paths).size, info.paths.length, "失败清单不该有重复条目：" + JSON.stringify(info.paths));

  const data = await h.plugin.collectWebPayload();
  assert.equal(data.bulkFailures.paths.length, 1, "载荷里的失败条数也要是 1");
}, { allowConsoleErrors: true });
test("数据页签归档筛选：只看归档 / 只看在办 / 全部", async () => {
  const h = await setup({ seed: false });
  h.seedFile("50 日程待办/在办任务.md", "---\ntype: task\ntitle: 在办任务\nstatus: todo\n---\n");
  h.seedFile("90 归档库/孤立任务/2026-09-01 老任务.md", "---\ntype: task\ntitle: 老任务\nstatus: archived\narchived_to: 90 归档库/孤立任务\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "data").dispatch("click");
  await h.settle();
  const view = () => shell.getElementById("view");
  const rows = () => view().querySelectorAll('[data-action="open-note"]').map((el) => el.textContent);
  assert.ok(view().textContent.includes("只看归档 1"), "应显示归档条数，实际：" + view().textContent.slice(0, 200));
  assert.ok(view().textContent.includes("只看在办 1"), "应显示在办条数");

  await view().querySelectorAll('[data-action="filter-note-archived"]').find((el) => el.getAttribute("data-value") === "archived").dispatch("click");
  await h.settle();
  assert.ok(rows().some((text) => text.includes("老任务")), "只看归档应列出归档条目");
  assert.ok(!rows().some((text) => text.includes("在办任务")), "只看归档不应出现在办条目");

  await view().querySelectorAll('[data-action="filter-note-archived"]').find((el) => el.getAttribute("data-value") === "open").dispatch("click");
  await h.settle();
  assert.ok(rows().some((text) => text.includes("在办任务")), "只看在办应列出在办条目");
  assert.ok(!rows().some((text) => text.includes("老任务")), "只看在办不应出现归档条目");

  /* 重置要把范围也还原，否则用户会以为笔记丢了 */
  await view().querySelectorAll('[data-action="reset-note-filters"]')[0].dispatch("click");
  await h.settle();
  assert.equal(h.plugin ? true : true, true);
  assert.ok(rows().some((text) => text.includes("老任务")) && rows().some((text) => text.includes("在办任务")), "重置后应回到全部");
});
test("批量操作部分失败后：失败条留在界面上，可以重试也可以关掉", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/失败项目/失败项目.md", "---\ntype: project\ntitle: 失败项目\nstatus: active\n---\n");
  ["会失败", "会成功"].forEach((name) => {
    h.seedFile("20 项目库/失败项目/" + name + ".md", "---\ntype: task\ntitle: " + name + "\nstatus: todo\nproject: 20 项目库/失败项目/失败项目.md\n---\n");
  });
  /* 让"会失败"那条在写入时报错 */
  const originalUpdate = h.plugin.updateFM.bind(h.plugin);
  h.plugin.updateFM = async (file, patch, remove, guard) => {
    if (file && file.path.includes("会失败")) throw new Error("模拟写入失败");
    return originalUpdate(file, patch, remove, guard);
  };
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks").dispatch("click");
  await h.settle();
  const view = () => shell.getElementById("view");
  await view().querySelectorAll('[data-action="select-all-tasks"]')[0].dispatch("click");
  await h.settle();
  await view().querySelectorAll('[data-action="bulk-task-status"]').find((el) => el.getAttribute("data-status") === "blocked").dispatch("click");
  await h.settle();

  const text = shell.getElementById("view").textContent;
  assert.ok(text.includes("上次操作有 1 条没成功"), "失败条应留在界面上，实际：" + text.slice(0, 260));
  assert.ok(text.includes("会失败"), "失败条要点出是哪一条");
  assert.ok(shell.getElementById("view").querySelectorAll('[data-action="retry-bulk"]').length === 1, "应给重试入口");

  /* 修好之后再点重试：这次应当成功 */
  h.plugin.updateFM = originalUpdate;
  await shell.getElementById("view").querySelectorAll('[data-action="retry-bulk"]')[0].dispatch("click");
  await h.settle();
  assert.equal(h.plugin.fm(h.vault.getFiles().find((file) => file.path === "20 项目库/失败项目/会失败.md")).status, "blocked", "重试后应真的写进去");
  assert.ok(!shell.getElementById("view").textContent.includes("上次操作有"), "重试成功后失败条应消失");

  /* 「知道了」也能清掉 */
  h.plugin.recordBulkFailures("测试", "bulk-set-task-fields", { paths: ["x"], patch: {} }, ["x"], ["x（失败）"]);
  h.plugin.refreshViews();
  await h.settle();
  assert.ok(shell.getElementById("view").textContent.includes("上次操作有 1 条没成功"), "记录后应显示");
  await shell.getElementById("view").querySelectorAll('[data-action="dismiss-bulk-failures"]')[0].dispatch("click");
  await h.settle();
  assert.ok(!shell.getElementById("view").textContent.includes("上次操作有"), "点「知道了」应清掉失败条");
}, { allowConsoleErrors: true });   /* 用例故意制造一次写入失败，插件会 console.error 记录 */
test("归档的项目可以撤销归档（整夹搬回项目库；合并归档的不乱搬）", async () => {
  const h = await setup({ seed: false });
  /* 正常归档一个项目：走真实 archiveProject */
  h.seedFile("20 项目库/要归档/要归档.md", "---\ntype: project\ntitle: 要归档\nstatus: active\n---\n");
  h.seedFile("20 项目库/要归档/子任务.md", "---\ntype: task\ntitle: 子任务\nstatus: todo\nproject: 20 项目库/要归档/要归档.md\n---\n");
  let data = await h.plugin.collectData();
  await h.plugin.archiveProject(data.projects.find((item) => item.file.path === "20 项目库/要归档/要归档.md"));
  await h.settle();
  assert.ok(h.vault.getFiles().some((file) => file.path === "90 归档库/要归档/要归档.md"), "项目应被归档");
  assert.equal(h.plugin.fm(h.vault.getFiles().find((file) => file.path === "90 归档库/要归档/要归档.md")).status, "archived");

  /* 渲染层给出「撤销项目归档」 */
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "data").dispatch("click");
  await h.settle();
  const button = shell.getElementById("view").querySelectorAll('[data-action="undo-archive-project"]')[0];
  assert.ok(button, "归档的项目应有撤销归档入口");
  await button.dispatch("click");
  await h.settle();
  assert.ok(h.vault.getFiles().some((file) => file.path === "20 项目库/要归档/要归档.md"), "整个文件夹应回到项目库");
  assert.ok(h.vault.getFiles().some((file) => file.path === "20 项目库/要归档/子任务.md"), "夹里的任务也跟着回去");
  const restored = h.plugin.fm(h.vault.getFiles().find((file) => file.path === "20 项目库/要归档/要归档.md"));
  assert.equal(restored.status, "planning", "状态回「规划中」，用户可再改");
  assert.equal(restored.archived, undefined, "归档标记要清掉");

  /* 合并归档（同夹里有第二个项目）必须拒绝，不猜 */
  h.seedFile("90 归档库/混合/甲.md", "---\ntype: project\ntitle: 甲\nstatus: archived\n---\n");
  h.seedFile("90 归档库/混合/乙.md", "---\ntype: project\ntitle: 乙\nstatus: archived\n---\n");
  /* 归档库里的项目不在 data.projects 里（项目列表只收项目库目录），按渲染层同款方式现造对象 */
  const mixedFile = h.vault.getFiles().find((file) => file.path === "90 归档库/混合/甲.md");
  assert.ok(mixedFile, "归档库里的项目文件应存在");
  await h.plugin.undoArchiveProject({ file: mixedFile, frontmatter: h.plugin.fm(mixedFile) || {}, folderPath: "90 归档库/混合" });
  await h.settle();
  assert.ok(h.vault.getFiles().some((file) => file.path === "90 归档库/混合/甲.md"), "合并归档的不能被搬走");
  assert.ok(h.notices.some((message) => message.includes("无法自动拆分")), "要说明为什么拒绝，实际：" + h.notices.join(" | "));
});
test("知识缺口批量沉淀：按各自标题建知识笔记，逐条独立并汇报", async () => {
  const h = await setup({ seed: false });
  h.seedFile("50 日程待办/缺口甲.md", "---\ntype: knowledge-gap\ntitle: 缺口甲\nstatus: todo\n---\n");
  h.seedFile("50 日程待办/缺口乙.md", "---\ntype: knowledge-gap\ntitle: 缺口乙\nstatus: todo\n---\n");
  h.seedFile("50 日程待办/普通任务.md", "---\ntype: task\ntitle: 普通任务\nstatus: todo\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "knowledge").dispatch("click");
  await h.settle();
  const view = () => shell.getElementById("view");
  assert.equal(view().querySelectorAll('[data-action="select-gap"]').length, 2, "两条缺口都应有勾选框");
  await view().querySelectorAll('[data-action="select-all-gaps"]')[0].dispatch("click");
  await h.settle();
  assert.ok(view().textContent.includes("按标题沉淀（2）"), "应显示批量沉淀按钮与条数，实际：" + view().textContent.slice(0, 220));
  await view().querySelectorAll('[data-action="bulk-sink-gaps"]')[0].dispatch("click");
  await h.settle();

  /* 每条缺口按自己的标题生成知识笔记，并回写引用 */
  assert.ok(h.vault.getFiles().some((file) => file.path === "30 知识库/缺口甲.md"), "缺口甲应生成同名知识笔记");
  assert.ok(h.vault.getFiles().some((file) => file.path === "30 知识库/缺口乙.md"), "缺口乙应生成同名知识笔记");
  ["缺口甲", "缺口乙"].forEach((name) => {
    const task = h.plugin.fm(h.vault.getFiles().find((file) => file.path === "50 日程待办/" + name + ".md"));
    assert.ok(task.knowledge_refs && task.knowledge_refs.includes("30 知识库/" + name + ".md"), name + " 应回写知识引用");
  });
  assert.ok(h.notices.some((message) => message.includes("已沉淀 2 条知识缺口")), "要统一汇报，实际：" + h.notices.join(" | "));
});
test("概览的可点化：KPI 卡直接跳页签，焦点条空态给动作入口", async () => {
  const h = await setup({ seed: false });
  const { shell } = await openRenderedApp(h);
  const view = () => shell.getElementById("view");
  const kpis = view().querySelectorAll(".kpi-link");
  assert.ok(kpis.length >= 4, "四张 KPI 卡都应可点，实际：" + kpis.length);
  const targets = kpis.map((el) => el.getAttribute("data-view"));
  ["projects", "tasks", "inbox"].forEach((view) => assert.ok(targets.includes(view), "KPI 应能跳到 " + view + "，实际：" + targets.join(",")));

  await kpis.find((el) => el.getAttribute("data-view") === "projects").dispatch("click");
  await h.settle();
  assert.ok(shell.getElementById("tabs").textContent.includes("项目推演") || shell.getElementById("view").textContent.includes("项目推演"), "点 KPI 应切到项目页签");

  /* 没有逾期也没有临近 DDL 时，焦点条要给出"下一步做什么"的入口 */
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "overview").dispatch("click");
  await h.settle();
  const focus = shell.getElementById("view").querySelectorAll(".focus-strip")[0];
  assert.ok(focus, "应有今日焦点条");
  assert.ok(focus.textContent.includes("没有逾期"), "空态应说明情况，实际：" + focus.textContent.slice(0, 160));
  assert.ok(focus.querySelectorAll('[data-action="new-task"]').length === 1, "空态应给「新建任务」");
  assert.ok(focus.querySelectorAll('[data-view="inbox"]').length === 1, "空态应给「去草稿箱分诊」");
});
test("从关键节点新建任务：表单自动带上当前项目与节点，节点下拉列全", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/P/P.md", "---\ntype: project\ntitle: P\nstatus: active\nmilestones:\n  - 第一步\n  - 第二步\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "projects").dispatch("click");
  await h.settle();
  await shell.querySelectorAll('[data-action="detail-project"]')[0].dispatch("click");
  await h.settle();

  const button = shell.querySelectorAll('[data-action="new-task"]')[0];
  assert.equal(button.getAttribute("data-path"), "20 项目库/P/P.md", "按钮必须带上项目路径");
  assert.equal(button.getAttribute("data-name"), "第一步", "按钮必须带上当前关键节点名（以前是 null）");
  await button.dispatch("click");
  await h.settle();

  const form = h.lastFormModal();
  assert.equal(form.controls.project.getValue(), "20 项目库/P/P.md", "表单应预选当前项目（以前是空）");
  assert.equal(form.controls.milestone.getValue(), "第一步", "表单应预选当前节点（以前是未分组）");
  eqJson(Object.keys(form.controls.milestone.optionMap || {}), ["第一步", "第二步"], "节点下拉应列出项目的全部节点（以前只有未分组）");

  /* 端到端：直接保存，任务必须落到项目文件夹里、并且带对 project 与 milestone */
  fill(form, { title: "第一步要做的事" });
  await submit(h, form);
  const created = h.vault.getFiles().find((file) => file.path.includes("第一步要做的事"));
  assert.ok(created, "应创建任务文件，实际：" + h.vault.getFiles().map((file) => file.path).join(", "));
  assert.equal(created.path, "20 项目库/P/第一步要做的事.md", "应落在所属项目的文件夹里");
  const fm = h.plugin.fm(created);
  assert.equal(fm.project, "20 项目库/P/P.md", "frontmatter 的 project 必须写对");
  assert.equal(fm.milestone, "第一步", "frontmatter 的 milestone 必须写对");
});

test("新建任务表单：切换所属项目后，关键节点下拉随之重建且不残留旧节点", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/P/P.md", "---\ntype: project\ntitle: P\nstatus: active\nmilestones:\n  - 第一步\n  - 第二步\n---\n");
  h.seedFile("20 项目库/Q/Q.md", "---\ntype: project\ntitle: Q\nstatus: active\nmilestones:\n  - 收尾\n---\n");
  const { shell } = await openRenderedApp(h);
  /* 停在概览页：今日焦点条的「新建任务」就是"没有项目上下文"的入口（data-path="__vault__"） */
  await h.settle();

  const plain = shell.querySelectorAll('[data-action="new-task"]').find((el) => {
    const target = el.getAttribute("data-path") || "";
    return !target || target === "__vault__";
  });
  assert.ok(plain, "概览的焦点条应有不带项目上下文的「新建任务」入口");
  await plain.dispatch("click");
  await h.settle();
  const form = h.lastFormModal();
  assert.equal(form.controls.project.getValue(), "", "无上下文时项目应为空");
  eqJson(Object.keys(form.controls.milestone.optionMap || {}), ["未分组"], "无上下文时节点只有未分组");

  /* 选中项目 P → 节点下拉必须重建为 P 的节点 */
  form.controls.project.setValue("20 项目库/P/P.md");
  eqJson(Object.keys(form.controls.milestone.optionMap || {}), ["第一步", "第二步"], "选项目后节点下拉应重建（以前不联动）");
  assert.equal(form.controls.milestone.getValue(), "第一步", "重建后应自动落到第一个节点");

  /* 再换成 Q → 不能残留 P 的节点（Obsidian 的 addOptions 是合并语义，必须显式清空） */
  form.controls.project.setValue("20 项目库/Q/Q.md");
  eqJson(Object.keys(form.controls.milestone.optionMap || {}), ["收尾"], "换项目后不能残留上一个项目的节点");
  assert.equal(form.controls.milestone.getValue(), "收尾");

  /* 再回到"不关联项目" → 回到未分组 */
  form.controls.project.setValue("");
  eqJson(Object.keys(form.controls.milestone.optionMap || {}), ["未分组"], "取消项目后节点回到未分组");
});

test("详情抽屉的枚举字段是下拉，不是输入框（项目 / 关键节点 / 执行者 / 任务集 / 任务组）", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/P/P.md", "---\ntype: project\ntitle: P\nstatus: active\nmilestones:\n  - 第一步\n  - 第二步\n---\n");
  h.seedFile("40 人物库/张三.md", "---\ntype: person\ntitle: 张三\n---\n");
  h.seedFile("20 项目库/P/T1.md", "---\ntype: task\ntitle: T1\nstatus: todo\nproject: 20 项目库/P/P.md\nmilestone: 第一步\ntask_set: 本周维护\ntask_group: 资料整理\n---\n");
  h.seedFile("50 日程待办/T2.md", "---\ntype: task\ntitle: T2\nstatus: todo\ntask_set: 下周维护\ntask_group: 复盘\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks").dispatch("click");
  await h.settle();
  await shell.querySelectorAll('[data-action="detail-task"]').find((el) => el.getAttribute("data-path") === "20 项目库/P/T1.md").dispatch("click");
  await h.settle();
  const drawer = shell.getElementById("drawer");
  const controlOf = (key) => drawer.querySelectorAll('[data-field="' + key + '"]')[0];

  /* 引用类字段：必须是 select，且选项来自真实数据 */
  ["project", "milestone", "assignee"].forEach((key) => {
    const control = controlOf(key);
    assert.equal(control.tagName.toLowerCase(), "select", key + " 应该是下拉而不是输入框，实际：" + control.tagName);
  });
  eqJson(controlOf("project").querySelectorAll("option").map((option) => option.value), ["", "20 项目库/P/P.md"], "所属项目选项应来自项目库");
  assert.ok(controlOf("milestone").querySelectorAll("option").map((option) => option.value).includes("第二步"), "关键节点应列出所属项目的节点");
  eqJson(controlOf("assignee").querySelectorAll("option").map((option) => option.value), ["", "张三"], "执行者应来自人物库");

  /* 半开放字段：同样是下拉（不许手抄），最后一个选项是「＋ 新建…」出口 */
  ["task_set", "task_group"].forEach((key) => {
    const control = controlOf(key);
    assert.equal(control.tagName.toLowerCase(), "select", key + " 应该是下拉而不是输入框，实际：" + control.tagName);
    const values = control.querySelectorAll("option").map((option) => option.value);
    assert.ok(values.some((value) => value.indexOf("__pp_new_") === 0), key + " 应有「＋ 新建…」出口");
  });
  eqJson(controlOf("task_set").querySelectorAll("option").slice(1).map((option) => option.textContent), ["下周维护", "本周维护", "＋ 新建任务集…"], "任务集下拉应列出已有值并留出新建出口");
  eqJson(controlOf("task_group").querySelectorAll("option").slice(1).map((option) => option.textContent), ["复盘", "资料整理", "＋ 新建任务组…"], "任务组下拉应列出已有值并留出新建出口");
});

test("任务集下拉的「＋ 新建…」会问名字并写进任务字段，绝不把哨兵值写进笔记", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/P/T1.md", "---\ntype: task\ntitle: T1\nstatus: todo\ntask_set: 本周维护\n---\n");
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute("data-view") === "tasks").dispatch("click");
  await h.settle();
  await shell.querySelectorAll('[data-action="detail-task"]')[0].dispatch("click");
  await h.settle();
  const control = shell.getElementById("drawer").querySelectorAll('[data-field="task_set"]')[0];
  control.value = control.querySelectorAll("option").map((option) => option.value).find((value) => value.indexOf("__pp_new_") === 0);
  await control.dispatch("change");
  await h.settle();

  const form = h.lastFormModal();
  assert.ok(form, "应弹出「新建任务集」小表单");
  assert.ok(form.title.indexOf("任务集") >= 0, "表单标题应说明在新建什么，实际：" + form.title);
  fill(form, { name: "临时任务集" });
  await submit(h, form);
  const task = h.vault.getFiles().find((file) => file.path === "20 项目库/P/T1.md");
  assert.equal(h.plugin.fm(task).task_set, "临时任务集", "应把新名字写进 task_set");
  assert.ok(JSON.stringify(h.plugin.fm(task)).indexOf("__pp_new_") < 0, "哨兵值绝不能写进笔记");
});

test("焦点可见性：声明 outline:none 的聚焦态必须另有视觉变化", async () => {
  const h = await setup({ seed: false, data: {} });
  const raw = readText(path.join(WEB_DIR, "styles.css"));
  const blocks = [];
  const re = /([^{}]*:(?:focus-visible|focus)[^{}]*)\{([^{}]*)\}/g;
  let match = re.exec(raw);
  while (match) {
    blocks.push({ selector: match[1].trim().replace(/\s+/g, " "), body: match[2] });
    match = re.exec(raw);
  }
  assert.ok(blocks.length >= 5, "应能解析出聚焦态规则，实际：" + blocks.length);
  /* .view 是 tabindex="-1" 的程序化焦点目标（切页签时滚动定位用），不是键盘 Tab 站，允许只写 outline:none */
  const offenders = blocks
    .filter((block) => /outline:\s*none/.test(block.body))
    .filter((block) => !/^\.view:focus$/.test(block.selector))
    .filter((block) => !/(background|color|border-color|box-shadow|transform|filter|text-decoration)/.test(block.body.replace(/outline:\s*none;?/g, "")));
  assert.equal(offenders.length, 0, "这些聚焦态只写了 outline:none，键盘用户看不出焦点在哪：" + offenders.map((block) => block.selector).join(" | "));
});

test("抽屉焦点契约：打开入驻、Tab 内循环、关闭回位", async () => {
  const h = await setup();
  const { host, shell } = await openRenderedApp(h);
  const detail = shell.querySelectorAll("[data-action]").find((el) => el.getAttribute("data-action") === "detail-task");
  assert.ok(detail, "概览上应有可打开的详情入口");

  detail.focus();
  assert.equal(host.activeElement, detail, "前置：触发按钮应持有焦点");

  await detail.dispatch("click");
  await h.settle();
  const drawer = shell.getElementById("drawer");
  assert.equal(drawer.hidden, false, "应打开抽屉");
  const close = drawer.querySelector(".drawer-close");
  assert.ok(close, "抽屉应有「关闭」按钮");
  assert.equal(host.activeElement, close, "打开后焦点应移进抽屉（落在关闭按钮上），实际：" + (host.activeElement && host.activeElement.className));

  /* Tab 在抽屉内循环 */
  const focusables = drawer.querySelectorAll("button, [href], input, select, textarea, [tabindex]")
    .filter((el) => !el.disabled && el.getAttribute("tabindex") !== "-1");
  assert.ok(focusables.length >= 2, "抽屉里至少有「关闭」和动作按钮，实际：" + focusables.length);
  const last = focusables[focusables.length - 1];
  last.focus();
  host.dispatch("keydown", { key: "Tab", target: last });
  await h.settle();
  assert.equal(host.activeElement, focusables[0], "Tab 到末尾应回到第一个可聚焦元素，实际：" + (host.activeElement && host.activeElement.className));

  host.dispatch("keydown", { key: "Tab", shiftKey: true, target: focusables[0] });
  await h.settle();
  assert.equal(host.activeElement, last, "Shift+Tab 到开头应回到最后一个元素");

  /* 关闭时焦点还给触发它的按钮 */
  await shell.getElementById("scrim").dispatch("click");
  await h.settle();
  assert.equal(drawer.hidden, true, "点遮罩应关闭抽屉");
  assert.equal(host.activeElement, detail, "关闭后焦点应回到触发按钮，实际：" + (host.activeElement && host.activeElement.className));
});

test("空库引导：按钮真的接到插件命令上", async () => {
  const h = await setup({ seed: false, data: {} });
  const { shell } = await openRenderedApp(h);
  const actions = shell.querySelectorAll("[data-action]").filter((el) => el.closest(".onboarding")).map((el) => el.getAttribute("data-action"));
  eqJson(actions, ["init-structure", "new-project", "switch-view"], "空库引导应给出三个真实动作");

  /* 走到插件侧：这两个动作不针对具体笔记，必须直达对应方法，而不是掉进"按路径找条目"分支 */
  const calls = [];
  h.plugin.initializeStructure = async () => { calls.push("init-structure"); };
  h.plugin.newProject = async () => { calls.push("new-project"); };
  await h.plugin.webPerform("init-structure", "__vault__");
  await h.plugin.webPerform("new-project", "__vault__");
  eqJson(calls, ["init-structure", "new-project"], "无目标动作必须直达插件方法");

  /* 第三个动作是页签跳转，由渲染层自己处理 */
  const dataTab = shell.querySelectorAll(".tab").find((el) => el.getAttribute("data-view") === "data");
  await dataTab.dispatch("click");
  await h.settle();
  assert.ok(String(shell.getElementById("view").textContent).length > 20, "点「数据」页签后应渲染出内容");
});

test("窄窗格顶栏：不许给 .topbar 加 overflow-x，且顶栏不能被 flex 压缩", async () => {
  const h = await setup({ seed: false, data: {} });
  const raw = readText(path.join(WEB_DIR, "styles.css"));
  /* 这两条一起保证「换行出来的页签行留在顶栏盒子内、不被 hero 盖住」。
     真实 Chromium 实测（340 / 520px 窗格）：一旦 .topbar 有 overflow-x:auto，或者列向 flex
     把它压回 min-height:60px，整排页签就会跑到盒子外面并被 hero 覆盖 —— 看不见也点不到。 */
  assert.ok(!/\.topbar\s*\{[^}]*overflow-x/.test(raw), "不要给 .topbar 加 overflow-x：会把换行后的页签行裁在盒外");
  assert.ok(/\.topbar\s*\{[^}]*flex:\s*0 0 auto/.test(raw), ".topbar 需要 flex: 0 0 auto，否则列向 flex 会把它压回 min-height");
  assert.ok(/\.tabs\s*\{[^}]*overflow-x:\s*auto/.test(raw), "横向滚动应交给 .tabs 自己");
  assert.ok(/mask-image:\s*linear-gradient\(90deg/.test(raw), "窄窗格页签要有右侧渐隐提示，否则用户不知道还有页签");
});

test("插件 styles.css 的调色板与 web/styles.css 同源（由 sync-app.mjs 生成）", async () => {
  const h = await setup({ seed: false, data: {} });
  const pluginCss = readText(path.join(PLUGIN_DIR, "styles.css"));
  const webCss = readText(path.join(WEB_DIR, "styles.css"));

  const KEYS = ["--pp-bg-0", "--pp-bg-1", "--pp-bg-2", "--pp-bg-3", "--pp-bg-4",
    "--pp-line-1", "--pp-ink-1", "--pp-ink-2", "--pp-ink-3", "--pp-ink-4",
    "--pp-coral", "--pp-coral-hi", "--pp-mint", "--pp-lilac", "--pp-amber", "--pp-rose",
    "--pp-glass", "--pp-lift-1", "--pp-glow", "--pp-grad-cta", "--pp-halo"];

  function pick(css, key) {
    const match = css.match(new RegExp("(?:^|[;{\\s])" + key + "\\s*:\\s*([^;]+);"));
    return match ? match[1].replace(/\s+/g, " ").trim() : null;
  }
  function region(css, start, end) {
    const from = css.indexOf(start);
    const to = css.indexOf(end, from);
    assert.ok(from >= 0 && to > from, "styles.css 缺少调色板标记：" + start);
    return css.slice(from, to);
  }

  const dark = region(pluginCss, "PP_PALETTE_DARK_START", "PP_PALETTE_DARK_END");
  const light = region(pluginCss, "PP_PALETTE_LIGHT_START", "PP_PALETTE_LIGHT_END");
  KEYS.forEach((key) => {
    /* 深色取自 web 的极光 :root（第二套 :root），浅色取自 web 的 .theme-light */
    const webDarkRoot = webCss.slice(webCss.lastIndexOf(":root"));
    assert.equal(pick(dark, key), pick(webDarkRoot, key), "深色令牌 " + key + " 与 web 不一致（跑 node tools/sync-app.mjs）");
    assert.equal(pick(light, key), pick(webCss.slice(webCss.indexOf(".theme-light {")), key), "浅色令牌 " + key + " 与 web 不一致");
  });
  assert.ok(pluginCss.includes("PP_PALETTE_DARK_START") && pluginCss.includes("PP_PALETTE_LIGHT_START"), "插件 styles.css 应保留两处调色板标记");
});

test("排版令牌：跟随 Obsidian 字体设置，且不把没打包的 webfont 放在最前", async () => {
  const h = await setup({ seed: false, data: {} });
  const raw = readText(path.join(WEB_DIR, "styles.css"));
  assert.ok(/--pp-sans:\s*var\(--font-interface/.test(raw), "无衬线应优先用 Obsidian 的界面字体变量（--font-interface / --font-text）");
  assert.ok(/--pp-serif:[^;]*Georgia/.test(raw), "衬线要有本机可用字体兜底：插件离线运行、不打包 webfont");
  assert.ok(!/--pp-sans:\s*"DM Sans",\s*"Inter"/.test(raw), "不能把没打包的 webfont 排在本机字体前面");
});

test("素材解析：DEFAULTS 不再硬编码本库文件名，缺图时回落到渐变", async () => {
  const h = await setup({ seed: false });
  assert.equal(h.exposed.DEFAULTS.heroImage, "", "DEFAULTS.heroImage 应为空字符串（换库不再 404）");
  assert.ok(!JSON.stringify(h.exposed.DEFAULTS.waypointImages).includes("图片素材"), "导航卡默认值不应含本库路径");
  assert.ok(!JSON.stringify(h.exposed.DEFAULTS).includes("Pasted image"), "DEFAULTS 里不该再出现本库粘贴图片名");

  /* 没有任何图片：不产生 assets，页面回落到纯 CSS 渐变 */
  let payload = await h.plugin.collectWebPayload();
  assert.equal(payload.assets.hero, undefined, "没有素材时不应产生横幅 URL：" + JSON.stringify(payload.assets));

  /* 放入三张图片：横幅与导航卡按文件名顺序自动取用，缺的回落渐变 */
  h.seedFile("图片素材/a.png", "");
  h.seedFile("图片素材/b.jpg", "");
  h.seedFile("图片素材/c.png", "");
  h.plugin.webApiCache = null;
  payload = await h.plugin.collectWebPayload();
  assert.ok(payload.assets.hero && payload.assets.hero.file.includes("a.png"), "横幅应自动取第一张：" + JSON.stringify(payload.assets.hero));
  assert.ok(payload.assets.cardBuild.file.includes("b.jpg"), "导航卡 1 应取第二张");
  assert.ok(payload.assets.cardLearn.file.includes("c.png"), "导航卡 2 应取第三张");
  assert.equal(payload.assets.cardGrow, undefined, "图片不够时不硬凑");

  /* 设置里选过就以设置为准 */
  h.plugin.settings.heroImage = "图片素材/c.png";
  h.plugin.settings.waypointImages = { build: "图片素材/b.jpg", learn: "", grow: "" };
  h.plugin.webApiCache = null;
  payload = await h.plugin.collectWebPayload();
  assert.ok(payload.assets.hero.file.includes("c.png"), "显式设置的横幅优先：" + JSON.stringify(payload.assets.hero));
  assert.ok(payload.assets.cardBuild.file.includes("b.jpg"), "显式设置的导航卡优先");
});

test("applyTheme：浅色 Obsidian 挂 theme-light，深色挂 theme-dark（两个类互斥）", async () => {
  const h = await setup();
  const { leaf, host } = await openRenderedApp(h);
  assert.ok(host.classList.contains("theme-light"), "浅色 body 下应挂 theme-light，实际：" + host.className);
  assert.ok(!host.classList.contains("theme-dark"), "两个主题类不能同时存在：" + host.className);

  h.document.body.classList.add("theme-dark");
  leaf.view.applyTheme();
  assert.ok(host.classList.contains("theme-dark"), "切到深色应挂 theme-dark");
  assert.ok(!host.classList.contains("theme-light"), "切换时必须摘掉另一个类：" + host.className);

  h.document.body.classList.remove("theme-dark");
  leaf.view.applyTheme();
  assert.ok(host.classList.contains("theme-light") && !host.classList.contains("theme-dark"), "切回浅色要换回来：" + host.className);
});

test("Web 渲染层真的渲染出内容（以前这条链路完全测不到）", async () => {
  const h = await setup();
  const { shell } = await openRenderedApp(h);
  const viewText = String(shell.getElementById("view").textContent);

  const kpis = shell.querySelectorAll(".kpi");
  assert.equal(kpis.length, 4, "应有 4 张 KPI 卡");
  assert.ok(viewText.includes("进行中项目") && viewText.includes("每日容量"), "KPI 文案应来自渲染，而不是硬编码在测试里");

  const tabs = shell.querySelectorAll(".tab");
  assert.equal(tabs.length, 6, "应有 6 个页签");
  assert.equal(tabs[0].getAttribute("aria-current"), "page", "当前页应带 aria-current");

  const waypoints = shell.querySelectorAll(".waypoint");
  eqJson(waypoints.map((el) => el.getAttribute("data-view")), ["tasks", "knowledge", "projects"]);

  assert.ok(shell.querySelectorAll(".project-card").length >= 1, "应有项目卡");
  assert.ok(shell.querySelectorAll(".task-row").length >= 1, "应有任务行");
  assert.ok(shell.querySelectorAll(".day").length >= 7, "时间规划应有 7 天");
  assert.ok(String(shell.getElementById("footer").textContent).includes("test-vault"), "页脚应渲染出来");
  assert.ok(!viewText.includes("undefined"), "界面里不该出现 undefined");
  assert.equal(h.consoleErrors.length, 0, "渲染不应报错：" + h.consoleErrors.join(" | "));
});

test("主仪表盘：面板是「今日任务监控」，今日优先且仍保留完整负载视野", async () => {
  const h = await setup();
  /* 夹具的时钟固定在 2026-09-25（harness.now），必须用插件自己的 today() 取"今天"，
     用真实系统日期会和夹具对不上，今日列表永远是空的。 */
  const todayKey = h.helpers.today();
  h.seedFile(
    "50 日程待办/今日长标题任务.md",
    "---\ntype: task\ntitle: 今天必须完成的一条很长的任务标题用于验证换行与完整显示\nstatus: todo\ndue: " +
      todayKey +
      "\nduration: 25\n---\n",
  );
  await h.settle();

  const { shell } = await openRenderedApp(h);
  const view = shell.getElementById("view");
  const text = String(view.textContent);

  assert.ok(text.includes("今日任务监控"), "面板标题应是「今日任务监控」");
  assert.ok(!text.includes("项目时间规划"), "旧标题「项目时间规划」不应再出现");
  assert.equal(shell.querySelectorAll(".today-monitor").length, 1, "应渲染今日监控块");

  /* DOM 桩不支持后代选择器（".today-tasks .task-line" 恒为空），分两步查 */
  const todayList = shell.querySelectorAll(".today-tasks")[0];
  assert.ok(todayList, "应渲染今日任务列表");
  const todayRows = todayList.querySelectorAll(".task-line");
  assert.ok(todayRows.length >= 1, "今日块应列出今天到期的任务");
  const todayTitles = todayRows.map((el) => String(el.textContent)).join(" | ");
  assert.ok(todayTitles.includes("今天必须完成"), "今日行要显示完整任务标题，实际：" + todayTitles);

  const load = shell.querySelectorAll(".today-load")[0];
  assert.ok(load && String(load.textContent).includes("分钟"), "今日块要显示今日容量占用");

  const todayBars = shell.querySelectorAll(".day").filter((el) => el.getAttribute("data-today") === "true");
  assert.equal(todayBars.length, 1, "负载柱里今天那一格要被标出来");
  assert.ok(shell.querySelectorAll(".day").length >= 7, "未来负载柱不能因为改名而丢掉");
  assert.ok(!text.includes("undefined"), "界面里不该出现 undefined");
  assert.equal(h.consoleErrors.length, 0, "渲染不应报错：" + h.consoleErrors.join(" | "));
});

test("主仪表盘：任务行标题不会被操作列挤成窄列，也不被省略号截断", async () => {
  const css = readText(path.join(WEB_DIR, "styles.css"));

  /* 回归：.task-row 原先是两列 grid，右侧四个操作按钮按最大内容宽度占位，
     半宽面板（知识缺口 / 学习计划）里标题只剩几个字宽，折行后每行只有几个字。
     现在必须是可换行 flex + 标题基准宽度。 */
  const row = /\.task-row\s*\{([^}]*)\}/.exec(css);
  assert.ok(row, "web/styles.css 应有 .task-row 规则");
  assert.ok(
    /display:\s*flex/.test(row[1]) && /flex-wrap:\s*wrap/.test(row[1]),
    "任务行要能换行：操作放不下时自己落到下一行，而不是挤压标题",
  );
  assert.ok(
    !/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/.test(css),
    "不得回到「操作列按最大内容宽度占位」的两列 grid",
  );
  const main = /\.task-main\s*\{([^}]*)\}/.exec(css);
  assert.ok(main && /flex:\s*1 1 \d+em/.test(main[1]), "标题要拿到基准宽度，否则会被挤窄");
  assert.ok(
    /\.today-line \.task-line-title\s*\{[^}]*white-space:\s*normal/.test(css),
    "今日监控的任务标题要换行显示，不能用单行省略号",
  );

  /* 经典原生视图（排错用）走的是 .pp-task-content，同样不能截断 */
  const pluginCss = readText(path.join(PLUGIN_DIR, "styles.css"));
  assert.ok(
    /\.pp-link-button\.pp-task-content\s*\{[^}]*white-space:\s*normal/.test(pluginCss),
    "经典视图的任务标题同样要换行，不能截断成长标题只剩前几个字",
  );
});

test("Web 渲染层：点页签真的切换视图（事件委托 + 冒泡）", async () => {
  const h = await setup();
  const { shell } = await openRenderedApp(h);
  const tasksTab = shell.querySelectorAll(".tab").find((el) => el.getAttribute("data-view") === "tasks");
  assert.ok(tasksTab, "应有「任务」页签");
  await tasksTab.dispatch("click");
  await h.settle();
  const view = shell.getElementById("view");
  assert.ok(String(view.textContent).includes("日程待办"), "点击后应切到任务页签，实际：" + String(view.textContent).slice(0, 60));
  const active = shell.querySelectorAll(".tab").find((el) => el.getAttribute("aria-current") === "page");
  assert.equal(active && active.getAttribute("data-view"), "tasks", "当前页签应切到任务");
  assert.equal(h.consoleErrors.length, 0);
});

test("Web 渲染层：点遮罩能关掉抽屉（以前点不动也关不掉）", async () => {
  const h = await setup();
  const { shell } = await openRenderedApp(h);
  const detail = shell.querySelectorAll("[data-action]").find((el) => el.getAttribute("data-action") === "detail-task");
  assert.ok(detail, "概览上应有可打开的详情入口");
  await detail.dispatch("click");
  await h.settle();
  assert.equal(shell.getElementById("drawer").hidden, false, "应打开抽屉");
  assert.ok(String(shell.getElementById("drawer").textContent).length > 20, "抽屉里应有内容");
  await shell.getElementById("scrim").dispatch("click");
  await h.settle();
  assert.equal(shell.getElementById("drawer").hidden, true, "点遮罩应关闭抽屉");
});

test("Web 渲染层：已归档任务不进任务页签，但给出可去的数据页签入口", async () => {
  const h = await setup();
  h.seedFile("20 项目库/仪表盘搭建/早已归档.md", "---\ntype: task\ntitle: 早已归档\nstatus: archived\narchived_to: 90 归档库\n---\n");
  const { shell } = await openRenderedApp(h);
  const tasksTab = shell.querySelectorAll(".tab").find((el) => el.getAttribute("data-view") === "tasks");
  await tasksTab.dispatch("click");
  await h.settle();
  const view = shell.getElementById("view");
  assert.ok(!String(view.textContent).includes("早已归档"), "已归档任务不应出现在任务页签");
  assert.ok(String(view.textContent).includes("已归档 1 项"), "应给出「已归档 N 项」的去处，实际：" + String(view.textContent).slice(0, 120));
});

test("Web 渲染层：KPI 进度条按比例，而不是恒为满格", async () => {
  const h = await setup();
  const { shell } = await openRenderedApp(h);
  const bars = shell.querySelectorAll(".kpi-bar").map((el) => (el.children[0] ? el.children[0].style.width : ""));
  assert.equal(bars.length, 4, "应有 4 条 KPI 进度条");
  bars.forEach((width, index) => {
    assert.ok(/^\d+%$/.test(String(width)), "第 " + (index + 1) + " 条应是百分比宽度，实际：" + width);
  });
  /* 样例库里「进行中项目 1/1」=100%，而「逾期任务 1/4」不可能是 100%。
     pct() 被二次 ×100 时四条会被 kpiCard 夹成「满格或 2%」，这条断言就会失败。 */
  assert.ok(bars.some((width) => String(width) !== "100%"), "进度条不该全是满格：" + bars.join(", "));
  assert.ok(new Set(bars).size > 1, "进度条宽度应反映各自比例：" + bars.join(", "));
});

test("WebAppView 注册、打开后建立 Shadow 外壳并可干净关闭", async () => {
  const h = await setup();
  assert.ok(h.plugin.__views.has(VIEW.app), "应注册 Web 渲染层视图");
  assert.equal(h.exposed.APP_VIEW, "personal-planning-dashboard-app");
  assert.equal(typeof h.exposed.WebAppView, "function");

  const leaf = h.workspace.getLeaf();
  await leaf.setViewState({ type: VIEW.app });
  assert.equal(leaf.view.getViewType(), VIEW.app);
  assert.equal(leaf.view.getDisplayText(), "仪表盘（Web 版）");
  assert.equal(h.consoleErrors.length, 0, "打开视图不应产生错误：" + h.consoleErrors.join(" | "));

  const hosts = h.findByClass(leaf.view.contentEl, "pp-web-host");
  assert.equal(hosts.length, 1, "应在 contentEl 里建立唯一宿主元素");
  const injected = hosts[0].children[0];
  assert.ok(String(injected.textContent).includes(":host {"), "应注入 Shadow 作用域化的设计系统");
  assert.ok(String(injected.textContent).includes(":host(.theme-dark)"), "深色令牌应挂到宿主元素上");
  /* 以前这里断言 innerHTML === WEB_SHELL_HTML —— 桩不解析 HTML，所以那是「常量自比」的恒真断言。
     现在 HTML 真的会被解析成节点，渲染也会往 #view/#tabs/#footer 里写内容，骨架自然不再等于常量；
     改成断言骨架真的被解析出来了：结构 id 齐全、抽屉与遮罩初始隐藏、并且已经渲染出真实内容。 */
  const shell = hosts[0].children[1];
  ["pp-app", "tabs", "view", "footer", "drawer", "scrim"].forEach((id) => {
    assert.ok(shell.getElementById(id), "骨架缺少 #" + id + "（HTML 未被解析成节点？）");
  });
  assert.equal(shell.getElementById("drawer").hidden, true, "抽屉初始应隐藏");
  assert.equal(shell.getElementById("scrim").hidden, true, "遮罩初始应隐藏");
  assert.ok(shell.getElementById("tabs").children.length >= 6, "页签应真的渲染出来");
  assert.ok(shell.getElementById("view").textContent.length > 40, "视图应真的渲染出内容");
  assert.ok(shell.getElementById("footer").innerHTML.includes("实时读取自 Vault"), "页脚应真的渲染出来");
  assert.ok(leaf.view.mounted, "应完成一次 mount");
  assert.ok(h.consoleErrors.length === 0, "渲染过程不应报错：" + h.consoleErrors.join(" | "));

  /* 数据刷新后内容跟着变（以前这条路径完全测不到） */
  const before = shell.getElementById("view").textContent;
  await leaf.view.refresh();
  await h.settle();
  assert.equal(shell.getElementById("view").textContent, before, "同样的数据重复刷新应得到同样的界面");

  await leaf.view.onClose();
  assert.equal(leaf.view.mounted, null, "关闭时应卸载渲染层");
  assert.equal(h.consoleErrors.length, 0);
});

test("mount/unmount 契约：渲染所需节点、委托事件、回跳笔记、解绑干净", async () => {
  const h = await setup({ seed: false, data: {} });
  const nodes = new Map();
  function makeNode(id) {
    return { id, innerHTML: "", textContent: "", hidden: true, attrs: {}, scrollIntoView() {}, setAttribute(key, value) { this.attrs[key] = value; }, addEventListener() {} };
  }
  const root = { getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); } };
  const bound = [];
  const opened = [];
  const listeners = {
    addEventListener(type, handler) { bound.push({ type, handler }); },
    removeEventListener(type, handler) { const index = bound.findIndex((item) => item.type === type && item.handler === handler); if (index >= 0) bound.splice(index, 1); }
  };

  const sandbox = { exports: {} };
  const api = h.helpers.ppWebAppFactory(
    { document: h.document, setTimeout: h.window.setTimeout, clearTimeout: h.window.clearTimeout },
    h.document, undefined, undefined, sandbox, sandbox.exports
  );
  assert.equal(typeof api.mount, "function");
  assert.equal(typeof api.unmount, "function");
  assert.equal(typeof api.setData, "function");

  const payload = h.helpers.buildWebPayload(NOTES, h.plugin.settings, { vaultName: "测试库", live: true });
  const returned = api.mount({
    data: payload,
    host: {
      root, listeners,
      activeElement: () => null,
      getHash: () => "",
      setHash: () => {},
      onHashChange: () => {},
      offHashChange: () => {},
      openNote: (target) => opened.push(target),
      copyText: () => {},
      storage: { getItem: () => null, setItem: () => {} },
      sources: () => ({ vault: null, sample: null })
    }
  });
  assert.equal(returned, api, "mount 应返回 api 自身");

  assert.ok(nodes.get("view").innerHTML.includes('class="hero'), "应渲染头图区");
  assert.ok(nodes.get("tabs").innerHTML.includes('aria-current="page"'), "应渲染当前页导航");
  assert.equal(nodes.get("date-chip").textContent, payload.today);
  assert.ok(nodes.get("footer").innerHTML.includes("实时读取自 Vault"), "live 数据应使用实时措辞");
  assert.ok(!nodes.get("footer").innerHTML.includes("重建："), "live 数据不应出现离线重建命令");
  assert.ok(nodes.get("view").innerHTML.includes("进行中任务"), "概览应带统计");
  /* compositionend 是给中文/日文输入法用的：组合结束后补一次刷新 */
  eqJson(bound.map((item) => item.type).sort(), ["change", "change", "click", "compositionend", "compositionstart", "focusout", "input", "keydown"]);

  const click = bound.find((item) => item.type === "click").handler;
  const target = {
    getAttribute: (key) => ({ "data-action": "open-note", "data-path": "20 项目库/仪表盘搭建/仪表盘搭建.md" })[key] || null,
    closest: () => target
  };
  click({ target, preventDefault() {} });
  eqJson(opened, ["20 项目库/仪表盘搭建/仪表盘搭建.md"]);

  api.unmount();
  assert.equal(bound.length, 0, "unmount 应解绑全部监听");
  api.unmount();
  assert.equal(bound.length, 0, "重复 unmount 不应出错");

  // 卸载后仍有防抖定时器落地时不能抛错（render 的空节点守卫）
  api.render();
  assert.equal(h.consoleErrors.length, 0, "卸载后的渲染不应产生错误：" + h.consoleErrors.join(" | "));
});

test("素材路径：剥掉可注入字符，但保留 app:// 资源 URL 里的中文与 +", async () => {
  const h = await setup({ seed: false, data: {} });
  const nodes = new Map();
  const makeNode = (id) => ({ id, innerHTML: "", textContent: "", hidden: true, scrollIntoView() {}, setAttribute() {}, addEventListener() {} });
  const root = { getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); } };
  const listeners = { addEventListener() {}, removeEventListener() {} };
  const sandbox = { exports: {} };
  const api = h.helpers.ppWebAppFactory(
    { document: h.document, setTimeout: h.window.setTimeout, clearTimeout: h.window.clearTimeout },
    h.document, undefined, undefined, sandbox, sandbox.exports
  );
  const renderWithHero = (file) => {
    const data = h.helpers.buildWebPayload(NOTES, h.plugin.settings, { vaultName: "测试库", live: true, assets: { hero: { file, tone: "dark" } } });
    api.mount({
      data,
      host: {
        root, listeners, activeElement: () => null, getHash: () => "", setHash: () => {},
        onHashChange: () => {}, offHashChange: () => {}, openNote: () => {}, copyText: () => {},
        storage: { getItem: () => null, setItem: () => {} }, sources: () => ({ vault: null, sample: null })
      }
    });
    return nodes.get("view").innerHTML;
  };

  // 注入尝试：引号 / 括号 / 分号 / 空白必须被剥掉，不能跳出 url() 上下文
  const injected = renderWithHero('x") ; background:url("evil.js');
  assert.ok(!injected.includes('url("evil'), "不能注入新的 url() 参数");
  assert.ok(!injected.includes('") ;'), "引号 / 括号 / 分号 / 空白应被整体剥掉");
  assert.ok(!injected.includes("; background"), "不能注入新的样式声明");
  assert.ok(injected.includes("xbackground:urlevil.js"), "危险字符剥掉后应并入原来的 url()，而不是形成新声明");

  // Obsidian 的 app:// 资源 URL 桌面端可能带未编码的中文与 +，必须原样保留
  const appUrl = "app://local/C:/vault/示例库+知识库/图片素材/banner.png";
  const kept = renderWithHero(appUrl);
  assert.ok(kept.includes(appUrl), "app:// 资源 URL（含中文与 +）必须原样保留，否则横幅与导航卡图会加载失败");
  api.unmount();
});

test("Web 视图操作栏把写操作接到插件原有命令上", async () => {
  const h = await setup();
  const calls = [];
  h.plugin.newProject = () => { calls.push("new-project"); };
  h.plugin.newTask = () => { calls.push("new-task"); };
  h.plugin.triageInbox = () => { calls.push("triage-inbox"); };
  h.plugin.activateDashboard = () => { calls.push("native-dashboard"); };

  const leaf = h.workspace.getLeaf();
  await leaf.setViewState({ type: VIEW.app });

  const toolbar = h.findByClass(leaf.view.contentEl, "pp-web-toolbar")[0];
  assert.ok(toolbar, "Web 视图应有操作栏");
  const buttons = toolbar.children.filter((child) => child.tag === "button");
  eqJson(buttons.map((button) => button.textContent), ["新建项目", "新建任务", "处理草稿箱", "刷新"]);

  buttons.forEach((button) => { if (button.onclick) button.onclick(); });
  await h.settle();
  eqJson(calls, ["new-project", "new-task", "triage-inbox"], "除刷新外的动作都应落到插件命令上");
  assert.equal(h.consoleErrors.length, 0, "操作栏不应产生错误：" + h.consoleErrors.join(" | "));

  // 操作栏在 Shadow DOM 之外，必须能拿到夜航极光令牌
  const scopes = h.findByClass(leaf.view.contentEl, "pp-view-root");
  assert.equal(scopes.length, 1, "操作栏与宿主应包在 .pp-view-root 里以获得设计令牌");
  assert.equal(h.findByClass(leaf.view.contentEl, "pp-web-host").length, 1);
});

test("webPerform：把 Web 层写操作映射到插件原有方法", async () => {
  const h = await setup();
  const calls = [];
  h.plugin.editTask = (task, project) => { calls.push(["edit-task", task.file.path, project ? project.file.path : ""]); };
  h.plugin.archiveTask = (task) => { calls.push(["archive-task", task.file.path]); };
  h.plugin.deleteTask = (task) => { calls.push(["delete-task", task.file.path]); };
  h.plugin.editProject = (project) => { calls.push(["edit-project", project.file.path]); };
  h.plugin.projectStatus = (file) => { calls.push(["project-status", file.path]); };
  h.plugin.setTaskStatus = (task, status) => { calls.push(["set-task-status", task.file.path, status]); };
  h.plugin.newMilestone = (project) => { calls.push(["project-milestone", project.file.path]); };
  h.plugin.archiveProject = (project) => { calls.push(["archive-project", project.file.path]); };
  h.plugin.deleteProject = (project) => { calls.push(["delete-project", project.file.path]); };
  h.plugin.editMilestone = (project, name) => { calls.push(["milestone-rename", project.file.path, name]); };
  h.plugin.deleteMilestone = (project, name) => { calls.push(["milestone-delete", project.file.path, name]); };
  h.plugin.materializeKnowledgeGap = (task) => { calls.push(["gap-sink", task.file.path]); };
  h.plugin.undoArchiveTask = (task) => { calls.push(["undo-archive", task.file.path]); };
  h.plugin.archiveBook = (item) => { calls.push(["archive-book", item.file.path]); };

  const taskPath = "20 项目库/仪表盘搭建/完成首页文案.md";
  const projectPath = "20 项目库/仪表盘搭建/仪表盘搭建.md";
  await h.plugin.webPerform("edit-task", taskPath);
  await h.plugin.webPerform("archive-task", taskPath);
  await h.plugin.webPerform("delete-task", taskPath);
  await h.plugin.webPerform("edit-project", projectPath);
  await h.plugin.webPerform("project-status", projectPath);
  await h.plugin.webPerform("set-task-status", taskPath, "blocked");
  await h.plugin.webPerform("project-milestone", projectPath);
  await h.plugin.webPerform("archive-project", projectPath);
  await h.plugin.webPerform("delete-project", projectPath);
  await h.plugin.webPerform("milestone-rename", projectPath, "完成 MVP");
  await h.plugin.webPerform("milestone-delete", projectPath, "完成 MVP");
  await h.plugin.webPerform("gap-sink", taskPath);
  await h.plugin.webPerform("undo-archive", taskPath);
  await h.plugin.webPerform("archive-book", "30 知识库/图书库/设计心理学.md");
  eqJson(calls, [
    ["edit-task", taskPath, projectPath],
    ["archive-task", taskPath],
    ["delete-task", taskPath],
    ["edit-project", projectPath],
    ["project-status", projectPath],
    ["set-task-status", taskPath, "blocked"],
    ["project-milestone", projectPath],
    ["archive-project", projectPath],
    ["delete-project", projectPath],
    ["milestone-rename", projectPath, "完成 MVP"],
    ["milestone-delete", projectPath, "完成 MVP"],
    ["gap-sink", taskPath],
    ["undo-archive", taskPath],
    ["archive-book", "30 知识库/图书库/设计心理学.md"]
  ]);

  // 路径不存在 / 空路径：只提示，不抛错
  const errors = h.consoleErrors.length;
  await h.plugin.webPerform("edit-task", "不存在的笔记.md");
  await h.plugin.webPerform("edit-task", "");
  assert.equal(h.consoleErrors.length, errors, "找不到条目时不应产生错误");
});

test("Web 详情抽屉在宿主支持写操作时渲染动作按钮，并把动作回传给 perform", async () => {
  const h = await setup({ seed: false, data: {} });
  const nodes = new Map();
  const makeNode = (id) => ({ id, innerHTML: "", textContent: "", hidden: true, scrollIntoView() {}, setAttribute() {}, addEventListener() {} });
  const root = { getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); } };
  const bound = [];
  const performed = [];
  const listeners = {
    addEventListener(type, handler) { bound.push({ type, handler }); },
    removeEventListener(type, handler) { const index = bound.findIndex((item) => item.type === type && item.handler === handler); if (index >= 0) bound.splice(index, 1); }
  };
  const sandbox = { exports: {} };
  const api = h.helpers.ppWebAppFactory(
    { document: h.document, setTimeout: h.window.setTimeout, clearTimeout: h.window.clearTimeout },
    h.document, undefined, undefined, sandbox, sandbox.exports
  );
  const payload = h.helpers.buildWebPayload(NOTES, h.plugin.settings, { vaultName: "测试库", live: true });
  api.mount({
    data: payload,
    host: {
      root, listeners, activeElement: () => null, getHash: () => "", setHash: () => {},
      onHashChange: () => {}, offHashChange: () => {}, openNote: () => {}, copyText: () => {},
      perform: (action, target) => performed.push([action, target]),
      storage: { getItem: () => null, setItem: () => {} }, sources: () => ({ vault: null, sample: null })
    }
  });

  const task = payload.tasks.find((item) => item.title === "完成首页文案");
  api.openDrawer(api.drawerTask(payload, task));
  const drawerHtml = nodes.get("drawer").innerHTML;
  assert.ok(drawerHtml.includes('data-action="edit-task"'), "抽屉应有编辑按钮");
  assert.ok(drawerHtml.includes('data-action="archive-task"'), "抽屉应有完成并归档按钮");
  assert.ok(drawerHtml.includes('data-action="delete-task"'), "抽屉应有删除按钮");

  const click = bound.find((item) => item.type === "click").handler;
  const replay = (action, target) => {
    const button = { getAttribute: (key) => ({ "data-action": action, "data-path": target })[key] || null, closest: () => button };
    click({ target: button, preventDefault() {} });
  };
  /* 路径必须从渲染结果里读出来：渲染层若不输出 data-path，这里会直接失败 */
  const pathOf = (action) => {
    const match = drawerHtml.match(new RegExp('data-action="' + action + '" data-path="([^"]+)"'));
    assert.ok(match, "渲染出的 " + action + " 按钮必须带 data-path");
    return match[1];
  };
  const editPath = pathOf("edit-task");
  const archivePath = pathOf("archive-task");
  const deletePath = pathOf("delete-task");
  assert.equal(editPath, task.path, "data-path 应指向该任务");
  replay("edit-task", editPath);
  replay("archive-task", archivePath);
  replay("delete-task", deletePath);
  eqJson(performed, [["edit-task", editPath], ["archive-task", archivePath], ["delete-task", deletePath]]);

  // 项目抽屉同样带动作按钮
  const project = payload.projects[0];
  api.openDrawer(api.drawerProject(payload, project));
  const projectHtml = nodes.get("drawer").innerHTML;
  ["edit-project", "project-status", "project-milestone", "archive-project", "delete-project"].forEach((action) => {
    assert.ok(projectHtml.includes('data-action="' + action + '"'), "项目抽屉应有 " + action);
  });

  // 知识页签：图书条目带「归档」（宿主不支持写操作时不应出现）
  payload.resources.books = [{ title: "设计心理学", path: "30 知识库/图书库/设计心理学.md", type: "book" }];
  api.setData(payload);
  api.switchView("knowledge");
  const knowledgeHtml = nodes.get("view").innerHTML;
  assert.ok(knowledgeHtml.includes("设计心理学"), "知识页签应列出图书");
  assert.ok(knowledgeHtml.includes('data-action="archive-book"'), "图书条目应带归档按钮");
  api.unmount();
});

test("数据页签：整库浏览、类型筛选与撤销归档", async () => {
  const h = await setup({ seed: false, data: {} });
  const nodes = new Map();
  const makeNode = (id) => ({ id, innerHTML: "", textContent: "", hidden: true, value: "", scrollIntoView() {}, setAttribute() {}, addEventListener() {} });
  const root = { getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); } };
  const bound = [];
  const performed = [];
  const listeners = {
    addEventListener(type, handler) { bound.push({ type, handler }); },
    removeEventListener(type, handler) { const index = bound.findIndex((item) => item.type === type && item.handler === handler); if (index >= 0) bound.splice(index, 1); }
  };
  const sandbox = { exports: {} };
  const api = h.helpers.ppWebAppFactory(
    { document: h.document, setTimeout: h.window.setTimeout, clearTimeout: h.window.clearTimeout },
    h.document, undefined, undefined, sandbox, sandbox.exports
  );
  const payload = h.helpers.buildWebPayload(NOTES, h.plugin.settings, {
    vaultName: "测试库", live: true,
    noteIndex: [
      { path: "20 项目库/仪表盘搭建/仪表盘搭建.md", frontmatter: { type: "project", title: "仪表盘搭建", status: "active" } },
      { path: "20 项目库/仪表盘搭建/完成首页文案.md", frontmatter: { type: "task", title: "完成首页文案", status: "todo" } },
      { path: "90 归档库/孤立任务/2026-09-01 旧任务.md", frontmatter: { type: "task", title: "旧任务", status: "archived" } },
      { path: "90 归档库/孤立任务/2026-09-02 随手记.md", frontmatter: { type: "note", title: "随手记", stage: "archived" } }
    ]
  });
  api.mount({
    data: payload,
    host: {
      root, listeners, activeElement: () => null, getHash: () => "", setHash: () => {},
      onHashChange: () => {}, offHashChange: () => {}, openNote: () => {}, copyText: () => {},
      perform: (action, target, extra) => performed.push([action, target, extra]),
      storage: { getItem: () => null, setItem: () => {} }, sources: () => ({ vault: null, sample: null })
    }
  });

  api.switchView("data");
  const view = nodes.get("view").innerHTML;
  assert.ok(view.includes("整库索引：4 条笔记"), "应显示整库条数");
  assert.ok(nodes.get("tabs").innerHTML.includes("数据"), "应出现数据页签");
  assert.ok(view.includes('id="qd"'), "应有搜索框");
  assert.ok(view.includes("旧任务"), "应列出归档笔记");
  assert.ok(view.includes('data-action="undo-archive"'), "归档任务应带撤销归档按钮");
  assert.ok(view.includes("随手记"), "归档的普通笔记也应列出");
  assert.equal((view.match(/data-action="undo-archive"/g) || []).length, 1, "只有归档任务才给撤销归档（普通笔记会被误当任务恢复）");
  assert.equal((view.match(/data-action="edit-task"/g) || []).length, 1, "只有活动目录里的任务才有编辑按钮");
  assert.equal((view.match(/data-action="edit-project"/g) || []).length, 1, "只有活动目录里的项目才有编辑按钮");

  const click = bound.find((item) => item.type === "click").handler;
  const replay = (action, target, extra) => {
    const button = { getAttribute: (key) => ({ "data-action": action, "data-path": target, "data-name": extra })[key] || null, closest: () => button };
    click({ target: button, preventDefault() {} });
  };
  replay("undo-archive", "90 归档库/孤立任务/2026-09-01 旧任务.md");
  replay("milestone-rename", "20 项目库/仪表盘搭建/仪表盘搭建.md", "完成 MVP");
  replay("gap-sink", "20 项目库/仪表盘搭建/完成首页文案.md");
  eqJson(performed, [
    ["undo-archive", "90 归档库/孤立任务/2026-09-01 旧任务.md", null],
    ["milestone-rename", "20 项目库/仪表盘搭建/仪表盘搭建.md", "完成 MVP"],
    ["gap-sink", "20 项目库/仪表盘搭建/完成首页文案.md", null]
  ]);
  api.unmount();
});

test("WebAppView：并发刷新只建立一个外壳、不产生错误", async () => {
  const h = await setup();
  const leaf = h.workspace.getLeaf();
  await leaf.setViewState({ type: VIEW.app });
  assert.equal(h.findByClass(leaf.view.contentEl, "pp-web-host").length, 1);

  await Promise.all([leaf.view.refresh(), leaf.view.refresh(), leaf.view.refresh()]);
  assert.equal(h.findByClass(leaf.view.contentEl, "pp-web-host").length, 1, "并发刷新不应重复建立宿主元素");
  assert.ok(leaf.view.refreshToken >= 4, "每次刷新都应推进版本令牌，实际 " + leaf.view.refreshToken);
  assert.equal(h.consoleErrors.length, 0, "并发刷新不应产生错误：" + h.consoleErrors.join(" | "));

  await leaf.view.onClose();
});

test("webPerform 端到端：真实方法真的落到 vault 上（不用桩）", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const taskPath = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案").file.path;
  const projectPath = "20 项目库/仪表盘搭建/仪表盘搭建.md";

  // 完成并归档 → 撤销归档
  await h.plugin.webPerform("archive-task", taskPath);
  await h.settle();
  const archivedPath = "90 归档库/仪表盘搭建/[仪表盘搭建] 完成首页文案.md";
  assert.ok(exists(h, archivedPath), "archive-task 应真的移动到归档库：" + paths(h).filter((p) => p.startsWith("90")).join(", "));
  await h.plugin.webPerform("undo-archive", archivedPath);
  await h.settle();
  assert.ok(exists(h, taskPath), "undo-archive 应真的恢复回项目文件夹");

  // 编辑任务（FormModal）
  await h.plugin.webPerform("edit-task", taskPath);
  fill(h.lastModal(), { title: "完成首页文案 v2" });
  await submit(h, h.lastModal());
  await h.settle();
  const renamedPath = "20 项目库/仪表盘搭建/完成首页文案 v2.md";
  assert.ok(exists(h, renamedPath), "edit-task 应真的改名文件：" + paths(h).filter((p) => p.includes("完成首页文案")).join(", "));

  // 关键节点改名（FormModal + perform 的第三个参数）
  await h.plugin.webPerform("milestone-rename", projectPath, "完成 MVP");
  fill(h.lastModal(), { name: "MVP 完成" });
  await submit(h, h.lastModal());
  await h.settle();
  assert.ok(String(fm(h, projectPath).milestones).includes("MVP 完成"), "关键节点应真的改名：" + JSON.stringify(fm(h, projectPath).milestones));

  // 分诊草稿（ChoiceModal）
  await h.plugin.webPerform("triage-draft", "00 草稿箱/灵感随手记.md");
  assert.ok(h.lastModal(), "triage-draft 应弹出分诊选择框");
  await choose(h, "短期任务");
  await h.settle();
  assert.ok(exists(h, "50 日程待办/灵感随手记.md"), "分诊应真的把草稿移动到日程待办");

  // 图书归档（ConfirmModal）
  await h.plugin.webPerform("archive-book", "30 知识库/图书库/设计心理学.md");
  await submit(h, h.lastModal(), "归档图书");
  await h.settle();
  assert.ok(exists(h, "90 归档库/图书/设计心理学.md"), "archive-book 应真的归档图书：" + paths(h).filter((p) => p.includes("图书")).join(", "));

  // 删除任务（ConfirmModal）
  await h.plugin.webPerform("delete-task", renamedPath);
  await submit(h, h.lastModal(), "删除任务");
  await h.settle();
  assert.ok(!exists(h, renamedPath), "delete-task 应真的删除文件");

  assert.equal(h.consoleErrors.length, 0, "端到端不应产生错误：" + h.consoleErrors.join(" | "));
});

test("webPerform：项目库根目录的任务不会被当成自己的项目", async () => {
  const h = await setup();
  const bare = h.seedFile("20 项目库/裸任务.md", "---\ntype: task\ntitle: 裸任务\nstatus: todo\nproject: 仪表盘搭建\ndue: 2026-09-30\n---\n\n正文\n");
  await h.settle();
  const calls = [];
  h.plugin.archiveTask = (task, project) => { calls.push([task.file.path, project ? project.file.path : null]); };
  await h.plugin.webPerform("archive-task", bare.path);
  eqJson(calls, [["20 项目库/裸任务.md", "20 项目库/仪表盘搭建/仪表盘搭建.md"]], "应归档到它真正引用的项目，而不是它自己");
});

test("webPerform：失败会抛给宿主适配层（由它提示用户）", async () => {
  const h = await setup();
  h.plugin.archiveTask = () => { throw new Error("boom"); };
  await assert.rejects(() => h.plugin.webPerform("archive-task", "20 项目库/仪表盘搭建/完成首页文案.md"), /boom/, "webPerform 应把失败抛给宿主");
  const source = fs.readFileSync(path.join(PLUGIN_DIR, "main.js"), "utf8");
  assert.ok(source.includes("Promise.resolve(this.plugin.webPerform(action, target, extra)).catch"), "宿主适配层必须接住 perform 的失败");
  /* 同上：不写死命名空间变量名，只断言"失败路径确实弹了 Notice" */
  assert.ok(source.includes('Notice("操作失败："'), "失败应提示用户而不是静默丢弃");
});

test("buildWebPayload：用子文件夹名引用项目的任务也能回填 projectPath", async () => {
  const h = await setup({ seed: false, data: {} });
  const notes = [
    { path: "20 项目库/甲/文件.md", name: "文件", frontmatter: { type: "project", title: "标题" }, body: "" },
    { path: "20 项目库/甲/任务.md", name: "任务", frontmatter: { type: "task", title: "任务", project: "甲", due: "2026-09-30" }, body: "" }
  ];
  const payload = h.helpers.buildWebPayload(notes, h.plugin.settings, {});
  assert.equal(payload.projects[0].total, 1, "任务应计入项目");
  assert.equal(payload.projects[0].taskPaths.length, 1, "taskPaths 必须与 total 一致（同一套匹配规则）");
  assert.equal(payload.tasks[0].projectPath, "20 项目库/甲/文件.md", "任务应回填到项目路径");
});

test("collectWebPayload：frontmatter 以 metadataCache 为准（parseFM 只兜底）", async () => {
  const h = await setup();
  const target = "50 日程待办/整理收件箱.md";
  const original = h.plugin.fm.bind(h.plugin);
  h.plugin.fm = (file) => file.path === target
    ? { type: "task", title: "来自 metadataCache", status: "todo", tags: ["knowledge-gap", "x"] }
    : original(file);
  const payload = await h.plugin.collectWebPayload();
  const note = payload.notes.find((item) => item.path === target);
  const task = payload.tasks.find((item) => item.path === target);
  assert.equal(note.title, "来自 metadataCache");
  assert.equal(task.title, "来自 metadataCache");
  assert.equal(payload.gaps.some((item) => item.path === target), true, "行内数组 tags 应被正确识别为知识缺口");
  assert.equal(payload.live, true);
  assert.ok(payload.notes.every((item) => !item.path.split("/").some((segment) => segment.startsWith("."))), "索引不应包含隐藏目录");
});

test("collectWebPayload：并发调用只跑一次采集", async () => {
  const h = await setup();
  let calls = 0;
  const original = h.plugin.buildWebPayloadNow.bind(h.plugin);
  h.plugin.buildWebPayloadNow = async () => { calls += 1; await new Promise((resolve) => setImmediate(resolve)); return original(); };
  const [a, b] = await Promise.all([h.plugin.collectWebPayload(), h.plugin.collectWebPayload()]);
  assert.equal(calls, 1, "并发刷新应复用同一次采集，实际跑了 " + calls + " 次");
  assert.equal(a, b, "两次调用应返回同一个 payload 对象");
});

test("WebAppView：分屏打开第二个实例时给出明确提示而不是假死", async () => {
  const h = await setup();
  const first = h.workspace.getLeaf();
  await first.setViewState({ type: VIEW.app });
  const second = h.workspace.getLeaf();
  await second.setViewState({ type: VIEW.app });

  assert.ok(h.textOf(second.view.contentEl).includes("单实例"), "第二个实例应给出单实例提示，实际：" + h.textOf(second.view.contentEl));
  assert.equal(h.findByClass(second.view.contentEl, "pp-web-host").length, 0, "第二个实例不应建立外壳");
  assert.equal(h.findByClass(first.view.contentEl, "pp-web-host").length, 1, "第一个实例不受影响");

  await second.view.refresh();
  assert.equal(h.findByClass(second.view.contentEl, "pp-web-host").length, 0, "刷新也不应抢走渲染层");
  assert.equal(h.findByClass(first.view.contentEl, "pp-web-host").length, 1);
});

test("WebAppView：vault 事件不会把正在工作的窗格清成提示页（分屏）", async () => {
  const h = await setup();
  const first = h.workspace.getLeaf();
  await first.setViewState({ type: VIEW.app });
  const second = h.workspace.getLeaf();
  await second.setViewState({ type: VIEW.app });
  assert.equal(h.findByClass(first.view.contentEl, "pp-web-host").length, 1, "前置：第一个窗格已渲染");
  assert.equal(h.findByClass(second.view.contentEl, "pp-web-host").length, 0, "前置：第二个窗格是提示页");

  /* saveSettings 会广播 refreshViews()，对所有 APP_VIEW 调 refresh —— 以前这会把正在工作的窗格也清空 */
  await h.plugin.saveSettings();
  await h.settle();
  assert.equal(h.findByClass(first.view.contentEl, "pp-web-host").length, 1, "工作中的窗格不能被广播清空");
  assert.ok(!h.textOf(first.view.contentEl).includes("单实例"), "工作中的窗格不应变成提示页");
  assert.equal(h.findByClass(second.view.contentEl, "pp-web-host").length, 0, "提示页窗格不应趁机抢渲染层");

  /* 拥有者关闭后，另一个窗格应当接管，而不是永远停在提示页 */
  await first.view.onClose();
  await h.settle();
  assert.equal(h.findByClass(second.view.contentEl, "pp-web-host").length, 1, "拥有者让出后另一个窗格应接管渲染层");
});

test("WebAppView：采集失败后再成功刷新能恢复（不残留错误页）", async () => {
  const h = await setup();
  const leaf = h.workspace.getLeaf();
  await leaf.setViewState({ type: VIEW.app });
  const view = leaf.view;
  const original = view.plugin.collectWebPayload.bind(view.plugin);
  let fail = true;
  view.plugin.collectWebPayload = async () => {
    if (fail) throw new Error("模拟采集失败");
    return original();
  };
  await view.refresh();
  assert.ok(h.textOf(view.contentEl).includes("读取 Vault 失败"), "应显示失败提示");
  fail = false;
  await view.refresh();
  assert.equal(h.findByClass(view.contentEl, "pp-web-host").length, 1, "恢复后必须重建外壳并渲染");
  assert.ok(!h.textOf(view.contentEl).includes("读取 Vault 失败"), "错误提示必须消失");
}, { allowConsoleErrors: true });

test("WebAppView：错误提示不会每轮刷新都往容器里追加", async () => {
  const h = await setup();
  const leaf = h.workspace.getLeaf();
  await leaf.setViewState({ type: VIEW.app });
  const view = leaf.view;
  view.plugin.webApiCache = null;
  view.plugin.webAppError = "模拟加载失败";
  await view.refresh();
  await view.refresh();
  await view.refresh();
  /* 错误页现在包在一个 .pp-view-root 盒子里（里面还有"改用经典视图"的退路按钮），
     所以断言"盒子只有一个、提示只有一份"，而不是数根节点里的 <p>。 */
  const boxes = h.findByClass(view.contentEl, "pp-view-root");
  assert.equal(boxes.length, 1, "错误提示只能有一份，实际：" + boxes.length);
  const paragraphs = boxes[0].children.filter((child) => child.tag === "p");
  assert.equal(paragraphs.length, 1, "错误文案只能有一份，实际：" + paragraphs.length);
  assert.ok(h.textOf(view.contentEl).includes("模拟加载失败"));
  assert.ok(h.textOf(view.contentEl).includes("改用经典视图"), "必须给一条真实可走的退路");
});

test("响应式跟随窗格宽度：宽度断点用容器查询，且滚动目标留有粘性顶栏的留白", async () => {
  const h = await setup({ seed: false, data: {} });
  const raw = readText(path.join(WEB_DIR, "styles.css"));
  const scoped = h.helpers.shadowScopedCss(raw);

  // 1) 宽度断点必须变成容器查询：Obsidian 窗格宽度 ≠ 窗口宽度，@media 在窗格里永远不触发
  assert.ok(!/@media\s*\([^)]*(?:max|min)-width/.test(scoped), "不应残留基于窗口宽度的 @media");
  assert.ok(/@container\s*\(max-width: 1024px\)/.test(scoped), "1024 断点应转为 @container");
  assert.ok(/@container\s*\(max-width: 640px\)/.test(scoped), "640 断点应转为 @container");
  assert.ok(scoped.includes("container-type: inline-size"), "宿主元素必须声明容器类型");
  // 动效偏好不是宽度断点，必须保持 @media
  assert.ok(/@media\s*\(prefers-reduced-motion/.test(scoped), "动效偏好应保持 @media");

  // 2) 切换页签会 scrollIntoView({block:"start"})，scroll-margin-top 必须不小于粘性顶栏高度
  const topbarHeight = Number((raw.match(/\.topbar\s*\{[^}]*min-height:\s*(\d+)px/s) || [])[1]);
  const scrollMargin = Number((raw.match(/\.view\s*\{[\s\S]*?scroll-margin-top:\s*(\d+)px/) || [])[1]);
  assert.ok(topbarHeight >= 40, "应能读出 .topbar 的 min-height，实际：" + topbarHeight);
  assert.ok(scrollMargin >= topbarHeight, "scroll-margin-top(" + scrollMargin + ") 必须 ≥ 顶栏高度(" + topbarHeight + ")，否则内容顶部会被顶栏盖住");
});

/* ----------------------------- 4. 漂移守护 ----------------------------- */

test("main.js 生成区块与 web/app.js + web/styles.css 逐字节一致", async () => {
  const main = normalize(readText(path.join(PLUGIN_DIR, "main.js")));
  const app = normalize(readText(path.join(WEB_DIR, "app.js")));
  const css = normalize(readText(path.join(WEB_DIR, "styles.css")));

  const start = main.indexOf(BLOCK_START);
  const end = main.indexOf(BLOCK_END);
  assert.ok(start > 0, "main.js 应包含生成区块（运行 node tools/sync-app.mjs 生成）");
  assert.ok(end > start, "生成区块的结束标记应存在");
  const block = main.slice(start, end);

  const factoryAt = block.indexOf(FACTORY_LINE);
  assert.ok(factoryAt > 0, "生成区块应包含 ppWebAppFactory");
  const embeddedApp = block.slice(factoryAt + FACTORY_LINE.length, block.indexOf(FACTORY_END)).trim();
  assert.equal(embeddedApp, app.trim(), "内嵌的渲染层与 web/app.js 不一致，请运行 node tools/sync-app.mjs");

  const cssMatch = block.match(/const PP_WEB_CSS = ("[\s\S]*?");\n/);
  assert.ok(cssMatch, "生成区块应包含 PP_WEB_CSS 字符串");
  assert.equal(normalize(JSON.parse(cssMatch[1])), css, "内嵌的设计系统与 web/styles.css 不一致，请运行 node tools/sync-app.mjs");

  assert.ok(block.includes("function ppWebAppFactory"), "生成区块应导出工厂函数");
  assert.ok(!block.includes("tests/"), "生成区块不应引用测试目录");
});

module.exports = { title: "08 Web 渲染层", tests };

/* 2026-09-28：真实 Obsidian 中发现的编辑生命周期回归。 */
async function openEditableAuditProject(h) {
  const context = await openRenderedApp(h);
  const button = context.shell.querySelectorAll('[data-action="detail-project"]')[0];
  await button.dispatch('click');
  const drawer = context.shell.getElementById('drawer');
  return { ...context, drawer, field: drawer.querySelectorAll('[data-field="outcome"]')[0] };
}

test('真实 DOM 契约：Tab 焦点循环不能依赖 NodeList.filter', async () => {
  const h = await setup();
  const { shell, drawer } = await openEditableAuditProject(h);
  const query = drawer.querySelectorAll.bind(drawer);
  const focusables = query('button, [href], input, select, textarea, [tabindex]').filter(el => !el.disabled && el.getAttribute('tabindex') !== '-1');
  drawer.querySelectorAll = selector => {
    const nodes = query(selector);
    return Object.assign({ length: nodes.length }, nodes); // 原生 NodeList 没有数组的 filter
  };
  focusables[focusables.length - 1].focus();
  await shell.dispatch('keydown', { key: 'Tab', target: focusables[focusables.length - 1] });
  assert.equal(shell.activeElement, focusables[0]);
  await shell.dispatch('keydown', { key: 'Tab', shiftKey: true, target: focusables[0] });
  assert.equal(shell.activeElement, focusables[focusables.length - 1]);
});

test('数据刷新不得替换正在编辑的字段或覆盖未提交草稿', async () => {
  const h = await setup();
  const { leaf, drawer, field } = await openEditableAuditProject(h);
  field.focus();
  field.value = '未提交草稿：方案 A/B';
  await field.dispatch('input');
  await leaf.view.refresh();
  assert.equal(drawer.querySelectorAll('[data-field="outcome"]')[0].value, '未提交草稿：方案 A/B');
  assert.ok(drawer.querySelectorAll('[data-field="outcome"]')[0] === field, '保留原生控件才能保住选区、撤销栈和 IME 会话');
});

test('多行字段和 contenteditable 中的斜杠不触发全局搜索', async () => {
  const h = await setup();
  const { leaf, shell, drawer, field } = await openEditableAuditProject(h);
  field.focus();
  await shell.dispatch('keydown', { key: '/', target: field });
  assert.equal(drawer.hidden, false, '斜杠不能关闭编辑中的详情');
  assert.equal(leaf.view.mounted.state.view, 'overview');
  const editor = drawer.createEl('div');
  editor.isContentEditable = true;
  editor.focus();
  await shell.dispatch('keydown', { key: '/', target: editor });
  assert.equal(drawer.hidden, false);
  assert.equal(leaf.view.mounted.state.view, 'overview');
});

test('搜索的旧防抖定时器不得打断后续中文组词', async () => {
  const h = await setup();
  const { leaf, shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find(el => el.getAttribute('data-view') === 'tasks').dispatch('click');
  const search = shell.getElementById('q');
  search.focus();
  search.value = 'a';
  await search.dispatch('input');
  await search.dispatch('compositionstart');
  search.value = 'a中文';
  await search.dispatch('input', { isComposing: true });
  await h.settle();
  assert.ok(shell.getElementById('q') === search, '组词期间旧定时器不能重建输入框');
  await leaf.view.refresh();
  assert.ok(shell.getElementById('q') === search, '组词期间后台数据更新也不能重建输入框');
  await search.dispatch('compositionend');
  await h.settle();
  assert.equal(shell.getElementById('q').value, 'a中文');
  assert.equal(leaf.view.mounted.state.filters.query, 'a中文');
});

test('输入法处理 Escape 时不得关闭抽屉', async () => {
  const h = await setup();
  const { shell, drawer, field } = await openEditableAuditProject(h);
  field.focus();
  await shell.dispatch('keydown', { key: 'Escape', isComposing: true, target: field });
  assert.equal(drawer.hidden, false);
  await shell.dispatch('keydown', { key: 'Escape', keyCode: 229, target: field });
  assert.equal(drawer.hidden, false);
  await shell.dispatch('keydown', { key: 'Escape', target: field });
  assert.equal(drawer.hidden, true, '普通 Escape 仍应关闭');
});

test('编辑保护结束后补刷新，但不得把焦点抢回上次提交的字段', async () => {
  const h = await setup();
  const { leaf, shell, drawer, field } = await openEditableAuditProject(h);
  const api = leaf.view.mounted;
  field.focus();
  const data = await h.plugin.collectWebPayload();
  const project = data.projects.find(item => item.path === api.state.drawer.path);
  project.outcome = '外部更新';
  project.frontmatter.outcome = '外部更新';
  api.setData(data);
  assert.ok(drawer.querySelectorAll('[data-field="outcome"]')[0] === field);
  api.state.lastEditedField = { key: 'outcome', path: project.path, index: null };
  drawer.querySelectorAll('.drawer-close')[0].focus();
  await field.dispatch('focusout');
  await h.settle();
  const refreshed = drawer.querySelectorAll('[data-field="outcome"]')[0];
  assert.ok(refreshed !== field, '离开编辑区域后应消费待刷新数据');
  assert.ok(shell.activeElement !== refreshed, '不能用旧字段记录抢回焦点');
  assert.ok(drawer.innerHTML.includes('外部更新'));
});

test('聚焦编辑时条目已被删除仍应关闭旧详情', async () => {
  const h = await setup();
  const { leaf, drawer, field } = await openEditableAuditProject(h);
  field.focus();
  field.value = '未提交';
  const data = await h.plugin.collectWebPayload();
  data.projects = data.projects.filter(item => item.path !== leaf.view.mounted.state.drawer.path);
  leaf.view.mounted.setData(data);
  assert.equal(drawer.hidden, true, '编辑保护不能延长已删除条目的寿命');
  assert.equal(leaf.view.mounted.state.drawer, null);
});

test('连续编辑：保存上一字段后的异步刷新不能覆盖下一字段草稿', async () => {
  const h = await setup();
  const { leaf, shell, drawer, field } = await openEditableAuditProject(h);
  const acceptance = drawer.querySelectorAll('[data-field="acceptance"]')[0];
  field.focus();
  field.value = '新的最终结果';
  await field.dispatch('change');
  acceptance.focus();
  acceptance.value = '正在编写的验收标准';
  await acceptance.dispatch('input');
  await h.settle();
  assert.ok(drawer.querySelectorAll('[data-field="acceptance"]')[0] === acceptance);
  assert.equal(acceptance.value, '正在编写的验收标准');
  assert.ok(shell.activeElement === acceptance);
  const project = h.vault.getAbstractFileByPath(leaf.view.mounted.state.drawer.path);
  assert.equal(h.plugin.fm(project).outcome, '新的最终结果');
  await acceptance.dispatch('change');
  await h.settle();
  assert.equal(h.plugin.fm(project).acceptance, '正在编写的验收标准');
});

/* 2026-09-28 状态更新：真实 Obsidian 的磁盘写入与 metadataCache changed 不同步。 */
test('更新项目状态：元数据晚于磁盘更新时，缓存和详情仍应收敛到新状态', async () => {
  const h = await setup();
  const { leaf, drawer } = await openEditableAuditProject(h);
  const projectPath = leaf.view.mounted.state.drawer.path;
  const file = h.vault.getAbstractFileByPath(projectPath);
  const getCache = h.metadataCache.getFileCache.bind(h.metadataCache);
  const old = JSON.parse(JSON.stringify(getCache(file)));
  let indexed = false;
  h.metadataCache.getFileCache = candidate => candidate.path === projectPath && !indexed
    ? JSON.parse(JSON.stringify(old)) : getCache(candidate);
  h.plugin.projectStatus(file);
  await choose(h, '暂停');
  assert.equal(fm(h, projectPath).status, 'paused', '实际写入必须已经成功');
  // Obsidian 在文件保存之后才完成索引；此时 mtime/size 不会再改变。
  indexed = true;
  h.metadataCache.emit('changed', file);
  await h.settle();
  assert.equal(h.metadataCache.getFileCache(file).frontmatter.status, 'paused');
  assert.equal(leaf.view.mounted.state.data.projects.find(item => item.path === projectPath).status, 'paused', '界面数据不能永久保留旧状态');
  assert.equal(drawer.querySelectorAll('.chip')[0].getAttribute('data-status'), 'paused', '详情状态应与已保存的笔记一致');
});

test('正文缓存命中时也必须使用最新元数据，不能为刷新状态重读全文', async () => {
  const h = await setup();
  const file = h.vault.getAbstractFileByPath('20 项目库/仪表盘搭建/仪表盘搭建.md');
  const first = await h.plugin.readManagedNote(file);
  const getCache = h.metadataCache.getFileCache.bind(h.metadataCache);
  h.metadataCache.getFileCache = candidate => candidate === file
    ? { frontmatter: { ...first.frontmatter, status: 'blocked', outcome: '新的结果', milestones: ['新节点'] } }
    : getCache(candidate);
  let reads = 0;
  const read = h.vault.cachedRead.bind(h.vault);
  h.vault.cachedRead = async candidate => { reads++; return read(candidate); };
  const next = await h.plugin.readManagedNote(file);
  assert.equal(next.frontmatter.status, 'blocked');
  assert.equal(next.frontmatter.outcome, '新的结果');
  eqJson(next.frontmatter.milestones, ['新节点']);
  assert.equal(next.body, first.body);
  assert.equal(reads, 0, '正文缓存应继续复用，不能每次状态刷新都重读文件');
});

test('读取正文期间索引更新，不得把 await 之前的状态写回缓存', async () => {
  const h = await setup();
  const file = h.vault.getAbstractFileByPath('20 项目库/仪表盘搭建/仪表盘搭建.md');
  const getCache = h.metadataCache.getFileCache.bind(h.metadataCache);
  const old = getCache(file);
  let indexed = false;
  h.metadataCache.getFileCache = candidate => candidate === file
    ? { frontmatter: { ...old.frontmatter, status: indexed ? 'completed' : 'active' } }
    : getCache(candidate);
  const read = h.vault.cachedRead.bind(h.vault);
  h.vault.cachedRead = async candidate => { const raw = await read(candidate); if (candidate === file) indexed = true; return raw; };
  h.plugin.invalidateNoteCache(file);
  const note = await h.plugin.readManagedNote(file);
  assert.equal(note.frontmatter.status, 'completed', '返回值应采用读取完成时的最新索引');
  assert.equal(h.plugin.noteCache.get(file.path).frontmatter.status, 'completed', '缓存里也不能回填旧快照');
});

/* ------------------- 9. 重复模式（参考谷歌日历）：周几 / 几号 / 序列结束日 ------------------- */

test('buildWebPayload：重复模式（周几 / 几号 / 序列结束日）随 payload 一起出来', async () => {
  const h = await setup({ seed: false });
  h.seedFile('50 日程待办/周三复盘.md', '---\ntype: task\ntitle: 周三复盘\nstatus: todo\ndue: 2026-10-07\nrecurrence: weekly\nrecurrence_weekdays: [3]\nrecurrence_until: 2026-12-31\n---\n');
  h.seedFile('50 日程待办/月末结算.md', '---\ntype: task\ntitle: 月末结算\nstatus: todo\ndue: 2026-10-31\nrecurrence: monthly\nrecurrence_monthday: 31\n---\n');
  const payload = await h.plugin.collectWebPayload();

  const weekly = payload.tasks.find((task) => task.title === '周三复盘');
  assert.equal(weekly.recurrence, 'weekly');
  eqJson(weekly.recurrenceWeekdays, [3], '每周的周几要随 payload 出来');
  assert.equal(weekly.recurrenceUntil, '2026-12-31', '序列结束日 = 重复任务的 DDL');
  assert.equal(weekly.recurrenceMonthDay, 0, '每周任务没有几号');

  const monthly = payload.tasks.find((task) => task.title === '月末结算');
  assert.equal(monthly.recurrenceMonthDay, 31);
  eqJson(monthly.recurrenceWeekdays, [], '每月任务没有周几');
  assert.equal(monthly.recurrenceUntil, '', '没设结束日 = 永不结束');
});

test('Web 抽屉：每周给出 7 个周几复选框，勾选整组写回数组；非重复任务不显示这些字段', async () => {
  const h = await setup({ seed: false });
  h.seedFile('50 日程待办/周三复盘.md', '---\ntype: task\ntitle: 周三复盘\nstatus: todo\ndue: 2026-10-07\nrecurrence: weekly\nrecurrence_weekdays: [3]\nrecurrence_until: 2026-12-31\n---\n');
  h.seedFile('50 日程待办/普通任务.md', '---\ntype: task\ntitle: 普通任务\nstatus: todo\ndue: 2026-10-01\n---\n');
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute('data-view') === 'tasks').dispatch('click');
  await h.settle();

  const openDetail = async (path) => {
    await shell.querySelectorAll('[data-action="detail-task"]').find((el) => el.getAttribute('data-path') === path).dispatch('click');
    await h.settle();
    return shell.getElementById('drawer');
  };

  /* 每周任务：7 个复选框；勾选来自 frontmatter；不出现「每月几号」 */
  let drawer = await openDetail('50 日程待办/周三复盘.md');
  const boxes = drawer.querySelectorAll('[data-field="recurrence_weekdays"]');
  assert.equal(boxes.length, 7, '每周应给出 7 个周几复选框');
  eqJson(boxes.filter((box) => box.checked).map((box) => box.value), ['3'], '勾选状态来自 frontmatter');
  assert.ok(drawer.querySelectorAll('[data-field="recurrence_until"]').length, '重复结束日应可编辑');
  assert.equal(drawer.querySelectorAll('[data-field="recurrence_monthday"]').length, 0, '每周时不该出现「每月几号」');
  assert.ok(drawer.querySelectorAll('[data-field="due"]').length, 'DDL 始终可编辑（重复任务的它是本次执行日）');

  /* 勾上周五 → 整组写回；原来勾着的周三不能被清掉 */
  boxes.find((box) => box.value === '5').checked = true;
  await boxes.find((box) => box.value === '5').dispatch('change');
  await h.settle();
  const file = h.vault.getFiles().find((item) => item.path === '50 日程待办/周三复盘.md');
  eqJson(h.plugin.fm(file).recurrence_weekdays, [3, 5], '多选必须整组写回成数组');

  /* 非重复任务：周几 / 重复结束日都不该出现 */
  drawer = await openDetail('50 日程待办/普通任务.md');
  assert.equal(drawer.querySelectorAll('[data-field="recurrence_weekdays"]').length, 0, '非重复任务不该出现周几');
  assert.equal(drawer.querySelectorAll('[data-field="recurrence_until"]').length, 0, '非重复任务不该出现重复结束日');
  assert.ok(drawer.querySelectorAll('[data-field="due"]').length, '非重复任务的 DDL 仍可编辑');
});

/* ------------------------- 10. 已完成的任务留在列表里 ------------------------- */

test('任务页签：已完成的任务打删除线、留在原任务组里、沉到组底（不再消失）', async () => {
  const h = await setup({ seed: false });
  h.seedFile('50 日程待办/还没做.md',
    '---\ntype: task\ntitle: 还没做\nstatus: todo\ntask_set: 本周维护\ntask_group: 执行\ndue: 2026-10-01\n---\n');
  h.seedFile('50 日程待办/已经做完.md',
    '---\ntype: task\ntitle: 已经做完\nstatus: done\ntask_set: 本周维护\ntask_group: 执行\ndue: 2026-09-01\n---\n');
  h.seedFile('50 日程待办/归档掉的.md',
    '---\ntype: task\ntitle: 归档掉的\nstatus: archived\ntask_set: 本周维护\ntask_group: 执行\ndue: 2026-08-01\n---\n');
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute('data-view') === 'tasks').dispatch('click');
  await h.settle();
  const view = shell.getElementById('view');
  const rows = view.querySelectorAll('.task-row');
  const titles = rows.map((row) => row.querySelectorAll('.task-title')[0].textContent);

  assert.ok(titles.includes('已经做完'), '已完成的任务必须留在列表里，实际：' + titles.join('、'));
  assert.ok(!titles.includes('归档掉的'), '真正归档过的不进任务页签');
  assert.equal(
    rows.find((row) => row.querySelectorAll('.task-title')[0].textContent === '已经做完').className.includes('is-done'), true,
    '已完成的任务要带 is-done（删除线 + 灰字由它表达）',
  );
  assert.ok(
    titles.indexOf('已经做完') > titles.indexOf('还没做'),
    '已完成的要沉到同一个任务组的最底下，实际顺序：' + titles.join('、'),
  );
  /* 已完成的任务不该再喊「逾期 N 天」——它已经做完了 */
  const doneRow = rows.find((row) => row.querySelectorAll('.task-title')[0].textContent === '已经做完');
  assert.ok(!doneRow.textContent.includes('逾期'), '已完成的任务不显示逾期，实际：' + doneRow.textContent);
  assert.ok(
    view.querySelectorAll('[data-action="switch-view"]').some((el) => el.getAttribute('data-view') === 'data'),
    '归档过的仍要给一条去「数据」页签的入口',
  );
});

/* ------------------ 11. 重复任务：完成 = 推进周期（不标已完成），且可撤销 ------------------ */

test('任务行：重复任务点「完成」只把截止时间推到下个周期，不标已完成，并能就地撤销', async () => {
  const h = await setup({ seed: false });
  const taskPath = '50 日程待办/每周复盘.md';
  h.seedFile(taskPath,
    '---\ntype: task\ntitle: 每周复盘\nstatus: todo\ntask_set: 本周维护\ntask_group: 复盘\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1, 3]\n---\n\n## 执行记录\n\n');
  const { shell } = await openRenderedApp(h);
  await shell.querySelectorAll('[data-action="switch-view"]').find((el) => el.getAttribute('data-view') === 'tasks').dispatch('click');
  await h.settle();

  const view = () => shell.getElementById('view');
  const row = () => view().querySelectorAll('.task-row').find((item) => item.textContent.includes('每周复盘'));
  const file = () => h.vault.getFiles().find((item) => item.path === taskPath);
  const undoButtons = () => row().querySelectorAll('[data-action="undo-recurring-completion"]');

  assert.equal(row().className.includes('is-done'), false, '前置：这条还没完成');
  assert.equal(undoButtons().length, 0, '前置：没有可撤销的东西');

  await row().querySelectorAll('[data-action="set-task-status"]').find((b) => b.getAttribute('data-name') === 'done').dispatch('click');
  await h.settle();
  assert.equal(h.plugin.fm(file()).due, '2026-09-30', '「已完成」= 截止时间跳到下个周期（周三）');
  assert.equal(h.plugin.fm(file()).status, 'todo', '状态仍然回到待办');
  assert.equal(row().className.includes('is-done'), false, '不标已完成、也不打删除线');
  assert.equal(row().getAttribute('data-status'), 'todo', '行上的状态就是待办');

  /* 完成过的这条任务上出现「撤销」，点了就回到点击之前 */
  assert.equal(undoButtons().length, 1, '最近完成过的那条任务上应出现「撤销」');
  assert.equal(String(undoButtons()[0].textContent).trim(), '撤销');
  await undoButtons()[0].dispatch('click');
  await h.settle();
  assert.equal(h.plugin.fm(file()).due, '2026-09-28', '撤销把截止时间放回去');
  assert.equal(h.plugin.fm(file()).status, 'todo', '状态也回到点击之前');
  assert.equal(undoButtons().length, 0, '撤销过之后按钮消失（只保留最近一次）');
  assert.ok(!h.vault.__readRaw(taskPath).includes('本周期完成'), '刚写进去的执行记录也撤掉');
});
