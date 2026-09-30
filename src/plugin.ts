/** 插件主体：命令、事件、数据采集、文件操作、归档与提醒（由 main.ts 搬出，逻辑未改）。 */
import * as obsidian from "obsidian";
import {
  addDays,
  dateOf,
  daysUntil,
  firstOccurrenceOnOrAfter,
  isoWeekday,
  nextRecurringDate,
  normalizeMonthDay,
  normalizeWeekdays,
  recurrenceAnchorOf,
  recurrenceMonthDayOf,
  recurrenceUntilOf,
  recurrenceWeekdaysOf,
  today,
  weekdayLabel,
} from "./core/dates";
import {
  cleanName,
  directChild,
  folderPathOf,
  forbiddenPath,
  inFolder,
  nameOf,
  normalizeList,
  pickProject,
  projectMatches,
  refs,
  stripProjectPrefix,
} from "./core/paths";
import {
  frontmatterSpan,
  makeMD,
  parseFM,
  parseFMValue,
  pickEol,
  text,
  writeFM,
  yamlScalar,
  yamlValue,
} from "./core/frontmatter";
import { el, expectedError } from "./core/dom";
import {
  DASHBOARD_VIEW,
  PROJECT_VIEW,
  INBOX_VIEW,
  TASKS_VIEW,
  RESOURCES_VIEW,
  APP_VIEW,
  HERO_CROP_RATIO,
  PLUGIN_BUILD,
  TONE_INK,
  resolveAssetImages,
  DEFAULTS,
  STATUS,
  KNOWN_STATUS_VALUES,
  NON_TASK_TYPES,
  ARCHIVED_OVERWRITTEN_KEYS,
  FOLDER_SETTING_KEYS,
  DISTINCT_FOLDER_KEYS,
  EDITABLE_FIELDS,
  WEEKDAY_OPTIONS,
  MONTHDAY_SELECT,
  coerceFieldValue,
  type FolderSettingKey,
  type Settings,
} from "./core/constants";
import { clampInt, normalizeFolderSetting, normalizeSettings, folderClashes } from "./core/settings";
import { isTaskNote, statusLabel, taskStatus, projectStatus, statusBadge } from "./core/status";
import {
  buildTimePlan,
  buildReminderMessages,
  buildTaskHierarchy,
  taskImportPatch,
  shouldSplitTask,
  buildResourceMap,
  resolveKnowledgeRefs,
  filterTaskList,
  sortTaskList,
  isCompletedTask,
  selectInboxItems,
  blockerItems,
  buildAssigneeOptions,
  mapWithConcurrency,
  buildProjectIndex,
} from "./core/tasks";
import {
  toneFromLuminance,
  resolveAssetPath,
  isImageAssetPath,
  listImageAssetPaths,
  collectImageAssetFiles,
  computeBannerDisplay,
  computeCropStage,
  applyHeroCrop,
  writeBannerBinary,
  loadBannerImage,
} from "./core/assets";
import {
  renderKnowledgeLinks,
  renderNavigation,
  webChecklistOf,
  webSummaryOf,
  webResourceSummary,
  buildNoteIndex,
  buildWebPayload,
  WEB_SHELL_HTML,
  WEB_SHADOW_BRIDGE_CSS,
  shadowScopedCss,
} from "./core/web";
import { FormModal, ChoiceModal, MultiChoiceModal, ConfirmModal } from "./views/modals";
import { PlanningView } from "./views/base";
import { DashboardView } from "./views/dashboard";
import { InboxView } from "./views/inbox";
import { TaskListView } from "./views/tasks";
import { ResourceView } from "./views/resources";
import { ProjectView } from "./views/projects";
import { WebAppView } from "./views/web-app";
import { BannerPickerModal, BannerCropModal } from "./views/banner";
import { SettingsTab } from "./settings/tab";

/** 由 sync-app.mjs 注入到 main.js 末尾的脚本级函数：模块与它同一文件作用域 */
declare const ppWebAppFactory: any;

import type { DashboardHost } from "./host";

/** 删除类确认框统一用这句：删除方式跟随用户的「删除文件」设置。
 *  以前三处各不相同：deleteProject 写"不能撤销"却又真的永久删除，
 *  deleteFile / deleteTask 反过来 —— 跟随设置却声称"会被永久删除"。
 *  用户据此判断"删掉还能不能找回"，文案与行为不一致就是误导。
 *
 *  实现侧（2026-09-28 修）：真正读该设置的入口只有 `app.fileManager.trashFile`。
 *  `app.vault.delete(entry)` 既不读设置（对文件是直接 unlink = 永久删除），
 *  在 Obsidian 1.13 里对文件夹还会以 ERR_FS_EISDIR 失败
 *  （"Path is a directory: rm returned EISDIR (is a directory) …"，因为
 *  FileSystemAdapter.rmdir 把 recursive=force 直接透给 fs.rm，force 默认 false）。
 *  所以四个删除入口（项目文件夹 / 归档合并后的空壳文件夹 / 单文件 / 单任务）一律走 trashFile。 */
const DELETE_HINT = "删除方式跟随 Obsidian 的「删除文件」设置（系统回收站或永久删除）。";

/** 笔记缓存的**轮次目标**：每轮扫描开始前裁到这个规模（见 trimNoteCache）。 */
const NOTE_CACHE_LIMIT = 4000;
/** 轮中硬上限：一轮扫描会把工作集读回缓存，这里给它留一倍余量。
 *  超过就当场裁到目标规模，保证内存不会随库的规模无限膨胀。 */
const NOTE_CACHE_HARD_LIMIT = NOTE_CACHE_LIMIT * 2;

