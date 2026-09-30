"use strict";
/** 视图渲染层：仪表盘 / 草稿箱 / 日程待办 / 资源 / 单项目页面 */
const assert = require("node:assert/strict");
const { test, tests, setup, eqJson } = require("../util");
const { VIEW, openModal, fill, submit, choose } = require("../drive");

async function openDashboard(h) {
  const leaf = await h.openView(VIEW.dashboard);
  await h.settle();
  return { leaf, root: leaf.containerEl.children[1] };
}

test("经典视图兜底：命令能真的打开原生仪表盘", async () => {
  const h = await setup();
  const command = h.plugin.__commands.find((item) => item.id === "open-classic-views");
  assert.ok(command, "应注册「打开经典视图（排错用）」命令：Web 渲染层坏掉时这是唯一退路");
  await command.callback();
  await h.settle();
  const leaves = h.workspace.getLeavesOfType(VIEW.dashboard);
  assert.equal(leaves.length, 1, "应打开原生仪表盘视图");
  assert.ok(h.textOf(leaves[0].view.contentEl).includes("个人规划仪表盘"), "经典视图应真的渲染出来，实际：" + h.textOf(leaves[0].view.contentEl).slice(0, 80));
});

test("仪表盘首页渲染全部卡片且无错误", async () => {
  const h = await setup();
  const { root } = await openDashboard(h);
  assert.equal(h.consoleErrors.length, 0, "渲染不应产生错误：" + h.consoleErrors.join(" | "));
  assert.equal(h.findByClass(root, "pp-dashboard-hero").length, 1);
  assert.equal(h.findByClass(root, "pp-overview").length, 1);
  assert.equal(h.findByClass(root, "pp-stat-card").length, 4);
  assert.equal(h.findByClass(root, "pp-focus-strip").length, 1);
  assert.equal(h.findByClass(root, "pp-waypoint").length, 3);
  assert.equal(h.findByClass(root, "pp-panel").length, 5, "项目 / 时间监控 / 今日任务监控 / 分诊 / 知识缺口");
  assert.equal(h.findByClass(root, "pp-navigation").length, 1);
  const text = h.textOf(root);
  ["个人规划仪表盘", "项目推演", "时间监控", "今日任务监控", "知识缺口 / 学习计划", "今日焦点"].forEach((label) => {
    assert.ok(text.includes(label), "仪表盘缺少文本：" + label);
  });
});

test("仪表盘横幅使用素材并在素材缺失时回退", async () => {
  const h = await setup();
  let { root } = await openDashboard(h);
  assert.equal(h.findByClass(root, "pp-dashboard-hero")[0].style.backgroundImage, undefined, "素材不存在时不应设置背景图");
  h.plugin.settings.heroImage = "图片素材/示例.png";
  ({ root } = await openDashboard(h));
  assert.ok(String(h.findByClass(root, "pp-dashboard-hero")[0].style.backgroundImage).includes("app://vault/"), "素材存在时应设置背景图");
});

test("使用插件真实 data.json 配置时仪表盘正常工作", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dataPath = path.join(__dirname, "..", "..", "data.json");
  /* data.json 是 Obsidian 运行时写的设置文件、含本机库的目录名，**不进版本控制**：
     本机有它就按真实配置跑，没有（例如刚克隆下来）就用同形状的样例配置 ——
     这条用例守的是"真实配置形状下（heroImage 省略扩展名等）仪表盘照常工作"。 */
  const realSettings = fs.existsSync(dataPath)
    ? JSON.parse(fs.readFileSync(dataPath, "utf8"))
    : {
        projectFolder: "20 项目库",
        taskFolder: "50 日程待办",
        inboxFolder: "00 草稿箱",
        archiveFolder: "90 归档库",
        knowledgeFolder: "30 知识库",
        bookFolder: "30 知识库/图书库",
        areaFolder: "10 长期领域",
        peopleFolder: "40 人物库",
        assetFolder: "图片素材",
        defaultTaskDuration: 30,
        planningHorizonDays: 7,
        dailyCapacityMinutes: 120,
        remindersEnabled: true,
        reminderHour: 9,
        heroImage: "图片素材/示例横幅",
        waypointImages: {},
      };
  const h = await setup({ seed: false, data: realSettings });
  // 用户设置里的 heroImage 省略了扩展名，插件必须能解析到真实文件
  h.seedFile(realSettings.heroImage + ".jpg", "");
  h.seedFile("50 日程待办/日程待办.md", "---\ntype: task-index\ntitle: 日程待办\nstatus: planning\n---\n");
  h.seedFile("20 项目库/仪表盘搭建/仪表盘搭建.md", "---\ntype: project\ntitle: 仪表盘搭建\nstatus: active\ndeadline: 2026-10-01\nmilestones:\n  - 未分组\n  - 111\n---\n");
  h.seedFile("20 项目库/仪表盘搭建/111.md", "---\ntype: task\ntitle: \"111\"\nstatus: planning\nproject: 20 项目库/仪表盘搭建/仪表盘搭建.md\nmilestone: \"111\"\ndue: \"\"\nduration: 30\npriority: medium\n---\n\n## 任务拆解\n");
  h.seedFile("00 草稿箱/111.md", "");
  h.seedFile("10 长期领域/关于我.md", "---\ntype: area\ntitle: 关于我\n---\n");

  const { root } = await openDashboard(h);
  assert.equal(h.plugin.settings.dailyCapacityMinutes, realSettings.dailyCapacityMinutes);
  assert.ok(String(h.findByClass(root, "pp-dashboard-hero")[0].style.backgroundImage).includes(encodeURI(realSettings.heroImage + ".jpg")), "省略扩展名的横幅素材应被解析");
  assert.equal(h.consoleErrors.length, 0, "真实配置下渲染不应报错：" + h.consoleErrors.join(" | "));

  const data = await h.plugin.collectData();
  assert.equal(data.projects.length, 1);
  assert.equal(data.tasks.length, 1, "索引页不应被当成任务");
  assert.equal(data.tasks[0].frontmatter.title, "111");
  assert.equal(data.inbox.length, 1);
});

