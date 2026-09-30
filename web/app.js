/* =====================================================================
 * 个人规划仪表盘 · Web
 *
 * 只读展示层：读取由 tools/export-data.mjs / tools/build-sample.mjs 生成的
 * window.DASHBOARD_DATA(_SAMPLE)，把它们渲染成「深夜书房」深色界面：
 * 所有状态推导都发生在生成阶段，网页端不再重复实现业务规则。
 *
 * 页面里没有图片：页首是纯排版 masthead，索引导航是 01 / 02 / 03 的编号入口。
 *
 * 结构：
 *   1. 纯函数（格式化 / 过滤 / 排序 / 分组）—— 可在 Node 中直接测试
 *   1.5 宿主适配层（浏览器默认宿主 / 外部 Shadow DOM 宿主 / mount · unmount）
 *   2. 渲染函数（页首 / 概览 / 任务 / 项目 / 知识 / 草稿箱 + 详情抽屉）
 *   3. 事件与启动
 * ===================================================================== */
(function () {
  "use strict";

  /* ============================ 1. 纯函数 ============================ */

  var PRIORITY = {
    high: { label: "高", rank: 0, tone: "danger" },
    medium: { label: "中", rank: 1, tone: "warn" },
    low: { label: "低", rank: 2, tone: "muted" }
  };

  var STATUS_LABEL = {
    planning: "规划中", todo: "待办", doing: "执行中", blocked: "阻塞", paused: "暂停",
    expired: "过期", completed: "已完成", archived: "已归档", done: "完成", active: "进行中"
  };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function statusLabelOf(status) { return STATUS_LABEL[status] || status || "未设置"; }
  function priorityInfo(priority) { return PRIORITY[String(priority || "medium").toLowerCase()] || PRIORITY.medium; }
  function priorityRank(priority) { return priorityInfo(priority).rank; }

  /** 数值兜底：数据可能来自旧版 data.js 或示例数据，缺字段时界面不能出现 undefined / NaN */
  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  /** 显示用字符串：缺字段时给中性占位 */
  function labelOf(value) {
    if (value === undefined || value === null || value === "") return "—";
    return String(value);
  }

  function pct(part, total) {
    var safeTotal = num(total);
    if (!safeTotal) return 0;
    return Math.max(0, Math.min(100, Math.round((num(part) / safeTotal) * 100)));
  }

  function minutesLabel(minutes) {
    var value = Math.max(0, Number(minutes) || 0);
    if (value < 60) return value + " 分钟";
    var hours = Math.floor(value / 60);
    var rest = value % 60;
    return rest ? hours + " 小时 " + rest + " 分" : hours + " 小时";
  }

  /** DDL 相对描述：逾期 N 天 / 今天 / 明天 / N 天后 */
  function dueLabel(daysLeft) {
    if (daysLeft === null || daysLeft === undefined || Number.isNaN(daysLeft)) return "无 DDL";
    if (daysLeft < 0) return "逾期 " + Math.abs(daysLeft) + " 天";
    if (daysLeft === 0) return "今天到期";
    if (daysLeft === 1) return "明天到期";
    if (daysLeft <= 7) return daysLeft + " 天后";
    return daysLeft + " 天后";
  }

  function dueTone(daysLeft) {
    if (daysLeft === null || daysLeft === undefined || Number.isNaN(daysLeft)) return "muted";
    if (daysLeft < 0) return "danger";
    if (daysLeft <= 1) return "warn";
    return "muted";
  }

  function isOpen(task) { return !["archived", "done", "completed"].includes(task.status); }
  /** 已完成（不再是待办，但还没归档）：留在列表里打删除线、沉到任务组底部，不再参与逾期与统计 */
  function isCompleted(task) { return ["done", "completed"].includes(String((task && task.status) || "").toLowerCase()); }
  function isOverdue(task) { return isOpen(task) && task.daysLeft !== null && task.daysLeft < 0; }

  function formatDate(iso) {
    if (!iso) return "—";
    var parts = String(iso).split("-");
    if (parts.length !== 3) return String(iso);
    return parts[0] + "/" + parts[1] + "/" + parts[2];
  }

  function shortDate(iso) {
    if (!iso) return "—";
    var parts = String(iso).split("-");
    return parts.length === 3 ? parts[1].replace(/^0/, "") + "/" + parts[2].replace(/^0/, "") : String(iso);
  }

  function weekdayLabel(iso) {
    var names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    var date = new Date(iso + "T00:00:00");
    return Number.isNaN(date.getTime()) ? "" : names[date.getDay()];
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    var pad = function (value) { return String(value).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  /** 与插件一致：搜索忽略大小写，筛选值 all 表示不限制 */
  function filterTasks(tasks, filters) {
    var state = filters || {};
    var query = String(state.query || "").trim().toLowerCase();
    var wanted = { taskSet: state.taskSet || "all", taskGroup: state.taskGroup || "all", status: state.status || "all", priority: state.priority || "all", project: state.project || "all" };
    return (tasks || []).filter(function (task) {
      if (query && String(task.title || "").toLowerCase().indexOf(query) < 0
        && String(task.projectTitle || "").toLowerCase().indexOf(query) < 0
        && String(task.milestone || "").toLowerCase().indexOf(query) < 0) return false;
      if (wanted.taskSet !== "all" && task.taskSet !== wanted.taskSet) return false;
      if (wanted.taskGroup !== "all" && task.taskGroup !== wanted.taskGroup) return false;
      if (wanted.status !== "all" && task.status !== wanted.status) return false;
      if (wanted.priority !== "all" && task.priority !== wanted.priority) return false;
      if (wanted.project !== "all" && (task.projectPath || "") !== wanted.project) return false;
      return true;
    });
  }

  /** 排序：已完成的沉到最后；其余 DDL 优先（无 DDL 最后），同 DDL 按优先级 */
  function sortTasks(tasks, mode) {
    var list = (tasks || []).slice();
    /* 已完成的排到所在任务组的最底下：它们是"记录"，不该再抢日期最靠前的位置 */
    var completedLast = function (a, b) { return (isCompleted(a) ? 1 : 0) - (isCompleted(b) ? 1 : 0); };
    if (mode === "duration") list.sort(function (a, b) { return completedLast(a, b) || (b.duration || 0) - (a.duration || 0); });
    else if (mode === "priority") list.sort(function (a, b) { return completedLast(a, b) || priorityRank(a.priority) - priorityRank(b.priority); });
    else list.sort(function (a, b) {
      var byCompleted = completedLast(a, b);
      if (byCompleted !== 0) return byCompleted;
      var left = a.due || "9999-12-31";
      var right = b.due || "9999-12-31";
      if (left !== right) return left < right ? -1 : 1;
      return priorityRank(a.priority) - priorityRank(b.priority);
    });
    return list;
  }

  /** 任务集 → 任务组 → 任务；保持传入顺序 */
  function groupTasks(tasks) {
    var sets = [];
    var bySet = new Map();
    (tasks || []).forEach(function (task) {
      var setName = task.taskSet || "未分配任务集";
      var groupName = task.taskGroup || "未分组";
      if (!bySet.has(setName)) { var set = { name: setName, groups: [], map: new Map() }; bySet.set(setName, set); sets.push(set); }
      var set2 = bySet.get(setName);
      if (!set2.map.has(groupName)) { var group = { name: groupName, tasks: [] }; set2.map.set(groupName, group); set2.groups.push(group); }
      set2.map.get(groupName).tasks.push(task);
    });
    return sets;
  }

  function uniqueValues(tasks, pick) {
    var values = [];
    (tasks || []).forEach(function (task) { var value = pick(task); if (value && values.indexOf(value) < 0) values.push(value); });
    return values;
  }

  /** Obsidian 协议链接：点击直接从浏览器跳转到对应笔记 */
  function obsidianUri(vault, notePath) {
    var file = String(notePath || "").replace(/\.md$/i, "");
    return "obsidian://open?vault=" + encodeURIComponent(vault || "") + "&file=" + encodeURIComponent(file);
  }

  function checkProgress(checklist) {
    var item = checklist || { done: 0, open: 0, total: 0 };
    return { done: item.done || 0, open: item.open || 0, total: item.total || 0, percent: pct(item.done || 0, item.total || 0) };
  }

  /** 概览页的「今日焦点」：逾期最久的，否则最近的到期任务，否则最重要的规划中任务 */
  function focusTask(tasks) {
    var open = (tasks || []).filter(isOpen);
    var overdue = open.filter(isOverdue).sort(function (a, b) { return a.daysLeft - b.daysLeft; });
    if (overdue.length) return overdue[0];
    var dated = open.filter(function (task) { return task.due; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    if (dated.length) return dated[0];
    var planning = open.filter(function (task) { return task.status === "doing"; });
    if (planning.length) return planning[0];
    return open[0] || null;
  }

  /* ====================== 1.5 宿主适配层 ======================
   * 默认宿主就是浏览器自身；外部宿主（Shadow DOM 挂载点 / 插件视图 /
   * 测试替身）通过 PPDashboard.configureHost(...) 或 mount({ host }) 注入
   * root、listeners、openNote、storage、sources 等能力。
   *
   * 约定：本层之外的代码不再直接触碰 document / window / localStorage，
   * 并且 browserHost() 只在运行时惰性调用——文件加载期不读全局。
   * ========================================================== */

  var activeHostRef = null;
  var bound = [];
  /** 上一次已播报的页签：只在真正换页时播报，避免每次重绘都念一遍 */
  var announcedView = null;

  function defaultCopyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (error) { /* 忽略：浏览器拒绝复制 */ }
    document.body.removeChild(area);
    return Promise.resolve();
  }

  function browserHost() {
    return {
      root: (typeof document !== "undefined" && document) || null,
      listeners: (typeof document !== "undefined" && document) || null,
      activeElement: function () { return (typeof document !== "undefined" && document.activeElement) || null; },
      getHash: function () { return (typeof window !== "undefined" && window.location && window.location.hash) || ""; },
      setHash: function (hash) { if (typeof window !== "undefined" && window.location) window.location.hash = hash; },
      onHashChange: function (handler) { if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", handler); },
      offHashChange: function (handler) { if (typeof window !== "undefined" && window.removeEventListener) window.removeEventListener("hashchange", handler); },
      openNote: function (path) { if (typeof window !== "undefined" && window.location) window.location.href = obsidianUri((state.data && state.data.vaultName) || "", path); },
      copyText: defaultCopyText,
      storage: {
        getItem: function (key) { try { return localStorage.getItem(key); } catch (error) { return null; } },
        setItem: function (key, value) { try { localStorage.setItem(key, value); } catch (error) { /* 隐私模式忽略 */ } }
      },
      sources: function () {
        return {
          vault: (typeof window !== "undefined" && window.DASHBOARD_DATA) || null,
          sample: (typeof window !== "undefined" && window.DASHBOARD_DATA_SAMPLE) || null
        };
      }
    };
  }

  function activeHost() { if (!activeHostRef) activeHostRef = browserHost(); return activeHostRef; }
  function $id(id) { var root = activeHost().root; return root && root.getElementById ? root.getElementById(id) : null; }

  /** 读屏播报：切页签、刷新数据都是"原地更新"，没有焦点移动，靠 role=status + aria-live 才念得出来。
      同一句话连写两次读屏不会重复念，所以先清空再写入。 */
  function announce(message) {
    var node = $id("live");
    if (!node || !message) return;
    node.textContent = "";
    node.textContent = String(message);
  }
  function viewLabel(id) {
    var found = VIEWS.filter(function (item) { return item.id === id; })[0];
    return (found && found.label) || id;
  }

  /** 合并式注入：只覆盖传入的键，其余仍走浏览器默认实现 */
  function configureHost(next) { activeHostRef = Object.assign(browserHost(), next || {}); return api; }

  /** 外部宿主直接投喂渲染数据；live 标记决定空状态与页脚措辞 */
  function setData(data) {
    state.data = data;
    render();
    /* 宿主刷新数据是"原地换内容"：读屏用户需要知道换完了 */
    announce("数据已更新：" + viewLabel(state.view));
    return api;
  }

  /** 把事件委托挂到宿主的监听目标上，并记入 bound 以便卸载 */
  function bindEvents() {
    var host = activeHost();
    var pairs = [["click", handleClick], ["change", handleInput], ["input", handleInput], ["keydown", handleKeydown], ["compositionstart", handleCompositionStart], ["compositionend", handleCompositionEnd], ["focusout", handleFocusOut], ["change", handleFieldChange]];
    pairs.forEach(function (pair) { if (host.listeners && host.listeners.addEventListener) { host.listeners.addEventListener(pair[0], pair[1]); bound.push({ target: host.listeners, type: pair[0], handler: pair[1] }); } });
    /* 抽屉滚动位置实时记录：数据刷新重绘后能恢复原位 */
    var drawerNode = $id("drawer");
    if (drawerNode && drawerNode.addEventListener) {
      var onDrawerScroll = function () { state.drawerScroll = Number(drawerNode.scrollTop) || 0; };
      drawerNode.addEventListener("scroll", onDrawerScroll);
      bound.push({ target: drawerNode, type: "scroll", handler: onDrawerScroll });
    }
    if (host.onHashChange) { host.onHashChange(handleHash); bound.push({ hashChange: true, handler: handleHash }); }
    /* 指针跟随光晕（MOTION.md 分镜 5）：只委托在 #view 上挂一次，不在每张卡上挂监听。
       #view 只是 innerHTML 被替换、节点本身不重建，所以监听不会随重绘堆积。 */
    var viewNode = $id("view");
    if (viewNode && viewNode.addEventListener) {
      viewNode.addEventListener("pointermove", handlePointerMove);
      bound.push({ target: viewNode, type: "pointermove", handler: handlePointerMove });
    }
  }

  /** 外部宿主入口：mount({ host, data }) → 绑定 + 首帧渲染 */
  function mount(options) {
    var config = options || {};
    if (config.host) configureHost(config.host);
    if (config.data) { state.data = config.data; state.source = config.data.sample ? "sample" : "vault"; state.live = config.data.live === true; }
    bindEvents();
    render();
    return api;
  }

  /** 对称卸载：解绑全部监听、丢弃宿主引用与绑定记录 */
  function unmount() {
    var host = activeHost();
    if (queryTimer) { window.clearTimeout(queryTimer); queryTimer = null; }
    if (deferredFocusTimer) { window.clearTimeout(deferredFocusTimer); deferredFocusTimer = null; }
    composingTarget = null;
    pendingCompositionRender = false;
    pendingDrawerRefresh = false;
    bound.forEach(function (item) {
      if (item.hashChange) { if (host.offHashChange) host.offHashChange(item.handler); return; }
      if (item.target && item.target.removeEventListener) item.target.removeEventListener(item.type, item.handler);
    });
    bound.length = 0;
    activeHostRef = null;
    return api;
  }

  /* ==================== 1.6 动效运行时（MOTION.md） ====================
   * 契约见仓库根目录 MOTION.md；这里只做「CSS 做不到的那几件事」：
   *   · data-motion 强度开关（#pp-app / 抽屉 / 遮罩各写一份，抽屉在 .app 之外）
   *   · mo-enter：只在首次渲染或真正换页签时重播整页入场
   *   · KPI 数字滚动：只在数值变化时补间（首次从 0），用 rAF 的时间戳
   *   · 指针跟随光晕：委托在 #view 上，只对 full 生效
   *
   * 测试桩没有 requestAnimationFrame / matchMedia / style.setProperty /
   * document.body / offsetWidth，所以每一步都先做 typeof 特性检测：
   * 能力缺失时静默退化成「直接写终值 / 不挂监听」，绝不抛异常。
   * ================================================================== */

  /** level 决定强度；非法值与缺失都回落 "full"（CSS 默认规则就是满动效） */
  function motionLevel(value) {
    return value === "subtle" || value === "off" || value === "full" ? value : "full";
  }

  /**
   * 强度来源（MOTION.md 第 3 节）：
   *   ① payload.settings.motionIntensity —— 契约里的唯一数据字段；
   *   ② host.motionLevel —— 插件宿主额外投喂的一份（payload 里没有这个字段时兜底；
   *      浏览器版 data.js 由 web 工具链导出，本来就没有这个字段）。
   * 两处都拿不到或都是非法值 → "full"。
   */
  function resolveMotionLevel(data) {
    var fromData = data && data.settings ? data.settings.motionIntensity : undefined;
    if (fromData === "full" || fromData === "subtle" || fromData === "off") return fromData;
    var host = activeHost();
    var fromHost = host ? host.motionLevel : undefined;
    if (fromHost === "full" || fromHost === "subtle" || fromHost === "off") return fromHost;
    return motionLevel(fromData);
  }

  /** 只读指针（不满足条件就返回 null，绝不裸调） */
  var raf = (typeof window !== "undefined" && window && typeof window.requestAnimationFrame === "function")
    ? function (fn) { return window.requestAnimationFrame(fn); }
    : null;

  var motion = { level: "full", snapshot: {} };
  /** 每次 render 自增：补间发现代际变了就停手，不再写已经被替换掉的旧节点 */
  var motionGeneration = 0;
  /** 首帧要播入场；setData() / vault 刷新不置回 true */
  var pendingEnter = true;

  function prefersReducedMotion() {
    try {
      if (typeof window === "undefined" || !window || typeof window.matchMedia !== "function") return false;
      var query = window.matchMedia("(prefers-reduced-motion: reduce)");
      return Boolean(query && query.matches);
    } catch (error) { return false; }
  }

  /** JS 驱动的动效是否可用：off 与「减少动效」环境一律关掉 */
  function jsMotionOn() { return motion.level !== "off" && !prefersReducedMotion(); }

  function setMotionAttr(node, level) {
    if (!node || typeof node.setAttribute !== "function") return;
    node.setAttribute("data-motion", level);
  }

  /** 把强度同步到三个根：.app 里的元素靠继承，抽屉与遮罩在 .app 之外必须各写一份 */
  function applyMotionLevel(level) {
    motion.level = level;
    setMotionAttr($id("pp-app"), level);
    setMotionAttr($id("drawer"), level);
    setMotionAttr($id("scrim"), level);
  }

  function addClass(node, name) {
    if (!node) return;
    if (node.classList && typeof node.classList.add === "function") { node.classList.add(name); return; }
    if (typeof node.className === "string" && (" " + node.className + " ").indexOf(" " + name + " ") < 0) {
      node.className = (node.className + " " + name).replace(/^\s+/, "");
    }
  }

  function removeClass(node, name) {
    if (!node) return;
    if (node.classList && typeof node.classList.remove === "function") { node.classList.remove(name); return; }
    if (typeof node.className !== "string") return;
    node.className = (" " + node.className + " ")
      .split(" " + name + " ").join(" ")
      .replace(/^\s+/, "").replace(/\s+$/, "");
  }

  /** 换页签要重播时先移除、强制 reflow、再加回；读不到 offsetWidth 就跳过 reflow 这一步 */
  function playEnter(node) {
    if (!node) return;
    removeClass(node, "mo-enter");
    if (typeof node.offsetWidth === "number") { node.offsetWidth; }
    addClass(node, "mo-enter");
  }

  /** entering 为真才播入场，否则把类摘掉 —— 否则 setData() 换 innerHTML 也会带着旧类重放 */
  function syncEnter(node, tabsNode, entering) {
    if (entering) { playEnter(node); playEnter(tabsNode); return; }
    removeClass(node, "mo-enter");
    removeClass(tabsNode, "mo-enter");
  }

  function setText(node, text) {
    if (node && "textContent" in node) node.textContent = String(text);
  }

  /** CSS 变量：桩里的 style 是普通对象，没有 setProperty 就退回直接赋值 */
  function setCssVar(node, name, value) {
    if (!node || !node.style) return;
    if (typeof node.style.setProperty === "function") { node.style.setProperty(name, value); return; }
    node.style[name] = value;
  }

  /** 数字滚动：值没变就什么都不做（避免每次 vault 刷新都重滚一遍）；首次从 0 起滚。
   *  rAF 缺失 / 拿不到时间戳 → 直接写终值。 */
  function countUpValue(node, key, target) {
    if (!node) return;
    var previous = motion.snapshot[key];
    motion.snapshot[key] = target;
    /* 值没变就什么都不做：终值已经在 innerHTML 里（否则每次 vault 刷新都要重滚一遍） */
    if (previous === target) return;
    if (!jsMotionOn() || typeof raf !== "function") { setText(node, target); return; }
    var from = typeof previous === "number" && isFinite(previous) ? previous : 0;
    if (from === target) { setText(node, target); return; }
    setText(node, from);
    var generation = motionGeneration;
    var started = null;
    var step = function (timestamp) {
      if (generation !== motionGeneration) return;
      var now = Number(timestamp);
      if (!isFinite(now)) { setText(node, target); return; }
      if (started === null) started = now;
      var ratio = Math.min(1, Math.max(0, (now - started) / 420));
      if (ratio < 1) {
        setText(node, Math.round(from + (target - from) * (1 - (1 - ratio) * (1 - ratio))));
        raf(step);
        return;
      }
      setText(node, target);
      addClass(node, "is-counted-up");       /* 补间结束：ppd-flash 提示数值跳变 */
    };
    raf(step);
  }

  /** 渲染后把所有 [data-count]（KPI 数字）过一遍；桩里没有 querySelectorAll 就跳过。
   *  选择器必须同时要求 data-count-key：数值补间会把节点的**全部文本**覆盖成数字，
   *  所以任何"标签 + 数字"的复合节点（如「导入为任务集（1）」）都不能被它命中 ——
   *  之前只写 [data-count]，草稿箱那个按钮的标签就被吃成了一个孤零零的数字。 */
  function animateCounts(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    var nodes;
    try { nodes = root.querySelectorAll("[data-count][data-count-key]"); } catch (error) { return; }
    if (!nodes || !nodes.length) return;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || typeof node.getAttribute !== "function") continue;
      /* 第二道护栏：只补间"整段文本就是一个数字"的节点。以后有人再往复合标签上
         误挂 data-count，这里只会跳过（标签保持原样），不会把它改坏。 */
      var current = node.textContent === undefined || node.textContent === null ? "" : String(node.textContent);
      if (!/^\s*-?\d+(\.\d+)?\s*$/.test(current)) continue;
      var target = Number(node.getAttribute("data-count"));
      if (!isFinite(target)) continue;
      countUpValue(node, node.getAttribute("data-count-key") || ("kpi-" + i), target);
    }
  }

  /** 指针跟随光晕：监听只挂在 #view 上一次，事件里才找卡片（不在挂监听时读 event.target） */
  function handlePointerMove(event) {
    if (motion.level !== "full" || prefersReducedMotion()) return;
    var target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    var card = target.closest(".kpi, .waypoint");
    if (!card || typeof card.getBoundingClientRect !== "function") return;
    var rect = card.getBoundingClientRect();
    if (!rect || !(Number(rect.width) > 0) || !(Number(rect.height) > 0)) return;   /* 防 0 除 */
    var x = ((Number(event.clientX) - Number(rect.left)) / Number(rect.width)) * 100;
    var y = ((Number(event.clientY) - Number(rect.top)) / Number(rect.height)) * 100;
    setCssVar(card, "--pp-mx", Math.max(0, Math.min(100, x)).toFixed(1) + "%");
    setCssVar(card, "--pp-my", Math.max(0, Math.min(100, y)).toFixed(1) + "%");
  }

  /* ============================ 2. 渲染 ============================ */

  var state = {
    data: null, source: "vault", view: "overview", live: false, drawer: null, lastFocus: null,
    /* projectMilestones：项目详情里"当前选中的关键节点"，按项目路径记忆 */
    projectMilestones: {},
    /* 抽屉重绘要恢复的两样东西：滚动位置、正在编辑的字段 */
    drawerScroll: 0, lastEditedField: null,
    /* 批量选择桶：{ draft|note|task|project: { 路径: true } } —— 三处（草稿箱/数据/任务）与项目页签共用一套 */
    selection: {},
    filters: { query: "", noteQuery: "", noteType: "all", taskSet: "all", taskGroup: "all", status: "all", priority: "all", project: "all", sort: "due" }
  };

  var VIEWS = [
    { id: "overview", label: "概览" },
    { id: "tasks", label: "任务" },
    { id: "projects", label: "项目" },
    { id: "knowledge", label: "知识" },
    { id: "inbox", label: "草稿箱", count: function (data) { return num(data.stats.inbox); } },
    { id: "data", label: "数据", count: function (data) { return (data.notes || []).length; } }
  ];

  function taskIndex(data) {
    var map = new Map();
    (data.tasks || []).forEach(function (task) { map.set(task.path, task); });
    return map;
  }
  function projectIndex(data) {
    var map = new Map();
    (data.projects || []).forEach(function (project) { map.set(project.path, project); });
    return map;
  }

  /** 可点的 chip：项目卡上的关键节点用它，点一下打开详情并定位到该节点 */
  function chipButton(text, attributes) {
    var attrs = attributes || {};
    var html = '<button type="button" class="chip chip-button"';
    Object.keys(attrs).forEach(function (key) { html += " " + key + '="' + escapeHtml(attrs[key]) + '"'; });
    return html + ">" + escapeHtml(text) + "</button>";
  }
  function chip(text, attributes) {
    var attrs = attributes || {};
    var html = '<span class="chip"';
    Object.keys(attrs).forEach(function (key) { html += " " + key + '="' + escapeHtml(attrs[key]) + '"'; });
    return html + ">" + escapeHtml(text) + "</span>";
  }

  function emptyState(title, hint) {
    return '<div class="empty"><strong>' + escapeHtml(title) + "</strong>" + escapeHtml(hint) + "</div>";
  }

  function openNoteButton(path, label) {
    return '<button type="button" class="link-btn" data-action="open-note" data-path="' + escapeHtml(path) + '">' + escapeHtml(label || "在 Obsidian 打开") + "</button>";
  }

  /** 宿主是否提供写操作通道：独立浏览器版（file:// 直接打开）没有，因此保持只读 */
  function canWrite() { return typeof activeHost().perform === "function"; }
  /** 把写操作交给宿主：插件侧执行它原有的命令与弹窗，渲染层只负责发指令 */
  function perform(action, path, extra) {
    var host = activeHost();
    if (typeof host.perform !== "function" || !path) return;
    host.perform(action, path, extra);
  }
  /** 写操作按钮：复用现有 link-btn 样式，不引入新的 class */
  function actionButton(action, path, label, extra) {
    return '<button type="button" class="link-btn" data-action="' + action + '" data-path="' + escapeHtml(path) + '"'
      + (extra ? ' data-name="' + escapeHtml(extra) + '"' : "") + ">" + escapeHtml(label) + "</button>";
  }
  function taskActionButtons(task) {
    if (!canWrite()) return "";
    var buttons = actionButton("edit-task", task.path, "编辑");
    if (isOpen(task)) buttons += actionButton("archive-task", task.path, "完成并归档");
    if (task.type === "knowledge-gap") buttons += actionButton("gap-sink", task.path, "沉淀到知识库");
    return buttons + actionButton("delete-task", task.path, "删除");
  }
  /** 阻塞是"任务的状态"，不再是项目文档里的独立清单 —— 这条判据全局只此一处 */
  function isBlocked(task) { return String((task && task.status) || "").toLowerCase() === "blocked"; }

  /* ------------------------- 详情页可直改字段 ------------------------- */
  /* 字段规格来自 payload.fieldSpec（插件侧 EDITABLE_FIELDS 同一份定义），
     这里只提供兜底：离线页面/旧数据里没有它时也能渲染。 */
  var FALLBACK_FIELDS = {
    task: [
      { key: "milestone", label: "关键节点", type: "text" },
      { key: "due", label: "DDL", aliases: ["deadline"], type: "date" },
      { key: "duration", label: "预计耗时（分钟）", type: "number" },
      { key: "priority", label: "优先级", type: "select", options: [["high", "高"], ["medium", "中"], ["low", "低"]] },
      { key: "assignee", label: "执行者", type: "text" },
      { key: "recurrence", label: "重复周期", type: "select", options: [["none", "不重复"], ["daily", "每天"], ["weekly", "每周"], ["monthly", "每月"]] },
      /* 重复模式（与插件 EDITABLE_FIELDS 同源）：周几多选、每月几号、序列结束日。
         showWhen 是纯数据规则（不是函数）——旧版 data.js 里没有这些字段时也能靠兜底渲染。 */
      { key: "recurrence_weekdays", label: "重复周几", type: "multiselect",
        options: [[1, "周一"], [2, "周二"], [3, "周三"], [4, "周四"], [5, "周五"], [6, "周六"], [7, "周日"]],
        showWhen: { key: "recurrence", in: ["weekly"] } },
      { key: "recurrence_monthday", label: "每月几号", type: "select",
        options: [[1, "1 号"], [2, "2 号"], [3, "3 号"], [4, "4 号"], [5, "5 号"], [6, "6 号"], [7, "7 号"], [8, "8 号"], [9, "9 号"], [10, "10 号"], [11, "11 号"], [12, "12 号"], [13, "13 号"], [14, "14 号"], [15, "15 号"], [16, "16 号"], [17, "17 号"], [18, "18 号"], [19, "19 号"], [20, "20 号"], [21, "21 号"], [22, "22 号"], [23, "23 号"], [24, "24 号"], [25, "25 号"], [26, "26 号"], [27, "27 号"], [28, "28 号"], [29, "29 号"], [30, "30 号"], [31, "31 号"]],
        showWhen: { key: "recurrence", in: ["monthly"] } },
      { key: "recurrence_until", label: "重复结束（DDL）", type: "date",
        showWhen: { key: "recurrence", in: ["daily", "weekly", "monthly"] } },
      { key: "task_set", label: "任务集", type: "text" },
      { key: "task_group", label: "任务组", type: "text" },
      { key: "project", label: "所属项目", type: "text" },
      { key: "blocking_reason", label: "阻塞原因", type: "textarea" }
    ],
    project: [
      { key: "area", label: "长期领域", type: "text" },
      { key: "weight", label: "权重", type: "number" },
      { key: "deadline", label: "DDL", aliases: ["ddl"], type: "date" },
      { key: "constraints", label: "资源约束", aliases: ["resource_constraints"], type: "text" },
      { key: "outcome", label: "最终结果（终点画像）", aliases: ["final_outcome"], type: "textarea" },
      { key: "acceptance", label: "验收标准", aliases: ["acceptance_criteria"], type: "textarea" }
    ]
  };
  function fieldSpecs(kind, data) {
    var fallback = FALLBACK_FIELDS[kind] || [];
    var fromData = ((data && data.fieldSpec) || {})[kind];
    if (!fromData || !fromData.length) return fallback;
    /* 与本地兜底**合并**而不是二选一：离线页面的 data.js 可能是旧版导出的，
       若完全信任它，新加的字段（比如阻塞原因）就会静默消失。 */
    var merged = fromData.slice();
    fallback.forEach(function (spec) {
      if (!merged.some(function (item) { return item.key === spec.key; })) merged.push(spec);
    });
    return merged;
  }
  /** 显示值取笔记里的原始值（payload 会把空值美化成像"未分组"那样的展示文案，不能拿来编辑） */
  function rawField(item, spec) {
    var fm = (item && item.frontmatter) || {};
    var keys = [spec.key].concat(spec.aliases || []);
    for (var i = 0; i < keys.length; i += 1) {
      var value = fm[keys[i]];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }
  /** 枚举型字段一律用下拉，不要用输入框：取值来自已有数据的字段（所属项目 / 关键节点 / 执行者 /
      任务集 / 任务组 / 长期领域）如果做成输入框，用户手抄一个不存在的值就等于把这条笔记踢出所有视图，
      而且不会有任何提示。
      用**本地映射**而不是 payload.fieldSpec 里的 type —— 离线页面的 data.js 可能是旧版导出的，那里还写着 text。 */
  var FIELD_SOURCES = {
    project: "projects",
    milestone: "milestones",
    assignee: "people",
    task_set: "taskSets",
    task_group: "taskGroups",
    area: "areas"
  };
  /* 「＋ 新建任务集 / 任务组…」的哨兵值：只在这个界面里流转，绝不会写进笔记 */
  var NEW_TASK_SET_VALUE = "__pp_new_task_set__";
  var NEW_TASK_GROUP_VALUE = "__pp_new_task_group__";
  /** 字段的声明式显隐：`showWhen: { key, in: [...] }`（缺省 = 总是显示）。
   *  与插件侧 constants.ts 的 fieldVisible 同一语义；这里必须是纯数据规则 ——
   *  浏览器版的 data.js 是 JSON，函数过不来，所以规则本身也只能是数据。 */
  function fieldVisibleOnItem(spec, item) {
    var rule = spec && spec.showWhen;
    if (!rule) return true;
    var current = String(rawField(item, { key: rule.key, aliases: [] }) || "none").toLowerCase();
    return (rule.in || []).some(function (value) { return String(value).toLowerCase() === current; });
  }
  /** 已有任务里出现过的任务集 / 任务组取值（去重、稳定排序） */
  function uniqueTaskValues(data, key) {
    var values = [];
    (data.tasks || []).forEach(function (task) {
      var value = String(task[key] || "").trim();
      if (value && values.indexOf(value) < 0) values.push(value);
    });
    return values.sort();
  }
  /** 任务所属项目：优先 projectPath（payload 已解析），退回 frontmatter.project（可能写的是标题） */
  function projectOfItem(data, item) {
    var raw = String((item && (item.projectPath || (item.frontmatter && item.frontmatter.project))) || "");
    if (!raw) return null;
    return (data.projects || []).find(function (project) { return project.path === raw || project.title === raw; }) || null;
  }
  /** 某个项目的关键节点：项目声明的 + 该项目任务上实际用过的（与插件 getMilestones 同口径） */
  function milestonesOfProject(data, projectPath) {
    var project = (data.projects || []).find(function (item) { return item.path === projectPath; }) || null;
    var names = ((project && project.milestones) || []).map(String).filter(Boolean);
    (data.tasks || []).forEach(function (task) {
      if (projectPath && task.projectPath !== projectPath) return;
      var name = String(task.milestone || "").trim();
      if (name && names.indexOf(name) < 0) names.push(name);
    });
    if (names.indexOf("未分组") < 0) names.push("未分组");
    return names;
  }
  /** 字段的可选值 [[value,label]]；返回空数组表示"这个字段不是枚举型" */
  function fieldChoices(spec, item, data) {
    var source = FIELD_SOURCES[spec.key] || "";
    if (!source) return [];
    if (source === "projects") {
      return (data.projects || []).map(function (project) { return [project.path, project.title || project.path]; });
    }
    if (source === "milestones") {
      var project = projectOfItem(data, item);
      var current = String(rawField(item, spec) || "").trim();
      var names = project ? milestonesOfProject(data, project.path) : [];
      if (current && names.indexOf(current) < 0) names.unshift(current);
      if (!names.length) names = ["未分组"];
      return names.map(function (name) { return [name, name]; });
    }
    if (source === "people") {
      return ((data.resources && data.resources.people) || []).map(function (person) { return [person.title || person.path, person.title || person.path]; });
    }
    if (source === "areas") {
      return ((data.resources && data.resources.areas) || []).map(function (area) { return [area.title || area.path, area.title || area.path]; });
    }
    return uniqueTaskValues(data, source === "taskSets" ? "taskSet" : "taskGroup").map(function (value) { return [value, value]; });
  }
  function fieldControl(item, spec, data) {
    if (!canWrite()) {
      var shown = rawField(item, spec);
      return '<span class="field-readonly">' + escapeHtml(shown === "" ? "—" : String(shown)) + "</span>";
    }
    var attrs = ' data-field="' + escapeHtml(spec.key) + '" data-path="' + escapeHtml(item.path) + '"'
      + ' data-kind="' + (item.type === "project" ? "project" : "task") + '"'
      + ' aria-label="' + escapeHtml(spec.label) + '"';
    var value = rawField(item, spec);
    /* 枚举型字段优先走"已有取值"：引用类（项目 / 关键节点 / 执行者 / 长期领域）必须是已有集合里的值 → select；
       任务集 / 任务组允许写新值 → input + datalist（下拉可选已有值，也能直接敲新的）。 */
    var choices = fieldChoices(spec, item, data);
    if (choices.length) {
      var current = String(value === undefined || value === null ? "" : value);
      var known = choices.some(function (pair) { return pair[0] === current; });
      if (spec.key === "task_set" || spec.key === "task_group") {
        /* 任务集 / 任务组同样是下拉（不再让用户手抄），但多一个「＋ 新建…」出口：
           选中它由插件弹一个小表单问名字，避免"必须是已有值"把新任务集堵死。 */
        var newValue = spec.key === "task_set" ? NEW_TASK_SET_VALUE : NEW_TASK_GROUP_VALUE;
        return '<select class="field-input"' + attrs + ">"
          + '<option value=""' + (current === "" ? " selected" : "") + ">未设置</option>"
          + (current === "" || known ? "" : '<option value="' + escapeHtml(current) + '" selected>' + escapeHtml(current) + "</option>")
          + choices.map(function (pair) {
            return '<option value="' + escapeHtml(pair[0]) + '"' + (current === pair[0] ? " selected" : "") + ">" + escapeHtml(pair[1]) + "</option>";
          }).join("")
          + '<option value="' + newValue + '">＋ 新建' + escapeHtml(spec.label) + "…</option>"
          + "</select>";
      }
      return '<select class="field-input"' + attrs + ">"
        + '<option value=""' + (current === "" ? " selected" : "") + ">未设置</option>"
        /* 当前值不在候选里（例如刚换了项目）也必须保留，否则改别的字段时会把这个值冲掉 */
        + (current === "" || known ? "" : '<option value="' + escapeHtml(current) + '" selected>' + escapeHtml(current) + "</option>")
        + choices.map(function (pair) {
          return '<option value="' + escapeHtml(pair[0]) + '"' + (current === pair[0] ? " selected" : "") + ">" + escapeHtml(pair[1]) + "</option>";
        }).join("")
        + "</select>";
    }
    if (spec.type === "select") {
      return '<select class="field-input"' + attrs + ">"
        + '<option value=""' + (String(value) === "" ? " selected" : "") + ">未设置</option>"
        + (spec.options || []).map(function (pair) {
          return '<option value="' + escapeHtml(pair[0]) + '"' + (String(value).toLowerCase() === pair[0] ? " selected" : "") + ">" + escapeHtml(pair[1]) + "</option>";
        }).join("")
        + "</select>";
    }
    if (spec.type === "multiselect") {
      /* 多选（重复周几）：一组复选框，整组共享一个 data-field。
         change 时由 handleFieldChange 把勾中的值拼成 CSV 交给宿主写盘（写入端再归一成数组）。 */
      var picked = String(value === undefined || value === null ? "" : value).split(/[,，、\s]+/).filter(Boolean);
      return '<span class="field-multi">' + (spec.options || []).map(function (pair) {
        var optionValue = String(Array.isArray(pair) ? pair[0] : pair);
        var optionLabel = String(Array.isArray(pair) ? pair[1] : pair);
        return '<label class="field-multi-item"><input type="checkbox" data-multi="true"' + attrs
          + ' value="' + escapeHtml(optionValue) + '"' + (picked.indexOf(optionValue) >= 0 ? " checked" : "") + ">"
          + "<span>" + escapeHtml(optionLabel) + "</span></label>";
      }).join("") + "</span>";
    }
    if (spec.type === "textarea") {
      return '<textarea class="field-input field-textarea" rows="3"' + attrs + ">" + escapeHtml(String(value || "")) + "</textarea>";
    }
    var type = spec.type === "date" ? "date" : spec.type === "number" ? "number" : "text";
    return '<input class="field-input" type="' + type + '"' + attrs + ' value="' + escapeHtml(String(value === undefined || value === null ? "" : value)) + '">';
  }
  function fieldSpec(kind, key, data) {
    return fieldSpecs(kind, data).filter(function (spec) { return spec.key === key; })[0] || null;
  }
  function fieldRow(item, kind, spec, data) {
    if (!spec) return "";
    return '<div class="field-row"><label class="field-label">' + escapeHtml(spec.label) + "</label>" + fieldControl(item, spec, data) + "</div>";
  }
  /** skip 用来把字段拆到各自段落（最终结果 / 验收标准 单独成段）；
   *  showWhen 不满足的字段不渲染 —— 重复周期这种联动字段在无关时不该占位。 */
  function fieldRows(item, kind, data, skip) {
    return fieldSpecs(kind, data).filter(function (spec) {
      if ((skip || []).indexOf(spec.key) >= 0) return false;
      return fieldVisibleOnItem(spec, item);
    }).map(function (spec) {
      return fieldRow(item, kind, spec, data);
    }).join("");
  }
  /** 任务拆解：勾选 / 改文字 / 删除，都是直接写笔记正文 */
  function checklistRows(item, task, data) {
    var list = (task.checklist && task.checklist.items) || [];
    if (!list.length) return "";
    if (!canWrite()) {
      return '<ul class="checklist">' + list.map(function (entry) {
        return '<li class="checklist-row' + (entry.done ? " is-done" : "") + '"><span>' + escapeHtml(entry.text || "") + "</span></li>";
      }).join("") + "</ul>";
    }
    return '<ul class="checklist">' + list.map(function (entry, index) {
      return '<li class="checklist-row' + (entry.done ? " is-done" : "") + '">'
        + '<button type="button" class="checklist-toggle" data-action="checklist-toggle" data-path="' + escapeHtml(item.path) + '" data-index="' + index + '"'
        + ' aria-pressed="' + (entry.done ? "true" : "false") + '" aria-label="' + (entry.done ? "标记为未完成" : "标记为完成") + '">' + (entry.done ? "☑" : "☐") + "</button>"
        + '<input class="field-input checklist-text" aria-label="步骤内容" data-field="checklist" data-index="' + index + '" data-path="' + escapeHtml(item.path) + '" data-kind="task" value="' + escapeHtml(entry.text || "") + '">'
        + '<button type="button" class="link-btn checklist-remove" data-action="checklist-remove" data-path="' + escapeHtml(item.path) + '" data-index="' + index + '">删除</button>'
        + "</li>";
    }).join("") + "</ul>"
      + '<div class="meta-row" style="margin-top:8px"><button type="button" class="link-btn" data-action="checklist-add" data-path="' + escapeHtml(item.path) + '">+ 添加一步</button></div>';
  }
  var TASK_STATUS_OPTIONS = [["planning", "规划中"], ["todo", "待办"], ["done", "完成"], ["blocked", "阻塞"]];
  /** 任务状态四选一：直接写 frontmatter.status，不再绕原生弹窗 */
  function statusPicker(task) {
    if (!canWrite()) return chip(statusLabelOf(task.status), { "data-status": task.status });
    var current = String(task.status || "").toLowerCase();
    var known = TASK_STATUS_OPTIONS.some(function (pair) { return pair[0] === current; });
    var buttons = TASK_STATUS_OPTIONS.map(function (pair) {
      var active = pair[0] === current;
      return '<button type="button" class="status-option' + (active ? " is-active" : "") + '"'
        + ' data-action="set-task-status" data-path="' + escapeHtml(task.path) + '" data-status="' + pair[0] + '"'
        + ' aria-pressed="' + (active ? "true" : "false") + '">' + pair[1] + "</button>";
    }).join("");
    return '<div class="status-picker" role="group" aria-label="任务状态">' + buttons + "</div>"
      + (known ? "" : '<p class="status-picker-hint">当前写的是「' + escapeHtml(statusLabelOf(task.status)) + "」，选上面任一状态即可归位</p>");
  }
  function projectActionButtons(project) {
    if (!canWrite()) return "";
    return actionButton("edit-project", project.path, "编辑项目")
      + actionButton("project-status", project.path, "更新状态")
      + actionButton("project-milestone", project.path, "新建关键节点")
      + actionButton("archive-project", project.path, "归档项目")
      + actionButton("delete-project", project.path, "删除项目");
  }

  /** 关键节点 / 孤立任务里用的紧凑列表项：一条任务只占一行。
      完整信息（执行者、重复、引用、拆解…）都留在 title 提示与详情抽屉里，
      列表本身不堆标签 —— 窄抽屉里 9 个标签会把一行撑到 350px+。 */
  function taskLine(task) {
    var tips = [statusLabelOf(task.status), dueLabel(task.daysLeft), minutesLabel(task.duration), "优先级 " + priorityInfo(task.priority).label];
    if (task.assignee) tips.push("执行者 " + task.assignee);
    if (task.recurrence && task.recurrence !== "none") tips.push("重复：" + ({ daily: "每天", weekly: "每周", monthly: "每月" }[task.recurrence] || task.recurrence));
    if (task.knowledgeRefs && task.knowledgeRefs.length) tips.push("引用 " + task.knowledgeRefs.length + " 篇");
    if (task.checklist && task.checklist.total) tips.push("拆解 " + task.checklist.done + "/" + task.checklist.total);
    var blockedReason = isBlocked(task) ? String((task.frontmatter && task.frontmatter.blocking_reason) || "").trim() : "";
    var note = blockedReason
      ? '<span class="task-line-note" data-tone="blocked">阻塞：' + escapeHtml(blockedReason.slice(0, 18)) + "</span>"
      : (task.checklist && task.checklist.total ? '<span class="task-line-note">' + task.checklist.done + "/" + task.checklist.total + "</span>" : "");
    var open = isOpen(task);
    var act = (label, status) => '<button type="button" class="task-line-act" data-action="set-task-status" data-path="' + escapeHtml(task.path)
      + '" data-name="' + status + '" aria-label="' + label + "：" + escapeHtml(task.title) + '">' + label + "</button>";
    return '<div class="task-line' + (isCompleted(task) ? " is-done" : "") + '" data-status="' + escapeHtml(task.status) + '" title="' + escapeHtml(tips.join(" · ")) + '">'
      + '<span class="task-line-dot" data-status="' + escapeHtml(task.status) + '" aria-hidden="true"></span>'
      + '<button type="button" class="task-line-title" data-action="detail-task" data-path="' + escapeHtml(task.path) + '">' + escapeHtml(task.title) + "</button>"
      + '<span class="task-line-meta">'
      + '<span class="task-line-due' + (isCompleted(task) ? "" : " data-tone='" + escapeHtml(dueTone(task.daysLeft)) + "'") + '">'
      + escapeHtml(isCompleted(task) ? (task.due ? shortDate(task.due) : "无 DDL") : dueLabel(task.daysLeft)) + "</span>"
      + (task.priority === "high" ? '<span class="task-line-priority">高</span>' : "")
      + note
      + "</span>"
      + openNoteButton(task.path)
      + (canWrite() && open ? act("完成", "done") : "")
      + (canWrite() && !open ? act("重开", "todo") : "")
      + "</div>";
  }
  /** 紧凑列表容器：节点下的任务、孤立任务都走这个 */
  function taskList(tasks) {
    return '<div class="task-list">' + tasks.map(taskLine).join("") + "</div>";
  }
  /** 日期徽标：已完成的任务不再喊「逾期 N 天」—— 它已经做完了，只留一个中性的日期。 */
  function dueChip(task) {
    if (isCompleted(task)) return chip(task.due ? shortDate(task.due) : "无 DDL");
    return chip(dueLabel(task.daysLeft), { "data-tone": dueTone(task.daysLeft) });
  }
  /** 最近一次「本周期完成」：只有那条任务上会出现「撤销」 */
  function recurringUndoPath() {
    var undo = state.data && state.data.recurringUndo;
    return undo && undo.path ? undo.path : "";
  }
  function undoCompletionButton(task) {
    var undo = (state.data && state.data.recurringUndo) || {};
    var hint = "撤销这一次「已完成」：截止时间回到 " + (undo.due || "上一个周期") + "，状态回到点击之前";
    return '<button type="button" class="link-btn is-undo" data-action="undo-recurring-completion" data-path="'
      + escapeHtml(task.path) + '" title="' + escapeHtml(hint) + '" aria-label="' + escapeHtml(hint) + '">撤销</button>';
  }
  function taskRow(task, options) {
    var selectable = Boolean(options && options.select) && canWrite();
    var picked = selectable && isPicked("task", task.path) ? " checked" : "";
    var meta = [
      chip(statusLabelOf(task.status), { "data-status": task.status }),
      dueChip(task),
      chip(minutesLabel(task.duration)),
      chip("优先级 " + priorityInfo(task.priority).label, { "data-priority": task.priority })
    ];
    if (task.projectTitle) meta.push(chip(task.projectTitle));
    if (task.milestone && task.milestone !== "未分组") meta.push(chip("节点 " + task.milestone));
    if (isBlocked(task)) {
      var blockedReason = String((task.frontmatter && task.frontmatter.blocking_reason) || "").trim();
      if (blockedReason) meta.push(chip("阻塞：" + blockedReason.slice(0, 24), { "data-tone": "blocked" }));
    }
    if (task.assignee) meta.push(chip("执行者 " + task.assignee));
    if (task.recurrence && task.recurrence !== "none") meta.push(chip("重复：" + ({ daily: "每天", weekly: "每周", monthly: "每月" }[task.recurrence] || task.recurrence)));
    if (task.knowledgeRefs && task.knowledgeRefs.length) meta.push(chip("引用 " + task.knowledgeRefs.length + " 篇"));
    if (task.checklist && task.checklist.total) meta.push(chip("拆解 " + task.checklist.done + "/" + task.checklist.total));
    if (task.suggestion) meta.push(chip("建议拆解", { "data-tone": "warn" }));

    return '<div class="task-row' + (isCompleted(task) ? " is-done" : "") + '" data-status="' + escapeHtml(task.status) + '">'
      + (selectable ? '<input type="checkbox" class="draft-check" data-action="select-task" data-path="' + escapeHtml(task.path) + '" aria-label="选择任务：' + escapeHtml(task.title) + '"' + picked + '>' : "")
      + '<div class="task-main">'
      + '<button type="button" class="row-title task-title" data-action="detail-task" data-path="' + escapeHtml(task.path) + '">' + escapeHtml(task.title) + "</button>"
      + '<div class="meta-row task-meta">' + meta.join("") + "</div>"
      + "</div>"
      + '<div class="task-actions">'
      + '<button type="button" class="link-btn" data-action="detail-task" data-path="' + escapeHtml(task.path) + '">详情</button>'
      + openNoteButton(task.path)
      /* 「完成」= 只改状态、文件留在原地；「完成并归档」= 移到归档库。两件事必须分开写清楚，
         否则用户以为只是勾个完成，文件却被搬走了。
         重复任务的「已完成」不等于整条任务完成：截止时间跳到下个周期、状态回到待办，
         所以点错了要能立刻撤回 —— 那条任务的按钮区多一个「撤销」（只对最近一次有效）。 */
      + (canWrite() && isOpen(task) ? actionButton("set-task-status", task.path, "标记完成", "done") : "")
      + (canWrite() && !isOpen(task) ? actionButton("set-task-status", task.path, "重开", "todo") : "")
      + (canWrite() && recurringUndoPath() === task.path ? undoCompletionButton(task) : "")
      + (canWrite() && isOpen(task) ? actionButton("archive-task", task.path, "完成并归档") : "")
      + "</div></div>";
  }

  /** KPI 卡：给了 view 就整张卡可点，直接跳到对应页签（读一眼数字之后不用再去顶栏找入口） */
  function kpiCard(label, value, hint, ratio, view) {
    var bar = ratio === undefined ? "" : '<div class="kpi-bar"><span style="width:' + Math.max(2, Math.min(100, num(ratio))) + '%"></span></div>';
    /* 数字滚动（分镜 6）的钩子：只有"纯数字"才补间，混合文案（如 "3 / 2"）保持静态。
       data-count-key 用标签做快照键：值没变就不重滚（否则每次 vault 刷新都滚一遍）。 */
    var text = String(value);
    var countable = /^\d+$/.test(text) && String(Number(text)) === text;
    var countAttr = countable ? ' data-count="' + text + '" data-count-key="' + escapeHtml(label) + '"' : "";
    var inner = '<div class="kpi-label">' + escapeHtml(label) + "</div>"
      + '<div class="kpi-value"' + countAttr + ">" + escapeHtml(value) + "</div>"
      + '<div class="kpi-hint">' + escapeHtml(hint) + "</div>" + bar;
    if (!view) return '<div class="kpi">' + inner + "</div>";
    return '<button type="button" class="kpi kpi-link" data-action="switch-view" data-view="' + escapeHtml(view) + '"'
      + ' title="查看' + escapeHtml(label) + '">' + inner + "</button>";
  }

  /**
   * 素材路径清洗：只剥掉会破坏 CSS url() / HTML 属性的字符（引号、括号、尖括号、
   * 花括号、分号、反斜杠、空白），其余一律保留。
   *
   * 不能用白名单：插件宿主传入的是 Obsidian 的 app:// 资源 URL，桌面端会带上
   * 未做百分号编码的 vault 路径（含中文与 +），白名单会把它们吃掉，导致横幅与
   * 导航卡图片加载失败。安全边界仍然成立——url() 与属性都用双引号包裹，
   * 引号、括号、分号、空白全部被剥掉，无法逃逸出这个上下文。
   */
  function assetFile(asset) {
    return asset && asset.file ? String(asset.file).replace(/["'()<>{};\\\s]/g, "") : "";
  }
  function assetInk(asset, fallback) {
    return asset && asset.suggestedInk ? String(asset.suggestedInk).replace(/[^#0-9a-fA-F]/g, "") : fallback;
  }
  function bandStyle(file, tone, ink, prefix) {
    if (!file) return "";
    return ' style="background-image:url(&quot;' + file + '&quot;);--' + prefix + '-tone:' + tone + ';--' + prefix + '-ink:' + ink + '"';
  }

  /**
   * 顶部横幅：横幅素材 + 长期定位 + 当前日期。
   * 遮罩强度与文字色按 assets/manifest.json 的实测平均亮度（tone: light / dark）自动匹配；
   * 素材缺失时回退到纯 CSS 渐变，页面仍然可用。
   */
  function heroHtml(data) {
    var hero = (data.assets || {}).hero || null;
    var file = assetFile(hero);
    var tone = hero && hero.tone === "light" ? "light" : "dark";
    var ink = assetInk(hero, tone === "light" ? "#1b1420" : "#fdf7f4");
    /* 取景（来自插件设置里的横幅裁剪）：只设 background-position 是不够的 ——
       cover 只会平移、不会放大到取景区域，窄窗口下就会显示"图片中间那一块"。
       要复现取景框，必须同时放大：background-size 宽度 = 100 / w；
       位置用 CSS 百分比定位公式（百分比相对**溢出部分**算）：P = 取景框起点 / (1 - 取景框尺寸)。 */
    var crop = hero && hero.crop;
    var cropAttr = "";
    var cropStyle = "";
    if (crop && Number(crop.w) > 0 && Number(crop.w) <= 1 && Number(crop.h) > 0 && Number(crop.h) <= 1) {
      var cw = Number(crop.w);
      var ch = Number(crop.h);
      var px = cw >= 1 ? 50 : (Math.max(0, Number(crop.x) || 0) / (1 - cw)) * 100;
      var py = ch >= 1 ? 50 : (Math.max(0, Number(crop.y) || 0) / (1 - ch)) * 100;
      cropAttr = ' data-crop="true"';
      cropStyle = ";background-size:" + (100 / cw).toFixed(4) + "% auto;background-position:" +
        px.toFixed(2) + "% " + py.toFixed(2) + "%";
    }
    var meta = [escapeHtml(data.today) + " " + weekdayLabel(data.today)];
    meta.push("进行中任务 " + num(data.stats.activeTasks));
    meta.push("项目 " + num(data.stats.projects));
    if (num(data.stats.overdue)) meta.push("逾期 " + num(data.stats.overdue));
    if (num(data.stats.inbox)) meta.push("草稿 " + num(data.stats.inbox));

    /* 把取景样式并进 bandStyle 生成的那个 style 属性（它一定以 " 结尾） */
    var band = bandStyle(file, tone, ink, "band");
    if (cropStyle && band) band = band.replace(/"$/, cropStyle + '"');

    return '<header class="hero' + (file ? " hero-has-image" : "") + '" data-tone="' + tone + '"' + cropAttr + band + '>'
      + '<div class="hero-copy">'
      + '<span class="eyebrow">PERSONAL OPERATING SYSTEM</span>'
      + "<h1>把今天的行动，放回长期方向里。</h1>"
      + '<p class="hero-sub">项目负责结果，任务负责执行，笔记负责记忆。数据来自 vault 的 frontmatter，界面上的操作会直接写回笔记。</p>'
      + '<p class="hero-meta">' + meta.map(function (item) { return '<span class="eyebrow">' + escapeHtml(item) + "</span>"; }).join("") + "</p>"
      + "</div></header>";
  }

  /** 今日焦点：左侧 3px 珊瑚竖线 + 玻璃面板，附一个直接动作。 */

  /** 今日焦点：一条最该推进的事 + 逾期/今天/未来 7 天的分桶计数 + 接下来三条任务。
   *  每条都能就地「标记完成」——早上打开仪表盘时是"直接做"，而不是"再点三层进去做"。 */
  /** 上次批量操作没成功的条目：通知会消失，但"这几条没成功"要留在界面上，能一键重试。 */
  function bulkFailureStrip(data) {
    var info = data && data.bulkFailures;
    if (!info || !info.paths || !info.paths.length) return "";
    var list = (info.messages && info.messages.length ? info.messages : info.paths).slice(0, 5).join("；");
    return '<section class="panel span-12 bulk-failure" role="status">'
      + '<div class="panel-head"><div><h2>上次操作有 ' + info.paths.length + " 条没成功</h2>"
      + "<p>" + escapeHtml(info.kind || "批量操作") + " · " + escapeHtml(list) + (info.paths.length > 5 ? " …" : "") + "</p></div>"
      + '<div class="panel-tools">'
      + (info.action ? '<button type="button" class="link-btn" data-action="retry-bulk">重试这 ' + info.paths.length + " 条</button>" : "")
      + '<button type="button" class="link-btn" data-action="dismiss-bulk-failures">知道了</button>'
      + "</div></div>"
      + '<div class="panel-body"><p class="kpi-hint">' + escapeHtml(info.paths.slice(0, 8).join("、")) + (info.paths.length > 8 ? " …" : "") + "</p></div></section>";
  }

  function focusStripHtml(data) {
    var focus = focusTask(data.tasks);
    var open = (data.tasks || []).filter(isOpen);
    var overdue = open.filter(isOverdue).sort(function (a, b) { return num(a.daysLeft) - num(b.daysLeft); });
    var today = open.filter(function (task) { return task.due && num(task.daysLeft) === 0; });
    var week = open.filter(function (task) { return task.due && num(task.daysLeft) > 0 && num(task.daysLeft) <= 7; });
    var hint = focus
      ? (focus.due ? dueLabel(focus.daysLeft) + " · " + minutesLabel(focus.duration) : "无 DDL · " + minutesLabel(focus.duration))
      : "新建项目、任务，或先把草稿箱分诊掉。";
    var counts = [["逾期", overdue.length, overdue.length ? "blocked" : "muted"], ["今天", today.length, "muted"], ["未来 7 天", week.length, "muted"]]
      .map(function (row) { return chip(row[0] + " " + row[1], { "data-tone": row[2] }); }).join("");

    var next = overdue.concat(today, week).slice(0, 3);
    var nextHtml = next.length
      ? '<ul class="focus-list">' + next.map(function (task) {
        return '<li class="focus-item">'
          + '<button type="button" class="row-title" data-action="detail-task" data-path="' + escapeHtml(task.path) + '">' + escapeHtml(task.title) + "</button>"
          + chip(dueLabel(task.daysLeft), { "data-tone": dueTone(task.daysLeft) })
          + (canWrite() ? actionButton("set-task-status", task.path, "标记完成", "done") : "")
          + "</li>";
      }).join("") + "</ul>"
      : '<p class="focus-empty">没有逾期或临近 DDL 的任务。</p>'
        + (canWrite() ? '<div class="meta-row">' + actionButton("new-task", "__vault__", "新建任务")
          + '<button type="button" class="link-btn" data-action="switch-view" data-view="inbox">去草稿箱分诊</button></div>' : "");

    return '<section class="focus-strip span-12">'
      + '<span class="eyebrow">TODAY / 今日焦点</span>'
      + "<strong>" + escapeHtml(focus ? focus.title : "先选一个值得推进的下一步") + "</strong>"
      + '<span class="focus-hint">' + escapeHtml(hint) + "</span>"
      + '<div class="meta-row focus-counts">' + counts + "</div>"
      + (focus ? '<button type="button" class="link-btn" data-action="detail-task" data-path="' + escapeHtml(focus.path) + '">查看焦点任务</button>' : "")
      + nextHtml
      + "</section>";
  }

  /** 索引导航：三张图像卡（任务执行 / 知识沉淀 / 项目推演），遮罩与文字色按实测亮度匹配 */
  function waypointsHtml(data) {
    var assets = (data && data.assets) || {};
    var cards = [
      { key: "cardBuild", view: "tasks", title: "任务执行", text: "把计划变成下一步行动" },
      { key: "cardLearn", view: "knowledge", title: "知识沉淀", text: "让每次学习都可复用" },
      { key: "cardGrow", view: "projects", title: "项目推演", text: "连接长期领域与今天" }
    ];
    var html = '<div class="waypoints span-12">';
    cards.forEach(function (card) {
      var asset = assets[card.key] || null;
      var file = assetFile(asset);
      var tone = asset && asset.tone === "light" ? "light" : "dark";
      var ink = assetInk(asset, tone === "light" ? "#1b1420" : "#fdf7f4");
      html += '<button type="button" class="waypoint' + (file ? " waypoint-has-image" : "") + '" data-tone="' + tone + '" data-action="switch-view" data-view="' + card.view + '"' + bandStyle(file, tone, ink, "card") + '>'
        + '<strong class="waypoint-title">' + escapeHtml(card.title) + "</strong>"
        + '<span class="waypoint-description">' + escapeHtml(card.text) + "</span></button>";
    });
    return html + "</div>";
  }

  /**
   * 今日任务监控：先回答「今天要干什么」——今天到期的任务清单 + 今日容量占用，
   * 再给未来几天的负载柱（含今天，方便看趋势）。
   *
   * 今日任务行用紧凑单行结构，标题允许换行：这一栏就是要看清任务名的，
   * 不能用省略号截断成"只剩前几个字"。
   */
  function timelineHtml(data, tasks) {
    var plan = data.timePlan || { days: [], unscheduled: [] };
    if (!plan.days.length) return emptyState("暂无时间规划", "给任务设置 DDL 和预计耗时后，这里会显示今日容量与未来负载。");
    var capacity = data.settings.dailyCapacityMinutes || 120;
    var byPath = new Map((tasks || []).map(function (task) { return [task.path, task]; }));
    /* buildTimePlan 从今天开始按 DDL 排期，今天那一格一定是第一格；
       仍然按日期查找，避免上游改变起点时静默错位。 */
    var todayPlan = plan.days.filter(function (day) { return day.date === data.today; })[0] || plan.days[0];
    var todayTasks = (todayPlan.taskPaths || []).map(function (path) { return byPath.get(path); }).filter(Boolean);
    var todayMinutes = todayTasks.reduce(function (sum, task) { return sum + (Number(task.duration) || 0); }, 0);
    var todayRows = todayTasks.map(function (task) {
      return '<div class="task-line today-line" data-status="' + escapeHtml(task.status) + '" title="' + escapeHtml(task.title) + '">'
        + '<span class="task-line-dot" data-status="' + escapeHtml(task.status) + '" aria-hidden="true"></span>'
        + '<button type="button" class="task-line-title" data-action="detail-task" data-path="' + escapeHtml(task.path) + '">' + escapeHtml(task.title) + "</button>"
        + '<span class="task-line-meta"><span class="task-line-due" data-tone="' + escapeHtml(dueTone(task.daysLeft)) + '">'
        + escapeHtml(minutesLabel(task.duration)) + "</span></span></div>";
    }).join("");
    var html = '<div class="today-monitor">'
      + '<div class="today-head">'
      + '<span class="eyebrow">TODAY / 今日</span>'
      + "<strong>" + escapeHtml(shortDate(todayPlan.date)) + " " + escapeHtml(weekdayLabel(todayPlan.date)) + "</strong>"
      + '<span class="today-load"' + (todayPlan.overloaded ? ' data-over="true"' : "") + ">"
      + todayTasks.length + " 项 · " + todayMinutes + " 分钟" + (todayPlan.overloaded ? " · 超载" : "") + "</span>"
      + "</div>"
      + (todayRows
        ? '<div class="task-list today-tasks">' + todayRows + "</div>"
        : '<p class="empty" style="padding:2px 0 0">今天没有到期的任务。</p>')
      + "</div>";

    html += '<div class="timeline-label">未来 ' + plan.days.length + " 天负载</div><div class=\"timeline\">";
    plan.days.forEach(function (day) {
      var ratio = Math.max(2, Math.min(100, Math.round((day.minutes / (day.capacity || capacity)) * 100)));
      var titles = (day.taskPaths || []).map(function (path) { var task = byPath.get(path); return task ? task.title + "（" + minutesLabel(task.duration) + "）" : path; });
      html += '<div class="day" data-overload="' + (day.overloaded ? "true" : "false") + '"'
        + (day.date === todayPlan.date ? ' data-today="true"' : "")
        + ' title="' + escapeHtml(titles.join("\n") || "无任务") + '">'
        + '<div class="day-bar"><div class="day-fill" style="height:' + ratio + '%"></div></div>'
        + '<span class="day-label">' + escapeHtml(shortDate(day.date)) + " " + escapeHtml(weekdayLabel(day.date)) + "</span>"
        + '<span class="day-minutes">' + day.minutes + "/" + (day.capacity || capacity) + " 分" + (day.overloaded ? " · 超载" : "") + "</span>"
        + "</div>";
    });
    html += "</div>";
    if (plan.unscheduled && plan.unscheduled.length) {
      html += '<p class="empty" style="padding:12px 0 0">未排期任务 ' + plan.unscheduled.length + " 项（没有 DDL，不会被自动安排）</p>";
    }
    return html;
  }

  /** 完成度：1px 细线进度 + 衬线百分比。与插件单项目页完全一致，不使用任何图形元素。 */
  function progressLine(percent) {
    var value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    return '<div class="progress-line" role="group" aria-label="完成度 ' + value + '%">'
      + '<span class="progress-value">' + value + '%</span>'
      + '<span class="progress-bar"><span class="progress-fill" style="width:' + value + '%"></span></span>'
      + "</div>";
  }

  function projectCard(project, tasks, options) {
    var owned = (tasks || []).filter(function (task) { return task.projectPath === project.path; });
    var byMilestone = new Map();
    owned.forEach(function (task) {
      var key = task.milestone || "未分组";
      byMilestone.set(key, (byMilestone.get(key) || 0) + 1);
    });
    var milestones = (project.milestones || []).map(function (name) {
      var count = byMilestone.get(name) || 0;
      var done = owned.filter(function (task) { return (task.milestone || "未分组") === name && !isOpen(task); }).length;
      /* 节点里有阻塞任务 → 这个节点整体标红（"关键节点变红"） */
      var nodeBlocked = owned.filter(function (task) { return (task.milestone || "未分组") === name && isBlocked(task); }).length;
      var tone = nodeBlocked ? "blocked" : (name === "未分组" ? "muted" : "");
      return chipButton(name + (count ? " " + done + "/" + count : "") + (nodeBlocked ? " · 阻塞 " + nodeBlocked : ""), { "data-action": "open-node", "data-path": project.path, "data-name": name, "data-tone": tone });
    }).join("");

    /* 阻塞项不再是项目文档里的独立清单：它就是"哪些任务被标成阻塞"，数量以红点提示在卡片右上角 */
    var blockedCount = owned.filter(isBlocked).length;
    var blockedBadge = blockedCount
      ? '<span class="blocked-badge" title="' + escapeHtml(blockedCount + " 个阻塞任务：" + owned.filter(isBlocked).map(function (task) {
        var reason = String((task.frontmatter && task.frontmatter.blocking_reason) || "").trim();
        return task.title + (reason ? "（" + reason + "）" : "");
      }).join("；")) + '" aria-label="' + blockedCount + ' 个阻塞任务">' + blockedCount + "</span>"
      : "";

    /* 勾选框是"能批量操作"才需要的东西：项目页签有全选与批量改状态工具栏，
       而仪表盘的「项目推演」是只读概览，卡片左上角不需要这个浮层勾选框。 */
    var selectable = Boolean(options && options.select) && canWrite();

    return '<article class="project-card">'
      + (selectable ? '<label class="card-check"><input type="checkbox" class="draft-check" data-action="select-project" data-path="' + escapeHtml(project.path) + '"'
        + ' aria-label="选择项目：' + escapeHtml(project.title) + '"' + (isPicked("project", project.path) ? " checked" : "") + "></label>" : "")
      + blockedBadge
      + '<div class="project-head"><div>'
      + '<button type="button" class="row-title" data-action="detail-project" data-path="' + escapeHtml(project.path) + '"><h3 style="display:inline">' + escapeHtml(project.title) + "</h3></button>"
      + '<div class="project-sub">' + escapeHtml(project.area || "未归属领域") + " · 权重 " + escapeHtml(project.weight || "—") + " · DDL " + escapeHtml(formatDate(project.deadline)) + "</div>"
      + "</div>" + progressLine(project.progress) + "</div>"
      + (project.outcome ? '<p class="project-outcome">' + escapeHtml(project.outcome) + "</p>" : "")
      + '<div class="meta-row">'
      + chip(statusLabelOf(project.status), { "data-status": project.status })
      + chip(dueLabel(project.daysLeft), { "data-tone": dueTone(project.daysLeft) })
      + chip(project.done + "/" + project.total + " 任务完成")
      + milestones
      + "</div>"
      + '<div class="project-foot">'
      + '<span class="kpi-hint">' + escapeHtml(project.path) + "</span>"
      + '<span class="meta-row">'
      + '<button type="button" class="link-btn" data-action="detail-project" data-path="' + escapeHtml(project.path) + '">项目详情</button>'
      + openNoteButton(project.path)
      + "</span></div></article>";
  }

  /* ---------------------------- 各视图 ---------------------------- */

  function renderOverview(data) {
    var tasks = data.tasks || [];
    var open = tasks.filter(isOpen);
    var overdue = tasks.filter(isOverdue);
    var knowledge = data.resources || {};
    var knowledgeCount = (knowledge.knowledge || []).length + (knowledge.books || []).length + (knowledge.videos || []).length;

    var kpis = [
      /* pct() 已经返回 0–100；再乘 100 会被 kpiCard 夹成「满格或 2%」，进度条就失去意义了 */
      kpiCard("进行中项目", num(data.stats.activeProjects), "共 " + num(data.stats.projects) + " 个项目", pct(num(data.stats.activeProjects), Math.max(1, num(data.stats.projects))), "projects"),
      kpiCard("未来 " + num(data.settings.planningHorizonDays) + " 天任务", num(data.stats.upcoming), "每日容量 " + minutesLabel(num(data.settings.dailyCapacityMinutes)), pct(num(data.stats.upcoming), Math.max(1, open.length)), "tasks"),
      kpiCard("逾期任务", overdue.length, overdue.length ? "最早：" + overdue.sort(function (a, b) { return num(a.daysLeft) - num(b.daysLeft); })[0].title : "没有逾期任务", pct(overdue.length, Math.max(1, open.length)), "tasks"),
      kpiCard("草稿箱 / 知识缺口", num(data.stats.inbox) + " / " + num(data.stats.gaps), "知识资源 " + knowledgeCount + " 条", pct(num(data.stats.inbox) + num(data.stats.gaps), Math.max(1, open.length + num(data.stats.inbox))), "inbox")
    ].join("");

    var focusList = sortTasks(overdue.concat(tasks.filter(function (task) { return isOpen(task) && task.due && task.daysLeft >= 0 && task.daysLeft <= 7; })), "due").slice(0, 7);
    var projectCards = (data.projects || []).slice(0, 4).map(function (project) { return projectCard(project, tasks); }).join("");

    /* 空库引导：整库没有项目也没有任务时，光看空面板会以为"插件坏了"。
       直接告诉用户数据从哪来、下一步点什么。 */
    var onboarding = "";
    if (!num(data.stats.projects) && !num(data.stats.activeTasks)) {
      onboarding = '<section class="onboarding span-12">'
        + '<span class="eyebrow">开始使用</span>'
        + "<strong>这个仪表盘没有自己的数据，它只读你 vault 里的 Markdown</strong>"
        + '<span class="onboarding-hint">先建目录，再新建一个项目或任务；笔记的 frontmatter 就是唯一事实来源。</span>'
        + '<span class="onboarding-actions">'
        + (canWrite() ? '<button type="button" class="primary-btn" data-action="init-structure">初始化目录结构</button>' : "")
        + (canWrite() ? '<button type="button" class="link-btn" data-action="new-project">新建项目</button>' : "")
        + '<button type="button" class="link-btn" data-action="switch-view" data-view="data">先看看整库有哪些笔记</button>'
        + "</span></section>";
    }

    return '<div class="grid">'
      + onboarding
      + kpis
      + focusStripHtml(data)
      + waypointsHtml(data)
      + '<section class="panel span-7"><div class="panel-head"><div><h2>项目推演</h2><p>项目是决策层，任务是执行层；点击进入项目详情。</p></div>'
      + '<div class="panel-tools"><button type="button" class="link-btn" data-action="switch-view" data-view="projects">全部项目</button>'
      + (canWrite() ? '<button type="button" class="link-btn" data-action="new-project">新建项目</button>' : "") + "</div></div>"
      + '<div class="panel-body">' + (projectCards ? '<div class="project-list">' + projectCards + "</div>" : emptyState("暂无项目", "在 Obsidian 中新建项目后，这里会显示权重、DDL 与完成度。")) + "</div></section>"
      + '<section class="panel span-5"><div class="panel-head"><div><h2>今日任务监控</h2><p>今天到期的任务与容量占用；下面是未来几天的负载。</p></div></div>'
      + '<div class="panel-body">' + timelineHtml(data, tasks) + "</div></section>"
      + '<section class="panel span-7"><div class="panel-head"><div><h2>时间监控</h2><p>逾期与未来 7 天内的任务，按 DDL 排序。</p></div>'
      + '<div class="panel-tools"><button type="button" class="link-btn" data-action="switch-view" data-view="tasks">全部任务</button></div></div>'
      + '<div class="panel-body">' + (focusList.length ? focusList.map(taskRow).join("") : emptyState("时间线上没有待处理任务", "给任务设置 DDL 后会出现在这里。")) + "</div></section>"
      + '<section class="panel span-5"><div class="panel-head"><div><h2>知识缺口 / 学习计划</h2><p>缺口沉淀到知识库后，会被任务引用复用。</p></div></div>'
      + '<div class="panel-body">' + ((data.gaps || []).length ? data.gaps.slice(0, 6).map(taskRow).join("") : emptyState("暂无显式知识缺口", "把任务类型设为 knowledge-gap 后会出现在这里。")) + "</div></section>"
      + "</div>";
  }

  function renderTasks(data) {
    var all = data.tasks || [];
    /* 已完成的任务不再"消失"：留在列表里（删除线 + 灰字）并沉到所在任务组的最底下 ——
       它们是"这周做完了什么"的记录。真正归档过的（status: archived）仍不进这个页签，
       它们在「数据」页签里可以找到并撤销归档。 */
    var tasks = all.filter(function (task) { return String(task.status) !== "archived"; });
    /* 真正归档过的（status: archived）不进这个页签，但页首留一条去「数据」页签的入口 */
    var archived = all.filter(function (task) { return String(task.status) === "archived"; });
    var visible = sortTasks(filterTasks(tasks, state.filters), state.filters.sort);
    var sets = uniqueValues(tasks, function (task) { return task.taskSet; });
    var groups = uniqueValues(tasks, function (task) { return task.taskGroup; });
    var statuses = ["planning", "todo", "doing", "blocked", "paused", "expired", "done"];

    var option = function (value, label, current) {
      return '<option value="' + escapeHtml(value) + '"' + (value === current ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
    };
    var filters = '<div class="filters">'
      + '<div class="field"><label for="q">搜索</label><input id="q" type="search" placeholder="任务名称 / 项目 / 节点" value="' + escapeHtml(state.filters.query) + '"></div>'
      + '<div class="field"><label for="f-set">任务集</label><select id="f-set">' + option("all", "全部任务集", state.filters.taskSet) + sets.map(function (value) { return option(value, value, state.filters.taskSet); }).join("") + "</select></div>"
      + '<div class="field"><label for="f-group">任务组</label><select id="f-group">' + option("all", "全部任务组", state.filters.taskGroup) + groups.map(function (value) { return option(value, value, state.filters.taskGroup); }).join("") + "</select></div>"
      + '<div class="field"><label for="f-status">状态</label><select id="f-status">' + option("all", "全部状态", state.filters.status) + statuses.map(function (value) { return option(value, statusLabelOf(value), state.filters.status); }).join("") + "</select></div>"
      + '<div class="field"><label for="f-priority">优先级</label><select id="f-priority">' + option("all", "全部优先级", state.filters.priority) + ["high", "medium", "low"].map(function (value) { return option(value, priorityInfo(value).label, state.filters.priority); }).join("") + "</select></div>"
      + '<div class="field"><label for="f-sort">排序</label><select id="f-sort">' + option("due", "按 DDL", state.filters.sort) + option("priority", "按优先级", state.filters.sort) + option("duration", "按耗时", state.filters.sort) + "</select></div>"
      + '<button type="button" class="link-btn" data-action="reset-filters">重置筛选</button>'
      + "</div>";

    var body;
    if (!tasks.length) {
      body = emptyState("还没有任务", "在 Obsidian 里用插件命令「新建任务」创建第一个任务。");
    } else if (!visible.length) {
      body = emptyState("没有符合筛选的任务", "调整搜索词或筛选条件，或点击「重置筛选」。");
    } else {
      body = groupTasks(visible).map(function (set) {
        return '<div class="task-set"><h3>' + escapeHtml(set.name) + "</h3>"
          + set.groups.map(function (group) {
            return '<div class="task-group"><h4>' + escapeHtml(group.name) + " · " + group.tasks.length + "</h4>"
              + group.tasks.map(function (task) { return taskRow(task, { select: true }); }).join("") + "</div>";
          }).join("")
          + "</div>";
      }).join("");
    }

    /* 批量操作：勾选后一次改状态 / 一次挂到同一个项目与关键节点（任务集里常有"同属一个节点"的一批任务） */
    var picked = tasks.filter(function (task) { return isPicked("task", task.path); });
    var projectOptions = '<option value="">（不改项目）</option>' + (data.projects || []).map(function (project) {
      return option(project.path, project.title, "");
    }).join("");
    var milestones = {};
    (data.projects || []).forEach(function (project) {
      (project.milestones || []).forEach(function (name) { milestones[String(name)] = true; });
    });
    picked.forEach(function (task) { if (task.milestone) milestones[String(task.milestone)] = true; });
    var milestoneOptions = '<option value="">（不改节点）</option>' + Object.keys(milestones).sort().map(function (name) {
      return option(name, name, "");
    }).join("");
    var tools = '<span class="chip" data-tone="muted">共 ' + tasks.length + " 项 · 显示 " + visible.length + "</span>";
    if (canWrite() && tasks.length) {
      tools = '<button type="button" class="link-btn" data-action="select-all-tasks">'
        + (picked.length === tasks.length ? "取消全选" : "全选") + "</button>"
        + (picked.length ? '<span class="chip" data-tone="warn">已选 ' + picked.length + "</span>" : "")
        + (picked.length ? '<button type="button" class="link-btn" data-action="bulk-task-status" data-status="done">标记完成</button>'
          /* 已完成的任务现在也留在本页签（只是沉到组底），所以批量里也要能一次改回待办。
             重复任务的「标记完成」不会把整条标成 done —— 它只把执行日推进到下一个周期。 */
          + '<button type="button" class="link-btn" data-action="bulk-task-status" data-status="todo">标记待办</button>'
          + '<button type="button" class="link-btn" data-action="bulk-task-status" data-status="blocked">标记阻塞</button>' : "")
        + (picked.length ? '<label class="field-inline">项目<select class="field-input" id="bulk-project" aria-label="批量改项目">' + projectOptions + "</select></label>"
          + '<label class="field-inline">节点<select class="field-input" id="bulk-milestone" aria-label="批量改关键节点">' + milestoneOptions + "</select></label>"
          + '<button type="button" class="link-btn" data-action="bulk-task-attribution">应用归属</button>' : "")
        + tools
        + (canWrite() ? '<button type="button" class="link-btn" data-action="new-task">新建任务</button>' : "")
        + (archived.length ? '<button type="button" class="link-btn" data-action="switch-view" data-view="data">已归档 ' + archived.length + " 项 → 数据页签</button>" : "");
    }
    return '<section class="panel span-12"><div class="panel-head"><div><h2>日程待办</h2><p>按任务集 → 任务组 → 任务展示；筛选结果同样保持这个层级。勾选多条可一次改状态或挂到同一个项目、关键节点。</p></div>'
      + '<div class="panel-tools">' + tools + "</div></div>"
      + '<div class="panel-body">' + filters + body + "</div></section>";
  }

  function renderProjects(data) {
    var tasks = data.tasks || [];
    var projects = data.projects || [];
    if (!projects.length) {
      return '<section class="panel span-12"><div class="panel-head"><div><h2>项目推演</h2><p>还没有项目。</p></div></div>'
        + '<div class="panel-body">' + emptyState("暂无项目", "项目文档需要 type: project，或直接放在项目库目录下。") + "</div>"
        + (canWrite() ? '<div class="panel-body"><button type="button" class="link-btn" data-action="new-project">新建项目</button></div>' : "") + "</section>";
    }
    /* 批量改项目状态：与任务页签同一套勾选交互（改状态不移动文件，安全） */
    var pickedProjects = projects.filter(function (project) { return isPicked("project", project.path); });
    var archivedProjects = (data.notes || []).filter(function (note) { return note.archived && note.kind === "project"; });
    var projectTools = '<span class="chip" data-tone="muted">共 ' + projects.length + " 个项目</span>";
    if (canWrite()) {
      projectTools = '<button type="button" class="link-btn" data-action="select-all-projects">'
        + (pickedProjects.length === projects.length ? "取消全选" : "全选") + "</button>"
        + (pickedProjects.length ? '<span class="chip" data-tone="warn">已选 ' + pickedProjects.length + "</span>"
          + '<button type="button" class="link-btn" data-action="bulk-project-status" data-status="active">设为进行中</button>'
          + '<button type="button" class="link-btn" data-action="bulk-project-status" data-status="completed">设为已完成</button>'
          + '<button type="button" class="link-btn" data-action="bulk-project-status" data-status="paused">设为暂停</button>' : "")
        + (archivedProjects.length ? '<button type="button" class="link-btn" data-action="switch-view" data-view="data">已归档 ' + archivedProjects.length + " 个项目 → 数据页签</button>" : "")
        + projectTools
        + '<button type="button" class="link-btn" data-action="new-project">新建项目</button>';
    }
    return '<div class="grid"><section class="panel span-12"><div class="panel-head"><div><h2>项目推演</h2><p>最终结果、验收标准、关键节点与完成度；哪个节点被阻塞，节点会直接标红。勾选多个项目可一次改状态。</p></div>'
      + '<div class="panel-tools">' + projectTools + "</div></div>"
      + '<div class="panel-body"><div class="project-list">' + projects.map(function (project) { return projectCard(project, tasks, { select: true }); }).join("") + "</div></div></section></div>";
  }

  /** 资源面板：条目列表 + 「新建」入口。
   *  之前只能在 Obsidian 里手动建笔记，资源页只读；现在每个面板都能就地新建对应类型的笔记。 */
  function resourcePanel(title, hint, items, span, createKind) {
    var body = items.length
      ? '<div class="res-list">' + items.map(function (item) {
        return '<div class="res-item"><span>'
          + '<button type="button" class="row-title" data-action="open-note" data-path="' + escapeHtml(item.path) + '">' + escapeHtml(item.title) + "</button>"
          + (item.role ? ' <small>' + escapeHtml(item.role) + "</small>" : "")
          + (item.state ? ' <small>' + escapeHtml(item.state) + "</small>" : "")
          + (item.refs && item.refs.length ? ' <small>· ' + escapeHtml(item.refs.slice(0, 3).join(" / ")) + "</small>" : "")
          + "</span>"
          + '<span class="meta-row"><small class="kpi-hint">' + escapeHtml(item.type || "") + "</small>"
          + (canWrite() && item.type === "book" ? actionButton("archive-book", item.path, "归档") : "") + "</span></div>";
      }).join("") + "</div>"
      : emptyState("暂无条目", createKind && canWrite() ? "点右上角「" + resourceCreateLabel(createKind) + "」就能建第一条。" : "在对应目录里创建笔记后会自动出现在这里。");
    var tools = '<span class="chip" data-tone="muted">' + items.length + " 条</span>";
    if (createKind && canWrite()) {
      tools = '<button type="button" class="link-btn" data-action="new-resource" data-kind="' + createKind + '">'
        + escapeHtml(resourceCreateLabel(createKind)) + "</button>" + tools;
    }
    return '<section class="panel ' + span + '"><div class="panel-head"><div><h2>' + escapeHtml(title) + "</h2><p>" + escapeHtml(hint) + "</p></div>"
      + '<div class="panel-tools">' + tools + "</div></div>"
      + '<div class="panel-body">' + body + "</div></section>";
  }

  function resourceCreateLabel(kind) {
    return { knowledge: "新建知识", book: "新建图书", area: "新建领域", person: "新建人物" }[kind] || "新建";
  }

  function renderKnowledge(data) {
    var resources = data.resources || {};
    var projectByArea = new Map();
    (data.projects || []).forEach(function (project) {
      var key = project.area || "";
      if (key) projectByArea.set(key, (projectByArea.get(key) || 0) + 1);
    });
    var areas = (resources.areas || []).map(function (area) {
      return Object.assign({}, area, { projects: projectByArea.get(area.title) || 0 });
    });
    var areaCards = areas.length
      ? '<div class="area-grid">' + areas.map(function (area) {
        return '<div class="area-card"><strong>' + escapeHtml(area.title) + "</strong><span>关联项目 " + area.projects + " 个</span></div>";
      }).join("") + "</div>"
      : emptyState("暂无长期领域", createKindHint("area"));
    var areaTools = '<span class="chip" data-tone="muted">' + areas.length + " 个</span>";
    if (canWrite()) areaTools = '<button type="button" class="link-btn" data-action="new-resource" data-kind="area">新建领域</button>' + areaTools;

    /* 知识缺口：标了 type: knowledge-gap 的任务。放在知识页签里最顺手 ——
       "知道自己缺什么"和"把它沉淀成一篇知识"本来就该在同一处完成。 */
    var gaps = (data.tasks || []).filter(function (task) { return String(task.type || "") === "knowledge-gap" && isOpen(task); });
    var gapBody = gaps.length
      ? '<div class="res-list">' + gaps.map(function (task) {
        return '<div class="res-item"><span>'
          + (canWrite() ? '<input type="checkbox" class="draft-check" data-action="select-gap" data-path="' + escapeHtml(task.path) + '"'
            + ' aria-label="选择知识缺口：' + escapeHtml(task.title) + '"' + (isPicked("gap", task.path) ? " checked" : "") + ">" : "")
          + '<button type="button" class="row-title" data-action="detail-task" data-path="' + escapeHtml(task.path) + '">' + escapeHtml(task.title) + "</button>"
          + '<small class="kpi-hint"> · ' + escapeHtml(task.path) + "</small></span>"
          + '<span class="meta-row">' + chip(statusLabelOf(task.status), { "data-status": task.status })
          + (task.due ? chip(dueLabel(task.daysLeft), { "data-tone": dueTone(task.daysLeft) }) : "")
          + (canWrite() ? actionButton("gap-sink", task.path, "沉淀为知识") : "") + "</span></div>";
      }).join("") + "</div>"
      : emptyState("没有未沉淀的知识缺口", "把任务标成 type: knowledge-gap，它就会出现在这里。");
    var gapTools = '<span class="chip" data-tone="' + (gaps.length ? "warn" : "muted") + '">' + gaps.length + " 个待沉淀</span>";
    if (gaps.length) {
      var gapPicked = gaps.filter(function (task) { return isPicked("gap", task.path); }).length;
      gapTools = '<button type="button" class="link-btn" data-action="select-all-gaps">' + (gapPicked === gaps.length ? "取消全选" : "全选") + "</button>"
        + (gapPicked ? '<span class="chip" data-tone="warn">已选 ' + gapPicked + "</span>"
          + '<button type="button" class="link-btn" data-action="bulk-sink-gaps">按标题沉淀（' + gapPicked + "）</button>" : "")
        + gapTools
        + '<button type="button" class="link-btn" data-action="switch-view" data-view="tasks">去任务页签看全部</button>';
    }

    return '<div class="grid">'
      + resourcePanel("知识笔记", "可被任务 knowledge_refs 引用的方法、模板与结论。", resources.knowledge || [], "span-6", "knowledge")
      + resourcePanel("图书", "阅读中的书与读书笔记。", resources.books || [], "span-6", "book")
      + '<section class="panel span-12"><div class="panel-head"><div><h2>知识缺口</h2><p>还没沉淀成笔记的"待学习 / 待搞清楚"，沉淀后会变成知识笔记并回写引用。</p></div>'
      + '<div class="panel-tools">' + gapTools + "</div></div>"
      + '<div class="panel-body">' + gapBody + "</div></section>"
      + resourcePanel("视频 / 课程", "课程与视频类学习材料。", resources.videos || [], "span-6")
      + resourcePanel("人物库", "任务的执行者 / 协作者候选。", resources.people || [], "span-6", "person")
      + '<section class="panel span-12"><div class="panel-head"><div><h2>长期领域</h2><p>领域是项目与知识的共同支点。</p></div>'
      + '<div class="panel-tools">' + areaTools + "</div></div>"
      + '<div class="panel-body">' + areaCards + "</div></section>"
      + "</div>";
  }

  /** 勾选会让整表重绘；重绘后把焦点还给同一行，键盘用户连续勾选不会丢位置。 */
  function refocusSelection(action, path) {
    /* 必须从 Shadow DOM 里查：document 查不到插件窗格内的元素 */
    var root = ($id("view") || $id("app") || document);
    var nodes = root.querySelectorAll('[data-action="' + action + '"]');
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].getAttribute("data-path") === path) {
        if (nodes[i].focus) nodes[i].focus();
        return;
      }
    }
  }

  /** 批量选择桶：草稿箱 / 数据 / 任务 / 项目共用 */
  function selectionStore(kind) {
    if (!state.selection) state.selection = {};
    if (!state.selection[kind]) state.selection[kind] = {};
    return state.selection[kind];
  }

  function selectionPaths(kind) {
    var store = selectionStore(kind);
    return Object.keys(store).filter(function (path) { return store[path]; });
  }

  function clearSelection(kind) {
    if (!state.selection) state.selection = {};
    state.selection[kind] = {};
  }

  /** 全选 / 取消全选：已经全选就清空，否则全选 */
  function toggleAllSelection(kind, items) {
    var store = selectionStore(kind);
    var every = (items || []).length > 0 && items.every(function (item) { return store[item.path]; });
    clearSelection(kind);
    if (!every) (items || []).forEach(function (item) { selectionStore(kind)[item.path] = true; });
  }

  function isPicked(kind, path) {
    return Boolean(selectionStore(kind)[path]);
  }

  function createKindHint(kind) {
    return canWrite() ? "点右上角「" + resourceCreateLabel(kind) + "」就能建第一条。" : "在对应目录里创建笔记后会自动出现。";
  }

  function renderInbox(data) {
    var inbox = data.inbox || [];
    var picked = inbox.filter(function (item) { return isPicked("draft", item.path); }).length;
    var body = inbox.length
      ? '<div class="res-list">' + inbox.map(function (item) {
        var checked = isPicked("draft", item.path) ? " checked" : "";
        return '<div class="res-item"><span>'
          + (canWrite() ? '<input type="checkbox" class="draft-check" data-action="select-draft" data-path="' + escapeHtml(item.path) + '"'
            + ' aria-label="选择草稿：' + escapeHtml(item.title || item.path) + '"' + checked + ">" : "")
          + '<button type="button" class="row-title" data-action="open-note" data-path="' + escapeHtml(item.path) + '">' + escapeHtml(item.title) + "</button>"
          + (item.summary ? ' <small>· ' + escapeHtml(item.summary) + "</small>" : "")
          + "</span>"
          + '<span class="meta-row">' + chip("阶段：" + (item.stage || "inbox")) + openNoteButton(item.path)
          + (canWrite() ? actionButton("triage-draft", item.path, "分诊") : "") + "</span></div>";
      }).join("") + "</div>"
      : emptyState("草稿箱为空", "临时笔记先放在「00 草稿箱」，分诊后进入项目、任务、知识或归档。");

    /* 周维护：页面上直接多选 + 填任务集/组，不再开"多选"与"表单"两个原生弹窗 */
    var tools = canWrite() && inbox.length
      ? '<span class="chip" data-tone="warn">' + inbox.length + " 条待分诊</span>"
        + '<button type="button" class="link-btn" data-action="select-all-drafts">' + (picked === inbox.length ? "取消全选" : "全选") + "</button>"
        + '<label class="field-inline">任务集<input class="field-input" data-draft-field="taskSet" list="pp-inbox-sets" autocomplete="off" value="本周维护" aria-label="任务集"></label>'
        + '<label class="field-inline">任务组<input class="field-input" data-draft-field="taskGroup" list="pp-inbox-groups" autocomplete="off" value="待整理" aria-label="任务组"></label>'
        /* 候选来自已有任务：既能下拉选已有的任务集 / 任务组，也能直接写新的 */
        + '<datalist id="pp-inbox-sets">' + uniqueTaskValues(data, "taskSet").map(function (value) { return '<option value="' + escapeHtml(value) + '"></option>'; }).join("") + "</datalist>"
        + '<datalist id="pp-inbox-groups">' + uniqueTaskValues(data, "taskGroup").map(function (value) { return '<option value="' + escapeHtml(value) + '"></option>'; }).join("") + "</datalist>"
        + '<button type="button" class="link-btn" data-action="import-drafts"'
        + (picked ? "" : " disabled") + ">导入为任务集" + (picked ? "（" + picked + "）" : "") + "</button>"
      : '<span class="chip" data-tone="' + (inbox.length ? "warn" : "muted") + '">' + inbox.length + " 条待分诊</span>";

    return '<section class="panel span-12"><div class="panel-head"><div><h2>草稿箱</h2><p>插件不会自动判断归属；分诊必须由你显式选择。也可以勾选多条，一次性导入成任务集。</p></div>'
      + '<div class="panel-tools">' + tools + "</div></div>"
      + '<div class="panel-body">' + body + "</div></section>";
  }

  /* ---------------------------- 数据页签 ---------------------------- */

  function noteRow(note) {
    var tools = canWrite()
      ? (note.archived && note.kind === "task" ? actionButton("undo-archive", note.path, "撤销归档") : "")
        + (note.archived && note.kind === "project" ? actionButton("undo-archive-project", note.path, "撤销项目归档") : "")
        + (note.archived && note.kind === "project" ? actionButton("undo-archive-project", note.path, "撤销项目归档") : "")
        + (!note.archived && note.kind === "task" ? actionButton("edit-task", note.path, "编辑") : "")
        + (!note.archived && note.kind === "project" ? actionButton("edit-project", note.path, "编辑项目") : "")
      : "";
    var checked = isPicked("note", note.path) ? " checked" : "";
    return '<div class="res-item"><span>'
      + (canWrite() ? '<input type="checkbox" class="draft-check" data-action="select-note" data-path="' + escapeHtml(note.path) + '"'
        + ' aria-label="选择笔记：' + escapeHtml(note.title) + '"' + checked + ">" : "")
      + '<button type="button" class="row-title" data-action="open-note" data-path="' + escapeHtml(note.path) + '">' + escapeHtml(note.title) + "</button>"
      + '<small class="kpi-hint"> · ' + escapeHtml(note.path) + "</small></span>"
      + '<span class="meta-row">' + chip(labelOf(note.type) + " / " + labelOf(note.statusLabel)) + chip(labelOf(note.folder)) + tools + "</span></div>";
  }

  function renderData(data) {
    var notes = data.notes || [];
    var query = String(state.filters.noteQuery || "").trim().toLowerCase();
    var type = state.filters.noteType || "all";
    /* 归档筛选：归档库里的东西平时混在整库索引里，"想找回上次归档的那条"要靠翻。
       这里给个三态开关（全部 / 只看归档 / 只看在办），并显示归档条数。 */
    var archivedView = state.filters.noteArchived || "all";
    var archivedCount = notes.filter(function (note) { return note.archived; }).length;
    var filtered = notes.filter(function (note) {
      if (archivedView === "archived" && !note.archived) return false;
      if (archivedView === "open" && note.archived) return false;
      if (type !== "all" && note.type !== type) return false;
      if (!query) return true;
      return (labelOf(note.title) + " " + labelOf(note.path) + " " + labelOf(note.type)).toLowerCase().indexOf(query) >= 0;
    });
    var limit = 200;
    var shown = filtered.slice(0, limit);
    var types = ["all", "task", "knowledge-gap", "project", "knowledge", "book", "video", "area", "person", "note"];
    var options = types.map(function (value) {
      return '<option value="' + value + '"' + (type === value ? " selected" : "") + ">" + escapeHtml(value === "all" ? "全部类型" : value) + "</option>";
    }).join("");
    var body = shown.length ? '<div class="res-list">' + shown.map(noteRow).join("") + "</div>" : emptyState("没有匹配的笔记", "换个关键词或类型试试。");
    /* 批量归档 / 撤销归档：勾选后一次处理，交互与草稿箱一致 */
    var picked = notes.filter(function (note) { return isPicked("note", note.path); });
    var archivedPicked = picked.filter(function (note) { return note.archived && note.kind === "task"; }).length;
    var openPicked = picked.filter(function (note) { return !note.archived && note.kind === "task"; }).length;
    var viewTabs = [["all", "全部"], ["archived", "只看归档 " + archivedCount], ["open", "只看在办 " + (notes.length - archivedCount)]]
      .map(function (pair) {
        return '<button type="button" class="link-btn' + (archivedView === pair[0] ? " is-active" : "") + '" data-action="filter-note-archived" data-value="' + pair[0] + '">' + escapeHtml(pair[1]) + "</button>";
      }).join("");
    var tools = '<span class="chip" data-tone="muted">' + filtered.length + " / " + notes.length + "</span>";
    if (canWrite() && notes.length) {
      tools = '<button type="button" class="link-btn" data-action="select-all-notes">'
        + (picked.length === notes.length ? "取消全选" : "全选") + "</button>"
        + (openPicked ? '<button type="button" class="link-btn" data-action="bulk-archive">归档（' + openPicked + "）</button>" : "")
        + (archivedPicked ? '<button type="button" class="link-btn" data-action="bulk-undo-archive">撤销归档（' + archivedPicked + "）</button>" : "")
        + (picked.length ? '<label class="field-inline">移动到<select class="field-input" id="bulk-move-target" aria-label="批量移动目标">'
          + '<option value="">（选择目标）</option>'
          + '<option value="archive">归档库</option><option value="knowledge">知识库</option><option value="task">日程待办</option>'
          + '<option value="inbox">草稿箱</option><option value="area">长期领域</option><option value="people">人物库</option>'
          + "</select></label>"
          + '<button type="button" class="link-btn" data-action="bulk-move-notes">移动（' + picked.length + "）</button>" : "")
        + tools;
    }
    return '<section class="panel span-12"><div class="panel-head"><div><h2>数据</h2>'
      + "<p>整库索引：" + notes.length + " 条笔记（不含 .obsidian 与“AI禁止阅读”路径）。归档库也在其中，可单条或勾选多条撤销归档。</p></div>"
      + '<div class="panel-tools">' + tools + "</div></div>"
      + '<div class="filters"><div class="field"><label>范围</label><span class="meta-row">' + viewTabs + "</span></div>"
      + '<div class="field"><label>搜索</label><input type="search" id="qd" placeholder="搜索标题 / 路径 / 类型" value="' + escapeHtml(state.filters.noteQuery || "") + '"></div>'
      + '<div class="field"><label for="f-notetype">类型</label><select id="f-notetype">' + options + "</select></div>"
      + '<button type="button" class="link-btn" data-action="reset-note-filters">重置</button></div>'
      + '<div class="panel-body">' + body + (filtered.length > limit ? '<p class="kpi-hint">只显示前 ' + limit + " 条</p>" : "") + "</div></section>";
  }

  /* ---------------------------- 详情抽屉 ---------------------------- */

  function drawerTask(data, task, from) {
    var progress = checkProgress(task.checklist);
    var refs = (task.knowledgeRefs || []).length
      ? '<div class="meta-row">' + task.knowledgeRefs.map(function (ref) { return chip(ref); }).join("") + "</div>"
      : '<p class="empty" style="padding:0">暂无知识引用</p>';

    /* 从项目详情点进来的任务：左上角给一个返回箭头，回去时仍停在同一个项目 */
    var back = from
      ? '<button type="button" class="link-btn drawer-back" data-action="back-to-project" data-path="' + escapeHtml(from) + '" aria-label="返回项目详情">⬅️ 返回项目</button>'
      : "";

    return back + "<h2>" + escapeHtml(task.title) + "</h2>"
      + '<div class="meta-row">' + chip(statusLabelOf(task.status), { "data-status": task.status }) + chip(dueLabel(task.daysLeft), { "data-tone": dueTone(task.daysLeft) }) + chip("优先级 " + priorityInfo(task.priority).label, { "data-priority": task.priority }) + "</div>"
      + (canWrite() ? '<div class="meta-row" style="margin-top:12px">' + taskActionButtons(task) + "</div>" : "")
      + '<div class="drawer-section"><h3>状态</h3>' + statusPicker(task) + "</div>"
      /* 阻塞原因只在任务确实被阻塞时出现：不阻塞就别占地方；切走状态后原因仍留在笔记里 */
      + (isBlocked(task)
        ? '<div class="drawer-section"><h3>阻塞原因</h3><div class="field-list">'
          + fieldRow(task, "task", fieldSpec("task", "blocking_reason", data), data)
          + '<p class="field-hint">解除阻塞只需把上面的状态切走；原因会留在笔记里，方便下次回看。</p></div></div>'
        : "")
      + '<div class="drawer-section"><h3>字段</h3><div class="field-list">' + fieldRows(task, "task", data, ["blocking_reason"]) + "</div>"
      + '<p class="field-hint">标题与类型不在这里改：标题是笔记身份，改名要走重命名流程。</p></div>'
      + '<div class="drawer-section"><h3>任务拆解</h3>'
      + (progress.total ? '<p style="margin:0 0 8px">' + progress.done + " / " + progress.total + " 已完成</p><div class=\"progress-line\"><span style=\"width:" + progress.percent + '%"></span></div>' : "")
      + (checklistRows(task, task, data) || '<p class="empty" style="padding:0">还没有拆解步骤</p>')
      + (!progress.total && canWrite() ? '<div class="meta-row" style="margin-top:8px">' + '<button type="button" class="link-btn" data-action="checklist-add" data-path="' + escapeHtml(task.path) + '">+ 添加一步</button>' + "</div>" : "")
      + "</div>"
      + (task.summary ? '<div class="drawer-section"><h3>摘要</h3><p style="margin:0;color:var(--pp-muted)">' + escapeHtml(task.summary) + "</p></div>" : "")
      + '<div class="drawer-section"><h3>知识引用</h3>' + refs + "</div>"
      + '<div class="drawer-section"><h3>笔记路径</h3><div class="path-box">' + escapeHtml(task.path) + '</div><div class="meta-row" style="margin-top:10px">'
      + openNoteButton(task.path) + '<button type="button" class="link-btn" data-action="copy-path" data-path="' + escapeHtml(task.path) + '">复制路径</button>'
      + "</div></div>";
  }

  /** 项目详情里的关键节点：以「导航条 + 选中节点的任务」呈现。
   *  「未分组」不算节点 —— 没有节点归属的任务统一进「孤立任务」卡片。 */
  function milestoneNav(project, tasks) {
    var names = (project.milestones || []).filter(function (name) { return name && name !== "未分组"; });
    if (!names.length) return null;
    var remembered = state.projectMilestones && state.projectMilestones[project.path];
    var active = names.indexOf(remembered) >= 0 ? remembered : names[0];
    var tabs = names.map(function (name) {
      var owned = tasks.filter(function (task) { return (task.milestone || "未分组") === name; });
      var nodeBlocked = owned.filter(isBlocked).length;
      var current = name === active;
      return '<button type="button" class="milestone-tab' + (nodeBlocked ? " is-blocked" : "") + (current ? " is-active" : "") + '"'
        + ' role="tab" aria-selected="' + (current ? "true" : "false") + '" tabindex="' + (current ? "0" : "-1") + '"'
        + ' data-action="milestone-tab" data-path="' + escapeHtml(project.path) + '" data-name="' + escapeHtml(name) + '">'
        + escapeHtml(name) + '<span class="milestone-count">' + owned.length + "</span></button>";
    }).join("");
    return {
      active: active,
      names: names,
      html: '<div class="milestone-nav" role="tablist" aria-label="关键节点">' + tabs + "</div>"
    };
  }

  function drawerProject(data, project) {
    var tasks = (data.tasks || []).filter(function (task) { return task.projectPath === project.path; });
    /* 阻塞项就是"被标成阻塞的任务"，不再是项目文档里手写的一段清单 */
    var blockedTasks = tasks.filter(isBlocked);

    var nav = milestoneNav(project, tasks);
    var orphans = tasks.filter(function (task) { return !task.milestone || task.milestone === "未分组"; });
    var nodeTasks = nav ? tasks.filter(function (task) { return (task.milestone || "未分组") === nav.active; }) : [];
    var nodeTools = nav && canWrite()
      ? '<span class="meta-row">' + actionButton("milestone-rename", project.path, "改名", nav.active) + actionButton("milestone-delete", project.path, "删除", nav.active) + "</span>"
      : "";
    /* 每个节点下面挂着自己的任务；没有节点归属的进「孤立任务」 */
    var nodeSection = nav
      ? '<div class="drawer-section"><h3>关键节点</h3>' + nav.html
        + '<div class="milestone-body">' + (nodeTasks.length ? taskList(nodeTasks) : '<p class="empty" style="padding:0">这个节点下还没有任务</p>') + "</div>"
        + '<div class="meta-row">' + nodeTools + (canWrite() ? actionButton("new-task", project.path, "给这个节点新建任务", nav.active) + actionButton("project-milestone", project.path, "新建关键节点") : "") + "</div></div>"
      : '<div class="drawer-section"><h3>关键节点</h3>'
        + '<p class="empty" style="padding:0">这个项目还没有关键节点。节点用来把项目拆成几步走，任务可以挂在节点下面；不挂节点的任务会进「孤立任务」。</p>'
        + (canWrite() ? '<div class="meta-row">' + actionButton("project-milestone", project.path, "新建关键节点") + actionButton("new-task", project.path, "新建任务") + "</div>" : "")
        + "</div>";
    var orphanSection = '<div class="drawer-section"><h3>孤立任务</h3>'
      + (orphans.length ? taskList(orphans) : '<p class="empty" style="padding:0">没有未归节点的任务</p>')
      + "</div>";

    return "<h2>" + escapeHtml(project.title) + "</h2>"
      + '<div class="meta-row">' + chip(statusLabelOf(project.status), { "data-status": project.status }) + chip(dueLabel(project.daysLeft), { "data-tone": dueTone(project.daysLeft) }) + (blockedTasks.length ? chip("阻塞 " + blockedTasks.length, { "data-tone": "blocked" }) : "") + "</div>"
      + (canWrite() ? '<div class="meta-row" style="margin-top:12px">' + projectActionButtons(project) + "</div>" : "")
      + '<div class="drawer-section"><h3>字段</h3><div class="field-list">' + fieldRows(project, "project", data, ["outcome", "acceptance"]) + "</div>"
      + '<div class="field-row field-readonly-row"><span class="field-label">完成度</span><span class="field-readonly">' + project.progress + "%（" + project.done + "/" + project.total + "）</span></div>"
      + '<div class="field-row field-readonly-row"><span class="field-label">状态</span><span class="field-readonly">' + escapeHtml(statusLabelOf(project.status)) + " · 用上方「更新状态」改</span></div>"
      + '<p class="field-hint">标题与完成度不在这里改：完成度由该项目的任务自动推导。</p></div>'
      + '<div class="drawer-section"><h3>最终结果（终点画像）</h3><div class="field-list">' + fieldRow(project, "project", fieldSpec("project", "outcome", data), data) + "</div></div>"
      + '<div class="drawer-section"><h3>验收标准</h3><div class="field-list">' + fieldRow(project, "project", fieldSpec("project", "acceptance", data), data) + "</div></div>"
      + nodeSection
      + orphanSection
      + '<div class="drawer-section"><h3>笔记路径</h3><div class="path-box">' + escapeHtml(project.path) + '</div><div class="meta-row" style="margin-top:10px">'
      + openNoteButton(project.path) + '<button type="button" class="link-btn" data-action="copy-path" data-path="' + escapeHtml(project.path) + '">复制路径</button>'
      + "</div></div>";
  }

  /* ---------------------------- 外壳 ---------------------------- */

  function tabsHtml(data) {
    return VIEWS.map(function (view) {
      var count = view.count ? view.count(data) : 0;
      var current = state.view === view.id;
      return '<button type="button" class="tab" role="tab" data-action="switch-view" data-view="' + view.id + '"'
        + (current ? ' aria-current="page" aria-selected="true" tabindex="0"' : ' aria-selected="false" tabindex="-1"') + ">"
        + escapeHtml(view.label)
        + (count ? '<span class="tab-count">' + count + "</span>" : "") + "</button>";
    }).join("");
  }

  function footerHtml(data) {
    /* 插件内嵌视图提供写通道，浏览器版（file:// 直接打开）没有 —— 文案必须跟着能力走，
       否则用户会以为「新建项目 / 完成并归档」这些按钮是无害的。 */
    var writable = data.live === true && canWrite();
    var sourceLine = writable
      ? "<span>可直接编辑 · 改动会写回笔记的 frontmatter，Markdown 仍是唯一事实来源</span>"
      : "<span>只读视图 · 修改请回到 Obsidian，Markdown 才是唯一事实来源</span>";
    if (data.live === true) {
      return "<span>数据源：<strong>" + escapeHtml(data.vaultName) + "</strong>（实时读取自 Vault）</span>"
        + "<span>生成时间 " + escapeHtml(formatDateTime(data.generatedAt)) + "</span>"
        + sourceLine;
    }
    return "<span>数据源：<strong>" + escapeHtml(data.vaultName) + "</strong>"
      + (data.sample ? "（演示数据集）" : "（由 " + data.tasks.length + " 条笔记生成）") + "</span>"
      + '<span>生成时间 ' + escapeHtml(formatDateTime(data.generatedAt)) + "</span>"
      + sourceLine
      + '<span>重建：<code>node tools/export-data.mjs &amp;&amp; node tools/build-sample.mjs</code></span>';
  }

  function activeViewData() { return state.data; }

  function render() {
    /* 宿主视图可能在防抖定时器仍挂起时被卸载：root 里找不到 #view 就放弃本轮渲染 */
    if (!$id("view")) return;
    /* 组词期间不替换原生控件；仅跳过当前 input 事件挡不住先前定时器或 Vault 刷新。 */
    if (composingTarget) { pendingCompositionRender = true; return; }
    pendingCompositionRender = false;
    var data = activeViewData();
    /* ---- 动效（MOTION.md 第 3/4 节）：强度开关每次渲染都同步 ---- */
    applyMotionLevel(resolveMotionLevel(data));
    motionGeneration += 1;
    var frame = $id("view");
    /* 入场只在「首次渲染」或「真正换页签」时播；数据还没到时把这次机会留给真数据 */
    var entering = Boolean(data) && pendingEnter;
    if (data) pendingEnter = false;
    var loading = !data && (state.live === true || (state.data && state.data.live === true));
    if (frame && typeof frame.setAttribute === "function") frame.setAttribute("data-loading", loading ? "true" : "false");
    /* #tabs 用同一个 mo-enter：页签胶囊只在真正换页签时弹一下，不随每次重绘闪 */
    syncEnter(frame, $id("tabs"), entering);
    if (!data) {
      if (state.live === true || (state.data && state.data.live === true)) {
        $id("view").innerHTML = emptyState("正在读取 Vault", "笔记数据尚未就绪，稍候或切换视图重试。");
      } else {
        $id("view").innerHTML = emptyState("没有可用数据", "请先运行 node tools/export-data.mjs 生成 data.js，或确保 data.sample.js 存在。");
      }
      return;
    }
    var renderers = { overview: renderOverview, tasks: renderTasks, projects: renderProjects, knowledge: renderKnowledge, inbox: renderInbox, data: renderData };
    var view = renderers[state.view] || renderOverview;
    /* 切页签是原地换内容（焦点留在页签上）：播报一次，读屏用户才知道换了页 */
    if (announcedView !== state.view) {
      announcedView = state.view;
      announce("已切换到" + viewLabel(state.view));
    }
    $id("tabs").innerHTML = tabsHtml(data);
    $id("date-chip").textContent = data.today;
    $id("footer").innerHTML = footerHtml(data);
    var main = $id("view");
    /* 失败条放在最前（跨整行）：无论用户在哪个页签，都能看到"上次哪几条没成功"并重试 */
    main.innerHTML = heroHtml(data) + bulkFailureStrip(data) + view(data);
    main.setAttribute("data-view", state.view);
    /* 数字滚动：只对带 data-count 的 KPI 生效，且只在数值变化时补间（分镜 6） */
    animateCounts(main);
    var sources = activeHost().sources();
    var toggle = $id("source-toggle");
    if (sources.vault && sources.sample) {
      toggle.hidden = false;
      toggle.textContent = state.source === "vault" ? "当前：真实数据" : "当前：演示数据";
    }
    var focusTarget = $id("q") || $id("qd");
    var caret = state.filters.focusSearch;
    if (focusTarget && caret) {
      focusTarget.focus();
      var pos = caret && typeof caret === "object" ? caret.start : focusTarget.value.length;
      var end = caret && typeof caret === "object" && caret.end !== undefined ? caret.end : pos;
      try { focusTarget.setSelectionRange(pos, end); } catch (error) { /* 少数控件不支持选区，忽略 */ }
      state.filters.focusSearch = false;
    }
    var selectId = state.filters.focusSelect;
    if (selectId) {
      var select = $id(selectId);
      if (select && select.focus) select.focus();
      state.filters.focusSelect = "";
    }
    refreshDrawer();
  }

  /* ============================ 3. 事件与启动 ============================ */

  var skipNextHash = false;

  function switchView(view) {
    if (!VIEWS.some(function (item) { return item.id === view; })) view = "overview";
    /* 只有**真的换了页签**才重播整页入场：同页签重入（刷新数据 / hash 回流）不重播（铁律 3） */
    if (view !== state.view) pendingEnter = true;
    state.view = view;
    closeDrawer();
    var hash = "#/" + view;
    if (activeHost().getHash() !== hash) {
      skipNextHash = true;                 // 自己写入的 hash 不再触发一次重复渲染
      activeHost().setHash(hash);
    }
    render();
    var main = $id("view");
    if (main && main.scrollIntoView) main.scrollIntoView({ block: "start" });
  }

  /** 打开抽屉。target 记住它展示的是哪条笔记，好让数据刷新后抽屉内容跟着更新。
   *  抽屉是 role="dialog"：打开时把焦点移进去，关闭时还给原来的位置，Tab 在抽屉内循环。
   *  重绘（数据刷新 / 改字段后）要保住滚动位置与正在编辑的那个控件 —— 否则在"验收标准"这种
   *  靠下的字段改一次，抽屉就会跳回顶部，用户得重新滚下去。 */
  function openDrawer(html, target) {
    var drawer = $id("drawer");
    var wasOpen = !drawer.hidden;
    /* 滚动位置与"正在编辑的字段"要能从 state 里取回：数据刷新前可能先整屏重绘过一次，
       那一刻 activeElement 已经丢了，光看 activeElement 会误判成"用户不在任何字段里"。 */
    var keepScroll = wasOpen ? Number(state.drawerScroll) || Number(drawer.scrollTop) || 0 : 0;
    var active = activeHost().activeElement ? activeHost().activeElement() : null;
    var activeField = wasOpen && drawer.contains && active && drawer.contains(active)
      ? (active.getAttribute && active.getAttribute("data-field")) || null
      : null;
    var remembered = wasOpen && state.lastEditedField && target && state.lastEditedField.path === target.path ? state.lastEditedField : null;
    var keepField = activeField || (remembered && remembered.key) || null;
    var keepIndex = activeField ? (active.getAttribute && active.getAttribute("data-index")) : (remembered ? String(remembered.index) : null);
    if (drawer.hidden) state.lastFocus = active || null;
    drawer.innerHTML = '<button type="button" class="link-btn drawer-close" data-action="close-drawer">关闭</button>' + html;
    drawer.hidden = false;
    $id("scrim").hidden = false;
    state.drawer = target || null;
    pendingDrawerRefresh = false;
    if (keepScroll) { drawer.scrollTop = keepScroll; state.drawerScroll = keepScroll; }
    if (keepField) {
      var again = Array.prototype.slice.call(drawer.querySelectorAll('[data-field="' + keepField + '"]'))
        .filter(function (el) { return keepIndex === null || keepIndex === undefined || el.getAttribute("data-index") === keepIndex; })[0];
      /* 只在"用户本来就在这个控件里"时把焦点放回去：否则刚打开抽屉时会把焦点从关闭按钮抢走 */
      if (again && again.focus && wasOpen) {
        again.focus();
        if (again.setSelectionRange && typeof again.value === "string") { try { again.setSelectionRange(again.value.length, again.value.length); } catch (error) { /* number/date 不支持选区 */ } }
      }
    }
    var close = drawer.querySelector ? drawer.querySelector(".drawer-close") : null;
    if (close && close.focus && !wasOpen) close.focus();
    else if (close && close.focus && !keepField) close.focus();
  }

  function drawerFocusable() {
    var drawer = $id("drawer");
    if (!drawer || !drawer.querySelectorAll) return [];
    return Array.prototype.slice.call(drawer.querySelectorAll("button, [href], input, select, textarea, [tabindex]")).filter(function (el) {
      return !el.disabled && el.getAttribute("tabindex") !== "-1";
    });
  }

  /** Tab / Shift+Tab 在抽屉里循环，不让焦点跑到被遮罩盖住的页面上 */
  function trapDrawerFocus(event) {
    var list = drawerFocusable();
    if (!list.length) return;
    var active = activeHost().activeElement ? activeHost().activeElement() : null;
    var index = list.indexOf(active);
    var next = event.shiftKey
      ? (index <= 0 ? list.length - 1 : index - 1)
      : (index < 0 || index === list.length - 1 ? 0 : index + 1);
    event.preventDefault();
    if (list[next] && list[next].focus) list[next].focus();
  }

  /** 更新数据不等于结束编辑：保留原控件及其草稿、选区、撤销栈，离开编辑区后再刷新。
   *  仍先检查条目是否存在，删除/归档后的旧详情不能因编辑保护而永久滞留。 */
  function refreshDrawer() {
    var open = state.drawer;
    if (!open) return;
    var data = state.data || {};
    var item = open.kind === "task" ? taskIndex(data).get(open.path)
      : open.kind === "project" ? projectIndex(data).get(open.path) : null;
    if (!item) { closeDrawer(); return; }
    var drawer = $id("drawer");
    var active = activeHost().activeElement ? activeHost().activeElement() : null;
    if (active && drawer && Array.prototype.slice.call(drawer.querySelectorAll("[data-field]")).indexOf(active) >= 0) {
      pendingDrawerRefresh = true;
      return;
    }
    pendingDrawerRefresh = false;
    openDrawer(open.kind === "task" ? drawerTask(data, item, open.from || "") : drawerProject(data, item), open);
  }

  function closeDrawer() {
    var drawer = $id("drawer");
    var wasOpen = Boolean(drawer && !drawer.hidden);
    if (drawer) { drawer.hidden = true; drawer.innerHTML = ""; }
    var scrim = $id("scrim");
    if (scrim) scrim.hidden = true;
    state.drawer = null;
    pendingDrawerRefresh = false;
    state.drawerScroll = 0;
    state.lastEditedField = null;
    /* 关掉对话框要把焦点还给打开它的那个按钮，否则键盘用户会被丢回页面顶部 */
    var last = state.lastFocus;
    state.lastFocus = null;
    if (wasOpen && last && last.focus) last.focus();
  }

  /** 复制交给宿主：浏览器宿主用剪贴板 API，外部宿主可换成自己的实现 */
  function copyText(text) {
    return activeHost().copyText(text);
  }

  function handleClick(event) {
    var target = event.target.closest ? event.target.closest("[data-action]") : null;
    if (!target) return;
    var action = target.getAttribute("data-action");
    var data = state.data || {};
    if (action === "switch-view") { event.preventDefault(); switchView(target.getAttribute("data-view")); return; }
    if (action === "open-note") {
      event.preventDefault();
      activeHost().openNote(target.getAttribute("data-path"));
      return;
    }
    if (action === "copy-path") { copyText(target.getAttribute("data-path")); target.textContent = "已复制"; return; }
    if (action === "close-drawer") { closeDrawer(); return; }
    if (action === "detail-task") {
      var task = taskIndex(data).get(target.getAttribute("data-path"));
      /* 记住"从哪来"：项目 → 任务 → 任务 一路点下去，返回箭头始终指回最初的项目 */
      var origin = state.drawer && state.drawer.kind === "project" ? state.drawer.path : (state.drawer && state.drawer.from) || "";
      if (task) openDrawer(drawerTask(data, task, origin), { kind: "task", path: task.path, from: origin });
      return;
    }
    if (action === "back-to-project") {
      var backProject = projectIndex(data).get(target.getAttribute("data-path"));
      if (backProject) openDrawer(drawerProject(data, backProject), { kind: "project", path: backProject.path });
      return;
    }
    if (action === "open-node") {
      var nodePath = target.getAttribute("data-path");
      if (!state.projectMilestones) state.projectMilestones = {};
      state.projectMilestones[nodePath] = target.getAttribute("data-name");
      var nodeProject = projectIndex(data).get(nodePath);
      if (nodeProject) openDrawer(drawerProject(data, nodeProject), { kind: "project", path: nodeProject.path });
      return;
    }
    if (action === "milestone-tab") {
      var tabPath = target.getAttribute("data-path");
      if (!state.projectMilestones) state.projectMilestones = {};
      state.projectMilestones[tabPath] = target.getAttribute("data-name");
      refreshDrawer();
      return;
    }
    if (action === "detail-project") {
      var project = projectIndex(data).get(target.getAttribute("data-path"));
      if (project) openDrawer(drawerProject(data, project), { kind: "project", path: project.path });
      return;
    }
    /* 三处批量选择（草稿箱 / 数据 / 任务）共用一份逻辑：kind 决定存到哪个桶、勾选/全选/回焦的写法完全一致 */
    if (action === "select-draft" || action === "select-note" || action === "select-task" || action === "select-project" || action === "select-gap") {
      var pickKind = action === "select-draft" ? "draft" : (action === "select-note" ? "note" : (action === "select-project" ? "project" : (action === "select-gap" ? "gap" : "task")));
      var pickPath = target.getAttribute("data-path");
      selectionStore(pickKind)[pickPath] = target.checked;
      render();
      refocusSelection(action, pickPath);
      return;
    }
    if (action === "select-all-notes" || action === "select-all-tasks" || action === "select-all-drafts" || action === "select-all-projects" || action === "select-all-gaps") {
      var allKind = action === "select-all-notes" ? "note" : (action === "select-all-tasks" ? "task" : (action === "select-all-projects" ? "project" : (action === "select-all-gaps" ? "gap" : "draft")));
      var pool = allKind === "note" ? (data.notes || []) : (allKind === "task" ? (data.tasks || []).filter(isOpen) : (allKind === "project" ? (data.projects || []) : (allKind === "gap" ? (data.tasks || []).filter(function (task) { return String(task.type || "") === "knowledge-gap" && isOpen(task); }) : (data.inbox || []))));
      toggleAllSelection(allKind, pool);
      render();
      return;
    }
    if (action === "bulk-archive" || action === "bulk-undo-archive") {
      var notePaths = selectionPaths("note");
      if (!notePaths.length) return;
      clearSelection("note");
      perform(action, "__vault__", JSON.stringify({ paths: notePaths, archived: action === "bulk-undo-archive" }));
      return;
    }
    if (action === "bulk-task-status") {
      var statusPaths = selectionPaths("task");
      if (!statusPaths.length) return;
      clearSelection("task");
      perform("bulk-set-task-fields", "__vault__", JSON.stringify({ paths: statusPaths, patch: { status: target.getAttribute("data-status") } }));
      return;
    }
    if (action === "bulk-task-attribution") {
      var attrPaths = selectionPaths("task");
      if (!attrPaths.length) return;
      var projectPick = $id("bulk-project") ? $id("bulk-project").value : "";
      var milestonePick = $id("bulk-milestone") ? $id("bulk-milestone").value : "";
      var attrPatch = {};
      if (projectPick) attrPatch.project = projectPick;
      if (milestonePick) attrPatch.milestone = milestonePick;
      if (!Object.keys(attrPatch).length) return;
      clearSelection("task");
      perform("bulk-set-task-fields", "__vault__", JSON.stringify({ paths: attrPaths, patch: attrPatch }));
      return;
    }
    if (action === "bulk-sink-gaps") {
      var gapPaths = selectionPaths("gap");
      if (!gapPaths.length) return;
      clearSelection("gap");
      perform("bulk-sink-gaps", "__vault__", JSON.stringify({ paths: gapPaths }));
      return;
    }
    if (action === "bulk-move-notes") {
      var movePaths = selectionPaths("note");
      if (!movePaths.length) return;
      var moveTarget = $id("bulk-move-target") ? $id("bulk-move-target").value : "";
      if (!moveTarget) return;
      clearSelection("note");
      perform("bulk-move-notes", "__vault__", JSON.stringify({ paths: movePaths, target: moveTarget }));
      return;
    }
    if (action === "bulk-project-status") {
      var projectPaths = selectionPaths("project");
      if (!projectPaths.length) return;
      clearSelection("project");
      perform("bulk-set-project-status", "__vault__", JSON.stringify({ paths: projectPaths, status: target.getAttribute("data-status") }));
      return;
    }
    if (action === "import-drafts") {
      var draftPaths = selectionPaths("draft");
      if (!draftPaths.length) return;
      var draftField = function (name) {
        var input = $id("view") ? $id("view").querySelectorAll('[data-draft-field="' + name + '"]')[0] : null;
        return input ? input.value : "";
      };
      var taskSetValue = draftField("taskSet");
      var taskGroupValue = draftField("taskGroup");
      clearSelection("draft");
      perform("import-task-set", "__vault__", JSON.stringify({ paths: draftPaths, taskSet: taskSetValue, taskGroup: taskGroupValue }));
      return;
    }    if (action === "checklist-toggle") { perform("checklist-op", target.getAttribute("data-path"), JSON.stringify({ op: "toggle", index: Number(target.getAttribute("data-index")) })); return; }
    if (action === "checklist-remove") { perform("checklist-op", target.getAttribute("data-path"), JSON.stringify({ op: "remove", index: Number(target.getAttribute("data-index")) })); return; }
    if (action === "checklist-add") { perform("checklist-op", target.getAttribute("data-path"), JSON.stringify({ op: "add", text: "" })); return; }    if (action === "reset-filters") {
      state.filters = { query: "", noteQuery: "", noteType: "all", taskSet: "all", taskGroup: "all", status: "all", priority: "all", project: "all", sort: "due" };
      render();
      return;
    }
    if (action === "set-task-status") { perform("set-task-status", target.getAttribute("data-path"), target.getAttribute("data-status") || target.getAttribute("data-name")); return; }
    if (action === "edit-task" || action === "archive-task" || action === "delete-task") { perform(action, target.getAttribute("data-path")); return; }
    if (action === "edit-project" || action === "project-status" || action === "project-milestone" || action === "archive-project" || action === "delete-project") { perform(action, target.getAttribute("data-path")); return; }
    if (action === "triage-draft" || action === "gap-sink" || action === "undo-archive" || action === "undo-archive-project" || action === "archive-book") { perform(action, target.getAttribute("data-path")); return; }
    /* 撤销这一次「已完成」：重复任务的周期推进是可逆的一步 */
    if (action === "undo-recurring-completion") { perform(action, target.getAttribute("data-path")); return; }
    if (action === "init-structure" || action === "new-project") { perform(action, "__vault__"); return; }
    /* 新建任务：把"在哪个项目的哪个节点下新建"一起交给宿主 —— 顶栏按钮没有上下文，传 __vault__ */
    if (action === "new-task") {
      perform("new-task", target.getAttribute("data-path") || "__vault__", target.getAttribute("data-name") || "");
      return;
    }
    if (action === "new-resource") { perform("new-resource", "__vault__", target.getAttribute("data-kind")); return; }
    if (action === "milestone-rename" || action === "milestone-delete") { perform(action, target.getAttribute("data-path"), target.getAttribute("data-name")); return; }
    if (action === "reset-note-filters") { state.filters.noteQuery = ""; state.filters.noteType = "all"; state.filters.noteArchived = "all"; render(); return; }
    if (action === "retry-bulk") { perform("retry-bulk", "__vault__", ""); return; }
    if (action === "dismiss-bulk-failures") { perform("clear-bulk-failures", "__vault__", ""); return; }
    if (action === "filter-note-archived") { state.filters.noteArchived = target.getAttribute("data-value") || "all"; clearSelection("note"); render(); return; }
    if (action === "toggle-source") {
      var next = state.source === "vault" ? "sample" : "vault";
      setSource(next);
      return;
    }
  }

  /** 字段直改：change（失焦 / 回车）时提交。用 change 而不是每次 input 都写盘 ——
   *  中文输入法组合期间不会触发 change，也就不会打断候选上屏。 */
  function handleFieldChange(event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var key = target.getAttribute("data-field");
    if (!key) return;
    var path = target.getAttribute("data-path");
    if (!path) return;
    /* 任务集 / 任务组下拉里的「＋ 新建…」：先问名字，再写进字段（不直接把哨兵值写进笔记） */
    if (target.value === NEW_TASK_SET_VALUE || target.value === NEW_TASK_GROUP_VALUE) {
      perform("new-task-taxonomy", path, JSON.stringify({ key: key }));
      return;
    }
    var payload = key === "checklist"
      ? { op: "rename", index: Number(target.getAttribute("data-index")), text: target.value }
      : { key: key, value: target.value };
    /* 多选（重复周几）：整组共享一个 data-field，勾一个就要把**整组**的值一起交上去，
       否则写盘会把没动过的那些勾也清掉。桩里没有 :checked 选择器，所以在 JS 里过滤。
       `type` 在真实 DOM 上一定有；测试桩里可能只落在属性上，因此两条都认。 */
    var isCheckbox = target.type === "checkbox" || (target.getAttribute && target.getAttribute("type") === "checkbox");
    if (isCheckbox && target.getAttribute && target.getAttribute("data-multi") === "true") {
      var drawerEl = $id("drawer");
      var group = drawerEl && drawerEl.querySelectorAll ? drawerEl.querySelectorAll('[data-field="' + key + '"]') : [];
      var picked = [];
      for (var boxIndex = 0; boxIndex < group.length; boxIndex += 1) {
        var box = group[boxIndex];
        var boxChecked = box && (box.type === "checkbox" || (box.getAttribute && box.getAttribute("type") === "checkbox"));
        if (boxChecked && box.checked) picked.push(String(box.value));
      }
      payload.value = picked.join(",");
    }
    /* 记下来：写盘会触发整屏重绘，重绘后要能把焦点放回同一个控件 */
    state.lastEditedField = { key: key, index: target.getAttribute("data-index"), path: path };
    state.drawerScroll = ($id("drawer") && Number($id("drawer").scrollTop)) || 0;
    perform(key === "checklist" ? "checklist-op" : "set-field", path, JSON.stringify(payload));
  }

  var queryTimer = null;
  var composingTarget = null;
  var pendingCompositionRender = false;
  var pendingDrawerRefresh = false;
  var deferredFocusTimer = null;

  function isTextEntry(target) {
    return Boolean(target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable));
  }

  function handleCompositionStart(event) {
    composingTarget = event.target;
    if (queryTimer) { window.clearTimeout(queryTimer); queryTimer = null; }
  }

  /** 等浏览器完成焦点迁移；连续 Tab 到下一个字段时仍保留整张表单。 */
  function handleFocusOut(event) {
    if (composingTarget === event.target) composingTarget = null;
    if (!pendingDrawerRefresh && !pendingCompositionRender) return;
    if (deferredFocusTimer) window.clearTimeout(deferredFocusTimer);
    deferredFocusTimer = window.setTimeout(function () {
      deferredFocusTimer = null;
      if (pendingCompositionRender) render();
      if (pendingDrawerRefresh) {
        /* 用户已经离开旧字段，不得用上次提交的字段把焦点抢回去。 */
        state.lastEditedField = null;
        refreshDrawer();
      }
    }, 0);
  }

  function handleInput(event) {
    /* 输入法组合期间（isComposing）绝不能重渲染：那会打断中文/日文候选上屏 ——
       这正是下面那句旧注释想避免、但实现里没做到的事。 */
    if (event.isComposing) { handleCompositionStart(event); return; }
    var target = event.target;
    var id = target && target.id;
    var map = { q: "query", qd: "noteQuery", "f-set": "taskSet", "f-group": "taskGroup", "f-status": "status", "f-priority": "priority", "f-sort": "sort", "f-notetype": "noteType" };
    var key = map[id];
    if (!key) return;
    /* 文本框的 change 会在 blur 时再触发一次；input 已经处理过，避免重复整屏重渲染 */
    if (event.type === "change" && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    state.filters[key] = target.value;
    if (key === "query" || key === "noteQuery") {
      // 输入时短延迟刷新，并在重渲染后把光标放回原位置
      state.filters.focusSearch = { start: target.selectionStart, end: target.selectionEnd };
      if (queryTimer) window.clearTimeout(queryTimer);
      queryTimer = window.setTimeout(render, 120);
      return;
    }
    /* 下拉筛选重渲染后要把焦点还回去，否则键盘用户每选一次就掉焦点 */
    state.filters.focusSelect = id;
    render();
  }

  /** 组合结束补一次刷新：部分输入法只在 compositionend 之后才给出最终文本 */
  function handleCompositionEnd(event) {
    composingTarget = null;
    handleInput(event);
    if (pendingCompositionRender && !queryTimer) render();
  }

  function handleKeydown(event) {
    /* Escape/Enter/方向键首先属于输入法，不能抢先关闭详情或切页签。 */
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") { closeDrawer(); return; }
    if (event.key === "Tab" && state.drawer) { trapDrawerFocus(event); return; }
    /* 页签是 role="tablist"：非当前页签 tabindex=-1，必须用方向键可达（标准 ARIA 模式），
       否则键盘用户会被困在当前页签上。 */
    var tab = event.target && event.target.closest ? event.target.closest('[role="tab"]') : null;
    /* 项目详情里的关键节点页签也是 role="tablist"，键盘行为与顶层页签一致 */
    var isMilestoneTab = Boolean(tab && tab.classList && tab.classList.contains && tab.classList.contains("milestone-tab"));
    if (isMilestoneTab) {
      var nav = event.target.closest ? event.target.closest(".milestone-nav") : null;
      var items = nav && nav.children ? Array.prototype.slice.call(nav.children) : [];
      var at = items.indexOf(tab);
      var moveTo = -1;
      if (at >= 0) {
        if (event.key === "ArrowRight") moveTo = (at + 1) % items.length;
        else if (event.key === "ArrowLeft") moveTo = (at - 1 + items.length) % items.length;
        else if (event.key === "Home") moveTo = 0;
        else if (event.key === "End") moveTo = items.length - 1;
      }
      if (moveTo >= 0) {
        event.preventDefault();
        items[moveTo].click();
        var drawerNow = $id("drawer");
        var movedTab = drawerNow && drawerNow.querySelectorAll ? drawerNow.querySelectorAll(".milestone-tab")[moveTo] : null;
        if (movedTab && movedTab.focus) movedTab.focus();
        return;
      }
    }
    var tabs = $id("tabs");
    if (tab && !isMilestoneTab && tabs && tabs.children) {
      var list = Array.prototype.slice.call(tabs.children);
      var index = list.indexOf(tab);
      var nextIndex = -1;
      if (index >= 0) {
        if (event.key === "ArrowRight") nextIndex = (index + 1) % list.length;
        else if (event.key === "ArrowLeft") nextIndex = (index - 1 + list.length) % list.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = list.length - 1;
      }
      if (nextIndex >= 0) {
        event.preventDefault();
        switchView(list[nextIndex].getAttribute("data-view"));
        var moved = $id("tabs") && Array.prototype.slice.call($id("tabs").children)[nextIndex];
        if (moved && moved.focus) moved.focus();
        return;
      }
    }
    var active = activeHost().activeElement();
    if (event.key === "/" && active && !isTextEntry(active) && !isTextEntry(event.target)
      && !event.ctrlKey && !event.metaKey && !event.altKey) {
      var search = $id("q") || $id("qd");
      if (search) { event.preventDefault(); search.focus(); }
      else if (state.view !== "tasks") { switchView("tasks"); }
    }
  }

  function setSource(source) {
    var sources = activeHost().sources();
    var data = source === "sample" ? sources.sample : sources.vault;
    state.source = data === sources.sample ? "sample" : "vault";
    state.data = data;
    activeHost().storage.setItem("pp-dashboard-source", state.source);
    render();
  }

  function handleHash() {
    if (skipNextHash) { skipNextHash = false; return; }
    var match = /^#\/([a-z]+)$/.exec(activeHost().getHash() || "");
    var view = match && VIEWS.some(function (item) { return item.id === match[1]; }) ? match[1] : "overview";
    if (view !== state.view) { state.view = view; closeDrawer(); render(); }
  }

  function boot() {
    var host = activeHost();
    var stored = host.storage.getItem("pp-dashboard-source");
    var sources = host.sources();
    var initial = stored === "sample" || stored === "vault" ? stored : (sources.vault ? "vault" : "sample");
    state.view = (/^#\/([a-z]+)$/.exec(host.getHash() || "") || [null, "overview"])[1];
    if (!VIEWS.some(function (item) { return item.id === state.view; })) state.view = "overview";
    setSource(initial);
    var toggle = $id("source-toggle");
    if (toggle) toggle.setAttribute("data-action", "toggle-source");
    bindEvents();
  }

  /* ---------------------------- 导出 ---------------------------- */

  var api = {
    announce: announce,
    escapeHtml: escapeHtml, statusLabelOf: statusLabelOf, priorityInfo: priorityInfo, priorityRank: priorityRank,
    pct: pct, minutesLabel: minutesLabel, dueLabel: dueLabel, dueTone: dueTone, isOpen: isOpen, isOverdue: isOverdue,
    formatDate: formatDate, shortDate: shortDate, weekdayLabel: weekdayLabel, formatDateTime: formatDateTime,
    filterTasks: filterTasks, sortTasks: sortTasks, groupTasks: groupTasks, uniqueValues: uniqueValues,
    obsidianUri: obsidianUri, checkProgress: checkProgress, focusTask: focusTask,
    drawerTask: drawerTask, drawerProject: drawerProject, openDrawer: openDrawer, closeDrawer: closeDrawer,
    state: state, render: render, switchView: switchView, setSource: setSource, VIEWS: VIEWS,
    configureHost: configureHost, mount: mount, setData: setData, unmount: unmount
  };

  if (typeof window !== "undefined") {
    window.PPDashboard = api;
    if (window.document && document.getElementById && document.getElementById("pp-app")) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
      else boot();
    }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
