# 夜航极光 · 流动（Aurora Motion）— 动效契约 v0.1

> 这份文件是**两个渲染面的共同契约**，不是建议。
> 原生插件视图（`styles.css` + `src/`）与内嵌 Web 面板（`web/styles.css` + `web/app.js`）
> 必须逐字使用下面的令牌名、关键帧名与 `data-*` 语义，否则两个界面会像两个产品。

---

## 0. 铁律（违反即返工）

1. **关键帧的终点 = 元素的静态状态。**
   一律用 `animation-fill-mode: backwards`（必要时 `both`），**禁止 `forwards`**。
   动画不执行（被打断 / 被关掉 / 浏览器不支持）时，界面必须仍然完整可见。
   推论：不要写「先 `opacity: 0` 再靠动画显示」的静态声明。
2. **只动 `transform` / `opacity` / `filter` / `background-position` / `box-shadow`。**
   禁止动 `width` / `height` / `top` / `left` / `margin`（进度条用 `transform: scaleX()`）。
3. **进场只在「真正换页」时播放。**
   · 原生：只在视图**首次建面**（容器原本是空的）时给根节点加 `pp-mo-enter`；
     数据刷新（vault 事件、自动刷新）**不播**整页入场。
   · Web：只在**首次渲染**或 `switchView()` 真正换了页签时加 `mo-enter`；
     `setData()` / 自动刷新**不播**整页入场，只播数值与状态的微动效。
   理由：Obsidian 里改一篇笔记会触发整个仪表盘重绘，每次重绘都放一遍入场动画 = 抖动源。
   **同一次 `open()` 内的连续渲染算入场、不算刷新**：Obsidian 打开视图可能先走 `setState()`
   （内部 refresh）再走 `onOpen()`（又 refresh）。这两轮都属于"打开"，必须让用户看到入场 ——
   原生的做法是 `PlanningView.onOpen()` 在"本轮已经渲染过"时不再重复渲染，
   Web 的做法是用 `state.view` 是否真的变化来判断。**不要**用"第几轮渲染"或时间窗口去猜。
4. **尊重 `prefers-reduced-motion` 与 `motionIntensity` 设置。**
   两条都要求：命中时 `animation: none !important; transition: none !important`，
   且悬停位移类 `transform` 一并归零。**不能只把 duration 压到 0.001ms** ——
   带 `animation-delay` 的交错序列会因此把内容压在半透明状态。
5. **不做退场动画。**
   原生弹窗与 Web 抽屉的关闭保持"立即移除/隐藏"（延迟移除会让关闭路径产生异步，
   现有测试与 Obsidian 的 Modal 生命周期都不该为此让步）。退场预算花在下一个交互的入场反馈上。
6. **动效必须可被静音而不影响信息。** 任何"只靠动效表达"的状态（如"刚更新过"）都必须另有静态表现。

---

## 1. 动效令牌（两个 CSS 文件都要有，取值逐字一致）

写在各自的设计令牌区（插件：`.pp-view-root, .pp-modal, .modal-container:has(.pp-modal)` 作用域内；
Web：`:root` 与 `.theme-light` 两个令牌块内，深浅色取值相同）。

```css
/* ---- 动效节奏 ---- */
--pp-mo-instant: 90ms;
--pp-mo-fast: 140ms;
--pp-mo-base: 220ms;
--pp-mo-slow: 380ms;
--pp-mo-enter: 480ms;
--pp-mo-ambient: 14s;
--pp-mo-stagger: 45ms;
--pp-mo-ease: cubic-bezier(0.22, 0.61, 0.36, 1);
--pp-mo-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--pp-mo-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--pp-mo-lift: -3px;
```

> 令牌**不进** `sync-app.mjs` 的 `PALETTE_KEYS`：调色板同步区域是生成的，
> 动效令牌由两边各自手写（与已有的 `--pp-r-*` 圆角令牌同一模式）。
> 因此**不要手改插件 `styles.css` 里 `PP_PALETTE_*_START/END` 之间的任何一行**，
> 那是 `sync-app.mjs` 生成的，构建时会被覆写。