test("空库时仪表盘显示初始化引导", async () => {
  const h = await setup({ seed: false });
  const { root } = await openDashboard(h);
  assert.equal(h.findByClass(root, "pp-onboarding").length, 1);
  assert.ok(h.textOf(root).includes("初始化目录结构"));
  await h.clickText(root, "初始化目录结构");
  await h.settle();
  assert.ok(h.vault.getAbstractFileByPath("20 项目库"));
});

test("导航按钮打开对应视图且高亮当前页", async () => {
  const h = await setup();
  const navButton = (root, label) => h.findText(root, label).find((node) => node.tag === "button");
  const { root } = await openDashboard(h);
  const nav = h.findByClass(root, "pp-navigation")[0];
  assert.equal(navButton(nav, "仪表盘").getAttr("aria-current"), "page");
  assert.equal(navButton(nav, "草稿箱").getAttr("aria-current"), "false");
  await h.clickText(nav, "草稿箱");
  assert.equal(h.workspace.getLeavesOfType(VIEW.inbox).length, 1, "点击导航应打开草稿箱视图");
  const inboxLeaf = h.workspace.getLeavesOfType(VIEW.inbox)[0];
  const inboxNav = h.findByClass(inboxLeaf.containerEl.children[1], "pp-navigation")[0];
  assert.equal(navButton(inboxNav, "草稿箱").getAttr("aria-current"), "page");
  await h.clickText(inboxNav, "日程待办");
  assert.equal(h.workspace.getLeavesOfType(VIEW.tasks).length, 1);
  await h.clickText(h.findByClass(h.workspace.getLeavesOfType(VIEW.tasks)[0].containerEl.children[1], "pp-navigation")[0], "长期领域");
  assert.equal(h.workspace.getLeavesOfType(VIEW.resources).length, 1);
});

test("激活同一视图不会重复创建 leaf", async () => {
  const h = await setup();
  await h.plugin.activateDashboard();
  await h.plugin.activateDashboard();
  await h.settle();
  assert.equal(h.workspace.getLeavesOfType(VIEW.dashboard).length, 1);
  await h.plugin.activateInbox();
  await h.plugin.activateInbox();
  assert.equal(h.workspace.getLeavesOfType(VIEW.inbox).length, 1);
  await h.plugin.activateTasks();
  await h.plugin.activateTasks();
  assert.equal(h.workspace.getLeavesOfType(VIEW.tasks).length, 1);
  await h.plugin.activateResources("knowledge");
  await h.plugin.activateResources("knowledge");
  assert.equal(h.workspace.getLeavesOfType(VIEW.resources).length, 1);
});

test("草稿箱视图列出全部草稿并可分诊", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.inbox);
  await h.settle();
  const root = leaf.containerEl.children[1];
  assert.equal(h.findByClass(root, "pp-inbox-card").length, 2);
  assert.equal(h.consoleErrors.length, 0, h.consoleErrors.join(" | "));
  await h.clickText(root, "周维护导入任务集");
  await h.settle();
  assert.ok(h.lastModal(), "应打开周维护选择窗口");
});

