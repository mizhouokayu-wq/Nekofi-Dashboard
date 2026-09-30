"use strict";
/** 边界与数据保全：不丢用户 frontmatter、迁移旧结构、异常路径守卫 */
const assert = require("node:assert/strict");
const { test, tests, setup, eqJson } = require("../util");
const { VIEW, fm, raw, paths, exists, openModal, fill, submit, choose, checkItems } = require("../drive");

test("taskStatus 不再把显式的 doing / blocked / paused 静默改写成 planning", async () => {
  const h = await setup();
  assert.equal(h.helpers.taskStatus({ status: "blocked" }), "blocked");
  assert.equal(h.helpers.taskStatus({ status: "doing" }), "doing");
  assert.equal(h.helpers.taskStatus({ status: "paused" }), "paused");
  assert.equal(h.helpers.taskStatus({ status: "blocked", due: "2026-09-01" }), "blocked", "阻塞是手动状态，优先于过期推导");
  assert.equal(h.helpers.taskStatus({ status: "doing", due: "2026-09-01" }), "expired", "执行中遇到过期 DDL 仍按过期显示");
  assert.equal(h.helpers.taskStatus({}), "planning");
  assert.equal(h.helpers.taskStatus({ status: "planned" }), "planning");
  assert.equal(h.helpers.taskStatus({ due: "2026-09-30" }), "todo");
});

test("刷新不会覆盖用户手写的显式状态", async () => {
  const h = await setup();
  h.seedFile("50 日程待办/阻塞中的任务.md", "---\ntype: task\ntitle: 阻塞中的任务\nstatus: blocked\n---\n");
  h.seedFile("50 日程待办/暂停的任务.md", "---\ntype: task\ntitle: 暂停的任务\nstatus: paused\n---\n");
  await h.plugin.collectData();
  await h.settle();
  assert.equal(fm(h, "50 日程待办/阻塞中的任务.md").status, "blocked");
  assert.equal(fm(h, "50 日程待办/暂停的任务.md").status, "paused");
  assert.equal(h.vaultWrites, 0, "状态已正确时不应写盘");
});

test("parseFM 解析块状数组，writeFM 保留未涉及字段", async () => {
  const h = await setup();
  const source = "---\ntitle: 项目\nmilestones:\n  - 未分组\n  - 完成 MVP\nweight: 4\nstatus: active\n---\n正文\n";
  const parsed = h.helpers.parseFM(source);
  eqJson(parsed.data.milestones, ["未分组", "完成 MVP"]);
  assert.equal(parsed.data.weight, 4);
  assert.equal(parsed.body, "正文\n");

  const patched = h.helpers.writeFM(source, { status: "expired" });
  assert.ok(patched.includes("milestones"));
  assert.ok(patched.includes("weight: 4"));
  assert.ok(patched.includes("status: expired"), "实际：" + JSON.stringify(patched));
  assert.ok(patched.endsWith("正文\n"));
});

test("writeFM 的 removeKeys 会连块状数组一起删除", async () => {
  const h = await setup();
  const source = "---\ntitle: 任务\nblockers:\n  - 等待反馈\n  - 预算\nstatus: archived\n---\n正文\n";
  const patched = h.helpers.writeFM(source, { status: "todo" }, ["blockers"]);
  const parsed = h.helpers.parseFM(patched);
  assert.equal(parsed.data.blockers, undefined);
  assert.equal(parsed.data.status, "todo");
  assert.equal(parsed.data.title, "任务");
  assert.ok(!patched.includes("等待反馈"));
});

test("updateFM 回退路径删除归档标记但保留正文与数组字段", async () => {
  const h = await setup();
  /* 必须赋 null：processFrontMatter 是 FakeFileManager 的原型方法，`delete` 删不掉它，
     之前的写法让这条「回退路径」用例实际上一直在走 processFrontMatter。 */
  h.app.fileManager.processFrontMatter = null;
  const filePath = "50 日程待办/整理收件箱.md";
  h.seedFile(filePath, "---\ntype: task\ntitle: 整理收件箱\nstatus: archived\narchived_to: 90 归档库/孤立任务\nknowledge_refs:\n  - 方法\n---\n\n正文内容\n");
  const file = h.vault.getAbstractFileByPath(filePath);
  await h.plugin.updateFM(file, { status: "todo" }, ["archived_to"]);
  const written = raw(h, filePath);
  const parsed = h.helpers.parseFM(written);
  assert.equal(parsed.data.status, "todo");
  assert.equal(parsed.data.archived_to, undefined);
  eqJson(parsed.data.knowledge_refs, ["方法"]);
  /* writeFM 原样保留 `---` 之后的字节；原文在分隔符后有一个空行，所以正文以换行开头。
     这与 processFrontMatter 路径（会折叠空行）不同，但它是无损的那一种。 */
  assert.equal(parsed.body, "\n正文内容\n");
  assert.equal(written, "---\ntype: task\ntitle: 整理收件箱\nstatus: todo\nknowledge_refs:\n  - 方法\n---\n\n正文内容\n");
  assert.equal(h.consoleErrors.length, 0);
});

test("parseFM / writeFM 容忍 BOM 与前置空行，不再把 frontmatter 降级成正文", async () => {
  const h = await setup();

  const bom = "\uFEFF---\ntype: task\ntitle: BOM 任务\nstatus: todo\n---\n\n正文\n";
  const parsedBom = h.helpers.parseFM(bom);
  assert.equal(parsedBom.data.type, "task", "带 BOM 的 frontmatter 必须能解析");
  assert.equal(parsedBom.data.title, "BOM 任务");
  assert.equal(parsedBom.body, "\n正文\n");
  const writtenBom = h.helpers.writeFM(bom, { status: "doing" });
  assert.ok(writtenBom.startsWith("\uFEFF---"), "BOM 必须保留");
  assert.ok(writtenBom.includes("type: task") && writtenBom.includes("title: BOM 任务"),
    "原 frontmatter 必须仍是 frontmatter，不能被降级成正文");
  const reparsedBom = h.helpers.parseFM(writtenBom);
  assert.equal(reparsedBom.data.type, "task");
  assert.equal(reparsedBom.data.status, "doing");
  assert.equal(reparsedBom.body, "\n正文\n");

  const leading = "\n\n  ---\ntype: note\nstatus: planning\n---\n\n内容\n";
  assert.equal(h.helpers.parseFM(leading).data.type, "note", "`---` 之前的空白行不应导致解析失败");
  const writtenLeading = h.helpers.writeFM(leading, { status: "todo" });
  assert.ok(writtenLeading.startsWith("\n\n  ---"), "前置空行与缩进必须保留");
  assert.equal(h.helpers.parseFM(writtenLeading).data.status, "todo");
  assert.ok(writtenLeading.endsWith("\n\n内容\n"));
});

