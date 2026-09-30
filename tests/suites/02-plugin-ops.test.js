"use strict";
/** 插件数据操作层：项目 / 任务 / 关键节点 / 草稿分诊 / 归档 / 提醒 */
const assert = require("node:assert/strict");
const { test, tests, setup, eqJson } = require("../util");
const { VIEW, fm, raw, paths, exists, openModal, fill, submit, choose, checkItems } = require("../drive");

test("onload 注册六个视图、命令、设置页与提醒定时器", async () => {
  const h = await setup();
  const types = [...h.plugin.__views.keys()].sort();
  eqJson(types, [VIEW.inbox, VIEW.project, VIEW.resources, VIEW.dashboard, VIEW.tasks, VIEW.app].sort());
  const commandIds = h.plugin.__commands.map((command) => command.id);
  ["open-dashboard", "new-project", "new-task", "triage-inbox", "import-inbox-task-set", "initialize-structure",
    "archive-active-task", "undo-archive-active-task", "check-reminders", "open-classic-views"
  ].forEach((id) => assert.ok(commandIds.includes(id), "缺少命令：" + id));
  assert.equal(new Set(commandIds).size, commandIds.length, "命令 id 不能重复：" + commandIds.join(", "));
  const commandNames = h.plugin.__commands.map((command) => command.name);
  assert.equal(new Set(commandNames).size, commandNames.length, "命令名称不能重复（命令面板会分不清）：" + commandNames.join(" / "));
  assert.equal(h.plugin.__settingTabs.length, 1);
  assert.equal(h.plugin.__intervals.length, 1);
  assert.equal(h.onloadErrors.length, 0, "onload 期间不应产生错误：" + h.onloadErrors.join(" | "));
});

test("initializeStructure 只创建缺失目录", async () => {
  const h = await setup({ seed: false });
  await h.plugin.initializeStructure();
  ["00 草稿箱", "10 长期领域", "20 项目库", "30 知识库", "30 知识库/图书库", "40 人物库", "50 日程待办", "90 归档库"].forEach((folder) => {
    assert.ok(h.vault.getAbstractFileByPath(folder), "缺少目录：" + folder);
  });
  const before = h.vault.getFiles().length;
  await h.plugin.initializeStructure();
  assert.equal(h.vault.getFiles().length, before, "重复初始化不应产生副作用");
});

test("collectData 只扫描活动目录并跳过禁阅路径", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  assert.ok(paths(h).includes("（AI禁止阅读）秘密.md"), "夹具中确实存在禁阅文件");
  assert.ok(!data.all.some((item) => item.file.path.includes("AI禁止阅读")), "禁阅文件不能被采集");
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].frontmatter.title, "仪表盘搭建");
  assert.equal(data.projects[0].total, 2);
  assert.equal(data.projects[0].done, 0);
  assert.equal(data.projects[0].progress, 0);
  assert.ok(data.overdue.some((item) => item.frontmatter.title === "过期任务"));
  assert.ok(data.upcoming.some((item) => item.frontmatter.title === "完成首页文案"));
  assert.ok(data.inbox.some((item) => item.frontmatter.title === "灵感随手记"));
  assert.equal(data.tasks.length, 4, "活动任务共 4 条（禁阅目录中的任务不计入）");
  assert.equal(data.timePlan.days.length, 7);
});

test("状态刷新会写回过期状态且收敛后不再写盘", async () => {
  const h = await setup();
  assert.equal(fm(h, "20 项目库/仪表盘搭建/过期任务.md").status, "expired", "onload 后的首次刷新应同步过期状态");
  assert.equal(h.pluginData.projects, undefined);
  // 人为把状态改回 todo，刷新后应被重新推导并写回
  const target = "20 项目库/仪表盘搭建/过期任务.md";
  h.vault.__writeRaw(target, raw(h, target).replace("status: expired", "status: todo"));
  h.resetWriteLog();
  await h.plugin.collectData();
  await h.settle();
  assert.equal(fm(h, target).status, "expired", "过期状态应重新写回");
  assert.ok(h.vaultWrites >= 1, "应至少发生一次状态修正写入");
  assert.ok(h.vaultWrites < 20, "一次刷新不应产生大量写入，实际：" + h.vaultWrites);
  assert.equal(h.stormDetected, false);
  h.resetWriteLog();
  await h.plugin.collectData();
  await h.settle();
  assert.equal(h.vaultWrites, 0, "状态收敛后再次刷新不应继续写盘，实际：" + h.vaultWrites);
});

test("状态刷新不覆盖用户自定义状态，也不覆盖用户已有的 updated", async () => {
  const h = await setup();
  h.seedFile("50 日程待办/自定义状态.md", "---\ntype: task\ntitle: 自定义状态\nstatus: 进行中\nupdated: 2026-01-01\n---\n\n正文\n");
  await h.settle();
  const before = raw(h, "50 日程待办/自定义状态.md");
  await h.plugin.collectData();
  await h.settle();
  assert.equal(raw(h, "50 日程待办/自定义状态.md"), before, "无法识别的自定义状态必须原样保留");

  h.seedFile("50 日程待办/另一个.md", "---\ntype: task\ntitle: 另一个\nstatus: todo\ndue: 2026-09-10\nupdated: 2026-01-01\n---\n\n正文\n");
  await h.settle();
  await h.plugin.collectData();
  await h.settle();
  const text = raw(h, "50 日程待办/另一个.md");
  assert.match(text, /status:\s*"?expired"?/, "可推导的过期状态仍应写回");
  assert.match(text, /updated:\s*"?2026-01-01"?/, "用户已有的 updated 不应被读路径覆盖");
});

test("设置页输入走防抖：连打多次只落盘一次，flush 立即落盘", async () => {
  const h = await setup();
  let saves = 0;
  const original = h.plugin.saveData.bind(h.plugin);
  h.plugin.saveData = async (data) => { saves += 1; return original(data); };
  for (let index = 1; index <= 5; index += 1) {
    h.plugin.settings.taskFolder = "50 日程待办" + index;
    h.plugin.scheduleSaveSettings();
  }
  assert.equal(saves, 0, "防抖期间不应立即落盘");
  await h.settle();
  assert.equal(saves, 1, "连打 5 次只应落盘一次，实际 " + saves);
  assert.equal(h.pluginData.taskFolder, "50 日程待办5", "应保存最后一次输入");

  h.plugin.scheduleSaveSettings();
  assert.ok(h.plugin.saveTimer, "应存在挂起的保存");
  h.plugin.flushSaveSettings();
  await h.settle();
  assert.equal(saves, 2, "flush 应立即落盘");
});

test("归档任务时移动失败会撤回状态修改，不留不一致笔记", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  const before = fm(h, task.file.path).status;
  h.app.vault.rename = async () => { throw new Error("目标被占用"); };
  await h.plugin.archiveTask(task, data.projects[0]);
  await h.settle();
  assert.ok(exists(h, task.file.path), "移动失败后文件应留在原处");
  assert.equal(fm(h, task.file.path).status, before, "状态应被撤回，实际：" + fm(h, task.file.path).status);
  assert.ok(h.notices.some((message) => String(message).includes("撤回")), "应提示已撤回：" + JSON.stringify(h.notices));
}, { allowConsoleErrors: true });

test("createProject 创建项目文件夹与同名项目文档", async () => {
  const h = await setup();
  const modal = await openModal(h, () => h.plugin.newProject());
  fill(modal, { title: "个人网站上线", outcome: "能公开访问", acceptance: "首页可访问", deadline: "2026-12-31", constraints: "0 预算", area: "事业", weight: "5" });
  await submit(h, modal);
  assert.ok(exists(h, "20 项目库/个人网站上线"), "应创建项目文件夹");
  const projectPath = "20 项目库/个人网站上线/个人网站上线.md";
  assert.ok(exists(h, projectPath), "应创建项目文档");
  const frontmatter = fm(h, projectPath);
  assert.equal(frontmatter.type, "project");
  assert.equal(frontmatter.title, "个人网站上线");
  assert.equal(frontmatter.status, "planning");
  assert.equal(frontmatter.weight, 5);
  eqJson(frontmatter.milestones, ["未分组"]);
  assert.ok(h.vault.__readRaw(projectPath).includes("## 项目推演"));
});