---

## 2. 关键帧表（名称固定，`ppd-` 前缀）

插件 `styles.css` 的 `@keyframes` 是**文档级全局**的，所以必须带 `ppd-` 前缀避免与
Obsidian 或其它插件撞名；Web 在 Shadow DOM 内其实已隔离，但同样使用这套名字，保持一致。

| 名称 | 用途 | from → to（to 必须是静态状态） |
| --- | --- | --- |
| `ppd-rise` | 区块级入场 | `opacity:0; transform:translate3d(0,12px,0)` → `opacity:1; transform:none` |
| `ppd-rise-sm` | 列表行 / 面板条目入场 | `opacity:0; transform:translate3d(0,6px,0)` → `opacity:1; transform:none` |
| `ppd-pop` | 统计卡 / 胶囊 / 卡片 | `opacity:0; transform:scale(.97)` → `opacity:1; transform:none` |
| `ppd-slide-in` | 自左滑入（详情卡 / 抽屉） | `opacity:0; transform:translate3d(-10px,0,0)` → `opacity:1; transform:none` |
| `ppd-fade` | 纯淡入（遮罩 / 抽屉 / 播报） | `opacity:0` → `opacity:1` |
| `ppd-grow-x` | 进度条生长 | `transform:scaleX(0)` → `transform:scaleX(1)`（配 `transform-origin:left`） |
| `ppd-sheen` | 高光扫过（进度条 / 主按钮 / 横幅） | `background-position:-140% 0` → `220% 0`（配 `background-size:220% 100%`，`linear-gradient(100deg, transparent, rgba(255,255,255,.28), transparent)`） |
| `ppd-halo` | 横幅极光光晕缓慢漂移 | `transform:scale(1) rotate(0deg)` → `scale(1.08) rotate(3deg)`，`animation-direction: alternate`，用 `--pp-mo-ambient` |
| `ppd-kenburns` | 横幅素材缓推 | `transform:scale(1.02)` → `scale(1.06)`，`alternate`，`--pp-mo-ambient` |
| `ppd-pulse` | 呼吸（阻塞/逾期徽标、裁剪手柄、"进行中"状态点） | `box-shadow:0 0 0 0 <同色 34%>` → `box-shadow:0 0 0 7px transparent`；`alternate` |
| `ppd-shimmer` | 加载骨架微光 | `background-position:-160% 0` → `160% 0` |
| `ppd-flash` | 数值/徽标跳变提示 | `filter:brightness(1)` → 中点 `brightness(1.35)` → `brightness(1)`（用 `50%` 关键帧，两端都是静态状态） |
| `ppd-march` | 裁剪取景框「蚁行线」 | `background-position:0 0` → `16px 0`，`linear infinite` |
| `ppd-check` | 勾选/切换弹跳 | `transform:scale(.86)` → `scale(1)`（配 `50%` 的 `scale(1.12)`） |

> 时间轴统一：入场用 `--pp-mo-enter` + `--pp-mo-ease-out`；交互反馈用 `--pp-mo-fast`/`--pp-mo-base` + `--pp-mo-ease`；
> 回弹只用于「确认类」动作（勾选、状态切换），用 `--pp-mo-spring`；环境类（halo/kenburns/pulse）用 `--pp-mo-ambient` 或 2s 以上。
>
> **`ppd-pulse` 的起点色按面表达，不做跨面逐字比较。** 契约只规定语义（`0 0 0 0` + 同色 34%）：
> 插件用 `currentColor`（那三个播放者——阻塞/逾期徽标、裁剪手柄——的文字色就是语义色），
> Web 用真令牌 `--pp-pulse-ring`（深/浅主题各取自己 `--pp-rose` 的 34%）——
> Web 侧 `.blocked-badge` / `.task-line-dot` 的文字色是白/近白，用 `currentColor` 会把呼吸环变成白色。
> `tests/suites/11-motion.test.js` 的 `CROSS_FACE_EXCEPTIONS` 已登记 `ppd-pulse@0%`；
> 以后新增同类"颜色按面表达"的关键帧，必须同步更新那份名单，否则跨面一致性断言会误报。

