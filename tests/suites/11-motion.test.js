"use strict";
/**
 * 11 动效契约（MOTION.md 第 0/1/2/3/4/5 节）
 *
 * 这套用例只断言「契约说什么」，不断言「实现里恰好有什么」：
 *   A. 跨面一致性：14 个 `@keyframes ppd-*`、11 个 `--pp-mo-*` 令牌在插件 `styles.css`
 *      与 `web/styles.css` 里逐字一致（第 1、2 节）。
 *   B. 铁律：不得 `forwards`、入场必须 `backwards`、关键帧终点是静态可见态、只动
 *      `transform/opacity/filter/background-position/box-shadow`（第 0、2 节）。
 *   C. 强度开关：`data-pp-motion` / `data-motion` 的 subtle/off 覆盖，off 必须同时
 *      `animation: none !important` + `transition: none !important`（第 3 节）。
 *   D. Shadow DOM 适配：`shadowScopedCss` 只改选择器、不动关键帧（第 4 节推论）。
 *   E. 运行时：设置归一化、`data-pp-motion` 跟随设置、`pp-mo-enter` 只在首次建面、
 *      统计数字是终值、countUp 不重滚、off/subtle 不报错（第 0、4、5 节）。
 *   F. 生成物：`main.js` 内嵌的 `PP_WEB_CSS` 含全部关键帧；`pp-*` class 无缺样式。
 *   G. 覆盖度：钩子在真实渲染路径上确实出现（防「写了 CSS 但没人用」）。
 *
 * 说明：本文件不依赖兄弟套件的执行顺序（runner 每个套件前会清空 util.tests），
 * 也不产生未预期的 console.error。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, tests, setup, eqJson } = require("../util");
const { VIEW, openModal } = require("../drive");
const { FakeElement } = require("../harness");
const { analyze, PLUGIN_DIR } = require("../tools/check-css-coverage");

const PLUGIN_CSS_PATH = path.join(PLUGIN_DIR, "styles.css");
const MAIN_PATH = path.join(PLUGIN_DIR, "main.js");
/** 与 07/08 套件同口径：浏览器版静态站就在仓库的 web/ 下 */
const WEB_DIR = path.join(PLUGIN_DIR, "web");
const WEB_CSS_PATH = path.join(WEB_DIR, "styles.css");
const PLUGIN_LABEL = "styles.css";
const WEB_LABEL = "web/styles.css";

/** MOTION.md 第 2 节：14 个关键帧名（顺序照表） */
const KEYFRAMES = [
  "ppd-rise", "ppd-rise-sm", "ppd-pop", "ppd-slide-in", "ppd-fade", "ppd-grow-x",
  "ppd-sheen", "ppd-halo", "ppd-kenburns", "ppd-pulse", "ppd-shimmer", "ppd-flash",
  "ppd-march", "ppd-check"
];

/** MOTION.md 第 2 节的关键帧表：起止（含中点）逐条照抄，不允许改成实现里的写法 */
const KEYFRAME_TABLE = {
  "ppd-rise": {
    "0%": { opacity: "0", transform: "translate3d(0, 12px, 0)" },
    "100%": { opacity: "1", transform: "none" }
  },
  "ppd-rise-sm": {
    "0%": { opacity: "0", transform: "translate3d(0, 6px, 0)" },
    "100%": { opacity: "1", transform: "none" }
  },
  "ppd-pop": {
    "0%": { opacity: "0", transform: "scale(.97)" },
    "100%": { opacity: "1", transform: "none" }
  },
  "ppd-slide-in": {
    "0%": { opacity: "0", transform: "translate3d(-10px, 0, 0)" },
    "100%": { opacity: "1", transform: "none" }
  },
  "ppd-fade": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
  "ppd-grow-x": { "0%": { transform: "scaleX(0)" }, "100%": { transform: "scaleX(1)" } },
  "ppd-sheen": {
    "0%": { "background-position": "-140% 0" },
    "100%": { "background-position": "220% 0" }
  },
  "ppd-halo": {
    "0%": { transform: "scale(1) rotate(0deg)" },
    "100%": { transform: "scale(1.08) rotate(3deg)" }
  },
  "ppd-kenburns": { "0%": { transform: "scale(1.02)" }, "100%": { transform: "scale(1.06)" } },
  /* ppd-pulse 的起点在契约里是占位 `<同色 34%>`（颜色由各面自己的令牌表达），
     所以它的 from 用语义断言（见 T3），不放进这张字面表。 */
  "ppd-pulse": { "100%": { "box-shadow": "0 0 0 7px transparent" } },
  "ppd-shimmer": {
    "0%": { "background-position": "-160% 0" },
    "100%": { "background-position": "160% 0" }
  },
  "ppd-flash": {
    "0%": { filter: "brightness(1)" },
    "50%": { filter: "brightness(1.35)" },
    "100%": { filter: "brightness(1)" }
  },
  "ppd-march": {
    "0%": { "background-position": "0 0" },
    "100%": { "background-position": "16px 0" }
  },
  "ppd-check": {
    "0%": { transform: "scale(.86)" },
    "50%": { transform: "scale(1.12)" },
    "100%": { transform: "scale(1)" }
  }
};

/** MOTION.md 第 1 节的 11 个令牌，取值逐字取自契约 */
const MOTION_TOKENS = {
  "--pp-mo-instant": "90ms",
  "--pp-mo-fast": "140ms",
  "--pp-mo-base": "220ms",
  "--pp-mo-slow": "380ms",
  "--pp-mo-enter": "480ms",
  "--pp-mo-ambient": "14s",
  "--pp-mo-stagger": "45ms",
  "--pp-mo-ease": "cubic-bezier(0.22, 0.61, 0.36, 1)",
  "--pp-mo-ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "--pp-mo-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "--pp-mo-lift": "-3px"
};

/** 铁律 2 允许动的属性（关键帧里出现别的属性就是违反了这条） */
const ALLOWED_KEYFRAME_PROPS = new Set(["opacity", "transform", "filter", "background-position", "box-shadow"]);
/** 入场类关键帧：铁律 1 要求 fill-mode 为 backwards（必要时 both），绝不 forwards */
const ENTRANCE_KEYFRAMES = ["ppd-rise", "ppd-rise-sm", "ppd-pop", "ppd-slide-in", "ppd-fade"];

/** MOTION.md 第 2 节：多面之间允许存在的**表述**差异（语义仍由契约规定）。
 *  ppd-pulse 的起点写成 `<同色 34%>`，插件用 currentColor、Web 用自己的危险色令牌，
 *  占位符本身没规定字面写法，所以这一条单独做语义断言。 */
const CROSS_FACE_EXCEPTIONS = new Set(["ppd-pulse@0%"]);

const VIEW_CASES = [
  { label: "仪表盘", type: VIEW.dashboard },
  { label: "草稿箱", type: VIEW.inbox },
  { label: "日程待办", type: VIEW.tasks },
  { label: "资源", type: VIEW.resources, state: { category: "knowledge" } },
  { label: "单项目页", type: VIEW.project, state: { path: "20 项目库/仪表盘搭建/仪表盘搭建.md" } }
];

/**
 * 监听视图根节点上 pp-mo-enter 的挂/摘。为什么监听 FakeElement 而不是视图类：
 * harness 里的视图实例由 main.js 内联的类创建，与模块包导出的类是两份对象，
 * 在视图类原型上打补丁拦不到真实实例；而所有元素都来自同一个 FakeElement。
 */
function watchEnterClass() {
  const events = [];
  const originalAdd = FakeElement.prototype.addClass;
  const originalRemove = FakeElement.prototype.removeClass;
  FakeElement.prototype.addClass = function watchedAdd(...tokens) {
    tokens.flat().forEach((token) => {
      if (token === "pp-mo-enter" && this.classList.contains("pp-view-root")) {
        events.push({ op: "add", empty: this.children.length === 0 });
      }
    });
    return originalAdd.apply(this, tokens);
  };
  FakeElement.prototype.removeClass = function watchedRemove(...tokens) {
    tokens.flat().forEach((token) => {
      if (token === "pp-mo-enter" && this.classList.contains("pp-view-root")) events.push({ op: "remove" });
    });
    return originalRemove.apply(this, tokens);
  };
  return {
    events,
    adds: () => events.filter((event) => event.op === "add"),
    removes: () => events.filter((event) => event.op === "remove"),
    restore() {
      FakeElement.prototype.addClass = originalAdd;
      FakeElement.prototype.removeClass = originalRemove;
    }
  };
}

/* ------------------------------ CSS 解析工具 ------------------------------ */

function readText(file) { return fs.readFileSync(file, "utf8"); }

/** 去掉注释但保留下换行：偏移量与行号跟原文一致（CSS 注释里会出现 `{`，不去掉会拆错块） */
function stripComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
}

function lineOf(text, index) { return String(text).slice(0, index).split("\n").length; }

/** 去空白 + 数值写法归一（`.97` 与 `0.97` 是同一个值） */
function canonical(value) {
  return String(value)
    .replace(/(^|[^\d.])\.(\d)/g, "$1 0.$2")
    .replace(/\s+/g, "");
}

/**
 * 极简 CSS 规则扫描：只处理这两份文件实际用到的语法（声明块不含 `{`，规则不嵌套）。
 * @-rule 压栈，里面的规则带上 at 前缀；关键帧的每个 `from {}` 也会成为一条带 at 的规则。
 */
function parseCss(css) {
  const source = stripComments(css);
  const rules = [];
  const atStack = [];
  let head = "";
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (ch === "{") {
      const selector = head.trim();
      head = "";
      if (selector.startsWith("@")) { atStack.push(selector); index += 1; continue; }
      const end = source.indexOf("}", index);
      const body = source.slice(index + 1, end < 0 ? source.length : end);
      rules.push({ at: atStack.slice(), selector, body, line: lineOf(source, index) });
      index = (end < 0 ? source.length : end) + 1;
      continue;
    }
    if (ch === "}") { atStack.pop(); head = ""; index += 1; continue; }
    head += ch;
    index += 1;
  }
  return rules;
}

function declMap(body) {
  const props = new Map();
  String(body).split(";").forEach((part) => {
    const colon = part.indexOf(":");
    if (colon < 0) return;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = canonical(part.slice(colon + 1).trim());
    if (prop) props.set(prop, value);
  });
  return props;
}

function stepKeys(selector) {
  return String(selector).split(",").map((part) => {
    const key = part.trim().toLowerCase();
    if (key === "from") return "0%";
    if (key === "to") return "100%";
    return key;
  }).filter(Boolean);
}

