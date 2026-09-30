/**
 * 原生视图/弹窗的**运行时**动效（JS 面），契约见 MOTION.md 第 5 节。
 *
 * 为什么只有这几个动效归 JS、其余一律归 CSS
 * ---------------------------------------------------------------------
 * 归 CSS 的（整页/列表交错入场、统计卡与导航卡弹入、进度条生长、横幅漂移、状态呼吸、
 * 行悬停强调条、按钮按压、勾选回弹、页签下划线、蚁行线、骨架微光、数值闪烁）：
 * 它们完全由「元素的静态状态」决定 —— `@keyframes` 的终点就是元素本来的样子，
 * 静态声明 + 动画就能表达，不依赖任何跨渲染的状态。铁律 1 要求"动画不执行时界面完整可见"，
 * 而 CSS 动画天然满足这一点；把这类动效搬进 JS 只会引入时序、竞态和"每次重绘都重播"的抖动。
 *
 * 归 JS 的只有两类，它们**必须记住上一轮的值**或**跟随指针**：
 *   1. `countUp` —— 补间的起点取决于上一轮的数值（值没变就不该重滚），这是跨渲染状态，CSS 表达不了；
 *   2. `trackPointerSpotlight` —— 只把指针坐标写进 `--pp-mx/--pp-my`，光晕本身仍由 CSS 的
 *      radial-gradient 画；JS 只做一次事件委托，不逐帧操作样式。
 * 两条路径都先问过 `motionIntensity` 与 `prefers-reduced-motion`：命中"关闭"时直接写终值 /
 * 不挂监听，界面保持静态可见（铁律 4、6）。
 *
 * 环境约束：Obsidian 之外还有 Node 测试桩 —— 没有 `matchMedia` / `requestAnimationFrame` /
 * `style.setProperty`，`document` 也是很薄的桩。这里所有能力都先 `typeof` 检测，任何一条不满足
 * 就退化成静态路径，绝不抛异常。本文件不 import obsidian，可在 Node 下直接跑。
 */
import type { MotionLevel } from "./constants";

/** 数字滚动的补间时长。这里必须写死：CSP 的桩里没有 getComputedStyle，读不到 CSS 令牌。 */
const COUNT_UP_MS = 520;

/** 数值跳变的钩子类名。样式在 styles.css（`.ppd-flash`），JS 只负责挂/摘。 */
const FLASH_CLASS = "ppd-flash";

/** 最近一次由视图/弹窗写入的强度。弹窗构造函数只拿到 `app`、拿不到 plugin，
 *  于是用它回落到同一份用户设置（`applyMotionLevel` 每次都会刷新这个值）。 */
let lastAppliedLevel: MotionLevel = "full";

/** 读设置里的强度，非法值一律回落 "full"（与 normalizeSettings 同口径）。 */
export function motionLevel(value: unknown): MotionLevel {
  if (value === "subtle") return "subtle";
  if (value === "off") return "off";
  return "full";
}

/** 当前生效的强度（供拿不到 plugin 的弹窗使用）。 */
export function currentMotionLevel(): MotionLevel {
  return lastAppliedLevel;
}

/** 是否处于「减少动效」环境：没有 matchMedia 的运行环境（测试桩、旧宿主）返回 false。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window) return false;
  const win: any = window;
  if (typeof win.matchMedia !== "function") return false;
  try {
    return Boolean(win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (error) {
    return false;
  }
}

/** 是否允许播 JS 驱动的动效（count-up / spotlight）。
 *  这里只管"用户/系统偏好"这一层；具体能力（有没有 rAF、有没有 getBoundingClientRect）
 *  由各函数自己检测并降级 —— 语义更清晰：偏好允许 ≠ 环境支持。 */
export function jsMotionEnabled(level: MotionLevel): boolean {
  if (motionLevel(level) === "off") return false;
  return !prefersReducedMotion();
}

/** 把强度写到元素上（data 属性；缺失或 full 都表示全部动效开启）。 */
export function applyMotionLevel(node: any, level: MotionLevel): void {
  if (!node) return;
  const normalized = motionLevel(level);
  lastAppliedLevel = normalized;
  if (typeof node.setAttr === "function") node.setAttr("data-pp-motion", normalized);
  else if (typeof node.setAttribute === "function") node.setAttribute("data-pp-motion", normalized);
  else if (node.dataset) node.dataset.ppMotion = normalized;
}

/** 安全设置 CSS 变量：`style.setProperty` 不存在时退回直接赋值（测试桩的 style 是普通对象）。 */
export function setCssVar(node: any, name: string, value: string): void {
  if (!node) return;
  const style = node.style;
  if (!style) return;
  if (typeof style.setProperty === "function") style.setProperty(name, value);
  else style[name] = value;
}

export interface MotionContext {
  level: MotionLevel;
  snapshot: Record<string, number>;
}

/** 每个视图一个上下文：快照跟着视图实例走，刷新（vault 事件 / 自动刷新）才不会把数字重滚一遍。 */
export function createMotionContext(level: MotionLevel): MotionContext {
  return { level: motionLevel(level), snapshot: {} };
}

/** 取 rAF：**不能裸调 `requestAnimationFrame`** —— 测试用模块包跑在 Node realm，
 *  全局上没有它（只有 harness 的 vm context 上有），裸调会 ReferenceError。 */