### 已知取舍（不改，但要知道）

| 取舍 | 现象 | 为什么保留 |
| --- | --- | --- |
| `.pp-progress-fill` 进度生长每轮刷新重播 | 数据刷新时进度条重新生长 | 进度是数据本身，"重算过"是有效反馈；380ms 且只动 `scaleX` |
| `.pp-milestone-tab-active::after` 下划线每轮刷新重播 | 自动刷新时下划线重播一次 | 收进 `.pp-mo-enter` 会丢掉"切换关键节点时生长"（切换走 `tab.onclick → refresh()`，那时根节点已非空） |
| 横幅 `::before/::after` 的 14s 循环每轮重启 | 上一帧的 scale 被重置回起点 | 需在刷新间复用节点才能真正修；幅度 ≤8% 且落在 `blur(46px)` 柔光上，肉眼几乎不可见 |
| 不做退场动画 | 弹窗/抽屉关闭是瞬时的 | 铁律 5；延迟移除会让关闭路径产生异步 |

---

## 3. 强度开关：`data-pp-motion` / `data-motion`

来源：插件设置 `motionIntensity`，取值 **`"full" | "subtle" | "off"`**，默认 `"full"`。
`normalizeSettings()` 会把非法值收敛回 `"full"`（与 `clampInt` 同风格）。

| 载体 | 属性 |
| --- | --- |
| 原生：`.pp-view-root` | `data-pp-motion="<level>"` |
| 原生：`.pp-modal` | `data-pp-motion="<level>"` |
| Web：`#pp-app`（`.app`） | `data-motion="<level>"` |

**缺省行为**：属性缺失或为 `full` → 全部动效开启。所以 CSS 默认规则无条件写满动效，
只用属性选择器做**降级覆盖**，这样即使 JS 没跑到也永远不会出现"半透明死界面"。

- `subtle`：关闭环境类与指针跟随（`ppd-halo` / `ppd-kenburns` / `ppd-pulse` / spotlight / `ppd-sheen`）；
  `--pp-mo-stagger: 0ms`；入场时长降到 260ms；
  **弹入类一律换成位移更小的 `ppd-rise-sm`（6px），不再用 scale 弹入** ——
  必须逐个列出所有 `ppd-pop` 播放者（`.pp-stat-card` / `.pp-waypoint` / `.kpi` / 页签胶囊 / `.pp-modal` / 抽屉…），
  漏掉一个就会出现"同一个档位里有的卡片在缩、有的在移"。
  `tests/suites/11-motion.test.js` 会**从 CSS 自身推导**所有 `ppd-pop` 播放者逐个校验，
  所以**新增一个 `ppd-pop` 播放者必须同步补上 subtle 换挡**，否则套件直接红。
  指针跟随要**真的关掉**：`.kpi::before` / `.waypoint::after` 是 `transition: opacity` 驱动的，
  只写 `animation: none` 是空操作，必须连同 `:hover` / `:focus-visible` 一起把 `opacity` 压成 0。
