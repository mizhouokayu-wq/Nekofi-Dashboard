/** web 层：由 src/main.ts 机械拆出（逻辑未改，只加了 import/export）。 */
import { DEFAULTS, EDITABLE_FIELDS } from "./constants";
import { dateOf, daysUntil, recurrenceMonthDayOf, recurrenceUntilOf, recurrenceWeekdaysOf, today } from "./dates";
import { text } from "./frontmatter";
import {
  directChild,
  forbiddenPath,
  inFolder,
  nameOf,
  normalizeList,
  pickProject,
  projectMatches,
  refs,
} from "./paths";
import { isTaskNote, projectStatus, statusLabel, taskStatus } from "./status";
import {
  blockerItems,
  buildProjectIndex,
  buildResourceMap,
  buildTaskHierarchy,
  buildTimePlan,
  resolveKnowledgeRefs,
  shouldSplitTask,
  sortTaskList,
} from "./tasks";
import type { DashboardHost } from "../host";

export function renderKnowledgeLinks(parent: any, task: any, resources: any, plugin: DashboardHost) {
  if (!resources) return;
  resolveKnowledgeRefs(task, resources).forEach((item: any) => {
    const link = parent.createEl("button", { cls: "pp-link-button pp-resource-reference" });
    link.setText("引用 " + (item.frontmatter.title || nameOf(item.file.path)));
    link.onclick = () => plugin.openFile(item.file);
  });
}

export function renderNavigation(parent: any, plugin: DashboardHost, active: any) {
  const nav = parent.createDiv({ cls: "pp-navigation" });
  nav.setAttr("role", "navigation");
  nav.setAttr("aria-label", "个人规划导航");
  const items = [
    ["dashboard", "仪表盘", () => plugin.activateApp()],
    ["inbox", "草稿箱", () => plugin.activateInbox()],
    ["tasks", "日程待办", () => plugin.activateTasks()],
    ["areas", "长期领域", () => plugin.activateResources("areas")],
    ["knowledge", "知识/图书", () => plugin.activateResources("knowledge")],
    ["people", "人物", () => plugin.activateResources("people")],
    ["about", "关于我", () => plugin.activateResources("about")],
    ["wealth", "财富", () => plugin.activateResources("wealth")],
  ];
  items.forEach(([id, label, callback]: any) => {
    const button = nav.createEl("button", { cls: id === active ? "pp-nav-link pp-nav-link-active" : "pp-nav-link" });
    button.setText(label);
    button.setAttr("aria-current", id === active ? "page" : "false");
    button.onclick = callback;
  });
}

/* ===================== 2b. Web 渲染层数据推导 ===================== *
 * Web 版仪表盘（浏览器里的 web/app.js）与插件内嵌视图共用同一份数据形状：
 * web/tools/export-data.mjs 通过 web/tools/plugin-helpers.mjs 调用下面的
 * buildWebPayload()，因此网页版与插件内版对同一条笔记的判定完全一致。
 * 这里只做推导，不读写磁盘。
 * ================================================================== */
/** 清单统计：勾选数 / 未勾选数，对应正文里的 - [ ] 与 - [x] */

export function webChecklistOf(body: any) {
  const source = String(body || "");
  /* 既给计数，也给条目本身：Web 详情页要逐条勾选 / 改名 / 删除，改的就是正文里的同一批行 */
  const items: any[] = [];
  const pattern = /^\s*[-*]\s*\[([ xX])\]\s*(.*)$/gm;
  let match = pattern.exec(source);
  while (match) {
    items.push({ done: match[1].toLowerCase() === "x", text: match[2].trim() });
    match = pattern.exec(source);
  }
  const done = items.filter((item: any) => item.done).length;
  return { done, open: items.length - done, total: items.length, items };
}
/** 正文摘要：去掉标题与清单标记，压成一行，最多 220 字 */

