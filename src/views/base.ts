/** base：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import * as obsidian from "obsidian";
import { applyMotionLevel, countUp, createMotionContext, motionLevel, trackPointerSpotlight } from "../core/motion";
import type { MotionContext } from "../core/motion";
import { el } from "../core/dom";
import { renderNavigation } from "../core/web";
import type { DashboardHost } from "../host";

export abstract class PlanningView extends obsidian.ItemView {
  /** 由每个子类实现：基类只负责渲染轮次与通用 DOM 片段 */
  abstract refresh(): Promise<void> | void;
  plugin: DashboardHost;
  renderVersion: any;
  /** 每个视图一个动效上下文：数字滚动的快照跟着视图走，刷新时不重滚（见 motion.ts） */
  motionCtx: MotionContext | null;
  /** 本轮 open 是否已经渲染过：Obsidian 打开视图会先 `setState()`（内部 refresh 一次）
   *  再 `onOpen()`（又 refresh 一次）。第二次渲染时容器已非空，会被判定成"数据刷新"
   *  而摘掉 `pp-mo-enter` —— 于是整页入场被吃掉（资源页就是这个形状：见 resources.ts
   *  的 setState → refresh）。所以 onOpen 只在"本轮还没渲染过"时补一次刷新。 */
  renderedThisOpen: boolean;
  constructor(leaf: any, plugin?: any) {
    super(leaf);
    this.plugin = plugin;
    this.renderVersion = 0;
    this.motionCtx = null;
    this.renderedThisOpen = false;
  }
  override async onOpen() {
    /* setState 已经渲染过 → 不再重复渲染（那第二轮会被当成"数据刷新"。
       MOTION.md 铁律 3 只豁免真正的刷新，不豁免"同一次 open 的连续两轮"）。
       顺带消掉打开视图时把 collectData() 跑两遍的浪费。 */
    if (this.renderedThisOpen) {
      this.renderedThisOpen = false;
      return;
    }
    await this.refresh();
  }
  override async onClose() {
    this.renderVersion += 1;
    this.renderedThisOpen = false;
    this.containerEl.empty();
  }
  /** 本轮渲染之前容器是不是空的（= 真正"换页"，只有这时才播整页入场）。
   *  children 可能是 getter，先做能力检测再读长度；判定不了就当作"不是首次"——
   *  宁可不播入场，也不要在每次 vault 刷新时重播动画（铁律 3）。 */
  isFirstBuild(root: any) {
    if (!root) return false;
    let children: any = null;
    try {
      children = root.children;
    } catch (error) {
      return false;
    }
    if (!children || typeof children.length !== "number") return false;
    return children.length === 0;
  }
  /** 当前用户的动效强度（设置里的 motionIntensity，非法值回落 full） */
  motionLevelValue() {
    return motionLevel(this.plugin && this.plugin.settings ? this.plugin.settings.motionIntensity : undefined);
  }
  /** 取本视图的动效上下文；强度变了就重建（快照不需要跨强度保留） */
  motionContext() {
    const level = this.motionLevelValue();
    if (!this.motionCtx || this.motionCtx.level !== level) this.motionCtx = createMotionContext(level);
    return this.motionCtx;
  }
  /** 清空容器、挂载导航，返回本轮版本号与根节点 */
  beginRender(activeNav: any) {
    const version = (this.renderVersion += 1);
    this.renderedThisOpen = true;
    const root = this.containerEl.children[1] || this.containerEl;
    const firstBuild = this.isFirstBuild(root);
    root.empty();
    root.addClass("pp-view-root");
    applyMotionLevel(root, this.motionLevelValue());
    /* 整页入场只在首次建面时挂上：数据刷新（vault 事件、自动刷新）会把类摘掉 ——
       否则改一篇笔记就重放一遍入场动画，那是抖动源（铁律 3）。 */
    if (firstBuild) {
      root.addClass("pp-mo-enter");
      root.addClass("pp-mo-loading");
    } else {
      /* 顺手把骨架类也摘掉：万一上一轮 refresh 抛异常没走到 finishRender，
         这里能兜底，不会让那条滑光一直挂着。 */
      root.removeClass("pp-mo-enter");
      root.removeClass("pp-mo-loading");
    }
    renderNavigation(root, this.plugin, activeNav);
    return { version, root };
  }
  /** 渲染收尾（子类在 DOM 建完后调用，早退路径也要调）：
   *  把强度写到根节点、开启指针光晕委托、摘掉"数据未就绪"的骨架微光。 */
  finishRender(root: any) {
    const level = this.motionLevelValue();
    applyMotionLevel(root, level);
    trackPointerSpotlight(root, level);
    if (root && typeof root.removeClass === "function") root.removeClass("pp-mo-loading");
    return root;
  }
  /** 统计数字滚动：key 必须是稳定的语义键（"projects"/"overdue"…），不能用数组下标 ——
   *  下标在列表增删后会指向另一个数字，快照就错位了。 */
  countUpStat(node: any, key: string, value: number) {
    countUp(this.motionContext(), node, key, value);
  }
  /** 本轮渲染是否已被更新的一轮取代 */
  isStale(version: any) {
    return version !== this.renderVersion;
  }
  button(parent: any, label: any, callback: any, primary?: any) {
    const button = parent.createEl("button", { cls: primary ? "pp-button pp-button-primary" : "pp-button" });
    button.setText(label);
    button.onclick = callback;
    return button;
  }
  panel(parent: any, title: any, description: any) {
    const panel = parent.createDiv({ cls: "pp-panel" });
    const head = panel.createDiv({ cls: "pp-panel-head" });
    const copy = head.createDiv();
    el(copy, "h2", title);
    el(copy, "p", description, "pp-muted");
    panel.body = panel.createDiv({ cls: "pp-panel-body" });
    return panel;
  }
  empty(parent: any, title: any, description: any) {
    const box = parent.createDiv({ cls: "pp-empty" });
    el(box, "strong", title);
    el(box, "span", description, "pp-muted");
  }
  /** 空状态附带一个主操作按钮 */
  emptyWithAction(parent: any, title: any, description: any, label: any, callback: any) {
    const box = parent.createDiv({ cls: "pp-empty" });
    el(box, "strong", title);
    el(box, "span", description, "pp-muted");
    this.button(box, label, callback, true);
  }
}
