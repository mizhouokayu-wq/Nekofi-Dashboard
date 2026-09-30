/** dashboard：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import { applyHeroCrop } from "../core/assets";
import { DASHBOARD_VIEW, resolveAssetImages } from "../core/constants";
import { daysUntil, today } from "../core/dates";
import { el } from "../core/dom";
import { text } from "../core/frontmatter";
import { nameOf } from "../core/paths";
import { projectStatus, statusBadge, taskStatus } from "../core/status";
import { PlanningView } from "./base";
import type { DashboardHost } from "../host";

export class DashboardView extends PlanningView {
  constructor(leaf: any, plugin: DashboardHost) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return DASHBOARD_VIEW;
  }
  override getDisplayText() {
    return "个人规划仪表盘";
  }
  override getIcon() {
    return "layout-dashboard";
  }
  override async refresh() {
    const { version: renderVersion, root } = this.beginRender("dashboard");
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const hero = root.createDiv({ cls: "pp-dashboard-hero" });
    const heroImage = this.plugin.assetResourcePath(this.plugin.settings.heroImage);
    if (heroImage) hero.style.backgroundImage = 'url("' + heroImage + '")';
    applyHeroCrop(hero, this.plugin.settings.heroCrop);
    const heroCopy = hero.createDiv({ cls: "pp-dashboard-hero-copy" });
    el(heroCopy, "span", "PERSONAL OPERATING SYSTEM", "pp-dashboard-hero-kicker");
    el(heroCopy, "h1", "把今天的行动，放回长期方向里。", "pp-dashboard-hero-title");
    el(heroCopy, "p", "项目负责结果，任务负责执行，笔记负责记忆。", "pp-dashboard-hero-subtitle");
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const title = header.createDiv({ cls: "pp-title-block" });
    el(title, "h1", "个人规划仪表盘");
    el(title, "p", today() + " · 视图只读取和跳转，笔记才是唯一事实来源", "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    this.button(actions, "刷新", () => this.refresh());
    this.button(actions, "新建项目", () => this.plugin.newProject(), true);
    this.button(actions, "新建任务", () => this.plugin.newTask());
    this.button(actions, "处理草稿箱", () => this.plugin.triageInbox());
    if (!data.projects.length && !data.allTasks.length) {
      const onboarding = root.createDiv({ cls: "pp-onboarding" });
      el(onboarding, "strong", "先初始化你的知识库目录");
      el(onboarding, "span", "插件只创建默认目录，不会读取或修改“AI禁止阅读”内容。", "pp-muted");
      this.button(onboarding, "初始化目录结构", () => this.plugin.initializeStructure(), true);
    }
    const stats = root.createDiv({ cls: "pp-overview" });
    [
      [
        "进行中项目",
        data.projects.filter((project: any) =>
          ["planning", "active", "blocked"].includes(String(project.frontmatter.status || "active").toLowerCase()),
        ),
        "项目推演",
        "projects",
      ],
      ["未来 " + this.plugin.settings.planningHorizonDays + " 天任务", data.upcoming, "时间监控", "upcoming"],
      ["逾期任务", data.overdue, "执行状态", "overdue"],
      ["草稿箱", data.inbox, "分诊 / 整理", "inbox"],
    ].forEach((item: any) => {
      const card = stats.createDiv({ cls: "pp-stat-card" });
      el(card, "span", item[2], "pp-stat-hint");
      const value = el(card, "strong", item[1].length, "pp-stat-value");
      /* 数字滚动：key 用语义键而不是下标，刷新后同一个数字仍然命中同一份快照 */
      this.countUpStat(value, String(item[3]), item[1].length);
      el(card, "span", item[0], "pp-stat-label");
    });
    const focus = root.createDiv({ cls: "pp-focus-strip" });
    const focusText = focus.createDiv({ cls: "pp-focus-copy" });
    el(focusText, "span", "TODAY / 今日焦点", "pp-focus-kicker");
    const focusTask = data.overdue[0] || data.upcoming[0];
    el(
      focusText,
      "strong",
      focusTask ? focusTask.frontmatter.title || nameOf(focusTask.file.path) : "先选择一个值得推进的下一步",
      "pp-focus-title",
    );
    el(
      focusText,
      "span",
      focusTask ? "这是当前最值得优先处理的任务。" : "从新建项目、任务或处理草稿箱开始。",
      "pp-muted",
    );
    const focusActions = focus.createDiv({ cls: "pp-actions" });
    if (focusTask) {
      this.button(focusActions, "打开焦点任务", () => this.plugin.openFile(focusTask.file), true);
    }
    this.button(focusActions, "检查提醒", () => this.plugin.checkReminders(true));
    this.renderVisualWaypoints(root);
    const grid = root.createDiv({ cls: "pp-dashboard-grid" });
    this.renderProjects(grid, data);
    this.renderTimeline(grid, data);
    this.renderTimePlan(grid, data);
    this.renderInbox(grid, data);
    this.renderGaps(grid, data);
    this.finishRender(root);
  }
  renderVisualWaypoints(root: any) {
    const wrap = root.createDiv({ cls: "pp-waypoints" });
    /* 图片从素材目录解析（设置里选过就优先用），不再硬编码本库文件名 */
    const picked = resolveAssetImages(this.plugin.app.vault, this.plugin.settings);
    const waypoints = [
      {
        title: "任务执行",
        eyebrow: "01 / BUILD",
        description: "把计划变成下一步行动",
        image: picked.build,
        action: () => this.plugin.activateTasks(),
      },
      {
        title: "知识沉淀",
        eyebrow: "02 / LEARN",
        description: "让每次学习都可复用",
        image: picked.learn,
        action: () => this.plugin.activateResources("knowledge"),
      },
      {
        title: "个人方向",
        eyebrow: "03 / GROW",
        description: "连接长期领域与今天",
        image: picked.grow,
        action: () => this.plugin.activateResources("about"),
      },
    ];
    waypoints.forEach((item: any) => {
      const card = wrap.createEl("button", { cls: "pp-waypoint" });
      card.setAttr("aria-label", item.title + "：" + item.description);
      const image = this.plugin.assetResourcePath(item.image);
      if (image) card.style.backgroundImage = 'url("' + image + '")';
      el(card, "span", item.eyebrow, "pp-waypoint-eyebrow");
      el(card, "strong", item.title, "pp-waypoint-title");
      el(card, "span", item.description, "pp-waypoint-description");
      card.onclick = item.action;
    });
  }
  renderProjects(parent: any, data: any) {
    const panel = this.panel(parent, "项目推演", "项目是决策层，任务是执行层。点击项目进入单项目页面。");
    const projects = data.projects
      .filter((project: any) => String(project.frontmatter.status || "active").toLowerCase() !== "archived")
      .slice(0, 8);
    if (!projects.length) return this.empty(panel.body, "暂无项目", "点击“新建项目”创建项目文件夹和项目文档。");
    projects.forEach((project: any) => {
      const row = panel.body.createDiv({ cls: "pp-project-row" });
      const main = row.createDiv({ cls: "pp-row-main" });
      const link = main.createEl("button", { cls: "pp-link-button" });
      link.setText(project.frontmatter.title || nameOf(project.file.path));
      link.onclick = () => this.plugin.openProject(project.file);
      const meta = main.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, project.projectStatus || projectStatus(project));
      if (project.frontmatter.deadline) el(meta, "span", "DDL " + project.frontmatter.deadline, "pp-muted");
      if (project.frontmatter.area) el(meta, "span", "领域 " + project.frontmatter.area, "pp-muted");
      el(meta, "span", "权重 " + text(project.frontmatter.weight, 3), "pp-muted");
      el(row, "span", project.progress + "% · " + project.done + "/" + project.total + " 任务完成", "pp-progress-text");
      const bar = row.createDiv({ cls: "pp-progress-bar" });
      bar.createDiv({ cls: "pp-progress-fill" }).style.width = project.progress + "%";
    });
  }
  renderTimeline(parent: any, data: any) {
    const panel = this.panel(parent, "时间监控", "DDL、关键节点和执行状态。完成后可归档到项目库。");
    const tasks = data.overdue.concat(data.upcoming).slice(0, 12);
    if (!tasks.length)
      return this.empty(panel.body, "时间线上没有待处理任务", "任务会从项目文件夹和日程待办目录读取。");
    tasks.forEach((task: any) => {
      const row = panel.body.createDiv({ cls: "pp-task-row" });
      const link = row.createEl("button", { cls: "pp-link-button pp-task-content" });
      link.setText(task.frontmatter.title || nameOf(task.file.path));
      link.onclick = () => this.plugin.openFile(task.file);
      const meta = row.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, task.taskStatus || taskStatus(task));
      const offset = daysUntil(task.frontmatter.due || task.frontmatter.deadline);
      const due =
        offset === null
          ? "无 DDL"
          : offset < 0
            ? "逾期 " + Math.abs(offset) + " 天"
            : offset === 0
              ? "今天"
              : offset + " 天后";
      el(
        meta,
        "span",
        due + " · " + text(task.frontmatter.duration, this.plugin.settings.defaultTaskDuration) + " 分钟",
        offset !== null && offset < 0 ? "pp-danger" : "pp-muted",
      );
      const actions = row.createDiv({ cls: "pp-task-actions" });
      const edit = actions.createEl("button", { cls: "pp-icon-button" });
      edit.setText("编辑");
      edit.onclick = () => this.plugin.editTask(task);
      const archive = actions.createEl("button", { cls: "pp-icon-button" });
      archive.setText("归档到项目库");
      archive.onclick = () => this.plugin.archiveTask(task);
      const remove = actions.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteTask(task);
    });
  }

  renderTimePlan(parent: any, data: any) {
    const panel = this.panel(parent, "今日任务监控", "今天到期的任务与容量占用；下面是未来几天的负载。");
    const plan = data.timePlan || { days: [] as any[], unscheduled: [] as any[] };
    if (!plan.days.length)
      return this.empty(panel.body, "暂无时间规划", "设置任务 DDL 和时长后，这里会显示今日容量与未来负载。");

    /* 今日优先：先列今天到期的任务，再给未来几天的负载条 */
    const todayPlan = plan.days.find((day: any) => day.date === today()) || plan.days[0];
    const todayTasks = todayPlan.tasks || [];
    const todayMinutes = todayTasks.reduce(
      (sum: number, task: any) => sum + (Number(task.frontmatter?.duration) || 0),
      0,
    );
    const monitor = panel.body.createDiv({ cls: "pp-today-monitor" });
    const monitorHead = monitor.createDiv({ cls: "pp-time-plan-day-head" });
    el(monitorHead, "strong", "TODAY / 今日 " + todayPlan.date);
    el(
      monitorHead,
      "span",
      todayTasks.length + " 项 · " + todayMinutes + " 分钟" + (todayPlan.overloaded ? " · 超载" : ""),
      todayPlan.overloaded ? "pp-danger" : "pp-muted",
    );
    if (todayTasks.length) {
      const todayList = monitor.createDiv({ cls: "pp-time-plan-tasks" });
      todayTasks.forEach((task: any) => {
        const link = todayList.createEl("button", { cls: "pp-link-button pp-task-content" });
        link.setText(
          (task.frontmatter.title || nameOf(task.file.path)) + " · " + text(task.frontmatter.duration, 0) + " 分钟",
        );
        link.onclick = () => this.plugin.openFile(task.file);
      });
    } else {
      el(monitor, "p", "今天没有到期的任务。", "pp-muted");
    }
    el(panel.body, "h3", "未来 " + plan.days.length + " 天负载", "pp-task-group-title");
    plan.days.forEach((day: any) => {
      const row = panel.body.createDiv({
        cls: day.overloaded ? "pp-time-plan-day pp-time-plan-day-overloaded" : "pp-time-plan-day",
      });
      const head = row.createDiv({ cls: "pp-time-plan-day-head" });
      el(head, "strong", day.date);
      el(
        head,
        "span",
        day.minutes + " / " + day.capacity + " 分钟" + (day.overloaded ? " · 超载" : ""),
        day.overloaded ? "pp-danger" : "pp-muted",
      );
      const bar = row.createDiv({ cls: "pp-progress-bar" });
      const fill = bar.createDiv({ cls: "pp-progress-fill" });
      fill.style.width = Math.min(100, Math.round((day.minutes / day.capacity) * 100)) + "%";
      if (day.overloaded) fill.style.background = "var(--color-red)";
      if (day.tasks.length) {
        const tasks = row.createDiv({ cls: "pp-time-plan-tasks" });
        day.tasks.forEach((task: any) => {
          const link = tasks.createEl("button", { cls: "pp-link-button pp-time-plan-task" });
          link.setText(
            (task.frontmatter.title || nameOf(task.file.path)) + " · " + text(task.frontmatter.duration, 0) + " 分钟",
          );
          link.onclick = () => this.plugin.openFile(task.file);
        });
      }
    });
    if (plan.unscheduled.length) el(panel.body, "p", "未排期任务：" + plan.unscheduled.length + " 项", "pp-muted");
  }
  renderInbox(parent: any, data: any) {
    const panel = this.panel(
      parent,
      "分诊 / 整理",
      "00 草稿箱只作为入口；处理后移动到项目、任务、知识、领域、人物或归档。",
    );
    if (!data.inbox.length) return this.empty(panel.body, "草稿箱为空", "临时笔记和未归类内容会显示在这里。");
    data.inbox.slice(0, 8).forEach((item: any) => {
      const row = panel.body.createDiv({ cls: "pp-inbox-row" });
      const link = row.createEl("button", { cls: "pp-link-button" });
      link.setText(item.frontmatter.title || nameOf(item.file.path));
      link.onclick = () => this.plugin.openTriage(item.file);
      const action = row.createEl("button", { cls: "pp-icon-button" });
      action.setText("分诊");
      action.onclick = () => this.plugin.openTriage(item.file);
    });
  }
  renderGaps(parent: any, data: any) {
    const panel = this.panel(parent, "知识缺口 / 学习计划", "缺口可以从项目任务中识别，再沉淀回知识库形成复用引用。");
    if (!data.gaps.length)
      return this.empty(panel.body, "暂无显式知识缺口", "新建任务时将类型设为 knowledge-gap，即可在这里追踪。");
    data.gaps.slice(0, 8).forEach((task: any) => {
      const row = panel.body.createDiv({ cls: "pp-task-row" });
      const link = row.createEl("button", { cls: "pp-link-button pp-task-content" });
      link.setText(task.frontmatter.title || nameOf(task.file.path));
      link.onclick = () => this.plugin.openFile(task.file);
      const meta = row.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, task.taskStatus || taskStatus(task));
      el(meta, "span", text(task.frontmatter.project, "未关联项目"), "pp-muted");
      const actions = row.createDiv({ cls: "pp-task-actions" });
      const edit = actions.createEl("button", { cls: "pp-icon-button" });
      edit.setText("编辑");
      edit.onclick = () => this.plugin.editTask(task);
      const materialize = actions.createEl("button", { cls: "pp-icon-button" });
      materialize.setText("沉淀到知识库");
      materialize.onclick = () => this.plugin.materializeKnowledgeGap(task);
      const remove = actions.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteTask(task);
    });
  }
}