test("writeFM 对 patch 为空保持字节级不变（含 BOM / CRLF / 混行尾）", async () => {
  const h = await setup();
  const samples = [
    ["纯 LF", "---\ntype: task\ntitle: 甲\nstatus: todo\n---\n\n正文\n"],
    ["纯 CRLF，正文 LF", "---\r\ntype: task\r\ntitle: 乙\r\nstatus: todo\r\n---\r\n\n正文\n"],
    ["开头行 CRLF、内部 LF（真实库里就有这种文件）", "---\r\ntype: task-index\ntitle: 丙\nstatus: planning\nupdated: 2026-09-25\r\n---\n正文\n"],
    ["带 BOM", "\uFEFF---\ntype: task\ntitle: 丁\n---\n\n正文\n"],
    ["前置空行 + 缩进", "\n\n  ---\ntype: note\nstatus: planning\n---\n\n内容\n"],
    ["空 frontmatter", "---\n---\n正文\n"]
  ];
  samples.forEach(([label, source]) => {
    assert.equal(h.helpers.writeFM(source, {}), source, label + "：没有改动时不应改写任何字节");
    /* 同时确认没被解析成「无 frontmatter」而套壳重写 */
    assert.ok(h.helpers.parseFM(source).data.type || label === "空 frontmatter", label + "：frontmatter 必须能被解析出来");
  });
});

test("writeFM 遇到缺闭合分隔符的 frontmatter 拒绝写入", async () => {
  const h = await setup();
  const broken = "---\ntype: task\ntitle: 坏的\n正文混进来了\n";
  assert.throws(() => h.helpers.writeFM(broken, { status: "todo" }), /缺少闭合/,
    "宁可拒绝写入，也不能把整份文件套壳重写成「新 frontmatter + 原文件当正文」");
  assert.equal(h.helpers.parseFM(broken).body, broken, "解析不出时保持原样，不做任何改写");
  /* 完全没有 frontmatter 的笔记仍允许新建一块（分诊 / 知识沉淀路径依赖它） */
  const created = h.helpers.writeFM("没有 frontmatter 的正文", { a: 1 });
  assert.ok(created.startsWith("---\n"));
  assert.equal(h.helpers.parseFM(created).data.a, 1);
});

test("metadataCache 未索引时不回写状态，索引就绪后才按规格同步", async () => {
  const h = await setup();
  const filePath = "50 日程待办/刚同步进来的任务.md";
  h.seedFile(filePath, "---\ntype: task\ntitle: 刚同步进来的任务\nstatus: planning\ndue: 2026-09-30\n---\n");
  const original = h.metadataCache.getFileCache.bind(h.metadataCache);
  h.metadataCache.getFileCache = (file) => (file && file.path === filePath ? null : original(file));
  await h.plugin.collectData();
  await h.settle();
  assert.equal(h.vaultWrites, 0, "索引未就绪时不得用空 frontmatter 推导状态并回写");
  assert.equal(fm(h, filePath).status, "planning", "用户手写的状态必须原样保留");

  h.metadataCache.getFileCache = original;
  await h.plugin.collectData();
  await h.settle();
  assert.equal(fm(h, filePath).status, "planning", "索引就绪后也不会把用户选的「规划中」改成推导值");

  /* 只有"纯粹由时间推导出来"的过期会回写；其余三个手动状态（规划中/待办/完成）互不覆盖 */
  const overduePath = "50 日程待办/过期任务.md";
  h.seedFile(overduePath, "---\ntype: task\ntitle: 过期任务\nstatus: todo\ndue: 2026-09-01\n---\n");
  await h.plugin.collectData();
  await h.settle();
  assert.equal(fm(h, overduePath).status, "expired", "DDL 已过 → 自动标为过期");
});

