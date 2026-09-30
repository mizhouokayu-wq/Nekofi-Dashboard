/**
 * 生成演示数据集：web/data.sample.js
 *
 * 演示数据不是手写的静态 JSON，而是用与插件相同的纯函数层推导出来的，
 * 因此「演示数据」和「真实数据」的状态、时间规划、任务层级口径完全一致。
 * 日期相对于运行当天生成，页面永远看起来是「活的」。
 *
 * 用法：node tools/build-sample.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { loadPluginHelpers, WEB_DIR } from "./plugin-helpers.mjs";

const helpers = loadPluginHelpers();
/* 演示数据集用**默认设置**生成，不读本机 data.json：
   否则同一份脚本在不同机器上会产出不同的 data.sample.js，仓库里就会出现假漂移。 */
const settings = helpers.DEFAULTS;
const TODAY = helpers.today();
const shift = (days) => helpers.addDays(TODAY, days);

const PROJECTS = [
  {
    title: "个人网站上线", status: "active", deadline: shift(18), area: "事业", weight: 5,
    outcome: "公开可访问的个人主页，能承接作品与联系方式",
    acceptance: "首页 / 作品页 / 联系页可访问，移动端可用，Lighthouse 性能 ≥ 90",
    constraints: "预算 0 元，只用静态托管", milestones: ["未分组", "完成 MVP", "上线验收"],
    blockers: [],
    body: "## 项目推演\n\n### 关键节点\n\n- 完成 MVP\n- 上线验收\n"
  },
  {
    title: "年度体检与体能计划", status: "active", deadline: shift(46), area: "健康", weight: 4,
    outcome: "体检指标回到正常区间，每周稳定运动 3 次",
    acceptance: "连续 8 周每周运动 ≥ 3 次；体检复查指标达标",
    constraints: "每周可投入 4 小时", milestones: ["未分组", "体检预约", "建立习惯"],
    blockers: ["周三加班与健身房时间冲突"],
    body: "## 项目推演\n"
  },
  {
    title: "知识库体系升级", status: "active", deadline: shift(-3), area: "知识管理", weight: 3,
    outcome: "知识库有清晰的分类与引用规范，能被项目直接复用",
    acceptance: "每个长期领域都有索引页；项目任务能引用到知识笔记",
    constraints: "每晚 30 分钟", milestones: ["未分组", "分类规范"],
    blockers: ["分类维度还没想清楚", "旧笔记太多，迁移成本高"],
    body: "## 项目推演\n"
  },
  {
    title: "副业收入实验", status: "planning", deadline: "", area: "财富", weight: 2,
    outcome: "验证一个能带来第一笔外部收入的路径",
    acceptance: "完成 3 次小规模尝试，其中 1 次产生收入",
    constraints: "启动资金 ≤ 500 元", milestones: ["未分组", "选方向"],
    blockers: [],
    body: "## 项目推演\n"
  }
];