function requestFrame(): ((callback: (timestamp?: number) => void) => any) | null {
  if (typeof window === "undefined" || !window) return null;
  const win: any = window;
  if (typeof win.requestAnimationFrame !== "function") return null;
  return (callback: (timestamp?: number) => void) => win.requestAnimationFrame(callback);
}

function writeText(node: any, value: number): void {
  const text = String(value);
  if (typeof node.setText === "function") node.setText(text);
  else node.textContent = text;
}

function addClass(node: any, token: string): void {
  if (!node) return;
  if (typeof node.addClass === "function") node.addClass(token);
  else if (node.classList && typeof node.classList.add === "function") node.classList.add(token);
  else if (node.dataset) node.dataset.ppFlash = "1";
}

function removeClass(node: any, token: string): void {
  if (!node) return;
  if (typeof node.removeClass === "function") node.removeClass(token);
  else if (node.classList && typeof node.classList.remove === "function") node.classList.remove(token);
}

/** 值变了才闪一下：先摘类、下一帧再挂上（动画只有"重新挂上"才会重播）。
 *  刻意不用 setTimeout —— 动效不该在测试与长会话里留下孤儿定时器，而 rAF 缺失时
 *  直接挂在身上也不会报错（没有渲染的环境里动画本来就不可见）。 */
function flash(node: any): void {
  removeClass(node, FLASH_CLASS);
  const frame = requestFrame();
  if (frame) frame(() => addClass(node, FLASH_CLASS));
  else addClass(node, FLASH_CLASS);
}

/**
 * 数字滚动：把 node 的文本从「上一次 key 的值」补间到 value。
 *  · 首次（无快照）从 0 滚到 value；
 *  · 值没变 → 不做任何事（避免每次 vault 刷新都重滚）；
 *  · 不允许 JS 动效 / 没有 rAF → 直接写成终值（界面静态可见）；
 *  · 补间用 rAF 的时间戳参数，不用 performance.now()（测试桩没有）。
 */
export function countUp(ctx: MotionContext, node: any, key: string, value: number): void {
  if (!node) return;
  const target = Math.round(Number(value) || 0);
  if (!ctx) {
    writeText(node, target);
    return;
  }
  const previous = ctx.snapshot[key];
  ctx.snapshot[key] = target;
  if (previous === target) return;
  const from = previous === undefined ? 0 : previous;
  /* 起点就是终点（首次渲染且值为 0 时很常见）：没有可补间的区间，也不该白闪一下 */
  if (from === target) {
    writeText(node, target);
    return;
  }
  const frame = jsMotionEnabled(ctx.level) ? requestFrame() : null;
  if (!frame) {
    writeText(node, target);
    return;
  }
  let start: number | null = null;
  const step = (timestamp?: number): void => {
    const now = typeof timestamp === "number" ? timestamp : 0;
    if (start === null || now < start) start = now;
    const elapsed = Math.max(0, now - start);
    const progress = Math.min(1, elapsed / COUNT_UP_MS);
    if (progress >= 1) {
      writeText(node, target);
      flash(node);
      return;
    }
    const eased = 1 - Math.pow(1 - progress, 3);
    writeText(node, Math.round(from + (target - from) * eased));
    const next = requestFrame();
    if (next) next(step);
    else {
      writeText(node, target);
      flash(node);
    }
  };
  frame(step);
}

/**
 * 指针跟随光晕：只在 full 启用，且只在根节点上**一次性委托** pointermove
 * （不逐张卡挂监听）。坐标写进卡片上的 `--pp-mx/--pp-my`，绘制归 CSS。
 * getBoundingClientRect 缺失、宽或高为 0（测试桩的假元素常常如此）时安全退出，不写变量。
 */
export function trackPointerSpotlight(root: any, level: MotionLevel): void {
  if (!root) return;
  if (motionLevel(level) !== "full") return;
  if (prefersReducedMotion()) return;
  if (typeof root.addEventListener !== "function") return;
  /* 幂等：重绘时先把上一轮的处理器摘掉，真实 DOM 里就不会越挂越多（桩的 empty() 已经
     清掉了监听，这里的 remove 是空操作，不会阻碍重新挂上）。 */
  const previous = root.__ppSpotlightHandler;
  if (typeof previous === "function" && typeof root.removeEventListener === "function") {
    root.removeEventListener("pointermove", previous);
  }
  const handler = (event: any): void => {
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    const card = target.closest(".pp-stat-card, .pp-waypoint");
    if (!card || typeof card.getBoundingClientRect !== "function") return;
    const rect = card.getBoundingClientRect();
    const width = Number(rect && rect.width) || 0;
    const height = Number(rect && rect.height) || 0;
    if (width <= 0 || height <= 0) return;
    const x = (Number(event.clientX) - Number((rect && rect.left) || 0)) / width;
    const y = (Number(event.clientY) - Number((rect && rect.top) || 0)) / height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setCssVar(card, "--pp-mx", (Math.min(1, Math.max(0, x)) * 100).toFixed(2) + "%");
    setCssVar(card, "--pp-my", (Math.min(1, Math.max(0, y)) * 100).toFixed(2) + "%");
  };
  root.__ppSpotlightHandler = handler;
  root.addEventListener("pointermove", handler);
}