test("后台状态同步不会用旧快照冲掉用户刚做的修改", async () => {
  const h = await setup({ seed: false });
  const first = await h.plugin.collectWebPayload();
  const overdue = (() => {
    const date = new Date(String(first.today) + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  })();
  const path = "50 日程待办/刚被点完成的任务.md";
  h.seedFile(path, "---\ntype: task\ntitle: 刚被点完成的任务\nstatus: todo\ndue: " + overdue + "\n---\n");

  /* 先采集一次（拿到"旧快照"：status 还是 todo），再让用户点完成，最后用旧快照跑同步 */
  const snapshot = await h.plugin.collectData();
  const file = h.vault.getFiles().find((item) => item.path === path);
  await h.plugin.setTaskStatus({ file, frontmatter: h.plugin.fm(file) }, "done");
  h.plugin.syncTaskStatuses(snapshot.allTasks);
  await h.settle();
  assert.equal(h.plugin.fm(file).status, "done", "旧快照算出的 expired 不能覆盖用户刚点的完成");

  /* 对照：真正没被操作过的过期任务，仍然要自动标成过期 */
  const other = "50 日程待办/真的过期了.md";
  h.seedFile(other, "---\ntype: task\ntitle: 真的过期了\nstatus: todo\ndue: " + overdue + "\n---\n");
  const fresh = await h.plugin.collectData();
  h.plugin.syncTaskStatuses(fresh.allTasks);
  await h.settle();
  assert.equal(h.plugin.fm(h.vault.getFiles().find((item) => item.path === other)).status, "expired", "没人动过的过期任务仍要自动标记");
});
test("CRLF 写入矩阵：所有会改已有笔记的操作都不引入裸 LF", async () => {
  const bareLf = (text) => (text.match(/(^|[^\r])\n/g) || []).length;
  const project = "20 项目库/CRLF矩阵/CRLF矩阵.md";
  const taskPath = "20 项目库/CRLF矩阵/矩阵任务.md";
  const body = "\r\n正文第一行\r\n\r\n- [ ] 事项一\r\n- [ ] 事项二\r\n";
  const seed = (h) => {
    h.seedFile(project, "---\r\ntype: project\r\ntitle: CRLF矩阵\r\nstatus: active\r\nmilestones:\r\n  - 第一步\r\n  - 第二步\r\n---\r\n");
    h.seedFile(taskPath, "---\r\ntype: task\r\ntitle: 矩阵任务\r\nstatus: todo\r\nproject: " + project + "\r\nmilestone: 第一步\r\nduration: 30\r\n---" + body);
    return h.vault.getFiles().find((file) => file.path === taskPath);
  };
  const check = (h, label) => {
    const raw = h.vault.__readRaw(taskPath);
    assert.equal(bareLf(raw), 0, label + " 后不应出现裸 LF");
    assert.ok(raw.indexOf("\r\n正文第一行\r\n") >= 0, label + " 后正文与换行风格仍应保留");
    return raw;
  };

  /* ① 状态（历史上这里直调 processFrontMatter，会把 frontmatter 段改成 LF） */
  const h1 = await setup({ seed: false });
  await h1.plugin.setTaskStatus({ file: seed(h1), frontmatter: h1.plugin.fm(seed(h1)) }, "blocked");
  await h1.settle();
  assert.equal(h1.plugin.fm(h1.vault.getFiles().find((file) => file.path === taskPath)).status, "blocked");
  check(h1, "改状态");

  /* ② 字段 */
  const h2 = await setup({ seed: false });
  const f2 = seed(h2);
  await h2.plugin.setNoteField({ file: f2, frontmatter: h2.plugin.fm(f2) }, JSON.stringify({ key: "priority", value: "high" }));
  await h2.settle();
  assert.equal(h2.plugin.fm(h2.vault.getFiles().find((file) => file.path === taskPath)).priority, "high");
  check(h2, "改字段");

  /* ③ 清单勾选 */
  const h3 = await setup({ seed: false });
  const f3 = seed(h3);
  await h3.plugin.checklistOp({ file: f3, frontmatter: h3.plugin.fm(f3) }, JSON.stringify({ op: "toggle", index: 0 }));
  await h3.settle();
  assert.ok(h3.vault.__readRaw(taskPath).indexOf("- [x] 事项一\r\n") >= 0, "勾选后应是 CRLF 的已勾选项");
  check(h3, "勾选清单");

  /* ④ 归档 + 撤销归档（批量入口走同一条路径） */
  const h4 = await setup({ seed: false });
  seed(h4);
  const data4 = await h4.plugin.collectData();
  const task4 = data4.allTasks.find((item) => item.file.path === taskPath);
  await h4.plugin.bulkArchiveTasks([taskPath], false);
  await h4.settle();
  const archivedPath = h4.vault.getFiles().map((file) => file.path).find((path) => path.startsWith("90 归档库") && path.includes("矩阵任务"));
  assert.ok(archivedPath, "应归档到归档库");
  assert.equal(bareLf(h4.vault.__readRaw(archivedPath)), 0, "归档后（含快照字段）不应出现裸 LF");
  await h4.plugin.bulkArchiveTasks([archivedPath], true);
  await h4.settle();
  assert.equal(bareLf(h4.vault.__readRaw(taskPath)), 0, "撤销归档后不应出现裸 LF");
  assert.ok(task4, "前置：任务存在");

  /* ⑤ 项目文档本身：改关键节点也要保住 CRLF */
  const h5 = await setup({ seed: false });
  seed(h5);
  const data5 = await h5.plugin.collectData();
  const project5 = data5.projects.find((item) => item.file.path === project);
  await h5.plugin.updateFM(project5.file, { milestones: ["改名后的第一步", "第二步"] });
  await h5.settle();
  const projectRaw = h5.vault.__readRaw(project);
  assert.equal(bareLf(projectRaw), 0, "改项目关键节点后不应出现裸 LF");
  assert.ok(projectRaw.indexOf("改名后的第一步") >= 0, "关键节点应写进去了");
  check(h5, "改项目关键节点（任务文件）");
});
test("状态同步只自动标过期：用户选的四个状态不被推导覆盖", async () => {
  const h = await setup({ seed: false });
  /* [手写状态, DDL, 期望落盘状态] */
  const cases = [
    ["planning", null, "planning", "无 DDL 且是规划中 → 保持"],
    ["todo", null, "todo", "无 DDL 的待办不能被推导成规划中（这正是用户会踩的坑）"],
    ["todo", "2026-12-31", "todo", "未来 DDL → 保持待办"],
    ["done", "2026-09-01", "done", "已完成不因为 DDL 过了被改成过期"],
    ["blocked", "2026-09-01", "blocked", "阻塞优先于过期"],
    ["todo", "2026-09-01", "expired", "唯一的自动回写：DDL 已过标为过期"]
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [status, due, expected, why] = cases[index];
    const path = "50 日程待办/状态用例" + index + ".md";
    h.seedFile(path, "---\ntype: task\ntitle: 状态用例" + index + "\nstatus: " + status + (due ? "\ndue: " + due : "") + "\n---\n");
    await h.plugin.collectData();
    await h.settle();
    assert.equal(h.plugin.fm(h.vault.getFiles().find((file) => file.path === path)).status, expected, why);
  }
});
test("移动类操作在 CRLF 笔记上保真：归档 / 撤销归档 / 分诊", async () => {
  const h = await setup({ seed: false });
  const bareLf = (text) => (text.match(/(^|[^\r])\n/g) || []).length;
  const frontmatter = ["---", "type: task", "title: CRLF归档任务", "status: todo",
    "project: 20 项目库/CRLF项目/CRLF项目.md", "milestone: 未分组", "duration: 30",
    "description: |", "  多行", "  描述", "---", ""].join("\r\n");
  const body = "## 任务拆解\r\n\r\n- [ ] 一步\r\n- [x] 两步\r\n\r\n> 引用一段\r\n\r\n";
  h.seedFile("20 项目库/CRLF项目/CRLF项目.md", "---\r\ntype: project\r\ntitle: CRLF项目\r\nstatus: active\r\n---\r\n");
  h.seedFile("50 日程待办/CRLF归档任务.md", frontmatter + body);

  const data = await h.plugin.collectData();
  const project = data.projects.find((item) => item.file.path === "20 项目库/CRLF项目/CRLF项目.md");
  const task = data.allTasks.find((item) => item.file.path === "50 日程待办/CRLF归档任务.md");
  assert.ok(project && task, "前置：项目与任务都要被识别");

  await h.plugin.archiveTask(task, project);
  await h.settle();
  const archivedPath = paths(h).find((item) => item.startsWith("90 归档库") && item.includes("CRLF归档任务"));
  assert.ok(archivedPath, "应归档到归档库，实际：" + paths(h).filter((item) => item.startsWith("90")).join(", "));
  const archivedRaw = raw(h, archivedPath);
  assert.equal(bareLf(archivedRaw), 0, "归档后不应出现裸 LF");
  assert.ok(archivedRaw.includes("- [ ] 一步\r\n") && archivedRaw.includes("> 引用一段\r\n"), "正文应逐行保留");
  assert.ok(archivedRaw.includes("description: |\r\n  多行\r\n  描述"), "块标量要原样保留");
  assert.equal(fm(h, archivedPath).status, "archived");
  assert.equal(fm(h, archivedPath).duration, 30, "其它字段不应被改动");

  /* 撤销归档：回到原路径与推导状态，正文与换行风格不变 */
  const archivedFile = h.vault.getAbstractFileByPath(archivedPath);
  await h.plugin.undoArchiveTask({ file: archivedFile, frontmatter: h.plugin.fm(archivedFile) }, project);
  await h.settle();
  /* 声明了 project 的任务，撤销归档后回到项目文件夹（这是既定语义，与 02 套件一致） */
  const restoredPath = "20 项目库/CRLF项目/CRLF归档任务.md";
  assert.ok(exists(h, restoredPath), "应回到项目文件夹，实际：" + paths(h).filter((item) => item.includes("CRLF归档任务")).join(", "));
  const restoredRaw = raw(h, restoredPath);
  assert.equal(bareLf(restoredRaw), 0, "撤销归档后不应出现裸 LF");
  assert.ok(restoredRaw.includes("- [x] 两步\r\n"), "正文保持");
  assert.equal(fm(h, restoredPath).status, "todo", "恢复后回到待办");

  /* 分诊：草稿搬家时内容与换行风格都要留住 */
  h.seedFile("00 草稿箱/CRLF草稿.md", "---\r\ntype: note\r\ntitle: CRLF草稿\r\n---\r\n\r\n# 想法\r\n\r\n- 要点一\r\n");
  h.plugin.openTriage(h.vault.getAbstractFileByPath("00 草稿箱/CRLF草稿.md"));
  await h.settle();
  await choose(h, "短期任务");
  const movedRaw = raw(h, "50 日程待办/CRLF草稿.md");
  assert.equal(bareLf(movedRaw), 0, "分诊后不应出现裸 LF");
  assert.ok(movedRaw.includes("# 想法\r\n\r\n- 要点一\r\n"), "草稿正文应保留");
  assert.equal(fm(h, "50 日程待办/CRLF草稿.md").type, "task");
});
test("dateOf 支持斜杠 / 点 / 中文日期与 8 位紧凑数字，非法日期仍拒绝", async () => {
  const h = await setup();
  const d = h.helpers.dateOf;
  assert.equal(d("2026/9/30"), "2026-09-30");
  assert.equal(d("2026.9.30"), "2026-09-30");
  assert.equal(d("2026年9月30日"), "2026-09-30");
  assert.equal(d("2026-9-30"), "2026-09-30", "原有格式不能回归");
  assert.equal(d("2026-09-30T08:00:00"), "2026-09-30");
  assert.equal(d(20261031), "2026-10-31", "8 位整数是紧凑日期，不是 1970 年的毫秒时间戳");
  assert.equal(d(20260230), null, "不存在的日期必须拒绝，而不是滚到 3 月 2 日");
  assert.equal(d("待定"), null);
  assert.equal(d(""), null);
  assert.equal(d(null), null);
});

test("DDL 声明了却解析不出日期时，不回写状态", async () => {
  const h = await setup();
  const filePath = "50 日程待办/DDL 待定.md";
  h.seedFile(filePath, "---\ntype: task\ntitle: DDL 待定\nstatus: todo\ndue: 待定\n---\n");
  await h.plugin.collectData();
  await h.settle();
  assert.equal(fm(h, filePath).status, "todo", "推导不可信时不得把用户的 todo 改写成 planning");
  assert.equal(h.vaultWrites, 0);
});

test("撤销归档把归档前手写的 completed 与 status 原样还原", async () => {
  const h = await setup();
  const filePath = "50 日程待办/已完成的任务.md";
  h.seedFile(filePath, "---\ntype: task\ntitle: 已完成的任务\nstatus: done\ncompleted: 2026-01-01\n---\n");
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.file.path === filePath);
  assert.ok(task, "任务应被采集到");

  await h.plugin.archiveTask(task);
  await h.settle();
  const archivedPath = paths(h).find((p) => p.startsWith("90") && p.includes("已完成的任务"));
  assert.ok(archivedPath, "归档文件应存在；实际：" + paths(h).filter((p) => p.startsWith("90")).join(", "));
  const archivedFile = h.vault.getAbstractFileByPath(archivedPath);
  const archivedFm = h.plugin.fm(archivedFile);
  assert.equal(archivedFm.status, "archived");
  assert.equal(archivedFm.archived_prev_status, "done", "归档前必须快照原状态");
  assert.equal(archivedFm.archived_prev_completed, "2026-01-01", "归档前必须快照手写的 completed");

  await h.plugin.undoArchiveTask({ file: archivedFile, frontmatter: archivedFm });
  await h.settle();
  const restoredPath = paths(h).find((p) => p.startsWith("50") && p.includes("已完成的任务"));
  assert.ok(restoredPath, "应回到日程待办；实际：" + paths(h).filter((p) => p.includes("已完成")).join(", "));
  const after = fm(h, restoredPath);
  assert.equal(after.completed, "2026-01-01", "手写的 completed 必须原样还原");
  assert.equal(after.status, "done", "原状态必须还原，而不是被推导成 planning");
  assert.equal(after.archived, undefined, "归档痕迹必须清干净");
  assert.equal(after.archived_prev_status, undefined, "快照字段必须清干净");
  assert.equal(after.archived_prev_completed, undefined);
});