export function webSummaryOf(body: any) {
  return String(body || "")
    .replace(/^#+ .*$/gm, "")
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}
/** 资源面板条目：标题 / 路径 / 类型 */

export function webResourceSummary(list: any) {
  return (list || []).map((item: any) => ({
    title: item.frontmatter.title || nameOf(item.file.path),
    path: item.file.path,
    type: String(item.frontmatter.type || ""),
  }));
}
/**
 * 由笔记集合（{ path, name, frontmatter, body }）生成 Web 渲染层数据。
 * options: { vaultName, assets, generatedAt, history, live }
 * live=true 表示数据由插件从 Vault 现场读取（页脚与空状态会改用实时数据措辞）。
 */
/**
 * 笔记索引：Web 版「数据」页签用。只保留浏览与筛选需要的字段，正文不进来
 * （插件侧直接用 metadataCache，避免为了索引把整个库读一遍）。
 */

export function buildNoteIndex(entries: any, settings: any) {
  const config = Object.assign({}, DEFAULTS, settings || {});
  return (entries || [])
    .filter(
      (entry: any) =>
        entry &&
        entry.path &&
        !forbiddenPath(entry.path) &&
        !entry.path.split("/").some((segment: any) => segment.startsWith(".")),
    )
    .map((entry: any) => {
      const fm = entry.frontmatter || {};
      const type = String(fm.type || "").toLowerCase();
      const isTask = type === "task" || type === "knowledge-gap";
      const isProject = type === "project";
      const status = isTask
        ? taskStatus({ frontmatter: fm })
        : isProject
          ? projectStatus({ frontmatter: fm })
          : String(fm.status || fm.stage || "").toLowerCase();
      const stage = String(fm.stage || "").toLowerCase();
      const archived =
        stage === "archived" ||
        ["archived", "done", "completed"].includes(status) ||
        inFolder(entry.path, config.archiveFolder);
      return {
        path: entry.path,
        name: entry.name || nameOf(entry.path),
        title: fm.title || nameOf(entry.path),
        type: type || "note",
        kind: isProject ? "project" : isTask ? "task" : "note",
        status,
        statusLabel: status ? statusLabel(status) : "—",
        stage,
        project: String(fm.project || ""),
        updated: String(fm.updated || fm.created || ""),
        folder: entry.path.split("/")[0] || "",
        archived,
      };
    })
    .sort((a: any, b: any) => a.path.localeCompare(b.path, "zh"));
}

export function buildWebPayload(notes: any, settings: any, options: Record<string, any> = {}) {
  const config = Object.assign({}, DEFAULTS, settings || {});
  const list = Array.isArray(notes) ? notes : ([] as any[]);
  const isProjectNote = (note: any) =>
    String(note.frontmatter.type || "").toLowerCase() === "project" || directChild(note.path, config.projectFolder);
  /* 与插件视图共用同一套任务判定（见顶层 isTaskNote） */
  const isTaskNoteOf = (note: any) => isTaskNote(note.path, note.frontmatter, config);

  const projectNotes = list.filter(isProjectNote);
  const projectFolderOf = (note: any) =>
    inFolder(note.path, config.projectFolder) ? note.path.split("/").slice(0, -1).join("/") : "";
  /* 项目归属索引与插件原生路径共用同一套实现（见顶层 buildProjectIndex）：
     以前每个任务都要和每个项目逐项跑 projectMatches，820 任务 × 120 项目占了推导耗时约 35%。 */
  const projectIndex = buildProjectIndex(
    projectNotes.map((note: any) => ({
      path: note.path,
      title: note.frontmatter.title,
      folderPath: projectFolderOf(note),
    })),
  );
  const candidateProjectPaths = (frontmatter: any) => projectIndex.candidatesFor(frontmatter);
  /* 每个项目"拥有的任务"一次算完，避免 项目 × 全部笔记 的重复扫描 */
  const taskNotes = list.filter(isTaskNoteOf);
  const ownedByProject = new Map();
  projectNotes.forEach((note: any) => ownedByProject.set(note.path, []));
  taskNotes.forEach((note: any) => {
    candidateProjectPaths(note.frontmatter).forEach((path: any) => {
      const bucket = ownedByProject.get(path);
      if (bucket) bucket.push(note);
    });
  });

  const projects = projectNotes.map((note: any) => {
    const owned = ownedByProject.get(note.path) || [];
    const done = owned.filter((task: any) => ["done", "completed", "archived"].includes(taskStatus(task))).length;
    const supplied = note.frontmatter.progress;
    const explicit = supplied !== undefined && supplied !== "" && supplied !== null;
    return Object.assign({}, note, {
      progress: explicit
        ? Math.max(0, Math.min(100, Number(supplied) || 0))
        : owned.length
          ? Math.round((done / owned.length) * 100)
          : 0,
      done,
      total: owned.length,
      folderPath: projectFolderOf(note),
      /* 正文与这两个派生值都跟着笔记缓存算过了；直接传裸笔记的调用方走兜底 */
      checklist: note.checklist !== undefined ? note.checklist : webChecklistOf(note.body),
      summary: note.summary !== undefined ? note.summary : webSummaryOf(note.body),
    });
  });
  projects.forEach((project: any) => {
    project.status = projectStatus(project);
  });

  const tasks = taskNotes.map((note: any) =>
    Object.assign({}, note, {
      status: taskStatus(note),
      checklist: note.checklist !== undefined ? note.checklist : webChecklistOf(note.body),
      summary: note.summary !== undefined ? note.summary : webSummaryOf(note.body),
    }),
  );
  tasks.forEach((task: any) => {
    /* 归属规则与原生 findProject 共用同一份实现（见 pickProject）：同名项目按
       "引用越具体越优先 + 码点序兜底"，**不依赖 vault 枚举顺序** —— 否则同一篇笔记
       在不同机器上会归到不同项目（CI 上真的红过）。 */
    const owner = pickProject(task.path, task.frontmatter, projects);
    task.projectPath = owner ? owner.path : "";
    task.projectTitle = owner ? owner.frontmatter.title || owner.name : "";
    task.daysLeft = daysUntil(task.frontmatter.due || task.frontmatter.deadline);
  });
  const tasksByProject = new Map();
  tasks.forEach((task: any) => {
    if (!task.projectPath) return;
    const bucket = tasksByProject.get(task.projectPath);
    if (bucket) bucket.push(task);
    else tasksByProject.set(task.projectPath, [task]);
  });
  projects.forEach((project: any) => {
    const owned = tasksByProject.get(project.path) || [];
    project.taskPaths = owned.map((task: any) => task.path);
    project.blockers = blockerItems(project.frontmatter);
    project.daysLeft = daysUntil(project.frontmatter.deadline || project.frontmatter.ddl);
    project.milestones = normalizeList(project.frontmatter.milestones || project.frontmatter.key_nodes);
    owned.forEach((task: any) => {
      const milestone = String(task.frontmatter.milestone || "").trim() || "未分组";
      if (!project.milestones.includes(milestone)) project.milestones.push(milestone);
    });
    if (!project.milestones.length) project.milestones = ["未分组"];
  });

  const archived = (note: any) => ["archived", "done", "completed"].includes(taskStatus(note));
  const activeTasks = tasks.filter((note: any) => !archived(note));
  const inbox = list.filter(
    (note: any) =>
      inFolder(note.path, config.inboxFolder) || String(note.frontmatter.stage || "").toLowerCase() === "inbox",
  );
  const gaps = activeTasks.filter(
    (note: any) =>
      String(note.frontmatter.type || "").toLowerCase() === "knowledge-gap" ||
      note.frontmatter.knowledge_gap === true ||
      refs(note.frontmatter.tags).includes("knowledge-gap"),
  );

  const overdue = activeTasks
    .filter((note: any) => note.daysLeft !== null && note.daysLeft < 0)
    .sort((a: any, b: any) => a.daysLeft - b.daysLeft);
  const upcoming = activeTasks
    .filter((note: any) => note.daysLeft !== null && note.daysLeft >= 0 && note.daysLeft <= config.planningHorizonDays)
    .sort((a: any, b: any) => String(a.frontmatter.due || "").localeCompare(String(b.frontmatter.due || "")));

  const resources = buildResourceMap(
    list.map((note: any) => ({ file: { path: note.path }, frontmatter: note.frontmatter })),
    config,
  );
  const timePlan = buildTimePlan(
    activeTasks,
    today(),
    config.planningHorizonDays,
    config.dailyCapacityMinutes,
    config.defaultTaskDuration,
  );
  const hierarchy = buildTaskHierarchy(sortTaskList(activeTasks));

  const stripBody = (note: any) => ({
    path: note.path,
    name: note.name,
    title: note.frontmatter.title || note.name,
    frontmatter: note.frontmatter,
    summary: note.summary || "",
    checklist: note.checklist || { done: 0, open: 0, total: 0 },
  });

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    assets: options.assets || {},
    vaultName: options.vaultName || "",
    today: today(),
    live: options.live === true,
    /* 最近一次批量操作的失败清单（渲染层用它显示"可重试"的失败条） */
    bulkFailures: options.bulkFailures || null,
    /* 最近一次「本周期完成」（渲染层用它在那条任务上显示「撤销」；只对最近一次有效） */
    recurringUndo: options.recurringUndo || null,
    settings: {
      dailyCapacityMinutes: config.dailyCapacityMinutes,
      planningHorizonDays: config.planningHorizonDays,
      /* Web 面板据此决定动效强度（data-motion）：渲染层与原生视图共用同一个用户偏好 */
      motionIntensity: config.motionIntensity,
      folders: {
        project: config.projectFolder,
        task: config.taskFolder,
        inbox: config.inboxFolder,
        knowledge: config.knowledgeFolder,
        book: config.bookFolder,
        area: config.areaFolder,
        people: config.peopleFolder,
        archive: config.archiveFolder,
        asset: config.assetFolder,
      },
    },
    /* 详情页可直改的字段规格：与插件写入口共用同一份定义（见顶层 EDITABLE_FIELDS） */
    fieldSpec: EDITABLE_FIELDS,
    stats: {
      activeProjects: projects.filter((project: any) =>
        ["planning", "active", "blocked", "paused"].includes(project.status),
      ).length,
      projects: projects.length,
      tasks: tasks.length,
      activeTasks: activeTasks.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      inbox: inbox.length,
      gaps: gaps.length,
      knowledge: resources.knowledge.length + resources.books.length + resources.videos.length,
      people: resources.people.length,
      areas: resources.areas.length,
      capacityMinutes: config.dailyCapacityMinutes,
    },
    projects: projects.map((project: any) =>
      Object.assign(stripBody(project), {
        status: project.status,
        statusLabel: statusLabel(project.status),
        progress: project.progress,
        done: project.done,
        total: project.total,
        deadline: dateOf(project.frontmatter.deadline || project.frontmatter.ddl),
        daysLeft: project.daysLeft,
        outcome: project.frontmatter.outcome || project.frontmatter.final_outcome || "",
        acceptance: project.frontmatter.acceptance || project.frontmatter.acceptance_criteria || "",
        area: project.frontmatter.area || "",
        weight: project.frontmatter.weight || "",
        constraints: project.frontmatter.resource_constraints || project.frontmatter.constraints || "",
        milestones: project.milestones,
        blockers: project.blockers,
        taskPaths: project.taskPaths,
      }),
    ),
    tasks: tasks.map((task: any) =>
      Object.assign(stripBody(task), {
        status: task.status,
        statusLabel: statusLabel(task.status),
        projectPath: task.projectPath,
        projectTitle: task.projectTitle,
        milestone: String(task.frontmatter.milestone || "").trim() || "未分组",
        taskSet: String(task.frontmatter.task_set || "").trim() || "未分配任务集",
        taskGroup: String(task.frontmatter.task_group || "").trim() || "未分组",
        due: dateOf(task.frontmatter.due || task.frontmatter.deadline),
        daysLeft: task.daysLeft,
        duration: Number(task.frontmatter.duration) || config.defaultTaskDuration,
        priority: String(task.frontmatter.priority || "medium").toLowerCase(),
        assignee: task.frontmatter.assignee || "",
        recurrence: String(task.frontmatter.recurrence || "none").toLowerCase(),
        /* 重复模式（参考谷歌日历）：周几 / 几号 / 序列结束日（= 重复任务的 DDL）。
           渲染层要按这些值显示与编辑，所以必须随 payload 出来，不能只留在 frontmatter 里。 */
        recurrenceWeekdays: recurrenceWeekdaysOf(task.frontmatter),
        recurrenceMonthDay: recurrenceMonthDayOf(task.frontmatter),
        recurrenceUntil: recurrenceUntilOf(task.frontmatter),
        knowledgeRefs: refs(task.frontmatter.knowledge_refs),
        type: String(task.frontmatter.type || "task").toLowerCase(),
        suggestion: shouldSplitTask(task.frontmatter, today()),
      }),
    ),
    inbox: inbox.map((note: any) =>
      Object.assign(stripBody(note), {
        stage: note.frontmatter.stage || "inbox",
        project: String(note.frontmatter.project || "").toLowerCase() === "project",
      }),
    ),
    gaps: gaps.map((note: any) => Object.assign(stripBody(note), { projectTitle: note.projectTitle || "" })),
    timePlan: {
      days: timePlan.days.map((day: any) => ({
        date: day.date,
        minutes: day.minutes,
        capacity: day.capacity,
        overloaded: day.overloaded,
        taskPaths: day.tasks.map((task: any) => task.path),
      })),
      unscheduled: timePlan.unscheduled.map((task: any) => task.path),
    },
    resources: {
      knowledge: webResourceSummary(resources.knowledge),
      books: webResourceSummary(resources.books),
      videos: webResourceSummary(resources.videos),
      people: webResourceSummary(resources.people),
      areas: webResourceSummary(resources.areas),
    },
    hierarchy: hierarchy.map((set: any) => ({
      name: set.name,
      groups: set.groups.map((group: any) => ({
        name: group.name,
        taskPaths: group.tasks.map((task: any) => task.path),
      })),
    })),
    notes: buildNoteIndex(options.noteIndex || [], settings),
    history: Array.isArray(options.history) ? options.history : ([] as any[]),
  };
}

