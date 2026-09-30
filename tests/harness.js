"use strict";
/**
 * tests/harness.js
 *
 * 无 Obsidian 运行时也能端到端执行 main.js 的最小仿真环境：
 *   - FakeElement：Obsidian 风格的 DOM（createEl / empty / addClass / setAttr / style / dataset ...）
 *   - FakeVault：内存 Vault（create / createFolder / rename / delete / process / adapter）
 *   - FakeMetadataCache：frontmatter 解析 + changed 事件
 *   - FakeWorkspace / ItemView / Modal / Setting / Notice / moment / timers
 *
 * 加载方式：把整个 main.js 放进 vm 上下文，require("obsidian") 返回仿真模块。
 * 这样测试覆盖的是真实交付文件，而不是源码切片的副本。
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PLUGIN_DIR = path.resolve(__dirname, "..");
const MAIN_PATH = path.join(PLUGIN_DIR, "main.js");
const MANIFEST_PATH = path.join(PLUGIN_DIR, "manifest.json");
/** 第 5 步：实现由"测试用模块包"直接提供（由 tools/build-modules.mjs 从 src 生成），
 *  不再从 main.js 的 __internals 里取。构建产物缺失或过期时 tests/run.js 会拒绝运行。 */
const MODULES_PATH = path.join(__dirname, ".build", "ppd-modules.cjs");
/** sync-app.mjs 注入到 main.js 末尾的渲染层区块常量：只存在于打包后的顶层作用域，
 *  模块包里没有，必须从 vm 里取出来（再放到 globalThis 上供模块包的自由变量解析）。 */
const BLOCK_NAMES = ["PP_WEB_CSS", "ppWebAppFactory", "WAYPOINT_IMAGES"];

/** 导出契约只校验一次（本进程第一次 boot 时） */
let bootChecked = false;

/** main.js 顶层可在测试中断言的纯函数与常量 */
const HELPER_NAMES = [
  "el", "today", "dateOf", "daysUntil", "addDays", "buildTimePlan", "buildReminderMessages",
  /* 重复模式（参考谷歌日历）：周几 / 每月几号 / 序列第一次执行日 / 序列结束日 */
  "isoWeekday", "normalizeWeekdays", "normalizeMonthDay", "weekdayLabel", "firstOccurrenceOnOrAfter", "recurrenceWeekdaysOf", "recurrenceMonthDayOf", "recurrenceUntilOf", "recurrenceAnchorOf",
  "buildTaskHierarchy", "taskImportPatch", "shouldSplitTask", "buildResourceMap", "resolveKnowledgeRefs",
  "nextRecurringDate", "resolveAssetPath", "isImageAssetPath", "listImageAssetPaths", "collectImageAssetFiles",
  "filterTaskList", "sortTaskList", "selectInboxItems", "blockerItems", "buildAssigneeOptions",
  "nameOf", "cleanName", "inFolder", "directChild", "forbiddenPath", "normalizeList", "refs", "statusLabel",
  "taskStatus", "projectStatus", "text", "yamlValue", "statusBadge", "renderKnowledgeLinks",
  "parseFM", "writeFM", "makeMD", "webChecklistOf", "webSummaryOf", "EDITABLE_FIELDS", "projectMatches", "stripProjectPrefix", "folderPathOf", "renderNavigation",
  "toneFromLuminance", "computeBannerDisplay", "writeBannerBinary", "loadBannerImage", "DEFAULTS", "STATUS",
  "buildWebPayload", "shadowScopedCss", "WEB_SHELL_HTML", "WEB_SHADOW_BRIDGE_CSS",
  "ppWebAppFactory", "PP_WEB_CSS", "APP_VIEW",
  /* 动效（motion）面：设置归一化与运行时工具。放进契约里是为了让"导出被改名/删掉"
     在测试启动时就报错，而不是等到 11-motion 套件里变成一条含义模糊的失败。 */
  "normalizeSettings", "normalizeMotionLevel",
  "motionLevel", "currentMotionLevel", "prefersReducedMotion", "jsMotionEnabled",
  "applyMotionLevel", "setCssVar", "createMotionContext", "countUp", "trackPointerSpotlight"
];

/** 视图类与常量：同样由 main.js 交出来，供测试直接实例化 */
const EXPOSED_NAMES = [
  "DashboardView", "ProjectView", "InboxView", "TaskListView", "ResourceView",
  "BannerPickerModal", "BannerCropModal", "SettingsTab",
  "FormModal", "ChoiceModal", "MultiChoiceModal", "ConfirmModal", "WebAppView",
  "APP_VIEW", "DEFAULTS", "STATUS", "PLUGIN_BUILD"
];

function normalizePath(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}
function baseName(p) { return normalizePath(p).split("/").pop() || ""; }
function parentOf(p) { const parts = normalizePath(p).split("/"); parts.pop(); return parts.join("/"); }
function stem(name) { return String(name).replace(/\.[^./]+$/, ""); }
function extensionOf(name) { const match = String(name).match(/\.([^./]+)$/); return match ? match[1] : ""; }

/* ------------------------------------------------------------------ *
 * frontmatter：足够解析插件自己写出的 YAML 子集
 * ------------------------------------------------------------------ */

function parseScalar(raw) {
  const value = String(raw).trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try { return JSON.parse(value); } catch (_error) { return value.slice(1, -1); }
  }
  if (value.startsWith("[") || value.startsWith("{")) {
    try { return JSON.parse(value); } catch (_error) { return value; }
  }
  return value;
}

function parseFrontmatter(content) {
  if (typeof content !== "string" || !content.startsWith("---")) return {};
  const firstBreak = content.indexOf("\n");
  if (firstBreak < 0) return {};
  const end = content.indexOf("\n---", firstBreak + 1);
  if (end < 0) return {};
  const block = content.slice(firstBreak + 1, end);
  const data = {};
  /* 先去掉 \r 再拆行：JS 正则把 \r 当行终止符，`$` 不会在它之前匹配，
     于是 CRLF 文件的**最后一个键**会整行失配被丢掉（导致归档快照在测试里"消失"）。 */
  const lines = block.replace(/\r/g, "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([^\s:#][^:]*):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const raw = match[2].trim();
    if (raw === "") {
      const items = [];
      let cursor = index + 1;
      while (cursor < lines.length && /^\s+-\s*/.test(lines[cursor])) {
        items.push(parseScalar(lines[cursor].replace(/^\s+-\s*/, "")));
        cursor += 1;
      }
      data[key] = items.length ? items : "";
      index = cursor - 1;
      continue;
    }
    data[key] = parseScalar(raw);
  }
  return data;
}

function stringifyScalar(value) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  if (text === "") return '""';
  if (/[:#[\]{}",\n]|^\s|\s$|^-/.test(text)) return JSON.stringify(text);
  if (/^(true|false|null|~|[-+]?\d+(\.\d+)?)$/.test(text)) return JSON.stringify(text);
  return text;
}

function serializeFrontmatter(frontmatter) {
  const lines = ["---"];
  Object.keys(frontmatter || {}).forEach((key) => {
    const value = frontmatter[key];
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      if (!value.length) { lines.push(key + ": []"); return; }
      lines.push(key + ":");
      value.forEach((item) => lines.push("  - " + stringifyScalar(item)));
      return;
    }
    if (typeof value === "object") { lines.push(key + ": " + JSON.stringify(value)); return; }
    lines.push(key + ": " + stringifyScalar(value));
  });
  lines.push("---");
  return lines.join("\n");
}