/** 关键帧名 → { line, steps: Map<"0%"|"50%"|"100%", Map<prop, value>> } */
function collectKeyframes(css) {
  const source = stripComments(css);
  const raw = new Map();
  parseCss(css).forEach((rule) => {
    const at = rule.at.filter((entry) => /^@keyframes\s/.test(entry)).slice(-1)[0];
    if (!at) return;
    const name = at.replace(/^@keyframes\s+/, "").trim();
    const steps = raw.get(name) || new Map();
    stepKeys(rule.selector).forEach((key) => steps.set(key, declMap(rule.body)));
    raw.set(name, steps);
  });
  const out = new Map();
  raw.forEach((steps, name) => {
    const at = source.search(new RegExp("@keyframes\\s+" + name + "(?![\\w-])"));
    out.set(name, { name, line: at < 0 ? 0 : lineOf(source, at), steps });
  });
  return out;
}

function stepSignature(props) {
  return [...props.entries()].map(([prop, value]) => prop + ":" + value).sort().join(";");
}

function animationShorthands(css) {
  const out = [];
  parseCss(css).forEach((rule) => {
    const match = rule.body.match(/animation\s*:\s*([^;}]+)/);
    if (match) out.push({ rule, animation: match[1].trim() });
  });
  return out;
}

/* ---------------- 下面这组工具给「广义覆盖」断言用 ---------------- */

/** MOTION.md 第 3 节表格里的强度载体：每个作用域根都要能被 off/reduced 真的关停 */
const MOTION_SCOPES = {
  [PLUGIN_LABEL]: [".pp-view-root", ".pp-modal"],
  [WEB_LABEL]: [".app", ".drawer", ".scrim"]
};

/** 取选择器最右一个复合选择器（Subject），拆出伪元素与所在作用域根 */
function subjectOf(selector) {
  const parts = String(selector).split(/[\s>+~]+/).filter(Boolean);
  const tail = parts[parts.length - 1] || String(selector);
  const pseudoMatch = tail.match(/::(before|after)$/);
  const pseudo = pseudoMatch ? pseudoMatch[0] : "";
  let base = pseudo ? tail.slice(0, -pseudo.length) : tail;
  base = base
    .replace(/\[[^\]]*\]/g, "")
    .replace(/:not\([^)]*\)/g, "")
    .replace(/:(hover|focus-visible|focus-within|active|checked|disabled)/g, "");
  return { base, pseudo, tail };
}

function scopeOf(label, base) {
  return (MOTION_SCOPES[label] || []).find((scope) => base === scope || base.startsWith(scope + ".")) || "";
}

/** 选择器文本里显式写出的载体（`.drawer .x` → `.drawer`）；用于给后代播放者定作用域 */
function writtenScope(label, selector) {
  const text = String(selector);
  const found = (MOTION_SCOPES[label] || [])
    .filter((scope) => new RegExp(scope.replace(/\./g, "\\.") + "(?![\\w-])").test(text));
  return found.length ? found[found.length - 1] : "";
}

/** 选择器里看不出 DOM 嵌套的补充提示：MOTION.md 第 4 节把裁剪 UI 落在原生弹窗上
 *  （`.pp-crop-selection` / `.pp-crop-handle`），所以它们属于 `.pp-modal` 作用域。 */
const SCOPE_HINTS = [{ file: PLUGIN_LABEL, pattern: /pp-crop/, scope: ".pp-modal" }];

function hintScope(label, selector) {
  const hit = SCOPE_HINTS.find((item) => item.file === label && item.pattern.test(String(selector)));
  return hit ? hit.scope : "";
}

/**
 * 把某作用域（off 或 reduced）里所有 `animation: none !important` 的选择器归一成四种形状：
 *   global       —— 裸 `*`（文档级全元素）
 *   global-pseudo—— 裸 `*::before` / `*::after`
 *   subject      —— 某个具体主体（元素自身 / 自身伪元素 / 具体元素选择器）
 *   desc / desc-pseudo —— 某作用域根的后代（`<scope> *` / `<scope> *::after`），带 scope
 */
function scopedNoneSelectors(css, scopePredicate, label) {
  const out = [];
  parseCss(css).forEach((rule) => {
    if (!scopePredicate(rule)) return;
    if (!/animation\s*:\s*none\s*!important/.test(rule.body)) return;
    rule.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
      const tail = String(selector).split(/[\s>+~]+/).filter(Boolean).pop() || selector;
      const scope = writtenScope(label, selector);
      if (tail === "*") {
        out.push({ selector, line: rule.line, scope, kind: /^\*\s*$/.test(selector) ? "global" : "desc" });
        return;
      }
      if (tail === "*::before" || tail === "*::after") {
        out.push({
          selector, line: rule.line, scope, pseudo: tail.slice(1),
          kind: /^\*::(before|after)$/.test(selector) ? "global-pseudo" : "desc-pseudo"
        });
        return;
      }
      const subject = subjectOf(selector);
      out.push({ selector, line: rule.line, scope, kind: "subject", base: subject.base, pseudo: subject.pseudo });
    });
  });
  return out;
}

/**
 * 「这个播放者是否被某条 animation: none !important 覆盖」的静态近似。
 * 不做真正的级联：只判断结构形状（元素自身 / 自身伪元素 / 后代 / 后代伪元素）
 * 与作用域归属（最右复合选择器是不是某个 data-* 载体，或选择器链里写了哪个载体）。
 * 后代的归属无法百分之百确定（CSS 里看不到 DOM 嵌套），这里用「选择器链里显式写的载体，
 * 否则该面的默认载体」来定；这一点在文件末尾的"覆盖不到"清单里有说明。
 */
function coveredByScopedNone(noneSelectors, subject, scope) {
  const has = (predicate) => noneSelectors.some(predicate);
  if (has((item) => item.kind === "global")) return true;
  if (subject.pseudo && has((item) => item.kind === "global-pseudo" && item.pseudo === subject.pseudo)) return true;
  const lookupBase = subject.scope && subject.base.startsWith(subject.scope + ".") ? subject.scope : subject.base;
  if (has((item) => item.kind === "subject" && item.base === lookupBase && item.pseudo === subject.pseudo)) return true;
  if (subject.scope) return false; /* 作用域根自身只能靠「元素自身 / 自身伪元素」覆盖 */
  if (!scope) return false;
  return has((item) =>
    item.scope === scope && (subject.pseudo
      ? item.kind === "desc-pseudo" && item.pseudo === subject.pseudo
      : item.kind === "desc"));
}

/** 列出所有会真的播动画的规则（animation / animation-name 且值不是 none 等关键字） */
function animationPlayers(css) {
  const out = [];
  parseCss(css).forEach((rule) => {
    const match = rule.body.match(/(?:^|;)\s*animation(-name)?\s*:\s*([^;}]+)/);
    if (!match) return;
    const value = match[2].trim();
    if (/^(none|initial|unset|inherit|revert)\b/.test(value)) return;
    out.push({ line: rule.line, selector: rule.selector, value });
  });
  return out;
}

/** 该规则里某个属性的原始值（取最后一个声明） */
function declaredValue(body, property) {
  const pattern = new RegExp("(?:^|;)\\s*" + property + "\\s*:\\s*([^;}]+)", "gi");
  let value = null;
  let match;
  while ((match = pattern.exec(body))) value = match[1].trim();
  return value;
}

/** 逗号分隔但跳过括号内的逗号（`var(--pp-mo-ease, ease)` 不能被拆开） */
function splitTopLevel(value) {
  const out = [];
  let depth = 0;
  let current = "";
  String(value).split("").forEach((ch) => {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { out.push(current); current = ""; return; }
    current += ch;
  });
  out.push(current);
  return out.map((part) => part.trim()).filter(Boolean);
}

function sourceFiles() {
  return [[PLUGIN_LABEL, readText(PLUGIN_CSS_PATH)], [WEB_LABEL, readText(WEB_CSS_PATH)]];
}

/* ================================ A. 令牌 ================================ */

test("动效令牌：两侧 CSS 都写了全部 11 个 --pp-mo-* 且取值与 MOTION.md 第 1 节逐字一致", async () => {
  const byName = new Map();
  const namesPerFile = new Map();
  sourceFiles().forEach(([label, css]) => {
    const seen = new Set();
    /* 只看「令牌定义块」：第 3 节的 subtle 覆盖会合法地把 --pp-mo-enter 改成 260ms、
       --pp-mo-stagger 改成 0ms —— 那是状态覆盖，不是第 1 节规定的令牌取值。 */
    parseCss(css).forEach((rule) => {
      if (/\[data-(pp-)?motion=/.test(rule.selector)) return;
      for (const match of rule.body.matchAll(/(--pp-mo-[a-z-]+)\s*:\s*([^;}]+)/g)) {
        const name = match[1];
        const value = match[2].trim().replace(/\s+/g, " ");
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ label, value, line: rule.line });
        seen.add(name);
      }
    });
    namesPerFile.set(label, [...seen].sort());
  });

  Object.keys(MOTION_TOKENS).forEach((name) => {
    const hits = byName.get(name) || [];
    assert.ok(
      hits.length, name + " 在两侧 CSS 里都没有找到；MOTION.md 第 1 节要求两个 CSS 文件都写这份令牌表"
    );
    const expected = canonical(MOTION_TOKENS[name]);
    const faces = new Set(hits.map((hit) => hit.label));
    assert.equal(
      faces.size, 2,
      name + " 只在 " + [...faces].join("/") + " 里出现；MOTION.md 第 1 节要求两个 CSS 文件都要有"
    );
    hits.forEach((hit) => {
      assert.equal(
        canonical(hit.value), expected,
        hit.label + ":" + hit.line + " 的 " + name + " 实测「" + hit.value + "」，" +
        "期望「" + MOTION_TOKENS[name] + "」（MOTION.md 第 1 节）"
      );
    });
  });

  eqJson(
    namesPerFile.get(PLUGIN_LABEL), namesPerFile.get(WEB_LABEL),
    "两侧的 --pp-mo-* 令牌集合必须一致（MOTION.md 引言：两个渲染面用同一套令牌）"
  );
});

/* ============================== A. 关键帧表 ============================== */

