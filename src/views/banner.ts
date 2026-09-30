/** banner：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import * as obsidian from "obsidian";
import { collectImageAssetFiles, computeCropStage, loadBannerImage, writeBannerBinary } from "../core/assets";
import { HERO_CROP_RATIO } from "../core/constants";
import { applyMotionLevel, motionLevel } from "../core/motion";
import { el } from "../core/dom";
import type { DashboardHost } from "../host";

export class BannerPickerModal extends obsidian.Modal {
  declare onDone: (...args: any[]) => any;
  plugin: DashboardHost;
  constructor(app: any, plugin: DashboardHost, onDone: any) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }
  override onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    this.contentEl.addClass("pp-asset-picker-modal");
    /* 弹窗每次打开都是新节点：入场动画自然播放，不做退场（铁律 5） */
    applyMotionLevel(this.contentEl, motionLevel(this.plugin.settings.motionIntensity));
    el(this.contentEl, "h2", "选择横幅素材");
    const folder = this.plugin.settings.assetFolder || "图片素材";
    const files = collectImageAssetFiles(this.plugin.app.vault, folder);
    el(
      this.contentEl,
      "p",
      files.length
        ? "扫描目录：" + folder + "（共 " + files.length + " 张；选择后进入 16:5 裁剪）"
        : "扫描目录：" + folder + " 下没有可用图片，请直接从电脑选择。",
      "pp-muted",
    );
    const native = this.contentEl.createDiv({ cls: "pp-native-asset-picker" });
    el(native, "span", "从电脑选择图片", "pp-muted");
    const input = native.createEl("input");
    input.setAttr("type", "file");
    input.setAttr("accept", "image/png,image/jpeg,image/gif,image/webp");
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      this.openCrop({ name: file.name, src: url, revoke: true, blob: file });
    };
    if (!files.length) return;
    const grid = this.contentEl.createDiv({ cls: "pp-asset-picker-grid" });
    files.forEach((file: any) => {
      const card = grid.createEl("button", { cls: "pp-asset-card" });
      card.setAttr("type", "button");
      const image = card.createEl("img", { cls: "pp-asset-card-image" });
      image.src = this.plugin.assetResourcePath(file.path);
      image.alt = file.path;
      image.loading = "lazy";
      el(card, "span", file.path.replace(folder + "/", ""), "pp-asset-card-name");
      card.onclick = () => {
        const src = this.plugin.assetResourcePath(file.path);
        if (src) this.openCrop({ name: file.path, path: file.path, src, revoke: false });
        else new obsidian.Notice("无法读取该图片资源，请使用上方按钮选择本地文件。");
      };
    });
  }
  async openCrop(source: any) {
    try {
      const image = await loadBannerImage(source.src);
      this.close();
      window.setTimeout(() => new BannerCropModal(this.app, this.plugin, image, source, this.onDone).open(), 0);
    } catch (error: any) {
      if (source && source.revoke) URL.revokeObjectURL(source.src);
      new obsidian.Notice("图片加载失败：" + (error.message || error));
    }
  }
  override onClose() {
    this.contentEl.empty();
  }
}

/** 诊断用构建标记：从落盘文件就能判断"用户实际运行的是哪一版 main.js"（前缀 [DIAG-crop]）。 */
const DIAG_BUILD = "crop-diag-2";

/** 把一个值描述成可落盘的短字符串：用来确认"取景框创建之前 this.selection 到底是什么"。 */
function describeValue(value: any) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return (
    Object.prototype.toString.call(value) +
    " · hasStyle=" +
    Boolean(value && value.style) +
    " · hasAppendChild=" +
    (typeof (value && value.appendChild) === "function") +
    " · ctor=" +
    String((value && value.constructor && value.constructor.name) || "?")
  );
}

/** 建一个 div：优先用 Obsidian 的 createDiv，退化到标准 DOM —— 保证一定拿到真元素。
 *  参数用 `{ cls }` 形式：样式覆盖检查工具靠 `cls: "pp-…"` 文本识别用到的类；
 *  写成普通字符串参数会让它少看两个类 —— 门槛还是绿的，但灵敏度悄悄下降了。 */
function createDivIn(parent: any, options: { cls: string }) {
  if (parent && typeof parent.createDiv === "function") return parent.createDiv(options);
  const node = document.createElement("div");
  node.className = options.cls;
  if (parent && typeof parent.appendChild === "function") parent.appendChild(node);
  return node;
}