/* ========================= 3. 素材与横幅工具 ========================= *
 * 素材路径解析（省略扩展名 / 反斜杠 / 大小写）、裁剪舞台几何、二进制写入。
 * 任何一步失败都不阻塞界面：素材缺失时回退到纯 CSS 渐变。
 * ================================================================== */

export const WEB_SHELL_HTML =
  '<div class="app" id="pp-app">' +
  '<header class="topbar"><a class="brand" href="#/overview"><span class="brand-text"><strong>个人规划</strong><small>PERSONAL OPERATING SYSTEM</small></span></a>' +
  '<nav class="tabs" id="tabs" role="tablist" aria-label="页面导航"></nav>' +
  '<div class="topbar-side"><button type="button" class="primary-btn" id="source-toggle" hidden>切换数据源</button><span class="date-chip" id="date-chip"></span></div></header>' +
  '<main class="view" id="view" tabindex="-1"></main>' +
  /* 读屏播报区：切页签 / 刷新数据都是"原地更新"，没有焦点变化，靠它才念得出来；
     视觉上由 web/styles.css 的 .sr-only 隐藏。与 web/index.html 保持同构。 */
  '<div class="sr-only" id="live" role="status" aria-live="polite" aria-atomic="true"></div>' +
  '<footer class="footer" id="footer"></footer></div>' +
  /* 抽屉是对话框，不是 live region：给它 dialog 语义，读屏才会把它当作弹层；
     遮罩只承担鼠标点击关闭，键盘有 Esc 与「关闭」按钮，所以对它 aria-hidden。 */
  '<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="详情" hidden></aside>' +
  '<div class="scrim" id="scrim" hidden aria-hidden="true" data-action="close-drawer"></div>';