function bodyOf(content) {
  if (typeof content !== "string" || !content.startsWith("---")) return content || "";
  const firstBreak = content.indexOf("\n");
  if (firstBreak < 0) return "";
  const end = content.indexOf("\n---", firstBreak + 1);
  if (end < 0) return content;
  return content.slice(end + 4).replace(/^\r?\n/, "");
}

/* ------------------------------------------------------------------ *
 * 仿真 DOM
 * ------------------------------------------------------------------ */

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function decodeEntities(text) {
  return String(text === undefined || text === null ? "" : text)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

/** 找到标签结束的 `>`，跳过引号里的内容（属性值里可能有 `>`） */
function findTagEnd(source, start) {
  let quote = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const ch = source[index];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ">") return index;
  }
  return -1;
}

const ATTRIBUTE_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function applyAttributes(element, text) {
  ATTRIBUTE_RE.lastIndex = 0;
  let match = ATTRIBUTE_RE.exec(text);
  while (match) {
    const key = match[1];
    const raw = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : "";
    const value = decodeEntities(raw);
    element.setAttr(key, value);
    if (key === "id") element.id = value;
    if (key === "hidden") element.hidden = true;
    if (key.startsWith("data-")) element.dataset[key.slice(5).replace(/-([a-z])/g, (_all, ch) => ch.toUpperCase())] = value;
    match = ATTRIBUTE_RE.exec(text);
  }
}

/** 把 HTML 解析成 FakeElement 树。
 *  以前桩里 innerHTML 只是普通属性赋值，于是 main.js 注入的 WEB_SHELL_HTML 从未变成节点、
 *  $id() 恒为 null、app.js 的 render() 第一行就 return —— Web 渲染层的集成测试等于空转。 */
function parseHTMLInto(parent, html, harness) {
  const source = String(html === undefined || html === null ? "" : html);
  const stack = [parent];
  const top = () => stack[stack.length - 1];
  let index = 0;
  while (index < source.length) {
    const lt = source.indexOf("<", index);
    if (lt < 0) { appendTextNode(top(), source.slice(index)); break; }
    if (lt > index) appendTextNode(top(), source.slice(index, lt));
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      index = end < 0 ? source.length : end + 3;
      continue;
    }
    const gt = findTagEnd(source, lt);
    if (gt < 0) { appendTextNode(top(), source.slice(lt)); break; }
    const rawTag = source.slice(lt + 1, gt);
    index = gt + 1;
    if (rawTag.startsWith("/")) { if (stack.length > 1) stack.pop(); continue; }
    const selfClosing = /\/\s*$/.test(rawTag);
    const content = selfClosing ? rawTag.replace(/\/\s*$/, "") : rawTag;
    const nameMatch = content.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!nameMatch) continue;
    const tag = nameMatch[1].toLowerCase();
    const element = new FakeElement(tag, "", harness);
    applyAttributes(element, content.slice(nameMatch[0].length));
    top().appendChild(element);
    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(element);
  }
  return parent;
}

function appendTextNode(parent, text) {
  if (!text) return;
  parent.__nodes.push({ tag: "#text", text: String(text), parentElement: parent, __nodes: [], children: [] });
}

/** style="a:b;c:d" 要落到 element.style 上（真实 DOM 的行为）：
 *  渲染层用内联样式表达比例（KPI 进度条、时间规划柱高），不解析就断言不到。 */
function parseStyleAttribute(element, value) {
  String(value === undefined || value === null ? "" : value).split(";").forEach((declaration) => {
    const index = declaration.indexOf(":");
    if (index < 0) return;
    const prop = declaration.slice(0, index).trim();
    const val = declaration.slice(index + 1).trim();
    if (prop) element.style[prop] = val;
  });
}

function serializeNode(node) {
  if (!node) return "";
  if (node.tag === "#text") return String(node.text || "");
  const parts = ["<" + node.tag];
  if (node.cls) parts.push(' class="' + node.cls + '"');
  Object.keys(node.attributes || {}).forEach((key) => { if (key !== "class") parts.push(" " + key + '="' + node.attributes[key] + '"'); });
  if (VOID_TAGS.has(node.tag)) return parts.join("") + ">";
  /* 必须遍历 __nodes（含文本节点）：children 只含元素，用它会把所有文字丢掉 */
  const nodes = node.__nodes || node.children || [];
  return parts.join("") + ">" + nodes.map(serializeNode).join("") + "</" + node.tag + ">";
}