test("草稿箱为空时显示空状态", async () => {
  const h = await setup();
  h.vault.delete(h.vault.getAbstractFileByPath("00 草稿箱/灵感随手记.md"));
  h.vault.delete(h.vault.getAbstractFileByPath("00 草稿箱/待分诊.md"));
  const leaf = await h.openView(VIEW.inbox);
  await h.settle();
  const root = leaf.containerEl.children[1];
  assert.ok(h.textOf(root).includes("草稿箱为空"));
  assert.equal(h.findByClass(root, "pp-inbox-card").length, 0);
});

test("日程待办按任务集 → 任务组 → 任务渲染", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.tasks);
  await h.settle();
  const root = leaf.containerEl.children[1];
  assert.equal(h.consoleErrors.length, 0, h.consoleErrors.join(" | "));
  const sets = h.findByClass(root, "pp-task-set");
  assert.equal(sets.length, 2, "本周维护 + 未分配任务集");
  assert.ok(h.textOf(root).includes("本周维护"));
  assert.ok(h.textOf(root).includes("资料整理"));
  /* 夹具任务的 DDL 都在 7 天内或已过期（整理收件箱没写 duration），因此都不应出现拆解建议 */
  const suggested = h.findByClass(root, "pp-task-list-row").filter((row) => h.textOf(row).includes("建议拆解"));
  assert.equal(suggested.length, 0, "不应出现「建议拆解」标记");
  assert.equal(h.findByClass(root, "pp-filter-select").length, 4);
  assert.equal(h.findByClass(root, "pp-task-list-row").length, 4);
});

test("日程待办：已完成的任务留在原任务组里、带 pp-task-done、并沉到组底", async () => {
  const h = await setup({ seed: false });
  h.seedFile("50 日程待办/还没做.md", "---\ntype: task\ntitle: 还没做\nstatus: todo\ntask_set: 本周维护\ntask_group: 执行\ndue: 2026-10-01\n---\n");
  h.seedFile("50 日程待办/已经做完.md", "---\ntype: task\ntitle: 已经做完\nstatus: done\ntask_set: 本周维护\ntask_group: 执行\ndue: 2026-09-01\n---\n");
  const leaf = await h.openView(VIEW.tasks);
  await h.settle();
  const root = leaf.containerEl.children[1];
  const rows = h.findByClass(root, "pp-task-list-row");
  const titles = rows.map((row) => h.textOf(row));
  assert.equal(rows.length, 2, "已完成的任务不该从列表里消失");
  assert.equal(h.findByClass(root, "pp-task-done").length, 1, "已完成的那条要带 pp-task-done（删除线 + 灰字）");
  assert.ok(
    titles.findIndex((text) => text.includes("已经做完")) > titles.findIndex((text) => text.includes("还没做")),
    "已完成的要沉到同一个任务组的最底下，实际顺序：" + titles.join(" / "),
  );
  assert.equal(h.consoleErrors.length, 0, h.consoleErrors.join(" | "));
});

test("日程待办筛选：搜索、任务集、状态与失效筛选回落", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.tasks);
  await h.settle();
  const view = leaf.view;
  let root = leaf.containerEl.children[1];

  view.filters = Object.assign({}, view.filters, { query: "整理" });
  await view.refresh(true);
  root = leaf.containerEl.children[1];
  assert.equal(h.findByClass(root, "pp-task-list-row").length, 1, "搜索应只剩一条");
  assert.ok(h.findByClass(root, "pp-filter-search")[0].focused, "搜索刷新后应恢复焦点");

  view.filters = { query: "", taskSet: "本周维护", taskGroup: "all", status: "all" };
  await view.refresh();
  root = leaf.containerEl.children[1];
  assert.equal(h.findByClass(root, "pp-task-list-row").length, 2);

  view.filters = { query: "", taskSet: "不存在的任务集", taskGroup: "all", status: "all" };
  await view.refresh();
  root = leaf.containerEl.children[1];
  assert.equal(h.findByClass(root, "pp-task-list-row").length, 4, "失效的筛选值应回落为全部，而不是空列表");
  assert.equal(view.filters.taskSet, "all");
});

test("日程待办：无任务时给出下一步指引", async () => {
  const h = await setup({ seed: false });
  const leaf = await h.openView(VIEW.tasks);
  await h.settle();
  const root = leaf.containerEl.children[1];
  assert.ok(h.textOf(root).includes("没有待办任务"));
  assert.ok(h.textOf(root).includes("新建任务"));
});

