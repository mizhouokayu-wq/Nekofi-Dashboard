"use strict";
/** 纯函数层：日期、状态、层级、筛选、frontmatter、路径归一化 */
const assert = require("node:assert/strict");
const { test, tests, setup, eqJson } = require("../util");

let H = null;
async function helpers() {
  if (!H) H = await setup({ seed: false, data: {} });
  return H.helpers;
}

test("dateOf 兼容个位月日、Date、moment 与非法日期", async () => {
  const h = await helpers();
  assert.equal(h.dateOf("2026-9-30"), "2026-09-30");
  assert.equal(h.dateOf("2026-09-30"), "2026-09-30");
  assert.equal(h.dateOf("  2026-9-3  "), "2026-09-03");
  assert.equal(h.dateOf("2026-02-30"), null, "2 月 30 日不是合法日期");
  assert.equal(h.dateOf("2026-13-01"), null);
  assert.equal(h.dateOf(""), null);
  assert.equal(h.dateOf(null), null);
  assert.equal(h.dateOf(undefined), null);
  assert.equal(h.dateOf(new Date(2026, 8, 30)), "2026-09-30");
  assert.equal(h.dateOf({ format: () => "2026-10-05" }), "2026-10-05");
  assert.equal(h.dateOf("not a date"), null);
});