test("分诊移动失败时草稿保持原样，不会被写成 type: task", async () => {
  const h = await setup();
  const file = h.vault.getAbstractFileByPath("00 草稿箱/待分诊.md");
  const before = raw(h, file.path);
  h.vault.rename = () => { throw new Error("模拟移动失败"); };
  h.plugin.openTriage(file);
  await h.settle();
  await choose(h, "短期任务");
  assert.ok(exists(h, "00 草稿箱/待分诊.md"), "移动失败时文件必须留在原处");
  assert.equal(raw(h, "00 草稿箱/待分诊.md"), before, "移动失败时草稿内容必须一字不变");
  assert.notEqual(fm(h, "00 草稿箱/待分诊.md").type, "task", "不得留下「留在草稿箱却已是 type: task」");
  assert.ok(h.notices.some((notice) => notice.includes("移动失败")), "实际：" + h.notices.join(" | "));
}, { allowConsoleErrors: true });

test("周维护批量导入：单条失败不影响其余，并如实上报", async () => {
  const h = await setup();
  const originalRename = h.vault.rename.bind(h.vault);
  h.vault.rename = (file, destination) => {
    if (String(destination).includes("灵感随手记")) throw new Error("模拟单条失败");
    return originalRename(file, destination);
  };
  h.plugin.importInboxAsTaskSet();
  await h.settle();
  await checkItems(h, ["灵感随手记", "待分诊"]);
  await h.settle();
  const form = h.lastFormModal();
  fill(form, { taskSet: "本周维护", taskGroup: "资料整理" });
  await submit(h, form);

  assert.ok(exists(h, "50 日程待办/待分诊.md"), "失败条目不应拖垮其余条目");
  assert.equal(fm(h, "50 日程待办/待分诊.md").type, "task");
  assert.ok(exists(h, "00 草稿箱/灵感随手记.md"), "失败的草稿必须留在原处");
  assert.notEqual(fm(h, "00 草稿箱/灵感随手记.md").type, "task", "失败的草稿不得被写成任务");
  assert.ok(h.notices.some((notice) => notice.includes("失败 1 条")), "必须如实上报失败条目；实际：" + h.notices.join(" | "));
}, { allowConsoleErrors: true });