test("关键帧：两侧各有 14 个 ppd-*，同名同步骤的声明跨面一致（MOTION.md 第 2 节）", async () => {
  const faces = sourceFiles().map(([label, css]) => [label, collectKeyframes(css)]);
  faces.forEach(([label, frames]) => {
    KEYFRAMES.forEach((name) => {
      assert.ok(frames.has(name), label + " 缺少 @keyframes " + name + "（MOTION.md 第 2 节的关键帧表）");
    });
    const extra = [...frames.keys()].filter((name) => KEYFRAMES.indexOf(name) < 0);
    eqJson(extra, [], label + " 出现了契约表之外的关键帧：" + extra.join("、") + "（MOTION.md 第 2 节）");
  });

  const [pluginFrames, webFrames] = [faces[0][1], faces[1][1]];
  const differences = [];
  KEYFRAMES.forEach((name) => {
    const left = pluginFrames.get(name);
    const right = webFrames.get(name);
    if (!left || !right) return;
    const keys = new Set([...left.steps.keys(), ...right.steps.keys()]);
    [...keys].sort().forEach((key) => {
      const leftSignature = stepSignature(left.steps.get(key) || new Map());
      const rightSignature = stepSignature(right.steps.get(key) || new Map());
      if (leftSignature === rightSignature) return;
      if (CROSS_FACE_EXCEPTIONS.has(name + "@" + key)) return;
      differences.push(
        name + " " + key + "：styles.css:（约 " + left.line + "）=" + (leftSignature || "(空)") +
        " vs web/styles.css:（约 " + right.line + "）=" + (rightSignature || "(空)")
      );
    });
  });
  eqJson(differences, [], "同名关键帧的声明必须跨面一致（MOTION.md:5「必须逐字使用…关键帧名」+ 第 2 节表）");

  /* 契约**明文允许**的表述差异（MOTION.md 第 2 节表下）：ppd-pulse 的起点色「按面表达」——
     插件用 currentColor（三个播放者的文字色就是语义色），Web 用真令牌 --pp-pulse-ring。
     所以这里只做语义断言（`0 0 0 0` + 34% α），并用 CROSS_FACE_EXCEPTIONS 登记；
     契约同时要求名单与文档保持同步，下面那条断言就是守这件事。 */
  faces.forEach(([label, frames]) => {
    const from = (frames.get("ppd-pulse") || { steps: new Map() }).steps.get("0%");
    assert.ok(from, label + " 的 ppd-pulse 缺少起点（MOTION.md 第 2 节）");
    assert.ok(
      /^0000(\D|$)/.test(from.get("box-shadow", "")),
      label + " 的 ppd-pulse 起点应是 0 偏移的 box-shadow「0 0 0 0 …」，实测「" +
      from.get("box-shadow") + "」（MOTION.md 第 2 节）"
    );
    assert.ok(
      /34%|0\.34/.test(from.get("box-shadow", "")),
      label + " 的 ppd-pulse 起点应是「同色 34%」，实测「" + from.get("box-shadow") + "」（MOTION.md 第 2 节）"
    );
  });

  const motionDoc = readText(path.join(PLUGIN_DIR, "MOTION.md"));
  assert.ok(
    motionDoc.includes("CROSS_FACE_EXCEPTIONS") && motionDoc.includes("ppd-pulse@0%"),
    "契约第 2 节要求跨面差异名单与本套件保持同步：MOTION.md 里应当写着 CROSS_FACE_EXCEPTIONS 与 ppd-pulse@0%"
  );
});

test("关键帧终点：逐条符合 MOTION.md 第 2 节表，且是元素的静态可见态（铁律 1）", async () => {
  sourceFiles().forEach(([label, css]) => {
    const frames = collectKeyframes(css);
    Object.keys(KEYFRAME_TABLE).forEach((name) => {
      const frame = frames.get(name);
      assert.ok(frame, label + " 缺少 @keyframes " + name);
      Object.keys(KEYFRAME_TABLE[name]).forEach((step) => {
        const actual = frame.steps.get(step);
        assert.ok(
          actual, label + ":（约 " + frame.line + "）的 " + name + " 缺少 " + step + " 关键帧（MOTION.md 第 2 节）"
        );
        Object.keys(KEYFRAME_TABLE[name][step]).forEach((prop) => {
          const expected = canonical(KEYFRAME_TABLE[name][step][prop]);
          assert.equal(
            actual.get(prop), expected,
            label + ":（约 " + frame.line + "）" + name + " " + step + " 的 " + prop +
            " 实测「" + (actual.get(prop) === undefined ? "(缺失)" : actual.get(prop)) + "」，" +
            "期望「" + KEYFRAME_TABLE[name][step][prop] + "」（MOTION.md 第 2 节表）"
          );
        });
      });
    });
  });

  /* 终点=静态态：入场类的 to 必须有 opacity:1（不能停在半透明），位移类的 to 必须归零 */
  sourceFiles().forEach(([label, css]) => {
    const frames = collectKeyframes(css);
    ENTRANCE_KEYFRAMES.forEach((name) => {
      const to = frames.get(name).steps.get("100%");
      assert.equal(to.get("opacity"), "1", label + " 的 " + name + " 终点必须是 opacity:1（铁律 1：不执行也完整可见）");
      if (to.has("transform")) {
        assert.equal(to.get("transform"), "none", label + " 的 " + name + " 终点 transform 必须归零（铁律 1）");
      }
    });
    assert.equal(
      frames.get("ppd-grow-x").steps.get("100%").get("transform"), "scaleX(1)",
      label + " 的 ppd-grow-x 终点必须是 scaleX(1)（进度条静态满值）"
    );
  });
});

/* ============================== B. 铁律 ============================== */

test("铁律 1/2：不得出现 forwards；入场必须 backwards；关键帧只动允许的 5 个属性", async () => {
  sourceFiles().forEach(([label, css]) => {
    const source = stripComments(css);
    animationShorthands(css).forEach(({ rule, animation }) => {
      assert.ok(
        !/\bforwards\b/.test(animation),
        label + ":（约 " + rule.line + "）的 animation 简写出现了 forwards，实测「" + animation +
        "」；MOTION.md 铁律 1 只允许 backwards（必要时 both）"
      );
      if (ENTRANCE_KEYFRAMES.some((name) => new RegExp("(^|[\\s,])" + name + "(?![\\w-])").test(animation))) {
        assert.ok(
          /\b(backwards|both)\b/.test(animation),
          label + ":（约 " + rule.line + "）入场动画必须是 backwards/both，实测「" + animation +
          "」；MOTION.md 铁律 1"
        );
      }
    });
    assert.ok(!forwardsWord(source), label + " 的动画声明里不得出现 forwards（铁律 1）");

    const frames = collectKeyframes(css);
    KEYFRAMES.forEach((name) => {
      const frame = frames.get(name);
      if (!frame) return;
      frame.steps.forEach((props, step) => {
        [...props.keys()].forEach((prop) => {
          assert.ok(
            ALLOWED_KEYFRAME_PROPS.has(prop),
            label + ":（约 " + frame.line + "）" + name + " " + step + " 动了 " + prop +
            "；MOTION.md 铁律 2 只允许 transform/opacity/filter/background-position/box-shadow"
          );
        });
      });
    });
  });

  /* 环境类：halo / kenburns / pulse 必须 alternate；halo、kenburns 用 --pp-mo-ambient；
     march 是 linear infinite（MOTION.md 第 2 节表下的时间轴说明） */
  sourceFiles().forEach(([label, css]) => {
    const players = animationShorthands(css);
    [["ppd-halo", true], ["ppd-kenburns", true], ["ppd-pulse", false]].forEach(([name, ambient]) => {
      const hits = players.filter((item) => new RegExp("(^|[\\s,])" + name + "(?![\\w-])").test(item.animation));
      hits.forEach((item) => {
        assert.ok(
          /\balternate\b/.test(item.animation),
          label + ":（约 " + item.rule.line + "）" + name + " 必须 animation-direction: alternate，实测「" + item.animation + "」（MOTION.md 第 2 节）"
        );
        if (ambient) {
          assert.ok(
            item.animation.includes("--pp-mo-ambient"),
            label + ":（约 " + item.rule.line + "）" + name + " 必须用 --pp-mo-ambient，实测「" + item.animation + "」（MOTION.md 第 2 节）"
          );
        }
      });
    });
    players
      .filter((item) => /(^|[\s,])ppd-march(?![\w-])/.test(item.animation))
      .forEach((item) => {
        assert.ok(
          /\blinear\b/.test(item.animation) && /\binfinite\b/.test(item.animation),
          label + ":（约 " + item.rule.line + "）ppd-march 必须是 linear infinite，实测「" + item.animation + "」（MOTION.md 第 2 节）"
        );
      });
  });
});

/** 只看动画声明里的 forwards（注释里出现「禁止 forwards」不算违规） */
function forwardsWord(strippedSource) {
  const declarations = strippedSource.match(/animation[^;{}]*/g) || [];
  return declarations.some((text) => /\bforwards\b/.test(text));
}

test("铁律 1：不得靠静态 opacity: 0 把内容藏起来再等动画显示（动画不执行时必须完整可见）", async () => {
  sourceFiles().forEach(([label, css]) => {
    parseCss(css).forEach((rule) => {
      const animation = rule.body.match(/animation\s*:\s*([^;}]+)/);
      if (!animation) return;
      const entrance = ENTRANCE_KEYFRAMES.some((name) => new RegExp("(^|[\\s,])" + name + "(?![\\w-])").test(animation[1]));
      if (!entrance) return;
      assert.ok(
        !/(^|;)\s*opacity\s*:\s*0(?![\d.])/.test(rule.body),
        label + ":（约 " + rule.line + "）「" + rule.selector + "」既播入场动画又静态写 opacity:0；" +
        "MOTION.md 铁律 1 的推论明确禁止这种写法（动画被关掉就是半透明死界面）"
      );
    });
  });
});

/* ========================== C. 强度开关 ========================== */