test("资源视图：长期领域 / 知识 / 人物 / 关于我 / 财富", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.resources, { category: "knowledge" });
  await h.settle();
  const root = leaf.containerEl.children[1];
  assert.equal(h.findByClass(root, "pp-resource-section").length, 3, "知识笔记 / 图书 / 视频");
  assert.ok(h.textOf(root).includes("设计心理学"));
  await h.clickText(root, "阅读完成并归档");
  await h.settle();
  await submit(h, h.lastModal(), "归档图书");
  assert.ok(h.vault.getAbstractFileByPath("90 归档库/图书/设计心理学.md"));

  await h.plugin.activateResources("areas");
  await h.settle();
  const areasRoot = h.workspace.getLeavesOfType(VIEW.resources)[0].containerEl.children[1];
  assert.ok(h.textOf(areasRoot).includes("长期领域"));
  assert.ok(h.textOf(areasRoot).includes("关联项目"));

  await h.plugin.activateResources("people");
  await h.settle();
  assert.ok(h.textOf(h.workspace.getLeavesOfType(VIEW.resources)[0].containerEl.children[1]).includes("同事"));
});

test("关于我与财富是独立状态与独立面板", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.resources, { category: "about" });
  await h.settle();
  let root = leaf.containerEl.children[1];
  assert.equal(leaf.view.category, "about");
  assert.equal(h.findByClass(root, "pp-personal-panel").length, 1);
  assert.ok(h.textOf(root).includes("关于我"));
  await h.clickText(root, "创建并打开笔记");
  await h.settle();
  assert.ok(h.vault.getAbstractFileByPath("10 长期领域/关于我.md"), "应创建关于我笔记");

  await h.plugin.activateResources("wealth");
  await h.settle();
  const wealthLeaf = h.workspace.getLeavesOfType(VIEW.resources)[0];
  root = wealthLeaf.containerEl.children[1];
  assert.equal(wealthLeaf.view.category, "wealth");
  assert.equal(h.findByClass(root, "pp-personal-panel").length, 1);
  assert.ok(h.textOf(root).includes("财富"));
  await h.clickText(root, "创建并打开笔记");
  await h.settle();
  assert.ok(h.vault.getAbstractFileByPath("10 长期领域/财富.md"));

  await wealthLeaf.view.setState({ category: "personal" });
  assert.equal(wealthLeaf.view.category, "about", "旧的 personal 状态应迁移到 about");
});

test("单项目页面渲染摘要、详情、阻塞项与任务追踪", async () => {
  const h = await setup();
  const project = (await h.plugin.collectData()).projects[0];
  const leaf = await h.openView(VIEW.project, { path: project.file.path });
  await h.settle();
  const root = leaf.containerEl.children[1];
  assert.equal(h.consoleErrors.length, 0, "项目页不应抛错：" + h.consoleErrors.join(" | "));
  assert.equal(h.findByClass(root, "pp-project-summary").length, 1);
  assert.equal(h.findByClass(root, "pp-detail-card").length, 2);
  assert.equal(h.findByClass(root, "pp-blockers-section").length, 0, "独立阻塞项卡片已被移除：阻塞是任务的状态");
  assert.equal(h.findByClass(root, "pp-task-tracking-card").length, 1, "任务追踪卡片必须存在");
  assert.equal(h.findByClass(root, "pp-milestone-tab").length, 2, "未分组 + 完成 MVP");
  assert.equal(h.findByClass(root, "pp-task-item").length, 1, "默认只展示首个关键节点下的任务");
  const text = h.textOf(root);
  ["完成度", "已完成任务", "DDL", "资源约束", "任务追踪", "项目运行提示"].forEach((label) => {
    assert.ok(text.includes(label), "项目页缺少文本：" + label);
  });
});

test("单项目页面：关键节点标签切换只显示该节点任务", async () => {
  const h = await setup();
  const project = (await h.plugin.collectData()).projects[0];
  const leaf = await h.openView(VIEW.project, { path: project.file.path });
  await h.settle();
  const root = leaf.containerEl.children[1];
  await h.clickText(root, "完成 MVP");
  await h.settle();
  assert.equal(leaf.view.activeMilestone, "完成 MVP");
  assert.equal(h.findByClass(leaf.containerEl.children[1], "pp-task-item").length, 1);
  assert.ok(h.textOf(leaf.containerEl.children[1]).includes("完成首页文案"));
});