- `off`：
  ```css
  .pp-view-root[data-pp-motion="off"],
  .pp-view-root[data-pp-motion="off"] *,
  .pp-view-root[data-pp-motion="off"] *::before,
  .pp-view-root[data-pp-motion="off"] *::after,
  .pp-view-root[data-pp-motion="off"]::before,
  .pp-view-root[data-pp-motion="off"]::after,
  .pp-modal[data-pp-motion="off"],
  .pp-modal[data-pp-motion="off"] *,
  .pp-modal[data-pp-motion="off"] *::before,
  .pp-modal[data-pp-motion="off"] *::after,
  .pp-modal[data-pp-motion="off"]::before,
  .pp-modal[data-pp-motion="off"]::after { animation: none !important; transition: none !important; }
  ```
  并归零悬停/按压位移。Web 同理用 `.app[data-motion="off"]`。
  **两个易漏点**（都踩过）：① `*` 只匹配后代，**载体元素自身**（`.pp-modal` 自己就播 `ppd-pop`）
  必须单独写一条；② `animation` 不是可继承属性，元素自身声明到不了它的 `::after`
  （根节点自己的 `.pp-mo-loading::after` 骨架微光就漏过），所以 `::before` / `::after` 也要单独写。

`prefers-reduced-motion: reduce` 的规则和 `off` **完全等價**，两条硬要求：
- 每条会播 `animation` 的规则，在两个作用域里都必须能被一条 `animation: none` 覆盖（`!important` 不是硬要求，
  硬要求是"能覆盖"；但同一面内 off 与 reduced 必须对**同一批载体**生效）；
- **归零名单要逐条对齐**：`.pp-waypoint:active` 就曾在 off 里、在 reduced 里漏掉，
  系统"减少动效"打开时那次按压位移就还在。`tests/suites/11-motion.test.js` 现在会枚举全部播放者
  与状态伪类位移逐个校验，off/reduced 两边都查。
**并且 `prefers-reduced-motion` 本身必须保留**：`tests/suites/06-packaging.test.js` 断言插件 CSS 含 `prefers-reduced-motion`，
`tests/suites/07-web-dashboard.test.js` 断言 `web/styles.css` 含 `@media (prefers-reduced-motion: reduce)`，
`tests/suites/08-web-renderer.test.js` 断言 Shadow 适配后该 `@media` 不被改成 `@container`（宽度断点才会被改）。

---

## 4. 分镜：16 个动效，两个面各自的落点

| # | 场景 | 触发 | 用到的关键帧 | 原生落点 | Web 落点 |
| --- | --- | --- | --- | --- | --- |
| 1 | 整页入场（交错） | 首次建面 / 换页 | `ppd-rise` + stagger | `.pp-mo-enter > *` | `.view.mo-enter > *` |
| 2 | 列表行入场 | 同上 | `ppd-rise-sm` + stagger | `.pp-mo-enter .pp-panel-body > *:nth-child(n)` | `.mo-enter .panel-body > *:nth-child(n)` |
| 3 | 统计卡弹入 | 同上 | `ppd-pop` | `.pp-mo-enter .pp-stat-card` | `.mo-enter .kpi` |
| 4 | 图像导航卡弹入 + 上浮 + 光晕 | 入场 / hover | `ppd-pop` + 现有 hover lift | `.pp-waypoint` | `.waypoint` |
| 5 | 指针跟随光晕（spotlight） | `pointermove` | 无（CSS 变量驱动的 radial-gradient） | `.pp-stat-card` / `.pp-waypoint` 的 `--pp-mx/--pp-my` | `.kpi` / `.waypoint` 的 `--pp-mx/--pp-my` |
| 6 | 数字滚动（count-up） | 数值**变化**时 | 无（rAF 补间）+ 结束 `ppd-flash` | `.pp-stat-value` | `.kpi-value` |
| 7 | 进度条生长 + 高光 | 每次渲染（值来自 inline width） | `ppd-grow-x` + `ppd-sheen` | `.pp-progress-fill` | `.progress-fill` / `.load-bar` 填充 |
| 8 | 横幅极光漂移 + 素材缓推 | 常驻 | `ppd-halo` / `ppd-kenburns` | `.pp-dashboard-hero::after` / `::before` | `.hero::after` / `.hero::before` |
| 9 | 当前导航胶囊 | 切换 / hover | `ppd-pop` + 渐变位移 | `.pp-nav-link-active` | `.tab[aria-current="page"]` |
| 10 | 按钮按压与主操作辉光 | `:active` / hover | 无（transform/box-shadow 过渡） | `.pp-button:active` | `.primary-btn:active` |
| 11 | 行悬停：左侧强调条自左滑入 | hover | 无（`transform: scaleY(0→1)` 的 `::before`） | `.pp-project-row` 等 | `.task-row` / `.note-row` 等 |
| 12 | 状态呼吸 | 常驻 | `ppd-pulse` | `.pp-status-blocked` / `.pp-status-expired` | `[data-tone="danger"]` 徽标 |
| 13 | 弹窗/抽屉入场 | 打开 | `ppd-pop` / `ppd-slide-in` + `ppd-fade`（遮罩） | `.pp-modal`（首次打开必定新建节点） | `.drawer` + `.scrim` |
| 14 | 关键节点页签下划线滑动 | 切换 | 无（`transform: translateX()` 的指示条） | `.pp-milestone-tab-active` | `.milestone-tab.is-active` |
| 15 | 裁剪取景框蚁行线 + 手柄脉冲 | modal 打开 / 拖拽 | `ppd-march` + `ppd-pulse` | `.pp-crop-selection` / `.pp-crop-handle` | —（Web 无裁剪） |
| 16 | 加载骨架微光 | 数据未就绪 | `ppd-shimmer` | 只在"首次进入且数据未返回"时出现，**不得**替换现有 DOM 结构；用不新增结构的 `::after` 实现 | `.view[data-loading="true"]` 的骨架 |