class FakeElement {
  constructor(tag, cls, harness) {
    this.tag = String(tag || "div").toLowerCase();
    this.tagName = this.tag.toUpperCase();
    this.cls = Array.isArray(cls) ? cls.join(" ") : String(cls || "");
    /* __nodes 装全部子节点（含 #text）；children 只暴露元素，与真实 DOM 一致 ——
       否则文本节点会混进 children，让 findByClass / 遍历代码读到没有 classList 的对象。 */
    this.__nodes = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.files = null;
    this.type = "";
    this.rows = 0;
    this.__harness = harness || null;
    if (this.tag === "img") {
      let srcValue = "";
      Object.defineProperty(this, "src", {
        configurable: true,
        get: () => srcValue,
        set: (value) => { srcValue = String(value); if (this.__harness) this.__harness.queueImage(this); }
      });
    }
    if (this.tag === "canvas") {
      this.width = 300;
      this.height = 150;
      this.getContext = () => ({ drawImage: () => { this.__drawn = (this.__drawn || 0) + 1; } });
      this.toBlob = (callback) => {
        if (this.__harness) this.__harness.queueTimeout(() => callback(this.__harness.makeBlob()), 0);
        else callback({ arrayBuffer: async () => new ArrayBuffer(8), type: "image/png", size: 8 });
      };
    }
  }
  /** children 只含元素（与真实 DOM 一致）；childNodes 才含文本节点 */
  get children() { return this.__nodes.filter((node) => node.tag !== "#text"); }
  set children(value) { this.__nodes = Array.isArray(value) ? value : []; }
  get childNodes() { return this.__nodes.slice(); }
  get firstChild() { return this.__nodes[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const list = this.children; return list[list.length - 1] || null; }
  get className() { return this.cls; }
  set className(value) { this.cls = String(value || ""); }
  /** textContent 是计算属性：文本以 #text 节点存在 __nodes 里，
   *  这样 innerHTML 解析出来的树能被 textContent / h.textOf 正确聚合。 */
  get textContent() {
    if (!this.__nodes.length) return "";
    let out = "";
    this.__nodes.forEach((child) => { out += child.tag === "#text" ? String(child.text || "") : (child.textContent || ""); });
    return out;
  }
  set textContent(value) {
    const text = value === undefined || value === null ? "" : String(value);
    this.__clearChildren();
    if (text !== "") appendTextNode(this, text);
  }
  get innerHTML() { return (this.__nodes || []).map(serializeNode).join(""); }
  set innerHTML(value) {
    this.__clearChildren();
    parseHTMLInto(this, value, this.__harness);
  }
  __clearChildren() {
    this.__nodes.forEach((child) => { child.parentElement = null; });
    this.__nodes = [];
    /* 真实 DOM 里清空子树会一并移除后代监听：不清就会掩盖“重复绑定 / 泄漏”类问题 */
    this.listeners.clear();
  }
  /** 深度优先遍历所有元素后代（不含自身、不含文本节点） */
  __walk(visit) {
    (this.__nodes || []).forEach((child) => {
      if (!child || child.tag === "#text") return;
      visit(child);
      if (child.__walk) child.__walk(visit);
    });
  }
  getElementById(id) {
    const needle = String(id);
    let found = null;
    this.__walk((node) => { if (!found && (node.id === needle || (node.attributes && node.attributes.id === needle))) found = node; });
    return found;
  }
  querySelectorAll(selector) {
    const out = [];
    this.__walk((node) => { if (node.matches && node.matches(selector)) out.push(node); });
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  /** 支持 tag / .class / #id / [attr] / [attr="v"] 的复合选择器，以及逗号分隔的选择器列表
   *  （不含后代组合器，够渲染层与委托用） */
  matches(selector) {
    let remaining = String(selector || "").trim();
    if (!remaining) return false;
    if (remaining.indexOf(",") >= 0) return remaining.split(",").some((part) => this.matches(part.trim()));
    const tagMatch = remaining.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
    if (tagMatch) {
      if (this.tag !== tagMatch[0].toLowerCase()) return false;
      remaining = remaining.slice(tagMatch[0].length);
    }
    const idMatch = remaining.match(/#[-\w]+/);
    if (idMatch) {
      const wanted = idMatch[0].slice(1);
      if (this.id !== wanted && (!this.attributes || this.attributes.id !== wanted)) return false;
    }
    for (const token of remaining.match(/\.[-\w]+/g) || []) {
      if (!this.classList.contains(token.slice(1))) return false;
    }
    for (const attr of remaining.match(/\[[^\]]+\]/g) || []) {
      const parsed = attr.slice(1, -1).match(/^([-\w:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?$/);
      if (!parsed) return false;
      const value = this.attributes ? this.attributes[parsed[1]] : undefined;
      if (value === undefined) return false;
      const wanted = parsed[2] !== undefined ? parsed[2] : parsed[3] !== undefined ? parsed[3] : parsed[4];
      if (wanted !== undefined && value !== wanted) return false;
    }
    return true;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
  get classList() {
    const self = this;
    return {
      add: (...tokens) => self.addClass(...tokens),
      remove: (...tokens) => { self.cls = self.cls.split(/\s+/).filter((token) => token && !tokens.includes(token)).join(" "); },
      contains: (token) => self.cls.split(/\s+/).includes(token)
    };
  }
  empty() {
    this.__clearChildren();
    return this;
  }
  addClass(...tokens) {
    tokens.flat().forEach((token) => {
      if (typeof token !== "string" || token === "") return;
      if (/\s/.test(token)) { const error = new Error("invalid class token: " + token); error.name = "InvalidCharacterError"; throw error; }
      if (!this.classList.contains(token)) this.cls = (this.cls + " " + token).trim();
    });
    return this;
  }
  removeClass(...tokens) { this.classList.remove(...tokens.flat()); return this; }
  toggleClass(token, on) { if (on === undefined ? !this.classList.contains(token) : on) this.addClass(token); else this.removeClass(token); return this; }
  hasClass(token) { return this.classList.contains(token); }
  setText(value) { this.textContent = value === undefined || value === null ? "" : String(value); return this; }
  setAttr(key, value) {
    if (key === "class") { this.cls = String(value); return this; }
    this.attributes[key] = String(value);
    if (key === "style") parseStyleAttribute(this, value);
    if (key === "type") this.type = String(value);
    if (key === "value") this.value = String(value);
    if (key === "disabled") this.disabled = true;
    /* 真实 DOM 里 `checked` 属性决定控件的初始勾选状态（复选框的多选控件靠它表达"已选中"）；
       不映射的话，渲染层写出的 checked 在桩里读回来永远是 false，测试就会误判成"没勾上"。 */
    if (key === "checked") this.checked = true;
    return this;
  }
  getAttr(key) { return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null; }
  /** 标准 DOM 名。以前只有 getAttr，渲染层里 event.target.getAttribute(...) 一调就炸 ——
   *  这也是"渲染从未被测到"的另一个证据：老测试自己造了带 getAttribute 的假 target。 */
  getAttribute(key) { return this.getAttr(key); }
  hasAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); }
  setAttribute(key, value) { return this.setAttr(key, value); }
  removeAttribute(key) { delete this.attributes[key]; if (key === "disabled") this.disabled = false; return this; }
  createEl(tag, options) {
    const opts = typeof options === "string" ? { cls: options } : (options || {});
    const child = new FakeElement(tag, opts.cls, this.__harness);
    if (opts.text !== undefined) child.setText(opts.text);
    if (opts.value !== undefined) child.value = opts.value;
    if (opts.type !== undefined) child.type = String(opts.type);
    if (opts.attr) Object.keys(opts.attr).forEach((key) => child.setAttr(key, opts.attr[key]));
    child.parentElement = this;
    this.__nodes.push(child);
    return child;
  }
  createDiv(options) { return this.createEl("div", options); }
  createSpan(options) { return this.createEl("span", options); }
  appendChild(child) {
    /* 真实 DOM 的移动语义：先脱离旧父节点，否则同一节点会同时挂在两棵树上 */
    if (child.parentElement && child.parentElement !== this && Array.isArray(child.parentElement.__nodes)) {
      const index = child.parentElement.__nodes.indexOf(child);
      if (index >= 0) child.parentElement.__nodes.splice(index, 1);
    }
    child.parentElement = this;
    if (!this.__nodes.includes(child)) this.__nodes.push(child);
    return child;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
    return this;
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
    return this;
  }
  dispatch(type, event) {
    const payload = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() { payload.__stopped = true; } }, event || {});
    const promises = [];
    let result;
    /* 事件会冒泡：渲染层的写操作全靠事件委托（监听挂在宿主上），
       只在当前节点触发的话，点击按钮永远到不了委托处理器。 */
    let node = this;
    while (node) {
      const handlers = [...(node.listeners.get(type) || [])];
      const inline = node["on" + type];
      if (typeof inline === "function" && !handlers.includes(inline)) handlers.push(inline);
      handlers.forEach((handler) => {
        const value = handler(payload);
        if (value && typeof value.then === "function") promises.push(value);
        result = value;
      });
      if (payload.__stopped) break;
      node = node.parentElement;
    }
    /* 所有异步 handler 都要被等待：只保留最后一个会静默丢掉前面的 reject */
    if (!promises.length) return result;
    return Promise.all(promises).then(() => result);
  }
  click() { return this.dispatch("click"); }
  /** 焦点要一路写到所有祖先：真实 DOM 里 shadow root 与 document 都能回答 activeElement，
   *  渲染层的焦点契约（抽屉打开时入驻、关闭时回位、Tab 在抽屉内循环）完全依赖它。
   *  只记一个 focused 标记、或只写最顶层节点，都会让"焦点现在在哪"测不出来。 */
  focus() {
    this.focused = true;
    let node = this;
    while (node) {
      const previous = node.activeElement;
      if (previous && previous !== this && typeof previous.blur === "function") previous.blur();
      node.activeElement = this;
      node = node.parentElement;
    }
    return this;
  }
  blur() {
    this.focused = false;
    let node = this;
    while (node) {
      if (node.activeElement === this) node.activeElement = null;
      node = node.parentElement;
    }
    return this;
  }
  setSelectionRange() { return this; }
  remove() { if (this.parentElement) { const index = this.parentElement.__nodes.indexOf(this); if (index >= 0) this.parentElement.__nodes.splice(index, 1); this.parentElement = null; } }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture(id) { this.released = id; }
  getBoundingClientRect() { return { width: Number(this.style.width) || 0, height: Number(this.style.height) || 0, left: 0, top: 0 }; }
}

/* ------------------------------------------------------------------ *
 * 仿真 Vault / MetadataCache / Workspace
 * ------------------------------------------------------------------ */

class TFile {
  constructor(pathValue) {
    const normalized = normalizePath(pathValue);
    this.path = normalized;
    this.name = baseName(normalized);
    this.basename = stem(this.name);
    this.extension = extensionOf(this.name);
    this.parent = null;
    this.stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };
  }
  get vault() { return null; }
}