test("createProject 重名时使用唯一文件夹名", async () => {
  const h = await setup();
  let modal = await openModal(h, () => h.plugin.newProject());
  fill(modal, { title: "重名项目" });
  await submit(h, modal);
  modal = await openModal(h, () => h.plugin.newProject());
  fill(modal, { title: "重名项目" });
  await submit(h, modal);
  assert.ok(exists(h, "20 项目库/重名项目/重名项目.md"));
  assert.ok(exists(h, "20 项目库/重名项目 2/重名项目 2.md"), "第二个同名项目应落在唯一目录");
});

test("createProject 空名称被拒绝", async () => {
  const h = await setup();
  const modal = await openModal(h, () => h.plugin.newProject());
  fill(modal, { title: "   " });
  await submit(h, modal);
  assert.ok(h.notices.some((notice) => notice.includes("保存失败")), "空名称应提示保存失败");
  assert.ok(!exists(h, "20 项目库/未命名"), "不应创建未命名项目");
});

test("newTask 关联项目时写入项目文件夹与关键节点", async () => {
  const h = await setup();
  const project = (await h.plugin.collectData()).projects[0];
  const modal = await openModal(h, () => h.plugin.newTask(project));
  fill(modal, { title: "写验收文档", milestone: "完成 MVP", taskSet: "本周维护", taskGroup: "资料整理", due: "2026-10-05", duration: "60", priority: "high", type: "task", status: "todo", assignee: "", knowledgeRefs: "", recurrence: "none" });
  await submit(h, modal);
  const taskPath = "20 项目库/仪表盘搭建/写验收文档.md";
  assert.ok(exists(h, taskPath));
  const frontmatter = fm(h, taskPath);
  assert.equal(frontmatter.project, "20 项目库/仪表盘搭建/仪表盘搭建.md");
  assert.equal(frontmatter.milestone, "完成 MVP");
  assert.equal(frontmatter.task_set, "本周维护");
  assert.equal(frontmatter.duration, 60);
  assert.equal(frontmatter.status, "todo");
  assert.ok(raw(h, taskPath).includes("## 任务拆解"));
  assert.ok(!raw(h, taskPath).includes("## 下一步"), "不应再使用旧模板");
});

test("newTask 不关联项目时写入日程待办", async () => {
  const h = await setup();
  const modal = await openModal(h, () => h.plugin.newTask());
  fill(modal, { title: "孤立任务", project: "", due: "", duration: "15", status: "planning", type: "task" });
  await submit(h, modal);
  const taskPath = "50 日程待办/孤立任务.md";
  assert.ok(exists(h, taskPath));
  const frontmatter = fm(h, taskPath);
  assert.equal(frontmatter.project, "");
  assert.equal(frontmatter.milestone, "");
  assert.equal(frontmatter.status, "planning");
});

test("newTask 空标题被拒绝", async () => {
  const h = await setup();
  const modal = await openModal(h, () => h.plugin.newTask());
  fill(modal, { title: "" });
  await submit(h, modal);
  assert.ok(h.notices.some((notice) => notice.includes("保存失败")));
});

/* ---- 重复模式（参考谷歌日历）：每周选周几、每月选几号、DDL = 整段序列的结束日 ---- *
 *  测试里的"今天"是 2026-09-25（周五），日历事实独立核算过：09-28 周一、09-30 周三、10-05 周一。 */

test("newTask：每周选周几，DDL 落成重复结束日，第一次执行日由模式推出", async () => {
  const h = await setup();
  const modal = await openModal(h, () => h.plugin.newTask());
  fill(modal, {
    title: "每周复盘",
    duration: "30",
    status: "todo",
    type: "task",
    due: "",
    recurrence: "weekly",
    recurrenceWeekdays: [1, 4],
    recurrenceUntil: "2026-12-31",
  });
  await submit(h, modal);
  const taskPath = "50 日程待办/每周复盘.md";
  assert.ok(exists(h, taskPath), "应创建任务");
  const frontmatter = fm(h, taskPath);
  eqJson(frontmatter.recurrence_weekdays, [1, 4], "周几可多选，写进 frontmatter 的是数组");
  assert.equal(frontmatter.due, "2026-09-28", "第一次执行日 = 不早于今天的第一个周一");
  assert.equal(frontmatter.recurrence_until, "2026-12-31", "DDL 就是重复结束日");
  assert.equal(frontmatter.status, "todo");
});

test("newTask：每月选几号；29/30/31 号顺延到当月最后一天", async () => {
  const h = await setup();
  const modal = await openModal(h, () => h.plugin.newTask());
  fill(modal, { title: "月末结算", duration: "20", status: "todo", type: "task", recurrence: "monthly", recurrenceMonthday: "31" });
  await submit(h, modal);
  const taskPath = "50 日程待办/月末结算.md";
  const frontmatter = fm(h, taskPath);
  assert.equal(frontmatter.recurrence_monthday, 31, "几号是数字，不是字符串");
  assert.equal(frontmatter.due, "2026-09-30", "9 月没有 31 号 → 顺延到 9/30");
  assert.equal(frontmatter.recurrence_until, undefined, "留空 = 永不结束，不写空字段");
  assert.ok(!raw(h, taskPath).includes("recurrence_until"), "笔记里不该出现空的重复结束日");
  assert.ok(!raw(h, taskPath).includes("recurrence_weekdays"), "每月任务不该写周几");
});

test("newTask：重复结束日早于第一次执行日 → 拒绝保存并说明原因", async () => {
  const h = await setup();
  const modal = await openModal(h, () => h.plugin.newTask());
  fill(modal, { title: "早结束", recurrence: "weekly", recurrenceWeekdays: [1], recurrenceUntil: "2026-09-26" });
  await submit(h, modal);
  assert.ok(
    h.notices.some((notice) => notice.includes("重复结束")),
    "应提示重复结束日过早，实际提示：" + h.notices.join(" | "),
  );
  assert.ok(!exists(h, "50 日程待办/早结束.md"), "校验不通过不应建文件");
});

test("编辑已有重复任务：执行日不被挪走，模式可改；改成不重复会清掉陈旧字段", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/旧重复.md",
    "---\ntype: task\ntitle: 旧重复\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1]\nrecurrence_until: 2026-12-31\n---\n",
  );
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "旧重复");

  let modal = await openModal(h, () => h.plugin.editTask(task));
  const fieldIds = modal.fields.map((field) => field.id);
  ["recurrence", "recurrenceWeekdays", "recurrenceMonthday", "recurrenceUntil", "due"].forEach((id) =>
    assert.ok(fieldIds.includes(id), "表单应包含字段：" + id),
  );
  fill(modal, { title: "旧重复", recurrenceWeekdays: [3] });
  await submit(h, modal);
  let frontmatter = fm(h, "50 日程待办/旧重复.md");
  assert.equal(frontmatter.due, "2026-09-28", "已有重复任务的本次执行日不动（只改了模式）");
  eqJson(frontmatter.recurrence_weekdays, [3], "周几更新为新选择");
  assert.equal(frontmatter.recurrence_until, "2026-12-31", "没动结束日就保持");

  modal = await openModal(h, () => h.plugin.editTask({ ...task, frontmatter }));
  fill(modal, { recurrence: "none", due: "2026-10-10" });
  await submit(h, modal);
  frontmatter = fm(h, "50 日程待办/旧重复.md");
  assert.equal(frontmatter.recurrence, "none");
  assert.equal(frontmatter.due, "2026-10-10", "非重复任务的 DDL 就是 due");
  assert.equal(frontmatter.recurrence_weekdays, undefined, "陈旧的周几应被删除");
  assert.equal(frontmatter.recurrence_monthday, undefined);
  assert.equal(frontmatter.recurrence_until, undefined, "陈旧的结束日应被删除");
});