test("强度开关：subtle/off 覆盖完整，off 与 prefers-reduced-motion 都彻底关掉 animation/transition", async () => {
  const pluginRules = parseCss(readText(PLUGIN_CSS_PATH));
  const webRules = parseCss(readText(WEB_CSS_PATH));

  const faces = [
    { label: PLUGIN_LABEL, rules: pluginRules, subtleAttr: '[data-pp-motion="subtle"]', offAttr: '[data-pp-motion="off"]', cssPath: PLUGIN_CSS_PATH },
    { label: WEB_LABEL, rules: webRules, subtleAttr: '[data-motion="subtle"]', offAttr: '[data-motion="off"]', cssPath: WEB_CSS_PATH }
  ];

  faces.forEach((face) => {
    const { label, rules, subtleAttr, offAttr } = face;
    assert.ok(
      rules.some((rule) => rule.selector.includes(subtleAttr)),
      label + " 缺少 " + subtleAttr + " 的降级覆盖（MOTION.md 第 3 节）"
    );

    const offRules = rules.filter((rule) => rule.selector.includes(offAttr));
    assert.ok(offRules.length, label + " 缺少 " + offAttr + " 的覆盖（MOTION.md 第 3 节）");
    const stopRule = offRules.find((rule) =>
      new RegExp(offAttr.replace(/[[\]"]/g, "\\$&") + "\\s*\\*").test(rule.selector) &&
      /animation\s*:\s*none\s*!important/.test(rule.body) &&
      /transition\s*:\s*none\s*!important/.test(rule.body)
    );
    assert.ok(
      stopRule,
      label + " 的 " + offAttr + " 必须同时写 animation: none !important 与 transition: none !important " +
      "（不接受只压 duration；MOTION.md 第 3 节 / 铁律 4）"
    );
    offRules.forEach((rule) => {
      const animation = rule.body.match(/animation\s*:\s*([^;}]+)/);
      if (animation) {
        assert.ok(
          /^\s*none\b/.test(animation[1]),
          label + ":（约 " + rule.line + "）" + offAttr + " 作用域内不得再声明动画，实测「" + animation[1] + "」（MOTION.md 第 3 节）"
        );
      }
    });
    assert.ok(
      offRules.some((rule) => /(^|;)\s*transform\s*:\s*none/.test(rule.body)),
      label + " 的 " + offAttr + " 必须把悬停位移一并归零（MOTION.md 第 3 节）"
    );

    const reduced = rules.filter((rule) => rule.at.some((entry) => /prefers-reduced-motion/.test(entry)));
    assert.ok(
      reduced.length,
      label + " 必须保留 @media (prefers-reduced-motion: reduce)（MOTION.md 第 3 节）"
    );
    assert.ok(
      reduced.some((rule) =>
        /animation\s*:\s*none\s*!important/.test(rule.body) && /transition\s*:\s*none\s*!important/.test(rule.body)),
      label + " 的 prefers-reduced-motion 必须与 off 等价：animation/transition 都 none !important（MOTION.md 第 3 节）"
    );
    assert.ok(
      reduced.some((rule) => /(^|;)\s*transform\s*:\s*none/.test(rule.body)),
      label + " 的 prefers-reduced-motion 必须把悬停位移一并归零（铁律 4）"
    );
    reduced.forEach((rule) => {
      const animation = rule.body.match(/animation\s*:\s*([^;}]+)/);
      if (animation) {
        assert.ok(
          /^\s*none\b/.test(animation[1]),
          label + ":（约 " + rule.line + "）prefers-reduced-motion 作用域内不得再声明动画，实测「" + animation[1] + "」（MOTION.md 第 3 节）"
        );
      }
    });

    /* subtle：stagger 归零 + 入场 260ms（MOTION.md 第 3 节明写的值） */
    const subtleScope = rules.find((rule) => rule.selector.includes(subtleAttr) && /--pp-mo-stagger/.test(rule.body));
    assert.ok(subtleScope, label + " 的 " + subtleAttr + " 必须覆盖 --pp-mo-stagger（MOTION.md 第 3 节）");
    assert.match(subtleScope.body, /--pp-mo-stagger\s*:\s*0ms/, label + " 的 subtle 必须把 --pp-mo-stagger 归零（MOTION.md 第 3 节）");
    assert.match(subtleScope.body, /--pp-mo-enter\s*:\s*260ms/, label + " 的 subtle 必须把入场降到 260ms（MOTION.md 第 3 节）");

    /* subtle 必须关掉环境类与指针跟随：凡是播 ppd-halo/kenburns/pulse/sheen 的元素，
       都要在 subtle 作用域里被 animation: none 覆盖（MOTION.md 第 3 节）。
       这里用「选择器文本包含」近似级联判定；:hover/:focus-visible 的等价写法一并归一。 */
    const subtleNone = rules
      .filter((rule) => rule.selector.includes(subtleAttr) && /animation\s*:\s*none/.test(rule.body))
      .map((rule) => rule.selector)
      .join(" , ");
    ["ppd-halo", "ppd-kenburns", "ppd-pulse", "ppd-sheen"].forEach((name) => {
      const players = animationShorthands(readText(face.cssPath))
        .filter((item) => new RegExp("(^|[\\s,])" + name + "(?![\\w-])").test(item.animation));
      players.forEach((item) => {
        item.rule.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
          const base = selector.replace(/:(hover|focus-visible|focus-within)/g, "");
          assert.ok(
            subtleNone.includes(base),
            label + ":（约 " + item.rule.line + "）" + name + " 的播放者「" + selector +
            "」在 subtle 下没有被 animation: none 覆盖；MOTION.md 第 3 节要求 subtle 关闭环境类与 sheen"
          );
        });
      });
    });
    /* 指针跟随（spotlight）没有跨面通用的静态标记：插件用 --pp-spot / opacity 归零，
       Web 靠渲染层在 motion.level !== "full" 时直接不写 --pp-mx/--pp-my（app.js 的 handlePointerMove）。
       所以这一条不在这里做选择器级断言，改由「指针跟随（原生）」用例在运行时守住；
       Web 侧的端到端验证受测试桩限制，见文件末尾的说明。 */
  });
});

/* ====================== D. Shadow DOM 适配 ====================== */