**原生面的落点补充**：`ppd-check` 用在 `.pp-multi-choice-row input[type="checkbox"]:checked`（`nth-child` 无关）；
`ppd-slide-in` 用在 `.pp-detail-card`、`.pp-summary-item`。

### 必须保持不变的东西（测试守着的）

- 原生：`tests/suites/06-packaging.test.js`
  · `main.js` 里出现的每个 `pp-*` class 都要在插件 `styles.css` 有规则 → **新增 `pp-*` class 必须同时写样式**。
  · 令牌只能在 `.pp-view-root / .pp-modal / .modal-container:has(.pp-modal)` 作用域，不得写到 `:root`/`body`/`html`/`.workspace`/`.app-container` 上覆盖 Obsidian 变量。
  · CSS 花括号必须配对；不得有 BOM；不得含字面量 `\n`。
- Web：`tests/suites/07-web-dashboard.test.js`
  · `app.js` 中每个 `class="xxx"` 的字面量都要在 `web/styles.css` 出现 `.xxx` → 新增 class 必须同时写样式。
  · 每个 `data-action="xxx"` 字面量必须在 `app.js` 里有 `action === "xxx"` 分支 → **不要新增 data-action**。
  · 必须保留 `@media (prefers-reduced-motion: reduce)`、`@media (max-width: 640px)`、`@media (max-width: 1024px)`、"1140px"。
  · 不得出现深夜书房旧色 `#1a1a2e` 等（见该测试第 338 行列表）。
- Web → Shadow DOM：`shadowScopedCss()` 只改选择器（`:root`→`:host`、`body`→`:host`、`.theme-*`→`:host(...)`），
  并把 `@media (max-width…)` 改成 `@container (...)`。
  推论：新写的 CSS **不得有**行首的 `:root {`、`body {`、`html, body {`、`.theme-dark {`、`.theme-light {`；
  宽度响应式**只能用 `@media (max-width: 640px)` 这类写法**（会被自动转成容器查询）；
  `@keyframes` 块内是安全的（`from {` / `50% {` 不匹配任何替换规则）。
- 运行时桩：测试里的 DOM/window 是精简桩，**没有** `matchMedia`、`getComputedStyle`、
  `element.animate`、`style.setProperty`（`style` 是普通对象）；Web 的测试 window **没有** `requestAnimationFrame`。
  → 所有新加的 JS 都必须 `typeof` 特性检测后才用，绝不能让 stub 环境抛异常
  （用例里任何 `console.error` 都会让测试失败）。