test("老笔记（只有 recurrence: weekly）重存：周几默认取执行日那天，语义一分不变", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  /* 夹具里的「重复日常」是 due: 2026-09-25（周五）+ recurrence: weekly，没有周几 */
  const legacy = data.allTasks.find((item) => item.frontmatter.title === "重复日常");
  const modal = await openModal(h, () => h.plugin.editTask(legacy));
  eqJson(modal.controls.recurrenceWeekdays.getValue(), ["5"], "默认勾上执行日那天（周五）");
  await submit(h, modal);
  const frontmatter = fm(h, "50 日程待办/重复日常.md");
  assert.equal(frontmatter.due, "2026-09-25", "执行日不变");
  eqJson(frontmatter.recurrence_weekdays, [5], "隐含的「每周同一天」被显式写出来");

  /* 旧行为是"due + 7 天"；显式记下周几之后滚动结果必须完全一样 */
  const refreshed = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "重复日常");
  await h.plugin.archiveTask(refreshed);
  await h.settle();
  assert.equal(fm(h, "50 日程待办/重复日常.md").due, "2026-10-02", "滚动结果与旧行为一致");
});

test("editTask 改名后文件随之重命名", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const projectTask = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  const modal = await openModal(h, () => h.plugin.editTask(projectTask));
  fill(modal, { title: "完成首页文案 v2" });
  await submit(h, modal);
  assert.ok(exists(h, "20 项目库/仪表盘搭建/完成首页文案 v2.md"));
  assert.ok(!exists(h, "20 项目库/仪表盘搭建/完成首页文案.md"));
});

test("editTask：改名/移动失败时不该只写一半（先移动，失败即整条回滚）", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  const originalPath = task.file.path;
  const originalTitle = fm(h, originalPath).title;

  const modal = await openModal(h, () => h.plugin.editTask(task));
  fill(modal, { title: "改个名字" });
  /* 模拟改名字这一步失败：旧实现会先把 frontmatter 写掉、再改名，于是留下"字段已改、文件名没改"的半截状态。
     仓库里其它同类路径（导入草稿、分诊草稿）都是"先移动、失败即回滚"，这里应当一致。 */
  const originalRename = h.vault.rename.bind(h.vault);
  h.vault.rename = async () => {
    throw new Error("模拟磁盘错误");
  };
  await submit(h, modal).catch(() => {});
  h.vault.rename = originalRename;
  await h.settle();

  assert.ok(exists(h, originalPath), "改名失败后文件应仍在原路径");
  assert.equal(fm(h, originalPath).title, originalTitle, "改名失败时 frontmatter 不该已经被改掉");
}, { allowConsoleErrors: true });

test("archiveTask：项目任务归档到项目目录并带 [项目名] 前缀", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const projectTask = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  await h.plugin.archiveTask(projectTask, data.projects[0]);
  await h.settle();
  const archivedPath = "90 归档库/仪表盘搭建/[仪表盘搭建] 完成首页文案.md";
  assert.ok(exists(h, archivedPath), "归档路径应为 " + archivedPath + "，实际：" + paths(h).filter((p) => p.startsWith("90 归档库")).join(", "));
  const frontmatter = fm(h, archivedPath);
  assert.equal(frontmatter.status, "archived");
  assert.equal(frontmatter.archived_to, "90 归档库/仪表盘搭建");
  assert.equal(frontmatter.archived_from, "20 项目库/仪表盘搭建/完成首页文案.md");
});

test("archiveTask：孤立任务归档带日期前缀", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const orphan = data.allTasks.find((item) => item.frontmatter.title === "整理收件箱");
  await h.plugin.archiveTask(orphan);
  await h.settle();
  const archivedPath = "90 归档库/孤立任务/2026-09-25 整理收件箱.md";
  assert.ok(exists(h, archivedPath), "实际：" + paths(h).filter((p) => p.startsWith("90 归档库")).join(", "));
  assert.equal(fm(h, archivedPath).archived_to, "90 归档库/孤立任务");
});

test("undoArchiveTask：项目任务恢复原名并回到项目文件夹", async () => {
  const h = await setup();
  let data = await h.plugin.collectData();
  const projectTask = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  await h.plugin.archiveTask(projectTask, data.projects[0]);
  await h.settle();
  // 归档库不参与扫描，按真实场景从活动文件取回已归档任务
  const archivedPath = "90 归档库/仪表盘搭建/[仪表盘搭建] 完成首页文案.md";
  assert.ok(exists(h, archivedPath), "首次归档路径错误：" + paths(h).filter((p) => p.startsWith("90")).join(", "));
  const archivedFile = h.vault.getAbstractFileByPath(archivedPath);
  const archived = { file: archivedFile, frontmatter: h.plugin.fm(archivedFile) };
  await h.plugin.undoArchiveTask(archived, data.projects[0]);
  await h.settle();
  const restoredPath = "20 项目库/仪表盘搭建/完成首页文案.md";
  assert.ok(exists(h, restoredPath), "实际：" + paths(h).filter((p) => p.includes("仪表盘搭建")).join(", "));
  const frontmatter = fm(h, restoredPath);
  assert.equal(frontmatter.status, "todo", "恢复后按 DDL 重新推导状态");
  assert.equal(frontmatter.archived, undefined, "归档标记应被清除");
  assert.equal(frontmatter.archived_to, undefined);
});

test("undoArchiveTask：移动失败时恢复归档状态，不留「状态已撤销但仍在归档库」", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const projectTask = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  await h.plugin.archiveTask(projectTask, data.projects[0]);
  await h.settle();
  const archivedPath = "90 归档库/仪表盘搭建/[仪表盘搭建] 完成首页文案.md";
  const archivedFile = h.vault.getAbstractFileByPath(archivedPath);
  assert.ok(archivedFile, "前置归档应成功：" + paths(h).filter((p) => p.startsWith("90")).join(", "));
  const archived = { file: archivedFile, frontmatter: h.plugin.fm(archivedFile) };
  assert.equal(archived.frontmatter.status, "archived", "前置：应处于归档状态");

  /* 撤销归档是"先撤状态、再移动"：移动失败必须把状态改回去，
     否则笔记会卡在「状态已撤销但仍在归档库」——它既不在归档视图、也不在任何活动视图里，等于消失。 */
  h.vault.rename = async () => {
    throw new Error("目标被占用");
  };
  const outcome = await h.plugin.undoArchiveTask(archived, data.projects[0]);
  await h.settle();

  /* 逐字段断言，不用 deepEqual：插件跑在 vm 上下文里，返回对象的原型与宿主不是同一个，
     deepEqual 会把两个看起来完全相同的对象判成不等。 */
  assert.equal(outcome && outcome.ok, false, "应如实汇报失败：" + JSON.stringify(outcome));
  assert.equal(outcome && outcome.reason, "移动失败", "失败原因应可读：" + JSON.stringify(outcome));
  assert.ok(exists(h, archivedPath), "移动失败后文件应留在归档库");
  assert.equal(fm(h, archivedPath).status, "archived", "状态应被撤回为归档，实际：" + fm(h, archivedPath).status);
  assert.ok(
    h.notices.some((notice) => String(notice).includes("已撤回状态修改")),
    "应提示已撤回：" + JSON.stringify(h.notices),
  );
}, { allowConsoleErrors: true });