/** 裁剪框诊断：仅当库里存在 `.ppd-diagnostics/ENABLE` 时才写文件，
 *  把**用户机器上真实生效的 CSS 级联与几何**落成 JSON（排查完整个目录删掉即可）。
 *  写失败一律静默 —— 诊断永远不能影响主流程。 */
function dumpCropDiagnostics(modal: any) {
  try {
    const adapter = modal.app && modal.app.vault && modal.app.vault.adapter;
    if (!adapter || typeof adapter.exists !== "function" || typeof adapter.write !== "function") return;
    /* 注意：不能用点开头的目录 —— Obsidian 的 vault 层会忽略点目录，exists() 永远为 false，
       诊断就会静默失效（这个坑已经踩过一次）。 */
    const dir = "ppd-diagnostics";
    Promise.resolve(adapter.exists(dir + "/ENABLE"))
      .then((enabled: any) => {
        if (!enabled) return;
        const doc =
          (modal.selection && modal.selection.ownerDocument) || (typeof document !== "undefined" ? document : null);
        const view = doc && doc.defaultView ? doc.defaultView : null;
        const rect = (node: any) => {
          if (!node || typeof node.getBoundingClientRect !== "function") return null;
          const r = node.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        };
        const css = (node: any) => {
          if (!node || !view) return null;
          const s = view.getComputedStyle(node);
          return {
            border: s.borderTopWidth + " " + s.borderTopStyle + " " + s.borderTopColor,
            background: s.backgroundColor,
            boxShadow: s.boxShadow,
            position: s.position,
            zIndex: s.zIndex,
            display: s.display,
            visibility: s.visibility,
            opacity: s.opacity,
            width: s.width,
            height: s.height,
            minWidth: s.minWidth,
            minHeight: s.minHeight,
          };
        };
        /* 真实级联：列出所有能匹配取景框的规则（含来自主题 / 其它插件 / 片段的） */
        const matched: any[] = [];
        const target = modal.selection;
        if (target && doc && doc.styleSheets) {
          for (const sheet of Array.from(doc.styleSheets) as any[]) {
            let rules: any[] = [];
            try {
              rules = Array.from(sheet.cssRules || []);
            } catch (error) {
              matched.push({ sheet: sheet.href || "(inline)", note: "cssRules 不可读（跨域）" });
              continue;
            }
            for (const rule of rules) {
              const sel = rule && rule.selectorText;
              if (!sel) continue;
              let hit = false;
              try {
                hit = target.matches(sel);
              } catch (error) {
                continue;
              }
              if (hit && /crop|modal|selection|handle/i.test(sel)) {
                matched.push({
                  sheet: sheet.href || "(inline)",
                  sel,
                  style: String(rule.style && rule.style.cssText).slice(0, 220),
                });
              }
            }
          }
        }
        const body = doc && doc.body;
        const payload = {
          build: DIAG_BUILD,
          at: new Date().toISOString(),
          bodyClass: body ? body.className : "(无)",
          accent: view && body ? view.getComputedStyle(body).getPropertyValue("--interactive-accent").trim() : "",
          dpr: view ? view.devicePixelRatio : null,
          viewport: view ? { w: view.innerWidth, h: view.innerHeight } : null,
          modalEl: rect(modal.modalEl || modal.containerEl),
          contentEl: rect(modal.contentEl),
          stage: rect(modal.stage),
          stageInline: modal.stage ? modal.stage.getAttribute("style") : null,
          stageCss: css(modal.stage),
          selectionRect: rect(target),
          selectionInline: target ? target.getAttribute("style") : null,
          selectionCss: css(target),
          /* 关键诊断：创建取景框**之前** this.selection 到底是什么 —— 用来确认
             "它是真值但不是元素"这个根因；initError 记录初始化异常（含堆栈首段）。 */
          selectionBeforeCreate: modal.diagBeforeSelection || "(未记录)",
          initError: modal.diagError || null,
          handleCount: target && target.querySelectorAll ? target.querySelectorAll(".pp-crop-handle").length : 0,
          crop: modal.crop || null,
          display: modal.display || null,
          displayIsFallback: modal.displayIsFallback === true,
          imageNatural: { w: modal.image && modal.image.naturalWidth, h: modal.image && modal.image.naturalHeight },
          previewNatural: {
            w: modal.preview && modal.preview.naturalWidth,
            h: modal.preview && modal.preview.naturalHeight,
          },
          matchedRules: matched.slice(0, 40),
        };
        return adapter.write(dir + "/crop-" + Date.now() + ".json", JSON.stringify(payload, null, 2));
      })
      .catch(() => {});
  } catch (error: any) {
    /* [DIAG-crop] 诊断失败不影响裁剪 */
  }
}