test("周维护批量导入保持换行符：CRLF 草稿搬完仍是 CRLF，LF 草稿不出现 CR", async () => {
  const h = await setup({ seed: false });
  const bareLf = (text) => (text.match(/(^|[^\r])\n/g) || []).length;
  h.seedFile("00 草稿箱/CRLF草稿.md", "---\r\ntype: note\r\ntitle: CRLF草稿\r\n---\r\n\r\n# 想法\r\n\r\n- [ ] 要点一\r\n");
  h.seedFile("00 草稿箱/LF草稿.md", "---\ntype: note\ntitle: LF草稿\n---\n\n# 想法\n\n- [ ] 要点二\n");

  h.plugin.importInboxAsTaskSet();
  await h.settle();
  await checkItems(h, ["CRLF草稿", "LF草稿"]);
  await h.settle();
  const form = h.lastFormModal();
  fill(form, { taskSet: "本周维护", taskGroup: "资料整理" });
  await submit(h, form);

  const crlfRaw = raw(h, "50 日程待办/CRLF草稿.md");
  assert.equal(bareLf(crlfRaw), 0, "CRLF 草稿搬完不应出现裸 LF");
  assert.ok(crlfRaw.includes("# 想法\r\n\r\n- [ ] 要点一\r\n"), "CRLF 草稿正文应逐行保留");
  assert.equal(fm(h, "50 日程待办/CRLF草稿.md").task_set, "本周维护");
  assert.equal(fm(h, "50 日程待办/CRLF草稿.md").type, "task");

  const lfRaw = raw(h, "50 日程待办/LF草稿.md");
  assert.equal(lfRaw.includes("\r"), false, "LF 草稿不该被改成 CRLF");
  assert.ok(lfRaw.includes("# 想法\n\n- [ ] 要点二\n"), "LF 草稿正文应逐行保留");
});
test("同名笔记搬家不会互相覆盖：批量导入与归档都走唯一路径", async () => {
  const h = await setup({ seed: false });
  h.seedFile("00 草稿箱/灵感.md", "---\ntype: note\ntitle: 灵感\n---\n\n甲正文\n");
  h.seedFile("00 草稿箱/子目录/灵感.md", "---\ntype: note\ntitle: 灵感\n---\n\n乙正文\n");

  h.plugin.importInboxAsTaskSet();
  await h.settle();
  /* 两条草稿标签完全一样（都叫「灵感」），勾选助手按文本找第一处匹配 —— 这里直接勾满所有行 */
  const picker = h.lastModal();
  h.findByClass(picker.contentEl, "pp-multi-choice-row").forEach((row) => {
    const box = row.children[0];
    box.checked = true;
    box.dispatch("change");
  });
  await h.clickText(picker.contentEl, "继续");
  await h.settle();
  const form = h.lastFormModal();
  fill(form, { taskSet: "本周维护", taskGroup: "资料整理" });
  await submit(h, form);

  const imported = paths(h).filter((item) => item.startsWith("50 日程待办/") && item.includes("灵感"));
  assert.equal(imported.length, 2, "两条同名草稿都应在日程待办里，实际：" + imported.join(", "));
  const contents = imported.map((item) => raw(h, item));
  assert.ok(contents.some((text) => text.includes("甲正文")) && contents.some((text) => text.includes("乙正文")), "两条的正文都要在，不能只剩一条");

  /* 归档同名任务：第二条也必须落到新文件名 */
  h.seedFile("20 项目库/同名项目/同名项目.md", "---\ntype: project\ntitle: 同名项目\nstatus: active\n---\n");
  h.seedFile("20 项目库/同名项目/整理.md", "---\ntype: task\ntitle: 整理\nstatus: todo\nproject: 20 项目库/同名项目/同名项目.md\n---\n\n第一条\n");
  h.seedFile("20 项目库/同名项目/整理 2.md", "---\ntype: task\ntitle: 整理 2\nstatus: todo\nproject: 20 项目库/同名项目/同名项目.md\n---\n\n第二条\n");
  const data = await h.plugin.collectData();
  const project = data.projects.find((item) => item.file.path === "20 项目库/同名项目/同名项目.md");
  const tasks = data.allTasks.filter((item) => item.file.path.startsWith("20 项目库/同名项目/整理"));
  assert.equal(tasks.length, 2, "前置：两条同名任务");
  for (const task of tasks) {
    await h.plugin.archiveTask(task, project);
    await h.settle();
  }
  const archived = paths(h).filter((item) => item.startsWith("90 归档库") && item.includes("整理"));
  assert.equal(archived.length, 2, "两条归档都应存在，实际：" + archived.join(", "));
  assert.equal(new Set(archived).size, archived.length, "归档路径不能重复（否则后一条会覆盖前一条）");
});
test("buildTimePlan 用默认时长补齐没填 duration 的任务", async () => {
  const h = await setup();
  const tasks = [
    { frontmatter: { due: "2026-09-25" }, taskStatus: "todo" },
    { frontmatter: { due: "2026-09-25", duration: 45 }, taskStatus: "todo" }
  ];
  const withDefault = h.helpers.buildTimePlan(tasks, "2026-09-25", 1, 120, 30);
  assert.equal(withDefault.days[0].minutes, 75, "30（默认）+ 45 = 75，否则每日负载会算成 0 分钟");
  const withoutDefault = h.helpers.buildTimePlan(tasks, "2026-09-25", 1, 120);
  assert.equal(withoutDefault.days[0].minutes, 45, "不传默认时长时保持旧行为（向后兼容）");
});