/** [标题, 项目, 节点, 状态, 截止偏移(天), 时长, 优先级, 任务集, 任务组, 执行者, 知识引用, 周期, 拆解进度] */
const TASKS = [
  ["完成首页文案", "个人网站上线", "完成 MVP", "todo", 2, 90, "high", "本周维护", "内容产出", "自己", ["写作模板"], "none", [2, 3]],
  ["设计首页信息结构", "个人网站上线", "完成 MVP", "doing", 1, 60, "high", "本周维护", "内容产出", "自己", [], "none", [1, 2]],
  ["搭好静态托管与域名", "个人网站上线", "完成 MVP", "todo", 5, 45, "medium", "本周维护", "工程实现", "同事", ["部署清单"], "none", [0, 2]],
  ["整理作品集素材", "个人网站上线", "未分组", "todo", 9, 120, "medium", "本周维护", "素材整理", "", [], "none", [1, 4]],
  ["上线前全站走查", "个人网站上线", "上线验收", "todo", 16, 60, "low", "深度工作", "验收", "", [], "none", [0, 3]],

  ["预约体检并确认项目", "年度体检与体能计划", "体检预约", "todo", 3, 30, "high", "本周维护", "生活事务", "自己", [], "none", [1, 1]],
  ["确认体检前注意事项", "年度体检与体能计划", "体检预约", "blocked", 4, 20, "medium", "本周维护", "生活事务", "", [], "none", [0, 1]],
  ["本周三次力量训练", "年度体检与体能计划", "建立习惯", "doing", 6, 180, "medium", "生活管理", "运动", "自己", ["训练计划"], "weekly", [1, 3]],
  ["记录一周饮食与睡眠", "年度体检与体能计划", "建立习惯", "todo", 0, 25, "low", "生活管理", "记录", "", [], "daily", [2, 2]],
  ["复盘近期体能与体重变化", "年度体检与体能计划", "未分组", "paused", 22, 40, "medium", "生活管理", "复盘", "", [], "none", [0, 1]],

  ["写知识库分类规范初稿", "知识库体系升级", "分类规范", "doing", -1, 75, "high", "本周维护", "资料整理", "自己", ["分类方法"], "none", [1, 3]],
  ["迁移旧笔记到新分类", "知识库体系升级", "分类规范", "todo", 8, 150, "medium", "深度工作", "迁移", "", [], "none", [0, 6]],
  ["为长期领域建索引页", "知识库体系升级", "未分组", "todo", 12, 60, "medium", "深度工作", "迁移", "", ["索引页范例"], "none", [1, 4]],
  ["给每个项目补验收标准", "知识库体系升级", "未分组", "todo", 15, 50, "low", "深度工作", "验收", "", [], "none", [0, 4]],

  ["调研三个可行的副业方向", "副业收入实验", "选方向", "planning", 0, 90, "medium", "生活管理", "调研", "", [], "none", [0, 3]],
  ["访谈一位在做同类副业的朋友", "副业收入实验", "选方向", "planning", 0, 45, "low", "生活管理", "调研", "同事", ["访谈提纲"], "none", [0, 2]],

  ["整理本月账单与现金流", "", "未分组", "todo", 4, 40, "high", "生活管理", "财务", "自己", [], "monthly", [1, 2]],
  ["给书桌做一次彻底整理", "", "未分组", "todo", 6, 60, "low", "生活管理", "家务", "", [], "none", [0, 2]],
  ["梳理移动端适配清单", "", "未分组", "todo", 7, 45, "medium", "本周维护", "工程实现", "", [], "none", [0, 2]],
  ["完成一次周复盘并更新方向", "", "未分组", "todo", 0, 30, "medium", "本周维护", "复盘", "自己", ["复盘模板"], "weekly", [1, 3]]
];

const GAPS = [
  ["学习用 Grid 做响应式布局", "个人网站上线", "完成 MVP", "todo", 4, 60, "medium", "本周维护", "内容产出", "自己", [], "none"],
  ["搞懂 Lighthouse 性能优化项", "个人网站上线", "上线验收", "planning", 0, 45, "low", "深度工作", "工程实现", "", [], "none"],
  ["掌握体能训练的动作标准", "年度体检与体能计划", "建立习惯", "doing", 10, 90, "medium", "生活管理", "运动", "自己", [], "none"]
];

const INBOX = [
  ["随手记：网站配色灵感", "inbox"],
  ["未归类：体检报告要点摘录", "inbox"],
  ["临时想法：把周复盘做成固定模板", "inbox"]
];

const RESOURCES = {
  knowledge: [
    ["写作模板", "知识积累", ["结构化写作", "开头三选一", "结尾给行动"]] ,
    ["分类方法", "知识管理", ["按用途分类", "按领域分类", "混合分类的取舍"]],
    ["复盘模板", "知识管理", ["事实", "原因", "下一步"]],
    ["部署清单", "工程实践", ["构建", "域名", "回滚预案"]],
    ["访谈提纲", "沟通协作", ["背景", "关键决策", "踩过的坑"]]
  ],
  books: [["《设计心理学》", "未读完"], ["《深度工作》", "在读"], ["《掌控习惯》", "未开始"]],
  videos: [["Grid 布局实战课", "未看完"], ["体能训练基础课", "进行中"]],
  people: [["同事", "工程协作"], ["健身教练", "体能计划"], ["老朋友", "副业经验"]],
  areas: [["事业", 2], ["健康", 1], ["知识管理", 1], ["财富", 1], ["关于我", 0], ["财富相关", 0]]
};