test("单项目页面：阻塞是任务的状态，页面不再有独立阻塞项卡片", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const project = data.projects[0];
  const task = data.allTasks.find((item) => h.plugin.findProject(item, data.projects));
  const leaf = await h.openView(VIEW.project, { path: project.file.path });
  await h.settle();
  let root = leaf.containerEl.children[1];
  assert.equal(h.findByClass(root, "pp-blockers-section").length, 0, "独立阻塞项卡片不该再存在");

  /* 把任务设成阻塞 → frontmatter.status 落盘，刷新后项目页给出阻塞提示 */
  await h.plugin.setTaskStatus(task, "blocked");
  await h.settle();
  assert.equal(h.plugin.fm(task.file).status, "blocked");
  await leaf.view.refresh();
  root = leaf.containerEl.children[1];
  const text = h.textOf(root);
  assert.ok(text.includes("阻塞"), "项目页应显示阻塞提示，实际：" + text.slice(0, 160));

  /* 再切到"完成"：状态是四选一，切走即解除阻塞（不用改 DDL） */
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();
  assert.equal(h.plugin.fm(task.file).status, "done");
  assert.equal(h.vault.__readRaw(project.file.path).includes("blockers:"), false, "不会再往项目里写独立阻塞项字段");
});

test("单项目页面：文件缺失或类型不符时给出说明", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.project, { path: "20 项目库/不存在.md" });
  await h.settle();
  assert.ok(h.textOf(leaf.containerEl.children[1]).includes("项目文件不存在"));
  const leaf2 = await h.openView(VIEW.project, { path: "30 知识库/方法.md" });
  await h.settle();
  assert.ok(h.textOf(leaf2.containerEl.children[1]).includes("没有被识别为项目"));
});

test("项目页按钮：新建关键节点 / 编辑项目 / 归档 / 删除都在同页可用", async () => {
  const h = await setup();
  const project = (await h.plugin.collectData()).projects[0];
  const leaf = await h.openView(VIEW.project, { path: project.file.path });
  await h.settle();
  const root = leaf.containerEl.children[1];
  const labels = h.findByClass(root, "pp-button").map((button) => button.textContent);
  ["添加任务", "新建关键节点", "编辑项目", "更新状态", "归档项目", "删除项目", "打开源笔记"].forEach((label) => {
    assert.ok(labels.includes(label), "项目页缺少按钮：" + label);
  });
  h.plugin.deleteProject(project);
  await h.settle();
  assert.ok(h.lastModal());
});

test("并发刷新一个视图只落地一次渲染", async () => {
  const h = await setup();
  const leaf = h.workspace.getLeaf(false);
  await leaf.setViewState({ type: VIEW.tasks, active: true });
  await h.settle();
  const view = leaf.view;
  await Promise.all([view.refresh(), view.refresh(), view.refresh()]);
  const root = leaf.containerEl.children[1];
  assert.equal(h.findByClass(root, "pp-dashboard-header").length, 1);
  assert.equal(h.findByClass(root, "pp-task-list-screen").length, 1);
  assert.equal(h.consoleErrors.length, 0);
});

test("关闭视图后挂起的渲染不再写入 DOM", async () => {
  const h = await setup();
  const leaf = h.workspace.getLeaf(false);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const original = h.plugin.collectData.bind(h.plugin);
  h.plugin.collectData = () => pending.then(() => original());
  const opening = leaf.setViewState({ type: VIEW.dashboard, active: true });
  await h.settle();
  await leaf.view.onClose();
  release();
  await opening;
  await h.settle();
  assert.equal(h.findByClass(leaf.containerEl.children[1], "pp-dashboard-hero").length, 0, "关闭后不应继续渲染");
});

test("视图渲染后刷新按钮仍然可用", async () => {
  const h = await setup();
  const { root } = await openDashboard(h);
  await h.clickText(root, "刷新");
  await h.settle();
  const fresh = h.workspace.getLeavesOfType(VIEW.dashboard)[0].containerEl.children[1];
  assert.equal(h.findByClass(fresh, "pp-dashboard-hero").length, 1);
  assert.equal(h.consoleErrors.length, 0);
});

test("元数据变更事件驱动视图刷新且不重复渲染", async () => {
  const h = await setup();
  await openDashboard(h);
  const { root } = await openDashboard(h);
  h.resetWriteLog();
  const file = h.vault.getAbstractFileByPath("50 日程待办/整理收件箱.md");
  await h.vault.modify(file, h.vault.__readRaw(file.path) + "\n补充一行\n");
  await h.settle();
  const fresh = h.workspace.getLeavesOfType(VIEW.dashboard)[0].containerEl.children[1];
  assert.equal(h.findByClass(fresh, "pp-dashboard-hero").length, 1, "刷新后只应有一份页面");
  assert.equal(h.consoleErrors.length, 0);
  assert.equal(h.stormDetected, false);
});

module.exports = { title: "03 视图渲染", tests };