class TFolder {
  constructor(pathValue) {
    this.path = normalizePath(pathValue);
    this.name = baseName(this.path);
    this.children = [];
    this.parent = null;
  }
}

class FakeVault {
  constructor(harness) {
    this.__harness = harness;
    this.root = new TFolder("");
    this.files = new Map();
    this.folders = new Map();
    this.__content = new Map();
    this.__events = new Map();
    this.__binary = new Map();
    this.adapter = {
      exists: async (target) => this.folders.has(normalizePath(target)) || this.files.has(normalizePath(target)),
      writeBinary: async (target, buffer) => {
        const normalized = normalizePath(target);
        const existing = this.files.get(normalized);
        if (!existing) {
          const file = new TFile(normalized);
          const parent = this.folders.get(parentOf(normalized)) || this.root;
          file.parent = parent;
          parent.children.push(file);
          this.files.set(normalized, file);
        }
        this.__binary.set(normalized, buffer);
        this.__content.set(normalized, "");
        return this.files.get(normalized);
      },
      readBinary: async (target) => this.__binary.get(normalizePath(target)) || new ArrayBuffer(0),
      getResourcePath: (target) => "app://adapter/" + encodeURI(normalizePath(target)),
      stat: async (target) => ({ type: this.folders.has(normalizePath(target)) ? "folder" : "file", size: 0 })
    };
  }
  on(name, handler) { if (!this.__events.has(name)) this.__events.set(name, []); this.__events.get(name).push(handler); return { name, handler }; }
  offref(ref) { const list = this.__events.get(ref.name) || []; const index = list.indexOf(ref.handler); if (index >= 0) list.splice(index, 1); }
  emit(name, ...args) { (this.__events.get(name) || []).forEach((handler) => handler(...args)); }
  getName() { return "test-vault"; }
  getRoot() { return this.root; }
  getAbstractFileByPath(target) {
    const normalized = normalizePath(target);
    if (normalized === "") return this.root;
    return this.folders.get(normalized) || this.files.get(normalized) || null;
  }
  /* 按**码点序**排，不用 localeCompare：后者的结果取决于运行环境的 ICU/locale，
     同一个库在中文 Windows 与 CI 英文环境里会给出不同顺序（「甲」/「乙」相对次序不同）。
     桩必须与 locale 无关，否则会产出只在某些机器上才成立的红或绿。 */
  getFiles() {
    return [...this.files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
  getMarkdownFiles() { return this.getFiles().filter((file) => file.extension === "md"); }
  getFolderByPath(target) { return this.folders.get(normalizePath(target)) || null; }
  __readRaw(target) { return this.__content.get(normalizePath(target)); }
  __writeRaw(target, content) { this.__content.set(normalizePath(target), content); const file = this.files.get(normalizePath(target)); if (file) file.stat.mtime = Date.now(); }
  async create(target, content) {
    const normalized = normalizePath(target);
    if (this.getAbstractFileByPath(normalized)) throw new Error("File already exists: " + normalized);
    const parentPath = parentOf(normalized);
    const parent = this.folders.get(parentPath);
    if (!parent) throw new Error("Parent folder not found: " + parentPath);
    const file = new TFile(normalized);
    file.parent = parent;
    parent.children.push(file);
    this.files.set(normalized, file);
    this.__content.set(normalized, content === undefined ? "" : String(content));
    this.emit("create", file);
    this.__harness.noteVaultWrite("create", normalized);
    return file;
  }
  async createFolder(target) {
    const normalized = normalizePath(target);
    if (this.getAbstractFileByPath(normalized)) throw new Error("Folder already exists: " + normalized);
    const parentPath = parentOf(normalized);
    const parent = parentPath === "" ? this.root : this.folders.get(parentPath);
    if (!parent) throw new Error("Parent folder not found: " + parentPath);
    const folder = new TFolder(normalized);
    folder.parent = parent;
    parent.children.push(folder);
    this.folders.set(normalized, folder);
    this.emit("create", folder);
    return folder;
  }
  async delete(entry, permanent) {
    if (!entry) return;
    /* 记录第二个参数：Obsidian 的 delete(entry, true) 是"永久删除"，
       不带第二个参数则跟随用户的「删除文件」设置（回收站）。
       测试要能区分这两者，否则"强制永久删除"这种数据安全回退测不出来。 */
    if (!this.deleteCalls) this.deleteCalls = [];
    this.deleteCalls.push({ path: entry.path, permanent: permanent === true });
    this.__remove(entry);
  }
  /** 仿真 FileManager.trashFile 落到的两条回收站路径（系统回收站 / 库内 .trash）。
   *  与 delete 的区别只在"记录方式"：真实 Obsidian 的 trashSystem / trashLocal 不经过
   *  delete(entry, true)，所以这里也不该出现在 deleteCalls 里 —— 否则就分不清
   *  "插件走了回收站" 和 "插件强制永久删除" 了。 */
  async trash(entry, system) {
    if (!entry) return;
    if (!this.trashCalls) this.trashCalls = [];
    this.trashCalls.push({ path: entry.path, system: system === true });
    this.__remove(entry);
  }
  /** Obsidian 的 vault.getConfig 读 app.json 的配置项；这里只用到「删除文件」设置。
   *  默认值与 Obsidian 一致："system"（本库的 app.json 也确实没写 trashOption）。 */
  getConfig(key) {
    if (!this.config) this.config = { trashOption: "system" };
    return this.config[key];
  }
  /** 把条目从库里真正移除（delete 与 trash 共用） */
  __remove(entry) {
    if (entry instanceof TFolder) {
      const prefix = entry.path + "/";
      [...this.files.values()].filter((file) => file.path.startsWith(prefix)).forEach((file) => {
        this.files.delete(file.path); this.__content.delete(file.path);
      });
      [...this.folders.values()].filter((folder) => folder.path.startsWith(prefix)).forEach((folder) => this.folders.delete(folder.path));
    }
    if (entry instanceof TFile) { this.files.delete(entry.path); this.__content.delete(entry.path); }
    if (entry instanceof TFolder) this.folders.delete(entry.path);
    if (entry.parent) { const index = entry.parent.children.indexOf(entry); if (index >= 0) entry.parent.children.splice(index, 1); }
    this.emit("delete", entry);
  }
  async rename(entry, newPathValue) {
    if (!(entry instanceof TFile) && !(entry instanceof TFolder)) {
      throw new Error("vault.rename 需要 TAbstractFile，实际收到：" + (entry === null ? "null" : typeof entry) + " (" + String(entry && entry.path !== undefined ? entry.path : entry) + ")");
    }
    const newPath = normalizePath(newPathValue);
    const oldPath = entry.path;
    if (oldPath === newPath) return entry;
    const parentPath = parentOf(newPath);
    const parent = parentPath === "" ? this.root : this.folders.get(parentPath);
    if (!parent) throw new Error("Parent folder not found: " + parentPath);
    if (this.getAbstractFileByPath(newPath)) throw new Error("Destination already exists: " + newPath);
    if (entry instanceof TFolder) {
      const prefix = oldPath + "/";
      const affected = [...this.folders.values(), ...this.files.values()].filter((node) => node.path === oldPath || node.path.startsWith(prefix));
      affected.forEach((node) => {
        const rest = node.path === oldPath ? "" : node.path.slice(prefix.length);
        const next = rest ? newPath + "/" + rest : newPath;
        if (node instanceof TFolder) { this.folders.delete(node.path); this.folders.set(next, node); }
        else { this.files.delete(node.path); this.files.set(next, node); const content = this.__content.get(node.path); this.__content.delete(node.path); this.__content.set(next, content); }
        node.path = next;
        node.name = baseName(next);
        if (node instanceof TFile) { node.basename = stem(node.name); node.extension = extensionOf(node.name); }
      });
    } else {
      this.files.delete(oldPath); this.files.set(newPath, entry);
      const content = this.__content.get(oldPath); this.__content.delete(oldPath); this.__content.set(newPath, content);
      entry.path = newPath; entry.name = baseName(newPath); entry.basename = stem(entry.name); entry.extension = extensionOf(entry.name);
    }
    this.__relink();
    this.emit("rename", entry, oldPath);
    return entry;
  }
  __relink() {
    this.folders.forEach((folder) => { folder.children = []; });
    this.root.children = [];
    [...this.folders.values()].forEach((folder) => { folder.parent = folder.path === "" ? null : (this.folders.get(parentOf(folder.path)) || this.root); });
    [...this.files.values()].forEach((file) => { file.parent = this.folders.get(parentOf(file.path)) || this.root; });
    [...this.folders.values()].forEach((folder) => { if (folder !== this.root) (folder.parent || this.root).children.push(folder); });
    [...this.files.values()].forEach((file) => { (file.parent || this.root).children.push(file); });
  }
  async read(file) { return this.__content.get(file.path) || ""; }
  async cachedRead(file) { return this.read(file); }
  async modify(file, content) { this.__writeRaw(file.path, String(content)); this.emit("modify", file); }
  async process(file, transform) {
    const current = this.__content.get(file.path) || "";
    const next = transform(current);
    this.__writeRaw(file.path, String(next));
    this.emit("modify", file);
    return next;
  }
  async createBinary(target, buffer) {
    const normalized = normalizePath(target);
    if (this.getAbstractFileByPath(normalized)) throw new Error("File already exists: " + normalized);
    const parent = this.folders.get(parentOf(normalized));
    if (!parent) throw new Error("Parent folder not found: " + parentOf(normalized));
    const file = new TFile(normalized);
    file.parent = parent;
    parent.children.push(file);
    this.files.set(normalized, file);
    this.__content.set(normalized, "");
    this.__binary.set(normalized, buffer);
    this.emit("create", file);
    return file;
  }
  async modifyBinary(file, buffer) { this.__binary.set(file.path, buffer); this.emit("modify", file); }
  getResourcePath(file) { return "app://vault/" + encodeURI(file.path); }
  async append(file, content) { this.__writeRaw(file.path, (this.__content.get(file.path) || "") + content); this.emit("modify", file); }
}

class FakeMetadataCache {
  constructor(harness) { this.__harness = harness; this.vault = harness.vault; this.__events = new Map(); }
  on(name, handler) { if (!this.__events.has(name)) this.__events.set(name, []); this.__events.get(name).push(handler); return { name, handler }; }
  offref(ref) { const list = this.__events.get(ref.name) || []; const index = list.indexOf(ref.handler); if (index >= 0) list.splice(index, 1); }
  emit(name, ...args) { (this.__events.get(name) || []).forEach((handler) => handler(...args)); }
  getFileCache(file) {
    if (!file || !file.path) return null;
    const content = this.vault.__readRaw(file.path);
    if (content === undefined) { if (this.__cache) this.__cache.delete(file.path); return null; }
    /* 真实 Obsidian 的 getFileCache 是"取已解析好的缓存"，不是每次重新解析 YAML。
       桩以前每次都 parseFrontmatter —— 上千篇笔记的用例里"读 frontmatter"反而成了最贵的一步，
       性能数字完全失真。按内容字符串引用命中即可（内容没变就是同一个字符串，比较是 O(1)）。 */
    if (!this.__cache) this.__cache = new Map();
    const hit = this.__cache.get(file.path);
    if (hit && hit.content === content) return hit.cache;
    const cache = { frontmatter: parseFrontmatter(content), headings: [], links: [], tags: [] };
    this.__cache.set(file.path, { content, cache });
    return cache;
  }
  getFirstLinkpathDest(linkpath) { return this.vault.getAbstractFileByPath(linkpath) || null; }
  getBacklinksForFile() { return { data: new Map() }; }
}

class FakeFileManager {
  constructor(harness) { this.__harness = harness; this.vault = harness.vault; this.metadataCache = harness.metadataCache; }
  async processFrontMatter(file, transform) {
    const cache = this.metadataCache.getFileCache(file) || {};
    const frontmatter = cache.frontmatter || {};
    transform(frontmatter);
    const content = this.vault.__readRaw(file.path) || "";
    const next = serializeFrontmatter(frontmatter) + "\n" + bodyOf(content).replace(/^\n+/, "");
    this.vault.__writeRaw(file.path, next);
    this.vault.emit("modify", file);
    this.metadataCache.emit("changed", file, next, cache);
    this.__harness.noteVaultWrite("frontmatter", file.path);
    return frontmatter;
  }
  async renameFile(file, newPath) { return this.vault.rename(file, newPath); }
  /** 仿真 Obsidian 的 FileManager.trash：第二个参数 true=系统回收站、false=库内 .trash */
  async trash(file, system) { return this.vault.trash(file, system); }
  /** 仿真 Obsidian 的 FileManager.trashFile：读「删除文件」设置再决定走哪条路。
   *  这是插件里唯一"跟随用户设置"的删除入口 —— vault.delete 不读设置，而且
   *  在 Obsidian 1.13 对文件夹会直接以 ERR_FS_EISDIR 失败。 */
  async trashFile(file) {
    const option = this.vault.getConfig("trashOption") || "system";
    if (option === "system") return this.vault.trash(file, true);
    if (option === "local") return this.vault.trash(file, false);
    return this.vault.delete(file, true);
  }
}

/* ------------------------------------------------------------------ *
 * 仿真 Obsidian 组件
 * ------------------------------------------------------------------ */

class FakeButton {
  constructor() { this.buttonEl = new FakeElement("button"); this.disabled = false; }
  setButtonText(text) { this.label = text; this.buttonEl.setText(text); return this; }
  setCta() { this.cta = true; this.buttonEl.addClass("mod-cta"); return this; }
  setDisabled(value) { this.disabled = Boolean(value); this.buttonEl.disabled = Boolean(value); return this; }
  setTooltip(text) { this.tooltip = text; return this; }
  setIcon(icon) { this.icon = icon; return this; }
  setClass(cls) { this.buttonEl.addClass(cls); return this; }
  onClick(handler) { this.handler = handler; this.buttonEl.onclick = () => handler(); return this; }
}

class FakeControl {
  constructor(harness, kind, options) {
    this.__harness = harness;
    this.kind = kind;
    this.options = options || {};
    this.inputEl = new FakeElement(kind === "textarea" ? "textarea" : "input", "", harness);
    this.inputEl.inputEl = this.inputEl;
    this.value = "";
    this.changeHandler = null;
  }
  setValue(value) {
    this.value = value === undefined || value === null ? "" : String(value);
    this.inputEl.value = this.value;
    if (this.changeHandler) { const result = this.changeHandler(this.value); if (result && typeof result.then === "function") this.__harness.trackPromise(result); }
    return this;
  }
  getValue() { return this.value; }
  setPlaceholder(text) { this.placeholder = text; this.inputEl.setAttr("placeholder", text); return this; }
  addOptions(options) { this.options = options || {}; return this; }
  setLimit() { return this; }
  onChange(handler) { this.changeHandler = handler; return this; }
}

class Setting {
  constructor(container) {
    this.containerEl = container;
    this.settingEl = container.createDiv({ cls: "setting-item" });
    this.settingEl.__setting = this;
    this.infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
    this.__harness = container.__harness;
    this.__dropdown = null;
  }
  setName(text) { this.name = text; this.infoEl.createDiv({ cls: "setting-item-name", text }); return this; }
  setDesc(text) { this.desc = text; this.infoEl.createDiv({ cls: "setting-item-description", text }); return this; }
  setHeading() { return this; }
  setClass(cls) { this.settingEl.addClass(cls); return this; }
  setTooltip(text) { this.tooltip = text; return this; }
  addText(callback) { const control = new FakeControl(this.__harness, "text"); this.controlEl.appendChild(control.inputEl); callback(control); this.control = control; return this; }
  addTextArea(callback) { const control = new FakeControl(this.__harness, "textarea"); this.controlEl.appendChild(control.inputEl); callback(control); this.control = control; return this; }
  addToggle(callback) {
    const control = new FakeControl(this.__harness, "toggle");
    control.getValue = () => control.value === "true" || control.rawValue === true;
    Object.defineProperty(control, "value", { get: () => String(control.rawValue), set: (value) => { control.rawValue = value; }, configurable: true });
    control.setValue = function setValue(value) { control.rawValue = value; if (control.changeHandler) { const result = control.changeHandler(Boolean(value)); if (result && typeof result.then === "function") control.__harness.trackPromise(result); } return control; };
    callback(control); this.control = control; return this;
  }
  addDropdown(callback) {
    const control = new FakeControl(this.__harness, "select");
    const select = new FakeElement("select");
    control.inputEl = select;
    control.selectEl = select;
    this.controlEl.appendChild(select);
    control.addOptions = function addOptions(options) {
      control.optionMap = Object.assign({}, options);
      select.empty();
      Object.keys(options).forEach((key) => { const option = select.createEl("option"); option.value = key; option.setText(String(options[key])); });
      return control;
    };
    control.setValue = function setValue(value) {
      control.value = value === undefined || value === null ? "" : String(value);
      select.value = control.value;
      if (control.changeHandler) { const result = control.changeHandler(control.value); if (result && typeof result.then === "function") control.__harness.trackPromise(result); }
      return control;
    };
    control.getValue = () => control.value;
    control.setPlaceholder = () => control;
    control.selectOption = (value) => control.setValue(value);
    callback(control);
    this.control = control;
    return this;
  }
  addButton(callback) { const button = new FakeButton(); this.controlEl.appendChild(button.buttonEl); callback(button); if (!this.buttons) this.buttons = []; this.buttons.push(button); return this; }
  addExtraButton(callback) { const button = new FakeButton(); this.controlEl.appendChild(button.buttonEl); callback(button); return this; }
}

class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = new FakeElement("div", "", app && app.__harness);
    this.modalEl = new FakeElement("div", "", app && app.__harness);
    this.titleEl = new FakeElement("div", "", app && app.__harness);
    this.opened = false;
    this.closed = true;
    if (app && app.__harness) app.__harness.modals.push(this);
  }
  get containerEl() { return this.modalEl; }
  open() { this.opened = true; this.closed = false; if (typeof this.onOpen === "function") this.onOpen(); return this; }
  close() { if (this.closed) return; this.closed = true; this.opened = false; if (typeof this.onClose === "function") this.onClose(); }
}

