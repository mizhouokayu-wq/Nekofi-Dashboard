/** inbox：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import { INBOX_VIEW } from "../core/constants";
import { el } from "../core/dom";
import { text } from "../core/frontmatter";
import { nameOf } from "../core/paths";
import { PlanningView } from "./base";
import type { DashboardHost } from "../host";

export class InboxView extends PlanningView {
  getViewType() {
    return INBOX_VIEW;
  }
  getDisplayText() {
    return "草稿箱";
  }
  override getIcon() {
    return "inbox";
  }
  override async refresh() {
    const { version: renderVersion, root } = this.beginRender("inbox");
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const title = header.createDiv({ cls: "pp-title-block" });
    el(title, "h1", "草稿箱");
    el(title, "p", "所有未分诊内容都先停留在这里；分诊后才进入项目、任务、知识、领域、人物或归档。", "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    const refresh = actions.createEl("button", { cls: "pp-button" });
    refresh.setText("刷新");
    refresh.onclick = () => this.refresh();
    const importTasks = actions.createEl("button", { cls: "pp-button pp-button-primary" });
    importTasks.setText("周维护导入任务集");
    importTasks.onclick = () => this.plugin.importInboxAsTaskSet();
    if (!data.inbox.length) {
      const empty = root.createDiv({ cls: "pp-onboarding" });
      el(empty, "strong", "草稿箱为空");
      el(empty, "span", "新的临时笔记会出现在这里。", "pp-muted");
      this.finishRender(root);
      return;
    }
    const panel = root.createDiv({ cls: "pp-inbox-screen" });
    data.inbox.forEach((item: any) => {
      const row = panel.createDiv({ cls: "pp-inbox-card" });
      const content = row.createDiv({ cls: "pp-inbox-card-content" });
      const link = content.createEl("button", { cls: "pp-link-button pp-task-content" });
      link.setText(item.frontmatter.title || nameOf(item.file.path));
      link.onclick = () => this.plugin.openFile(item.file);
      el(content, "div", item.file.path, "pp-muted");
      const meta = content.createDiv({ cls: "pp-meta-line" });
      el(meta, "span", "阶段：" + text(item.frontmatter.stage, "inbox"), "pp-muted");
      const actions = row.createDiv({ cls: "pp-task-actions" });
      const triage = actions.createEl("button", { cls: "pp-icon-button" });
      triage.setText("分诊");
      triage.onclick = () => this.plugin.openTriage(item.file);
      const open = actions.createEl("button", { cls: "pp-icon-button" });
      open.setText("打开");
      open.onclick = () => this.plugin.openFile(item.file);
      const remove = actions.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteFile(item.file, "草稿");
    });
    this.finishRender(root);
  }
}
