/**
 * 视图层与插件之间的契约。
 *
 * 之前 views / settings / core-web 里写的是 `plugin: any`：成员名拼错、参数少传，只会在运行时
 * 表现成"按钮没反应"。这里把消费方真正用到的成员显式声明出来，由 plugin.ts `implements`
 * 保证提供方真的实现了它，双向都能在编译期检查。
 *
 * 参数列表抄自 plugin.ts 的真实声明：接口不允许写默认值，所以带默认值的参数在这里标成可选。
 * 类型先保持宽松（`any`），后续可以逐个收紧。
 */
import type { Settings } from "./core/constants";

export interface DashboardHost {
  activateApp(): any;
  activateDashboard(): any;
  activateInbox(): any;
  activateResources(category: any): any;
  activateTasks(): any;
  /** Obsidian App（由 Plugin 基类提供） */
  app: any;
  appOwner: any;
  archiveBook(item: any): any;
  archiveProject(project: any): any;
  archiveTask(task: any, project?: any, options?: any): any;
  assetResourcePath(path: any): any;
  checkReminders(force: any): any;
  collectData(): any;
  collectWebPayload(): any;
  copyToClipboard(value: any): any;
  deleteFile(file: any, label: string): any;
  deleteMilestone(project: any, milestone: any): any;
  deleteProject(project: any): any;
  deleteTask(task: any): any;
  editMilestone(project: any, milestone: any): any;
  editProject(project: any): any;
  editTask(task: any, project?: any): any;
  ensureFolder(path: any): any;
  flushSaveSettings(): any;
  getMilestones(project: any, tasks: any): any;
  importInboxAsTaskSet(file?: any): any;
  initializeStructure(): any;
  lastFolderWarning: any;
  materializeKnowledgeGap(task: any): any;
  missingConfiguredFolders(): any;
  newMilestone(project: any): any;
  newProject(): any;
  newTask(project?: any, presetMilestone?: any): any;
  openFile(file: any): any;
  openPath(target: any): any;
  openPersonalNote(path: any, title: any): any;
  openProject(file: any): any;
  openTriage(file: any): any;
  projectStatus(file: any): any;
  refreshViews(): any;
  saveSettings(options?: any): any;
  scheduleSaveSettings(): any;
  /** 用户设置（类型定义见 core/constants 的 Settings） */
  settings: Settings;
  settingsIssues(): any;
  triageInbox(): any;
  undoArchiveTask(task: any, project: any, options?: any): any;
  uniqueBinaryPath(folder: any, fileName: any): any;
  warnMissingFolders(): any;
  webAppApi(): any;
  webAppError: any;
  webPerform(action: any, target: any, extra: any): any;
}