class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = leaf.containerEl || new FakeElement("div", "", leaf.app && leaf.app.__harness);
    leaf.containerEl = this.containerEl;
    if (!this.containerEl.children.length) {
      this.containerEl.createDiv({ cls: "view-header" });
      this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
    } else {
      this.contentEl = this.containerEl.children[1];
    }
  }
  addAction() { return new FakeElement("div"); }
}

class PluginSettingTab {
  constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = new FakeElement("div", "", app && app.__harness); }
}

class Notice {
  /* 真实 Obsidian 的 Notice 有 noticeEl（可挂 onclick），提示才能做成"点一下打开仪表盘"。
     桩里也要有，否则渲染层/插件里对 noticeEl 的处理根本测不到。 */
  constructor(message, timeout) {
    this.message = String(message);
    this.timeout = timeout;
    this.hidden = false;
    this.noticeEl = new FakeElement("div", "notice");
    this.noticeEl.addClass("notice");
    Notice.messages.push(this.message);
    Notice.instances.push(this);
  }
  hide() { this.hidden = true; }
}
Notice.messages = [];
Notice.instances = [];

class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest || {};
    this.__views = new Map();
    this.__commands = [];
    this.__intervals = [];
    this.__registered = [];
    this.__settingTabs = [];
  }
  registerView(type, factory) { this.__views.set(type, factory); }
  addRibbonIcon(icon, title, callback) { this.__ribbon = { icon, title, callback }; return new FakeElement("div"); }
  addCommand(command) { this.__commands.push(command); return command; }
  addSettingTab(tab) { this.__settingTabs.push(tab); }
  registerEvent(ref) { this.__registered.push(ref); return ref; }
  registerInterval(id) { this.__intervals.push(id); return id; }
  registerDomEvent() {}
  addChild(child) { return child; }
  async loadData() { return this.__harness ? this.__harness.loadPluginData() : null; }
  async saveData(data) { if (this.__harness) this.__harness.savePluginData(data); }
}

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