/** Shadow DOM 桥接：页面里的 html/body 在 shadow 内不存在，把职责交给宿主元素 */

export const WEB_SHADOW_BRIDGE_CSS =
  "\n/* 插件桥接：html/body 在 Shadow DOM 内不存在，改由宿主元素承担 */\n" +
  ":host { display: block; height: 100%; min-height: 0; overflow: hidden; position: relative; background-attachment: scroll; container-type: inline-size; }\n" +
  ":host(.theme-dark) { color-scheme: dark; }\n" +
  ":host(.theme-light) { color-scheme: light; }\n" +
  "/* 滚动交给 .app，宿主只负责裁剪：这样抽屉/遮罩才能相对窗格定位。同时把 web 版的\n" +
  "   min-height:100vh 收掉 —— 窗格高度由宿主决定，用视口高度会让短窗格必然溢出。\n" +
  "   用 absolute + inset:0 而不是 height:100%：宿主高度来自 flex 分配，百分比高度在宿主内部\n" +
  "   解析不出确定值（实测 .app 会退化成内容高度，于是滚动又回到宿主上）。 */\n" +
  ":host .app { position: absolute; inset: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }\n" +
  "/* .drawer/.scrim 在浏览器版是 position:fixed（相对视口）；在 Obsidian 里 fixed 会逃出窗格、\n" +
  "   把侧边栏和其它窗格一起盖住，所以这里改成相对宿主的 absolute。 */\n" +
  ":host .drawer, :host .scrim { position: absolute; }\n";