test("today / daysUntil / addDays 使用注入时钟", async () => {
  const h = await helpers();
  assert.equal(h.today(), "2026-09-25");
  assert.equal(h.daysUntil("2026-09-30"), 5);
  assert.equal(h.daysUntil("2026-09-20"), -5);
  assert.equal(h.daysUntil(""), null);
  assert.equal(h.addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(h.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(h.addDays("2026-03-01", -1), "2026-02-28");
});

test("taskStatus 状态推导符合规格", async () => {
  const h = await helpers();
  assert.equal(h.taskStatus({}), "planning");
  assert.equal(h.taskStatus({ due: "2026-09-30" }), "todo");
  assert.equal(h.taskStatus({ due: "2026-9-10" }), "expired");
  assert.equal(h.taskStatus({ due: "2026-09-25" }), "todo", "当天到期属于待办");
  assert.equal(h.taskStatus({ status: "doing", due: "2026-09-30" }), "doing");
  assert.equal(h.taskStatus({ status: "blocked", due: "2026-09-30" }), "blocked");
  assert.equal(h.taskStatus({ status: "paused", due: "2026-09-30" }), "paused");
  assert.equal(h.taskStatus({ status: "completed" }), "completed");
  assert.equal(h.taskStatus({ status: "done" }), "done");
  assert.equal(h.taskStatus({ status: "archived", due: "2020-01-01" }), "archived");
  assert.equal(h.taskStatus({ frontmatter: { due: "2026-09-30" } }), "todo", "支持传入采集后的条目");
  assert.equal(h.taskStatus({ deadline: "2026-09-10" }), "expired", "deadline 作为 DDL 兜底");
});

test("projectStatus 状态推导符合规格", async () => {
  const h = await helpers();
  assert.equal(h.projectStatus({ status: "active", deadline: "2026-9-10" }), "expired");
  assert.equal(h.projectStatus({ status: "active", deadline: "2026-10-1" }), "active");
  assert.equal(h.projectStatus({}), "planning");
  assert.equal(h.projectStatus({ status: "completed", deadline: "2020-01-01" }), "completed");
  assert.equal(h.projectStatus({ status: "archived" }), "archived");
  assert.equal(h.projectStatus({ status: "paused" }), "paused");
  assert.equal(h.projectStatus({ status: "expired", deadline: "2026-10-31" }), "active", "过期标记可回退");
});

test("buildTimePlan 汇总每日分钟、超载与未排期", async () => {
  const h = await helpers();
  const plan = h.buildTimePlan([
    { frontmatter: { title: "写方案", due: "2026-09-25", duration: 45, status: "todo" } },
    { frontmatter: { title: "实现功能", due: "2026-09-25", duration: 90, status: "doing" } },
    { frontmatter: { title: "复盘", due: "2026-09-26", duration: 30, status: "todo" } },
    { frontmatter: { title: "未排期", duration: 20, status: "todo" } },
    { frontmatter: { title: "已完成", due: "2026-09-25", duration: 60, status: "completed" } },
    { frontmatter: { title: "归档", due: "2026-09-25", duration: 60, status: "archived" } }
  ], "2026-09-25", 2, 120);
  eqJson(plan.days.map((day) => ({ date: day.date, minutes: day.minutes, overloaded: day.overloaded })), [
    { date: "2026-09-25", minutes: 135, overloaded: true },
    { date: "2026-09-26", minutes: 30, overloaded: false }
  ]);
  assert.equal(plan.unscheduled.length, 1);
  assert.equal(plan.unscheduled[0].frontmatter.title, "未排期");
});

test("buildTimePlan 对越界日期与异常容量保持健壮", async () => {
  const h = await helpers();
  const plan = h.buildTimePlan([
    { frontmatter: { title: "太远", due: "2027-01-01", duration: 30, status: "todo" } }
  ], "2026-09-25", 3, 0);
  assert.equal(plan.days.length, 3);
  assert.equal(plan.days[0].capacity, 1, "容量下限为 1，避免除零");
  assert.equal(plan.days[0].minutes, 0, "规划周期外的任务不计入");
  assert.equal(plan.unscheduled.length, 0, "有日期但不落在周期内不属于未排期");
});

test("buildReminderMessages 覆盖逾期、到期、周一与其他日期", async () => {
  const h = await helpers();
  eqJson(h.buildReminderMessages({
    overdue: [{ frontmatter: { title: "补交材料" } }],
    upcoming: [{ frontmatter: { title: "今日评审", due: "2026-09-25" } }],
    inbox: []
  }, "2026-09-25"), ["有 1 项逾期任务", "今天有 1 项到期任务"]);
  eqJson(h.buildReminderMessages({ overdue: [], upcoming: [], inbox: [{}, {}] }, "2026-09-28"), ["本周草稿箱待清理：2 条"]);
  eqJson(h.buildReminderMessages({ overdue: [], upcoming: [], inbox: [{}, {}] }, "2026-09-29"), ["有 2 条未归类文档待分诊"]);
  eqJson(h.buildReminderMessages({}, "2026-09-29"), []);
  assert.equal(new Date("2026-09-28T00:00:00").getDay(), 1, "测试基准：2026-09-28 是周一");
});

test("buildTaskHierarchy 按任务集 → 任务组归并并保留顺序", async () => {
  const h = await helpers();
  const sets = h.buildTaskHierarchy([
    { frontmatter: { title: "收集资料", task_set: "本周维护", task_group: "资料整理" } },
    { frontmatter: { title: "整理引用", task_set: "本周维护", task_group: "资料整理" } },
    { frontmatter: { title: "清理收件箱", task_set: "本周维护", task_group: "执行" } },
    { frontmatter: { title: "临时任务", task_group: "未分组" } }
  ]);
  eqJson(sets.map((set) => ({ name: set.name, groups: set.groups.map((group) => ({ name: group.name, titles: group.tasks.map((task) => task.frontmatter.title) })) })), [
    { name: "本周维护", groups: [{ name: "资料整理", titles: ["收集资料", "整理引用"] }, { name: "执行", titles: ["清理收件箱"] }] },
    { name: "未分配任务集", groups: [{ name: "未分组", titles: ["临时任务"] }] }
  ]);
});

test("taskImportPatch 与 shouldSplitTask", async () => {
  const h = await helpers();
  eqJson(h.taskImportPatch("本周维护", "资料整理"), { type: "task", stage: "task", status: "planning", task_set: "本周维护", task_group: "资料整理" });
  assert.equal(h.shouldSplitTask({ duration: 20, due: "2026-10-05" }, "2026-09-25"), true);
  assert.equal(h.shouldSplitTask({ duration: 10, due: "2026-10-05" }, "2026-09-25"), false);
  assert.equal(h.shouldSplitTask({ duration: 30, due: "2026-09-29" }, "2026-09-25"), false);
  assert.equal(h.shouldSplitTask({ duration: 30 }, "2026-09-25"), true, "无 DDL 的长任务建议拆解");
});

test("buildResourceMap / resolveKnowledgeRefs 归类资源", async () => {
  const h = await helpers();
  const resources = h.buildResourceMap([
    { file: { path: "10 长期领域/健康.md" }, frontmatter: { type: "area" } },
    { file: { path: "30 知识库/图书库/设计.md" }, frontmatter: { type: "book" } },
    { file: { path: "30 知识库/视频/课程.md" }, frontmatter: { type: "video" } },
    { file: { path: "30 知识库/方法.md" }, frontmatter: { type: "knowledge" } },
    { file: { path: "40 人物库/同事.md" }, frontmatter: { type: "person" } }
  ], { areaFolder: "10 长期领域", knowledgeFolder: "30 知识库", peopleFolder: "40 人物库", bookFolder: "30 知识库/图书库" });
  eqJson(Object.fromEntries(Object.entries(resources).map(([key, items]) => [key, items.map((item) => item.file.path)])), {
    areas: ["10 长期领域/健康.md"],
    knowledge: ["30 知识库/方法.md"],
    people: ["40 人物库/同事.md"],
    books: ["30 知识库/图书库/设计.md"],
    videos: ["30 知识库/视频/课程.md"]
  });
  const linked = h.resolveKnowledgeRefs({ frontmatter: { knowledge_refs: ["[[方法]]", "30 知识库/图书库/设计.md", "不存在"] } }, resources);
  eqJson(linked.map((item) => item.file.path), ["30 知识库/方法.md", "30 知识库/图书库/设计.md"]);
  const deduped = h.resolveKnowledgeRefs({ frontmatter: { knowledge_refs: ["方法", "30 知识库/方法.md"] } }, resources);
  assert.equal(deduped.length, 1, "同一目标的多种写法只保留一条");
});

test("nextRecurringDate 处理日/周/月与闰年边界", async () => {
  const h = await helpers();
  assert.equal(h.nextRecurringDate("2026-09-25", "daily"), "2026-09-26");
  assert.equal(h.nextRecurringDate("2026-09-25", "weekly"), "2026-10-02");
  assert.equal(h.nextRecurringDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(h.nextRecurringDate("2027-01-31", "monthly"), "2027-02-28");
  assert.equal(h.nextRecurringDate("2024-01-31", "monthly"), "2024-02-29", "闰年 2 月 29 日");
  assert.equal(h.nextRecurringDate("2026-09-25", "none"), null);
  assert.equal(h.nextRecurringDate("", "daily"), null);
  assert.equal(h.nextRecurringDate("2026-09-25", "yearly"), null, "未知周期不生成下一条");
});

test("重复模式：ISO 周几 / 周几解析 / 每月几号（参考谷歌日历的每周、每月）", async () => {
  const h = await helpers();
  /* 独立于实现算出来的日历事实：2026-09-28 周一、09-30 周三、10-05 周一 */
  assert.equal(h.isoWeekday("2026-09-28"), 1);
  assert.equal(h.isoWeekday("2026-09-30"), 3);
  assert.equal(h.isoWeekday("2026-10-04"), 7, "周日是 7 而不是 0");
  assert.equal(h.isoWeekday(""), 0, "解析不出日期 → 0");

  eqJson(h.normalizeWeekdays([3, 1, 1, 9, "2", ""]), [1, 2, 3], "去重、排序、丢掉越界值");
  eqJson(h.normalizeWeekdays("1,3、5 7"), [1, 3, 5, 7], "兼容逗号 / 顿号 / 空格分隔");
  eqJson(h.normalizeWeekdays(undefined), []);
  eqJson(h.normalizeWeekdays("abc"), []);

  assert.equal(h.normalizeMonthDay("15"), 15);
  assert.equal(h.normalizeMonthDay(31), 31);
  assert.equal(h.normalizeMonthDay(0), 0);
  assert.equal(h.normalizeMonthDay("32"), 0, "越界当作未设置");
  assert.equal(h.normalizeMonthDay("abc"), 0);
  assert.equal(h.weekdayLabel(1), "周一");
  assert.equal(h.weekdayLabel(7), "周日");
  assert.equal(h.weekdayLabel(0), "");

  /* 下周几：严格晚于给定日期；已是命中日就往后再找一个 */
  assert.equal(h.nextRecurringDate("2026-09-28", "weekly", { weekdays: [3] }), "2026-09-30", "周一 → 最近的周三");
  assert.equal(h.nextRecurringDate("2026-09-30", "weekly", { weekdays: [3] }), "2026-10-07", "已是周三 → 下周三");
  assert.equal(
    h.nextRecurringDate("2026-09-30", "weekly", { weekdays: [1, 3, 5] }),
    "2026-10-02",
    "多选周几 → 取下一个命中（周五）",
  );
  assert.equal(h.nextRecurringDate("2026-09-30", "weekly", { weekdays: [] }), "2026-10-07", "没选周几 → 沿用旧的 +7 天");

  /* 每月几号：给定几号就按几号算；29/30/31 号顺延到当月最后一天 */
  assert.equal(h.nextRecurringDate("2026-09-15", "monthly", { monthday: 20 }), "2026-10-20");
  assert.equal(h.nextRecurringDate("2026-01-15", "monthly", { monthday: 31 }), "2026-02-28", "2 月没有 31 号");
  assert.equal(h.nextRecurringDate("2024-01-15", "monthly", { monthday: 31 }), "2024-02-29", "闰年顺延到 29 号");
  assert.equal(h.nextRecurringDate("2026-09-15", "monthly", { monthday: 0 }), "2026-10-15", "没给几号 → 沿用同号下月");

  /* 序列的第一次执行日：不早于参考日（今天命中就今天） */
  assert.equal(h.firstOccurrenceOnOrAfter("daily", {}, "2026-09-29"), "2026-09-29");
  assert.equal(h.firstOccurrenceOnOrAfter("weekly", { weekdays: [2] }, "2026-09-29"), "2026-09-29", "今天就是周二");
  assert.equal(h.firstOccurrenceOnOrAfter("weekly", { weekdays: [1] }, "2026-09-29"), "2026-10-05", "周二 → 下周一");
  assert.equal(h.firstOccurrenceOnOrAfter("weekly", { weekdays: [] }, "2026-09-29"), "2026-09-29", "没选周几 → 就从参考日开始");
  assert.equal(h.firstOccurrenceOnOrAfter("monthly", { monthday: 31 }, "2026-02-10"), "2026-02-28", "本月顺延日仍未过");
  assert.equal(h.firstOccurrenceOnOrAfter("monthly", { monthday: 31 }, "2026-03-01"), "2026-03-31", "3 月有 31 号");
  assert.equal(h.firstOccurrenceOnOrAfter("none", {}, "2026-09-29"), null);
  assert.equal(h.firstOccurrenceOnOrAfter("daily", {}, ""), null);
});

test("重复模式的 frontmatter 读取：兼容下划线 / 驼峰两种写法", async () => {
  const h = await helpers();
  eqJson(h.recurrenceWeekdaysOf({ recurrence_weekdays: [5, 1] }), [1, 5]);
  eqJson(h.recurrenceWeekdaysOf({ recurrenceWeekdays: "3,4" }), [3, 4]);
  eqJson(h.recurrenceWeekdaysOf({}), []);
  assert.equal(h.recurrenceMonthDayOf({ recurrence_monthday: 31 }), 31);
  assert.equal(h.recurrenceMonthDayOf({ recurrenceMonthday: "9" }), 9);
  assert.equal(h.recurrenceMonthDayOf({}), 0);
  assert.equal(h.recurrenceUntilOf({ recurrence_until: "2026-12-31" }), "2026-12-31");
  assert.equal(h.recurrenceUntilOf({}), "", "没有结束日 = 永不结束");
  assert.equal(h.recurrenceAnchorOf({ due: "2026-09-25" }), "2026-09-25", "锚点取本次执行日");
  assert.equal(h.recurrenceAnchorOf({ deadline: "2026-10-01" }), "2026-10-01");
});

test("resolveAssetPath 兼容省略扩展名、反斜杠与大小写", async () => {
  const h = await helpers();
  const paths = ["图片素材/Pasted image 20260925174151.jpg"];
  assert.equal(h.resolveAssetPath("图片素材/Pasted image 20260925174151", paths), paths[0]);
  assert.equal(h.resolveAssetPath("图片素材\\Pasted image 20260925174151", paths), paths[0]);
  assert.equal(h.resolveAssetPath("/图片素材/Pasted IMAGE 20260925174151.JPG", paths), paths[0]);
  assert.equal(h.resolveAssetPath("图片素材/不存在", paths), "");
  assert.equal(h.resolveAssetPath("", paths), "");
});

test("isImageAssetPath 过滤非图片与禁阅路径", async () => {
  const h = await helpers();
  assert.equal(h.isImageAssetPath("图片素材/a.jpg", "图片素材"), true);
  assert.equal(h.isImageAssetPath("图片素材/说明.md", "图片素材"), false);
  assert.equal(h.isImageAssetPath("图片素材/（AI禁止阅读）.jpg", "图片素材"), false);
  assert.equal(h.isImageAssetPath("其他/a.jpg", "图片素材"), false);
  eqJson(h.listImageAssetPaths(["图片素材/a.png", "图片素材/b.md", "图片素材/（AI禁止阅读）/c.png"], "图片素材"), ["图片素材/a.png"]);
  const nested = h.listImageAssetPaths(["图片素材/子目录/d.webp", "图片素材/e.gif"], "图片素材");
  eqJson(nested, ["图片素材/子目录/d.webp", "图片素材/e.gif"]);
  const folder = { path: "图片素材", children: [
    { path: "图片素材/a.png" },
    { path: "图片素材/子", children: [{ path: "图片素材/子/b.jpeg" }] },
    { path: "图片素材/（AI禁止阅读）", children: [{ path: "图片素材/（AI禁止阅读）/c.png" }] }
  ] };
  const collected = h.collectImageAssetFiles({ getAbstractFileByPath: () => folder }, "图片素材");
  eqJson(collected.map((file) => file.path), ["图片素材/a.png", "图片素材/子/b.jpeg"]);
  const fallback = h.collectImageAssetFiles({ getAbstractFileByPath: () => null, getFiles: () => [{ path: "图片素材/a.png" }, { path: "图片素材/x.md" }] }, "图片素材");
  eqJson(fallback.map((file) => file.path), ["图片素材/a.png"], "文件夹扫描为空时回退到 getFiles");
  const deduped = h.collectImageAssetFiles({ getAbstractFileByPath: () => folder, getFiles: () => [{ path: "图片素材/a.png" }] }, "图片素材");
  eqJson(deduped.map((file) => file.path), ["图片素材/a.png", "图片素材/子/b.jpeg"], "子目录结果不会被去重误删");
});

test("filterTaskList / sortTaskList 支持搜索、层级、状态与优先级", async () => {
  const h = await helpers();
  const tasks = [
    { frontmatter: { title: "写方案", task_set: "本周维护", task_group: "资料整理", status: "todo" }, taskStatus: "todo" },
    { frontmatter: { title: "整理收件箱", task_set: "本周维护", task_group: "执行", status: "doing" }, taskStatus: "doing" },
    { frontmatter: { title: "读书笔记", task_set: "学习", task_group: "阅读", status: "todo" }, taskStatus: "todo" }
  ];
  assert.equal(h.filterTaskList(tasks, { query: "方案" }).length, 1);
  assert.equal(h.filterTaskList(tasks, { query: "", taskSet: "本周维护" }).length, 2);
  assert.equal(h.filterTaskList(tasks, { status: "doing" }).length, 1);
  assert.equal(h.filterTaskList(tasks, { priority: "high" }).length, 0);
  assert.equal(h.filterTaskList(tasks, { taskGroup: "阅读" }).length, 1);
  assert.equal(h.filterTaskList(tasks, {}).length, 3);
  assert.equal(h.filterTaskList(null, {}).length, 0);

  const sorted = h.sortTaskList([
    { frontmatter: { title: "普通", due: "2026-09-27", priority: "low" } },
    { frontmatter: { title: "紧急", due: "2026-09-28", priority: "high" } },
    { frontmatter: { title: "今天", due: "2026-09-26", priority: "medium" } },
    { frontmatter: { title: "无期限", priority: "high" } }
  ]);
  eqJson(sorted.map((task) => task.frontmatter.title), ["今天", "普通", "紧急", "无期限"]);
  assert.equal(h.sortTaskList([{ frontmatter: { title: "A" } }, { frontmatter: { title: "B" } }]).length, 2, "同 DDL 时不应丢失任务");

  const sameDay = h.sortTaskList([
    { frontmatter: { title: "低", due: "2026-09-27", priority: "low" } },
    { frontmatter: { title: "高", due: "2026-09-27", priority: "high" } },
    { frontmatter: { title: "中", due: "2026-09-27" } }
  ]);
  eqJson(sameDay.map((task) => task.frontmatter.title), ["高", "中", "低"], "同 DDL 按优先级排序");
});

test("cleanName 保留归档文件名所需的方括号前缀", async () => {
  const h = await helpers();
  assert.equal(h.cleanName("普通任务"), "普通任务");
  assert.equal(h.cleanName("[仪表盘搭建] 完成首页文案"), "[仪表盘搭建] 完成首页文案");
  assert.equal(h.cleanName("非法/字符:测试"), "非法-字符-测试");
  assert.equal(h.cleanName("   "), "未命名");
  assert.equal(h.cleanName(""), "未命名");
});

test("parseFM / writeFM / makeMD 往返一致", async () => {
  const h = await helpers();
  const parsed = h.parseFM("---\ntype: task\ndue: 2026-9-30\nflag: true\ncount: 3\nlist: [\"a\",\"b\"]\n---\n正文\n");
  assert.equal(parsed.data.due, "2026-9-30");
  assert.equal(parsed.data.flag, true);
  assert.equal(parsed.data.count, 3);
  eqJson(parsed.data.list, ["a", "b"]);
  assert.equal(parsed.body, "正文\n");

  const written = h.writeFM("---\ntype: task\nstatus: todo\n---\n正文\n", { status: "doing", extra: "x" }, ["type"]);
  /* 纯文本值不再被加上引号：与手写 frontmatter 保持一致 */
  assert.ok(written.includes("status: doing"), "实际：" + JSON.stringify(written));
  assert.ok(written.includes("extra: x"), "实际：" + JSON.stringify(written));
  assert.ok(!written.includes("type:"));
  assert.ok(written.endsWith("正文\n"));

  const created = h.makeMD({ type: "task", title: "标题" }, "## 任务拆解\n");
  assert.ok(created.startsWith("---\n"));
  assert.ok(created.includes("title: 标题"), "实际：" + JSON.stringify(created));
  assert.ok(created.includes("## 任务拆解"));

  /* makeMD 往返不再累积空行 */
  const bodyWithBlank = "---\ntype: task\n---\n\n正文\n";
  const once = h.makeMD(h.parseFM(bodyWithBlank).data, h.parseFM(bodyWithBlank).body);
  const twice = h.makeMD(h.parseFM(once).data, h.parseFM(once).body);
  assert.equal(twice, once, "第二次往返必须与第一次完全一致，不能多出空行：" + JSON.stringify([once, twice]));

  const noFM = h.writeFM("没有 frontmatter 的正文", { a: 1 });
  assert.ok(noFM.startsWith("---\n"));
  assert.ok(h.parseFM(noFM).data.a === 1);
});

test("projectMatches / stripProjectPrefix / 路径工具", async () => {
  const h = await helpers();
  const project = { file: { path: "20 项目库/仪表盘搭建/仪表盘搭建.md" }, folderPath: "20 项目库/仪表盘搭建", frontmatter: { title: "仪表盘搭建" } };
  assert.equal(h.projectMatches({ frontmatter: { project: "20 项目库/仪表盘搭建/仪表盘搭建.md" } }, project), true);
  assert.equal(h.projectMatches({ frontmatter: { project: "仪表盘搭建" } }, project), true);
  assert.equal(h.projectMatches({ frontmatter: { project: "[[仪表盘搭建]]" } }, project), true);
  assert.equal(h.projectMatches({ frontmatter: { project: "别的项目" } }, project), false);
  assert.equal(h.projectMatches({ frontmatter: {} }, project), false);
  assert.equal(h.stripProjectPrefix("[仪表盘搭建] 完成首页文案", "仪表盘搭建"), "完成首页文案");
  assert.equal(h.stripProjectPrefix("完成首页文案", "仪表盘搭建"), "完成首页文案");
  assert.equal(h.nameOf("20 项目库/a.md"), "a");
  assert.equal(h.inFolder("20 项目库/a/b.md", "20 项目库"), true);
  assert.equal(h.inFolder("20 项目库2/a.md", "20 项目库"), false);
  assert.equal(h.directChild("20 项目库/a.md", "20 项目库"), true);
  assert.equal(h.directChild("20 项目库/a/b.md", "20 项目库"), false);
  assert.equal(h.forbiddenPath("（AI禁止阅读）秘密.md"), true);
  assert.equal(h.forbiddenPath("60 维护/AI禁止阅读/x.md"), true);
  assert.equal(h.forbiddenPath("20 项目库/a.md"), false);
});

test("normalizeList / refs / text / statusLabel / blockerItems", async () => {
  const h = await helpers();
  eqJson(h.normalizeList("a, b，c"), ["a", "b", "c"]);
  eqJson(h.normalizeList(["a", "", null]), ["a", "null"]);
  eqJson(h.refs("[[方法|别名]], 路径/笔记.md"), ["方法", "路径/笔记.md"]);
  assert.equal(h.text(undefined, "—"), "—");
  assert.equal(h.text(["a", "b"]), "a、b");
  assert.equal(h.text(0), "0");
  assert.equal(h.statusLabel("todo"), "待办");
  assert.equal(h.statusLabel("unknown"), "unknown");
  eqJson(h.blockerItems({ blockers: ["资金", "-", "资源"] }), ["资金", "资源"]);
  eqJson(h.blockerItems({ blocking_reason: "等待反馈" }), ["等待反馈"]);
  eqJson(h.blockerItems({}), []);
  const options = h.buildAssigneeOptions([{ file: { path: "40 人物库/同事.md" }, frontmatter: { title: "同事" } }], "外部顾问");
  assert.equal(options["40 人物库/同事.md"], "同事");
  assert.equal(options["外部顾问"], "外部顾问", "自定义执行者不会被丢弃");
  assert.equal(options[""], "不指定执行者");
});

test("computeBannerDisplay 在窄屏与宽屏都保持原始宽高比", async () => {
  const h = await helpers();
  eqJson(h.computeBannerDisplay(1600, 900, 700, 800), { w: 668, h: 376 });
  eqJson(h.computeBannerDisplay(1600, 900, 340, 500), { w: 308, h: 173 });
  const tiny = h.computeBannerDisplay(1600, 900, 100, 200);
  assert.ok(tiny.w > 0 && tiny.h > 0);
  assert.ok(Math.abs(tiny.w / tiny.h - 1600 / 900) < 0.03, "窄屏不应拉伸图片");
  assert.ok(tiny.w <= 128 && tiny.h <= 200, "结果必须落在可视范围内");
  const portrait = h.computeBannerDisplay(600, 1200, 700, 800);
  assert.ok(Math.abs(portrait.w / portrait.h - 0.5) < 0.05, "竖图保持原始宽高比");
  const tall = h.computeBannerDisplay(600, 1200, 700, 300);
  assert.ok(tall.h <= 180 || Math.abs(tall.w / tall.h - 0.5) < 0.05);
});

module.exports = { title: "01 纯函数与数据模型", tests };