class Harness {
  constructor(options) {
    const opts = options || {};
    this.modals = [];
    this.openedFiles = [];
    this.createdObjectUrls = [];
    this.revokedObjectUrls = [];
    this.notices = Notice.messages;
    Notice.messages = this.notices;
    /* 通知实例（含 noticeEl / onclick / hidden）：用来测"点通知打开仪表盘"这类交互 */
    this.noticeInstances = Notice.instances;
    Notice.instances = this.noticeInstances;
    /* 通知实例（含 noticeEl / onclick / hidden）：用来测"点通知打开仪表盘"这类交互 */
    this.noticeInstances = Notice.instances;
    Notice.instances = this.noticeInstances;
    this.consoleErrors = [];
    this.__timers = [];
    this.__intervalTimers = [];
    this.__timerId = 1;
    this.__vested = [];
    this.__writes = 0;
    this.__stormLimit = opts.stormLimit || 400;
    this.pendingPromises = new Set();
    this.imageMode = "ok";
    this.now = new Date(opts.now || "2026-09-25T09:00:00");
    this.pluginData = opts.data === undefined ? {} : opts.data;
    this.ignorePluginDataFile = opts.ignorePluginDataFile !== false;

    this.vault = new FakeVault(this);
    this.metadataCache = new FakeMetadataCache(this);
    this.fileManager = new FakeFileManager(this);
    this.workspace = this.__createWorkspace();
    this.app = {
      vault: this.vault,
      metadataCache: this.metadataCache,
      fileManager: this.fileManager,
      workspace: this.workspace,
      __harness: this
    };
    this.workspace.app = this.app;
    this.document = this.__createDocument();
    this.window = this.__createWindow();
  }

  /* ------------------------- 基础环境 ------------------------- */

  __createDocument() {
    const harness = this;
    return {
      createElement: (tag) => new FakeElement(tag, "", harness),
      createElementNS: (_ns, tag) => new FakeElement(tag, "", harness),
      addEventListener() {}, removeEventListener() {},
      body: new FakeElement("body", "", harness),
      documentElement: new FakeElement("html", "", harness)
    };
  }

