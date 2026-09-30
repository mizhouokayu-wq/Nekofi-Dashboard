/** tasks：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import { TASKS_VIEW } from "../core/constants";
import { dateOf, today } from "../core/dates";
import { el } from "../core/dom";
import { text } from "../core/frontmatter";
import { nameOf } from "../core/paths";
import { statusBadge, taskStatus } from "../core/status";
import { buildTaskHierarchy, filterTaskList, isCompletedTask, shouldSplitTask, sortTaskList } from "../core/tasks";
import { renderKnowledgeLinks } from "../core/web";
import { PlanningView } from "./base";
import type { DashboardHost } from "../host";

export class TaskListView extends PlanningView {
  filterTimer: any;
  filters: any;
  constructor(leaf: any, plugin: DashboardHost) {
    super(leaf, plugin);
    this.filters = { query: "", taskSet: "all", taskGroup: "all", status: "all" };
    this.filterTimer = null;
  }
  getViewType() {
    return TASKS_VIEW;
  }
  getDisplayText() {
    return "日程待办";
  }
  override getIcon() {
    return "list-checks";
  }
  override async onClose() {
    if (this.filterTimer) window.clearTimeout(this.filterTimer);
    await super.onClose();
  }
  addFilterSelect(parent: any, label: any, key: any, values: any, allLabel: any) {
    const wrap = parent.createDiv({ cls: "pp-filter-control" });
    el(wrap, "span", label, "pp-filter-label");
    const select = wrap.createEl("select", { cls: "pp-filter-select" });
    values.forEach((value: any) => {
      const option = select.createEl("option");
      option.value = value;
      option.textContent = value === "all" ? allLabel : value;
    });
    select.value = this.filters?.[key] || "all";
    select.onchange = () => {
      this.filters = Object.assign({}, this.filters || {}, { [key]: select.value });
      void this.refresh();
    };
  }
  renderTaskRow(panel: any, task: any, resources: any) {
    /* 已完成的任务留在列表里（删除线 + 灰字，并已被 sortTaskList 沉到组底）——
       它们是"这周做完了什么"的记录，直接消失会让人以为任务被删了。 */
    const row = panel.createDiv({ cls: isCompletedTask(task) ? "pp-task-list-row pp-task-done" : "pp-task-list-row" });
    const content = row.createDiv({ cls: "pp-task-list-content" });
    const link = content.createEl("button", { cls: "pp-link-button pp-task-content" });
    link.setText(task.frontmatter.title || nameOf(task.file.path));
    link.onclick = () => this.plugin.openFile(task.file);
    const meta = content.createDiv({ cls: "pp-meta-line" });
    statusBadge(meta, task.taskStatus || taskStatus(task));
    el(meta, "span", text(task.frontmatter.project, "未关联项目"), "pp-muted");
    el(meta, "span", task.frontmatter.due ? "DDL " + dateOf(task.frontmatter.due) : "无 DDL", "pp-muted");
    if (task.frontmatter.milestone) el(meta, "span", "节点 " + task.frontmatter.milestone, "pp-muted");
    if (task.frontmatter.assignee) el(meta, "span", "执行者 " + task.frontmatter.assignee, "pp-muted");
    if (shouldSplitTask(task.frontmatter, today())) el(meta, "span", "建议拆解", "pp-muted");
    renderKnowledgeLinks(meta, task, resources, this.plugin);
    const actions = row.createDiv({ cls: "pp-task-actions" });
    const edit = actions.createEl("button", { cls: "pp-icon-button" });
    edit.setText("编辑");
    edit.onclick = () => this.plugin.editTask(task);
    const archive = actions.createEl("button", { cls: "pp-icon-button" });
    archive.setText("归档");
    archive.onclick = () => this.plugin.archiveTask(task);
    const remove = actions.createEl("button", { cls: "pp-icon-button" });
    remove.setText("删除");
    remove.onclick = () => this.plugin.deleteTask(task);
  }
  override async refresh(restoreSearch = false) {
    const { version: renderVersion, root } = this.beginRender("tasks");
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const title = header.createDiv({ cls: "pp-title-block" });
    el(title, "h1", "日程待办");
    el(title, "p", "统一查看项目任务、孤立任务和日程待办；任务状态会根据 DDL 自动更新。", "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    const refresh = actions.createEl("button", { cls: "pp-button" });
    refresh.setText("刷新");
    refresh.onclick = () => this.refresh();
    const importTasks = actions.createEl("button", { cls: "pp-button pp-button-primary" });
    importTasks.setText("周维护导入任务集");
    importTasks.onclick = () => this.plugin.importInboxAsTaskSet();
    const add = actions.createEl("button", { cls: "pp-button pp-button-primary" });
    add.setText("新建任务");
    add.onclick = () => this.plugin.newTask();
    const filterBar = root.createDiv({ cls: "pp-task-filters" });
    const search = filterBar.createEl("input", { cls: "pp-filter-search" });
    search.setAttr("type", "search");
    search.setAttr("placeholder", "搜索任务名称…");
    search.value = this.filters?.query || "";
    if (restoreSearch) {
      search.focus();
      search.setSelectionRange?.(search.value.length, search.value.length);
    }
    search.oninput = () => {
      this.filters = Object.assign({}, this.filters || {}, { query: search.value });
      window.clearTimeout(this.filterTimer);
      this.filterTimer = window.setTimeout(() => {
        void this.refresh(true);
      }, 120);
    };
    const taskSetValues = ["all"].concat(
      Array.from(
        new Set(
          data.tasks.map(
            (task: any) => String(task.frontmatter.task_set || task.frontmatter.taskSet || "").trim() || "未分配任务集",
          ),
        ),
      ),
    );
    const taskGroupValues = ["all"].concat(
      Array.from(
        new Set(
          data.tasks.map(
            (task: any) => String(task.frontmatter.task_group || task.frontmatter.taskGroup || "").trim() || "未分组",
          ),
        ),
      ),
    );
    /* 已完成的任务留在列表里，那筛选也得能筛到它（与 Web 面板的「全部状态」保持一致） */
    const statusValues = ["all", "planning", "todo", "doing", "blocked", "paused", "expired", "done"];
    const priorityValues = ["all", "high", "medium", "low"];
    (
      [
        ["taskSet", taskSetValues],
        ["taskGroup", taskGroupValues],
        ["status", statusValues],
        ["priority", priorityValues],
      ] as [string, string[]][]
    ).forEach(([key, values]: any) => {
      if (this.filters && this.filters[key] && !values.includes(this.filters[key]))
        this.filters = Object.assign({}, this.filters, { [key]: "all" });
    });
    this.addFilterSelect(filterBar, "任务集", "taskSet", taskSetValues, "全部任务集");
    this.addFilterSelect(filterBar, "任务组", "taskGroup", taskGroupValues, "全部任务组");
    this.addFilterSelect(filterBar, "状态", "status", statusValues, "全部状态");
    this.addFilterSelect(filterBar, "优先级", "priority", priorityValues, "全部优先级");
    const visibleTasks = sortTaskList(filterTaskList(data.tasks, this.filters || {}));
    const panel = root.createDiv({ cls: "pp-task-list-screen" });
    if (!visibleTasks.length) {
      if (data.tasks.length) {
        const empty = panel.createDiv({ cls: "pp-empty" });
        el(empty, "strong", "没有符合筛选的任务");
        el(empty, "span", "调整搜索词或筛选条件，或把筛选重置为“全部”。", "pp-muted");
        this.finishRender(root);
        return;
      }
      this.emptyWithAction(panel, "没有待办任务", "创建第一个任务后，这里会按任务集 → 任务组展示。", "新建任务", () =>
        this.plugin.newTask(),
      );
      this.finishRender(root);
      return;
    }
    buildTaskHierarchy(visibleTasks).forEach((set: any) => {
      const setSection = panel.createDiv({ cls: "pp-task-set" });
      el(setSection, "h2", set.name, "pp-task-set-title");
      set.groups.forEach((group: any) => {
        const groupSection = setSection.createDiv({ cls: "pp-task-group" });
        el(groupSection, "h3", group.name, "pp-hierarchy-group-title");
        group.tasks.forEach((task: any) => this.renderTaskRow(groupSection, task, data.resources));
      });
    });
    this.finishRender(root);
  }
}