test("undoArchiveTask：原项目文件夹不可用时真的回落到日程待办", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const projectTask = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  await h.plugin.archiveTask(projectTask, data.projects[0]);
  await h.settle();
  const archivedPath = "90 归档库/仪表盘搭建/[仪表盘搭建] 完成首页文案.md";
  const archivedFile = h.vault.getAbstractFileByPath(archivedPath);
  assert.ok(archivedFile, "前置归档应成功：" + paths(h).filter((p) => p.startsWith("90")).join(", "));

  // 项目文档不在项目根目录的直接子文件夹里 → ensureProjectFolder 返回空，走回落分支
  const orphanProject = { file: { path: "20 项目库/仪表盘搭建/仪表盘搭建.md" }, folderPath: "", frontmatter: { title: "仪表盘搭建" } };
  const errors = h.consoleErrors.length;
  await h.plugin.undoArchiveTask({ file: archivedFile, frontmatter: h.plugin.fm(archivedFile) }, orphanProject);
  await h.settle();

  assert.equal(h.consoleErrors.length, errors, "回落路径不应产生错误：" + h.consoleErrors.join(" | "));
  const restored = "50 日程待办/完成首页文案.md";
  assert.ok(exists(h, restored), "应回落到日程待办并去掉项目前缀；实际：" + paths(h).filter((p) => p.includes("完成首页文案")).join(", "));
  assert.equal(fm(h, restored).archived, undefined, "归档标记应被清除");
});

test("archiveTask：重复任务归档后生成下一周期任务", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const recurring = data.allTasks.find((item) => item.frontmatter.title === "重复日常");
  await h.plugin.archiveTask(recurring);
  await h.settle();
  assert.ok(exists(h, "90 归档库/孤立任务/2026-09-25 重复日常.md"));
  const nextPath = "50 日程待办/重复日常.md";
  assert.ok(exists(h, nextPath), "应生成下一条重复任务");
  const frontmatter = fm(h, nextPath);
  assert.equal(frontmatter.due, "2026-10-02");
  assert.equal(frontmatter.recurrence, "weekly");
  assert.equal(frontmatter.status, "todo");
});

test("archiveTask：按周几滚动到下一个命中日，而不是死板 +7 天", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/周一三五.md",
    "---\ntype: task\ntitle: 周一三五\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1, 3, 5]\n---\n",
  );
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "周一三五");
  await h.plugin.archiveTask(task);
  await h.settle();
  assert.ok(
    exists(h, "90 归档库/孤立任务/" + h.helpers.today() + " 周一三五.md"),
    "这一条应归档（孤立任务用归档当天做日期前缀）",
  );
  const frontmatter = fm(h, "50 日程待办/周一三五.md");
  assert.equal(frontmatter.due, "2026-09-30", "周一之后的下一次是周三（不是 +7 天的 10-05）");
  eqJson(frontmatter.recurrence_weekdays, [1, 3, 5], "周几要复制到下一条");
});

test("archiveTask：重复结束日到了就不再生成下一条，并说明重复已结束", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/最后一次.md",
    "---\ntype: task\ntitle: 最后一次\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1]\nrecurrence_until: 2026-09-30\n---\n",
  );
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "最后一次");
  await h.plugin.archiveTask(task);
  await h.settle();
  assert.ok(
    exists(h, "90 归档库/孤立任务/" + h.helpers.today() + " 最后一次.md"),
    "这一条仍然归档",
  );
  assert.ok(!exists(h, "50 日程待办/最后一次.md"), "越过结束日就不再生成下一条（下次是 10-05）");
  assert.ok(
    h.notices.some((notice) => notice.includes("重复已结束")),
    "应说明重复已结束，实际提示：" + h.notices.join(" | "),
  );
});

test("archiveTask：每月几号的滚动顺延（1/31 → 2 月最后一天）", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/月末结算.md",
    "---\ntype: task\ntitle: 月末结算\nstatus: todo\ndue: 2026-01-31\nrecurrence: monthly\nrecurrence_monthday: 31\n---\n",
  );
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "月末结算");
  await h.plugin.archiveTask(task);
  await h.settle();
  const frontmatter = fm(h, "50 日程待办/月末结算.md");
  assert.equal(frontmatter.due, "2026-02-28", "2 月没有 31 号 → 顺延到 28 号");
  assert.equal(frontmatter.recurrence_monthday, 31, "几号保持 31，之后的月份仍按 31 号算");
});

test("archiveProject 与既有项目任务归档目录合并", async () => {
  const h = await setup();
  let data = await h.plugin.collectData();
  const projectTask = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  await h.plugin.archiveTask(projectTask, data.projects[0]);
  await h.settle();
  data = await h.plugin.collectData();
  await h.plugin.archiveProject(data.projects[0]);
  await h.settle();
  assert.ok(!exists(h, "20 项目库/仪表盘搭建"), "项目文件夹应被移走");
  assert.ok(exists(h, "90 归档库/仪表盘搭建/仪表盘搭建.md"), "项目文档应在归档目录");
  assert.ok(!exists(h, "90 归档库/仪表盘搭建 2"), "不应产生重复项目归档目录");
  const folders = paths(h).filter((p) => p.startsWith("90 归档库/仪表盘搭建/"));
  assert.ok(folders.includes("90 归档库/仪表盘搭建/[仪表盘搭建] 完成首页文案.md"), "已归档任务应与项目合并：" + folders.join(", "));
});

test("deleteProject 删除整个项目文件夹，且不绕过用户的「删除文件」设置", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  h.plugin.deleteProject(data.projects[0]);
  await h.settle();
  const modal = h.lastModal();
  await submit(h, modal, "删除整个项目");
  assert.ok(!exists(h, "20 项目库/仪表盘搭建"));
  assert.ok(!exists(h, "20 项目库/仪表盘搭建/仪表盘搭建.md"));
  /* 必须走 fileManager.trashFile：Obsidian 1.13 的 vault.delete(文件夹)（force 默认 false）
     等于对目录做非递归 fs.rm，必然 ERR_FS_EISDIR（用户实测：Path is a directory: rm returned
     EISDIR (is a directory) 20 项目库\仪表盘搭建），文件夹一个文件都删不掉。
     trashFile 才读「删除文件」设置，也是唯一能删文件夹的入口。 */
  const trashes = h.vault.trashCalls || [];
  assert.ok(trashes.length > 0, "整个项目文件夹应经 trashFile → vault.trash 删除");
  assert.ok(
    trashes.every((call) => call.path === "20 项目库/仪表盘搭建"),
    "应删的是项目文件夹本身：" + JSON.stringify(trashes),
  );
  /* delete(entry, true) 是"永久删除"，会绕过 Obsidian 的回收站设置；这条路径不该出现。 */
  const calls = h.vault.deleteCalls || [];
  assert.ok(calls.every((call) => !call.permanent), "不应强制永久删除：" + JSON.stringify(calls));
});

test("删除类确认框如实说明『跟随 Obsidian 的删除设置』，不声称不可撤销", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();

  /* 删除入口走的是 fileManager.trashFile（跟随用户的「删除文件」设置），
     所以文案不能写"会被永久删除 / 不能撤销"——那会让用户误判"删了还能不能找回"。 */
  h.plugin.deleteTask(data.allTasks[0]);
  await h.settle();
  const taskModal = h.lastModal();
  assert.ok(String(taskModal.description).includes("删除文件"), "任务删除应说明跟随设置：" + taskModal.description);
  assert.ok(!String(taskModal.description).includes("不能撤销"), "任务删除不该声称不可撤销：" + taskModal.description);

  h.plugin.deleteFile(h.vault.getAbstractFileByPath("00 草稿箱/灵感随手记.md"), "草稿");
  await h.settle();
  const fileModal = h.lastModal();
  assert.ok(String(fileModal.description).includes("删除文件"), "文件删除应说明跟随设置：" + fileModal.description);
  assert.ok(!String(fileModal.description).includes("不能撤销"), "文件删除不该声称不可撤销：" + fileModal.description);
});