  __createWindow() {
    const harness = this;
    const moment = (input) => new Moment(input === undefined ? harness.now : input);
    moment.now = () => harness.now.getTime();
    const listeners = new Map();
    return {
      innerWidth: 1440,
      innerHeight: 900,
      moment,
      setTimeout: (handler, delay) => harness.queueTimeout(handler, delay),
      clearTimeout: (id) => harness.clearTimeout(id),
      setInterval: (handler, delay) => harness.queueInterval(handler, delay),
      clearInterval: (id) => harness.clearInterval(id),
      addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
      removeEventListener(type, handler) { const list = listeners.get(type) || []; const index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); },
      /** 测试专用：向 window 派发事件（鼠标回退路径依赖 window 监听器） */
      dispatchEvent(type, event) {
        const payload = Object.assign({ type, target: null, preventDefault() {}, stopPropagation() {} }, event || {});
        [...(listeners.get(type) || [])].forEach((handler) => handler(payload));
        return payload;
      },
      listenerCount: (type) => (listeners.get(type) || []).length,
      app: harness.app,
      document: harness.document
    };
  }

  __createWorkspace() {
    const harness = this;
    return {
      app: null,
      __leaves: [],
      getLeavesOfType(type) { return harness.workspace.__leaves.filter((leaf) => leaf.view && leaf.view.getViewType && leaf.view.getViewType() === type); },
      getLeaf(_mode) {
        const leaf = {
          app: harness.app,
          containerEl: new FakeElement("div", "workspace-leaf-content", harness),
          async openFile(file) { harness.openedFiles.push(file); leaf.openedFile = file; },
          async open() {},
          detach() { harness.workspace.__leaves = harness.workspace.__leaves.filter((item) => item !== leaf); },
          setEphemeralState() {},
          async setViewState(state) {
            const factory = harness.plugin && harness.plugin.__views.get(state.type);
            if (!factory) throw new Error("View not registered: " + state.type);
            if (leaf.view && typeof leaf.view.onClose === "function") leaf.view.onClose();
            const view = factory(leaf, harness.plugin);
            view.app = harness.app;
            leaf.view = view;
            leaf.viewType = state.type;
            if (!harness.workspace.__leaves.includes(leaf)) harness.workspace.__leaves.push(leaf);
            let result;
            if (state.state !== undefined && typeof view.setState === "function") result = await view.setState(state.state);
            if (typeof view.onOpen === "function") await view.onOpen();
            return result;
          }
        };
        return leaf;
      },
      revealLeaf() {},
      async detachLeavesOfType(type) {
        harness.workspace.getLeavesOfType(type).forEach((leaf) => { if (leaf.view && leaf.view.onClose) leaf.view.onClose(); });
        harness.workspace.__leaves = harness.workspace.__leaves.filter((leaf) => !(leaf.view && leaf.view.getViewType && leaf.view.getViewType() === type));
      },
      getActiveFile: () => harness.activeFile || null,
      iterateAllLeaves(callback) { harness.workspace.__leaves.forEach(callback); },
      on() { return { name: "workspace", handler: null }; },
      onLayoutReady(callback) { callback(); }
    };
  }

  /** 载入 main.js 并实例化插件，返回插件实例 */
  async loadPlugin(options) {
    const opts = options || {};
    const obsidian = this.__createObsidianModule(opts);
    const context = {
      module: { exports: {} },
      exports: {},
      require: (name) => { if (name === "obsidian") return obsidian; throw new Error("Unexpected require: " + name); },
      console: {
        log: (...args) => { if (opts.verbose) console.log(...args); },
        warn: (...args) => { if (opts.verbose) console.warn(...args); },
        error: (...args) => { this.consoleErrors.push(args.map((item) => (item && item.stack) || String(item)).join(" ")); }
      },
      window: this.window,
      document: this.document,
      URL: {
        createObjectURL: () => { const url = "blob:harness-" + (this.createdObjectUrls.length + 1); this.createdObjectUrls.push(url); return url; },
        revokeObjectURL: (url) => { this.revokedObjectUrls.push(String(url)); }
      },
      setTimeout: this.window.setTimeout,
      clearTimeout: this.window.clearTimeout,
      setInterval: this.window.setInterval,
      clearInterval: this.window.clearInterval,
      requestAnimationFrame: (callback) => this.queueTimeout(callback, 0),
      cancelAnimationFrame: (id) => this.clearTimeout(id),
      __harness: this
    };
    context.globalThis = context;
    const source = fs.readFileSync(MAIN_PATH, "utf8");
    /* main.js 只提供两样东西：插件类、注入区块里的常量。
       内部实现来自"测试用模块包"（require），所以这里要把区块常量挂到 globalThis 上，
       模块包里的自由变量（views/web-app.ts 里的 PP_WEB_CSS 等）才能解析。 */
    const expose = [
      "",
      ";const __blockNames = " + JSON.stringify(BLOCK_NAMES) + ";",
      ";const __block = {};",
      ";for (const __name of __blockNames) {",
      ";  try { const __value = eval(__name); if (__value !== undefined) __block[__name] = __value; } catch (__error) {}",
      ";}",
      ";module.exports.__block = __block;",
      ""
    ].join("\n");
    vm.runInNewContext(source + expose, context, { filename: MAIN_PATH });
    const PluginClass = context.module.exports;
    const block = PluginClass.__block || {};
    for (const [name, value] of Object.entries(block)) globalThis[name] = value;
    /* 模块包跑在 Node 里，而实现会引用 window / document / URL 等浏览器对象（旧路径下 helper
       活在 vm 上下文里，这些都是现成的仿真实现）。把本次 boot 的仿真对象也挂到 globalThis 上，
       语义与旧路径一致；不覆盖 Node 自己的定时器与控制台。 */
    for (const name of ["window", "document", "URL", "Blob", "FileReader", "Image", "navigator", "location"]) {
      if (context[name] !== undefined) globalThis[name] = context[name];
    }

    /* 每次 boot 都重新加载模块包：模块级单例（缓存、计时器）不能跨 harness 复用，
       否则第二个用例会看到第一个用例的状态。require("obsidian") 临时接到仿真模块上。 */
    const Module = require("node:module");
    const resolveModule = Module._load;
    const modulePath = require.resolve(MODULES_PATH);
    delete require.cache[modulePath];
    Module._load = function (request) {
      if (request === "obsidian") return obsidian;
      return resolveModule.apply(this, arguments);
    };
    let modules;
    try {
      modules = require(MODULES_PATH);
    } finally {
      Module._load = resolveModule;
    }

    const surface = Object.assign({}, block, modules);
    /* HELPER_NAMES / EXPOSED_NAMES 现在是"模块包必须提供的导出"的契约：
       少了任何一个都说明构建产物过期或缺模块，直接报错，别让测试跑到残缺的实现上。 */
    if (!bootChecked) {
      const missing = HELPER_NAMES.concat(EXPOSED_NAMES)
        .filter((name) => surface[name] === undefined || surface[name] === null);
      if (missing.length) {
        throw new Error("测试用模块包缺少约定的导出：" + missing.join("、") +
          "（请运行：npm run build，或 node tools/build-modules.mjs）");
      }
      bootChecked = true;
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const plugin = new PluginClass(this.app, manifest);
    plugin.__harness = this;
    this.plugin = plugin;
    this.obsidian = obsidian;
    this.PluginClass = PluginClass;
    this.exposed = surface;
    this.helpers = surface;
    if (opts.load !== false) await plugin.onload();
    return plugin;
  }

  __createObsidianModule(overrides) {
    const harness = this;
    const base = {
      Plugin,
      Modal,
      ItemView,
      PluginSettingTab,
      Setting,
      Notice,
      TFile,
      TFolder,
      normalizePath,
      moment: this.window.moment,
      debounce: (fn) => fn,
      requestUrl: async () => ({ status: 200, text: "" }),
      Platform: { isDesktop: true, isMobile: false },
      addIcon() {},
      setIcon() {}
    };
    return Object.assign(base, overrides || {});
  }

  /* ------------------------- 时间与事件 ------------------------- */

  queueTimeout(handler, delay) { const id = this.__timerId++; this.__timers.push({ id, handler, delay: Number(delay) || 0 }); return id; }
  clearTimeout(id) { this.__timers = this.__timers.filter((timer) => timer.id !== id); }
  queueInterval(handler, delay) { const id = this.__timerId++; this.__intervalTimers.push({ id, handler, delay: Number(delay) || 0 }); return id; }
  clearInterval(id) { this.__intervalTimers = this.__intervalTimers.filter((timer) => timer.id !== id); }
  queueImage(image) { this.queueTimeout(() => { if (this.imageMode === "error") { if (image.onerror) image.onerror(new Error("image error")); } else if (image.onload) image.onload(); }, 0); }
  makeBlob() { return { type: "image/png", size: 16, arrayBuffer: async () => new ArrayBuffer(16) }; }
  noteVaultWrite(kind, target) {
    this.vaultWrites = (this.vaultWrites || 0) + 1;
    this.vaultWriteLog = this.vaultWriteLog || [];
    this.vaultWriteLog.push(kind + ":" + (target || ""));
    if (this.vaultWrites > this.__stormLimit) {
      this.stormDetected = true;
      if (!this.__stormReported) { this.__stormReported = true; this.consoleErrors.push("写入风暴：单次操作触发超过 " + this.__stormLimit + " 次 Vault 写入，疑似 refresh/sync 死循环"); }
    }
  }
  resetWriteLog() { this.vaultWrites = 0; this.vaultWriteLog = []; this.stormDetected = false; this.__stormReported = false; }

  /** 运行所有挂起的 timeout（含图片加载 / canvas.toBlob） */
  async runTimers(limit = 200) {
    let count = 0;
    while (this.__timers.length && count < limit) {
      const batch = this.__timers.splice(0, this.__timers.length);
      for (const timer of batch) {
        count += 1;
        await timer.handler();
      }
      await this.ticks(2);
    }
    return count;
  }

  /** 手动触发一次 interval（模拟 15 分钟定时器） */
  async fireIntervals() {
    for (const timer of [...this.__intervalTimers]) await timer.handler();
  }

  async ticks(times = 3) { for (let index = 0; index < times; index += 1) await new Promise((resolve) => setImmediate(resolve)); }

  /** 等待所有异步渲染/事件落地 */
  async settle(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) {
      await this.ticks(3);
      await this.runTimers();
      if (this.pendingPromises.size) {
        const pending = [...this.pendingPromises];
        this.pendingPromises.clear();
        await Promise.allSettled(pending);
      }
    }
  }

  trackPromise(promise) { this.pendingPromises.add(promise); promise.catch((error) => { this.consoleErrors.push(String((error && error.message) || error)); }); return promise; }

  setNow(iso) { this.now = new Date(iso); }

  /* ------------------------- 数据与查询 ------------------------- */

  seedFile(pathValue, content) {
    const target = normalizePath(pathValue);
    const parts = target.split("/");
    parts.pop();
    let current = "";
    parts.forEach((part) => {
      current = current ? current + "/" + part : part;
      if (!this.vault.folders.has(current)) {
        const folder = new TFolder(current);
        folder.parent = this.vault.folders.get(parentOf(current)) || this.vault.root;
        folder.parent.children.push(folder);
        this.vault.folders.set(current, folder);
      }
    });
    const parent = this.vault.folders.get(parentOf(target)) || this.vault.root;
    const file = new TFile(target);
    file.parent = parent;
    parent.children.push(file);
    this.vault.files.set(target, file);
    this.vault.__content.set(target, String(content));
    return file;
  }

  seedMarkdown(files) { return Object.keys(files).map((key) => this.seedFile(key, files[key])); }

  loadPluginData() { return this.pluginData === undefined ? null : this.pluginData; }
  savePluginData(data) { this.pluginData = JSON.parse(JSON.stringify(data)); }

  async openView(type, state) {
    const leaf = this.workspace.getLeaf(false);
    await leaf.setViewState({ type, state, active: true });
    return leaf;
  }

  findByClass(root, cls) { const out = []; walk(root, (node) => { if (node.classList && node.classList.contains(cls)) out.push(node); }); return out; }
  findText(root, text) { const out = []; walk(root, (node) => { if (node.textContent === text) out.push(node); }); return out; }
  /** 按设置项名称找到 Setting 对象（用于驱动 onChange） */
  settingByName(root, name) {
    let found = null;
    walk(root, (node) => {
      if (found || node.textContent !== name) return;
      let current = node;
      while (current) { if (current.__setting) { found = current.__setting; return; } current = current.parentElement; }
    });
    return found;
  }
  clickText(root, text) {
    const nodes = this.findText(root, text);
    for (const node of nodes) {
      let current = node;
      while (current) {
        const clickable = typeof current.onclick === "function" || (current.listeners && current.listeners.has("click"));
        if (clickable) return current.click();
        current = current.parentElement;
      }
    }
    throw new Error("找不到文本为 “" + text + "” 的可点击节点");
  }
  clickFirst(root, cls) {
    const target = this.findByClass(root, cls)[0];
    if (!target) throw new Error("找不到 class 为 " + cls + " 的节点");
    return target.click();
  }
  textOf(root) {
    const chunks = [];
    walk(root, (node) => { if (node.textContent) chunks.push(node.textContent); });
    return chunks.join("\n");
  }
  /** 提交通用 Modal：优先点文本匹配的按钮，否则点最后一个主按钮 */
  async submitModal(modal, label) {
    let target = null;
    if (label) target = this.findText(modal.contentEl, label).find((node) => node.tag === "button");
    if (!target) { const cta = this.findByClass(modal.contentEl, "mod-cta"); target = cta[cta.length - 1]; }
    if (!target) { const primary = this.findByClass(modal.contentEl, "pp-button-primary"); target = primary[primary.length - 1]; }
    if (!target) throw new Error("Modal 中找不到确认按钮");
    const result = target.click();
    await this.settle();
    if (result && typeof result.then === "function") await result;
    await this.settle();
    return result;
  }
  /** 打开中的 Modal 中最后一个打开的表单（用于连续 Modal 流程） */
  lastFormModal() {
    const open = this.modals.filter((modal) => !modal.closed && modal.controls && Object.keys(modal.controls).length);
    return open[open.length - 1] || null;
  }
  lastModal() { return this.modals.filter((modal) => !modal.closed).slice(-1)[0] || this.modals[this.modals.length - 1]; }
}