test("Shadow 适配：@keyframes 数量不变、无残留 :root/body/.theme-*、宽度断点转 @container", async () => {
  const h = await setup({ seed: false, data: {} });
  const raw = readText(WEB_CSS_PATH);
  const scoped = h.helpers.shadowScopedCss(raw);
  const countOf = (text, pattern) => (text.match(pattern) || []).length;

  const rawKeyframes = countOf(raw, /@keyframes\s+ppd-[\w-]+\s*\{/g);
  assert.equal(rawKeyframes, 14, "web/styles.css 应有 14 个 ppd-* 关键帧，实测 " + rawKeyframes);
  assert.equal(
    countOf(scoped, /@keyframes\s+ppd-[\w-]+\s*\{/g), rawKeyframes,
    "Shadow 适配不得增删关键帧（MOTION.md 第 4 节：@keyframes 块内是安全的）"
  );

  [
    [/(^|\n)\s*:root\s*\{/, ":root {"],
    [/(^|\n)\s*body\s*\{/, "body {"],
    [/(^|\n)\s*html,\s*body\s*\{/, "html, body {"],
    [/(^|\n)\s*\.theme-dark\s*\{/, ".theme-dark {"],
    [/(^|\n)\s*\.theme-light\s*\{/, ".theme-light {"]
  ].forEach(([pattern, text]) => {
    assert.ok(!pattern.test(scoped), "Shadow 适配后仍残留行首「" + text + "」（MOTION.md 第 4 节推论）");
  });
  assert.ok(scoped.includes(":host(.theme-dark)"), "深色主题类应换成 :host(.theme-dark)");
  assert.ok(scoped.includes(":host(.theme-light)"), "浅色主题类应换成 :host(.theme-light)");

  assert.ok(
    scoped.includes("@media (prefers-reduced-motion: reduce)"),
    "prefers-reduced-motion 必须仍是 @media（MOTION.md 第 4 节 + 08-web-renderer 的守护）"
  );
  assert.ok(!/@media\s*\([^)]*width/.test(scoped), "宽度断点必须全部转成 @container");
  assert.ok(scoped.includes("@container (max-width: 1024px)"), "1024px 宽度断点应变成 @container");
  assert.ok(scoped.includes("@container (max-width: 640px)"), "640px 宽度断点应变成 @container");
  assert.equal(h.consoleErrors.length, 0, "适配过程不应产生错误：" + h.consoleErrors.join(" | "));
});

/* ========================== E. 运行时 ========================== */

test("设置归一化：非法 motionIntensity 收敛为 full，off/subtle 原样保留（MOTION.md 第 3 节）", async () => {
  const bad = await setup({ data: { motionIntensity: "nonsense" } });
  assert.equal(
    bad.plugin.settings.motionIntensity, "full",
    "非法 motionIntensity 实测「" + bad.plugin.settings.motionIntensity + "」，期望 full（MOTION.md 第 3 节：normalizeSettings 收敛）"
  );
  eqJson(bad.helpers.normalizeMotionLevel(undefined), "full", "缺失值也要回落 full");

  const off = await setup({ data: { motionIntensity: "off" } });
  assert.equal(off.plugin.settings.motionIntensity, "off", "合法值 off 必须原样保留");
  const subtle = await setup({ data: { motionIntensity: "subtle" } });
  assert.equal(subtle.plugin.settings.motionIntensity, "subtle", "合法值 subtle 必须原样保留");
});

test("原生视图：根节点 data-pp-motion 跟随设置，pp-mo-enter 只在首次建面出现（铁律 3）", async () => {
  const h = await setup({ data: { motionIntensity: "subtle" } });
  for (const item of VIEW_CASES) {
    /* 打开一个视图必须只渲染一轮：Obsidian 会先 setState()（内部 refresh）再 onOpen()
       （以前又 refresh 一次），铁律 3 要求 onOpen 在"本轮已经渲染过"时不再重复渲染。
       这里用两条相互独立的证据守它：
         · FakeElement 上 pp-mo-enter 的挂/摘事件（第二轮会摘掉）；
         · collectData() 的调用次数（每次 refresh 一次；资源页以前是 2）。 */
    const watch = watchEnterClass();
    const originalCollect = h.plugin.collectData;
    let collectCalls = 0;
    if (typeof originalCollect === "function") {
      h.plugin.collectData = function countedCollect(...args) {
        collectCalls += 1;
        return originalCollect.apply(this, args);
      };
    }
    let leaf;
    try {
      leaf = await h.openView(item.type, item.state);
      await h.settle();
    } finally {
      if (typeof originalCollect === "function") h.plugin.collectData = originalCollect;
      watch.restore();
    }
    const root = leaf.containerEl.children[1];
    assert.ok(root.classList.contains("pp-view-root"), item.label + "：根节点应有 .pp-view-root");
    assert.equal(
      root.getAttr("data-pp-motion"), "subtle",
      item.label + "：首次建面后根节点 data-pp-motion 实测「" + root.getAttr("data-pp-motion") + "」，期望 subtle（MOTION.md 第 3 节）"
    );
    if (typeof originalCollect === "function") {
      assert.equal(
        collectCalls, 1,
        item.label + "：打开视图只应采集一次数据（铁律 3：同一次 open 不得重复渲染），实测 collectData 调用 " + collectCalls + " 次"
      );
    }

    const adds = watch.adds();
    const removes = watch.removes();
    assert.equal(
      adds.length, 1,
      item.label + "：一次打开只应在首次建面时挂一次 pp-mo-enter，实测挂 " + adds.length + " 次（MOTION.md 第 4 节分镜 1 / 铁律 3）"
    );
    assert.ok(
      adds.every((event) => event.empty),
      item.label + "：pp-mo-enter 只能在「容器原本是空的」（真正的换页）时挂上（铁律 3）"
    );
    /* 铁律 3（本轮契约新增）：同一次 open() 内的连续渲染算入场、不算刷新 ——
       所以打开期间**不允许**出现摘掉 pp-mo-enter 的轮次，打开结束后也必须还在。
       这一条不能写成 if/else 兜底：一旦实现退回"setState+onOpen 各渲染一轮"，入场就丢了。 */
    assert.equal(
      removes.length, 0,
      item.label + "：同一次 open() 内的连续渲染算入场，不得摘掉 pp-mo-enter（MOTION.md 铁律 3）；实测摘掉 " + removes.length + " 次"
    );
    assert.ok(
      root.classList.contains("pp-mo-enter"),
      item.label + "：打开结束后根节点必须仍带 pp-mo-enter（MOTION.md 铁律 3：这两轮都属于「打开」）"
    );
    assert.ok(
      !root.classList.contains("pp-mo-loading"),
      item.label + "：渲染收尾应摘掉 pp-mo-loading 骨架类（MOTION.md 第 4 节分镜 16）"
    );

    const refreshWatch = watchEnterClass();
    try {
      await leaf.view.refresh();
      await h.settle();
    } finally {
      refreshWatch.restore();
    }
    const after = leaf.containerEl.children[1];
    assert.equal(
      after.getAttr("data-pp-motion"), "subtle",
      item.label + "：刷新后强度仍应等于设置值（MOTION.md 第 3 节）"
    );
    assert.equal(
      refreshWatch.adds().length, 0,
      item.label + "：数据刷新（vault 事件 / 自动刷新）不得重挂 pp-mo-enter（MOTION.md 铁律 3）"
    );
    assert.ok(
      !after.classList.contains("pp-mo-enter"),
      item.label + "：数据刷新（vault 事件 / 自动刷新）不得重播整页入场（MOTION.md 铁律 3）"
    );
  }
  assert.equal(h.consoleErrors.length, 0, "打开与刷新不应产生错误：" + h.consoleErrors.join(" | "));
});

test("原生视图：motionIntensity=off/subtle 下重复 refresh 不抛错、不写 console.error", async () => {
  const h = await setup();
  const leaves = [];
  for (const item of VIEW_CASES) {
    const leaf = await h.openView(item.type, item.state);
    leaves.push({ label: item.label, leaf });
  }
  await h.settle();

  for (const level of ["off", "subtle"]) {
    h.plugin.settings.motionIntensity = level;
    for (const item of leaves) await item.leaf.view.refresh();
    await h.settle();
    leaves.forEach((item) => {
      const root = item.leaf.containerEl.children[1];
      assert.equal(
        root.getAttr("data-pp-motion"), level,
        item.label + "：设为 " + level + " 后根节点实测「" + root.getAttr("data-pp-motion") + "」，期望 " + level
      );
      assert.ok(
        !root.classList.contains("pp-mo-enter"),
        item.label + "：强度切换后的刷新也不得重播入场（铁律 3）"
      );
    });
    assert.equal(
      h.consoleErrors.length, 0,
      "motionIntensity=" + level + " 时刷新不应产生错误：" + h.consoleErrors.join(" | ")
    );
  }
});

test("统计数字：桩环境（无 requestAnimationFrame）下 .pp-stat-value 是终值，不停在 0", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.dashboard);
  await h.settle();
  const root = leaf.containerEl.children[1];

  const cards = h.findByClass(root, "pp-stat-card");
  assert.equal(cards.length, 4, "仪表盘应有 4 张统计卡，实测 " + cards.length);
  const valueByLabel = new Map();
  cards.forEach((card) => {
    const value = h.findByClass(card, "pp-stat-value")[0];
    assert.ok(value, "每张统计卡都应有 .pp-stat-value");
    assert.match(
      value.textContent, /^\d+$/,
      "统计数字必须是终值（数字文本），实测「" + value.textContent + "」；MOTION.md 第 5 节：没有 rAF 时直接写终值"
    );
    const label = card.children.filter((child) => !child.classList.contains("pp-stat-value")).slice(-1)[0];
    valueByLabel.set(label ? label.textContent : "", value.textContent);
  });

  /* 期望值来自 util.STANDARD_FILES 夹具本身（不是从实现里读回来的）：
     20 项目库 下 1 个 active 项目；50 日程待办 / 过期任务 共 1 条逾期；00 草稿箱 2 篇。 */
  assert.equal(valueByLabel.get("进行中项目"), "1", "「进行中项目」实测 " + valueByLabel.get("进行中项目") + "，期望 1（夹具里只有一个 active 项目）");
  assert.equal(valueByLabel.get("逾期任务"), "1", "「逾期任务」实测 " + valueByLabel.get("逾期任务") + "，期望 1（夹具里只有一条过期任务）");
  assert.equal(valueByLabel.get("草稿箱"), "2", "「草稿箱」实测 " + valueByLabel.get("草稿箱") + "，期望 2（夹具里 00 草稿箱 有两篇）");
  assert.equal(h.consoleErrors.length, 0, "渲染不应产生错误：" + h.consoleErrors.join(" | "));
});

test("countUp：值没变不重滚；补间结束落到终值并挂 ppd-flash；off 直接写终值", async () => {
  const h = await setup({ seed: false, data: {} });

  function spy() {
    return {
      textContent: "", writes: [], classes: [],
      setText(value) { this.writes.push(String(value)); this.textContent = String(value); },
      addClass(token) { this.classes.push(token); },
      removeClass(token) { this.classes = this.classes.filter((item) => item !== token); }
    };
  }

  /* 桩的 window 没有 requestAnimationFrame：必须直接写终值，而不是停在 0 */
  const flat = spy();
  const flatCtx = h.helpers.createMotionContext("full");
  h.helpers.countUp(flatCtx, flat, "projects", 3);
  assert.equal(flat.textContent, "3", "无 rAF 时必须直接写终值（MOTION.md 第 5 节）");
  h.helpers.countUp(flatCtx, flat, "projects", 3);
  assert.equal(flat.writes.length, 1, "同一个 key 连续两次同值调用，第二次不得改写文本（MOTION.md 第 5 节：值没变不做任何事）");
  h.helpers.countUp(flatCtx, flat, "projects", 5);
  assert.equal(flat.textContent, "5", "值变了必须更新");

  /* 注入一个假的 rAF 时钟：补间必须自己收敛到终值，并在结束时挂 ppd-flash（第 4 节分镜 6） */
  let clock = 0;
  let frames = 0;
  h.window.requestAnimationFrame = (callback) => {
    frames += 1;
    return h.queueTimeout(() => { clock += 200; callback(clock); }, 0);
  };
  const animated = spy();
  h.helpers.countUp(h.helpers.createMotionContext("full"), animated, "overdue", 4);
  assert.ok(frames > 0, "值发生变化时必须真的启动补间（否则下面的收敛断言是恒真的）");
  await h.runTimers();
  assert.equal(animated.textContent, "4", "补间必须收敛到终值，实测「" + animated.textContent + "」");
  assert.ok(
    animated.classes.includes("ppd-flash"),
    "补间结束应挂 ppd-flash（MOTION.md 第 4 节分镜 6），实际 class=" + JSON.stringify(animated.classes)
  );

  /* 起点就是终点（首次渲染 target=0 最常见）：直接写终值，不启动补间、也不该白闪一下 */
  const zeroFrames = frames;
  const zero = spy();
  h.helpers.countUp(h.helpers.createMotionContext("full"), zero, "empty", 0);
  assert.equal(zero.textContent, "0", "起点=终点时也必须把终值写出去（不能留空）");
  assert.equal(frames, zeroFrames, "起点=终点时不得启动补间（当前实现：from === target 直接写终值）");
  assert.ok(!zero.classes.includes("ppd-flash"), "起点=终点时不该挂 ppd-flash（没有发生数值跳变）");

  /* off：不允许 JS 动效 → 直接写终值，不挂 ppd-flash（铁律 4） */
  const direct = spy();
  h.helpers.countUp(h.helpers.createMotionContext("off"), direct, "inbox", 2);
  assert.equal(direct.textContent, "2", "off 下必须直接写终值");
  assert.ok(!direct.classes.includes("ppd-flash"), "off 下不得播 JS 动效（铁律 4）");
  assert.equal(h.consoleErrors.length, 0, "不应产生错误：" + h.consoleErrors.join(" | "));
});

test("运行时 API：强度归一 / 减少动效缺省 false / applyMotionLevel 与 setCssVar 在桩上安全（第 5 节）", async () => {
  const h = await setup({ seed: false, data: {} });
  const api = h.helpers;

  assert.equal(api.motionLevel("nonsense"), "full", "非法值必须回落 full（MOTION.md 第 5 节）");
  assert.equal(api.motionLevel(undefined), "full");
  assert.equal(api.motionLevel(null), "full");
  eqJson([api.motionLevel("full"), api.motionLevel("subtle"), api.motionLevel("off")], ["full", "subtle", "off"], "三个合法值必须原样返回");
  assert.equal(
    typeof api.prefersReducedMotion(), "boolean",
    "prefersReducedMotion 必须返回布尔值而不是抛错"
  );
  assert.equal(
    api.prefersReducedMotion(), false,
    "没有 matchMedia 的桩环境必须返回 false（MOTION.md 第 5 节）"
  );
  assert.equal(api.jsMotionEnabled("full"), true, "full 允许 JS 动效");
  assert.equal(api.jsMotionEnabled("subtle"), true, "subtle 仍允许数值滚动（MOTION.md 第 3 节只关环境类）");
  assert.equal(api.jsMotionEnabled("off"), false, "off 必须关闭 JS 动效（铁律 4）");

  const node = h.document.createElement("div");
  api.applyMotionLevel(node, "subtle");
  assert.equal(node.getAttr("data-pp-motion"), "subtle", "applyMotionLevel 必须把强度写到 data 属性上（第 3 节）");
  /* currentMotionLevel()：拿不到 plugin 的弹窗靠它回落到同一份强度（MOTION.md 第 5 节） */
  assert.equal(api.currentMotionLevel(), "subtle", "applyMotionLevel 必须刷新 currentMotionLevel（第 5 节）");
  api.applyMotionLevel(node, "off");
  assert.equal(api.currentMotionLevel(), "off", "currentMotionLevel 必须跟着最新的 applyMotionLevel 走");
  api.applyMotionLevel(node, "nonsense");
  assert.equal(node.getAttr("data-pp-motion"), "full", "applyMotionLevel 也必须收敛非法值");
  assert.equal(api.currentMotionLevel(), "full", "currentMotionLevel 也必须收敛非法值（第 5 节）");

  api.setCssVar(node, "--pp-mx", "42%");
  assert.equal(
    node.style["--pp-mx"], "42%",
    "桩的 style 是普通对象、没有 setProperty，setCssVar 必须退回直接赋值（MOTION.md 第 5 节）"
  );

  const root = h.document.createElement("div");
  api.trackPointerSpotlight(root, "off");
  assert.equal(
    (root.listeners.get("pointermove") || []).length, 0,
    "off 下不得挂指针跟随监听（铁律 4）"
  );
  api.trackPointerSpotlight(root, "full");
  api.trackPointerSpotlight(root, "full");
  assert.equal(
    (root.listeners.get("pointermove") || []).length, 1,
    "full 下只在根节点上一次性委托 pointermove，重复调用不得越挂越多（MOTION.md 第 5 节）"
  );
  assert.equal(h.consoleErrors.length, 0, "不应产生错误：" + h.consoleErrors.join(" | "));
});

/* ========================== F. 生成物 ========================== */

test("生成物：main.js 内嵌 PP_WEB_CSS 含全部 14 个关键帧，且 pp-* class 无缺样式", async () => {
  const h = await setup({ seed: false, data: {} });
  const embedded = String(h.helpers.PP_WEB_CSS || "");
  assert.ok(embedded.length > 1000, "main.js 应内嵌同步生成的 PP_WEB_CSS（sync-app.mjs 区块）");
  KEYFRAMES.forEach((name) => {
    assert.ok(
      new RegExp("@keyframes\\s+" + name + "(?![\\w-])").test(embedded),
      "main.js 内嵌的 PP_WEB_CSS 缺少 @keyframes " + name + "（MOTION.md 第 2 节）"
    );
  });
  assert.equal(
    (embedded.match(/@keyframes\s+ppd-[\w-]+\s*\{/g) || []).length, 14,
    "内嵌 PP_WEB_CSS 的关键帧数量应为 14"
  );

  const source = readText(MAIN_PATH);
  KEYFRAMES.forEach((name) => {
    assert.ok(
      new RegExp("@keyframes\\s+" + name + "(?![\\w-])").test(source),
      "main.js 文本里看不到 @keyframes " + name + "（生成区块缺失或未重建）"
    );
  });

  const result = analyze(PLUGIN_DIR);
  eqJson(result.missing, [], "main.js 里出现的 pp-* class 必须在 styles.css 有规则（新增类必须同时写样式）");
  assert.ok(result.used.length > 80, "样式覆盖率检查应覆盖全部视图 class，实际 used=" + result.used.length);
  assert.equal(h.consoleErrors.length, 0, "加载不应产生错误：" + h.consoleErrors.join(" | "));
});

/* ========================== G. 覆盖度 ========================== */

/** 复刻 08-web-renderer 的打开方式：桩会真正解析 WEB_SHELL_HTML，所以能拿到渲染后的节点 */
async function openRenderedApp(h) {
  const leaf = h.workspace.getLeaf();
  await leaf.setViewState({ type: VIEW.app });
  await h.settle();
  const hosts = h.findByClass(leaf.view.contentEl, "pp-web-host");
  if (!hosts.length) throw new Error("没有建立 shadow 宿主：" + h.textOf(leaf.view.contentEl).slice(0, 120));
  return { leaf, host: hosts[0], shell: hosts[0].children[1] };
}

test("Web 渲染层：data-motion 与 mo-enter 出现在真实渲染路径上，且只在真正换页签时重播（铁律 3）", async () => {
  const h = await setup({ data: { motionIntensity: "subtle" } });
  const { leaf, shell } = await openRenderedApp(h);

  const app = shell.getElementById("pp-app");
  assert.ok(app, "骨架应解析出 #pp-app");
  assert.equal(
    app.getAttr("data-motion"), "subtle",
    "#pp-app 的 data-motion 实测「" + app.getAttr("data-motion") + "」，期望 subtle（MOTION.md 第 3 节）"
  );
  ["drawer", "scrim"].forEach((id) => {
    assert.equal(
      shell.getElementById(id).getAttr("data-motion"), "subtle",
      "#" + id + " 在 .app 之外，必须各写一份 data-motion（MOTION.md 第 3 节）"
    );
  });

  const view = shell.getElementById("view");
  assert.ok(
    view.classList.contains("mo-enter"),
    "首次渲染应挂 mo-enter，实际 class=「" + view.cls + "」（MOTION.md 第 4 节分镜 1）"
  );
  assert.ok(
    shell.getElementById("tabs").classList.contains("mo-enter"),
    "首次渲染页签也应挂 mo-enter（MOTION.md 第 4 节分镜 1/9）"
  );

  await leaf.view.refresh();
  await h.settle();
  assert.ok(
    !shell.getElementById("view").classList.contains("mo-enter"),
    "setData()/数据刷新不得重播整页入场（铁律 3）"
  );

  /* 真正换页签 → 重播；再点同一个页签 → 不重播。
     注意：render() 会重建 #tabs 的子节点，旧引用会脱离文档树，所以每次都要重新取。 */
  const firstView = view.getAttr("data-view");
  const pickTabs = () => shell.getElementById("tabs").children;
  const other = pickTabs().find((tab) => tab.getAttr("data-view") !== firstView);
  assert.ok(other, "应存在与当前页签不同的页签（当前 " + firstView + "）");
  const targetView = other.getAttr("data-view");
  other.click();
  await h.settle();
  assert.equal(
    shell.getElementById("view").getAttr("data-view"), targetView,
    "点击页签后应切换到目标视图"
  );
  assert.ok(
    shell.getElementById("view").classList.contains("mo-enter"),
    "真正换页签必须重播入场（铁律 3）"
  );

  const current = pickTabs().find((tab) => tab.getAttr("data-view") === targetView);
  assert.ok(current, "换页签后应能重新找到当前页签节点（render 会重建页签）");
  current.click();
  await h.settle();
  assert.ok(
    !shell.getElementById("view").classList.contains("mo-enter"),
    "点同一个页签不算换页，不得保留/重播入场类（铁律 3）"
  );

  await leaf.view.refresh();
  await h.settle();
  assert.ok(
    !shell.getElementById("view").classList.contains("mo-enter"),
    "换页签之后的数据刷新同样不得重播整页入场（铁律 3）"
  );
  assert.equal(h.consoleErrors.length, 0, "Web 渲染不应产生错误：" + h.consoleErrors.join(" | "));
});

test("指针跟随（原生）：full 写入 --pp-mx/--pp-my，subtle/off 不挂监听、不写变量（分镜 5 + 铁律 4）", async () => {
  const h = await setup({ data: { motionIntensity: "full" } });
  const leaf = await h.openView(VIEW.dashboard);
  await h.settle();
  const root = leaf.containerEl.children[1];

  const pointerAt = (label) => {
    const card = h.findByClass(root, "pp-stat-card")[0];
    assert.ok(card, label + "：仪表盘应渲染出 .pp-stat-card");
    /* 桩的 getBoundingClientRect 读 style.width/height 的数值：给非零尺寸才走写入分支 */
    card.style.width = 200;
    card.style.height = 120;
    card.style["--pp-mx"] = "未写";
    card.dispatch("pointermove", { clientX: 50, clientY: 30 });
    return card.style["--pp-mx"];
  };
  const listenerCount = () => (root.listeners.get("pointermove") || []).length;

  assert.equal(listenerCount(), 1, "full 下应在视图根节点上一次性委托 pointermove（MOTION.md 第 5 节）");
  const written = pointerAt("full");
  assert.ok(
    /%$/.test(String(written)),
    "full 下指针移动应把坐标写进 --pp-mx（实测「" + written + "」）；MOTION.md 第 4 节分镜 5"
  );

  h.plugin.settings.motionIntensity = "subtle";
  await leaf.view.refresh();
  await h.settle();
  assert.equal(listenerCount(), 0, "subtle 下不得挂指针跟随监听（MOTION.md 第 3 节）");
  assert.equal(pointerAt("subtle"), "未写", "subtle 下不得跟随指针写 --pp-mx（MOTION.md 第 3 节）");

  h.plugin.settings.motionIntensity = "off";
  await leaf.view.refresh();
  await h.settle();
  assert.equal(listenerCount(), 0, "off 下不得挂指针跟随监听（铁律 4）");
  assert.equal(pointerAt("off"), "未写", "off 下不得跟随指针写 --pp-mx（铁律 4）");
  assert.equal(h.consoleErrors.length, 0, "不应产生错误：" + h.consoleErrors.join(" | "));
});

/* ========== 本轮新增：广义覆盖 / 按面表达 / 铁律 2 / 载体与取舍 ========== */

test("广义覆盖：off 与 prefers-reduced-motion 必须关掉**所有**动画播放者（含元素自身与自身伪元素）", async () => {
  sourceFiles().forEach(([label, css]) => {
    const players = animationPlayers(css);
    assert.ok(
      players.length >= 10,
      label + "：应能解析出动画播放者，实测只有 " + players.length + " 条（解析器或 CSS 结构变了）"
    );

    const offAttr = label === PLUGIN_LABEL ? '[data-pp-motion="off"]' : '[data-motion="off"]';
    const scopes = [
      ["off", (rule) => rule.selector.includes(offAttr)],
      ["prefers-reduced-motion", (rule) => rule.at.some((entry) => /prefers-reduced-motion/.test(entry))]
    ];

    scopes.forEach(([scopeName, scopePredicate]) => {
      const noneSelectors = scopedNoneSelectors(css, scopePredicate, label);
      assert.ok(
        noneSelectors.length,
        label + " 的 " + scopeName + " 作用域里应存在 animation: none !important（铁律 4）"
      );

      /* 半个表面不算关掉：某个载体既然写了后代规则，就必须把 `*` / `*::before` / `*::after`
         三件套写全 —— 否则挂在后代伪元素上的动画（横幅光晕、进度高光、骨架微光）会漏网。 */
      const halfCovered = [];
      (MOTION_SCOPES[label] || []).forEach((scope) => {
        const has = (kind, pseudo) => noneSelectors.some((item) =>
          item.kind === kind && item.scope === scope && (!pseudo || item.pseudo === pseudo));
        const wroteAny = has("desc") || has("desc-pseudo", "::before") || has("desc-pseudo", "::after");
        if (!wroteAny) return;
        if (!has("desc")) halfCovered.push(scopeName + "：" + scope + " 缺 `" + scope + " *`");
        ["::before", "::after"].forEach((pseudo) => {
          if (!has("desc-pseudo", pseudo)) halfCovered.push(scopeName + "：" + scope + " 缺 `" + scope + " *" + pseudo + "`");
        });
      });
      eqJson(
        halfCovered, [],
        label + " 的 " + scopeName + " 只能整套写全后代覆盖（`*` + `*::before` + `*::after`），不能只覆盖一半；" +
        "MOTION.md 铁律 4"
      );

      const uncovered = [];
      players.forEach((player) => {
        player.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
          const subject = subjectOf(selector);
          subject.scope = scopeOf(label, subject.base);
          const scope = subject.scope || hintScope(label, selector) || writtenScope(label, selector) || MOTION_SCOPES[label][0];
          if (!coveredByScopedNone(noneSelectors, subject, scope)) {
            uncovered.push(
              label + ":（约 " + player.line + "）「" + selector + "」播「" + player.value.slice(0, 40) +
              "」，在 " + scopeName + " 下没有任何 animation: none !important 能覆盖它的" +
              (subject.scope ? "元素自身/自身伪元素" : "「" + scope + "」后代/后代伪元素")
            );
          }
        });
      });
      eqJson(
        uncovered, [],
        label + " 的 " + scopeName + " 必须逐条关掉所有动画播放者（含元素自身与自身伪元素）；" +
        "MOTION.md 铁律 4 + 第 3 节"
      );
    });
  });
});

test("subtle 弹入降级：每个 ppd-pop 播放者都必须换成位移更小的 ppd-rise-sm（MOTION.md 第 3 节）", async () => {
  sourceFiles().forEach(([label, css]) => {
    const rules = parseCss(css);
    const subtleAttr = label === PLUGIN_LABEL ? '[data-pp-motion="subtle"]' : '[data-motion="subtle"]';
    const swaps = [];
    rules.forEach((rule) => {
      if (!rule.selector.includes(subtleAttr)) return;
      if (!/animation-name\s*:\s*ppd-rise-sm/.test(rule.body)) return;
      rule.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
        swaps.push(subjectOf(selector));
      });
    });
    assert.ok(swaps.length, label + " 的 subtle 作用域里应有 animation-name: ppd-rise-sm 的降级规则");

    const popPlayers = [];
    rules.forEach((rule) => {
      if (!/(?:^|;)\s*animation(-name)?\s*:[^;}]*ppd-pop/.test(rule.body)) return;
      rule.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
        popPlayers.push({ line: rule.line, selector, subject: subjectOf(selector) });
      });
    });
    assert.ok(popPlayers.length >= 3, label + "：应能解析出 ppd-pop 播放者，实测 " + popPlayers.length + " 条");

    const missed = [];
    popPlayers.forEach((player) => {
      const base = player.subject.base;
      const hit = swaps.some((swap) => {
        if (base === "*") return true; /* `> *` 形式的降级覆盖直接子元素 */
        const swapScope = scopeOf(label, swap.base);
        const swapBase = swapScope && swap.base.startsWith(swapScope + ".") ? swapScope : swap.base;
        return swapBase === base && swap.pseudo === player.subject.pseudo;
      });
      if (!hit) missed.push(label + ":（约 " + player.line + "）" + player.selector);
    });
    eqJson(
      missed, [],
      label + " 的每一个 ppd-pop 播放者都必须在 subtle 下换成 ppd-rise-sm；" +
      "MOTION.md 第 3 节：「弹入类一律换成位移更小的 ppd-rise-sm…必须逐个列出所有 ppd-pop 播放者」"
    );
  });
});