test("deleteTask 删除单个任务文件（经 trashFile 跟随「删除文件」设置）", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "完成首页文案");
  h.plugin.deleteTask(task);
  await h.settle();
  await submit(h, h.lastModal(), "删除任务");
  assert.ok(!exists(h, "20 项目库/仪表盘搭建/完成首页文案.md"));
  assert.ok(exists(h, "20 项目库/仪表盘搭建/仪表盘搭建.md"), "项目文档不应被误删");
  /* vault.delete(entry) 对文件是直接 unlink（永久删除），不读用户的回收站设置 —— 必须走 trashFile */
  assert.ok(
    (h.vault.trashCalls || []).some((call) => call.path === "20 项目库/仪表盘搭建/完成首页文案.md"),
    "单文件删除也应经 trashFile → vault.trash：" + JSON.stringify(h.vault.trashCalls || []),
  );
});

test("新建任务表单：任务集 / 任务组是可下拉的 datalist，候选来自已有任务", async () => {
  const h = await setup({ seed: false });
  h.seedFile("50 日程待办/A.md", "---\ntype: task\ntitle: A\nstatus: todo\ntask_set: 本周维护\ntask_group: 资料整理\n---\n");
  h.seedFile("50 日程待办/B.md", "---\ntype: task\ntitle: B\nstatus: todo\ntask_set: 下周维护\ntask_group: 复盘\n---\n");
  const modal = await openModal(h, () => h.plugin.newTask());
  const datalistFor = (control) => {
    const listId = control.inputEl.getAttr("list");
    assert.ok(listId, "应挂上 datalist 的 id");
    const list = modal.contentEl.querySelectorAll("datalist").find((node) => node.getAttr("id") === listId);
    assert.ok(list, "应渲染 datalist 元素");
    return list.querySelectorAll("option").map((option) => option.value);
  };
  eqJson(datalistFor(modal.controls.taskSet), ["下周维护", "本周维护"], "任务集候选应来自已有任务");
  eqJson(datalistFor(modal.controls.taskGroup), ["复盘", "资料整理"], "任务组候选应来自已有任务");
  /* 半开放：仍然可以写一个新值（不是强制下拉） */
  fill(modal, { title: "新任务", taskSet: "临时任务集" });
  await submit(h, modal);
  assert.equal(fm(h, "50 日程待办/新任务.md").task_set, "临时任务集", "datalist 不应阻止写新值");
});

test("校验错误只提示、真正的异常才写 console.error", async () => {
  const h = await setup();

  // 真正的异常：写盘失败必须留下错误日志
  const originalCreate = h.app.vault.create;
  h.app.vault.create = async () => { throw new Error("磁盘写入失败"); };
  h.plugin.newProject();
  await h.settle();   /* 新建项目现在会先采集一次数据（为了给"长期领域"做下拉候选），弹窗异步打开 */
  fill(h.lastModal(), { title: "正常名称" });
  await submit(h, h.lastModal());
  assert.equal(h.consoleErrors.length, 1, "真正的异常应写 console.error，实际：" + JSON.stringify(h.consoleErrors));
  assert.ok(h.consoleErrors[0].includes("磁盘写入失败"), "错误日志应包含原因");
  assert.ok(h.notices.some((message) => String(message).includes("保存失败")), "应提示保存失败");
  h.app.vault.create = originalCreate;

  // 可预期的校验错误：只提示，不应写 console.error
  h.consoleErrors.length = 0;
  h.notices.length = 0;
  h.plugin.newProject();
  await h.settle();
  fill(h.lastModal(), { title: "   " });
  await submit(h, h.lastModal());
  assert.equal(h.consoleErrors.length, 0, "用户输入校验不应写 console.error：" + JSON.stringify(h.consoleErrors));
  assert.ok(h.notices.some((message) => String(message).includes("项目名称不能为空")), "应给出校验提示，实际：" + JSON.stringify(h.notices));
});

test("deleteFile 对已消失的文件给出明确错误", async () => {
  const h = await setup();
  h.plugin.deleteFile({ path: "50 日程待办/不存在.md" }, "草稿");
  await h.settle();
  await submit(h, h.lastModal(), "删除");
  assert.ok(h.notices.some((notice) => notice.includes("已经不存在")), "实际提示：" + h.notices.join(" | "));
});

test("关键节点：新增、改名（含任务回写）、删除后回到未分组", async () => {
  const h = await setup();
  let data = await h.plugin.collectData();
  const project = data.projects[0];
  assert.ok(h.plugin.getMilestones(project, data.allTasks).includes("完成 MVP"));

  let modal = await openModal(h, () => h.plugin.newMilestone(project));
  fill(modal, { name: "上线验收" });
  await submit(h, modal);
  assert.ok(fm(h, project.file.path).milestones.includes("上线验收"));

  modal = await openModal(h, () => h.plugin.newMilestone(project));
  fill(modal, { name: "上线验收" });
  await submit(h, modal);
  assert.equal(fm(h, project.file.path).milestones.filter((item) => item === "上线验收").length, 1, "同名节点不应重复添加");

  modal = await openModal(h, () => h.plugin.editMilestone(project, "完成 MVP"));
  fill(modal, { name: "完成 MVP 改名" });
  await submit(h, modal);
  assert.ok(fm(h, project.file.path).milestones.includes("完成 MVP 改名"));
  assert.equal(fm(h, "20 项目库/仪表盘搭建/完成首页文案.md").milestone, "完成 MVP 改名", "任务节点应同步改名");

  modal = await openModal(h, () => h.plugin.deleteMilestone(project, "完成 MVP 改名"));
  await submit(h, modal);
  assert.equal(fm(h, "20 项目库/仪表盘搭建/完成首页文案.md").milestone, "未分组");
  assert.ok(!fm(h, project.file.path).milestones.includes("完成 MVP 改名"));
});

test("未分组是保底节点，不能改名或删除", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const project = data.projects[0];
  await h.plugin.deleteMilestone(project, "未分组");
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("保底节点")));
  const modal = await openModal(h, () => h.plugin.editMilestone(project, "未分组"));
  fill(modal, { name: "改名试试" });
  await submit(h, modal);
  assert.ok(fm(h, project.file.path).milestones.includes("未分组"));
  assert.ok(!fm(h, project.file.path).milestones.includes("改名试试"));
});

test("editProject 改名后同步文件夹、文档与任务 project 字段", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const modal = await openModal(h, () => h.plugin.editProject(data.projects[0]));
  fill(modal, { title: "仪表盘搭建 v2", outcome: "更完整", deadline: "2026-11-30" });
  await submit(h, modal);
  assert.ok(exists(h, "20 项目库/仪表盘搭建 v2/仪表盘搭建 v2.md"), "实际：" + paths(h).filter((p) => p.startsWith("20 项目库")).join(", "));
  assert.ok(!exists(h, "20 项目库/仪表盘搭建/仪表盘搭建.md"));
  const renamedTask = "20 项目库/仪表盘搭建 v2/完成首页文案.md";
  assert.ok(exists(h, renamedTask), "任务应随文件夹一起移动");
  assert.equal(fm(h, renamedTask).project, "20 项目库/仪表盘搭建 v2/仪表盘搭建 v2.md", "任务 project 字段应指向新路径");
});