function makeTasks() {
  return TASKS.concat(GAPS).map((row, index) => {
    const [title, project, milestone, status, dueOffset, duration, priority, taskSet, taskGroup, assignee, refs, recurrence] = row;
    const checklist = row[12] || [0, 0];
    const isGap = GAPS.includes(row);
    const due = dueOffset === 0 && status === "planning" ? "" : shift(dueOffset);
    const frontmatter = {
      type: isGap ? "knowledge-gap" : "task",
      title, status, project, milestone,
      due, duration, priority,
      task_set: taskSet, task_group: taskGroup,
      assignee, recurrence,
      knowledge_refs: refs
    };
    return {
      path: (project ? ("20 项目库/" + project + "/") : "50 日程待办/") + title + ".md",
      name: title,
      title,
      frontmatter,
      summary: isGap ? "需要补齐的知识缺口，沉淀后回写引用。" : "来自演示数据集的示例任务。",
      checklist: { done: checklist[0], open: checklist[1] - checklist[0], total: checklist[1] },
      status: helpers.taskStatus({ frontmatter }),
      statusLabel: helpers.statusLabel(helpers.taskStatus({ frontmatter })),
      projectPath: project ? "20 项目库/" + project + "/" + project + ".md" : "",
      projectTitle: project,
      milestone: milestone || "未分组",
      taskSet: taskSet || "未分配任务集",
      taskGroup: taskGroup || "未分组",
      due: helpers.dateOf(due),
      daysLeft: helpers.daysUntil(due),
      duration,
      priority,
      assignee,
      recurrence,
      knowledgeRefs: refs,
      type: frontmatter.type,
      suggestion: helpers.shouldSplitTask(frontmatter, TODAY),
      index
    };
  });
}

const tasks = makeTasks();
const projects = PROJECTS.map((project) => {
  const owned = tasks.filter((task) => task.projectTitle === project.title);
  const done = owned.filter((task) => ["done", "completed", "archived"].includes(task.status)).length;
  const frontmatter = {
    type: "project", title: project.title, status: project.status, deadline: project.deadline,
    area: project.area, weight: project.weight, milestones: project.milestones
  };
  return {
    path: "20 项目库/" + project.title + "/" + project.title + ".md",
    name: project.title,
    title: project.title,
    frontmatter,
    summary: project.outcome,
    checklist: { done: 1, open: 2, total: 3 },
    status: helpers.projectStatus({ frontmatter }),
    statusLabel: helpers.statusLabel(helpers.projectStatus({ frontmatter })),
    progress: owned.length ? Math.round(done / owned.length * 100) : 0,
    done,
    total: owned.length,
    deadline: helpers.dateOf(project.deadline),
    daysLeft: helpers.daysUntil(project.deadline),
    outcome: project.outcome,
    acceptance: project.acceptance,
    area: project.area,
    weight: project.weight,
    constraints: project.constraints,
    milestones: project.milestones,
    blockers: project.blockers,
    taskPaths: owned.map((task) => task.path)
  };
});
tasks.forEach((task) => {
  const owner = projects.find((project) => project.title === task.projectTitle);
  task.projectPath = owner ? owner.path : "";
});

const activeTasks = tasks.filter((task) => !["done", "completed", "archived"].includes(task.status));
const timePlan = helpers.buildTimePlan(activeTasks, TODAY, settings.planningHorizonDays, settings.dailyCapacityMinutes);
const hierarchy = helpers.buildTaskHierarchy(helpers.sortTaskList(activeTasks));
const gaps = tasks.filter((task) => task.type === "knowledge-gap");
const overdue = activeTasks.filter((task) => task.daysLeft !== null && task.daysLeft < 0);
const upcoming = activeTasks.filter((task) => task.daysLeft !== null && task.daysLeft >= 0 && task.daysLeft <= settings.planningHorizonDays);

/** 读取 assets/manifest.json（由 tools/build_assets.py 生成）：横幅与导航卡的素材、平均亮度与建议文字色 */
function loadAssets() {
  try {
    return JSON.parse(fs.readFileSync(path.join(WEB_DIR, "assets", "manifest.json"), "utf8"));
  } catch (error) {
    console.warn("[assets] 未找到 assets/manifest.json，横幅与导航卡将回退到纯 CSS 渐变：" + error.message);
    return {};
  }
}

/* 整库索引：数据页签要它（插件实时数据里有 notes，示例数据也必须一致，否则示例模式下数据页永远是空） */
const noteIndex = [
  ...projects.map((project) => ({
    path: project.path, name: project.name || project.title, kind: "project", type: "project", stage: "",
    title: project.title, folder: project.path.split("/").slice(0, -1).join("/"), statusLabel: "项目",
    archived: false, words: 0, mtime: TODAY
  })),
  ...tasks.map((task) => ({
    path: task.path, name: task.title, kind: "task", type: task.type || "task", stage: "",
    title: task.title, folder: task.path.split("/").slice(0, -1).join("/"), statusLabel: "任务",
    archived: false, words: 0, mtime: TODAY
  })),
  ...INBOX.map(([title, stage]) => ({
    path: "00 草稿箱/" + title + ".md", name: title, kind: "note", type: "note", stage,
    title, folder: "00 草稿箱", statusLabel: "草稿", archived: false, words: 0, mtime: TODAY
  })),
  {
    path: "90 归档库/个人网站上线/[个人网站上线] 旧版配色方案.md", name: "[个人网站上线] 旧版配色方案",
    kind: "task", type: "task", stage: "", title: "旧版配色方案", folder: "90 归档库/个人网站上线",
    statusLabel: "已归档", archived: true, words: 0, mtime: TODAY
  }
];