test("spotlight：subtle / off / reduced 都必须真的关掉指针光晕（含 :hover / :focus-visible）", async () => {
  const SPOTLIGHT_SUBJECTS = [".pp-stat-card", ".pp-waypoint", ".kpi", ".waypoint"];
  const STATE = /:(hover|focus-visible)/;

  sourceFiles().forEach(([label, css]) => {
    const rules = parseCss(css);
    const subtleAttr = label === PLUGIN_LABEL ? '[data-pp-motion="subtle"]' : '[data-motion="subtle"]';
    const offAttr = label === PLUGIN_LABEL ? '[data-pp-motion="off"]' : '[data-motion="off"]';

    /* 会播指针光晕的规则：状态伪类下把 opacity 抬到 1，或把 --pp-spot 设成非 none。
       一条规则里可能列了多个主体（.kpi 与 .waypoint 同块），**每个**都要单独判定，
       不能只看第一个选择器 —— 那会让"只关掉一半"漏网。 */
    const players = [];
    const seenPlayers = new Set();
    rules.forEach((rule) => {
      if (!STATE.test(rule.selector)) return;
      const opacity = declaredValue(rule.body, "opacity");
      const spot = declaredValue(rule.body, "--pp-spot");
      const kinds = [];
      if (opacity === "1") kinds.push("opacity");
      if (spot && !/^none\b/.test(spot)) kinds.push("spot");
      if (!kinds.length) return;
      rule.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
        const subject = subjectOf(selector);
        if (SPOTLIGHT_SUBJECTS.indexOf(subject.base) < 0) return;
        kinds.forEach((kind) => {
          const key = label + "|" + subject.base + subject.pseudo + "|" + kind;
          if (seenPlayers.has(key)) return;
          seenPlayers.add(key);
          players.push({ line: rule.line, selector, kind, subject });
        });
      });
    });
    assert.ok(players.length, label + "：应能解析出指针光晕的播放规则（分镜 5）");

    const scopes = [
      ["subtle", (rule) => rule.selector.includes(subtleAttr)],
      ["off", (rule) => rule.selector.includes(offAttr)],
      ["prefers-reduced-motion", (rule) => rule.at.some((entry) => /prefers-reduced-motion/.test(entry))]
    ];

    scopes.forEach(([scopeName, scopePredicate]) => {
      const scoped = rules.filter(scopePredicate);
      const failures = [];
      players.forEach((player) => {
        const neutralized = scoped.some((rule) => {
          const bodyNeutralizesElement = /--pp-spot\s*:\s*none/.test(rule.body);
          return rule.selector.split(",").map((part) => part.trim()).filter(Boolean).some((selector) => {
            const subject = subjectOf(selector);
            if (subject.base !== player.subject.base) return false;
            /* 元素自身上的 --pp-spot: none 也算关掉（插件面的做法） */
            if (bodyNeutralizesElement) return true;
            if (subject.pseudo !== player.subject.pseudo) return false;
            return /opacity\s*:\s*0(?![\d.])/.test(rule.body) || /display\s*:\s*none/.test(rule.body);
          });
        });
        if (!neutralized) {
          failures.push(label + ":（约 " + player.line + "）" + player.selector + " 的" +
            (player.kind === "opacity" ? "opacity" : "--pp-spot") + " 在 " + scopeName + " 下没有被压成 0/none");
        }
      });
      eqJson(
        failures, [],
        label + " 的 " + scopeName + " 必须真的关掉 pointer 光晕——只写 animation: none 是空操作；" +
        "MOTION.md 第 3 节（subtle 关闭 spotlight，且 reduced 与 off 等价）"
      );
    });
  });
});