test("规划提醒：通知可以点开仪表盘，并且只在真有内容时消耗当天额度", async () => {
  const h = await setup({ seed: false });
  const first = await h.plugin.collectWebPayload();
  const yesterday = (() => {
    const date = new Date(String(first.today) + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  })();
  h.seedFile("50 日程待办/逾期提醒.md", "---\ntype: task\ntitle: 逾期提醒\nstatus: todo\ndue: " + yesterday + "\n---\n");

  await h.plugin.checkReminders(true);
  await h.settle();
  const notice = h.noticeInstances[h.noticeInstances.length - 1];
  assert.ok(notice, "有逾期任务时应给出提醒");
  assert.ok(notice.message.includes("点击打开仪表盘"), "通知里要说明可以点，实际：" + notice.message);
  assert.equal(typeof notice.noticeEl.onclick, "function", "通知应挂上点击处理");

  notice.noticeEl.onclick();
  await h.settle();
  assert.equal(h.workspace.getLeavesOfType(VIEW.app).length, 1, "点通知应真的打开 Web 仪表盘");
  assert.equal(notice.hidden, true, "点完把通知收起来，别挡着页面");

  /* 没内容时不弹提醒，也不消耗当天额度（否则用户当天补上 DDL 就再也收不到提醒） */
  const h2 = await setup({ seed: false });
  await h2.plugin.checkReminders(true);
  await h2.settle();
  assert.ok(!h2.notices.some((message) => message.includes("规划提醒")), "没有内容时不该弹提醒");
  assert.ok(!h2.plugin.settings.lastReminderDate, "没有内容时不该占用当天额度，实际：" + JSON.stringify(h2.plugin.settings.lastReminderDate));
});
test("分诊草稿：短期任务移动到日程待办", async () => {
  const h = await setup();
  h.plugin.openTriage(h.vault.getAbstractFileByPath("00 草稿箱/灵感随手记.md"));
  await h.settle();
  await choose(h, "短期任务");
  assert.ok(exists(h, "50 日程待办/灵感随手记.md"), "实际：" + paths(h).filter((p) => p.includes("灵感")).join(", "));
  assert.ok(!exists(h, "00 草稿箱/灵感随手记.md"));
  const frontmatter = fm(h, "50 日程待办/灵感随手记.md");
  assert.equal(frontmatter.type, "task");
  assert.equal(frontmatter.stage, "task");
  assert.equal(frontmatter.status, "todo");
  assert.equal(h.openedFiles.length, 1, "非归档分诊后应打开新文件");
});

test("分诊草稿：丢弃进入归档库并保留 archived_from", async () => {
  const h = await setup();
  h.plugin.openTriage(h.vault.getAbstractFileByPath("00 草稿箱/待分诊.md"));
  await h.settle();
  await choose(h, "丢弃 / 归档");
  assert.ok(exists(h, "90 归档库/待分诊.md"));
  const frontmatter = fm(h, "90 归档库/待分诊.md");
  assert.equal(frontmatter.stage, "archived");
  assert.equal(frontmatter.status, "archived");
  assert.equal(frontmatter.archived_from, "00 草稿箱/待分诊.md");
  assert.equal(h.openedFiles.length, 0, "归档分支不应自动打开文件");
});

test("分诊草稿：文件已消失时给出提示而不崩溃", async () => {
  const h = await setup();
  h.plugin.openTriage({ path: "00 草稿箱/不存在.md" });
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("已经不存在")));
});

test("周维护批量导入：多选草稿统一写入任务集与任务组", async () => {
  const h = await setup();
  h.plugin.importInboxAsTaskSet();
  await h.settle();
  await checkItems(h, ["灵感随手记", "待分诊"]);
  await h.settle();
  const form = h.lastFormModal();
  assert.ok(form, "选中草稿后应打开任务集表单");
  fill(form, { taskSet: "本周维护", taskGroup: "资料整理" });
  await submit(h, form);
  assert.ok(exists(h, "50 日程待办/灵感随手记.md"));
  assert.ok(exists(h, "50 日程待办/待分诊.md"));
  const frontmatter = fm(h, "50 日程待办/灵感随手记.md");
  assert.equal(frontmatter.task_set, "本周维护");
  assert.equal(frontmatter.task_group, "资料整理");
  assert.equal(frontmatter.type, "task");
  assert.equal(frontmatter.stage, "task");
  assert.ok(!exists(h, "00 草稿箱/灵感随手记.md"));
});

test("周维护批量导入：未选中任何草稿时不移动文件", async () => {
  const h = await setup();
  h.plugin.importInboxAsTaskSet();
  await h.settle();
  await h.clickText(h.lastModal().contentEl, "继续");
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("至少选择一条草稿")) || h.notices.some((notice) => notice.includes("没有选择有效草稿")), "实际：" + h.notices.join(" | "));
  assert.ok(exists(h, "00 草稿箱/灵感随手记.md"), "未选中时不应移动草稿");
});

test("知识缺口沉淀为知识笔记并回写引用", async () => {
  const h = await setup({ seed: true });
  const gap = h.seedFile("20 项目库/仪表盘搭建/学习布局.md", "---\ntype: knowledge-gap\ntitle: 学习布局\nstatus: todo\n---\n");
  assert.ok(gap);
  let data = await h.plugin.collectData();
  const gapTask = data.gaps.find((item) => item.frontmatter.title === "学习布局");
  assert.ok(gapTask, "知识缺口应被采集");
  const modal = await openModal(h, () => h.plugin.materializeKnowledgeGap(gapTask));
  fill(modal, { title: "CSS Grid 布局" });
  await submit(h, modal);
  assert.ok(exists(h, "30 知识库/CSS Grid 布局.md"));
  const frontmatter = fm(h, "20 项目库/仪表盘搭建/学习布局.md");
  assert.ok(frontmatter.knowledge_refs.includes("30 知识库/CSS Grid 布局.md"));
  assert.equal(h.openedFiles.length, 1, "沉淀后应打开知识笔记");
});

test("图书归档移动到归档库/图书", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const book = data.resources.books[0];
  h.plugin.archiveBook(book);
  await h.settle();
  await submit(h, h.lastModal(), "归档图书");
  assert.ok(exists(h, "90 归档库/图书/设计心理学.md"));
  assert.equal(fm(h, "90 归档库/图书/设计心理学.md").status, "archived");
});

test("关于我 / 财富笔记按需创建并阻止越权路径", async () => {
  const h = await setup();
  await h.plugin.openPersonalNote("10 长期领域/关于我.md", "关于我");
  assert.ok(exists(h, "10 长期领域/关于我.md"));
  assert.equal(h.openedFiles.length, 1);
  await assert.rejects(() => h.plugin.openPersonalNote("30 知识库/越权.md", "越权"), /不在长期领域目录内/);
});

test("规划提醒：每天最多一次，force 时始终提示", async () => {
  const h = await setup();
  await h.plugin.checkReminders(false);
  await h.settle();
  const first = h.notices.filter((notice) => notice.startsWith("规划提醒")).length;
  assert.equal(first, 1, "首次检查应提示，实际：" + h.notices.join(" | "));
  await h.plugin.checkReminders(false);
  await h.settle();
  assert.equal(h.notices.filter((notice) => notice.startsWith("规划提醒")).length, 1, "同一天不应重复提示");
  assert.equal(h.pluginData.lastReminderDate, "2026-09-25");
  await h.plugin.checkReminders(true);
  await h.settle();
  assert.equal(h.notices.filter((notice) => notice.startsWith("规划提醒")).length, 2, "force 应绕过当天去重");
});

test("规划提醒：未到提醒时间不触发", async () => {
  const h = await setup();
  h.setNow("2026-09-25T07:30:00");
  await h.plugin.checkReminders(false);
  await h.settle();
  assert.equal(h.notices.filter((notice) => notice.startsWith("规划提醒")).length, 0);
  assert.equal(h.pluginData.lastReminderDate || "", "", "未触发时不应写 lastReminderDate");
});

test("规划提醒：关闭开关后不再提示", async () => {
  const h = await setup();
  h.plugin.settings.remindersEnabled = false;
  await h.plugin.checkReminders(true);
  await h.settle();
  assert.equal(h.notices.filter((notice) => notice.startsWith("规划提醒")).length, 0);
});

