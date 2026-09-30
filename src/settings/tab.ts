/** tab：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import * as obsidian from "obsidian";
import { applyHeroCrop, loadBannerImage } from "../core/assets";
import { DEFAULTS, PLUGIN_BUILD, type FolderSettingKey } from "../core/constants";
import { el } from "../core/dom";
import { text } from "../core/frontmatter";
import { BannerCropModal, BannerPickerModal } from "../views/banner";
import type { DashboardHost } from "../host";

export class SettingsTab extends obsidian.PluginSettingTab {
  plugin: DashboardHost;
  /* 参数既要满足 PluginSettingTab 要求的 Obsidian Plugin，又要满足视图契约 DashboardHost */
  constructor(app: any, plugin: DashboardHost & obsidian.Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  renderHeroSetting(container: any) {
    const setting = new obsidian.Setting(container)
      .setName("仪表盘横幅")
      .setDesc("从图片素材中选择图片，预览后进入固定比例裁剪；确认后才会替换当前横幅。");
    setting.addButton((button: any) =>
      button
        .setButtonText("选择图片并裁剪")
        .setCta()
        .onClick(() => new BannerPickerModal(this.app, this.plugin, () => this.display()).open()),
    );
    if (this.plugin.settings.heroCrop)
      setting.addButton((button: any) =>
        button.setButtonText("重置取景").onClick(async () => {
          this.plugin.settings.heroCrop = null;
          await this.plugin.saveSettings();
          /* 和"应用取景"一样：重置也必须刷新已打开的视图，否则仪表盘还留着旧取景 */
          if (typeof this.plugin.refreshViews === "function") this.plugin.refreshViews();
          this.display();
        }),
      );
    const direct = container.createDiv({ cls: "pp-direct-asset-picker" });
    el(direct, "span", "列表为空？直接从电脑选择图片：", "pp-muted");
    const input = direct.createEl("input");
    input.setAttr("type", "file");
    input.setAttr("accept", "image/png,image/jpeg,image/gif,image/webp");
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      loadBannerImage(url)
        .then((image: any) =>
          new BannerCropModal(
            this.app,
            this.plugin,
            image,
            { name: file.name, src: url, revoke: true, blob: file },
            () => this.display(),
          ).open(),
        )
        .catch((error: any) => {
          URL.revokeObjectURL(url);
          new obsidian.Notice("图片加载失败：" + (error.message || error));
        });
    };
    const preview = container.createDiv({ cls: "pp-hero-setting" });
    const resource = this.plugin.assetResourcePath(this.plugin.settings.heroImage);
    if (resource) {
      const image = preview.createEl("img", { cls: "pp-hero-setting-image" });
      image.src = resource;
      image.alt = "当前仪表盘横幅";
      applyHeroCrop(image, this.plugin.settings.heroCrop);
    }
    el(preview, "span", this.plugin.settings.heroImage || "尚未选择横幅素材", "pp-muted");
  }
  override hide() {
    this.plugin.flushSaveSettings();
    this.plugin.warnMissingFolders();
  }
  /** 配置体检面板：问题摆在最上面，每条带一个能直接点掉的修复动作 */
  renderHealthCheck(container: any) {
    const issues = this.plugin.settingsIssues();
    const box = container.createDiv({ cls: "pp-settings-health" });
    if (!issues.length) {
      el(box, "span", "目录配置正常。", "pp-muted");
      return;
    }
    el(box, "strong", "配置需要处理（" + issues.length + " 项）");
    issues.forEach((issue: any) => {
      const row = box.createDiv({ cls: "pp-settings-health-row" });
      el(row, "span", issue.text, "pp-muted");
      const button = row.createEl("button", { cls: "pp-icon-button" });
      button.setText(issue.fix === "create" ? "创建这些目录" : "恢复默认值");
      button.onclick = async () => {
        if (issue.fix === "create") {
          const { missing } = this.plugin.missingConfiguredFolders();
          for (const folder of missing) await this.plugin.ensureFolder(folder);
          new obsidian.Notice("已创建 " + missing.length + " 个目录。");
        } else {
          issue.keys.forEach((key: FolderSettingKey) => {
            this.plugin.settings[key] = DEFAULTS[key];
          });
          await this.plugin.saveSettings({ quiet: true });
          new obsidian.Notice("已恢复默认值：" + issue.keys.map((key: FolderSettingKey) => DEFAULTS[key]).join("、"));
        }
        this.plugin.lastFolderWarning = null;
        this.plugin.refreshViews();
        this.display();
      };
    });
  }
  override display() {
    const c = this.containerEl;
    c.empty();
    this.renderHealthCheck(c);
    el(c, "h2", "个人规划仪表盘");
    el(c, "p", "构建版本：" + PLUGIN_BUILD, "pp-muted");
    el(
      c,
      "p",
      "数据由 Markdown 和 YAML frontmatter 持有；插件不依赖第三方插件，也不会读取“AI禁止阅读”路径。",
      "pp-muted",
    );
    (
      [
        ["inboxFolder", "00 草稿箱"],
        ["areaFolder", "10 长期领域"],
        ["projectFolder", "20 项目库"],
        ["knowledgeFolder", "30 知识库"],
        ["bookFolder", "图书库"],
        ["assetFolder", "图片素材"],
        ["peopleFolder", "40 人物库"],
        ["taskFolder", "50 日程待办"],
        ["archiveFolder", "90 归档库"],
      ] as [FolderSettingKey, string][]
    ).forEach((item) =>
      new obsidian.Setting(c)
        .setName(item[1])
        .setDesc("相对于当前 vault 根目录的路径")
        .addText((control: any) =>
          control.setValue(this.plugin.settings[item[0]]).onChange(async (value: any) => {
            this.plugin.settings[item[0]] = value.trim().replace(/^\/+|\/+$/g, "");
            this.plugin.scheduleSaveSettings();
          }),
        ),
    );
    new obsidian.Setting(c).setName("默认任务时长").addText((control: any) =>
      control.setValue(String(this.plugin.settings.defaultTaskDuration)).onChange(async (value: any) => {
        this.plugin.settings.defaultTaskDuration = Math.max(1, Number(value) || 30);
        this.plugin.scheduleSaveSettings();
      }),
    );
    new obsidian.Setting(c).setName("时间监控范围").addText((control: any) =>
      control.setValue(String(this.plugin.settings.planningHorizonDays)).onChange(async (value: any) => {
        this.plugin.settings.planningHorizonDays = Math.max(1, Number(value) || 7);
        this.plugin.scheduleSaveSettings();
      }),
    );
    new obsidian.Setting(c)
      .setName("每日可用时间")
      .setDesc("用于时间规划超载判断，单位：分钟")
      .addText((control: any) =>
        control.setValue(String(this.plugin.settings.dailyCapacityMinutes)).onChange(async (value: any) => {
          this.plugin.settings.dailyCapacityMinutes = Math.max(1, Number(value) || 120);
          this.plugin.scheduleSaveSettings();
        }),
      );
    new obsidian.Setting(c)
      .setName("启用规划提醒")
      .setDesc("插件加载后按设定时间检查一次，每天最多提醒一次")
      .addToggle((control: any) =>
        control.setValue(Boolean(this.plugin.settings.remindersEnabled)).onChange(async (value: any) => {
          this.plugin.settings.remindersEnabled = value;
          this.plugin.scheduleSaveSettings();
        }),
      );
    new obsidian.Setting(c)
      .setName("提醒时间")
      .setDesc("24 小时制整点，例如 9 表示每天 09:00 之后检查")
      .addText((control: any) =>
        control.setValue(String(this.plugin.settings.reminderHour)).onChange(async (value: any) => {
          const hour = Number(value);
          this.plugin.settings.reminderHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9;
          this.plugin.scheduleSaveSettings();
        }),
      );
    this.renderHeroSetting(c);
    /* 动效强度：系统级「减少动效」偏好始终优先，这一项只是让不想改系统设置的人也能一键静音。
       先把值写进去再挂 onChange —— 测试桩的 setValue 会触发已注册的 changeHandler，
       顺序反了会在 display() 时白白写一次设置并刷新全部视图。 */
    new obsidian.Setting(c)
      .setName("界面动效")
      .setDesc("控制视图与 Web 面板的动效强度；系统「减少动效」偏好始终优先，两者都会关闭动效。")
      .addDropdown((control: any) =>
        control
          .addOptions({ full: "完整", subtle: "克制", off: "关闭" })
          .setValue(this.plugin.settings.motionIntensity)
          .onChange(async (value: any) => {
            this.plugin.settings.motionIntensity = value;
            await this.plugin.saveSettings({ quiet: true });
            this.plugin.refreshViews();
          }),
      );
    new obsidian.Setting(c)
      .setName("初始化目录结构")
      .setDesc("只创建不存在的目录，不会删除或批量移动文件。")
      .addButton((button: any) =>
        button
          .setButtonText("初始化")
          .setCta()
          .onClick(() => this.plugin.initializeStructure()),
      );
  }
}

/* ============================ 8. 插件主体 ============================ *
 * 生命周期、命令、视图激活、数据采集与状态同步、文件操作（新建 / 编辑 /
 * 归档 / 撤销归档 / 分诊 / 沉淀知识）、规划提醒。
 * ================================================================== */