test("强度归零（铁律 4）：状态伪类下的位移 transform 必须在 off 与 reduced 下归零，且两边名单对齐", async () => {
  const STATE = /:(hover|focus-visible|active|focus-within)/;

  sourceFiles().forEach(([label, css]) => {
    const rules = parseCss(css);
    const offAttr = label === PLUGIN_LABEL ? '[data-pp-motion="off"]' : '[data-motion="off"]';

    /* 播放者 = 状态伪类下会真的产生位移的 transform（translate*）。scaleY/scaleX 这类
       "强调条显现" 不是位移，也不该归零（归零会让 hover 反馈彻底消失）。 */
    const stateOf = (selector) => {
      const found = String(selector).match(/:(hover|focus-visible|focus-within|active|checked|disabled)/g);
      return found ? [...new Set(found)].sort().join("") : "";
    };
    const players = [];
    const seenPlayers = new Set();
    rules.forEach((rule) => {
      if (!STATE.test(rule.selector)) return;
      const value = declaredValue(rule.body, "transform");
      if (!value || /^none\b/.test(value) || !/translate/i.test(value)) return;
      rule.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
        if (!STATE.test(selector)) return;
        const subject = subjectOf(selector);
        const key = subject.base + subject.pseudo + stateOf(selector);
        if (seenPlayers.has(key)) return;
        seenPlayers.add(key);
        players.push({ line: rule.line, selector, subject, state: stateOf(selector), value });
      });
    });
    assert.ok(players.length, label + "：应能解析出状态伪类下的位移规则（铁律 4 要求归零）");

    /** 某个作用域里的归零名单：无状态规则（对所有状态生效）+ 带状态条目 */
    const zeroingOf = (scopePredicate) => {
      const stateless = new Set();
      const entries = [];
      const seen = new Set();
      rules.filter(scopePredicate).forEach((rule) => {
        if (!/(^|;)\s*transform\s*:\s*none/.test(rule.body)) return;
        rule.selector.split(",").map((part) => part.trim()).filter(Boolean).forEach((selector) => {
          const subject = subjectOf(selector);
          const base = subject.base + subject.pseudo;
          const state = stateOf(selector);
          if (!state) { stateless.add(base); return; }
          if (seen.has(base + state)) return;
          seen.add(base + state);
          entries.push({ key: base + state, base, state, line: rule.line, selector });
        });
      });
      return { stateless, entries };
    };

    const off = zeroingOf((rule) => rule.selector.includes(offAttr));
    const reduced = zeroingOf((rule) => rule.at.some((entry) => /prefers-reduced-motion/.test(entry)));
    const scopes = [["off", off], ["prefers-reduced-motion", reduced]];

    /* 三类问题**一次报全**（不是遇到第一个就中断）：
       ① 每个位移播放者在 off / reduced 下都要有归零着落（同一状态，或无状态规则兜住）；
       ② off 归零了的东西，reduced 不得漏（`.pp-waypoint:active` 当初就是漏在这里）；
       ③ reduced 允许比 off 多，但多出来的必须是空操作 —— 一旦那条选择器长出位移，
          它就是「reduced 有安全网、off 没有」的真实载体，这里会连实际 transform 一起报出来。 */
    const problems = [];

    scopes.forEach(([scopeName, zeroed]) => {
      players.forEach((player) => {
        const key = player.subject.base + player.subject.pseudo;
        if (zeroed.stateless.has(key) || zeroed.entries.some((entry) => entry.key === key + player.state)) return;
        problems.push(
          label + " 的 " + scopeName + " 没有归零这个位移：`" + player.selector + "`（" + player.value +
          "，声明在约 " + player.line + " 行）—— MOTION.md 铁律 4 要求同状态归零"
        );
      });
    });

    off.entries
      .filter((entry) => !reduced.stateless.has(entry.base) && !reduced.entries.some((item) => item.key === entry.key))
      .forEach((entry) => problems.push(
        label + ":（约 " + entry.line + "）off 归零了 `" + entry.selector + "`，但 prefers-reduced-motion 没有对应条目" +
        "（MOTION.md 第 3 节：两个作用域必须对同一批载体生效）"
      ));

    const playerByKey = new Map(players.map((player) => [player.subject.base + player.subject.pseudo + player.state, player]));
    reduced.entries
      .filter((entry) => !off.stateless.has(entry.base) && !off.entries.some((item) => item.key === entry.key))
      .forEach((entry) => {
        const player = playerByKey.get(entry.key);
        if (!player) return; /* 空操作：reduced 的安全网，允许保留 */
        problems.push(
          label + ":（约 " + entry.line + "）reduced 多出的 `" + entry.selector + "` **现在是真实位移载体**（" +
          player.value + "，声明在约 " + player.line + " 行），但 off 档没有归零它 —— " +
          "reduced 可以比 off 多，但多出来的只能是空操作；既然它有位移，两边都要归零（或两边都去掉）"
        );
      });

    eqJson(
      problems, [],
      label + " 的强度归零 / off×reduced 名单对齐有问题（逐条见数组）"
    );
  });
});

