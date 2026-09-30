/** web-app：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import * as obsidian from "obsidian";
import { APP_VIEW } from "../core/constants";
import { applyMotionLevel, motionLevel } from "../core/motion";
import { el } from "../core/dom";
import { WEB_SHELL_HTML, shadowScopedCss } from "../core/web";
import type { DashboardHost } from "../host";

/** sync-app.mjs 注入到 main.js 末尾的脚本级常量：模块代码与它在同一文件作用域 */
declare const PP_WEB_CSS: string;

export class WebAppView extends obsidian.ItemView {
  mounted: any;
  plugin: DashboardHost;
  refreshToken: any;
  shadow: any;
  shell: any;
  constructor(leaf: any, plugin: DashboardHost) {
    super(leaf);
    this.plugin = plugin;
    this.shell = null;
    this.shadow = null;
    this.mounted = null;
    this.refreshToken = 0;
  }
  getViewType() {
    return APP_VIEW;
  }
  getDisplayText() {
    return "仪表盘（Web 版）";
  }
  override getIcon() {
    return "layout-dashboard";
  }
  /** 渲染层是单例（app.js 的 state 与监听都是模块级）：先渲染成功的那个窗格是「拥有者」。
   *  只有后来者显示提示 —— 用「有没有别的 leaf」判断会让正在工作的窗格在每次 vault 事件后被自己清空。 */
  hasOwner() {
    const owner = this.plugin.appOwner;
    return Boolean(owner) && owner !== this;
  }
  showSingleInstanceNotice() {
    this.contentEl.empty();
    el(
      this.contentEl,
      "p",
      "「仪表盘（Web 版）」是单实例视图：渲染层状态是共享的，它已经在另一个窗格中打开。请使用那个窗格，或先关闭它再在这里打开。",
      "pp-muted",
    );
  }
  /** 渲染层不可用时的错误页：给一条真实可走的退路，而不是让用户对着一段报错发呆 */
  showError(message: any) {
    this.unmount();
    this.contentEl.empty();
    const box = this.contentEl.createDiv({ cls: "pp-view-root" });
    box.style.padding = "24px";
    el(box, "p", message, "pp-muted");
    const action = box.createEl("button", { cls: "pp-button" });
    action.setText("改用经典视图（排错用）");
    action.onclick = () => this.plugin.activateDashboard();
    return box;
  }
  override async onOpen() {
    if (this.hasOwner()) return this.showSingleInstanceNotice();
    await this.refresh();
  }
  override async onClose() {
    const wasOwner = this.plugin.appOwner === this;
    if (wasOwner) {
      /* 让出拥有权，并把还开着的另一个窗格接管过来（否则它会永远停在提示页上） */
      this.plugin.appOwner = null;
      const other = this.app.workspace
        .getLeavesOfType(APP_VIEW)
        .map((leaf: any) => leaf.view)
        .find((view: any) => view && view !== this && typeof (view as any).refresh === "function");
      this.unmount();
      if (other && (other as any).hasOwner && !(other as any).hasOwner()) void (other as any).refresh();
      this.containerEl.empty();
      return;
    }
    this.unmount();
    this.containerEl.empty();
  }
  /** 解除渲染层的监听，避免视图关闭后仍向已卸载的 DOM 写入 */
  unmount() {
    this.refreshToken = (this.refreshToken || 0) + 1;
    if (this.mounted && typeof this.mounted.unmount === "function") {
      try {
        this.mounted.unmount();
      } catch (error: any) {
        /* 清理失败不应阻塞关闭 */
      }
    }
    this.mounted = null;
    this.shadow = null;
    this.shell = null;
  }
  /** 建立与 web/index.html 同构的外壳，并把设计系统注入 Shadow DOM */
  buildShell() {
    this.contentEl.empty();
    /* .view-content 是 flex 子项：给宿主一条确定高度，Shadow 里的 overflow:auto 才能滚动 */
    this.contentEl.style.padding = "0";
    this.contentEl.style.overflow = "hidden";
    this.contentEl.style.height = "100%";
    this.contentEl.style.minHeight = "0";
    /* 操作栏放在 Shadow DOM 之外，直接使用插件自己的夜航极光令牌；
       .pp-view-root 负责提供令牌作用域，padding/max-width 由内联样式还原成满屏。 */
    const wrap = this.contentEl.createDiv({ cls: "pp-view-root" });
    wrap.style.padding = "0";
    wrap.style.margin = "0";
    wrap.style.maxWidth = "none";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.height = "100%";
    wrap.style.minHeight = "0";
    /* 操作栏这一层是原生 DOM：同样受 motionIntensity 管辖（Web 面板内部的 .app 由渲染层写 data-motion） */
    applyMotionLevel(wrap, motionLevel(this.plugin.settings.motionIntensity));
    const toolbar = wrap.createDiv({ cls: "pp-web-toolbar" });
    [
      ["新建项目", () => this.plugin.newProject(), true],
      ["新建任务", () => this.plugin.newTask()],
      ["处理草稿箱", () => this.plugin.triageInbox()],
      ["刷新", () => this.refresh()],
    ].forEach((entry: any) => {
      const button = toolbar.createEl("button", {
        cls: entry[2] ? "pp-web-toolbar-button pp-web-toolbar-primary" : "pp-web-toolbar-button",
      });
      button.setText(entry[0]);
      button.onclick = entry[1];
    });
    const shell = wrap.createDiv({ cls: "pp-web-host" });
    shell.style.flex = "1 1 auto";
    shell.style.minHeight = "0";
    this.shell = shell;
    const shadow = shell.attachShadow ? shell.attachShadow({ mode: "open" }) : shell;
    this.shadow = shadow;
    const style = document.createElement("style");
    style.textContent = shadowScopedCss(PP_WEB_CSS);
    shadow.appendChild(style);
    const root = document.createElement("div");
    root.innerHTML = WEB_SHELL_HTML;
    shadow.appendChild(root);
    this.applyTheme();
  }
  /** 跟随 Obsidian 的深浅色：web/styles.css 里两套令牌分别挂在 .theme-dark / .theme-light 上。
   *  必须两个类都切换 —— 只摘掉 .theme-dark 会落回"恒定深色"的默认值。 */
  applyTheme() {
    if (!this.shell || !this.shell.classList) return;
    const body = document.body;
    const dark = Boolean(body && body.classList && body.classList.contains("theme-dark"));
    if (dark) {
      this.shell.classList.add("theme-dark");
      this.shell.classList.remove("theme-light");
    } else {
      this.shell.classList.remove("theme-dark");
      this.shell.classList.add("theme-light");
    }
  }
  /** 每次刷新都重新采集 Vault 数据；渲染层只读取，不写盘 */
  async refresh() {
    const token = (this.refreshToken = (this.refreshToken || 0) + 1);
    /* refresh() 会被 vault 事件广播触发，这里不能做单实例判断：正在工作的窗格必须照常渲染。
       只有明确不是拥有者（别人正在渲染）时才让开。 */
    if (this.hasOwner()) return;
    /* 宿主被摘掉过（错误分支、或 Obsidian 挪动过 leaf）就重建外壳；
       注意只在 isConnected === false 时重建，测试桩没有这个属性，不能因此每轮重建。 */
    const detached = this.shell && this.shell.isConnected === false;
    if (!this.shell || !this.shadow || detached) {
      this.mounted = null;
      this.buildShell();
    }
    this.applyTheme();
    const api = this.plugin.webAppApi();
    if (!api) {
      const reason = this.plugin.webAppError ? "（原因：" + this.plugin.webAppError + "）" : "";
      /* 用户看到的必须是「他能做的事」：跑 node / 重新生成区块是开发者的活，
         作者本机的目录结构也不该印到用户界面上（这条路径不写 console.error，
         否则每一轮 vault 刷新都会重复记一次同样的日志）。 */
      return this.showError(
        "仪表盘界面没能加载：插件文件可能不完整（main.js 里缺少渲染层区块），建议重新安装这个插件。" + reason,
      );
    }
    let data;
    try {
      data = await this.plugin.collectWebPayload();
    } catch (error: any) {
      console.error("[personal-planning-dashboard] Web 渲染层数据采集失败", error);
      /* 必须连 mounted/shadow 一起清掉：否则后面即使采集成功也只会往已经被摘掉的宿主里 setData，
         错误页就永远留在界面上了。 */
      return this.showError("读取 Vault 失败：" + ((error && error.message) || error));
    }
    /* 采集期间可能又刷新过、或视图已关闭：本轮结果作废，避免旧数据覆盖新数据 */
    if (token !== this.refreshToken || !this.shadow) return;
    this.plugin.appOwner = this;
    if (this.mounted && typeof this.mounted.setData === "function") {
      /* mount() 会绑定事件监听，重复调用会累积；后续刷新只投喂新数据 */
      this.mounted.setData(data);
      return;
    }
    this.mounted = api.mount({
      data,
      host: {
        root: this.shadow,
        listeners: this.shadow,
        activeElement: () => this.shadow.activeElement || null,
        getHash: () => "",
        setHash: () => {},
        onHashChange: () => {},
        offHashChange: () => {},
        openNote: (target: any) => this.plugin.openPath(target),
        copyText: (value: any) => this.plugin.copyToClipboard(value),
        perform: (action: any, target: any, extra: any) => {
          Promise.resolve(this.plugin.webPerform(action, target, extra)).catch((error: any) => {
            console.error("[personal-planning-dashboard] Web 操作失败", error);
            new obsidian.Notice("操作失败：" + ((error && error.message) || error));
          });
        },
        storage: { getItem: () => null, setItem: () => {} },
        sources: () => ({ vault: null, sample: null }),
        /* 动效强度交给渲染层：它据此在 Shadow DOM 内的 #pp-app 上写 data-motion（MOTION.md 第 3 节） */
        motionLevel: motionLevel(this.plugin.settings.motionIntensity),
      },
    });
  }
}

/* ========================= 6. 横幅选择与裁剪 ========================= *
 * 先解码图片再打开裁剪窗口；裁剪框保持 16:5，确认后才应用取景，
 * 原始素材永不被修改。
 * ================================================================== */