test("设置归一化：反斜杠路径不会让仪表盘变空，数值被夹到合理区间", async () => {
  const h = await setup();
  h.plugin.settings.projectFolder = "20 项目库\\";
  h.plugin.settings.planningHorizonDays = "1e10";
  h.plugin.settings.reminderHour = "";
  await h.plugin.saveSettings();
  await h.settle();
  assert.equal(h.plugin.settings.projectFolder, "20 项目库", "反斜杠与尾部斜杠必须归一化");
  assert.equal(h.plugin.settings.planningHorizonDays, 365, "视野天数要有上界，否则 collectData 会抛 RangeError");
  assert.equal(h.plugin.settings.reminderHour, 9, "空串不能变成「0 点提醒」");
  assert.ok(h.notices.some((notice) => notice.includes("路径已自动归一化")), "实际：" + h.notices.join(" | "));
  const data = await h.plugin.collectData();
  assert.equal(data.projects.length, 1, "归一化后仍应扫到项目");
});

test("设置归一化：草稿箱与日程待办重名会被还原", async () => {
  const h = await setup();
  h.plugin.settings.inboxFolder = "50 日程待办";
  await h.plugin.saveSettings();
  await h.settle();
  assert.equal(h.plugin.settings.inboxFolder, "00 草稿箱", "重名目录会被还原，避免同一篇笔记既是草稿又是任务");
  assert.ok(h.notices.some((notice) => notice.includes("不能和别的目录相同")), "实际：" + h.notices.join(" | "));
});

test("提醒：当天没有内容时不消耗额度", async () => {
  const h = await setup({ seed: false });
  await h.plugin.checkReminders(true);
  await h.settle();
  assert.equal(h.pluginData.lastReminderDate || "", "", "没有提醒内容时不应写 lastReminderDate");
  assert.ok(h.notices.some((notice) => notice.includes("没有需要提醒")), "实际：" + h.notices.join(" | "));
});

test("提醒：关闭开关时手动检查会明确反馈", async () => {
  const h = await setup();
  h.plugin.settings.remindersEnabled = false;
  await h.plugin.checkReminders(true);
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("提醒已在设置中关闭")), "实际：" + h.notices.join(" | "));
  assert.equal(h.notices.filter((notice) => notice.startsWith("规划提醒")).length, 0, "关闭时不得发出提醒正文");
});

test("设置防抖保存不弹提示，离开设置页（flush）才提示一次", async () => {
  const h = await setup();
  h.plugin.settings.knowledgeFolder = "30 知识"; // 结构已建好，但这个目录不存在
  h.plugin.scheduleSaveSettings();
  await h.settle();
  assert.equal(h.notices.filter((notice) => notice.includes("这些目录还不存在")).length, 0, "输入过程中的自动保存不该弹提示：" + h.notices.join(" | "));
  h.plugin.flushSaveSettings();
  await h.settle();
  assert.equal(h.notices.filter((notice) => notice.includes("这些目录还不存在")).length, 0, "防抖已落盘时 flush 不再重复保存：" + h.notices.join(" | "));
  /* 离开设置页（SettingsTab.hide）会给出一次提示，同一个缺失组合不重复刷 */
  h.plugin.warnMissingFolders();
  h.plugin.warnMissingFolders();
  await h.settle();
  assert.equal(h.notices.filter((notice) => notice.includes("这些目录还不存在")).length, 1, "离开设置页提示一次即可：" + h.notices.join(" | "));
});

test("设置保存：结构已建好却少了配置目录时明确提示", async () => {
  const h = await setup();
  h.plugin.settings.knowledgeFolder = "30 知识"; // 手抄错：少一个字
  await h.plugin.saveSettings();
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("这些目录还不存在")), "实际：" + h.notices.join(" | "));
  assert.ok(h.notices.some((notice) => notice.includes("30 知识")), "提示里要点名目录：" + h.notices.join(" | "));

  /* 全新库：所有目录都不存在时不应该刷提示 */
  const fresh = await setup({ seed: false });
  await fresh.plugin.saveSettings();
  await fresh.settle();
  assert.equal(fresh.notices.filter((notice) => notice.includes("这些目录还不存在")).length, 0, "全新库不该据此刷提示：" + fresh.notices.join(" | "));
});

test("任务判定：项目目录里显式声明别的类型不当任务，且两套口径一致", async () => {
  const h = await setup();
  h.seedFile("20 项目库/仪表盘搭建/习惯记录.md", "---\ntype: habit\ntitle: 习惯记录\nstatus: todo\n---\n");
  h.seedFile("20 项目库/仪表盘搭建/手写子任务.md", "---\ntitle: 手写子任务\nstatus: todo\nproject: 20 项目库/仪表盘搭建/仪表盘搭建.md\n---\n");
  h.seedFile("50 日程待办/手写待办.md", "---\ntitle: 手写待办\n---\n");
  const data = await h.plugin.collectData();
  const taskPaths = data.allTasks.map((item) => item.file.path);
  assert.ok(!taskPaths.includes("20 项目库/仪表盘搭建/习惯记录.md"), "自定义类型的笔记不应被当成项目任务");
  assert.ok(taskPaths.includes("20 项目库/仪表盘搭建/手写子任务.md"), "没写 type 的项目子任务仍应被采集");
  assert.ok(taskPaths.includes("50 日程待办/手写待办.md"), "日程待办目录下没写 type 的笔记仍应被采集");
  assert.equal(fm(h, "20 项目库/仪表盘搭建/习惯记录.md").status, "todo", "自定义类型的笔记不该被回写状态");

  /* 插件视图与 Web 渲染层必须给出同一批任务，否则同一个界面两个数 */
  const payload = await h.plugin.collectWebPayload();
  eqJson(payload.tasks.map((item) => item.path).sort(), taskPaths.slice().sort());
});