/** 图片尺寸还拿不到时的退化舞台：按 16:5 尽量占满可用空间。
 *  有了它，"打开裁剪窗口却看不到取景框"不会再发生 —— 框先出现，图片就绪后再换成真实比例。 */
function fallbackCropStage(bounds: any) {
  const width = Math.max(
    240,
    Math.min(Number(bounds && bounds.width) || 480, (Number(bounds && bounds.height) || 300) * HERO_CROP_RATIO),
  );
  return { w: Math.round(width), h: Math.round(width / HERO_CROP_RATIO) };
}

export class BannerCropModal extends obsidian.Modal {
  closed: any;
  confirmButton: any;
  crop: any;
  display: any;
  /** 当前舞台是否"尺寸未知时的退化舞台"（16:5 占位）；尺寸就绪后要按真实比例重排 */
  displayIsFallback: any;
  drag: any;
  image: any;
  mouseMoveHandler: any;
  mouseUpHandler: any;
  moveHandler: any;
  declare onDone: (...args: any[]) => any;
  plugin: DashboardHost;
  preview: any;
  relayoutScheduled: any;
  selection: any;
  /** [DIAG-crop] 创建取景框之前 this.selection 的样子（诊断落盘用，确认它为什么不是元素） */
  diagBeforeSelection: any;
  /** [DIAG-crop] 初始化过程中的异常（诊断落盘用） */
  diagError: any;
  source: any;
  stage: any;
  upHandler: any;
  constructor(app: any, plugin: DashboardHost, image: any, source: any, onDone: any) {
    super(app);
    this.plugin = plugin;
    this.image = image;
    this.source = source;
    this.onDone = onDone;
    this.crop = null;
    this.drag = null;
    this.moveHandler = (event: any) => this.onPointerMove(event);
    this.upHandler = (event: any) => this.onPointerUp(event);
    this.mouseMoveHandler = (event: any) => this.onMouseMove(event);
    this.mouseUpHandler = () => this.onMouseUp();
  }
  override onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    this.contentEl.addClass("pp-crop-modal");
    applyMotionLevel(this.contentEl, motionLevel(this.plugin.settings.motionIntensity));
    el(this.contentEl, "h2", "裁剪横幅（16:5）");
    el(
      this.contentEl,
      "p",
      "拖动取景框移动范围，拖动四角调整大小；框内区域就是最终横幅。原始素材不会被修改。",
      "pp-muted",
    );
    this.stage = this.contentEl.createDiv({ cls: "pp-crop-stage" });
    this.preview = this.stage.createEl("img", { cls: "pp-crop-image" });
    this.preview.alt = "";
    /* 预览图就绪后按它的真实尺寸重排：慢加载 / SVG 无内在尺寸时，
       打开弹窗那一刻还拿不到尺寸，只有这一步能把"退化舞台"换成真实比例。 */
    this.preview.onload = () => {
      if (!this.closed) this.layoutStage();
    };
    this.preview.onerror = () => new obsidian.Notice("预览图加载失败，仍可按 16:5 调整取景范围。");
    this.preview.src = (this.image && (this.image.currentSrc || this.image.src)) || "";
    const actions = this.contentEl.createDiv({ cls: "pp-modal-actions" });
    const cancel = actions.createEl("button", { cls: "pp-button" });
    cancel.setText("取消");
    cancel.onclick = () => this.close();
    this.confirmButton = actions.createEl("button", { cls: "pp-button pp-button-primary" });
    this.confirmButton.setText("确认并应用");
    this.confirmButton.onclick = () => void this.confirmCrop(this.confirmButton);
    this.diagBeforeSelection = describeValue(this.selection);
    this.createSelection();
    try {
      this.setupCrop();
    } catch (error: any) {
      /* 初始化布局失败也要让用户看得见框、并且知道出了什么问题，而不是"打开只有图" */
      console.error("[personal-planning-dashboard] 裁剪界面初始化失败", error);
      new obsidian.Notice("裁剪界面初始化异常：" + ((error && error.message) || error));
      this.diagError = {
        message: String((error && error.message) || error),
        stack: String((error && error.stack) || "").slice(0, 1200),
      };
    }
    this.scheduleRelayout();
    /* [DIAG-crop] 落盘一次诊断（仅当 ppd-diagnostics/ENABLE 存在），异常路径也写 */
    window.setTimeout(() => dumpCropDiagnostics(this), 120);
    window.setTimeout(() => dumpCropDiagnostics(this), 900);
  }
  /** 可用空间：视口、弹窗实测宽度与内容宽度里取最小值，保证舞台一定放得进可视区 */
  measureStageBounds() {
    const viewportWidth = Number(window.innerWidth) || 1024;
    const viewportHeight = Number(window.innerHeight) || 768;
    const modalWidth = Number(
      (this.modalEl && this.modalEl.clientWidth) || (this.containerEl && this.containerEl.clientWidth) || 0,
    );
    const contentWidth = Number((this.contentEl && this.contentEl.clientWidth) || 0);
    const available = Math.min(viewportWidth - 96, 880, modalWidth ? modalWidth - 56 : 880, contentWidth || 880);
    return { width: Math.max(280, available), height: Math.max(150, Math.min(viewportHeight - 300, 520)) };
  }
  layoutStage() {
    const bounds = this.measureStageBounds();
    /* 尺寸可能来自"已解码的那张图"，也可能来自弹窗里新建的预览图；
       SVG 没有内在尺寸、图片还没解码完、图坏了 —— 这几种情况两者都会是 0。 */
    const naturalWidth =
      Number(this.image && this.image.naturalWidth) || Number(this.preview && this.preview.naturalWidth) || 0;
    const naturalHeight =
      Number(this.image && this.image.naturalHeight) || Number(this.preview && this.preview.naturalHeight) || 0;
    const known = naturalWidth > 0 && naturalHeight > 0;
    const wasFallback = this.displayIsFallback === true;
    /* 旧实现在这里 `if (!naturalWidth || !naturalHeight) return null;` ——
       crop 一直是 null，取景框拿不到宽高就"看不见"，用户只会看到图、没有可拖的框。
       现在退回一个 16:5 的退化舞台：框一定出现，等尺寸就绪再按真实比例重排。 */
    this.display = known
      ? computeCropStage(naturalWidth, naturalHeight, bounds.width, bounds.height)
      : fallbackCropStage(bounds);
    this.displayIsFallback = !known;
    if (this.stage) {
      this.stage.style.width = this.display.w + "px";
      this.stage.style.height = this.display.h + "px";
    }
    if (this.preview) {
      this.preview.style.width = this.display.w + "px";
      this.preview.style.height = this.display.h + "px";
    }
    /* 首次布局、或从退化舞台切到真实比例时都要重新居中；其余情况保留用户已拖好的取景框 */
    if (!this.crop || wasFallback) this.resetCrop();
    else this.clampCrop();
    this.renderCrop();
    return this.display;
  }
  /** 弹窗刚打开时 clientWidth 可能为 0，下一帧用实测尺寸再算一次 */
  scheduleRelayout() {
    if (this.relayoutScheduled) return;
    this.relayoutScheduled = true;
    const run = () => {
      this.relayoutScheduled = false;
      if (!this.closed) this.layoutStage();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  }
  createSelection() {
    /* 只有"真的是元素"才复用。曾经出现过 this.selection 是个非元素的真值：
       于是这里直接提前返回、什么都没创建，renderCrop() 再对它设 left 就抛
       "Cannot set properties of undefined (setting 'left')" —— 界面上就是"只有图片、没有框"。 */
    if (this.selection && this.selection.style && typeof this.selection.appendChild === "function") {
      return this.selection;
    }
    this.selection = createDivIn(this.stage, { cls: "pp-crop-selection" });
    if (!this.selection || !this.selection.style) {
      throw new Error("无法创建取景框元素");
    }
    /* 先给一个兜底的可见尺寸：万一后面的布局步骤出意外（或舞台尺寸异常），
       取景框也不会变成一个"没有宽高、看不见"的空 div。布局成功会立刻覆盖它。 */
    this.selection.style.left = "10%";
    this.selection.style.top = "30%";
    this.selection.style.width = "80%";
    this.selection.style.height = "40%";
    ["nw", "ne", "sw", "se"].forEach((edge: any) => {
      const handle = createDivIn(this.selection, { cls: "pp-crop-handle pp-crop-handle-" + edge });
      if (handle && handle.dataset) handle.dataset.edge = edge;
    });
    this.selection.addEventListener("pointerdown", (event: any) => this.onPointerDown(event));
    this.selection.addEventListener("pointermove", (event: any) => this.onPointerMove(event));
    this.selection.addEventListener("pointerup", (event: any) => this.onPointerUp(event));
    this.selection.onmousedown = (event: any) => this.onMouseDown(event);
    return this.selection;
  }
  resetCrop() {
    const display = this.display || { w: 480, h: 150 };
    const width = Math.min(display.w, display.h * HERO_CROP_RATIO);
    const height = width / HERO_CROP_RATIO;
    this.crop = {
      x: Math.max(0, (display.w - width) / 2),
      y: Math.max(0, (display.h - height) / 2),
      w: width,
      h: height,
    };
    return this.crop;
  }
  clampCrop() {
    if (!this.crop || !this.display) return null;
    const width = Math.max(
      Math.min(120, this.display.w),
      Math.min(this.crop.w, this.display.w, this.display.h * HERO_CROP_RATIO),
    );
    const height = width / HERO_CROP_RATIO;
    this.crop = {
      x: Math.max(0, Math.min(this.display.w - width, this.crop.x)),
      y: Math.max(0, Math.min(this.display.h - height, this.crop.y)),
      w: width,
      h: height,
    };
    return this.crop;
  }
  setupCrop() {
    this.layoutStage();
  }
  renderCrop() {
    if (!this.crop || !this.selection) return;
    const crop = this.crop;
    this.selection.style.left = crop.x + "px";
    this.selection.style.top = crop.y + "px";
    this.selection.style.width = crop.w + "px";
    this.selection.style.height = crop.h + "px";
  }
  beginDrag(clientX: any, clientY: any, target: any, pointerId: any) {
    if (this.drag) return;
    const dataset = target && target.dataset ? target.dataset : {};
    this.drag = {
      mode: dataset.edge || "move",
      pointerId,
      startX: clientX,
      startY: clientY,
      crop: Object.assign({}, this.crop),
    };
    return this.drag;
  }
  onPointerDown(event: any) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    if (!this.crop) return;
    const drag = this.beginDrag(event.clientX, event.clientY, event.target || this.selection, event.pointerId);
    if (drag && this.selection.setPointerCapture && event.pointerId !== undefined) {
      try {
        this.selection.setPointerCapture(event.pointerId);
      } catch (error: any) {
        /* pointer capture 不可用时忽略 */
      }
    }
  }
  onMouseDown(event: any) {
    if (!this.crop || this.drag) return;
    const drag = this.beginDrag(event.clientX, event.clientY, event.target || this.selection, undefined);
    if (!drag) return;
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    window.addEventListener("mousemove", this.mouseMoveHandler);
    window.addEventListener("mouseup", this.mouseUpHandler);
  }
  onPointerMove(event: any) {
    if (!this.drag || (this.drag.pointerId !== undefined && event.pointerId !== this.drag.pointerId)) return;
    this.applyDrag(event.clientX, event.clientY);
  }
  onMouseMove(event: any) {
    if (!this.drag || this.drag.pointerId !== undefined) return;
    this.applyDrag(event.clientX, event.clientY);
  }
  applyDrag(clientX: any, clientY: any) {
    if (!this.drag || !this.crop) return;
    const dx = clientX - this.drag.startX;
    const dy = clientY - this.drag.startY;
    const start = this.drag.crop;
    const bounds = this.display;
    const minWidth = Math.min(120, bounds.w);
    let next = Object.assign({}, start);
    if (this.drag.mode === "move") {
      next.x = Math.max(0, Math.min(bounds.w - start.w, start.x + dx));
      next.y = Math.max(0, Math.min(bounds.h - start.h, start.y + dy));
    } else {
      const horizontal = this.drag.mode.includes("e") ? start.w + dx : start.w - dx;
      const maxWidth = Math.min(bounds.w, bounds.h * HERO_CROP_RATIO);
      const width = Math.max(minWidth, Math.min(maxWidth, horizontal));
      const height = width / HERO_CROP_RATIO;
      if (this.drag.mode.includes("w")) next.x = start.x + start.w - width;
      if (this.drag.mode.includes("n")) next.y = start.y + start.h - height;
      next.w = width;
      next.h = height;
      next.x = Math.max(0, Math.min(bounds.w - width, next.x));
      next.y = Math.max(0, Math.min(bounds.h - height, next.y));
    }
    this.crop = next;
    this.renderCrop();
  }
  endDrag() {
    if (this.selection && this.selection.releasePointerCapture && this.drag && this.drag.pointerId !== undefined) {
      try {
        this.selection.releasePointerCapture(this.drag.pointerId);
      } catch (error: any) {
        /* pointer may already be released */
      }
    }
    this.drag = null;
    window.removeEventListener("mousemove", this.mouseMoveHandler);
    window.removeEventListener("mouseup", this.mouseUpHandler);
  }
  onPointerUp(_event?: any) {
    this.endDrag();
  }
  onMouseUp(_event?: any) {
    this.endDrag();
  }
  /** 归一化取景框（0-1）；渲染端用它算背景焦点，因此与窗口尺寸无关 */
  normalizedCrop() {
    /* 退化舞台（图片尺寸未知）不能算归一化取景：分母是猜的，算出来的比例会污染设置。
       取景框照样显示、照样能拖（用户不会再看到"没有框"），但确认时必须要求真实尺寸。 */
    if (this.displayIsFallback) return null;
    if (!this.crop || !this.display) return null;
    const clamp = (value: any) => Math.max(0, Math.min(1, value));
    return {
      x: clamp(this.crop.x / this.display.w),
      y: clamp(this.crop.y / this.display.h),
      w: clamp(this.crop.w / this.display.w),
      h: clamp(this.crop.h / this.display.h),
    };
  }
  async confirmCrop(button: any) {
    const crop = this.normalizedCrop();
    if (!crop) {
      new obsidian.Notice("无法计算取景范围，请重新选择图片。");
      return;
    }
    if (button && typeof button.setDisabled === "function") button.setDisabled(true);
    try {
      let heroPath = "";
      if (this.source && this.source.path) {
        heroPath = this.source.path;
      } else {
        const blob = this.source && this.source.blob;
        if (!blob || typeof blob.arrayBuffer !== "function") throw new Error("没有可写入的图片数据，请重新选择图片。");
        const folder = this.plugin.settings.assetFolder || "图片素材";
        const buffer = await blob.arrayBuffer();
        heroPath = await this.plugin.uniqueBinaryPath(folder, (this.source && this.source.name) || "banner");
        await writeBannerBinary(this.plugin.app.vault, heroPath, buffer);
      }
      this.plugin.settings.heroImage = heroPath;
      this.plugin.settings.heroCrop = crop;
      await this.plugin.saveSettings();
      /* 关键：把**已经打开的视图**也刷新一遍。
         裁剪只改插件设置、不改任何笔记，所以 vault / metadataCache 事件不会触发，
         不主动刷新的话仪表盘视图会一直停在上一次的横幅（用户报的"还是裁剪之前的内容"）。 */
      if (typeof this.plugin.refreshViews === "function") this.plugin.refreshViews();
      new obsidian.Notice(
        this.source && this.source.path ? "横幅取景已应用。" : "已导入 " + heroPath + " 并应用横幅取景。",
      );
      if (this.onDone) this.onDone();
      this.close();
    } catch (error: any) {
      if (button && typeof button.setDisabled === "function") button.setDisabled(false);
      new obsidian.Notice("应用失败：" + (error.message || error));
    }
  }
  override onClose() {
    this.endDrag();
    this.closed = true;
    if (this.source && this.source.revoke) URL.revokeObjectURL(this.source.src);
    if (this.contentEl) this.contentEl.empty();
  }
}

/* ============================ 7. 设置页 ============================ */
/* 全部设置项都走 Obsidian 原生设置面板，不额外引入插件自绘外观。 */