test("updateFM 在没有 processFrontMatter 时回退到文本改写", async () => {
  const h = await setup();
  delete h.app.fileManager.processFrontMatter;
  const file = h.vault.getAbstractFileByPath("50 日程待办/整理收件箱.md");
  await h.plugin.updateFM(file, { status: "doing", updated: "2026-09-25" });
  const frontmatter = fm(h, "50 日程待办/整理收件箱.md");
  assert.equal(frontmatter.status, "doing");
  assert.equal(frontmatter.updated, "2026-09-25");
  // 夹具正文里并没有「知识引用」，原来的断言恒真；改为写入哨兵正文再走一遍回退路径
  h.vault.__writeRaw("50 日程待办/整理收件箱.md", "---\ntype: task\ntitle: 整理收件箱\n---\n\n哨兵正文行\n");
  const sentinelFile = h.vault.getAbstractFileByPath("50 日程待办/整理收件箱.md");
  await h.plugin.updateFM(sentinelFile, { status: "blocked" });
  const rewritten = raw(h, "50 日程待办/整理收件箱.md");
  assert.ok(rewritten.includes("哨兵正文行"), "回退路径必须保留正文；实际：" + JSON.stringify(rewritten));
  assert.match(rewritten, /status:\s*"?blocked"?/, "状态应写回 frontmatter");
});

test("archiveTask 对已消失的文件给出提示", async () => {
  const h = await setup();
  await h.plugin.archiveTask({ file: { path: "50 日程待办/不存在.md" }, frontmatter: {} });
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("已经不存在")));
  assert.equal(h.consoleErrors.length, 0);
});

test("活动文件命令：归档与撤销归档", async () => {
  const h = await setup();
  h.activeFile = h.vault.getAbstractFileByPath("50 日程待办/整合中的任务.md") || h.seedFile("50 日程待办/整合中的任务.md", "---\ntype: task\ntitle: 整合中的任务\nstatus: todo\ndue: 2026-09-30\n---\n");
  await h.settle();
  await h.plugin.archiveActiveTask();
  await h.settle();
  assert.ok(exists(h, "90 归档库/孤立任务/2026-09-25 整合中的任务.md"), "实际：" + paths(h).filter((p) => p.startsWith("90")).join(", "));
  h.activeFile = h.vault.getAbstractFileByPath("90 归档库/孤立任务/2026-09-25 整合中的任务.md");
  await h.plugin.undoArchiveActiveTask();
  await h.settle();
  assert.ok(exists(h, "50 日程待办/整合中的任务.md"));
});

/* ---- 重复任务的「完成」= 本周期完成（原地推进），不是整条任务完成 ---- *
 *  测试里的"今天"是 2026-09-25（周五）；日历事实独立核算过：09-28 周一、09-30 周三。 */

test("重复任务点完成：原地滚到下一周期、状态回到待办、完成写进正文执行记录", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/每周复盘.md",
    "---\ntype: task\ntitle: 每周复盘\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1, 3]\n---\n\n## 任务拆解\n\n- [ ] \n\n## 执行记录\n\n## 验收标准\n\n- \n",
  );
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "每周复盘");
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();

  const frontmatter = fm(h, "50 日程待办/每周复盘.md");
  assert.equal(frontmatter.due, "2026-09-30", "本周期（周一）完成 → 下一次是周三");
  assert.equal(frontmatter.status, "todo", "整条任务还在继续，不该变成 done");
  assert.equal(frontmatter.recurrence_weekdays.join(","), "1,3", "重复模式原样保留");
  const body = raw(h, "50 日程待办/每周复盘.md");
  assert.match(body, /## 执行记录\r?\n\r?\n- 2026-09-25 本周期完成（原 2026-09-28）→ 下一次 2026-09-30/,
    "完成记录要追加到「执行记录」小节里，实际：" + JSON.stringify(body.slice(body.indexOf("## 执行记录"))));
  assert.ok(h.notices.some((notice) => notice.includes("下一次：2026-09-30")), "通知要说清楚下一次：" + h.notices.join(" | "));
  assert.ok(exists(h, "50 日程待办/每周复盘.md"), "文件留在原地，不生成新笔记");
  assert.equal(paths(h).filter((path) => path.includes("每周复盘")).length, 1, "同一条重复任务只有一条笔记");
});

test("重复任务点完成：跳过已经错过的周期（下一次一定不早于今天）", async () => {
  const h = await setup();
  /* 08-31 是周一，早就过期；周一/周三模式一路跳过 09-02、09-07…09-23，
     下一次取到不早于今天（09-25 周五）的第一个命中日 = 09-28（周一） */
  h.seedFile(
    "50 日程待办/拖了很久.md",
    "---\ntype: task\ntitle: 拖了很久\nstatus: todo\ndue: 2026-08-31\nrecurrence: weekly\nrecurrence_weekdays: [1, 3]\n---\n",
  );
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "拖了很久");
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();
  const frontmatter = fm(h, "50 日程待办/拖了很久.md");
  assert.equal(frontmatter.due, "2026-09-28", "错过的周期不补，下一次取不早于今天的那次");
  assert.equal(frontmatter.status, "todo");
});

test("重复任务点完成：序列走完时不标「已完成」，只提示可以归档收尾", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/收尾.md",
    "---\ntype: task\ntitle: 收尾\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1]\nrecurrence_until: 2026-09-29\n---\n\n## 执行记录\n\n",
  );
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "收尾");
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();
  const frontmatter = fm(h, "50 日程待办/收尾.md");
  assert.equal(frontmatter.status, "todo", "重复任务的「完成」永远不写 done（不标注已完成、不标删除线）");
  assert.equal(frontmatter.due, "2026-09-28", "没有下一个周期可跳，执行日保持原样");
  assert.ok(!raw(h, "50 日程待办/收尾.md").includes("本周期完成"), "没有推进就不写执行记录");
  assert.ok(
    h.notices.some((notice) => notice.includes("重复已经走完")),
    "要说清为什么没动作：" + h.notices.join(" | "),
  );
  /* 没有推进过 → 也没有可撤销的东西 */
  await h.plugin.undoRecurringCompletion();
  assert.ok(h.notices.some((notice) => notice.includes("没有可撤销")), "不该凭空造一个撤销：" + h.notices.join(" | "));
});

test("撤销「本周期完成」：执行日与状态回到点击之前，刚写的执行记录也删掉", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/要撤销.md",
    "---\ntype: task\ntitle: 要撤销\nstatus: doing\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1, 3]\n---\n\n## 执行记录\n\n- 2026-09-20 上一次留的旧记录\n\n## 验收标准\n\n- \n",
  );
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "要撤销");
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();
  assert.equal(fm(h, "50 日程待办/要撤销.md").due, "2026-09-30", "前置：本周期完成已推进");
  assert.ok(raw(h, "50 日程待办/要撤销.md").includes("本周期完成"), "前置：执行记录已写入");

  await h.plugin.undoRecurringCompletion();
  await h.settle();
  const frontmatter = fm(h, "50 日程待办/要撤销.md");
  assert.equal(frontmatter.due, "2026-09-28", "执行日回到点击之前");
  assert.equal(frontmatter.status, "doing", "状态也回到点击之前（不是一律写 todo）");
  const restored = raw(h, "50 日程待办/要撤销.md");
  assert.ok(!restored.includes("本周期完成"), "刚写进去的那一行执行记录要删掉");
  assert.ok(restored.includes("2026-09-20 上一次留的旧记录"), "用户自己写的记录一行都不能动");
  assert.ok(h.notices.some((notice) => notice.includes("已撤销")), "撤销要有回执：" + h.notices.join(" | "));

  /* 只保留最近一次：撤销过就不能再撤第二次 */
  await h.plugin.undoRecurringCompletion();
  assert.ok(h.notices.filter((notice) => notice.includes("没有可撤销")).length >= 1, "不能反复撤销同一次");
});

