/** tasks 层：由 src/main.ts 机械拆出（逻辑未改，只加了 import/export）。 */
import { addDays, dateOf, today } from "./dates";
import { inFolder, nameOf, normalizeList, projectMatches, refs } from "./paths";
import { taskStatus } from "./status";

export function buildTimePlan(
  tasks: any,
  startDate: any,
  horizonDays: any,
  capacityMinutes: any,
  defaultDuration: any,
) {
  const start = dateOf(startDate) || today();
  const horizon = Math.max(1, Number(horizonDays) || 1);
  const capacity = Math.max(1, Number(capacityMinutes) || 1);
  /* 没填 duration 的任务要用默认时长，否则每日负载算 0 分钟、永不超载，
     而任务行上却显示「30 分钟」—— 两处口径必须一致（对照 main.js 的任务行渲染）。 */
  const fallbackDuration = Math.max(0, Number(defaultDuration) || 0);
  const days = Array.from({ length: horizon }, (_value: any, index: any) => ({
    date: addDays(start, index),
    tasks: [] as any[],
    minutes: 0,
    capacity,
    overloaded: false,
  }));
  const scheduledDates = new Set(days.map((day: any) => day.date));
  const unscheduled: any[] = [];
  (tasks || []).forEach((task: any) => {
    const terminalStatuses = [task.taskStatus, task.frontmatter?.status].map((value: any) =>
      String(value || "").toLowerCase(),
    );
    if (terminalStatuses.some((value: any) => ["done", "completed", "archived"].includes(value))) return;
    const fm = task.frontmatter || task;
    const due = dateOf(fm.due || fm.deadline);
    if (!due) {
      unscheduled.push(task);
      return;
    }
    if (!scheduledDates.has(due)) return;
    const day = days.find((item: any) => item.date === due);
    if (!day) return;
    const minutes = Math.max(0, Number(fm.duration) || fallbackDuration);
    day.tasks.push(task);
    day.minutes += minutes;
    day.overloaded = day.minutes > day.capacity;
  });
  return { days, unscheduled };
}

export function buildReminderMessages(data: any, date: any) {
  const messages: any[] = [];
  const overdue = (data && data.overdue) || [];
  const upcoming = (data && data.upcoming) || [];
  const inbox = (data && data.inbox) || [];
  const todayTasks = upcoming.filter(
    (task: any) => dateOf(task.frontmatter?.due || task.frontmatter?.deadline) === date,
  );
  if (overdue.length) messages.push("有 " + overdue.length + " 项逾期任务");
  if (todayTasks.length) messages.push("今天有 " + todayTasks.length + " 项到期任务");
  if (inbox.length) {
    const weekday = new Date(date + "T00:00:00").getDay();
    messages.push(
      weekday === 1 ? "本周草稿箱待清理：" + inbox.length + " 条" : "有 " + inbox.length + " 条未归类文档待分诊",
    );
  }
  return messages;
}

export function buildTaskHierarchy(tasks: any) {
  const sets: any[] = [];
  const setMap = new Map();
  (tasks || []).forEach((task: any) => {
    const fm = task.frontmatter || task;
    const setName = String(fm.task_set || fm.taskSet || "").trim() || "未分配任务集";
    const groupName = String(fm.task_group || fm.taskGroup || "").trim() || "未分组";
    let set = setMap.get(setName);
    if (!set) {
      set = { name: setName, groups: [] as any[], groupMap: new Map() };
      setMap.set(setName, set);
      sets.push(set);
    }
    let group = set.groupMap.get(groupName);
    if (!group) {
      group = { name: groupName, tasks: [] as any[] };
      set.groupMap.set(groupName, group);
      set.groups.push(group);
    }
    group.tasks.push(task);
  });
  return sets.map((set: any) => ({ name: set.name, groups: set.groups }));
}

export function taskImportPatch(taskSet: any, taskGroup: any) {
  return {
    type: "task",
    stage: "task",
    status: "planning",
    task_set: String(taskSet || "").trim(),
    task_group: String(taskGroup || "").trim(),
  };
}