test("updateFM 忽略非 TFile 输入", async () => {
  const h = await setup();
  await h.plugin.updateFM({ path: "x.md" }, { status: "todo" });
  await h.plugin.updateFM(null, { status: "todo" });
  assert.equal(h.consoleErrors.length, 0);
});

test("旧版平铺项目文档会被迁移到项目文件夹", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/旧项目.md", "---\ntype: project\ntitle: 旧项目\nstatus: active\n---\n\n正文\n");
  const data = await h.plugin.collectData();
  const project = data.projects[0];
  assert.equal(project.folderPath, "", "平铺项目没有 folderPath");
  const folder = await h.plugin.ensureProjectFolder(project);
  assert.equal(folder, "20 项目库/旧项目");
  assert.ok(exists(h, "20 项目库/旧项目/旧项目.md"));
  assert.ok(!exists(h, "20 项目库/旧项目.md"));
  assert.ok(h.notices.some((notice) => notice.includes("迁移到项目文件夹")));
});

test("平铺项目归档时先迁移再合并", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/旧项目.md", "---\ntype: project\ntitle: 旧项目\nstatus: active\n---\n");
  h.seedFile("90 归档库/旧项目/[旧项目] 已完成任务.md", "---\ntype: task\ntitle: 已完成任务\nstatus: archived\n---\n");
  const project = (await h.plugin.collectData()).projects[0];
  await h.plugin.archiveProject(project);
  await h.settle();
  assert.ok(exists(h, "90 归档库/旧项目/旧项目.md"), "实际：" + paths(h).filter((p) => p.startsWith("90")).join(", "));
  assert.ok(exists(h, "90 归档库/旧项目/[旧项目] 已完成任务.md"), "既有归档内容不能被覆盖");
  assert.ok(!exists(h, "90 归档库/旧项目 2"));
});

test("任务可以在项目之间移动，也可以移出项目", async () => {
  const h = await setup({ seed: false });
  h.seedFile("20 项目库/甲/甲.md", "---\ntype: project\ntitle: 甲\nstatus: active\nmilestones: [\"未分组\"]\n---\n");
  h.seedFile("20 项目库/乙/乙.md", "---\ntype: project\ntitle: 乙\nstatus: active\nmilestones: [\"未分组\"]\n---\n");
  h.seedFile("20 项目库/甲/任务.md", "---\ntype: task\ntitle: 任务\nstatus: todo\nproject: 20 项目库/甲/甲.md\nmilestone: 未分组\ndue: 2026-10-01\n---\n");
  let data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "任务");

  let modal = await openModal(h, () => h.plugin.editTask(task));
  fill(modal, { project: "20 项目库/乙/乙.md" });
  await submit(h, modal);
  assert.ok(exists(h, "20 项目库/乙/任务.md"), "实际：" + paths(h).filter((p) => p.includes("任务")).join(", "));
  assert.equal(fm(h, "20 项目库/乙/任务.md").project, "20 项目库/乙/乙.md");

  data = await h.plugin.collectData();
  const moved = data.allTasks.find((item) => item.frontmatter.title === "任务");
  modal = await openModal(h, () => h.plugin.editTask(moved));
  fill(modal, { project: "" });
  await submit(h, modal);
  assert.ok(exists(h, "50 日程待办/任务.md"), "实际：" + paths(h).filter((p) => p.includes("任务")).join(", "));
  const frontmatter = fm(h, "50 日程待办/任务.md");
  assert.equal(frontmatter.project, "");
  assert.equal(frontmatter.milestone, "");
});

test("周维护导入兼容单条草稿的旧调用", async () => {
  const h = await setup();
  const file = h.vault.getAbstractFileByPath("00 草稿箱/待分诊.md");
  h.plugin.importInboxAsTaskSet(file);
  await h.settle();
  const form = h.lastFormModal();
  assert.ok(form, "单条导入也应打开任务集表单");
  fill(form, { taskSet: "临时任务集", taskGroup: "收件箱" });
  await submit(h, form);
  assert.ok(exists(h, "50 日程待办/待分诊.md"));
  assert.equal(fm(h, "50 日程待办/待分诊.md").task_set, "临时任务集");
  assert.ok(exists(h, "00 草稿箱/灵感随手记.md"), "未选中的草稿不应被移动");
});

test("重复归档同一个任务时给出提示且不生成重复文件", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "整理收件箱");
  await h.plugin.archiveTask(task);
  await h.settle();
  const afterFirst = paths(h).filter((filePath) => filePath.startsWith("90 归档库/孤立任务")).sort();
  eqJson(afterFirst, ["90 归档库/孤立任务/2026-09-25 整理收件箱.md"]);
  h.notices.length = 0;
  await h.plugin.archiveTask(task);
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("已经归档")), "实际提示：" + h.notices.join(" | "));
  eqJson(paths(h).filter((filePath) => filePath.startsWith("90 归档库/孤立任务")).sort(), afterFirst, "不应产生日期重复的归档文件");
  assert.equal(h.consoleErrors.length, 0);
});

test("归档非重复任务不会生成多余文件", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const task = data.allTasks.find((item) => item.frontmatter.title === "整理收件箱");
  const before = paths(h).length;
  await h.plugin.archiveTask(task);
  await h.settle();
  assert.equal(paths(h).length, before, "归档只移动文件，不新增文件");
});

test("删除不存在的关键节点是安全的", async () => {
  const h = await setup();
  const project = (await h.plugin.collectData()).projects[0];
  await h.plugin.deleteMilestone(project, "不存在的节点");
  await h.settle();
  await submit(h, h.lastModal());
  assert.ok(fm(h, project.file.path).milestones.includes("完成 MVP"), "既有节点不应被误删");
  assert.equal(h.consoleErrors.length, 0);
});

test("getMilestones 兼容逗号字符串并合并任务上的节点", async () => {
  const h = await setup();
  const project = { frontmatter: { milestones: "未分组, 完成 MVP" }, file: { path: "20 项目库/x/x.md" } };
  const tasks = [{ frontmatter: { milestone: "上线验收" } }, { frontmatter: { milestone: "完成 MVP" } }];
  eqJson(h.plugin.getMilestones(project, tasks), ["未分组", "完成 MVP", "上线验收"]);
  eqJson(h.plugin.getMilestones({ frontmatter: {} }, []), ["未分组"]);
});