test("ppd-pulse 起点色按面表达：插件 currentColor、Web 真令牌 --pp-pulse-ring（MOTION.md 第 2 节表下）", async () => {
  const pluginFrom = collectKeyframes(readText(PLUGIN_CSS_PATH)).get("ppd-pulse").steps.get("0%").get("box-shadow");
  assert.ok(
    /currentcolor/i.test(pluginFrom),
    "插件面必须用 currentColor（三个播放者的文字色就是语义色），实测「" + pluginFrom + "」"
  );

  const webCss = readText(WEB_CSS_PATH);
  const webFrom = collectKeyframes(webCss).get("ppd-pulse").steps.get("0%").get("box-shadow");
  assert.ok(
    webFrom.includes("var(--pp-pulse-ring"),
    "Web 面必须消费真令牌 --pp-pulse-ring，实测「" + webFrom + "」"
  );
  assert.ok(
    !/currentcolor/i.test(webFrom),
    "Web 面不得用 currentColor：.blocked-badge / .task-line-dot 的文字色是白/近白，呼吸环会变白（MOTION.md 第 2 节表下）"
  );

  /* 令牌必须在深/浅两个令牌块里各自定义，且是那一块 --pp-rose 的 34% */
  const themed = parseCss(webCss).filter((rule) =>
    declaredValue(rule.body, "--pp-rose") && declaredValue(rule.body, "--pp-pulse-ring"));
  assert.equal(
    themed.length, 2,
    "Web 的 --pp-pulse-ring 应在深/浅两个主题令牌块里各定义一次，实测 " + themed.length + " 处"
  );
  const toRgb = (hex) => {
    const value = String(hex).trim().replace("#", "");
    const full = value.length === 3 ? value.split("").map((ch) => ch + ch).join("") : value;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  };
  themed.forEach((rule) => {
    const rose = toRgb(declaredValue(rule.body, "--pp-rose"));
    const ring = declaredValue(rule.body, "--pp-pulse-ring");
    const rgba = ring.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|1)\)/);
    const mix = /color-mix\([^)]*var\(--pp-rose\)\s+34%/.test(ring);
    assert.ok(
      (rgba && Number(rgba[1]) === rose[0] && Number(rgba[2]) === rose[1] && Number(rgba[3]) === rose[2] && Number(rgba[4]) === 0.34) || mix,
      "（约 " + rule.line + "）的 --pp-pulse-ring 实测「" + ring + "」，期望是同一令牌块 --pp-rose（rgb " +
      rose.join(",") + "）的 34%（MOTION.md 第 2 节表下）"
    );
  });
});

test("铁律 2：transition 只能动允许的属性（无例外）", async () => {
  const ALLOWED = new Set([
    "background", "color", "border-color", "box-shadow", "transform",
    "opacity", "filter", "background-position", "border", "outline-color", "fill", "stroke"
  ]);
  const KEYWORDS = new Set([
    "none", "all", "ease", "ease-in", "ease-out", "ease-in-out", "linear",
    "step-start", "step-end", "initial", "inherit", "unset", "revert"
  ]);

  sourceFiles().forEach(([label, css]) => {
    const violations = [];
    parseCss(css).forEach((rule) => {
      ["transition", "transition-property"].forEach((property) => {
        const value = declaredValue(rule.body, property);
        if (!value) return;
        splitTopLevel(value).forEach((part) => {
          const token = part.split(/\s+/)[0];
          if (!token || /^[\d.]/.test(token) || KEYWORDS.has(token)) return;
          if (/^(cubic-bezier|steps|var|calc)\(/.test(token)) return;
          if (ALLOWED.has(token)) return;
          violations.push(
            label + ":（约 " + rule.line + "）「" + rule.selector.replace(/\s+/g, " ").slice(0, 60) +
            "」的 " + property + " 动了 " + token + "（MOTION.md 铁律 2 只允许 transform/opacity/filter/background-position/box-shadow；" +
            "历史遗留不算豁免，`.pp-progress-fill` 的 transition: width 已经删掉）"
          );
        });
      });
    });
    eqJson(
      violations, [],
      label + " 出现了 transition 属性违规（本用例没有任何例外登记）"
    );
  });
});

test("弹窗载体：.pp-modal 与 data-pp-motion 同体，取值跟随设置（MOTION.md 第 3 节表格）", async () => {
  const h = await setup({ data: { motionIntensity: "off" } });
  const leaf = await h.openView(VIEW.dashboard);
  await h.settle();

  const first = await openModal(h, () => h.plugin.newProject());
  assert.ok(
    first.contentEl.classList.contains("pp-modal"),
    "弹窗内容元素应带 .pp-modal（这是 CSS 里 .pp-modal[...] 规则的作用对象）"
  );
  assert.equal(
    first.contentEl.getAttr("data-pp-motion"), "off",
    ".pp-modal 的 data-pp-motion 实测「" + first.contentEl.getAttr("data-pp-motion") + "」，期望 off（MOTION.md 第 3 节表格）"
  );

  first.close();
  h.plugin.settings.motionIntensity = "full";
  await leaf.view.refresh();
  await h.settle();
  const second = await openModal(h, () => h.plugin.newTask());
  assert.equal(
    second.contentEl.getAttr("data-pp-motion"), "full",
    "改成 full 后新弹窗的 data-pp-motion 实测「" + second.contentEl.getAttr("data-pp-motion") + "」，期望 full"
  );
  assert.equal(h.consoleErrors.length, 0, "打开弹窗不应产生错误：" + h.consoleErrors.join(" | "));
});

test("已知取舍：进度生长与节点下划线必须保持「每轮重播」，不得收进 mo-enter（MOTION.md 第 2 节表下）", async () => {
  const motionDoc = readText(path.join(PLUGIN_DIR, "MOTION.md"));
  assert.ok(motionDoc.includes("已知取舍"), "契约里应有「已知取舍」表（第 2 节表下）");

  sourceFiles().forEach(([label, css]) => {
    const growth = parseCss(css).filter((rule) => /animation\s*:[^;}]*ppd-grow-x/.test(rule.body));
    assert.ok(growth.length, label + " 应有 ppd-grow-x 的播放者（进度生长 / 节点下划线）");
    const gated = growth
      .filter((rule) => /mo-enter/.test(rule.selector))
      .map((rule) => label + ":（约 " + rule.line + "）" + rule.selector.replace(/\s+/g, " "));
    eqJson(
      gated, [],
      "ppd-grow-x 被收进 mo-enter 会丢掉已知取舍表里的「每轮刷新重播」语义（进度是数据本身）"
    );
  });
});

/*
 * 本套件覆盖不到、需要人/浏览器确认的部分（写在这里免得下次误以为已经守住）：
 *   1. Web 侧的指针跟随端到端：app.js 把 pointermove 委托在 #view 上，随后又用 innerHTML 重建
 *      #view 的内容。真实 DOM 里 innerHTML 只移除后代监听、不影响元素自身，但测试桩的
 *      FakeElement.innerHTML setter 会连元素自己的监听一起清掉，于是桩里这条路径永远不触发。
 *      这是**桩与真实 DOM 的偏差**，不是实现缺陷；原生侧的同一条语义已由上面的用例守住。
 *   2. 视觉效果本身（补间是否顺滑、交错是否好看、halo 漂移是否可见）：需要真实浏览器与时间轴，
 *      Node 侧只能验证「声明、类名、终值、能力门控」这些可判定的部分。
 *   3. off/reduced 的覆盖判定是**结构近似**（subjectOf + 作用域归属：最右复合选择器 / 选择器链里
 *      显式写的载体 / SCOPE_HINTS / 该面默认载体），不做级联模拟：同优先级同选择器的胜负、
 *      `!important` 与特指度的相互作用仍需浏览器确认。后代播放者的作用域用启发式归属，
 *      若某类元素既不在选择器链里写出载体、也不在 SCOPE_HINTS 里，归属可能落错作用域。
 *   4. 铁律 5（不做退场动画）与铁律 6（状态不能只靠动效表达）属人工/视觉审查。
 *   5. 例外登记：**没有**。历史上两条都已经修掉并升级成硬断言 ——
 *      · `.pp-waypoint:active`（reduced 归零名单漏项）→ "强度归零…且两边名单对齐"用例；
 *      · styles.css:46 `.pp-progress-fill { transition: width 180ms }`（铁律 2 基线遗留）
 *        → "铁律 2：transition 白名单"用例，现在无例外、任何违规直接红。
 *   6. Web 面 reduced 的归零名单比 off 多两条（`.primary-btn:hover` / `.primary-btn:focus-visible`，
 *      web/styles.css:1976；这两处在 hover 态没有 transform：155/1496/2856 只改
 *      background/filter/box-shadow）—— 按 Lead 的定调**保留**，因为它们是未来加位移时的安全网。
 *      用例的规则是：off 的每一条都必须在 reduced 里有着落（`.pp-waypoint:active` 那类漏网直接红灯），
 *      且 reduced 多出来的条目必须是空操作；一旦多出的条目变成真实位移载体，
 *      报错条目会带上实际 transform 与声明行号，要求同时补进 off 档。
 */

module.exports = { title: "11 动效契约", tests };