/**
 * 把为浏览器页面写的 styles.css 适配到 Shadow DOM：只改选择器，不改任何声明。
 * :root → :host；html, body → :host；body → :host；
 * `.theme-dark` / `.theme-light` → `:host(.theme-dark)` / `:host(.theme-light)`。
 * 带后代的形式（`.theme-light .topbar`）也必须一起换：shadow 内的选择器匹配不到宿主
 * （宿主在 shadow 树之外），只有 `:host(...)` 才能把主题类接上去。
 */

export function shadowScopedCss(css: any) {
  return (
    String(css || "")
      .replace(/(^|\n)([ \t]*):root([ \t]*)\{/g, "$1$2:host$3{")
      .replace(/(^|\n)([ \t]*)html,[ \t]*body([ \t]*)\{/g, "$1$2:host$3{")
      .replace(/(^|\n)([ \t]*)\.theme-dark(?![-\w])/g, "$1$2:host(.theme-dark)")
      .replace(/(^|\n)([ \t]*)\.theme-light(?![-\w])/g, "$1$2:host(.theme-light)")
      .replace(/(^|\n)([ \t]*)body([ \t]*)\{/g, "$1$2:host$3{")
      /* 关键：Obsidian 窗格宽度 ≠ 窗口宽度，@media 宽度断点在窗格里永远不触发。
       把宽度断点改成容器查询（宿主已声明 container-type: inline-size），
       动效偏好等非宽度断点保持 @media。 */
      .replace(/@media\s*\(([^)]*(?:max|min)-width[^)]*)\)/g, "@container ($1)") + WEB_SHADOW_BRIDGE_CSS
  );
}
