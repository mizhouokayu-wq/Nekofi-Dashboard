/** resources：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import * as obsidian from "obsidian";
import { RESOURCES_VIEW } from "../core/constants";
import { el } from "../core/dom";
import { nameOf } from "../core/paths";
import { PlanningView } from "./base";
import type { DashboardHost } from "../host";

export class ResourceView extends PlanningView {
  category: any;
  constructor(leaf: any, plugin: DashboardHost) {
    super(leaf, plugin);
    this.category = "knowledge";
  }
  getViewType() {
    return RESOURCES_VIEW;
  }
  getDisplayText() {
    return "规划资源";
  }
  override getIcon() {
    return "library";
  }
  override async setState(state: any) {
    this.category = state?.category === "personal" ? "about" : state?.category || "knowledge";
    await this.refresh();
  }
  override getState() {
    return { category: this.category };
  }
  override async refresh() {
    const { version: renderVersion, root } = this.beginRender(this.category);
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const resourceMap = data.resources || {
      areas: [] as any[],
      knowledge: [] as any[],
      people: [] as any[],
      books: [] as any[],
      videos: [] as any[],
    };
    const titles: Record<string, any> = {
      areas: "长期领域",
      knowledge: "知识与图书",
      people: "人物库",
      about: "关于我",
      wealth: "财富",
    };
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const titleBlock = header.createDiv({ cls: "pp-title-block" });
    el(titleBlock, "h1", titles[this.category] || titles.knowledge);
    el(titleBlock, "p", "把资料、领域和个人支点放回同一个可执行的规划系统。", "pp-muted");
    if (this.category === "about" || this.category === "wealth") {
      const personal = this.category === "about" ? ["关于我", "关于我.md"] : ["财富相关", "财富.md"];
      const row = root.createDiv({ cls: "pp-resource-section pp-personal-panel" });
      el(row, "h2", personal[0]);
      el(
        row,
        "p",
        this.category === "about" ? "记录你的身份、现状、目标与近期行动。" : "记录收入、支出、资产、风险与财富目标。",
        "pp-muted",
      );
      const path = obsidian.normalizePath(this.plugin.settings.areaFolder + "/" + personal[1]);
      const existing = this.plugin.app.vault.getAbstractFileByPath(path);
      const button = row.createEl("button", { cls: "pp-button pp-button-primary" });
      button.setText(existing instanceof obsidian.TFile ? "打开笔记" : "创建并打开笔记");
      button.onclick = () => this.plugin.openPersonalNote(path, personal[0]);
      this.finishRender(root);
      return;
    }
    const groups =
      this.category === "areas"
        ? [["长期领域", resourceMap.areas]]
        : this.category === "people"
          ? [["人物", resourceMap.people]]
          : [
              ["知识笔记", resourceMap.knowledge],
              ["图书", resourceMap.books],
              ["视频", resourceMap.videos],
            ];
    groups.forEach(([label, items]: any) => {
      const section = root.createDiv({ cls: "pp-resource-section" });
      el(section, "h2", label + "（" + items.length + "）");
      if (!items.length) {
        el(section, "p", "暂无条目", "pp-muted");
        return;
      }
      items.forEach((item: any) => {
        const row = section.createDiv({ cls: "pp-resource-row" });
        const link = row.createEl("button", { cls: "pp-link-button" });
        link.setText(item.frontmatter.title || nameOf(item.file.path));
        link.onclick = () => this.plugin.openFile(item.file);
        el(row, "span", item.file.path, "pp-muted");
        if (this.category === "areas") {
          const areaName = item.frontmatter.title || nameOf(item.file.path);
          const projects = data.projects.filter(
            (project: any) => project.frontmatter.area === areaName || project.frontmatter.area === item.file.path,
          );
          el(row, "span", "关联项目 " + projects.length + " 个", "pp-muted");
          projects.forEach((project: any) => {
            const button = row.createEl("button", { cls: "pp-icon-button" });
            button.setText(project.frontmatter.title || nameOf(project.file.path));
            button.onclick = () => this.plugin.openProject(project.file);
          });
        }
        if (label === "图书") {
          const archive = row.createEl("button", { cls: "pp-icon-button" });
          archive.setText("阅读完成并归档");
          archive.onclick = () => this.plugin.archiveBook(item);
        }
      });
    });
    this.finishRender(root);
  }
}
