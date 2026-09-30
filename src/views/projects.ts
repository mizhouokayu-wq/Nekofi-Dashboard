/** projects：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import * as obsidian from "obsidian";
import { PROJECT_VIEW } from "../core/constants";
import { today } from "../core/dates";
import { el } from "../core/dom";
import { text } from "../core/frontmatter";
import { nameOf, projectMatches } from "../core/paths";
import { projectStatus, statusBadge, taskStatus } from "../core/status";
import { shouldSplitTask } from "../core/tasks";
import { renderKnowledgeLinks } from "../core/web";
import { PlanningView } from "./base";
import type { DashboardHost } from "../host";

export class ProjectView extends PlanningView {
  activeMilestone: any;
  path: any;
  constructor(leaf: any, plugin: DashboardHost) {
    super(leaf, plugin);
    this.path = "";
    this.activeMilestone = "";
  }
  getViewType() {
    return PROJECT_VIEW;
  }
  override getDisplayText() {
    return "单项目页面";
  }
  override getIcon() {
    return "kanban-square";
  }
  override async setState(state: any) {
    this.path = (state && state.path) || "";
    await this.refresh();
  }
  override getState() {
    return { path: this.path };
  }
  override async onOpen() {
    if (!this.path) return;
  }
  override async refresh() {
    const { version: renderVersion, root } = this.beginRender("project");
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof obsidian.TFile)) {
      el(root, "p", "项目文件不存在。", "pp-muted");
      this.finishRender(root);
      return;
    }
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const project = data.projects.find((item: any) => item.file.path === file.path);
    if (!project) {
      el(root, "p", "该文件没有被识别为项目，请确认 type: project 或位于项目库目录。", "pp-muted");
      this.finishRender(root);
      return;
    }
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const titleBlock = header.createDiv({ cls: "pp-title-block" });
    el(titleBlock, "h1", project.frontmatter.title || nameOf(project.file.path));
    const meta = titleBlock.createDiv({ cls: "pp-meta-line" });
    statusBadge(meta, project.projectStatus || projectStatus(project));
    el(meta, "span", project.file.path, "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    this.button(actions, "添加任务", () => this.plugin.newTask(project), true);
    this.button(actions, "新建关键节点", () => this.plugin.newMilestone(project));
    this.button(actions, "编辑项目", () => this.plugin.editProject(project));
    this.button(actions, "更新状态", () => this.plugin.projectStatus(project.file));
    this.button(actions, "归档项目", () => this.plugin.archiveProject(project));
    this.button(actions, "删除项目", () => this.plugin.deleteProject(project));
    this.button(actions, "打开源笔记", () => this.plugin.openFile(project.file));
    const summary = root.createDiv({ cls: "pp-project-summary" });
    [
      ["完成度", project.progress + "%"],
      ["已完成任务", project.done + "/" + project.total],
      ["DDL", text(project.frontmatter.deadline || project.frontmatter.ddl)],
      ["资源约束", text(project.frontmatter.resource_constraints || project.frontmatter.constraints)],
      ["长期领域", text(project.frontmatter.area)],
      ["项目权重", text(project.frontmatter.weight, 3)],
    ].forEach((item: any) => {
      const box = summary.createDiv({ cls: "pp-summary-item" });
      el(box, "span", item[0], "pp-muted");
      el(box, "strong", item[1]);
    });
    const details = root.createDiv({ cls: "pp-detail-grid" });
    [
      ["最终结果（终点画像）", project.frontmatter.outcome || project.frontmatter.final_outcome],
      ["验收标准（量化指标）", project.frontmatter.acceptance || project.frontmatter.acceptance_criteria],
    ].forEach((item: any) => {
      const box = details.createDiv({ cls: "pp-detail-card" });
      el(box, "h3", item[0]);
      el(box, "p", text(item[1], "尚未定义"));
    });
    this.renderTracking(root, project, data);
    const guidance = root.createDiv({ cls: "pp-section pp-guidance" });
    el(guidance, "h2", "项目运行提示");
    const list = guidance.createEl("ul");
    [
      "先定义最终结果和验收标准，再倒推 DDL 与关键节点。",
      "若任务超过 10 分钟且不在一周内完成，进入执行前再拆为可行动步骤。",
      "阻塞项回写项目笔记，更新暂停原因、资源约束或知识缺口。",
      "知识缺口任务完成后，把资料沉淀到知识库，供后续项目复用。",
    ].forEach((item: any) => el(list, "li", item));
    this.finishRender(root);
  }

  renderTracking(root: any, project: any, data: any) {
    const tasks = data.allTasks.filter((task: any) => projectMatches(task, project));
    const milestones = this.plugin.getMilestones(project, tasks);
    if (!milestones.includes(this.activeMilestone)) this.activeMilestone = milestones[0];
    const card = root.createDiv({ cls: "pp-task-tracking-card" });
    const head = card.createDiv({ cls: "pp-task-tracking-head" });
    const copy = head.createDiv();
    el(copy, "h2", "任务追踪");
    el(copy, "p", "关键节点作为任务拆解的父级；任务名称、任务属性和归档操作保持在同一行。", "pp-muted");
    const actions = head.createDiv({ cls: "pp-actions" });
    this.button(actions, "添加任务", () => this.plugin.newTask(project), true);
    this.button(actions, "新建关键节点", () => this.plugin.newMilestone(project));
    const tabs = card.createDiv({ cls: "pp-milestone-tabs" });
    milestones.forEach((milestone: any) => {
      const tabWrap = tabs.createDiv({
        cls:
          milestone === this.activeMilestone
            ? "pp-milestone-tab-wrap pp-milestone-tab-wrap-active"
            : "pp-milestone-tab-wrap",
      });
      const tab = tabWrap.createEl("button", {
        cls: milestone === this.activeMilestone ? "pp-milestone-tab pp-milestone-tab-active" : "pp-milestone-tab",
      });
      tab.setText(milestone);
      tab.onclick = async () => {
        this.activeMilestone = milestone;
        await this.refresh();
      };
      if (milestone !== "未分组") {
        const edit = tabWrap.createEl("button", { cls: "pp-milestone-edit" });
        edit.setText("编辑");
        edit.setAttr("aria-label", "编辑关键节点");
        edit.onclick = (event: any) => {
          event.stopPropagation();
          this.plugin.editMilestone(project, milestone);
        };
        const remove = tabWrap.createEl("button", { cls: "pp-milestone-delete" });
        remove.setText("×");
        remove.setAttr("aria-label", "删除关键节点");
        remove.onclick = (event: any) => {
          event.stopPropagation();
          this.plugin.deleteMilestone(project, milestone);
        };
      }
    });
    const body = card.createDiv({ cls: "pp-task-list" });
    el(body, "h3", this.activeMilestone + " · 任务拆解 / 执行状态", "pp-task-group-title");
    const filtered = tasks.filter((task: any) => (task.frontmatter.milestone || "未分组") === this.activeMilestone);
    if (!filtered.length) {
      const empty = body.createDiv({ cls: "pp-empty" });
      el(empty, "strong", "这个关键节点还没有任务");
      el(empty, "span", "点击“添加任务”把下一步行动放入当前关键节点。", "pp-muted");
      return;
    }
    filtered.forEach((task: any) => {
      const item = body.createDiv({ cls: "pp-task-item" });
      const content = item.createEl("button", { cls: "pp-link-button pp-task-content" });
      content.setText(task.frontmatter.title || nameOf(task.file.path));
      content.onclick = () => this.plugin.openFile(task.file);
      const meta = item.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, task.taskStatus || taskStatus(task));
      el(meta, "span", "DDL " + text(task.frontmatter.due || task.frontmatter.deadline), "pp-muted");
      el(meta, "span", text(task.frontmatter.duration, this.plugin.settings.defaultTaskDuration) + " 分钟", "pp-muted");
      if (task.frontmatter.assignee) el(meta, "span", "执行者 " + task.frontmatter.assignee, "pp-muted");
      if (shouldSplitTask(task.frontmatter, today())) el(meta, "span", "建议拆解", "pp-muted");
      renderKnowledgeLinks(meta, task, data.resources, this.plugin);
      const taskActions = item.createDiv({ cls: "pp-task-actions" });
      const edit = taskActions.createEl("button", { cls: "pp-icon-button" });
      edit.setText("编辑");
      edit.onclick = () => this.plugin.editTask(task, project);
      if (String(task.taskStatus || taskStatus(task)).toLowerCase() === "archived") {
        const undo = taskActions.createEl("button", { cls: "pp-icon-button" });
        undo.setText("撤销归档");
        undo.onclick = () => this.plugin.undoArchiveTask(task, project);
      } else {
        const done = taskActions.createEl("button", { cls: "pp-icon-button" });
        done.setText("完成并归档到项目库");
        done.onclick = () => this.plugin.archiveTask(task, project);
      }
      const remove = taskActions.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteTask(task);
    });
  }
}

/* ========================= 5b. Web 渲染层视图 ========================= *
 * 把 web/ 的只读仪表盘（夜航极光设计系统）挂进 Obsidian：
 *   · 数据实时取自 Vault（collectWebPayload），不再是离线导出的 data.js；
 *   · 界面挂在与宿主隔离的 Shadow DOM 里，插件样式与页面样式互不污染；
 *   · 点击「在 Obsidian 打开」直接跳到对应笔记，而不是 obsidian:// 外链。
 * 渲染层源码在文件末尾的生成区块，由 web/tools/sync-app.mjs 生成。
 * ================================================================== */
/** 与 web/index.html 同构的静态骨架：无外部输入，可安全用 innerHTML 注入 */