const payload = {
  generatedAt: new Date().toISOString(),
  sample: true,
  assets: loadAssets(),
  vaultName: "演示知识库（演示数据）",
  today: TODAY,
  settings: {
    dailyCapacityMinutes: settings.dailyCapacityMinutes,
    planningHorizonDays: settings.planningHorizonDays,
    folders: {
      project: settings.projectFolder, task: settings.taskFolder, inbox: settings.inboxFolder,
      knowledge: settings.knowledgeFolder, book: settings.bookFolder, area: settings.areaFolder,
      people: settings.peopleFolder, archive: settings.archiveFolder, asset: settings.assetFolder
    }
  },
  stats: {
    activeProjects: projects.filter((project) => ["planning", "active", "blocked", "paused"].includes(project.status)).length,
    projects: projects.length,
    tasks: tasks.length,
    activeTasks: activeTasks.length,
    overdue: overdue.length,
    upcoming: upcoming.length,
    inbox: INBOX.length,
    gaps: gaps.length,
    knowledge: RESOURCES.knowledge.length + RESOURCES.books.length + RESOURCES.videos.length,
    people: RESOURCES.people.length,
    areas: RESOURCES.areas.length,
    capacityMinutes: settings.dailyCapacityMinutes
  },
  projects,
  tasks,
  inbox: INBOX.map(([title, stage], index) => ({
    path: "00 草稿箱/" + title + ".md", name: title, title, stage,
    frontmatter: { type: "note", stage },
    summary: ["配色灵感，先记下来，之后并到设计规范里。", "体检报告要点，等体检项目确认后再整理。", "把周复盘做成模板，周日固定复盘时用。"][index],
    checklist: { done: 0, open: 0, total: 0 }
  })),
  gaps: gaps.map((task) => Object.assign({}, task)),
  notes: noteIndex,
  timePlan: {
    days: timePlan.days.map((day) => ({ date: day.date, minutes: day.minutes, capacity: day.capacity, overloaded: day.overloaded, taskPaths: day.tasks.map((task) => task.path) })),
    unscheduled: timePlan.unscheduled.map((task) => task.path)
  },
  resources: {
    knowledge: RESOURCES.knowledge.map(([title, _, refs]) => ({ title, path: "30 知识库/" + title + ".md", type: "knowledge", refs })),
    books: RESOURCES.books.map(([title, state]) => ({ title, path: "30 知识库/图书库/" + title.replace(/[《》]/g, "") + ".md", type: "book", state })),
    videos: RESOURCES.videos.map(([title, state]) => ({ title, path: "30 知识库/视频/" + title + ".md", type: "video", state })),
    people: RESOURCES.people.map(([title, role]) => ({ title, path: "40 人物库/" + title + ".md", type: "person", role })),
    areas: RESOURCES.areas.map(([title, count]) => ({ title, path: "10 长期领域/" + title + ".md", type: "area", projects: count }))
  },
  hierarchy: hierarchy.map((set) => ({
    name: set.name,
    groups: set.groups.map((group) => ({ name: group.name, taskPaths: group.tasks.map((task) => task.path) }))
  })),
  history: []
};

const banner = "/* 演示数据集，由 tools/build-sample.mjs 生成。重建：node tools/build-sample.mjs */\n";
const outFile = path.join(WEB_DIR, "data.sample.js");
fs.writeFileSync(outFile, banner + "window.DASHBOARD_DATA_SAMPLE = " + JSON.stringify(payload, null, 2) + ";\n", "utf8");
console.log("已生成 data.sample.js：项目 " + projects.length + " · 任务 " + tasks.length + "（进行中 " + activeTasks.length
  + "）· 逾期 " + overdue.length + " · 草稿 " + INBOX.length + " · 知识 " + payload.stats.knowledge);
const overloaded = timePlan.days.filter((day) => day.overloaded).map((day) => day.date);
console.log("  超载日期：" + (overloaded.length ? overloaded.join(", ") : "无"));