function walk(node, callback) {
  if (!node || !node.children) return;
  callback(node);
  node.children.forEach((child) => walk(child, callback));
}

class Moment {
  constructor(input) { this.date = input instanceof Date ? new Date(input.getTime()) : new Date(input); }
  format(pattern) {
    const pad = (value) => String(value).padStart(2, "0");
    return String(pattern)
      .replace(/YYYY/g, String(this.date.getFullYear()))
      .replace(/MM/g, pad(this.date.getMonth() + 1))
      .replace(/DD/g, pad(this.date.getDate()))
      .replace(/HH/g, pad(this.date.getHours()))
      .replace(/H/g, String(this.date.getHours()))
      .replace(/mm/g, pad(this.date.getMinutes()))
      .replace(/ss/g, pad(this.date.getSeconds()));
  }
  clone() { return new Moment(this.date); }
  isValid() { return !Number.isNaN(this.date.getTime()); }
  toDate() { return new Date(this.date.getTime()); }
  valueOf() { return this.date.getTime(); }
}

module.exports = {
  Harness,
  FakeElement,
  TFile,
  TFolder,
  normalizePath,
  parseFrontmatter,
  serializeFrontmatter,
  bodyOf,
  PLUGIN_DIR,
  MAIN_PATH,
  createHarness: (options) => new Harness(options)
};