test("草稿箱为空时分诊给出提示", async () => {
  const h = await setup({ seed: false });
  h.plugin.triageInbox();
  await h.settle();
  assert.ok(h.notices.some((notice) => notice.includes("草稿箱为空")));
});

test("projectStats 优先使用显式 progress", async () => {
  const h = await setup();
  const data = await h.plugin.collectData();
  const project = data.projects[0];
  assert.equal(project.progress, 0);
  h.seedFile("20 项目库/仪表盘搭建/带进度.md", "---\ntype: project\ntitle: 带进度\nstatus: active\nprogress: 42\n---\n");
  const again = await h.plugin.collectData();
  const explicit = again.projects.find((item) => item.frontmatter.title === "带进度");
  assert.equal(explicit.progress, 42);
  assert.equal(explicit.total, 0);
});

test("五类视图同时打开时刷新互不干扰", async () => {
  const h = await setup();
  await h.plugin.activateDashboard();
  await h.plugin.activateInbox();
  await h.plugin.activateTasks();
  await h.plugin.activateResources("knowledge");
  const project = (await h.plugin.collectData()).projects[0];
  await h.openView(VIEW.project, { path: project.file.path });
  await h.settle();
  h.resetWriteLog();
  const file = h.vault.getAbstractFileByPath("50 日程待办/整理收件箱.md");
  await h.vault.modify(file, raw(h, file.path) + "\n补充\n");
  await h.settle();
  assert.equal(h.consoleErrors.length, 0, h.consoleErrors.join(" | "));
  assert.equal(h.stormDetected, false);
  [VIEW.dashboard, VIEW.inbox, VIEW.tasks, VIEW.resources, VIEW.project].forEach((type) => {
    const leaves = h.workspace.getLeavesOfType(type);
    assert.equal(leaves.length, 1, type + " 应只有一个 leaf");
    const root = leaves[0].containerEl.children[1];
    assert.ok(h.findByClass(root, "pp-navigation").length <= 1);
  });
  const dashboard = h.workspace.getLeavesOfType(VIEW.dashboard)[0];
  assert.equal(h.findByClass(dashboard.containerEl.children[1], "pp-dashboard-hero").length, 1);
});

test("归档图书 / 沉淀知识缺口 / 关于我笔记的异常路径有守卫", async () => {
  const h = await setup();
  h.plugin.archiveBook({ file: { path: "30 知识库/图书库/不存在.md" } });
  await h.settle();
  await submit(h, h.lastModal(), "归档图书");
  assert.ok(h.notices.some((notice) => notice.includes("图书文件已经不存在")), "实际：" + h.notices.join(" | "));

  h.notices.length = 0;
  await assert.rejects(() => h.plugin.createKnowledgeFromGap({ file: { path: "20 项目库/缺失.md" }, frontmatter: {} }, "标题"), /已经不存在/);
  await assert.rejects(() => h.plugin.createKnowledgeFromGap({ file: { path: "50 日程待办/整理收件箱.md" }, frontmatter: {} }, "   "), /不能为空/);
  await assert.rejects(() => h.plugin.openPersonalNote("30 知识库/越权.md", "越权"), /不在长期领域目录内/);
  await assert.rejects(() => h.plugin.openPersonalNote("10 长期领域/（AI禁止阅读）.md", "禁阅"), /不在长期领域目录内/);
});

test("sortTaskList 不修改传入数组", async () => {
  const h = await setup();
  const input = [
    { frontmatter: { title: "后", due: "2026-09-30" } },
    { frontmatter: { title: "前", due: "2026-09-20" } }
  ];
  const sorted = h.helpers.sortTaskList(input);
  assert.equal(input[0].frontmatter.title, "后", "原数组顺序不应被改变");
  assert.equal(sorted[0].frontmatter.title, "前");
});

test("filterTaskList 搜索忽略大小写并支持中文", async () => {
  const h = await setup();
  const tasks = [{ frontmatter: { title: "Write Docs" } }, { frontmatter: { title: "写文档" } }];
  assert.equal(h.helpers.filterTaskList(tasks, { query: "write" }).length, 1);
  assert.equal(h.helpers.filterTaskList(tasks, { query: "WRITE" }).length, 1);
  assert.equal(h.helpers.filterTaskList(tasks, { query: "文档" }).length, 1);
  assert.equal(h.helpers.filterTaskList(tasks, { query: "  " }).length, 2);
});

test("buildTimePlan 使用 frontmatter 状态而不是采集字段", async () => {
  const h = await setup();
  const plan = h.helpers.buildTimePlan([
    { frontmatter: { title: "已归档", due: "2026-09-25", duration: 30, status: "archived" }, taskStatus: "todo" }
  ], "2026-09-25", 3, 120);
  assert.equal(plan.days[0].minutes, 0, "frontmatter 中已归档的任务不应计入");
  assert.equal(plan.unscheduled.length, 0);
});

test("索引类笔记不会被当成任务采集或改写", async () => {
  const h = await setup();
  h.seedFile("50 日程待办/日程待办.md", "---\ntype: task-index\ntitle: 日程待办\nstatus: planning\nupdated: 2026-09-25\n---\n\n首页占位说明\n");
  const data = await h.plugin.collectData();
  assert.ok(!data.tasks.some((item) => item.frontmatter.type === "task-index"), "索引页不应出现在任务列表");
  assert.equal(h.plugin.isTaskFile({ path: "50 日程待办/日程待办.md" }, { type: "task-index" }), false);
  h.resetWriteLog();
  await h.plugin.collectData();
  await h.settle();
  assert.equal(h.vaultWrites, 0, "索引页的 frontmatter 不应被插件改写");
  assert.ok(data.tasks.some((item) => item.frontmatter.title === "整理收件箱"), "普通任务仍然被采集");
});

test("没有 frontmatter 的草稿仍会出现在草稿箱", async () => {
  const h = await setup({ seed: false });
  h.seedFile("00 草稿箱/空草稿.md", "");
  const data = await h.plugin.collectData();
  assert.deepEqual(data.inbox.map((item) => item.file.path), ["00 草稿箱/空草稿.md"]);
  const leaf = await h.openView(VIEW.inbox);
  await h.settle();
  assert.ok(h.textOf(leaf.containerEl.children[1]).includes("空草稿"));
});

module.exports = { title: "05 边界与数据保全", tests };