test("撤销「本周期完成」：笔记已经不在了也不炸", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/会消失.md",
    "---\ntype: task\ntitle: 会消失\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1]\n---\n",
  );
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "会消失");
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();
  await h.vault.delete(h.vault.getAbstractFileByPath("50 日程待办/会消失.md"));
  await h.plugin.undoRecurringCompletion();
  assert.ok(h.notices.some((notice) => notice.includes("已经不在了")), "要说清楚为什么撤不了：" + h.notices.join(" | "));
  assert.equal(h.consoleErrors.length, 0, h.consoleErrors.join(" | "));
});

test("撤销「本周期完成」：只认最近一次那条任务", async () => {
  const h = await setup();
  h.seedFile("50 日程待办/甲重复.md", "---\ntype: task\ntitle: 甲重复\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1]\n---\n");
  h.seedFile("50 日程待办/乙重复.md", "---\ntype: task\ntitle: 乙重复\nstatus: todo\ndue: 2026-09-29\nrecurrence: weekly\nrecurrence_weekdays: [2]\n---\n");
  const tasks = (await h.plugin.collectData()).allTasks;
  await h.plugin.setTaskStatus(tasks.find((item) => item.frontmatter.title === "甲重复"), "done");
  await h.settle();
  await h.plugin.setTaskStatus(tasks.find((item) => item.frontmatter.title === "乙重复"), "done");
  await h.settle();
  await h.plugin.undoRecurringCompletion("50 日程待办/甲重复.md");
  assert.ok(h.notices.some((notice) => notice.includes("无法撤销")), "不该把乙的完成撤到甲头上：" + h.notices.join(" | "));
  assert.equal(fm(h, "50 日程待办/乙重复.md").due, "2026-10-06", "乙的推进保持不变");
});

test("非重复任务点完成：行为不变（只写 done）", async () => {
  const h = await setup();
  h.seedFile("50 日程待办/一次性.md", "---\ntype: task\ntitle: 一次性\nstatus: todo\ndue: 2026-09-30\n---\n\n## 执行记录\n\n");
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "一次性");
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();
  const frontmatter = fm(h, "50 日程待办/一次性.md");
  assert.equal(frontmatter.status, "done");
  assert.equal(frontmatter.due, "2026-09-30", "非重复任务的 DDL 不动");
  assert.ok(!raw(h, "50 日程待办/一次性.md").includes("本周期完成"), "非重复任务不写周期完成记录");
});

test("完成记录保留 CRLF：不往 CRLF 笔记里塞裸 LF", async () => {
  const h = await setup();
  const crlf =
    "---\r\ntype: task\r\ntitle: CRLF重复\r\nstatus: todo\r\ndue: 2026-09-28\r\nrecurrence: weekly\r\nrecurrence_weekdays: [1]\r\n---\r\n\r\n## 任务拆解\r\n\r\n- [ ] \r\n\r\n## 执行记录\r\n\r\n## 验收标准\r\n\r\n- \r\n";
  h.seedFile("50 日程待办/CRLF重复.md", crlf);
  assert.equal(h.vault.__readRaw("50 日程待办/CRLF重复.md"), crlf, "前置：正文确实是 CRLF");
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "CRLF重复");
  await h.plugin.setTaskStatus(task, "done");
  await h.settle();
  const after = h.vault.__readRaw("50 日程待办/CRLF重复.md");
  const bareLf = (after.match(/(^|[^\r])\n/g) || []).length;
  assert.equal(bareLf, 0, "完成记录不能引入裸 LF，实际：" + JSON.stringify(after.slice(after.indexOf("## 执行记录"))));
  assert.ok(after.includes("- 2026-09-25 本周期完成（原 2026-09-28）→ 下一次 2026-10-05\r\n"), "记录行本身也应是 CRLF");

  /* 撤销要把这一行删掉，同样不能引入裸 LF */
  await h.plugin.undoRecurringCompletion();
  await h.settle();
  const undone = h.vault.__readRaw("50 日程待办/CRLF重复.md");
  assert.equal((undone.match(/(^|[^\r])\n/g) || []).length, 0, "撤销也不能引入裸 LF");
  assert.ok(!undone.includes("本周期完成"), "撤销后不留记录");
  assert.equal(fm(h, "50 日程待办/CRLF重复.md").due, "2026-09-28", "执行日回到原处");
});

test("归档已完成的重复任务：只归档，不再生成下一条（防一个周期两条）", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/已完成的重复.md",
    "---\ntype: task\ntitle: 已完成的重复\nstatus: done\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1]\n---\n",
  );
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "已完成的重复");
  await h.plugin.archiveTask(task);
  await h.settle();
  assert.ok(exists(h, "90 归档库/孤立任务/" + h.helpers.today() + " 已完成的重复.md"), "这一条应归档");
  assert.ok(!exists(h, "50 日程待办/已完成的重复.md"), "已完成过的不再生成下一条");
  assert.ok(
    h.notices.some((notice) => notice.includes("本周期已完成，不再生成下一条")),
    "提示要说清为什么不生成：" + h.notices.join(" | "),
  );
});

test("编辑表单里给重复任务选「完成」也按本周期完成处理", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/表单完成.md",
    "---\ntype: task\ntitle: 表单完成\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1, 3]\n---\n\n## 执行记录\n\n",
  );
  const task = (await h.plugin.collectData()).allTasks.find((item) => item.frontmatter.title === "表单完成");
  const modal = await openModal(h, () => h.plugin.editTask(task));
  fill(modal, { status: "done" });
  await submit(h, modal);
  const frontmatter = fm(h, "50 日程待办/表单完成.md");
  assert.equal(frontmatter.status, "todo", "表单里选「完成」= 本周期完成，不写 done");
  assert.equal(frontmatter.due, "2026-09-30", "执行日滚到下一次命中（周三）");
  assert.ok(raw(h, "50 日程待办/表单完成.md").includes("本周期完成"), "同样要写进执行记录");

  /* 表单这条路也要能撤销 */
  await h.plugin.undoRecurringCompletion();
  await h.settle();
  assert.equal(fm(h, "50 日程待办/表单完成.md").due, "2026-09-28", "撤销回到执行日前");
  assert.ok(!raw(h, "50 日程待办/表单完成.md").includes("本周期完成"), "记录也撤掉");
});

test("抽屉里的状态四选一走 set-task-status：重复任务选「完成」同样只推进周期", async () => {
  const h = await setup();
  h.seedFile(
    "50 日程待办/抽屉完成.md",
    "---\ntype: task\ntitle: 抽屉完成\nstatus: todo\ndue: 2026-09-28\nrecurrence: weekly\nrecurrence_weekdays: [1, 3]\n---\n\n## 执行记录\n\n",
  );
  /* 抽屉的状态控件就是 set-task-status */
  await h.plugin.webPerform("set-task-status", "50 日程待办/抽屉完成.md", "done");
  await h.settle();
  const frontmatter = fm(h, "50 日程待办/抽屉完成.md");
  assert.equal(frontmatter.status, "todo", "抽屉里选完成也不写 done");
  assert.equal(frontmatter.due, "2026-09-30", "执行日滚到下一个周期");
  assert.ok(raw(h, "50 日程待办/抽屉完成.md").includes("本周期完成"), "记录照写");
  /* 顺带钉住这条边界：status 走不了「直接改字段」那条路 —— 否则它会绕过周期推进 */
  await h.plugin.webPerform("set-field", "50 日程待办/抽屉完成.md", JSON.stringify({ key: "status", value: "blocked" }));
  assert.ok(
    h.notices.some((notice) => notice.includes("不支持直接修改的字段")),
    "status 不该是可直接改的字段：" + h.notices.join(" | "),
  );
  assert.equal(fm(h, "50 日程待办/抽屉完成.md").status, "todo", "被拒之后状态不能变");
});

module.exports = { title: "02 插件数据操作", tests };