export function shouldSplitTask(task: any, referenceDate: any) {
  const duration = Math.max(0, Number(task && task.duration) || 0);
  if (duration <= 10) return false;
  const due = dateOf(task && (task.due || task.deadline));
  if (!due) return true;
  const start = dateOf(referenceDate) || today();
  const offset = Math.round(
    (new Date(due + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) / 86400000,
  );
  return offset > 7;
}

export function buildResourceMap(items: any, settings: any) {
  const result = {
    areas: [] as any[],
    knowledge: [] as any[],
    people: [] as any[],
    books: [] as any[],
    videos: [] as any[],
  };
  (items || []).forEach((item: any) => {
    const path = item.file.path;
    const type = String(item.frontmatter.type || "").toLowerCase();
    if (inFolder(path, settings.areaFolder)) result.areas.push(item);
    else if (inFolder(path, settings.peopleFolder)) result.people.push(item);
    else if (inFolder(path, settings.bookFolder) || type === "book") result.books.push(item);
    else if (type === "video") result.videos.push(item);
    else if (inFolder(path, settings.knowledgeFolder)) result.knowledge.push(item);
  });
  return result;
}

export function resolveKnowledgeRefs(task: any, resources: any) {
  const all = [resources.knowledge, resources.books, resources.videos].flat();
  const wanted = refs(task.frontmatter?.knowledge_refs || task.knowledge_refs);
  const seen = new Set();
  return wanted
    .map((ref: any) =>
      all.find(
        (item: any) =>
          item.file.path === ref ||
          item.file.path.replace(/\.md$/i, "") === ref ||
          nameOf(item.file.path) === ref ||
          item.frontmatter.title === ref,
      ),
    )
    .filter((item: any) => {
      if (!item || seen.has(item.file.path)) return false;
      seen.add(item.file.path);
      return true;
    });
}

export function filterTaskList(tasks: any, filters: Record<string, any> = {}) {
  const query = String(filters.query || "")
    .trim()
    .toLowerCase();
  const taskSet = String(filters.taskSet || "all");
  const taskGroup = String(filters.taskGroup || "all");
  const status = String(filters.status || "all");
  const priority = String(filters.priority || "all");
  return (tasks || []).filter((task: any) => {
    const fm = task.frontmatter || task;
    const title = String(fm.title || "").toLowerCase();
    const set = String(fm.task_set || fm.taskSet || "").trim() || "未分配任务集";
    const group = String(fm.task_group || fm.taskGroup || "").trim() || "未分组";
    const currentStatus = String(task.taskStatus || fm.status || "").toLowerCase();
    const currentPriority = String(fm.priority || "medium").toLowerCase();
    return (
      (!query || title.includes(query)) &&
      (taskSet === "all" || set === taskSet) &&
      (taskGroup === "all" || group === taskGroup) &&
      (status === "all" || currentStatus === status) &&
      (priority === "all" || currentPriority === priority)
    );
  });
}

/** 已完成（不再是待办，但还没被归档）：done / completed 两种写法都算。
 *  这类任务不再"消失"，而是留在列表里打删除线、沉到所在任务组底部（见 sortTaskList）。 */
export function isCompletedTask(task: any): boolean {
  const record = task || {};
  const frontmatter = record.frontmatter || record;
  const status = String(record.taskStatus || frontmatter.status || "").toLowerCase();
  return status === "done" || status === "completed";
}

export function sortTaskList(tasks: any) {
  const priorityRank: Record<string, any> = { high: 0, medium: 1, low: 2 };
  return [...(tasks || [])].sort((a: any, b: any) => {
    /* 已完成的排到最后：它们是"记录"，不该再抢日期最靠前的位置。 */
    const completed = (isCompletedTask(a) ? 1 : 0) - (isCompletedTask(b) ? 1 : 0);
    if (completed !== 0) return completed;
    const af = a.frontmatter || a;
    const bf = b.frontmatter || b;
    const ad = dateOf(af.due || af.deadline) || "9999-12-31";
    const bd = dateOf(bf.due || bf.deadline) || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return (
      (priorityRank[String(af.priority || "medium").toLowerCase()] ?? 1) -
      (priorityRank[String(bf.priority || "medium").toLowerCase()] ?? 1)
    );
  });
}

export function selectInboxItems(items: any, paths: any) {
  const wanted = new Set(paths || []);
  return (items || []).filter((item: any) => item && item.file && wanted.has(item.file.path));
}

export function blockerItems(frontmatter: any) {
  const fm = frontmatter || {};
  const value = fm.blockers ?? fm.blocking_items ?? fm.blocking_reason ?? "";
  return normalizeList(value).filter((item: any) => item !== "-");
}

export function buildAssigneeOptions(people: any, current = "") {
  const options: Record<string, any> = { "": "不指定执行者" };
  (people || []).forEach((item: any) => {
    const path = item.file?.path || "";
    if (!path) return;
    options[path] = item.frontmatter?.title || item.frontmatter?.name || nameOf(path);
  });
  if (current && !options[current]) options[current] = current;
  return options;
}

export async function mapWithConcurrency(items: any, limit: any, worker: any) {
  const list = Array.isArray(items) ? items : ([] as any[]);
  if (!list.length) return [];
  const out = new Array(list.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(Number(limit) || 8, list.length));
  const runners = Array.from({ length: size }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * 项目归属索引：把「项目名形态」预索引起来，替代 O(任务 × 项目) 的 projectMatches 扫描
 * （千篇规模下它是推导耗时的大头）。projectMatches 的三条判据（全名相同 / ref 以 "/"+name
 * 结尾 / basename 相同）都能归结为「引用与项目共享某个名字形态」，所以索引不会漏判；
 * 同名多项目时保留全部候选，调用方按 projects 顺序取第一个即可与原 find 语义一致。
 * entries: [{ path, title, folderPath }]
 */

export function buildProjectIndex(entries: any) {
  const byName = new Map();
  const remember = (name: any, path: any) => {
    if (!name) return;
    const bucket = byName.get(name);
    if (bucket) {
      if (!bucket.includes(path)) bucket.push(path);
      return;
    }
    byName.set(name, [path]);
  };
  (entries || []).forEach((entry: any) => {
    [entry.path, nameOf(entry.path), entry.title, entry.folderPath ? nameOf(entry.folderPath) : ""].forEach(
      (name: any) => remember(name, entry.path),
    );
  });
  return {
    /** 与 projectMatches(task, project) 等价的候选项目路径集合 */
    candidatesFor(frontmatter: any) {
      const found = new Set();
      refs(frontmatter && frontmatter.project).forEach((ref: any) => {
        (byName.get(ref) || []).forEach((path: any) => found.add(path));
        (byName.get(nameOf(ref)) || []).forEach((path: any) => found.add(path));
      });
      return found;
    },
  };
}

/**
 * 详情页可以直改的字段：插件校验与 Web 渲染**共用这一份定义**（通过 payload.fieldSpec 带出去），
 * 所以界面能改的字段与插件允许写的字段不会漂移。
 * `title` 故意不在其中：标题是笔记身份，改名要走重命名流程（会牵动文件名与链接）。
 */