export default class PersonalPlanningDashboard extends obsidian.Plugin implements DashboardHost {
  /** 用户设置：类型定义在 core/constants 的 Settings（键名写错会在编译期报错） */
  override settings: Settings = normalizeSettings({});
  dataCache: any;
  collectPromise: any;
  refreshQueued: any;
  viewRefreshTimers: any;
  override manifest: any;
  resourceCache: any;
  heroCropCache: any;
  pendingSaves: any;
  appOwner: any;
  assetPathCache: any;
  lastBulkFailures: any;
  /** 最近一次「本周期完成」的快照：撤销按钮据此把执行日与状态放回去（插件重载后失效） */
  lastRecurringCompletion: any;
  lastFolderWarning: any;
  noteCache: any;
  refreshTimer: any;
  saveTimer: any;
  statusSyncFailures: any;
  toneCache: any;
  webApiCache: any;
  webAppError: any;
  webPayloadPromise: any;
  /** 最近一次归档是否正好走完了重复序列（DDL 已到）：只用于把归档提示说清楚 */
  lastRecurrenceEnded: any;
  override async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.settings = normalizeSettings(this.settings);
    this.refreshTimer = null;
    this.assetPathCache = null;
    this.statusSyncFailures = new Set();
    this.appOwner = null;
    this.registerView(DASHBOARD_VIEW, (leaf: any) => new DashboardView(leaf, this));
    this.registerView(PROJECT_VIEW, (leaf: any) => new ProjectView(leaf, this));
    this.registerView(INBOX_VIEW, (leaf: any) => new InboxView(leaf, this));
    this.registerView(TASKS_VIEW, (leaf: any) => new TaskListView(leaf, this));
    this.registerView(RESOURCES_VIEW, (leaf: any) => new ResourceView(leaf, this));
    this.registerView(APP_VIEW, (leaf: any) => new WebAppView(leaf, this));
    this.addCommand({ id: "open-dashboard", name: "打开个人规划仪表盘（Web 版）", callback: () => this.activateApp() });
    this.addCommand({ id: "new-project", name: "新建项目", callback: () => this.newProject() });
    this.addCommand({ id: "new-task", name: "新建任务", callback: () => this.newTask() });
    this.addCommand({ id: "triage-inbox", name: "处理草稿箱", callback: () => this.triageInbox() });
    this.addCommand({
      id: "import-inbox-task-set",
      name: "周维护：导入草稿为任务集",
      callback: () => this.importInboxAsTaskSet(),
    });
    this.addCommand({
      id: "initialize-structure",
      name: "初始化规划目录结构",
      callback: () => this.initializeStructure(),
    });
    this.addCommand({
      id: "archive-active-task",
      name: "归档当前任务到项目库",
      callback: () => this.archiveActiveTask(),
    });
    this.addCommand({
      id: "undo-archive-active-task",
      name: "撤销当前任务归档",
      callback: () => this.undoArchiveActiveTask(),
    });
    this.addCommand({
      id: "undo-recurring-completion",
      name: "撤销上一次重复周期完成",
      callback: () => this.undoRecurringCompletion(),
    });
    this.addCommand({
      id: "open-classic-views",
      name: "打开经典视图（排错用）",
      callback: () => this.activateDashboard(),
    });
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRefreshViews()));
    this.registerEvent(
      this.app.vault.on("modify", (file: any) => {
        this.invalidateNoteCache(file);
        this.scheduleRefreshViews();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", () => {
        this.invalidateNoteCache();
        this.scheduleRefreshViews();
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", () => {
        this.invalidateNoteCache();
        this.scheduleRefreshViews();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.app.workspace.getLeavesOfType(APP_VIEW).forEach((leaf: any) => (leaf.view as any)?.applyTheme?.());
      }),
    );
    this.addCommand({ id: "check-reminders", name: "检查规划提醒", callback: () => this.checkReminders(true) });
    this.registerInterval(
      window.setInterval(
        () => {
          void this.checkReminders(false);
        },
        15 * 60 * 1000,
      ),
    );
    void this.checkReminders(false);
  }
  override async onunload() {
    this.appOwner = null;
    this.flushSaveSettings();
    this.cancelScheduledRefresh();
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW);
    this.app.workspace.detachLeavesOfType(PROJECT_VIEW);
    this.app.workspace.detachLeavesOfType(INBOX_VIEW);
    this.app.workspace.detachLeavesOfType(TASKS_VIEW);
    this.app.workspace.detachLeavesOfType(RESOURCES_VIEW);
    this.app.workspace.detachLeavesOfType(APP_VIEW);
  }
  /** 读一篇受管笔记：能复用缓存就复用，只有任务/项目才需要正文。
   *  正文按 (mtime, size) 缓存；frontmatter 始终以最新索引为准。
   *  Obsidian 的索引更新可能晚于文件保存，不能用文件时间戳缓存索引快照。 */
  async readManagedNote(file: any) {
    const cached = this.fm(file) || {};
    const indexed = Object.keys(cached).length > 0;
    const needsBody = !indexed || isTaskNote(file.path, cached, this.settings) || this.isProjectFile(file, cached);
    if (!needsBody) {
      /* 知识 / 领域 / 人物 / 草稿：正文没人看，直接跳过读盘与 frontmatter 解析 */
      return {
        path: file.path,
        name: nameOf(file.path),
        frontmatter: cached,
        body: "",
        checklist: undefined,
        summary: undefined,
      };
    }
    if (!this.noteCache) this.noteCache = new Map();
    const stat = file.stat || {};
    const hit = this.noteCache.get(file.path);
    if (hit && hit.mtime === stat.mtime && hit.size === stat.size && hit.indexed === indexed) {
      /* metadataCache changed 不会再改变 mtime/size；复用正文，但不能复用旧状态。 */
      if (indexed) hit.frontmatter = cached;
      return {
        path: file.path,
        name: nameOf(file.path),
        frontmatter: hit.frontmatter,
        body: hit.body,
        checklist: hit.checklist,
        summary: hit.summary,
      };
    }
    /* 轮中硬上限：正常库在一轮里不会碰到它；巨型库靠它兜住内存 */
    this.trimNoteCache(true);
    const raw = await this.app.vault.cachedRead(file);
    const parsed = parseFM(raw);
    /* frontmatter 以 metadataCache（真实 YAML 解析）为准，手写 parseFM 只兜底：
       行内数组与块标量后者解析不了（tags: [a, b] 会被拆错，导致知识缺口漏判）。 */
    /* cachedRead 的 await 期间索引也可能更新，读取完成后再取，避免回填旧快照。 */
    const latest = this.fm(file) || {};
    const latestIndexed = Object.keys(latest).length > 0;
    const frontmatter = latestIndexed ? latest : parsed.data || {};
    const body = parsed.body || "";
    /* 子任务清单与摘要只在正文变化时才算：以前每次刷新都要对全部任务/项目重跑两个正文正则，
       1,000 篇量级实测占掉推导耗时的绝大部分。 */
    const checklist = webChecklistOf(body);
    const summary = webSummaryOf(body);
    /* 上限只是兜底：正常靠事件失效，长会话不会无限增长 */
    this.noteCache.set(file.path, {
      mtime: stat.mtime,
      size: stat.size,
      indexed: latestIndexed,
      frontmatter,
      body,
      checklist,
      summary,
    });
    return { path: file.path, name: nameOf(file.path), frontmatter, body, checklist, summary };
  }
  /** 笔记缓存上限：按插入顺序淘汰最旧的一批。
   *  以前是 `clear()` 整体清空 —— 上千篇笔记会在下一次刷新时全部重新读盘解析（缓存雪崩），
   *  表现出来就是"用久了偶尔卡一下"。Map 保持插入顺序，淘汰头部即淘汰最久未更新的。 */
  trimNoteCache(hard = false) {
    const ceiling = hard ? NOTE_CACHE_HARD_LIMIT : NOTE_CACHE_LIMIT;
    if (!this.noteCache || this.noteCache.size <= ceiling) return;
    let excess = this.noteCache.size - NOTE_CACHE_LIMIT;
    for (const key of this.noteCache.keys()) {
      this.noteCache.delete(key);
      excess -= 1;
      if (excess <= 0) break;
    }
  }
  /** vault 事件驱动的精确失效：只丢改过的那一篇，其余继续复用 */
  invalidateNoteCache(file?: any) {
    if (!this.noteCache) return;
    if (file && typeof file.path === "string") this.noteCache.delete(file.path);
    else this.noteCache.clear();
  }
  /** 详情页字段直改：extra 是 JSON 字符串 { key, value }。
   *  只允许 EDITABLE_FIELDS 里的字段；空值 = 删除该字段（而不是写一个空字符串）。 */
  /** 任务集 / 任务组下拉里的「＋ 新建…」：问一个名字，然后写进这条任务的对应字段 */
  promptNewTaxonomy(item: any, extra: any) {
    if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
      return new obsidian.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    let payload: any = {};
    try {
      payload = JSON.parse(String(extra || "{}")) || {};
    } catch (error: any) {
      payload = {};
    }
    const key = String(payload.key || "").trim();
    const spec = (EDITABLE_FIELDS.task || []).find((field: any) => field.key === key);
    if (!spec) return new obsidian.Notice("不支持直接修改的字段：" + key);
    const current = String(
      (item.frontmatter && (item.frontmatter[key] || item.frontmatter.taskSet || item.frontmatter.taskGroup)) || "",
    );
    new FormModal(
      this.app,
      "新建" + spec.label,
      [
        {
          id: "name",
          name: spec.label + "名称",
          placeholder: spec.label === "任务集" ? "例如：本周维护" : "例如：资料整理",
          value: "",
        },
      ],
      async (values: any) => {
        const name = String(values.name || "").trim();
        if (!name) throw expectedError(spec.label + "名称不能为空");
        if (name === current) return;
        await this.updateFM(item.file, { [key]: name, updated: today() });
        this.invalidateNoteCache(item.file);
        new obsidian.Notice(spec.label + "已设为：" + name);
        this.refreshViews();
      },
    ).open();
  }
  async setNoteField(item: any, extra: any) {
    if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
      return new obsidian.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    let payload: any = {};
    try {
      payload = JSON.parse(String(extra || "{}")) || {};
    } catch (error: any) {
      payload = {};
    }
    const key = String(payload.key || "").trim();
    const kind =
      String((item.frontmatter && item.frontmatter.type) || "").toLowerCase() === "project" ? "project" : "task";
    const spec = (EDITABLE_FIELDS[kind] || []).find((field: any) => field.key === key);
    if (!spec) return new obsidian.Notice("不支持直接修改的字段：" + key);
    const rawText = payload.value === undefined || payload.value === null ? "" : String(payload.value).trim();
    /* 注意：status 不在 EDITABLE_FIELDS 里（它对不上"直接改字段"这条路，会在这里被上面的 spec 检查挡掉），
       抽屉里的状态四选一走 setTaskStatus —— 重复任务的周期推进在那里统一处理。 */
    const patch = { updated: today() } as any;
    /* 周几这类多值字段必须落成数组、几号落成数字：界面只送字符串，类型在这里归一 */
    if (rawText !== "") patch[key] = coerceFieldValue(spec, rawText);
    await this.updateFM(item.file, patch, rawText === "" ? [key] : ([] as any[]));
    this.invalidateNoteCache(item.file);
    new obsidian.Notice(spec.label + " 已更新");
    this.scheduleRefreshViews();
  }
  /** 只改正文：frontmatter 原样保留（任务拆解这类编辑必须落在 body 上，不能碰用户手写的 frontmatter） */
  async updateBody(file: any, transform: any) {
    if (!file || !this.app.vault.process) return;
    await this.app.vault.process(file, (content: any) => {
      const span = frontmatterSpan(content);
      const parsed = parseFM(content);
      const nextBody = transform(parsed.body || "");
      if (!span || span.state !== "ok") return nextBody;
      const eol = span.eol || "\n";
      return content.slice(0, span.afterClose) + eol + nextBody;
    });
    this.invalidateNoteCache(file);
    this.scheduleRefreshViews();
  }
  /** 任务拆解：勾选 / 新增 / 删除 / 改文字，都写回正文里的 `- [ ]` 行 */
  async checklistOp(item: any, extra: any) {
    if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
      return new obsidian.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    let payload: any = {};
    try {
      payload = JSON.parse(String(extra || "{}")) || {};
    } catch (error: any) {
      payload = {};
    }
    const op = String(payload.op || "");
    const index = Number(payload.index);
    const text = String(payload.text === undefined || payload.text === null ? "" : payload.text).trim();
    const isItem = (line: any) => /^\s*[-*]\s*\[[ xX]\]/.test(line);
    let changed = false;
    await this.updateBody(item.file, (body: any) => {
      /* 换行风格跟着原文走：把 Windows/CRLF 笔记顺手改成 LF，diff 里会显示成"整篇都改了" */
      const eol = body.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
      const lines = body.split(/\r?\n/);
      const positions: any[] = [];
      lines.forEach((line: any, at: any) => {
        if (isItem(line)) positions.push(at);
      });
      if (op === "toggle" && positions[index] !== undefined) {
        lines[positions[index]] = lines[positions[index]].replace(
          /^(\s*[-*]\s*\[)([ xX])(\])/,
          (all: any, head: any, mark: any, tail: any) => head + (mark === " " ? "x" : " ") + tail,
        );
        changed = true;
      } else if (op === "remove" && positions[index] !== undefined) {
        lines.splice(positions[index], 1);
        changed = true;
      } else if (op === "rename" && positions[index] !== undefined) {
        lines[positions[index]] = lines[positions[index]].replace(/^(\s*[-*]\s*\[[ xX]\]\s*).*$/, "$1" + text);
        changed = true;
      } else if (op === "add") {
        const line = "- [ ] " + text;
        const last = positions.length ? positions[positions.length - 1] : -1;
        if (last >= 0) lines.splice(last + 1, 0, line);
        else {
          /* 没有清单时挂到「任务拆解」标题下；连标题都没有就补一个 */
          const heading = lines.findIndex((item2: any) => /^#{1,6}\s*任务拆解/.test(item2));
          if (heading >= 0) lines.splice(heading + 1, 0, "", line);
          else lines.push("", "## 任务拆解", "", line);
        }
        changed = true;
      }
      return lines.join(eol);
    });
    if (!changed) return new obsidian.Notice("没有可修改的任务拆解项，请刷新后重试。");
    new obsidian.Notice(
      op === "toggle"
        ? "任务拆解已更新"
        : op === "add"
          ? "已添加一步"
          : op === "remove"
            ? "已删除一步"
            : "任务拆解已更新",
    );
  }
  /** Web 渲染层的写操作入口：按路径找到条目，再调用插件原有方法（输入仍走原生弹窗） */
  async webPerform(action: any, target: any, extra: any) {
    const path = String(target || "");
    const key = String(action || "");
    const payload = () => {
      try {
        return JSON.parse(String(extra || "{}")) || {};
      } catch (error: any) {
        return {};
      }
    };

    /* 一、不针对具体笔记的动作：新建 / 初始化 / 批量。
       必须先处理，否则会掉进"按路径找条目"分支，报一个不相干的错误。 */
    const vaultActions = this.webVaultActions(path, extra, payload);
    if (vaultActions[key]) return vaultActions[key]();

    if (key === "triage-draft") {
      const draftFile = this.app.vault.getAbstractFileByPath(path);
      if (!draftFile) return new obsidian.Notice("草稿已经不存在，请刷新草稿箱后重试。");
      return this.openTriage(draftFile);
    }

    /* 只有走到这里才需要整库采集：上面那些动作要么不针对笔记，要么只需要一个文件 */
    const context = await this.webNoteContext(path);
    const noteActions = this.webNoteActions(context, path, extra);
    if (noteActions[key]) return noteActions[key]();
    return context.missing();
  }
  /** 不针对具体笔记的 Web 动作（新建 / 初始化 / 批量 / 重试）——原 webPerform 内的动作表，逻辑未改 */
  webVaultActions(path: any, extra: any, payload: any) {
    const vaultActions: Record<string, any> = {
      "init-structure": () => this.initializeStructure(),
      "new-project": () => this.newProject(),
      /* 新建任务：Web 端会把"在哪个项目的哪个节点下新建"放进 data-path / data-name；
         顶栏按钮没有上下文（传 "__vault__"），按"不关联项目"处理。
         以前这里是无参调用 —— 于是从关键节点新建任务时，项目和节点上下文全丢了。 */
      "new-task": () => this.newTask(path && path !== "__vault__" ? path : undefined, String(extra || "")),
      "new-resource": () => this.newResource(String(extra || "")),
      "import-task-set": () =>
        this.importDraftsAsTaskSet(payload().paths || [], payload().taskSet, payload().taskGroup),
      "bulk-set-task-fields": () => this.bulkSetTaskFields(payload().paths || [], payload().patch || {}),
      "bulk-set-project-status": () => this.bulkSetProjectStatus(payload().paths || [], payload().status),
      "bulk-move-notes": () => this.bulkMoveNotes(payload().paths || [], payload().target),
      "bulk-sink-gaps": () => this.bulkSinkGaps(payload().paths || []),
      "clear-bulk-failures": () => this.clearBulkFailures(),
      /* 重试：原样重发上次失败的那一批（action + 载荷都存着） */
      /* 重试：用**存下来的载荷**原样重发上次失败的那一批（本次动作的 extra 是空的，不能拿来用） */
      "retry-bulk": () => {
        const info = this.lastBulkFailures;
        if (!info || !info.action) return new obsidian.Notice("没有可重试的批量操作。");
        const stored = info.payload || {};
        const retries: Record<string, any> = {
          "bulk-set-task-fields": () => this.bulkSetTaskFields(stored.paths || [], stored.patch || {}),
          "bulk-set-project-status": () => this.bulkSetProjectStatus(stored.paths || [], stored.status),
          "bulk-archive": () => this.bulkArchiveTasks(stored.paths || [], false),
          "bulk-undo-archive": () => this.bulkArchiveTasks(stored.paths || [], true),
          "bulk-move-notes": () => this.bulkMoveNotes(stored.paths || [], stored.target),
          "import-task-set": () => this.importDraftsAsTaskSet(stored.paths || [], stored.taskSet, stored.taskGroup),
          "bulk-sink-gaps": () => this.bulkSinkGaps(stored.paths || []),
        };
        const retry = retries[info.action];
        if (!retry) return new obsidian.Notice("这个操作不支持重试，请手动处理。");
        this.lastBulkFailures = null; /* 先清掉旧失败条；重试若仍失败会重新记上 */
        return retry();
      },
      "bulk-archive": () => this.bulkArchiveTasks(payload().paths || [], false),
      "bulk-undo-archive": () => this.bulkArchiveTasks(payload().paths || [], true),
    };
    return vaultActions;
  }
  /** 按路径解析出这条笔记对应的任务 / 项目，以及几个『文件此刻还在』的辅助闭包 ——原 webPerform 中段，逻辑未改 */
  async webNoteContext(path: any) {
    const data = await this.collectData();
    const pick = (list: any) => (list || []).find((item: any) => item.file && item.file.path === path) || null;
    const task = pick(data.allTasks) || pick(data.all);
    /* 项目库根目录下的 type: task 笔记会同时被识别为「项目」与「任务」：
       解析所属项目时必须排除它自己，否则归档会落进以它自己命名的目录。 */
    const owned = task
      ? (data.projects || [])
          .filter((candidate: any) => candidate.file.path !== path)
          .find((candidate: any) => projectMatches(task, candidate)) || null
      : null;
    const project = (task && owned) || pick(data.projects) || null;
    const missing = () => new obsidian.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    /** 需要"文件此刻还在"的动作：直接用 metadataCache 现场读 frontmatter */
    const withFile = (handler: any) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) return new obsidian.Notice("文件已经不存在，请刷新后重试。");
      return handler(file, this.fm(file) || {});
    };
    const needTask = (handler: any) => (task ? handler(task) : missing());
    const needProject = (handler: any) => (project ? handler(project) : missing());

    return { data, task, project, missing, withFile, needTask, needProject };
  }
  /** 针对某条笔记的动作表 ——原 webPerform 内的动作表，逻辑未改 */
  webNoteActions(context: any, path: any, extra: any) {
    const { data, task, project, missing, withFile, needTask, needProject } = context;
    /* 二、针对某条笔记的动作表：需要任务 / 项目 / 原始文件的分别是哪几项，一目了然 */
    const noteActions: Record<string, any> = {
      "set-field": () => this.setNoteField(task || project, extra),
      /* 任务集 / 任务组下拉里的「＋ 新建…」 */
      "new-task-taxonomy": () => this.promptNewTaxonomy(task || project, extra),
      "checklist-op": () => this.checklistOp(task || project, extra),
      "edit-project": () => needProject((item: any) => this.editProject(item)),
      "project-status": () => needProject((item: any) => this.projectStatus(item.file)),
      "project-milestone": () => needProject((item: any) => this.newMilestone(item)),
      "archive-project": () => needProject((item: any) => this.archiveProject(item)),
      /* 撤销项目归档：归档项目的 folderPath 在归档库，这里按路径现造一个 project 对象 */
      "undo-archive-project": () => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian.TFile)) return new obsidian.Notice("项目文件已经不存在，请刷新后重试。");
        return this.undoArchiveProject({
          file,
          frontmatter: this.fm(file) || {},
          folderPath: path.split("/").slice(0, -1).join("/"),
        });
      },
      "delete-project": () => needProject((item: any) => this.deleteProject(item)),
      "edit-task": () => needTask((item: any) => this.editTask(item, project)),
      "set-task-status": () => needTask((item: any) => this.setTaskStatus(item, String(extra || ""))),
      "archive-task": () => needTask((item: any) => this.archiveTask(item, project)),
      "delete-task": () => needTask((item: any) => this.deleteTask(item)),
      "milestone-rename": () => needProject((item: any) => this.editMilestone(item, String(extra || ""))),
      "milestone-delete": () => needProject((item: any) => this.deleteMilestone(item, String(extra || ""))),
      "gap-sink": () => needTask((item: any) => this.materializeKnowledgeGap(item)),
      "archive-book": () => withFile((file: any, frontmatter: any) => this.archiveBook({ file, frontmatter })),
      "undo-archive": () =>
        withFile((file: any, frontmatter: any) =>
          this.undoArchiveTask({ file, frontmatter }, this.findProject({ file, frontmatter }, data.projects)),
        ),
      /* 撤销「本周期完成」：把执行日与状态放回去（只对最近一次有效，见 undoRecurringCompletion） */
      "undo-recurring-completion": () => this.undoRecurringCompletion(path),
    };
    return noteActions;
  }
  /** 打开（或复用）Web 渲染层视图 */
  async activateApp() {
    let leaf = this.app.workspace.getLeavesOfType(APP_VIEW)[0];
    let created = false;
    if (!leaf) {
      created = true;
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: APP_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    if (!created) await (leaf.view as any).refresh();
  }
  /** Web 渲染层的数据入口：扫描活动目录、读正文、推导成与 web 版同构的数据 */
  /** 同一时刻只跑一次采集：事件驱动的刷新往往会连发数次 */
  async collectWebPayload() {
    if (this.webPayloadPromise) return this.webPayloadPromise;
    this.webPayloadPromise = this.buildWebPayloadNow().finally(() => {
      this.webPayloadPromise = null;
    });
    return this.webPayloadPromise;
  }
  async buildWebPayloadNow() {
    /* 缓存上限在**每轮扫描开始前**裁一次，而不是每次插入都裁。
       原因：扫描顺序与插入顺序一致，逐条淘汰会先扔掉"还没轮到"的条目 ——
       4,400 篇的库上实测命中率 0%（每轮 4,400 次读盘）。放在轮次边界上裁，
       一轮之内不会再动缓存，命中率回到"工作集减去上限"的理论下界。 */
    this.trimNoteCache();
    const folders = [
      this.settings.inboxFolder,
      this.settings.areaFolder,
      this.settings.projectFolder,
      this.settings.knowledgeFolder,
      this.settings.bookFolder,
      this.settings.peopleFolder,
      this.settings.taskFolder,
    ].filter(Boolean);
    const files = (this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles() : ([] as any[])).filter(
      (file: any) => !forbiddenPath(file.path) && folders.some((folder: any) => inFolder(file.path, folder)),
    );
    /* 正文只在「任务 / 项目」两种笔记上被用到（摘要 + 子任务清单），知识/领域/人物/草稿不需要；
       而且同一篇没改过的笔记不必反复读盘 —— 以前每次 refresh 都对全部受管笔记串行 cachedRead +
       parseFM，1120 篇量级实测 651ms，事件一变就要重来一遍。 */
    const notes = await mapWithConcurrency(files, 24, (file: any) => this.readManagedNote(file));
    /* 数据页签的索引：整库（除 .obsidian 与禁阅路径），走 metadataCache 不读正文 */
    const noteIndex = (this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles() : ([] as any[]))
      .filter(
        (file: any) =>
          !forbiddenPath(file.path) && !file.path.split("/").some((segment: any) => segment.startsWith(".")),
      )
      .map((file: any) => ({ path: file.path, name: nameOf(file.path), frontmatter: this.fm(file) || {} }));
    return buildWebPayload(notes, this.settings, {
      noteIndex,
      vaultName: this.app.vault.getName ? this.app.vault.getName() : "",
      assets: await this.webAssets(),
      generatedAt: new Date().toISOString(),
      /* 最近一次批量操作的失败清单：渲染层据此在界面上留一条「可重试」的提示 */
      bulkFailures: this.lastBulkFailures || null,
      /* 最近一次「本周期完成」：渲染层据此在那条任务上显示「撤销」 */
      recurringUndo: this.lastRecurringCompletion
        ? { path: this.lastRecurringCompletion.path, due: this.lastRecurringCompletion.due }
        : null,
      live: true,
    });
  }
  /** 按图片实际亮度判断叠字用深色还是浅色（与离线 manifest 同一套算法，阈值 0.62）。
   *  以前这里对四张图一律写死 tone: "dark"，于是亮图（你这张横幅亮度 0.69）也会被套上重遮罩 + 白字，
   *  设计里「亮图留出通透感」的那一档永远走不到。任何一步失败都回落到 dark —— 重遮罩 + 白字永远可读。 */
  async assetTone(path: any) {
    if (!path) return null;
    if (!this.toneCache) this.toneCache = new Map();
    if (this.toneCache.has(path)) return this.toneCache.get(path);
    let tone = "dark";
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      const buffer = file && this.app.vault.readBinary ? await this.app.vault.readBinary(file as any) : null;
      if (
        buffer &&
        typeof createImageBitmap === "function" &&
        typeof document !== "undefined" &&
        document.createElement
      ) {
        const bitmap = await createImageBitmap(new Blob([buffer]));
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const context = canvas.getContext("2d");
        context!.drawImage(bitmap, 0, 0, 48, 48);
        const data = context!.getImageData(0, 0, 48, 48).data;
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) {
          sum += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        }
        tone = toneFromLuminance(sum / (data.length / 4));
      }
    } catch (error: any) {
      tone = "dark";
    }
    this.toneCache.set(path, tone);
    return tone;
  }
  /** Web 渲染层的素材：复用插件自己的横幅与导航卡图片，缺失时页面自动回退到纯 CSS 渐变 */
  async webAssets() {
    const assets: Record<string, any> = {};
    const picked = resolveAssetImages(this.app.vault, this.settings);
    const put = async (key: any, path: any) => {
      if (!path) return;
      const file = this.assetResourcePath(path);
      if (!file) return;
      const tone = await this.assetTone(path);
      assets[key] = { file: file, tone: tone, suggestedInk: TONE_INK[tone] };
    };
    await put("hero", picked.hero);
    /* 横幅取景必须一起下发：Web 面板用的是同一个 hero 素材（explicitHero = settings.heroImage），
       不带取景的话它只能按"默认居中"渲染 —— 用户看到的就是"图片最中间那一块"。 */
    if (assets.hero) assets.hero.crop = this.settings.heroCrop || null;
    await put("cardBuild", picked.build);
    await put("cardLearn", picked.learn);
    await put("cardGrow", picked.grow);
    return assets;
  }
  /** 惰性构造 Web 渲染层：文件末尾的生成区块提供 ppWebAppFactory */
  webAppApi() {
    if (this.webApiCache !== undefined) return this.webApiCache;
    try {
      const sandbox = { exports: {} };
      const facade = {
        document,
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
      } as any;
      const api = ppWebAppFactory(
        facade,
        document,
        typeof navigator === "undefined" ? null : navigator,
        (window && window.localStorage) || null,
        sandbox,
        sandbox.exports,
      );
      this.webApiCache = api || sandbox.exports || null;
    } catch (error: any) {
      console.error("[personal-planning-dashboard] Web 渲染层加载失败", error);
      this.webAppError = (error && error.message) || String(error);
      this.webApiCache = null;
    }
    return this.webApiCache;
  }
  /** 渲染层里的「在 Obsidian 打开」：按路径直接跳转笔记 */
  async openPath(target: any) {
    const file = this.app.vault.getAbstractFileByPath(String(target || ""));
    if (file && file instanceof obsidian.TFile) return this.openFile(file);
    new obsidian.Notice("笔记不存在：" + target);
  }
  /** 渲染层里的「复制路径」 */
  async copyToClipboard(value: any) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(String(value));
        new obsidian.Notice("已复制：" + value);
        return;
      }
    } catch (error: any) {
      /* 剪贴板不可用时退化为提示 */
    }
    new obsidian.Notice(String(value));
  }
  async activateDashboard() {
    let leaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW)[0];
    let created = false;
    if (!leaf) {
      created = true;
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: DASHBOARD_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    if (!created) await (leaf.view as any).refresh();
  }
  async activateInbox() {
    let leaf = this.app.workspace.getLeavesOfType(INBOX_VIEW)[0];
    let created = false;
    if (!leaf) {
      created = true;
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: INBOX_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    if (!created) await (leaf.view as any).refresh();
  }
  async activateTasks() {
    let leaf = this.app.workspace.getLeavesOfType(TASKS_VIEW)[0];
    let created = false;
    if (!leaf) {
      created = true;
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: TASKS_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    if (!created) await (leaf.view as any).refresh();
  }
  async activateResources(category: any) {
    let leaf = this.app.workspace.getLeavesOfType(RESOURCES_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: RESOURCES_VIEW, state: { category }, active: true });
    } else await leaf.setViewState({ type: RESOURCES_VIEW, state: { category }, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async openProject(file: any) {
    if (!file || !file.path) return new obsidian.Notice("项目文件不存在，请刷新后重试。");
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: PROJECT_VIEW, state: { path: file.path }, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async openFile(file: any) {
    if (!file || !file.path) return new obsidian.Notice("文件不存在，请刷新后重试。");
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    this.app.workspace.revealLeaf(leaf);
  }
  /** 把设置里的素材路径解析为 Obsidian 资源 URL；支持省略扩展名、反斜杠与大小写差异 */
  assetResourcePath(path: any) {
    const isFile = (file: any) =>
      file && typeof file.path === "string" && (!obsidian.TFile || file instanceof obsidian.TFile || file.extension);
    const exact = path ? this.app.vault.getAbstractFileByPath(path) : null;
    if (isFile(exact) && this.app.vault.getResourcePath) return this.app.vault.getResourcePath(exact as any);
    const resolved = resolveAssetPath(path, this.vaultAssetPaths());
    const file = resolved ? this.app.vault.getAbstractFileByPath(resolved) : null;
    if (isFile(file) && this.app.vault.getResourcePath) return this.app.vault.getResourcePath(file as any);
    if (resolved && this.app.vault.adapter && this.app.vault.adapter.getResourcePath)
      return this.app.vault.adapter.getResourcePath(resolved);
    return "";
  }
  fm(file: any) {
    return Object.assign({}, this.app.metadataCache.getFileCache(file)?.frontmatter || {});
  }
  /** metadataCache 是否已经给出这篇笔记的缓存：null = 还没索引到。
   *  未索引时 fm() 会返回空对象，若据此推导状态并回写，会把用户手写的 status 覆盖成 planning/todo。 */
  isFrontmatterIndexed(file: any) {
    const cache = this.app.metadataCache;
    if (!cache || typeof cache.getFileCache !== "function") return true;
    return cache.getFileCache(file) != null;
  }
  /** 声明了 DDL 却解析不出日期时，状态推导不可信（会被当成「没有 DDL」降级成 planning）——这种情况一律不参与状态回写 */
  isDueDerivable(frontmatter: any) {
    const declared = frontmatter ? frontmatter.due || frontmatter.deadline : undefined;
    if (declared === undefined || declared === null || declared === "") return true;
    return Boolean(dateOf(declared));
  }
  isManagedPath(path: any) {
    return (
      !forbiddenPath(path) &&
      [
        this.settings.projectFolder,
        this.settings.taskFolder,
        this.settings.inboxFolder,
        this.settings.knowledgeFolder,
        this.settings.bookFolder,
        this.settings.areaFolder,
        this.settings.peopleFolder,
      ].some((folder: any) => inFolder(path, folder))
    );
  }
  isProjectFile(file: any, fm: any) {
    return String(fm.type || "").toLowerCase() === "project" || directChild(file, this.settings.projectFolder);
  }
  /** 显式声明为这些类型的笔记不是任务，即使放在日程待办目录里（例如 50 日程待办/日程待办.md 首页） */
  isExplicitNonTaskType(fm: any) {
    return NON_TASK_TYPES.includes(String(fm.type || "").toLowerCase());
  }
  isStatusSyncFailed(path: any) {
    return Boolean(this.statusSyncFailures && this.statusSyncFailures.has(path));
  }
  markStatusSyncFailed(path: any, label: any, error: any) {
    if (!this.statusSyncFailures) this.statusSyncFailures = new Set();
    this.statusSyncFailures.add(path);
    console.error("[personal-planning-dashboard] " + label + " status sync failed", error);
  }
  isTaskFile(file: any, fm: any) {
    return isTaskNote(file.path, fm, this.settings);
  }
  async collectData() {
    const files = this.app.vault.getMarkdownFiles().filter((file: any) => this.isManagedPath(file.path));
    const all = files.map((file: any) => ({ file, frontmatter: this.fm(file) }));
    /* 项目归属一次算完：以前是「每个项目 × 全部笔记」逐项跑 projectMatches（千篇规模 248ms）。
       索引与 Web 渲染层共用同一套（见 buildProjectIndex），语义与 projectMatches 的三条判据一致。 */
    const projectItems = all.filter((item: any) => this.isProjectFile(item.file, item.frontmatter));
    const projectIndex = buildProjectIndex(
      projectItems.map((item: any) => ({
        path: item.file.path,
        title: item.frontmatter.title,
        folderPath: (item as any).folderPath || "",
      })),
    );
    const taskItems = all.filter((item: any) => this.isTaskFile(item.file, item.frontmatter));
    const ownedByProject = new Map(projectItems.map((item: any) => [item.file.path, []]));
    taskItems.forEach((item: any) => {
      projectIndex.candidatesFor(item.frontmatter).forEach((path: any) => {
        const bucket = ownedByProject.get(String(path));
        if (bucket) (bucket as any[]).push(item);
      });
    });
    const projects = projectItems.map((item: any) =>
      Object.assign(item, this.projectStats(item, all, ownedByProject.get(item.file.path) || [])),
    );
    projects.forEach((project: any) => {
      (project as any).projectStatus = projectStatus(project);
    });
    this.syncProjectStatuses(projects);
    const allTasks = all.filter((item: any) => this.isTaskFile(item.file, item.frontmatter));
    allTasks.forEach((item: any) => {
      (item as any).taskStatus = taskStatus(item);
    });
    this.syncTaskStatuses(allTasks);
    const tasks = allTasks.filter((item: any) => (item as any).taskStatus !== "archived");
    const active = tasks.filter((item: any) => !["done", "completed", "archived"].includes((item as any).taskStatus));
    const inbox = all.filter(
      (item: any) =>
        inFolder(item.file, this.settings.inboxFolder) ||
        String(item.frontmatter.stage || "").toLowerCase() === "inbox",
    );
    const overdue = active.filter((item: any) => {
      const offset = daysUntil(item.frontmatter.due || item.frontmatter.deadline);
      return offset !== null && offset < 0;
    });
    const upcoming = active
      .filter((item: any) => {
        const offset = daysUntil(item.frontmatter.due || item.frontmatter.deadline);
        return offset !== null && offset >= 0 && offset <= this.settings.planningHorizonDays;
      })
      .sort((a: any, b: any) => String(a.frontmatter.due || "").localeCompare(String(b.frontmatter.due || "")));
    const gaps = tasks.filter(
      (item: any) =>
        String(item.frontmatter.type || "").toLowerCase() === "knowledge-gap" ||
        item.frontmatter.knowledge_gap === true ||
        refs(item.frontmatter.tags).includes("knowledge-gap"),
    );
    const timePlan = buildTimePlan(
      active,
      today(),
      this.settings.planningHorizonDays,
      this.settings.dailyCapacityMinutes,
      this.settings.defaultTaskDuration,
    );
    const resources = buildResourceMap(all, this.settings);
    return { all, projects, allTasks, tasks, inbox, overdue, upcoming, gaps, timePlan, resources };
  }
  /** 读路径的状态修正：只修正插件推导得出的状态；用户自定义状态与已有 updated 一律不动；失败只记一次日志，不再每轮重试 */
  syncProjectStatuses(projects: any) {
    projects.forEach((project: any) => {
      /* 索引未就绪时 frontmatter 是空的，推导出的状态没有意义，绝不能回写 */
      if (!this.isFrontmatterIndexed(project.file)) return;
      /* 与任务同理：按"此刻的"frontmatter 重新判定，别用旧快照冲掉用户刚改的状态 */
      const live = this.fm(project.file) || {};
      if (!this.isDueDerivable(live)) return;
      const raw = String(live.status || "").toLowerCase();
      const derived = projectStatus(live);
      if (raw === derived) return;
      if (raw && !KNOWN_STATUS_VALUES.includes(raw)) return;
      if (this.isStatusSyncFailed(project.file.path)) return;
      const patch = { status: derived } as any;
      if (!live.updated) (patch as any).updated = today();
      void this.updateFM(
        project.file,
        patch,
        [],
        (live2: any) => String(live2.status || "").toLowerCase() === raw,
      ).catch((error: any) => this.markStatusSyncFailed(project.file.path, "project", error));
    });
  }
  syncTaskStatuses(tasks: any) {
    tasks.forEach((task: any) => {
      /* 索引未就绪时 frontmatter 是空的，推导出的状态没有意义，绝不能回写 */
      if (!this.isFrontmatterIndexed(task.file)) return;
      /* 用"此刻的"frontmatter 重新判定：传进来的快照可能是几百毫秒前采集的，
         期间用户可能已经点了「标记完成」。拿旧快照算出的 expired 回写，会把用户刚做的操作冲掉。 */
      const live = this.fm(task.file) || {};
      if (!this.isDueDerivable(live)) return;
      const raw = String(live.status || "").toLowerCase();
      const derived = taskStatus(live);
      if (raw === derived) return;
      if (raw && !KNOWN_STATUS_VALUES.includes(raw)) return;
      /* 只回写"纯粹由时间推导出来"的过期状态。
         规划中 / 待办 / 完成 / 阻塞是用户在界面上选的，推导不得把它们互相改写 ——
         否则「无 DDL 的待办」会被静默改成「规划中」。 */
      if (derived !== "expired") return;
      if (this.isStatusSyncFailed(task.file.path)) return;
      const patch = { status: derived } as any;
      if (!live.updated) (patch as any).updated = today();
      /* guard 在"写入那一刻"再确认一次：期间用户点了「标记完成」，这次回写就作废 */
      void this.updateFM(task.file, patch, [], (live2: any) => String(live2.status || "").toLowerCase() === raw).catch(
        (error: any) => this.markStatusSyncFailed(task.file.path, "task", error),
      );
    });
  }
  projectStats(project: any, all: any, owned: any) {
    const tasks =
      owned || all.filter((item: any) => this.isTaskFile(item.file, item.frontmatter) && projectMatches(item, project));
    const done = tasks.filter((item: any) => ["done", "completed", "archived"].includes(taskStatus(item))).length;
    const supplied = project.frontmatter.progress;
    const progress =
      supplied !== undefined && supplied !== ""
        ? Math.max(0, Math.min(100, Number(supplied) || 0))
        : tasks.length
          ? Math.round((done / tasks.length) * 100)
          : 0;
    return { total: tasks.length, done, progress, folderPath: this.projectFolderPath(project) };
  }
  projectFolderPath(project: any) {
    const parent = folderPathOf(project.file);
    return parent && parent !== this.settings.projectFolder && inFolder(parent, this.settings.projectFolder)
      ? parent
      : "";
  }
  async ensureProjectFolder(project: any) {
    if (project.folderPath) return project.folderPath;
    const parent = folderPathOf(project.file);
    if (parent !== this.settings.projectFolder) return "";
    const folder = await this.uniqueFolderPath(
      this.settings.projectFolder,
      project.frontmatter.title || nameOf(project.file.path),
    );
    const destination = await this.uniqueFilePath(folder, nameOf(project.file.path));
    await this.app.vault.rename(project.file, destination);
    new obsidian.Notice("已将旧版项目文档迁移到项目文件夹。");
    return folder;
  }
  getMilestones(project: any, tasks: any) {
    const values = normalizeList(project.frontmatter.milestones || project.frontmatter.key_nodes);
    tasks.forEach((task: any) => {
      const value = String(task.frontmatter.milestone || "").trim();
      if (value && !values.includes(value)) values.push(value);
    });
    return values.length ? Array.from(new Set(values)) : ["未分组"];
  }
  async ensureFolder(path: any) {
    const parts = obsidian
      .normalizePath(path)
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? current + "/" + part : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async uniqueFolderPath(folder: any, title: any) {
    await this.ensureFolder(folder);
    const clean = cleanName(title);
    let path = obsidian.normalizePath(folder + "/" + clean);
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = obsidian.normalizePath(folder + "/" + clean + " " + n);
      n++;
    }
    return path;
  }
  async uniqueFilePath(folder: any, title: any, ignorePath?: any) {
    await this.ensureFolder(folder);
    const clean = cleanName(title);
    let path = obsidian.normalizePath(folder + "/" + clean + ".md");
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path) && path !== ignorePath) {
      path = obsidian.normalizePath(folder + "/" + clean + " " + n + ".md");
      n++;
    }
    return path;
  }
  /** 素材文件的唯一路径：保留原扩展名，重名时加序号；同时检查磁盘（OneDrive 占位文件 vault 索引可能拿不到） */
  async pathExists(path: any) {
    if (this.app.vault.getAbstractFileByPath(path)) return true;
    const adapter = this.app.vault.adapter;
    return Boolean(adapter && typeof adapter.exists === "function" && (await adapter.exists(path)));
  }
  async uniqueBinaryPath(folder: any, fileName: any) {
    await this.ensureFolder(folder);
    const raw =
      String(fileName || "banner.png")
        .replace(/\\/g, "/")
        .split("/")
        .pop() || "banner.png";
    const dot = raw.lastIndexOf(".");
    const base = cleanName(dot > 0 ? raw.slice(0, dot) : raw);
    const extension = dot > 0 ? raw.slice(dot).toLowerCase() : ".png";
    let path = obsidian.normalizePath(folder + "/" + base + extension);
    let n = 2;
    while (await this.pathExists(path)) {
      path = obsidian.normalizePath(folder + "/" + base + " " + n + extension);
      n += 1;
    }
    return path;
  }
  async initializeStructure() {
    for (const folder of [
      this.settings.inboxFolder,
      this.settings.areaFolder,
      this.settings.knowledgeFolder,
      this.settings.bookFolder,
      this.settings.peopleFolder,
      this.settings.projectFolder,
      this.settings.taskFolder,
      this.settings.archiveFolder,
    ])
      await this.ensureFolder(folder);
    new obsidian.Notice("已初始化个人规划目录结构。");
    this.refreshViews();
  }
  async createProject(values: any) {
    if (!values.title.trim()) throw expectedError("项目名称不能为空");
    const folderPath = await this.uniqueFolderPath(this.settings.projectFolder, values.title);
    await this.ensureFolder(folderPath);
    const fileName = nameOf(folderPath);
    const projectPath = obsidian.normalizePath(folderPath + "/" + fileName + ".md");
    const file = await this.app.vault.create(
      projectPath,
      makeMD(
        {
          type: "project",
          title: values.title.trim(),
          status: "planning",
          outcome: values.outcome.trim(),
          acceptance: values.acceptance.trim(),
          deadline: values.deadline.trim(),
          resource_constraints: values.constraints.trim(),
          area: values.area.trim(),
          weight: Math.min(5, Math.max(1, Number(values.weight) || 3)),
          milestones: ["未分组"],
          created: today(),
        },
        "## 项目推演\n\n### 关键节点\n\n- 未分组\n\n### 阻塞项\n\n- \n",
      ),
    );
    new obsidian.Notice("已创建项目文件夹和项目文档：" + folderPath);
    this.refreshViews();
  }
  /** 在资源目录里新建一条笔记：知识 / 图书 / 领域 / 人物。
   *  只写最少 frontmatter + 一个写作骨架，正文留给用户 —— 资源页以前只能"看"，建条目得回 Obsidian 手动建。 */
  newResource(kind: any, presetTitle?: any) {
    const specs: Record<string, any> = {
      knowledge: {
        folder: this.settings.knowledgeFolder,
        label: "新建知识笔记",
        titleLabel: "知识点名称",
        placeholder: "例如：如何做周复盘",
        extra: () => ({ type: "knowledge" }),
        body: "## 结论\n\n## 适用场景\n\n## 来源\n",
      },
      book: {
        folder: this.settings.bookFolder,
        label: "新建图书",
        titleLabel: "书名",
        placeholder: "例如：深度工作",
        extra: () => ({ type: "book", status: "reading", started: today() }),
        body: "## 为什么读\n\n## 摘录\n\n## 行动\n",
      },
      area: {
        folder: this.settings.areaFolder,
        label: "新建长期领域",
        titleLabel: "领域名称",
        placeholder: "例如：健康 / 财富 / 关系",
        extra: () => ({ type: "area" }),
        body: "## 这个领域对我意味着什么\n\n## 判断标准\n",
      },
      person: {
        folder: this.settings.peopleFolder,
        label: "新建人物",
        titleLabel: "姓名 / 称呼",
        placeholder: "例如：张三",
        extra: () => ({ type: "person" }),
        body: "## 我为什么关注 TA\n\n## 协作记录\n",
      },
    };
    const spec = specs[String(kind || "")];
    if (!spec) return new obsidian.Notice("不支持新建的资源类型：" + String(kind || ""));
    if (!spec.folder) return new obsidian.Notice("还没有配置对应目录，请先在设置里检查目录结构。");
    new FormModal(
      this.app,
      spec.label,
      [{ id: "title", name: spec.titleLabel, value: String(presetTitle || ""), placeholder: spec.placeholder }],
      async (values: any) => {
        const title = String(values.title || "").trim();
        if (!title) throw expectedError(spec.titleLabel + "不能为空");
        const path = await this.uniqueFilePath(spec.folder, title);
        const patch = Object.assign({ title, created: today() }, spec.extra());
        await this.app.vault.create(path, makeMD(patch, spec.body));
        this.invalidateNoteCache();
        new obsidian.Notice("已创建：" + path);
        this.refreshViews();
        await this.openFile(this.app.vault.getAbstractFileByPath(path));
      },
    ).open();
  }
  newProject() {
    /* 先采集一次数据：把"长期领域"做成可下拉的 datalist（既有领域可选，也能写新领域） */
    this.collectData()
      .then((data: any) => {
        const areaValues = ((data.resources && data.resources.areas) || [])
          .map((item: any) => String(item.title || item.path || ""))
          .filter(Boolean)
          .sort();
        new FormModal(
          this.app,
          "新建项目",
          [
            { id: "title", name: "项目名称", placeholder: "例如：个人网站上线" },
            { id: "outcome", name: "最终结果（终点画像）", type: "textarea" },
            { id: "acceptance", name: "验收标准（量化指标）", type: "textarea" },
            { id: "deadline", name: "DDL", type: "date" },
            { id: "constraints", name: "资金 / 资源约束", type: "textarea" },
            { id: "area", name: "所属长期领域", type: "datalist", options: areaValues, placeholder: "例如：健康" },
            { id: "weight", name: "项目权重（1-5）", value: 3 },
          ],
          (values: any) => this.createProject(values),
        ).open();
      })
      .catch((error: any) => new obsidian.Notice("读取数据失败：" + (error.message || error)));
  }
  editMilestone(project: any, milestone: any) {
    new FormModal(
      this.app,
      "编辑关键节点",
      [{ id: "name", name: "关键节点名称", value: milestone, placeholder: "例如：完成 MVP" }],
      async (values: any) => {
        const name = values.name.trim();
        if (!name) throw expectedError("关键节点名称不能为空");
        if (milestone === "未分组") throw expectedError("“未分组”是保底节点，不能改名");
        if (name === milestone) return;
        const data = await this.collectData();
        const projectTasks = data.allTasks.filter((task: any) => projectMatches(task, project));
        const current = this.getMilestones(project, projectTasks);
        if (current.includes(name)) throw expectedError("已经存在同名关键节点");
        const next = current.map((item: any) => (item === milestone ? name : item));
        for (const task of projectTasks.filter((task: any) => (task.frontmatter.milestone || "未分组") === milestone))
          await this.updateFM(task.file, { milestone: name, updated: today() });
        await this.updateFM(project.file, { milestones: next, updated: today() });
        new obsidian.Notice("关键节点已改名：" + name);
        this.refreshViews();
      },
    ).open();
  }
  editProject(project: any) {
    /* 同样把"长期领域"做成可下拉的 datalist */
    this.collectData()
      .then((data: any) => {
        const areaValues = ((data.resources && data.resources.areas) || [])
          .map((item: any) => String(item.title || item.path || ""))
          .filter(Boolean)
          .sort();
        new FormModal(
          this.app,
          "编辑项目",
          [
            { id: "title", name: "项目名称", value: project.frontmatter.title || nameOf(project.file.path) },
            {
              id: "outcome",
              name: "最终结果（终点画像）",
              type: "textarea",
              value: project.frontmatter.outcome || project.frontmatter.final_outcome || "",
            },
            {
              id: "acceptance",
              name: "验收标准（量化指标）",
              type: "textarea",
              value: project.frontmatter.acceptance || project.frontmatter.acceptance_criteria || "",
            },
            {
              id: "deadline",
              name: "DDL",
              type: "date",
              value: dateOf(project.frontmatter.deadline || project.frontmatter.ddl) || "",
            },
            {
              id: "constraints",
              name: "资金 / 资源约束",
              type: "textarea",
              value: project.frontmatter.resource_constraints || project.frontmatter.constraints || "",
            },
            {
              id: "area",
              name: "所属长期领域",
              type: "datalist",
              options: areaValues,
              value: project.frontmatter.area || "",
            },
            { id: "weight", name: "项目权重（1-5）", value: project.frontmatter.weight || 3 },
          ],
          async (values: any) => {
            const title = values.title.trim();
            if (!title) throw expectedError("项目名称不能为空");
            const data = await this.collectData();
            const projectTasks = data.allTasks.filter((task: any) => projectMatches(task, project));
            const oldTitle = project.frontmatter.title || nameOf(project.file.path);
            const oldFolder = project.folderPath;
            await this.updateFM(project.file, {
              title,
              outcome: values.outcome.trim(),
              acceptance: values.acceptance.trim(),
              deadline: values.deadline.trim(),
              resource_constraints: values.constraints.trim(),
              area: values.area.trim(),
              weight: Math.min(5, Math.max(1, Number(values.weight) || 3)),
              updated: today(),
            });
            let newProjectPath = project.file.path;
            if (oldFolder && title !== oldTitle) {
              let newFolder = obsidian.normalizePath(this.settings.projectFolder + "/" + cleanName(title));
              if (newFolder !== oldFolder && this.app.vault.getAbstractFileByPath(newFolder))
                newFolder = await this.uniqueFolderPath(this.settings.projectFolder, title);
              const folderRef = this.app.vault.getAbstractFileByPath(oldFolder);
              if (!(folderRef instanceof obsidian.TFolder)) throw new Error("项目文件夹不存在，无法重命名");
              await this.app.vault.rename(folderRef, newFolder);
              const target = obsidian.normalizePath(newFolder + "/" + cleanName(title) + ".md");
              const newFilePath =
                this.app.vault.getAbstractFileByPath(target) && target !== project.file.path
                  ? await this.uniqueFilePath(newFolder, cleanName(title), project.file.path)
                  : target;
              if (project.file.path !== newFilePath) await this.app.vault.rename(project.file, newFilePath);
              newProjectPath = newFilePath;
            }
            for (const task of projectTasks)
              await this.updateFM(task.file, { project: newProjectPath, updated: today() });
            new obsidian.Notice("项目已更新。");
            this.refreshViews();
          },
        ).open();
      })
      .catch((error: any) => new obsidian.Notice("读取数据失败：" + (error.message || error)));
  }
  deleteProject(project: any) {
    new ConfirmModal(
      this.app,
      "删除项目",
      /* 文案要跟行为一致：删除方式跟随用户的 Obsidian 设置（回收站 / 永久删除），
         所以不能写"不能撤销"——那会让用户以为一定是永久删除。 */
      "这会删除整个项目文件夹及其中的任务和附件。" + DELETE_HINT,
      "删除整个项目",
      async () => {
        const target = project.folderPath ? this.app.vault.getAbstractFileByPath(project.folderPath) : project.file;
        if (!target) throw new Error("项目文件不存在");
        /* 必须走 fileManager.trashFile，不能走 vault.delete：
           Obsidian 1.13 起 FileSystemAdapter.rmdir 把 recursive 直接透给 fs.rm，
           vault.delete(文件夹)（force 默认 false）等于对目录做非递归 rm —— 必然以
           ERR_FS_EISDIR（"Path is a directory: rm returned EISDIR…"）失败，项目文件夹一个文件都删不掉。
           trashFile 才是"跟随用户删除设置"的公开入口（系统回收站 / 库内 .trash / 永久删除），
           并且对文件夹可用。 */
        await this.app.fileManager.trashFile(target);
        new obsidian.Notice("项目及其文件夹已删除。");
        this.refreshViews();
      },
    ).open();
  }
  newMilestone(project: any) {
    new FormModal(
      this.app,
      "新建关键节点",
      [{ id: "name", name: "关键节点名称", placeholder: "例如：完成 MVP" }],
      async (values: any) => {
        const name = values.name.trim();
        if (!name) throw expectedError("关键节点名称不能为空");
        const current = this.getMilestones(project, []);
        if (!current.includes(name)) {
          current.push(name);
          await this.updateFM(project.file, { milestones: current, updated: today() });
        }
        new obsidian.Notice("已添加关键节点：" + name);
        this.refreshViews();
      },
    ).open();
  }
  deleteMilestone(project: any, milestone: any) {
    if (milestone === "未分组") return new obsidian.Notice("“未分组”是保底节点，不能删除。");
    new ConfirmModal(
      this.app,
      "删除关键节点",
      "删除后，该节点下的任务会自动移动到“未分组”；任务文件不会被删除。",
      "删除并移动任务",
      async () => {
        const data = await this.collectData();
        const projectTasks = data.allTasks.filter((task: any) => projectMatches(task, project));
        const affected = projectTasks.filter((task: any) => (task.frontmatter.milestone || "未分组") === milestone);
        for (const task of affected) await this.updateFM(task.file, { milestone: "未分组", updated: today() });
        const current = this.getMilestones(project, projectTasks);
        const remaining = current.filter((item: any) => item !== milestone);
        if (!remaining.includes("未分组")) remaining.unshift("未分组");
        await this.updateFM(project.file, { milestones: remaining, updated: today() });
        new obsidian.Notice("关键节点已删除，相关任务已移动到“未分组”。");
        this.refreshViews();
      },
    ).open();
  }

  openTaskEditor(project: any, task: any, presetMilestone?: any) {
    this.collectData()
      .then((data: any) => {
        const context = this.taskEditorContext(project, task, presetMilestone, data);
        new FormModal(this.app, task ? "编辑任务" : "新建任务", this.taskEditorFields(context, task), (values: any) =>
          this.taskEditorSubmit(context, task, values),
        ).open();
      })
      .catch((error: any) => new obsidian.Notice("读取项目失败：" + (error.message || error)));
  }
  /** 表单上下文：项目 / 节点候选，以及『换项目就重建节点下拉』的联动（原 openTaskEditor 前半段，逻辑未改） */
  taskEditorContext(project: any, task: any, presetMilestone: any, data: any) {
    const projectFromPath =
      typeof project === "string" && project
        ? data.projects.find((item: any) => item.file.path === project) || null
        : null;
    const projectRef = projectFromPath || (project && typeof project === "object" ? project : null);
    const existingProject = task ? this.findProject(task, data.projects) : projectRef;
    const projectOptions = { "": "不关联项目" } as any;
    data.projects.forEach(
      (item: any) => (projectOptions[item.file.path] = item.frontmatter.title || nameOf(item.file.path)),
    );
    const selectedProject = existingProject || projectRef;
    const selectedTasks = selectedProject
      ? data.allTasks.filter((item: any) => projectMatches(item, selectedProject))
      : ([] as any[]);
    const preset = String(presetMilestone || "").trim();
    const milestoneSource = selectedProject ? this.getMilestones(selectedProject, selectedTasks) : ["未分组"];
    if (preset && !milestoneSource.includes(preset)) milestoneSource.push(preset);
    const milestoneOptions = Object.fromEntries(milestoneSource.map((item: any) => [item, item]));
    /* 任务集 / 任务组是"半开放"字段：既有取值下拉可选，也允许写新值 → datalist */
    const knownTaskSetValues = Array.from(
      new Set(
        data.allTasks
          .map((item: any) => String(item.frontmatter.task_set || item.frontmatter.taskSet || "").trim())
          .filter(Boolean),
      ),
    ).sort();
    const knownTaskGroupValues = Array.from(
      new Set(
        data.allTasks
          .map((item: any) => String(item.frontmatter.task_group || item.frontmatter.taskGroup || "").trim())
          .filter(Boolean),
      ),
    ).sort();
    /** 换项目就重建"所属关键节点"下拉：否则用户在新项目里根本找不到它的节点。
          注意 Obsidian 的 addOptions 是**合并**语义，必须先清空 selectEl，否则会留下上一个项目的节点。 */
    const syncMilestoneControl = (value: any, form: any, preferred: any) => {
      const nextProject = value ? data.projects.find((item: any) => item.file.path === value) || null : null;
      const names = nextProject
        ? this.getMilestones(
            nextProject,
            data.allTasks.filter((item: any) => projectMatches(item, nextProject)),
          )
        : ["未分组"];
      const control = form && form.controls ? form.controls.milestone : null;
      if (!control) return;
      const previous = preferred || control.getValue();
      if (control.selectEl && typeof control.selectEl.empty === "function") control.selectEl.empty();
      control.addOptions(Object.fromEntries(names.map((name: any) => [name, name])));
      control.setValue(names.includes(previous) ? previous : names[0] || "未分组");
    };
    const currentStatus = task ? taskStatus(task) : "planning";
    const statusOptions = {
      planning: "规划中",
      todo: "待办",
      doing: "执行中",
      blocked: "阻塞",
      paused: "暂停",
      completed: "已完成",
    } as any;
    if (currentStatus === "archived") statusOptions.archived = "已归档";
    if (currentStatus === "expired") statusOptions.expired = "过期";
    return {
      data,
      preset,
      projectOptions,
      selectedProject,
      milestoneOptions,
      milestoneSource,
      knownTaskSetValues,
      knownTaskGroupValues,
      statusOptions,
      currentStatus,
      syncMilestoneControl,
    };
  }
  /** 表单字段表（原来内联在 openTaskEditor 里，逻辑未改） */
  taskEditorFields(context: any, task: any) {
    const {
      data,
      preset,
      projectOptions,
      selectedProject,
      milestoneOptions,
      milestoneSource,
      knownTaskSetValues,
      knownTaskGroupValues,
      statusOptions,
      currentStatus,
      syncMilestoneControl,
    } = context;
    return [
      {
        id: "title",
        name: "任务内容",
        placeholder: "一个可执行的下一步",
        value: task ? task.frontmatter.title || nameOf(task.file.path) : "",
      },
      {
        id: "project",
        name: "所属项目",
        type: "select",
        options: projectOptions,
        value: selectedProject ? selectedProject.file.path : "",
        /* 用户在表单里改项目 → 立刻重建节点下拉（原节点若在新项目里也有同名节点则保留） */
        onChange: (value: any, form: any) => syncMilestoneControl(value, form, preset),
      },
      {
        id: "milestone",
        name: "所属关键节点",
        type: "select",
        options: milestoneOptions,
        value: preset || task?.frontmatter.milestone || milestoneSource[0] || "未分组",
      },
      {
        id: "taskSet",
        name: "任务集",
        type: "datalist",
        options: knownTaskSetValues,
        placeholder: "例如：本周维护",
        value: task?.frontmatter.task_set || task?.frontmatter.taskSet || "",
      },
      {
        id: "taskGroup",
        name: "任务组",
        type: "datalist",
        options: knownTaskGroupValues,
        placeholder: "例如：资料整理",
        value: task?.frontmatter.task_group || task?.frontmatter.taskGroup || "",
      },
      {
        id: "recurrence",
        name: "重复周期",
        type: "select",
        options: { none: "不重复", daily: "每天", weekly: "每周", monthly: "每月" },
        value: task?.frontmatter.recurrence || "none",
      },
      /* 参考谷歌日历：选了「每周」再指定周几（可多选），选了「每月」再指定几号。
         默认值取**本次执行日**那一天（没有就取今天），于是老笔记（只写 recurrence: weekly、
         靠"due + 7 天"滚动）被重新保存时语义一分不变 —— 只是把隐含规则显式写出来。 */
      {
        id: "recurrenceWeekdays",
        name: "重复周几",
        desc: "可多选；不选 = 每 7 天一次（沿用旧行为）",
        type: "multiselect",
        options: WEEKDAY_OPTIONS,
        value: recurrenceWeekdaysOf(task?.frontmatter).length
          ? recurrenceWeekdaysOf(task?.frontmatter)
          : [isoWeekday(recurrenceAnchorOf(task?.frontmatter))],
        showWhen: { key: "recurrence", in: ["weekly"] },
      },
      {
        id: "recurrenceMonthday",
        name: "每月几号",
        desc: "29/30/31 号遇到没有这一天的月份，顺延到当月最后一天",
        type: "select",
        options: MONTHDAY_SELECT,
        value: String(
          recurrenceMonthDayOf(task?.frontmatter) || Number(recurrenceAnchorOf(task?.frontmatter).slice(8, 10)) || 1,
        ),
        showWhen: { key: "recurrence", in: ["monthly"] },
      },
      {
        id: "assignee",
        name: "执行者 / 角色",
        type: "select",
        options: buildAssigneeOptions(data.resources?.people || [], task?.frontmatter.assignee || ""),
        value: task?.frontmatter.assignee || "",
      },
      {
        id: "knowledgeRefs",
        name: "知识引用",
        placeholder: "笔记路径，多项用逗号分隔",
        value: normalizeList(task?.frontmatter.knowledge_refs).join(", "),
      },
      {
        id: "due",
        name: "DDL",
        desc: "这一次的截止日",
        type: "date",
        value: dateOf(task?.frontmatter.due || task?.frontmatter.deadline) || "",
        showWhen: { key: "recurrence", in: ["none", ""] },
      },
      {
        /* 重复任务的 DDL = 整段序列的结束日（参考谷歌日历的「结束时间：于某日」）。
           留空 = 永不结束；到时归档最后一条时不再生成下一条。 */
        id: "recurrenceUntil",
        name: "重复结束（DDL）",
        desc: "重复到这一天为止；留空 = 永不结束",
        type: "date",
        value: recurrenceUntilOf(task?.frontmatter),
        showWhen: { key: "recurrence", in: ["daily", "weekly", "monthly"] },
      },
      {
        id: "duration",
        name: "预计耗时（分钟）",
        value: task?.frontmatter.duration || this.settings.defaultTaskDuration,
      },
      {
        id: "priority",
        name: "优先级",
        type: "select",
        options: { high: "高", medium: "中", low: "低" },
        value: task?.frontmatter.priority || "medium",
      },
      {
        id: "type",
        name: "任务类型",
        type: "select",
        options: { task: "普通任务", "knowledge-gap": "知识缺口 / 学习计划" },
        value: task?.frontmatter.type || "task",
      },
      { id: "status", name: "执行状态", type: "select", options: statusOptions, value: currentStatus },
    ];
  }
  /** 表单提交（原来内联在 openTaskEditor 里，逻辑未改） */
  async taskEditorSubmit(context: any, task: any, values: any) {
    const { data, selectedProject } = context;
    if (!values.title.trim()) throw expectedError("任务内容不能为空");
    const selected =
      data.projects.find((item: any) => item.file.path === values.project) || (values.project ? null : null);
    const targetProject = selected || (values.project ? selectedProject : null);
    const folder = targetProject
      ? targetProject.folderPath || (await this.ensureProjectFolder(targetProject)) || this.settings.taskFolder
      : this.settings.taskFolder;
    /* ---- 重复模式（参考谷歌日历）----
       · 选了「每周」再给周几（可多选）、「每月」再给几号；
       · DDL 在重复任务里是**整段序列的结束日**（UNTIL），落进 `recurrence_until`；
       · 本次执行日期（`due`）由模式推出：新建或从"不重复"切过来时取"不早于今天的第一次命中"，
         已有重复任务重新编辑时**不动它**（用户只是改个标题，执行日不该被悄悄挪走）。 */
    const recurrence = String(values.recurrence || "none").toLowerCase();
    const isRecurring = recurrence !== "none" && recurrence !== "";
    const pattern = {
      weekdays: recurrence === "weekly" ? normalizeWeekdays(values.recurrenceWeekdays) : [],
      monthday: recurrence === "monthly" ? normalizeMonthDay(values.recurrenceMonthday) : 0,
    };
    const until = isRecurring ? dateOf(values.recurrenceUntil) || "" : "";
    const previousRecurrence = String(task?.frontmatter?.recurrence || "none").toLowerCase();
    let due = String(values.due || "").trim();
    if (isRecurring) {
      if (!task || previousRecurrence === "none" || previousRecurrence === "") {
        due = firstOccurrenceOnOrAfter(recurrence, pattern, today()) || "";
        if (!due) throw expectedError("算不出第一次执行日期，请检查重复周期与「每月几号」");
      } else {
        due = dateOf(task.frontmatter.due || task.frontmatter.deadline) || due;
      }
      if (until && due && until < due) {
        throw expectedError("「重复结束」不能早于第一次执行日期（" + due + "）");
      }
    }
    let nextStatus = taskStatus({ frontmatter: { status: values.status, due } });
    /* 表单里给重复任务选了「完成」也按本周期完成处理：执行日滚到下一周期，而不是把整条任务标成 done。
       重复真的走完时同样不标「已完成」—— 保持原来的状态与执行日，只提示可以归档收尾。 */
    let completionLog = "";
    let completionEnded = false;
    let completionPrevious: any = null;
    if (isRecurring && ["done", "completed"].includes(String(nextStatus).toLowerCase())) {
      const outcome = this.recurringCompletionOutcome({
        recurrence,
        due,
        recurrence_weekdays: pattern.weekdays,
        recurrence_monthday: pattern.monthday,
        recurrence_until: until,
      });
      if (outcome && outcome.ended) {
        completionEnded = true;
        if (task) {
          const previousDue = dateOf(task.frontmatter.due || task.frontmatter.deadline) || due;
          due = previousDue;
          nextStatus = taskStatus({ frontmatter: { status: task.frontmatter.status, due: previousDue } });
        } else {
          nextStatus = taskStatus({ frontmatter: { status: "", due } });
        }
      } else if (outcome) {
        completionPrevious = {
          due: due,
          status: String(task?.frontmatter?.status || ""),
        };
        due = outcome.due;
        nextStatus = outcome.status;
        completionLog = outcome.log;
      }
    }
    const patch = {
      type: values.type || "task",
      title: values.title.trim(),
      status: nextStatus,
      project: targetProject ? targetProject.file.path : "",
      milestone: targetProject ? values.milestone || "未分组" : "",
      task_set: values.taskSet.trim(),
      task_group: values.taskGroup.trim(),
      recurrence: isRecurring ? recurrence : "none",
      assignee: values.assignee.trim(),
      knowledge_refs: normalizeList(values.knowledgeRefs),
      due,
      duration: Number(values.duration) || this.settings.defaultTaskDuration,
      priority: values.priority || "medium",
      updated: today(),
    } as any;
    /* 只有当前模式用得到的字段才写进去；用不到的显式删掉（否则 weekly → daily 会留下过期的周几） */
    const removeKeys: string[] = [];
    if (pattern.weekdays.length) patch.recurrence_weekdays = pattern.weekdays;
    else removeKeys.push("recurrence_weekdays");
    if (pattern.monthday) patch.recurrence_monthday = pattern.monthday;
    else removeKeys.push("recurrence_monthday");
    if (until) patch.recurrence_until = until;
    else removeKeys.push("recurrence_until");
    if (task) {
      /* 先移动、后写 frontmatter —— 与"导入草稿""分诊草稿"同一顺序：
         移动失败时笔记保持原样；写入失败则把移动撤回，不留"文件已改名换目录、字段却还是旧的"。
         （旧实现是先写 frontmatter 再改名且不回滚，改名一失败就留下半截状态：字段已改、文件名没改。） */
      const originPath = task.file.path;
      const destination = await this.uniqueFilePath(folder, values.title, originPath);
      const moved = destination !== originPath ? await this.app.vault.rename(task.file, destination) : task.file;
      try {
        await this.updateFM(moved, patch, removeKeys);
      } catch (error: any) {
        if (destination !== originPath) await this.app.vault.rename(moved, originPath).catch(() => {});
        throw error;
      }
      if (completionLog) {
        const entry: any = await this.appendTaskLog(moved, completionLog).catch(() => "");
        /* 表单里选「完成」也要能撤销：快照与状态按钮走同一条路 */
        this.lastRecurringCompletion = completionPrevious
          ? {
              path: moved.path,
              title: values.title.trim(),
              due: completionPrevious.due,
              status: completionPrevious.status,
              logLine: entry || "",
            }
          : null;
      }
      new obsidian.Notice(
        "任务已更新：" + values.title + (completionEnded ? "。重复已结束，未标「已完成」，可归档收尾。" : ""),
      );
    } else {
      const path = await this.uniqueFilePath(folder, values.title);
      await this.app.vault.create(
        path,
        makeMD(
          Object.assign({}, patch, { created: today() }),
          "## 任务拆解\n\n- [ ] \n\n## 执行记录\n\n## 验收标准\n\n- \n\n## 阻塞项\n\n- \n",
        ),
      );
      if (completionLog) {
        const entry: any = await this.appendTaskLog(this.app.vault.getAbstractFileByPath(path), completionLog).catch(
          () => "",
        );
        if (completionPrevious) {
          this.lastRecurringCompletion = {
            path,
            title: values.title.trim(),
            due: completionPrevious.due,
            status: completionPrevious.status,
            logLine: entry || "",
          };
        }
      }
      new obsidian.Notice("已创建任务：" + values.title);
    }
    this.refreshViews();
  }
  newTask(project?: any, presetMilestone?: any) {
    this.openTaskEditor(project, undefined, presetMilestone);
  }
  editTask(task: any, project?: any) {
    this.openTaskEditor(project, task);
  }
  deleteFile(file: any, label: string = "文件") {
    new ConfirmModal(this.app, "删除" + label, label + "文件将被删除。" + DELETE_HINT, "删除", async () => {
      if (!file || !file.path || !this.app.vault.getAbstractFileByPath(file.path))
        throw new Error(label + "文件已经不存在，请刷新后重试。");
      /* 必须走 trashFile：vault.delete(entry) 对文件是直接 unlink（永久删除），
         根本不读用户的「删除文件」设置 —— 文案承诺"跟随设置"就必须走这条路。 */
      await this.app.fileManager.trashFile(file);
      new obsidian.Notice(label + "已删除。");
      this.refreshViews();
    }).open();
  }
  deleteTask(task: any) {
    new ConfirmModal(this.app, "删除任务", "任务文件将被删除。" + DELETE_HINT, "删除任务", async () => {
      if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
        throw new Error("任务文件已经不存在，请刷新后重试。");
      /* 同 deleteFile：vault.delete(entry) 是永久删除、不读用户的「删除文件」设置 */
      await this.app.fileManager.trashFile(task.file);
      new obsidian.Notice("任务已删除。");
      this.refreshViews();
    }).open();
  }

  /** 归档前把会被覆盖的字段快照成 archived_prev_*（撤销归档 / 移动失败回滚靠它还原） */
  archivedSnapshot(frontmatter: any) {
    const patch: Record<string, any> = {};
    ARCHIVED_OVERWRITTEN_KEYS.forEach((key: any) => {
      const value = frontmatter ? frontmatter[key] : undefined;
      if (value !== undefined && value !== null && value !== "") patch["archived_prev_" + key] = value;
    });
    return patch;
  }
  /** 还原计划：status / completed 回到快照值（没有快照的旧归档保持旧行为），并清掉全部归档痕迹。
   *  注意 patch 与 remove 不得有交集 —— processFrontMatter 是「先 assign 再 delete」，writeFM 是「先删再写」，
   *  同一个 key 同时出现在两边会导致两条路径结果相反。 */
  archivedRestorePlan(frontmatter: any) {
    const fm = frontmatter || {};
    const patch: Record<string, any> = {};
    const remove = ["archived", "archived_from", "archived_to"];
    const storedStatus = fm.archived_prev_status;
    if (storedStatus !== undefined && storedStatus !== null && storedStatus !== "") patch.status = storedStatus;
    const storedCompleted = fm.archived_prev_completed;
    if (storedCompleted !== undefined && storedCompleted !== null && storedCompleted !== "")
      patch.completed = storedCompleted;
    else remove.push("completed");
    ARCHIVED_OVERWRITTEN_KEYS.forEach((key: any) => remove.push("archived_prev_" + key));
    return { patch, remove: remove.filter((key: any) => !(key in patch)) };
  }
  /** 写 frontmatter。CRLF 笔记走自己的行级补丁（writeFM）：
   *  Obsidian 的 processFrontMatter 会用 \n 重新序列化整个 frontmatter 段，Windows 用户的笔记会变成
   *  "上半段 LF、下半段 CRLF"，在 diff / 版本历史里看起来整篇都改了。纯 LF 笔记仍走官方 API（YAML 处理更稳）。
   *  guard：可选断言，拿"写入那一刻"的 frontmatter 判定 —— 用来放弃会覆盖用户刚做修改的后台回写。 */
  async updateFM(file?: any, patch?: any, removeKeys: any = [], guard?: any) {
    if (!(file instanceof obsidian.TFile)) return;
    const applyPatch = (frontmatter: any) => {
      if (guard && !guard(frontmatter)) return false;
      Object.assign(frontmatter, patch);
      removeKeys.forEach((key: any) => delete frontmatter[key]);
      return true;
    };
    let usesCrlf = false;
    try {
      const raw = this.app.vault.cachedRead ? await this.app.vault.cachedRead(file) : "";
      usesCrlf = typeof raw === "string" && raw.indexOf("\r\n") >= 0;
    } catch (error: any) {
      usesCrlf = false;
    }
    if (!usesCrlf && this.app.fileManager && this.app.fileManager.processFrontMatter) {
      await this.app.fileManager.processFrontMatter(file, applyPatch);
      return;
    }
    if (this.app.vault.process) {
      await this.app.vault.process(file, (content: any) => {
        if (guard) {
          const live = parseFM(content).data || {};
          if (!guard(live)) return content;
        }
        return writeFM(content, patch, removeKeys);
      });
      return;
    }
    if (this.app.fileManager && this.app.fileManager.processFrontMatter) {
      await this.app.fileManager.processFrontMatter(file, applyPatch);
    }
  }
  projectStatus(file: any) {
    new ChoiceModal(
      this.app,
      "更新项目状态",
      "状态会写回项目笔记的 frontmatter。",
      [
        { id: "active", label: "进行中", description: "进入执行状态" },
        { id: "blocked", label: "阻塞", description: "保留阻塞原因并回到项目推演" },
        { id: "paused", label: "暂停", description: "暂时停止执行" },
        { id: "completed", label: "已完成", description: "通过验收后再归档" },
      ],
      async (status: any) => {
        await this.updateFM(file, { status, updated: today() });
        new obsidian.Notice("项目状态已更新：" + statusLabel(status));
        this.refreshViews();
      },
    ).open();
  }
  /** 把选中的草稿移动成任务集条目：先移动、后写 frontmatter；单条失败只影响它自己，并把文件搬回原位。
   *  命令面板的周维护导入与 Web 端的「导入为任务集」共用这一份实现。 */
  async importDraftsAsTaskSet(paths: any, taskSet: any, taskGroup: any) {
    const data = await this.collectData();
    const selected = selectInboxItems(data.inbox, paths);
    if (!selected.length) return new obsidian.Notice("没有选择有效草稿。");
    const set = String(taskSet || "").trim() || "本周维护";
    const group = String(taskGroup || "").trim() || "待整理";
    const failures: any[] = [];
    const failedPaths: any[] = [];
    for (const item of selected) {
      const source = item.file.path;
      const destination = await this.uniqueFilePath(this.settings.taskFolder, nameOf(source));
      let moved;
      /* 先移动、后写 frontmatter：中途失败时该条草稿保持原样，不会变成「留在草稿箱却已是 type: task」 */
      try {
        moved = destination === source ? item.file : await this.app.vault.rename(item.file, destination);
      } catch (error: any) {
        failures.push(nameOf(source) + "（移动失败）");
        failedPaths.push(source);
        console.error("[personal-planning-dashboard] import move failed", error);
        continue;
      }
      try {
        await this.updateFM(moved, Object.assign({}, taskImportPatch(set, group), { updated: today() }));
      } catch (error: any) {
        if (destination !== source) await this.app.vault.rename(moved, source).catch(() => {});
        failures.push(nameOf(source) + "（写入失败）");
        failedPaths.push(source);
        console.error("[personal-planning-dashboard] import frontmatter failed", error);
      }
    }
    this.recordBulkFailures(
      "周维护导入",
      "import-task-set",
      { paths: failedPaths, taskSet: set, taskGroup: group },
      failedPaths,
      failures,
    );
    if (failures.length)
      new obsidian.Notice(
        "已导入 " +
          (selected.length - failures.length) +
          " / " +
          selected.length +
          " 条，失败 " +
          failures.length +
          " 条：" +
          failures.join("、"),
      );
    else new obsidian.Notice("已导入 " + selected.length + " 条草稿到任务集：" + set + " / " + group);
    this.refreshViews();
    return { imported: selected.length - failures.length, failures, taskSet: set, taskGroup: group };
  }
  async importInboxAsTaskSet(file?: any) {
    const data = await this.collectData();
    if (!data.inbox.length) return new obsidian.Notice("草稿箱为空。");
    const importSelected = (paths: any) => {
      const selected = selectInboxItems(data.inbox, paths);
      if (!selected.length) return new obsidian.Notice("没有选择有效草稿。");
      new FormModal(
        this.app,
        "周维护：导入草稿为任务集",
        [
          { id: "taskSet", name: "任务集", value: "本周维护", placeholder: "例如：本周维护" },
          { id: "taskGroup", name: "任务组", value: "待整理", placeholder: "例如：资料整理" },
        ],
        async (values: any) => {
          await this.importDraftsAsTaskSet(paths, values.taskSet, values.taskGroup);
        },
      ).open();
    };
    if (file) return importSelected([file.path]);
    const choices = data.inbox.map((item: any) => ({
      id: item.file.path,
      label: item.frontmatter.title || nameOf(item.file.path),
      description: item.file.path,
    }));
    new MultiChoiceModal(
      this.app,
      "周维护：选择要导入的草稿",
      "可多选草稿；选中后统一指定任务集和任务组。",
      choices,
      importSelected,
    ).open();
  }
  triageInbox() {
    this.collectData().then((data: any) => {
      if (!data.inbox.length) return new obsidian.Notice("草稿箱为空。");
      this.openTriage(data.inbox[0].file);
    });
  }
  openTriage(file: any) {
    if (!file || !file.path || !this.app.vault.getAbstractFileByPath(file.path))
      return new obsidian.Notice("草稿已经不存在，请刷新草稿箱后重试。");
    new ChoiceModal(
      this.app,
      "分诊：" + nameOf(file.path),
      "这是一次显式移动操作；插件不会自动判断内容归属。",
      [
        { id: "project", label: "立项", description: "移动到项目库并标记 planning" },
        { id: "task", label: "短期任务", description: "移动到日程待办并标记 todo" },
        { id: "knowledge", label: "沉淀知识", description: "移动到知识库" },
        { id: "area", label: "长期领域", description: "移动到长期领域" },
        { id: "people", label: "人物", description: "移动到人物库" },
        { id: "archive", label: "丢弃 / 归档", description: "移动到归档库并标记 archived" },
      ],
      async (target: any) => {
        const folders: Record<string, any> = {
          project: this.settings.projectFolder,
          task: this.settings.taskFolder,
          knowledge: this.settings.knowledgeFolder,
          area: this.settings.areaFolder,
          people: this.settings.peopleFolder,
          archive: this.settings.archiveFolder,
        } as any;
        const types = {
          project: "project",
          task: "task",
          knowledge: "knowledge",
          area: "area",
          people: "person",
          archive: "note",
        } as any;
        const statuses = { project: "planning", task: "todo", archive: "archived" } as any;
        const source = file.path;
        const destination = await this.uniqueFilePath(folders[target], nameOf(source));
        const patch = Object.assign(
          {
            type: types[target],
            stage: target === "archive" ? "archived" : target,
            status: statuses[target] || "active",
            updated: today(),
          },
          target === "archive" ? { archived_from: source, archived_to: folders[target] } : {},
        );
        let moved;
        try {
          moved = destination === source ? file : await this.app.vault.rename(file, destination);
        } catch (error: any) {
          console.error("[personal-planning-dashboard] triage move failed", error);
          return new obsidian.Notice("移动失败，草稿未做任何修改：" + ((error && error.message) || error));
        }
        try {
          await this.updateFM(moved, patch);
        } catch (error: any) {
          if (destination !== source) await this.app.vault.rename(moved, source).catch(() => {});
          throw error;
        }
        new obsidian.Notice("已移动到：" + folders[target]);
        this.refreshViews();
        if (target !== "archive") await this.openFile(moved);
      },
    ).open();
  }
  findProject(task: any, projects: any) {
    /* 与 Web 载荷共用同一份归属规则（见 core/paths.pickProject）：
       同名项目按"引用越具体越优先 + 码点序兜底"，不依赖 vault 枚举顺序。 */
    return pickProject(task && task.file ? task.file.path : "", task && task.frontmatter, projects) || undefined;
  }
  async createNextRecurringTask(task: any, project: any) {
    this.lastRecurrenceEnded = null;
    const recurrence = String(task.frontmatter.recurrence || "none").toLowerCase();
    /* 按模式算下一次：每周看命中的周几，每月看几号（29/30/31 号顺延到月末）。
       模式缺失时退回旧行为（+7 天 / 同号下月），老笔记的滚动方式因此一个字不变。 */
    const weekdays = recurrenceWeekdaysOf(task.frontmatter);
    const monthday = recurrenceMonthDayOf(task.frontmatter);
    const until = recurrenceUntilOf(task.frontmatter);
    const title = task.frontmatter.title || nameOf(task.file.path);
    /* 已经标成"完成"的重复任务只归档、不再生成下一条：
       完成时（advanceRecurringCycle）要么已经把执行日推进到下一周期（再生成就多出一条），
       要么说明重复已结束。 */
    if (isCompletedTask(task)) {
      this.lastRecurrenceEnded = { title, until, reason: "completed" };
      return null;
    }
    const nextDue = nextRecurringDate(task.frontmatter.due || task.frontmatter.deadline, recurrence, {
      weekdays,
      monthday,
    });
    if (!nextDue) return null;
    /* DDL 是整段重复的结束日：下一次越过它，说明序列走完了 —— 归档这条，但不再生成下一条 */
    if (until && nextDue > until) {
      this.lastRecurrenceEnded = { title, until, nextDue };
      return null;
    }
    const selectedProject = project || null;
    const folder = selectedProject
      ? selectedProject.folderPath || (await this.ensureProjectFolder(selectedProject))
      : this.settings.taskFolder;
    if (!folder) return null;
    const destination = await this.uniqueFilePath(folder, title);
    const patch = {
      type: task.frontmatter.type || "task",
      title,
      status: taskStatus({ frontmatter: { status: "", due: nextDue } }),
      project: selectedProject ? selectedProject.file.path : task.frontmatter.project || "",
      milestone: task.frontmatter.milestone || "未分组",
      task_set: task.frontmatter.task_set || "",
      task_group: task.frontmatter.task_group || "",
      recurrence,
      assignee: task.frontmatter.assignee || "",
      knowledge_refs: normalizeList(task.frontmatter.knowledge_refs),
      due: nextDue,
      duration: Number(task.frontmatter.duration) || this.settings.defaultTaskDuration,
      priority: task.frontmatter.priority || "medium",
      created: today(),
    } as any;
    /* 只写当前模式用得到的字段：不给笔记塞 `recurrence_weekdays: []` 这种空壳 */
    if (weekdays.length) patch.recurrence_weekdays = weekdays;
    if (monthday) patch.recurrence_monthday = monthday;
    if (until) patch.recurrence_until = until;
    await this.app.vault.create(
      destination,
      makeMD(patch, "## 任务拆解\n\n- [ ] \n\n## 执行记录\n\n## 验收标准\n\n- \n\n## 阻塞项\n\n- \n"),
    );
    return destination;
  }
  /**
   * 往正文「## 执行记录」小节末尾追加一行，返回写进去的那一行（撤销时按它精确删除）。
   * 保留原文换行风格（CRLF 笔记不会被塞进裸 LF），没有这一节就补一个。
   */
  async appendTaskLog(file: any, line: string): Promise<string> {
    if (!file || !this.app.vault.process) return "";
    const entry = "- " + today() + " " + line;
    await this.updateBody(file, (body: string) => {
      const source = String(body || "");
      const eol = pickEol(source, "\n");
      const heading = /^##[ \t]*执行记录[ \t]*$/m.exec(source);
      if (!heading) return source.replace(/\s*$/, "") + eol + eol + "## 执行记录" + eol + eol + entry + eol;
      /* 插到这一节的末尾（写日志是追加，不是倒序），也就是下一个二级标题之前 */
      const afterHeading = source.slice(heading.index + heading[0].length);
      const nextHeading = afterHeading.search(/\r?\n##[ \t]/);
      const sectionEnd = nextHeading < 0 ? source.length : heading.index + heading[0].length + nextHeading;
      const before = source.slice(0, sectionEnd).replace(/\s*$/, "");
      const rest = source.slice(sectionEnd);
      return before + eol + eol + entry + eol + rest;
    });
    this.invalidateNoteCache(file);
    return entry;
  }
  /** 撤销周期完成时把刚才追加的那一行删掉（只删字面相同的那一行，别动用户自己写的记录）。 */
  async removeTaskLog(file: any, entry: string) {
    if (!file || !entry || !this.app.vault.process) return;
    await this.updateBody(file, (body: string) => {
      const source = String(body || "");
      const lines = source.split(/\r?\n/);
      const at = lines.findIndex((line) => line.trim() === entry.trim());
      if (at < 0) return source;
      lines.splice(at, 1);
      /* 只收拾它自己留下的空行：删除后若前后都是空行，合并成一个 */
      if (
        lines[at] !== undefined &&
        lines[at].trim() === "" &&
        lines[at - 1] !== undefined &&
        lines[at - 1].trim() === ""
      )
        lines.splice(at, 1);
      return lines.join(pickEol(source, "\n"));
    });
    this.invalidateNoteCache(file);
  }
  /**
   * 「本周期完成」算出来的下一站 —— 重复任务的「完成」用它原地推进。
   * 返回值三态：
   *   null            → 不是重复任务（或没有执行日）：调用方按普通的「完成」处理；
   *   { ended: true } → 重复已经走完（下一次越过重复结束日）：**不标「已完成」**，什么都不改；
   *   { due, ... }    → 正常推进：执行日跳到下个周期、状态回到「待办」。
   * 抽成纯计算，是为了让状态按钮、表单提交与批量改状态共用同一套判断。
   */
  recurringCompletionOutcome(frontmatter: any) {
    const recurrence = String((frontmatter && frontmatter.recurrence) || "none").toLowerCase();
    const occurrence = dateOf(frontmatter && (frontmatter.due || frontmatter.deadline));
    if (recurrence === "none" || recurrence === "" || !occurrence) return null;
    const weekdays = recurrenceWeekdaysOf(frontmatter);
    const monthday = recurrenceMonthDayOf(frontmatter);
    const until = recurrenceUntilOf(frontmatter);
    /* 从"这次之后"开始找，并跳过已经错过的周期：一完成就立刻又逾期是没有意义的 */
    let next = nextRecurringDate(occurrence, recurrence, { weekdays, monthday });
    let guard = 0;
    while (next && next < today() && guard < 4000) {
      next = nextRecurringDate(next, recurrence, { weekdays, monthday });
      guard += 1;
    }
    if (!next || (until && next > until)) return { ended: true as const, until, occurrence };
    return {
      ended: false as const,
      occurrence,
      due: next,
      status: taskStatus({ frontmatter: { status: "", due: next } }),
      log: "本周期完成（原 " + occurrence + "）→ 下一次 " + next,
    };
  }
  /**
   * 重复任务的「本周期完成」：执行日跳到下个周期设定的时间，状态回到「待办」，
   * 并把这次完成记进正文「执行记录」。
   *
   * 三条口径（都由 recurringCompletionOutcome 保证）：
   *   1. **绝不标「已完成」**：重复任务的「完成」只结束这一个周期，整条任务继续存在。
   *      所以不写 done、不写删除线 —— 那两种标记只属于"整条任务结束"。
   *   2. 重复真的走完时（下一次越过重复结束日）什么都不改，只提示"可以归档收尾"。
   *   3. 每一步都留一份快照，`撤销` 能把执行日与状态原样放回去（见 undoRecurringCompletion）。
   *
   * 返回 true 表示"已经按周期完成处理过，调用方不要再写 done"。
   */
  async advanceRecurringCycle(task: any): Promise<boolean> {
    const frontmatter = (this.fm(task.file) || task.frontmatter || {}) as any;
    const outcome = this.recurringCompletionOutcome(frontmatter);
    if (!outcome) return false;
    const title = frontmatter.title || nameOf(task.file.path);
    if (outcome.ended) {
      this.lastRecurringCompletion = null; /* 序列走完不是"一个周期完成"，没有可撤销的东西 */
      new obsidian.Notice(
        "「" + title + "」的重复已经走完（重复到 " + (outcome.until || "—") + " 为止），不再有下一个周期。可归档收尾。",
      );
      return true;
    }
    /* 快照要在写入之前拍：撤销就是把这三样放回去 */
    const previous = {
      path: task.file.path,
      title,
      due: dateOf(frontmatter.due || frontmatter.deadline) || "",
      status: String(frontmatter.status || ""),
      logLine: "",
    };
    await this.updateFM(task.file, { due: outcome.due, status: outcome.status, updated: today() });
    previous.logLine = await this.appendTaskLog(task.file, outcome.log);
    this.lastRecurringCompletion = previous;
    new obsidian.Notice(
      "本周期已完成，下一次：" + outcome.due + "（" + weekdayLabel(isoWeekday(outcome.due)) + "）。可撤销。",
    );
    this.scheduleRefreshViews();
    return true;
  }
  /** 撤销上一次「本周期完成」：执行日与状态回到点击之前，刚写进去的执行记录也删掉。
   *  只保留最近一次（这是"点错了立刻撤回"，不是历史回滚），插件重载后不再可用。 */
  async undoRecurringCompletion(path?: any) {
    const snapshot = this.lastRecurringCompletion;
    if (!snapshot) return new obsidian.Notice("没有可撤销的「本周期完成」。");
    if (path && String(path) !== snapshot.path) return new obsidian.Notice("最近一次周期完成不是这条任务，无法撤销。");
    const file = this.app.vault.getAbstractFileByPath(snapshot.path);
    if (!file) {
      this.lastRecurringCompletion = null;
      return new obsidian.Notice("这条任务的笔记已经不在了，撤销已放弃。");
    }
    const patch: Record<string, any> = { updated: today() };
    const removeKeys: string[] = [];
    if (snapshot.due) patch.due = snapshot.due;
    else removeKeys.push("due");
    if (snapshot.status) patch.status = snapshot.status;
    else removeKeys.push("status");
    await this.updateFM(file, patch, removeKeys);
    if (snapshot.logLine) await this.removeTaskLog(file, snapshot.logLine);
    this.lastRecurringCompletion = null;
    new obsidian.Notice(
      "已撤销：「" +
        snapshot.title +
        "」回到 " +
        (snapshot.due || "无 DDL") +
        "（" +
        statusLabel(taskStatus({ frontmatter: { status: snapshot.status, due: snapshot.due } })) +
        "）",
    );
    this.scheduleRefreshViews();
  }
  /** 任务状态四选一：规划中 / 待办 / 完成 / 阻塞。
   *  阻塞是"任务的状态"，项目卡片红点与关键节点标红都由它推导 —— 不再有独立的阻塞项清单。
   *  只改 status 与 updated，不碰用户其它字段；写完立刻刷新视图。
   *  重复任务例外：点「完成」= 本周期完成 → 原地滚到下一周期，永不写 done（见 advanceRecurringCycle）。 */
  async setTaskStatus(task: any, status: any) {
    if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
      return new obsidian.Notice("任务文件已经不存在，请刷新后重试。");
    const allowed: Record<string, any> = { planning: "规划中", todo: "待办", done: "完成", blocked: "阻塞" } as any;
    const next = Object.prototype.hasOwnProperty.call(allowed, String(status)) ? String(status) : "";
    if (!next) return new obsidian.Notice("不支持的任务状态：" + String(status || ""));
    const current = String((this.fm(task.file) || {}).status || "").toLowerCase();
    if (current === next) return;
    if (next === "done" && (await this.advanceRecurringCycle(task))) return;
    /* 走 updateFM 而不是直接 processFrontMatter：后者会用 \n 重新序列化整个 frontmatter 段，
       CRLF 笔记会变成"上半段 LF、下半段 CRLF"（diff 里看起来整篇都改了）。 */
    await this.updateFM(task.file, { status: next, updated: today() });
    this.invalidateNoteCache(task.file);
    new obsidian.Notice("任务状态已改为「" + allowed[next] + "」");
    this.scheduleRefreshViews();
  }
  /** 记住最近一次批量操作的失败条目：通知会消失，但"哪几条没成功"应当留在界面上可以重试。
   *  kind / action / payload 一起存下来，渲染层就能原样重发一次。 */
  recordBulkFailures(kind: any, action: any, payload: any, failedPaths: any, messages: any) {
    const paths = (failedPaths || []).map(String).filter(Boolean);
    this.lastBulkFailures = paths.length
      ? {
          kind: String(kind || "批量操作"),
          action: String(action || ""),
          payload: payload || {},
          paths: paths,
          messages: (messages || []).slice(0, 8),
          at: today(),
        }
      : null;
    return this.lastBulkFailures;
  }
  /** 渲染层点「知道了」：清掉失败条 */
  clearBulkFailures() {
    this.lastBulkFailures = null;
    this.refreshViews();
  } /** 数据页签的批量移动：**只移动文件位置**，不改 type / status / 正文 ——
   *  改语义（比如"这其实是个任务"）属于分诊，应当在草稿箱里显式选，不能靠搬文件顺带改。
   *  整个批只弹一次确认；逐条独立，重名自动加序号，失败不影响其它条。 */
  async bulkMoveNotes(paths: any, target: any) {
    const folders: Record<string, any> = {
      archive: { path: this.settings.archiveFolder, label: "归档库" },
      knowledge: { path: this.settings.knowledgeFolder, label: "知识库" },
      task: { path: this.settings.taskFolder, label: "日程待办" },
      inbox: { path: this.settings.inboxFolder, label: "草稿箱" },
      area: { path: this.settings.areaFolder, label: "长期领域" },
      people: { path: this.settings.peopleFolder, label: "人物库" },
    };
    const targetFolder = folders[String(target || "")];
    if (!targetFolder || !targetFolder.path) return new obsidian.Notice("不支持移动到的目标：" + String(target || ""));
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian.Notice("请先勾选要移动的条目。");
    const movable = wanted.filter((path: any) => !inFolder(path, targetFolder.path));
    if (!movable.length) return new obsidian.Notice("选中的条目都已经在" + targetFolder.label + "里了。");
    const preview =
      movable
        .slice(0, 5)
        .map((path: any) => nameOf(path))
        .join("、") + (movable.length > 5 ? " 等 " + movable.length + " 条" : "");
    new ConfirmModal(
      this.app,
      "批量移动到" + targetFolder.label,
      "把 " +
        movable.length +
        " 条笔记移动到「" +
        targetFolder.path +
        "」：" +
        preview +
        "。只移动文件位置，不会改 type / status，也不会动正文。",
      "移动",
      async () => {
        const failures: any[] = [];
        const failedPaths: any[] = [];
        let done = 0;
        for (const path of movable) {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof obsidian.TFile)) {
            failures.push(nameOf(path) + "（文件不存在）");
            failedPaths.push(path);
            continue;
          }
          try {
            const destination = await this.uniqueFilePath(targetFolder.path, nameOf(path), path);
            if (destination !== path) await this.app.vault.rename(file, destination);
            this.invalidateNoteCache(file);
            done += 1;
          } catch (error: any) {
            failures.push(nameOf(path) + "（" + ((error && error.message) || "移动失败") + "）");
            failedPaths.push(path);
            console.error("[personal-planning-dashboard] bulk move failed", path, error);
          }
        }
        this.recordBulkFailures(
          "移动到" + targetFolder.label,
          "bulk-move-notes",
          { paths: failedPaths, target: target },
          failedPaths,
          failures,
        );
        if (failures.length)
          new obsidian.Notice(
            "已移动 " +
              done +
              " / " +
              movable.length +
              " 条到" +
              targetFolder.label +
              "，失败 " +
              failures.length +
              " 条：" +
              failures.slice(0, 6).join("、"),
          );
        else new obsidian.Notice("已移动 " + done + " 条笔记到" + targetFolder.label + "。");
        this.refreshViews();
      },
    ).open();
  }
  /** 项目页签的批量改状态：只改 status / updated，不移动任何文件（归档与否是另一件事）。 */
  async bulkSetProjectStatus(paths: any, status: any) {
    const allowed = { active: "进行中", blocked: "阻塞", paused: "暂停", completed: "已完成" } as any;
    const next = Object.prototype.hasOwnProperty.call(allowed, String(status)) ? String(status) : "";
    if (!next) return new obsidian.Notice("不支持的项目状态：" + String(status || ""));
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian.Notice("请先勾选要修改的项目。");
    const failures: any[] = [];
    const failedPaths: any[] = [];
    let done = 0;
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) {
        failures.push(path + "（文件不存在）");
        continue;
      }
      const frontmatter = this.fm(file) || {};
      if (String(frontmatter.type || "").toLowerCase() !== "project") {
        failures.push(nameOf(path) + "（不是项目）");
        failedPaths.push(path);
        continue;
      }
      if (String(frontmatter.status || "").toLowerCase() === next) continue; /* 已经是目标状态 */
      try {
        await this.updateFM(file, { status: next, updated: today() });
        this.invalidateNoteCache(file);
        done += 1;
      } catch (error: any) {
        failures.push(nameOf(path) + "（" + ((error && error.message) || "写入失败") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk set project status failed", path, error);
      }
    }
    this.recordBulkFailures(
      "批量改项目状态",
      "bulk-set-project-status",
      { paths: failedPaths, status: next },
      failedPaths,
      failures,
    );
    if (failures.length)
      new obsidian.Notice(
        "已更新 " +
          done +
          " / " +
          wanted.length +
          " 个项目为「" +
          allowed[next] +
          "」，跳过或失败 " +
          failures.length +
          " 条：" +
          failures.slice(0, 6).join("、"),
      );
    else new obsidian.Notice("已把 " + done + " 个项目设为「" + allowed[next] + "」。");
    this.refreshViews();
    return { done, failures };
  }
  /** 任务页签的批量改字段（状态 / 项目 / 关键节点）：逐条独立，值没变的跳过不算失败，最后统一汇报。 */
  async bulkSetTaskFields(paths: any, patch: any) {
    const entries = Object.entries(patch || {}).filter(
      ([, value]: any) => value !== undefined && value !== null && String(value).trim() !== "",
    );
    if (!entries.length) return new obsidian.Notice("没有要修改的内容。");
    /* status 不在"可编辑字段"白名单里（它由状态选择器 / setTaskStatus 专门写），批量入口把它登记成虚拟字段 */
    const allowed: Record<string, any> = {
      status: { key: "status", label: "状态", type: "select", options: ["planning", "todo", "done", "blocked"] },
    };
    (EDITABLE_FIELDS.task || []).forEach((item: any) => {
      allowed[item.key] = item;
      ((item as any).aliases || []).forEach((alias: any) => {
        allowed[alias] = item;
      });
    });
    const fields: any[] = [];
    for (const [key, value] of entries) {
      const field = allowed[key];
      if (!field) return new obsidian.Notice("不支持批量修改的字段：" + String(key));
      if (field.key === "status" && !["planning", "todo", "done", "blocked"].includes(String(value))) {
        return new obsidian.Notice("不支持的任务状态：" + String(value));
      }
      const choices = (field.options || []).map((option: any) =>
        Array.isArray(option) ? String(option[0]) : String(option),
      );
      if (field.type === "select" && choices.length && !choices.includes(String(value))) {
        return new obsidian.Notice("不支持的取值：" + String(value));
      }
      fields.push({
        key: field.key,
        value: String(value),
        /* 写入时要用归一后的类型（周几 → 数组、几号 → 数字），所以把字段规格一起带上 */
        spec: field,
        coerced: coerceFieldValue(field, value),
        label: field.label || field.key,
      });
    }
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian.Notice("请先勾选要修改的任务。");
    const failures: any[] = [];
    const failedPaths: any[] = [];
    let done = 0;
    let endedCount = 0;
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) {
        failures.push(path + "（文件不存在）");
        continue;
      }
      const frontmatter = this.fm(file) || {};
      const type = String(frontmatter.type || "").toLowerCase();
      if (type !== "task" && type !== "knowledge-gap") {
        failures.push(nameOf(path) + "（不是任务）");
        failedPaths.push(path);
        continue;
      }
      const next: Record<string, any> = {};
      let completionLog = "";
      let completionEnded = false;
      fields.forEach((field: any) => {
        const current = frontmatter[field.key];
        if (String(current === undefined || current === null ? "" : current) !== field.value) {
          /* 批量把重复任务标成「完成」= 本周期完成：执行日滚到下一周期，而不是整条标成 done */
          if (field.key === "status" && ["done", "completed"].includes(String(field.coerced).toLowerCase())) {
            const outcome = this.recurringCompletionOutcome(frontmatter);
            if (outcome && outcome.ended) {
              /* 重复已经走完：同样不标「已完成」，这条跳过（也不计进"已更新"） */
              completionEnded = true;
              return;
            }
            if (outcome) {
              next.status = outcome.status;
              next.due = outcome.due;
              completionLog = outcome.log;
              return;
            }
          }
          next[field.key] = field.coerced;
        }
      });
      if (completionEnded && !completionLog) {
        endedCount += 1;
        continue;
      }
      if (!Object.keys(next).length) continue; /* 已经是目标值：不计入成功，也不算失败 */
      try {
        await this.updateFM(file, Object.assign({}, next, { updated: today() }));
        if (completionLog) {
          const entry: any = await this.appendTaskLog(file, completionLog).catch(() => "");
          this.lastRecurringCompletion = {
            path,
            title: String(frontmatter.title || nameOf(path)),
            due: dateOf(frontmatter.due || frontmatter.deadline) || "",
            status: String(frontmatter.status || ""),
            logLine: entry || "",
          };
        }
        this.invalidateNoteCache(file);
        done += 1;
      } catch (error: any) {
        failures.push(nameOf(path) + "（" + ((error && error.message) || "写入失败") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk set task fields failed", path, error);
      }
    }
    const labels = fields.map((field: any) => field.label).join("、");
    this.recordBulkFailures(
      "批量改任务字段",
      "bulk-set-task-fields",
      { paths: failedPaths, patch: patch },
      failedPaths,
      failures,
    );
    if (failures.length)
      new obsidian.Notice(
        "已更新 " +
          done +
          " / " +
          wanted.length +
          " 条（" +
          labels +
          "），跳过或失败 " +
          failures.length +
          " 条：" +
          failures.slice(0, 6).join("、"),
      );
    else
      new obsidian.Notice(
        "已更新 " +
          done +
          " 条任务（" +
          labels +
          "）。" +
          (endedCount ? endedCount + " 条重复已结束，未标「已完成」（可归档收尾）。" : ""),
      );
    this.refreshViews();
    return { done, failures };
  }
  /** 归档类操作的统一出口：单条调用时弹提示，批量调用时只回结果（否则一次蹦十条通知）。 */
  archiveOutcome(silent: any, ok: any, reason: any, message: any) {
    if (!silent && message) new obsidian.Notice(message);
    return ok ? { ok: true } : { ok: false, reason: reason || "未处理" };
  }
  /** 数据页签的批量归档 / 撤销归档：逐条独立处理（一条失败不影响其它条），最后统一汇报。
   *  每条都走 archiveTask / undoArchiveTask 本身，所以单条路径上的校验与回滚照旧生效。 */
  async bulkArchiveTasks(paths: any, archived: any) {
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian.Notice("请先勾选要处理的条目。");
    const verb = archived ? "撤销归档" : "归档";
    const failures: any[] = [];
    const failedPaths: any[] = [];
    let done = 0;
    const data = await this.collectData();
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) {
        failures.push(path + "（文件不存在）");
        continue;
      }
      const frontmatter = this.fm(file) || {};
      const noteType = String(frontmatter.type || "").toLowerCase();
      /* 防误伤：批量入口自己再判一次类型。数据页签里"项目文档 / 知识 / 领域 / 图书"都能被勾到，
         绝不能因为它们被勾选，就把整篇项目文档按任务逻辑搬进归档库。 */
      if (noteType !== "task" && noteType !== "knowledge-gap") {
        failures.push(nameOf(path) + "（不是任务）");
        failedPaths.push(path);
        continue;
      }
      const task = { file, frontmatter } as any;
      try {
        const result = archived
          ? await this.undoArchiveTask(task, this.findProject(task, data.projects), { silent: true })
          : await this.archiveTask(task, null, { silent: true });
        if (result && result.ok) done += 1;
        else {
          failures.push(nameOf(path) + "（" + ((result && result.reason) || "未处理") + "）");
          failedPaths.push(path);
        }
      } catch (error: any) {
        failures.push(nameOf(path) + "（" + ((error && error.message) || "出错") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk archive failed", path, error);
      }
    }
    this.recordBulkFailures(
      verb + "任务",
      archived ? "bulk-undo-archive" : "bulk-archive",
      { paths: failedPaths, archived: Boolean(archived) },
      failedPaths,
      failures,
    );
    if (failures.length)
      new obsidian.Notice(
        verb +
          "完成 " +
          done +
          " / " +
          wanted.length +
          " 条，跳过或失败 " +
          failures.length +
          " 条：" +
          failures.slice(0, 6).join("、"),
      );
    else new obsidian.Notice(verb + "完成 " + done + " 条。");
    this.refreshViews();
    return { done, failures };
  }
  async archiveTask(task: any, project?: any, options?: any) {
    const silent = Boolean(options && options.silent);
    if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
      return this.archiveOutcome(silent, false, "文件已不存在", "任务文件已经不存在，请刷新后重试。");
    if (String(task.frontmatter?.status || "").toLowerCase() === "archived" || task.frontmatter?.archived_to)
      return this.archiveOutcome(silent, false, "已经归档", "该任务已经归档，无需重复操作。");
    const liveFrontmatter = this.app.metadataCache?.getFileCache
      ? this.app.metadataCache.getFileCache(task.file)?.frontmatter || {}
      : {};
    if (String(liveFrontmatter.status || "").toLowerCase() === "archived" || liveFrontmatter.archived_to)
      return this.archiveOutcome(silent, false, "已经归档", "该任务已经归档，无需重复操作。");
    if (inFolder(task.file.path, this.settings.archiveFolder))
      return this.archiveOutcome(silent, false, "已在归档库", "该任务已经在归档库中，无需重复归档。");
    const data = await this.collectData();
    const selectedProject = project || this.findProject(task, data.projects);
    const projectFolder = selectedProject
      ? selectedProject.folderPath || (await this.ensureProjectFolder(selectedProject))
      : "";
    let folder;
    let targetName;
    if (selectedProject && projectFolder) {
      folder = this.settings.archiveFolder + "/" + nameOf(projectFolder);
      const projectName = selectedProject.frontmatter.title || nameOf(projectFolder);
      const original = stripProjectPrefix(nameOf(task.file.path), projectName);
      targetName = "[" + projectName + "] " + original;
    } else {
      folder = this.settings.archiveFolder + "/孤立任务";
      const original = nameOf(task.file.path).replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
      targetName = today() + " " + original;
    }
    await this.ensureFolder(folder); /* 归档库/项目桶可能还不存在 */
    const destination = await this.uniqueFilePath(folder, targetName, task.file.path);
    const previousStatus = String(task.frontmatter.status || "");
    const snapshot = this.archivedSnapshot(task.frontmatter);
    await this.updateFM(
      task.file,
      Object.assign(
        {
          status: "archived",
          completed: today(),
          archived: today(),
          updated: today(),
          archived_from: task.file.path,
          archived_to: folder,
        },
        snapshot,
      ),
    );
    try {
      if (destination !== task.file.path) await this.app.vault.rename(task.file, destination);
    } catch (error: any) {
      /* 移动失败就撤回状态：否则会留下「状态已归档但仍在原目录」的不一致笔记 */
      const plan = this.archivedRestorePlan(task.frontmatter);
      const rollback = Object.assign({}, plan.patch);
      if (rollback.status === undefined && previousStatus) rollback.status = previousStatus;
      await this.updateFM(task.file, rollback, plan.remove).catch(() => {});
      console.error("[personal-planning-dashboard] archive move failed", error);
      if (!silent) new obsidian.Notice("移动到归档库失败，已撤回状态修改：" + ((error && error.message) || error));
      this.refreshViews();
      return { ok: false, reason: "移动失败" };
    }
    const next = await this.createNextRecurringTask(task, selectedProject);
    if (!silent)
      new obsidian.Notice(
        next
          ? "任务已归档，并生成下一周期任务。"
          : this.lastRecurrenceEnded
            ? this.lastRecurrenceEnded.reason === "completed"
              ? "任务已归档（本周期已完成，不再生成下一条）。"
              : "任务已归档。重复已结束（重复到 " + this.lastRecurrenceEnded.until + " 为止）。"
            : selectedProject && projectFolder
              ? "项目任务已归档到归档库项目文件夹，并添加项目名前缀。"
              : "孤立任务已归档到归档库/孤立任务，并添加日期前缀。",
      );
    this.refreshViews();
    return { ok: true };
  }
  async undoArchiveTask(task: any, project: any, options?: any) {
    const silent = Boolean(options && options.silent);
    if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
      return this.archiveOutcome(silent, false, "文件已不存在", "任务文件已经不存在，请刷新后重试。");
    /* 没归档过的不动：批量撤销时勾到在办任务，不该把它"恢复"到别的目录 */
    const liveUndo = this.app.metadataCache?.getFileCache
      ? this.app.metadataCache.getFileCache(task.file)?.frontmatter || {}
      : {};
    const mergedUndo = Object.assign({}, task.frontmatter, liveUndo);
    if (
      String(mergedUndo.status || "").toLowerCase() !== "archived" &&
      !mergedUndo.archived_to &&
      !inFolder(task.file.path, this.settings.archiveFolder)
    ) {
      return this.archiveOutcome(silent, false, "没有归档", "该任务不在归档状态，无需撤销归档。");
    }
    const data = await this.collectData();
    /* 归档时把项目任务放进 <归档库>/<项目名>：即使笔记没有 project 字段，
       archived_to 也说明了它当时属于哪个项目 —— 恢复时据此回项目文件夹，而不是当成孤立任务。 */
    let selectedProject = project || this.findProject(task, data.projects);
    const archivedTo = String(mergedUndo.archived_to || "");
    if (!selectedProject && archivedTo) {
      const bucket = archivedTo.split("/").filter(Boolean).pop() || "";
      if (bucket && bucket !== "孤立任务") {
        selectedProject =
          data.projects.find((item: any) => (item.frontmatter.title || nameOf(item.file.path)) === bucket) || null;
      }
    }
    let folder;
    let title;
    if (selectedProject) {
      folder = selectedProject.folderPath || (await this.ensureProjectFolder(selectedProject));
      const projectName = selectedProject.frontmatter.title || nameOf(selectedProject.file.path);
      if (!folder) {
        /* 原项目文件夹已经不存在：真的恢复到日程待办（此前只提示、什么都没做） */
        if (!silent) new obsidian.Notice("找不到原项目文件夹，已恢复到日程待办。");
        folder = this.settings.taskFolder;
        title = stripProjectPrefix(nameOf(task.file.path), projectName).replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
      } else {
        title = stripProjectPrefix(nameOf(task.file.path), projectName);
      }
    } else {
      folder = this.settings.taskFolder;
      /* 没有项目可回：归档时加的项目名前缀在这里没有意义，一并去掉，别把 "[项目名] " 带进日程待办 */
      title = nameOf(task.file.path)
        .replace(/^\[[^\]]+\]\s*/, "")
        .replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
    }
    const plan = this.archivedRestorePlan(task.frontmatter);
    const status =
      plan.patch.status !== undefined
        ? plan.patch.status
        : taskStatus({ frontmatter: Object.assign({}, task.frontmatter, { status: "" }) });
    const destination = await this.uniqueFilePath(folder, title, task.file.path);
    /* 撤销归档前的完整归档状态：移动失败时按原样写回（含快照字段），否则笔记会被卡在半截状态 */
    const archiveState: Record<string, any> = {};
    ["status", "updated", "completed", "archived", "archived_from", "archived_to"]
      .concat(ARCHIVED_OVERWRITTEN_KEYS.map((key: any) => "archived_prev_" + key))
      .forEach((key: any) => {
        const value = task.frontmatter[key];
        if (value !== undefined && value !== null && value !== "") archiveState[key] = value;
      });
    await this.updateFM(task.file, Object.assign({}, plan.patch, { status, updated: today() }), plan.remove);
    try {
      if (destination !== task.file.path) await this.app.vault.rename(task.file, destination);
    } catch (error: any) {
      /* 移动失败就恢复原归档状态：否则笔记会卡在「状态已撤销但仍在归档库」而从所有视图消失 */
      await this.updateFM(task.file, archiveState).catch(() => {});
      console.error("[personal-planning-dashboard] undo archive move failed", error);
      if (!silent)
        new obsidian.Notice("恢复到项目/日程目录失败，已撤回状态修改：" + ((error && error.message) || error));
      this.refreshViews();
      return { ok: false, reason: "移动失败" };
    }
    if (!silent) new obsidian.Notice(selectedProject ? "项目任务已撤销归档。" : "任务已撤销归档并恢复到日程待办。");
    this.refreshViews();
    return { ok: true };
  }
  async undoArchiveActiveTask() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return new obsidian.Notice("当前没有打开的 Markdown 文件。");
    const frontmatter = this.fm(file);
    if (String(frontmatter.status || "").toLowerCase() !== "archived")
      return new obsidian.Notice("当前文件不是已归档任务。");
    const data = await this.collectData();
    await this.undoArchiveTask({ file, frontmatter }, this.findProject({ file, frontmatter }, data.projects));
  }
  async archiveActiveTask() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return new obsidian.Notice("当前没有打开的 Markdown 文件。");
    const data = await this.collectData();
    const task = data.allTasks.find((item: any) => item.file.path === file.path);
    if (!task) return new obsidian.Notice("当前文件不是插件管理的任务。");
    await this.archiveTask(task);
  }
  async uniqueChildPath(folder: any, name: any) {
    await this.ensureFolder(folder);
    const clean = cleanName(name);
    let path = obsidian.normalizePath(folder + "/" + clean);
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = obsidian.normalizePath(folder + "/" + clean + " " + n);
      n++;
    }
    return path;
  }
  async moveFolderContents(source: any, destination: any) {
    const children = [...(source.children || [])];
    for (const child of children) {
      let targetPath = obsidian.normalizePath(destination.path + "/" + child.name);
      const existing = this.app.vault.getAbstractFileByPath(targetPath);
      if (existing && child instanceof obsidian.TFolder && existing instanceof obsidian.TFolder) {
        await this.moveFolderContents(child, existing);
        continue;
      }
      if (existing) targetPath = await this.uniqueChildPath(destination.path, child.name);
      await this.app.vault.rename(child, targetPath);
    }
  }
  async createKnowledgeFromGap(task?: any, title?: any, options?: any) {
    const silent = Boolean(options && options.silent);
    if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
      throw expectedError("知识缺口任务已经不存在，请刷新后重试。");
    const name = String(title || "").trim();
    if (!name) throw expectedError("知识笔记标题不能为空");
    const destination = await this.uniqueFilePath(this.settings.knowledgeFolder, name);
    const source = task.file.path;
    const file = await this.app.vault.create(
      destination,
      makeMD(
        { type: "knowledge", title: name, source_task: source, created: today() },
        "## 学习记录\n\n## 可复用结论\n\n## 来源\n\n- [[" + source.replace(/\.md$/i, "") + "]]\n",
      ),
    );
    const existing = refs(task.frontmatter.knowledge_refs);
    await this.updateFM(task.file, {
      knowledge_refs: Array.from(new Set([...existing, destination])),
      updated: today(),
    });
    new obsidian.Notice("已将知识缺口沉淀到知识库：" + name);
    this.refreshViews();
    await this.openFile(file);
  }
  /** 批量沉淀知识缺口：每条按**自己的标题**建一篇知识笔记（重名自动加序号），逐条独立、统一汇报。
   *  单条路径仍走表单让用户改标题；批量路径不逐个提问 —— 要改标题的用单条。 */
  async bulkSinkGaps(paths: any) {
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian.Notice("请先勾选要沉淀的知识缺口。");
    const failures: any[] = [];
    const failedPaths: any[] = [];
    let done = 0;
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) {
        failures.push(nameOf(path) + "（文件不存在）");
        failedPaths.push(path);
        continue;
      }
      const frontmatter = this.fm(file) || {};
      const type = String(frontmatter.type || "").toLowerCase();
      if (type !== "knowledge-gap") {
        failures.push(nameOf(path) + "（不是知识缺口）");
        failedPaths.push(path);
        continue;
      }
      try {
        await this.createKnowledgeFromGap({ file, frontmatter }, String(frontmatter.title || nameOf(path)), {
          silent: true,
        });
        done += 1;
      } catch (error: any) {
        failures.push(nameOf(path) + "（" + ((error && error.message) || "沉淀失败") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk sink gap failed", path, error);
      }
    }
    this.recordBulkFailures("沉淀知识缺口", "bulk-sink-gaps", { paths: failedPaths }, failedPaths, failures);
    if (failures.length)
      new obsidian.Notice(
        "已沉淀 " +
          done +
          " / " +
          wanted.length +
          " 条知识缺口，跳过或失败 " +
          failures.length +
          " 条：" +
          failures.slice(0, 6).join("、"),
      );
    else new obsidian.Notice("已沉淀 " + done + " 条知识缺口到知识库。");
    this.refreshViews();
    return { done, failures };
  }
  materializeKnowledgeGap(task: any) {
    new FormModal(
      this.app,
      "沉淀知识缺口",
      [{ id: "title", name: "知识笔记标题", value: task.frontmatter.title || nameOf(task.file.path) }],
      (values: any) => this.createKnowledgeFromGap(task, values.title),
    ).open();
  }
  async openPersonalNote(path: any, title: any) {
    if (forbiddenPath(path) || !inFolder(path, this.settings.areaFolder))
      throw new Error("个人笔记路径不在长期领域目录内");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      await this.ensureFolder(this.settings.areaFolder);
      file = await this.app.vault.create(
        path,
        makeMD({ type: "area", title, created: today() }, "## 现状\n\n## 目标\n\n## 近期行动\n\n"),
      );
    }
    if (!(file instanceof obsidian.TFile)) throw new Error("目标路径不是 Markdown 文件");
    await this.openFile(file);
  }
  archiveBook(item: any) {
    new ConfirmModal(
      this.app,
      "归档图书",
      "阅读完成后移动到归档库/图书；原笔记内容不会丢失。",
      "归档图书",
      async () => {
        if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
          throw new Error("图书文件已经不存在，请刷新资源页后重试。");
        const source = item.file.path;
        const folder = obsidian.normalizePath(this.settings.archiveFolder + "/图书");
        await this.ensureFolder(folder);
        const destination = await this.uniqueFilePath(folder, nameOf(source));
        const previousStatus = String((item.frontmatter && item.frontmatter.status) || "");
        await this.updateFM(item.file, {
          status: "archived",
          archived: today(),
          archived_from: source,
          archived_to: folder,
        });
        try {
          await this.app.vault.rename(item.file, destination);
        } catch (error: any) {
          await this.updateFM(item.file, previousStatus ? { status: previousStatus } : {}, [
            "archived",
            "archived_from",
            "archived_to",
          ]).catch(() => {});
          console.error("[personal-planning-dashboard] book archive move failed", error);
          new obsidian.Notice("移动到归档库失败，已撤回状态修改：" + ((error && error.message) || error));
          this.refreshViews();
          return;
        }
        new obsidian.Notice("图书已归档：" + nameOf(source));
        this.refreshViews();
      },
    ).open();
  }
  async archiveProject(project: any) {
    const projectFolderPath = project.folderPath || (await this.ensureProjectFolder(project));
    if (!projectFolderPath) return new obsidian.Notice("项目文件夹不存在。");
    const folder = this.app.vault.getAbstractFileByPath(projectFolderPath);
    if (!(folder instanceof obsidian.TFolder)) return new obsidian.Notice("项目文件夹不存在。");
    await this.updateFM(project.file, { status: "archived", archived: today(), updated: today() });
    await this.ensureFolder(this.settings.archiveFolder);
    let destinationPath = obsidian.normalizePath(this.settings.archiveFolder + "/" + nameOf(projectFolderPath));
    const existing = this.app.vault.getAbstractFileByPath(destinationPath);
    if (existing instanceof obsidian.TFolder) {
      await this.moveFolderContents(folder, existing);
      /* 同 deleteProject：vault.delete(文件夹) 在 Obsidian 1.13 会 ERR_FS_EISDIR
         （空文件夹也一样 —— 非递归 rm 删不掉目录），合并归档后清理空壳必须走 trashFile。 */
      await this.app.fileManager.trashFile(folder);
    } else {
      if (existing)
        destinationPath = await this.uniqueFolderPath(this.settings.archiveFolder, nameOf(projectFolderPath));
      await this.app.vault.rename(folder, destinationPath);
    }
    new obsidian.Notice("整个项目文件夹已迁移到归档库。");
    this.refreshViews();
  }
  /** 撤销项目归档：把整个项目文件夹从归档库搬回项目库。
   *  安全前提：归档文件夹里只有这一个项目文档 —— archiveProject 在重名时会把内容**合并**进已有文件夹，
   *  这种情况下无法分出哪些文件属于谁，宁可拒绝也不乱搬。 */
  async undoArchiveProject(project: any) {
    if (!project || !project.file || !this.app.vault.getAbstractFileByPath(project.file.path))
      return new obsidian.Notice("项目文件已经不存在，请刷新后重试。");
    const folderPath = project.folderPath || project.file.path.split("/").slice(0, -1).join("/");
    if (!inFolder(folderPath, this.settings.archiveFolder))
      return new obsidian.Notice("这个项目不在归档库里，无需撤销归档。");
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof obsidian.TFolder)) return new obsidian.Notice("找不到项目的归档文件夹，请手动整理。");
    /* 同夹里还有别的项目文档 → 可能是当年合并归档的，不猜 */
    const siblings = (folder.children || []).filter(
      (child: any) =>
        child instanceof obsidian.TFile && String((this.fm(child) || {}).type || "").toLowerCase() === "project",
    );
    if (siblings.length > 1) {
      return new obsidian.Notice(
        "归档文件夹「" +
          nameOf(folderPath) +
          "」里还有 " +
          siblings.length +
          " 个项目，无法自动拆分，请手动整理后再撤销归档。",
      );
    }
    const projectName = project.frontmatter.title || nameOf(folderPath);
    const destination = await this.uniqueFolderPath(this.settings.projectFolder, nameOf(folderPath));
    await this.app.vault.rename(folder, destination);
    /* 注意用带扩展名的文件名：nameOf() 会去掉 .md，拼出来的路径找不到文件，状态就写不进去 */ const restoredPath =
      obsidian.normalizePath(destination + "/" + (project.file.name || nameOf(project.file.path) + ".md"));
    const restored = this.app.vault.getAbstractFileByPath(restoredPath);
    if (restored instanceof obsidian.TFile) {
      /* 状态回到「规划中」（归档前的状态没有快照，不猜），用户可在详情页改 */
      await this.updateFM(restored, { status: "planning", updated: today() }, [
        "archived",
        "archived_from",
        "archived_to",
      ]);
    }
    this.invalidateNoteCache();
    new obsidian.Notice("已把项目「" + projectName + "」恢复到项目库，状态设为「规划中」，可在项目详情里改。");
    this.refreshViews();
  }
  async checkReminders(force: any) {
    if (!this.settings.remindersEnabled) {
      /* 命令面板手动检查时给个明确反馈，而不是静默什么都不做 */
      if (force) new obsidian.Notice("提醒已在设置中关闭（设置 → 个人规划仪表盘）。");
      return;
    }
    const now = (window as any).moment ? (window as any).moment() : new Date();
    const date = today();
    const hour = (window as any).moment ? Number((now as any).format("H")) : (now as any).getHours();
    /* 空串不能当成 0 点：Number("") 是 0 且 isFinite，会让插件在凌晨立刻提醒并占掉当天额度 */
    const rawHour = this.settings.reminderHour;
    const configuredHour =
      String(rawHour === null || rawHour === undefined ? "" : rawHour).trim() === "" ? NaN : Number(rawHour);
    const reminderHour = Number.isFinite(configuredHour) ? Math.min(23, Math.max(0, Math.floor(configuredHour))) : 9;
    if (!force && hour < reminderHour) return;
    if (!force && this.settings.lastReminderDate === date) return;
    try {
      const data = await this.collectData();
      const messages = buildReminderMessages(data, date);
      if (messages.length) {
        /* 只有真的提醒了才消耗当天额度：以前不管有没有内容都落盘 lastReminderDate，
           于是用户当天补上 DDL 之后再也收不到自动提醒。 */
        this.settings.lastReminderDate = date;
        await this.saveData(this.settings);
        /* 提醒只是"知道"，点一下要能立刻"开始做"：通知挂在仪表盘入口上，并且长一点时间不自动消失 */
        const notice = new obsidian.Notice("规划提醒：\n" + messages.join("\n") + "\n（点击打开仪表盘）", 8000);
        if (notice && notice.noticeEl) {
          if (notice.noticeEl.addClass) notice.noticeEl.addClass("pp-reminder-notice");
          if (notice.noticeEl.setAttr) notice.noticeEl.setAttr("role", "button");
          notice.noticeEl.onclick = () => {
            if (notice.hide) notice.hide();
            void this.activateApp();
          };
        }
      } else if (force) {
        new obsidian.Notice("目前没有需要提醒的任务。");
      }
    } catch (error: any) {
      console.error("[personal-planning-dashboard] reminder check failed", error);
    }
  }
  async saveSettings(options?: any) {
    const next = normalizeSettings(this.settings);
    /* 同名目录会让同一篇笔记同时是草稿和任务：还原成默认值并说清楚，而不是静默接受 */
    const reverted: any[] = [];
    for (let guard = 0; guard < DISTINCT_FOLDER_KEYS.length + 1; guard += 1) {
      const clashes = folderClashes(next);
      if (!clashes.length) break;
      clashes.forEach((key: FolderSettingKey) => {
        next[key] = DEFAULTS[key];
        if (reverted.indexOf(key) < 0) reverted.push(key);
      });
    }
    if (reverted.length) new obsidian.Notice("这些目录不能和别的目录相同，已还原为默认值：" + reverted.join("、"));
    const fixed = FOLDER_SETTING_KEYS.filter(
      (key: FolderSettingKey) => String(this.settings[key] === undefined ? "" : this.settings[key]) !== next[key],
    );
    if (fixed.length) new obsidian.Notice("路径已自动归一化：" + fixed.join("、"));
    this.settings = next;
    await this.saveData(this.settings);
    this.refreshViews();
    if (!(options && options.quiet)) this.warnMissingFolders();
  }
  /** 配置体检：把【目录缺失 / 重名 / 互相嵌套】这类问题整理成可修列表。
   *  只回数据（id + 文案 + 修复方式），由设置页决定怎么渲染 —— 这样测试不必碰 DOM。 */
  settingsIssues() {
    const issues: any[] = [];
    const { missing } = this.missingConfiguredFolders();
    if (missing.length)
      issues.push({
        id: "missing",
        keys: [] as any[],
        text: "这些目录还不存在，仪表盘不会采到它们的笔记：" + missing.join("、"),
        fix: "create",
      });
    const clashKeys = folderClashes(this.settings);
    if (clashKeys.length)
      issues.push({
        id: "clash",
        keys: clashKeys,
        text: "这些目录和别的目录配成了同一个路径（会被还原成默认值）：" + clashKeys.join("、"),
        fix: "reset",
      });
    /* 互相嵌套：任务库放在草稿箱里面（或反过来），两边会同时认领同一批笔记 */
    const nested: any[] = [];
    DISTINCT_FOLDER_KEYS.forEach((key: FolderSettingKey, index: number) => {
      DISTINCT_FOLDER_KEYS.slice(index + 1).forEach((other: FolderSettingKey) => {
        const a = this.settings[key];
        const b = this.settings[other];
        if (!a || !b || a === b) return;
        if (inFolder(a, b) || inFolder(b, a)) {
          const target = a !== DEFAULTS[key] ? key : other;
          if (nested.indexOf(target) < 0) nested.push(target);
        }
      });
    });
    if (nested.length)
      issues.push({
        id: "nested",
        keys: nested,
        text: "这些目录互相嵌套，同一篇笔记会被两类视图同时认领：" + nested.join("、"),
        fix: "reset",
      });
    return issues;
  }
  /** 配置里的目录到底存不存在：手抄错一个字，仪表盘就会静默采不到那一类笔记 */
  missingConfiguredFolders() {
    const keys: FolderSettingKey[] = DISTINCT_FOLDER_KEYS.concat(["knowledgeFolder", "areaFolder", "peopleFolder"]);
    const seen = new Set();
    const missing: any[] = [];
    let existing = 0;
    keys.forEach((key: FolderSettingKey) => {
      const folder = this.settings[key];
      if (!folder || seen.has(folder)) return;
      seen.add(folder);
      if (this.app.vault.getAbstractFileByPath(folder)) existing += 1;
      else missing.push(folder);
    });
    return { missing, existing, total: seen.size };
  }
  /** 只在"库已经建好、只缺其中一两个目录"时提示：全新库第一次保存时全都缺，提示只会变成噪音。
   *  同一个缺失组合只提示一次 —— 设置页里每敲一个字都会触发保存，不去重会连刷。 */
  warnMissingFolders() {
    const { missing, existing } = this.missingConfiguredFolders();
    if (!missing.length || existing < 2) return;
    const signature = missing.join("、");
    if (signature === this.lastFolderWarning) return;
    this.lastFolderWarning = signature;
    new obsidian.Notice(
      "这些目录还不存在，仪表盘不会采到它们的笔记：" + signature + "（可用命令「初始化规划目录结构」创建默认目录）",
    );
  }
  /** 设置页输入防抖：每敲一个键就 saveData + 全视图重扫会让输入明显发卡。
   *  quiet：输入过程中的自动保存不弹提示 —— 否则用户每敲一个字都会收到一条"目录不存在"，
   *  等他敲完（防抖结束）或离开设置页时再给一次真正的反馈。 */
  scheduleSaveSettings() {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveSettings({ quiet: true });
    }, 400);
  }
  /** 立即落盘挂起的设置（关闭设置页 / 卸载插件时调用，避免最后一次输入丢失） */
  flushSaveSettings() {
    if (!this.saveTimer) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    void this.saveSettings();
  }
  /** 立即刷新所有已打开的插件视图 */
  refreshViews() {
    this.invalidateAssetCache();
    [DASHBOARD_VIEW, PROJECT_VIEW, INBOX_VIEW, TASKS_VIEW, RESOURCES_VIEW, APP_VIEW].forEach((type: any) => {
      this.app.workspace.getLeavesOfType(type).forEach((leaf: any) => (leaf.view as any)?.refresh?.());
    });
  }
  /**
   * 事件驱动的刷新入口：vault / metadataCache 事件往往成串到达（一次保存会触发多个事件），
   * 这里做 150ms 合并，避免每敲一次键盘就把全部视图重扫一遍。
   */
  scheduleRefreshViews() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshViews();
    }, 150);
  }
  /** 卸载时取消挂起的合并刷新 */
  cancelScheduledRefresh() {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  /** 素材路径解析缓存：一次渲染里多个卡片会重复解析同一批文件 */
  invalidateAssetCache() {
    this.assetPathCache = null;
  }
  vaultAssetPaths() {
    if (this.assetPathCache && Date.now() - this.assetPathCache.at < 2000) return this.assetPathCache.paths;
    const paths = (this.app.vault.getFiles ? this.app.vault.getFiles() : ([] as any[]))
      .map((file: any) => file && file.path)
      .filter(Boolean);
    this.assetPathCache = { at: Date.now(), paths };
    return paths;
  }
}