---

## 5. 运行时（原生）API 契约 · `src/core/motion.ts`

```ts
import type { MotionLevel } from "./constants";   // MotionLevel 唯一定义在 constants.ts（Settings 要用它）

/** 读设置里的强度，非法值一律回落 "full" */
export function motionLevel(value: unknown): MotionLevel;

/** 最近一次 applyMotionLevel 写入的强度：给拿不到 plugin 的弹窗用
 *  （插件的 Modal 只拿到 app，构造时读不到 settings） */
export function currentMotionLevel(): MotionLevel;

/** 是否处于「减少动效」环境：无 matchMedia（如测试桩）时返回 false */
export function prefersReducedMotion(): boolean;

/** 是否允许播 JS 驱动的动效（count-up / spotlight）：
 *  level 为 full/subtle 且不处于减少动效环境，且运行环境具备所需能力。 */
export function jsMotionEnabled(level: MotionLevel): boolean;

/** 把强度写到元素上（data 属性） */
export function applyMotionLevel(node: any, level: MotionLevel): void;

/** 安全设置 CSS 变量：style.setProperty 不存在时退回直接赋值（测试桩的 style 是普通对象） */
export function setCssVar(node: any, name: string, value: string): void;

/** 数字滚动：把 node 的文本从「上一次的 key 值」补间到 value；
 *  - 首次（无快照）从 0 滚到 value
 *  - 值没变 → 不做任何事（避免每次 vault 刷新都重滚一遍）
 *  - 不允许 JS 动效 → 直接写成终值
 *  node: 文本节点宿主元素；ctx: 见下 */
export function countUp(ctx: MotionContext, node: any, key: string, value: number): void;

export interface MotionContext { level: MotionLevel; snapshot: Record<string, number>; }
export function createMotionContext(level: MotionLevel): MotionContext;

/** 指针跟随光晕（只对 full 生效，且必须在根节点上一次性委托，不要在每张卡上挂监听） */
export function trackPointerSpotlight(root: any, level: MotionLevel): void;
```

约束：
- 不 import `obsidian`（保持纯函数可测）。
- 不产生全局副作用、不注册 interval；`trackPointerSpotlight` 的监听挂在传入的 root 上（视图根节点随视图销毁一起消失，无需解绑）。
- 不用 `performance.now()`（测试桩没有）；补间用 `requestAnimationFrame` 的时间戳参数，缺失时直接写终值。

**视图侧的另一条要求（不在这份 API 里，但同样必须做到）**：
原生视图的 `setState()` 与 `onOpen()` 之间要去重 —— Obsidian 打开视图会先 `setState()`
（内部 refresh 一次）再 `onOpen()`（又 refresh 一次），两轮都属于"打开"。
`PlanningView` 的做法是 `beginRender()` 置 `renderedThisOpen`、`onOpen()` 发现本轮已渲染就不再重复渲染
（`onClose()` 复位）。**不要**用"第几轮渲染"或时间窗口去猜入场时机 ——
那既会吃掉入场动画（资源页踩过），又会在慢库上变成随机抖动。
`tests/suites/11-motion.test.js` 会断言"一次 open 只渲染一轮、只挂一次 `pp-mo-enter`、`collectData` 只跑一次"。

---

## 6. 验收（Lead 在最终构建后跑）

```
npm run build                             # 重建 main.js（含 Web 区块 + 调色板同步）+ ppd-modules.cjs
npm run check                             # 逐字节确认产物与源码同步
node tests/tools/check-css-coverage.js    # used/missing
npm test                                  # 全量回归（会先重建测试用模块包）
```

新增动效契约套件 `tests/suites/11-motion.test.js` 必须在**最终构建之后**仍然通过，
且它的断言语义必须来自本文件的第 0/1/2/3/4 节，而不是"实现里恰好有什么就断言什么"。
