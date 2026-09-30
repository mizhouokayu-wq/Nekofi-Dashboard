/*
 * 个人规划仪表盘 — Obsidian 插件运行时（由 TypeScript 源码构建，请勿直接编辑）
 *
 * 源码：src/*.ts（渲染层另有 web/app.js + web/styles.css，构建时注入文件末尾的生成区块）
 * 构建：node tools/build.mjs        （产物就是本文件）
 * 校验：node tools/build.mjs --check
 *
 * 数据边界：Markdown + YAML frontmatter 是唯一事实来源。视图只读取、展示、跳转，
 * 写操作全部由用户显式触发；路径中包含「AI禁止阅读」的文件或目录永不读取。
 */
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/plugin.ts
var obsidian9 = __toESM(require("obsidian"));

// src/core/dates.ts
var DATE_CACHE = /* @__PURE__ */ new Map();
var DATE_CACHE_LIMIT = 2e3;
function dateOf(value) {
  var _a;
  const like = value;
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "object" && value !== null && typeof like.format === "function") {
    const formatted = like.format("YYYY-MM-DD");
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
  }
  if (typeof value === "string") {
    const key = value.trim();
    if (DATE_CACHE.has(key)) return (_a = DATE_CACHE.get(key)) != null ? _a : null;
    const computed = parseDateString(key);
    if (DATE_CACHE.size >= DATE_CACHE_LIMIT) DATE_CACHE.clear();
    DATE_CACHE.set(key, computed);
    return computed;
  }
  return parseDateValue(value, like);
}
function parseDateString(raw) {
  if (!raw) return null;
  const match = raw.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (!match) return null;
  return isoOf(Number(match[1]), Number(match[2]), Number(match[3]));
}
function parseDateValue(value, like) {
  const pad = (part) => String(part).padStart(2, "0");
  if (Object.prototype.toString.call(value) === "[object Date]" || typeof like.getTime === "function" || typeof value === "number") {
    if (typeof value === "number" && Number.isInteger(value) && value >= 19000101 && value <= 99991231) {
      const digits = String(value);
      return isoOf(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    }
    const date = typeof value === "number" ? new Date(value) : new Date(like.getTime ? like.getTime.call(value) : value);
    if (!Number.isNaN(date.getTime()))
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }
  return parseDateString(String(value).trim());
}
function isoOf(year, month, day) {
  const pad = (part) => String(part).padStart(2, "0");
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return year + "-" + pad(month) + "-" + pad(day);
}
function daysUntil(value) {
  const date = dateOf(value);
  if (!date) return null;
  return Math.round(((/* @__PURE__ */ new Date(date + "T00:00:00")).getTime() - (/* @__PURE__ */ new Date(today() + "T00:00:00")).getTime()) / 864e5);
}
function addDays(date, amount) {
  const value = /* @__PURE__ */ new Date(date + "T00:00:00");
  value.setDate(value.getDate() + amount);
  const pad = (part) => String(part).padStart(2, "0");
  return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate());
}
function isoWeekday(date) {
  const value = dateOf(date);
  if (!value) return 0;
  return ((/* @__PURE__ */ new Date(value + "T00:00:00")).getDay() + 6) % 7 + 1;
}
function normalizeWeekdays(value) {
  const raw = Array.isArray(value) ? value : String(value === void 0 || value === null ? "" : value).split(/[,，、\s]+/);
  const out = [];
  raw.forEach((item) => {
    const day = Math.round(Number(String(item).trim()));
    if (Number.isFinite(day) && day >= 1 && day <= 7 && out.indexOf(day) < 0) out.push(day);
  });
  return out.sort((a, b) => a - b);
}
function normalizeMonthDay(value) {
  const day = Math.round(Number(String(value === void 0 || value === null ? "" : value).trim()));
  if (!Number.isFinite(day) || day < 1 || day > 31) return 0;
  return day;
}
function weekdayLabel(day) {
  const index = Math.round(Number(day));
  return ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"][index] || "";
}
function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
function pad2(part) {
  return String(part).padStart(2, "0");
}
function formatDate(value) {
  return value.getFullYear() + "-" + pad2(value.getMonth() + 1) + "-" + pad2(value.getDate());
}
function monthDayIn(year, monthIndex, monthday) {
  const day = normalizeMonthDay(monthday);
  if (!day) return null;
  return formatDate(new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex))));
}
function nextRecurringDate(date, recurrence, options = {}) {
  const value = dateOf(date);
  const mode = String(recurrence || "none").toLowerCase();
  if (!value || mode === "none" || mode === "") return null;
  if (mode === "daily") return addDays(value, 1);
  if (mode === "weekly") {
    const weekdays = normalizeWeekdays(options.weekdays);
    if (!weekdays.length) return addDays(value, 7);
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = addDays(value, offset);
      if (weekdays.indexOf(isoWeekday(candidate)) >= 0) return candidate;
    }
    return addDays(value, 7);
  }
  if (mode === "monthly") {
    const current = /* @__PURE__ */ new Date(value + "T00:00:00");
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    const explicit = normalizeMonthDay(options.monthday);
    if (explicit) return monthDayIn(next.getFullYear(), next.getMonth(), explicit);
    const last = daysInMonth(next.getFullYear(), next.getMonth());
    return formatDate(new Date(next.getFullYear(), next.getMonth(), Math.min(current.getDate(), last)));
  }
  return null;
}
function firstOccurrenceOnOrAfter(recurrence, options, from) {
  const mode = String(recurrence || "none").toLowerCase();
  const start = dateOf(from);
  if (!start || mode === "none" || mode === "") return null;
  if (mode === "daily") return start;
  if (mode === "weekly") {
    const weekdays = normalizeWeekdays(options.weekdays);
    if (!weekdays.length) return start;
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = addDays(start, offset);
      if (weekdays.indexOf(isoWeekday(candidate)) >= 0) return candidate;
    }
    return start;
  }
  if (mode === "monthly") {
    const explicit = normalizeMonthDay(options.monthday);
    if (!explicit) return start;
    const current = /* @__PURE__ */ new Date(start + "T00:00:00");
    for (let step = 0; step <= 1; step += 1) {
      const month = new Date(current.getFullYear(), current.getMonth() + step, 1);
      const candidate = monthDayIn(month.getFullYear(), month.getMonth(), explicit);
      if (candidate && candidate >= start) return candidate;
    }
    return null;
  }
  return null;
}
function recurrenceUntilOf(frontmatter) {
  return dateOf(frontmatter && (frontmatter.recurrence_until || frontmatter.recurrenceUntil)) || "";
}
function recurrenceAnchorOf(frontmatter, fallback) {
  return dateOf(frontmatter && (frontmatter.due || frontmatter.deadline)) || dateOf(fallback) || today();
}
function recurrenceWeekdaysOf(frontmatter) {
  var _a;
  return normalizeWeekdays(frontmatter && ((_a = frontmatter.recurrence_weekdays) != null ? _a : frontmatter.recurrenceWeekdays));
}
function recurrenceMonthDayOf(frontmatter) {
  var _a;
  return normalizeMonthDay(frontmatter && ((_a = frontmatter.recurrence_monthday) != null ? _a : frontmatter.recurrenceMonthday));
}
function today() {
  if (window.moment) return window.moment().format("YYYY-MM-DD");
  const now = /* @__PURE__ */ new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}

// src/core/paths.ts
function cleanName(value) {
  return String(value || "未命名").trim().replace(/[\\/:*?"<>|#^]/g, "-") || "未命名";
}
function directChild(fileOrPath, folder) {
  const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath.path;
  if (!inFolder(path, folder)) return false;
  return path.slice(folder.length + 1).split("/").length === 1;
}
function folderPathOf(file) {
  return file.parent && file.parent.path ? file.parent.path : file.path.split("/").slice(0, -1).join("/");
}
function forbiddenPath(path) {
  return path.split("/").some((part) => part.includes("AI禁止阅读") || part.startsWith("（AI禁止阅读"));
}
function inFolder(fileOrPath, folder) {
  const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath.path;
  return path === folder || path.startsWith(folder + "/");
}
function nameOf(path) {
  return (path.split("/").pop() || "").replace(/\.md$/i, "");
}
function normalizeList(value) {
  if (Array.isArray(value))
    return value.flatMap(
      (item) => typeof item === "object" && item ? [item.title || item.name || item.label || ""] : [String(item)]
    ).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}
function projectMatches(task, project) {
  const taskFm = task.frontmatter || {};
  const projectFm = project.frontmatter || {};
  const title = typeof projectFm.title === "string" ? projectFm.title : "";
  const values = refs(taskFm.project);
  const names = [
    project.file.path,
    nameOf(project.file.path),
    title,
    project.folderPath ? nameOf(project.folderPath) : ""
  ];
  return values.some(
    (ref) => names.some((name) => name && (ref === name || ref.endsWith("/" + name) || nameOf(ref) === nameOf(name)))
  );
}
function refs(value) {
  return normalizeList(value).map((item) => item.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim()).filter(Boolean);
}
function pickProject(taskPath, frontmatter, projects) {
  const values = refs(frontmatter && frontmatter.project);
  if (!values.length) return null;
  const taskFolder = String(taskPath || "").split("/").slice(0, -1).join("/");
  let best = null;
  let bestRank = Number.POSITIVE_INFINITY;
  let bestFolderHit = false;
  let bestPath = "";
  (projects || []).forEach((project) => {
    const path = String(project && project.file && project.file.path || project && project.path || "");
    if (!path) return;
    const projectFm = project && project.frontmatter || {};
    const title = typeof projectFm.title === "string" ? projectFm.title : "";
    const base = nameOf(path);
    const folder = project.folderPath ? nameOf(project.folderPath) : "";
    let rank = Number.POSITIVE_INFINITY;
    values.forEach((ref) => {
      if (ref === path) rank = Math.min(rank, 0);
      else if (ref.endsWith("/" + path) || base && ref.endsWith("/" + base)) rank = Math.min(rank, 1);
      else if (ref === base || ref === title || ref === folder || nameOf(ref) === base) rank = Math.min(rank, 2);
    });
    if (rank === Number.POSITIVE_INFINITY) return;
    const folderHit = Boolean(taskFolder && project.folderPath && taskFolder === project.folderPath);
    const better = rank < bestRank || rank === bestRank && folderHit && !bestFolderHit || rank === bestRank && folderHit === bestFolderHit && path < bestPath;
    if (better) {
      best = project;
      bestRank = rank;
      bestFolderHit = folderHit;
      bestPath = path;
    }
  });
  return best;
}
function stripProjectPrefix(filename, projectName) {
  const prefix = "[" + projectName + "]";
  return filename.startsWith(prefix) ? filename.slice(prefix.length).trim() : filename;
}

// src/core/dom.ts
function el(parent, tag, value, cls) {
  const node = parent.createEl(tag, { cls });
  if (value !== void 0) node.setText(String(value));
  return node;
}
function expectedError(message) {
  const error = new Error(message);
  error.expected = true;
  return error;
}

// src/core/frontmatter.ts
function frontmatterSpan(content) {
  var _a, _b;
  const text3 = String(content === null || content === void 0 ? "" : content);
  const head = text3.match(/^((?:\uFEFF)?(?:[ \t]*\r?\n)*[ \t]*)---[ \t]*(\r?\n|$)/);
  if (!head) return null;
  const fmStart = head[0].length;
  const rest = text3.slice(fmStart);
  const close = rest.match(/(?:^|\r?\n)[ \t]*---[ \t]*(?=\r?\n|$)/);
  if (!close) return { state: "unterminated", prefix: head[1], eol: head[2] || "\n" };
  const closeEol = close[0].startsWith("\r\n") ? "\r\n" : close[0].startsWith("\n") ? "\n" : null;
  return {
    state: "ok",
    prefix: head[1],
    eol: head[2] || "\n",
    closeEol,
    fmText: rest.slice(0, (_a = close.index) != null ? _a : 0),
    afterClose: fmStart + ((_b = close.index) != null ? _b : 0) + close[0].length
  };
}
function makeMD(fm, body) {
  const lines = ["---"];
  Object.keys(fm).forEach((key) => {
    if (fm[key] !== void 0 && fm[key] !== null) lines.push(key + ": " + yamlValue(fm[key]));
  });
  lines.push(
    "---",
    "",
    (body || "").replace(/^\r?\n+/, "").trimEnd(),
    ""
  );
  return lines.join("\n");
}
function parseFM(content) {
  const text3 = String(content === null || content === void 0 ? "" : content);
  const span = frontmatterSpan(text3);
  if (!span || span.state !== "ok") return { data: {}, body: text3 };
  const data = {};
  const lines = span.fmText === "" ? [] : span.fmText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([^:#][^:]*):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const raw = match[2].trim();
    if (raw === "") {
      const items = [];
      let cursor = index + 1;
      while (cursor < lines.length && /^\s+-\s*/.test(lines[cursor])) {
        items.push(parseFMValue(lines[cursor].replace(/^\s+-\s*/, "")));
        cursor += 1;
      }
      data[key] = items.length ? items : "";
      index = cursor - 1;
      continue;
    }
    data[key] = parseFMValue(raw);
  }
  return { data, body: text3.slice(span.afterClose).replace(/^\r?\n/, "") };
}
function parseFMValue(raw) {
  const value = String(raw).trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch (error) {
    return value.replace(/^['"]|['"]$/g, "");
  }
}
function pickEol(text3, fallback) {
  const crlf = (String(text3).match(/\r\n/g) || []).length;
  const lf = (String(text3).match(/\n/g) || []).length - crlf;
  if (crlf > lf) return "\r\n";
  if (lf > 0) return "\n";
  return fallback;
}
function text(value, fallback) {
  if (Array.isArray(value)) return value.join("、") || String(fallback || "—");
  return value === void 0 || value === null || value === "" ? String(fallback || "—") : String(value);
}
function writeFM(content, patch, removeKeys = []) {
  const text3 = String(content === null || content === void 0 ? "" : content);
  const span = frontmatterSpan(text3);
  if (!span || span.state !== "ok") {
    if (span) throw expectedError("这篇笔记的 frontmatter 缺少闭合的 ---，已取消写入以免破坏内容。");
    const parsed = parseFM(text3);
    return makeMD(Object.assign({}, parsed.data, patch), parsed.body);
  }
  const lines = span.fmText === "" ? [] : span.fmText.split(/\r?\n/);
  (removeKeys || []).forEach((key) => {
    const keyPattern = new RegExp("^" + key + "\\s*:");
    const index = lines.findIndex((line) => keyPattern.test(line));
    if (index < 0) return;
    let endIndex = index + 1;
    while (endIndex < lines.length && (/^\s/.test(lines[endIndex]) || lines[endIndex] === "")) endIndex++;
    lines.splice(index, endIndex - index);
  });
  Object.keys(patch).forEach((key) => {
    const keyPattern = new RegExp("^" + key + "\\s*:");
    const index = lines.findIndex((line) => keyPattern.test(line));
    const serialized = key + ": " + yamlValue(patch[key]);
    if (index < 0) {
      lines.push(serialized);
      return;
    }
    let endIndex = index + 1;
    while (endIndex < lines.length && (/^\s/.test(lines[endIndex]) || lines[endIndex] === "")) endIndex++;
    lines.splice(index, endIndex - index, serialized);
  });
  const bodyEol = pickEol(span.fmText, span.eol);
  const closing = span.closeEol || bodyEol;
  const block = lines.length === 0 ? span.prefix + "---" + span.eol + "---" : span.prefix + "---" + span.eol + lines.join(bodyEol) + closing + "---";
  return block + text3.slice(span.afterClose);
}
function yamlScalar(text3) {
  const raw = String(text3);
  if (raw === "") return '""';
  if (/^\s|\s$/.test(raw)) return JSON.stringify(raw);
  if (/[\n\r\t]/.test(raw)) return JSON.stringify(raw);
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(raw)) return JSON.stringify(raw);
  if (/[:#]\s|[:#]$/.test(raw)) return JSON.stringify(raw);
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(raw)) return JSON.stringify(raw);
  if (/^[-+]?(\d+(\.\d+)?|\.\d+)(e[-+]?\d+)?$/i.test(raw)) return JSON.stringify(raw);
  if (/^\d{4}-\d{1,2}-\d{1,2}([T ].*)?$/.test(raw)) return JSON.stringify(raw);
  return raw;
}
function yamlValue(value) {
  if (value === null || value === void 0) return "";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return yamlScalar(String(value));
}

// src/core/assets.ts
function toneFromLuminance(luminance) {
  const value = Number(luminance);
  return Number.isFinite(value) && value > 0.62 ? "light" : "dark";
}
function resolveAssetPath(input, paths) {
  const normalized = String(input || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  const candidates = (paths || []).map(
    (path) => String(path || "").replace(/\\/g, "/").replace(/^\/+/, "")
  );
  const exact = candidates.find((path) => path === normalized);
  if (exact) return exact;
  const lower = normalized.toLowerCase();
  return candidates.find(
    (path) => path.toLowerCase() === lower || path.replace(/\.[^/.]+$/, "").toLowerCase() === lower
  ) || "";
}
function isImageAssetPath(path, folder) {
  const normalized = String(path || "").replace(/\\/g, "/");
  return !forbiddenPath(normalized) && inFolder(normalized, folder) && /\.(png|jpe?g|gif|webp)$/i.test(normalized);
}
function listImageAssetPaths(paths, folder) {
  return (paths || []).map((path) => String(path || "").replace(/\\/g, "/")).filter((path) => isImageAssetPath(path, folder));
}
function collectImageAssetFiles(vault, folder) {
  const result = [];
  const root = vault && vault.getAbstractFileByPath ? vault.getAbstractFileByPath(folder) : null;
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
      return;
    }
    if (node.path && isImageAssetPath(node.path, folder)) result.push(node);
  };
  visit(root);
  if (!result.length && vault && vault.getFiles) {
    const files = vault.getFiles().filter(Boolean);
    const allowed = new Set(
      listImageAssetPaths(
        files.map((file) => file.path),
        folder
      )
    );
    files.forEach((file) => {
      if (allowed.has(file.path)) result.push(file);
    });
  }
  const seen = /* @__PURE__ */ new Set();
  return result.filter((file) => !seen.has(file.path) && seen.add(file.path));
}
function computeCropStage(naturalWidth, naturalHeight, maxWidth, maxHeight) {
  const ratio = Math.max(0.01, Number(naturalWidth) || 1) / Math.max(0.01, Number(naturalHeight) || 1);
  const width = Math.max(1, Math.min(Number(maxWidth) || 480, (Number(maxHeight) || 400) * ratio));
  return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(width / ratio)) };
}
function applyHeroCrop(node, crop) {
  if (!node || !node.style) return false;
  const width = Number(crop && crop.w);
  const height = Number(crop && crop.h);
  if (!(width > 0 && width <= 1 && height > 0 && height <= 1)) {
    if (node.dataset) delete node.dataset.crop;
    node.style.backgroundPosition = "";
    node.style.backgroundSize = "";
    node.style.objectPosition = "";
    return false;
  }
  const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const w = clamp(width);
  const h = clamp(height);
  const posX = w >= 1 ? 50 : clamp(Number(crop.x) || 0) / (1 - w) * 100;
  const posY = h >= 1 ? 50 : clamp(Number(crop.y) || 0) / (1 - h) * 100;
  const position = posX.toFixed(2) + "% " + posY.toFixed(2) + "%";
  node.style.backgroundSize = (100 / w).toFixed(4) + "% auto";
  node.style.backgroundPosition = position;
  node.style.objectPosition = position;
  if (node.dataset) node.dataset.crop = "true";
  return true;
}
async function writeBannerBinary(vault, path, buffer) {
  const existing = vault.getAbstractFileByPath(path);
  if (existing && typeof vault.modifyBinary === "function") {
    await vault.modifyBinary(existing, buffer);
  } else if (typeof vault.createBinary === "function" && !existing) {
    await vault.createBinary(path, buffer);
  } else if (vault.adapter && typeof vault.adapter.writeBinary === "function") {
    await vault.adapter.writeBinary(path, buffer);
  } else throw new Error("当前 Obsidian 没有可用的二进制写入 API");
  const saved = vault.getAbstractFileByPath(path);
  if (!saved && !(vault.adapter && typeof vault.adapter.exists === "function" && await vault.adapter.exists(path)))
    throw new Error("裁剪文件写入后无法验证");
  return path;
}
function loadBannerImage(src, imageFactory = () => document.createElement("img")) {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

// src/core/constants.ts
var DASHBOARD_VIEW = "personal-planning-dashboard";
var PROJECT_VIEW = "personal-planning-project";
var INBOX_VIEW = "personal-planning-inbox";
var TASKS_VIEW = "personal-planning-tasks";
var RESOURCES_VIEW = "personal-planning-resources";
var APP_VIEW = "personal-planning-dashboard-app";
var HERO_CROP_RATIO = 16 / 5;
var PLUGIN_BUILD = "0.1.0-preview (51)";
var TONE_INK = { light: "#1b1420", dark: "#fdf7f4" };
function resolveAssetImages(vault, settings) {
  const config = settings || {};
  const explicitWaypoints = config.waypointImages || {};
  const explicitHero = String(config.heroImage || "");
  const available = collectImageAssetFiles(vault, config.assetFolder || "").map((file) => file.path).sort();
  const hero = explicitHero || available[0] || "";
  const unused = available.filter((path) => path !== hero);
  return {
    hero,
    build: explicitWaypoints.build || unused[0] || "",
    learn: explicitWaypoints.learn || unused[1] || "",
    grow: explicitWaypoints.grow || unused[2] || ""
  };
}
var DEFAULTS = {
  projectFolder: "20 项目库",
  taskFolder: "50 日程待办",
  inboxFolder: "00 草稿箱",
  archiveFolder: "90 归档库",
  knowledgeFolder: "30 知识库",
  bookFolder: "30 知识库/图书库",
  areaFolder: "10 长期领域",
  peopleFolder: "40 人物库",
  defaultTaskDuration: 30,
  planningHorizonDays: 7,
  dailyCapacityMinutes: 120,
  remindersEnabled: true,
  reminderHour: 9,
  lastReminderDate: "",
  heroImage: "",
  heroCrop: null,
  waypointImages: { build: "", learn: "", grow: "" },
  assetFolder: "图片素材",
  motionIntensity: "full"
};
var STATUS = {
  planning: "规划中",
  active: "进行中",
  blocked: "阻塞",
  paused: "暂停",
  completed: "已完成",
  archived: "已归档",
  todo: "待办",
  doing: "执行中",
  expired: "过期",
  done: "完成"
};
var KNOWN_STATUS_VALUES = Object.keys(STATUS);
var NON_TASK_TYPES = [
  "project",
  "knowledge",
  "book",
  "video",
  "area",
  "person",
  "index",
  "task-index",
  "moc",
  "dashboard",
  "note",
  "daily",
  "journal",
  "template"
];
var ARCHIVED_OVERWRITTEN_KEYS = ["status", "completed", "archived", "updated"];
var FOLDER_SETTING_KEYS = [
  "projectFolder",
  "taskFolder",
  "inboxFolder",
  "archiveFolder",
  "knowledgeFolder",
  "bookFolder",
  "areaFolder",
  "peopleFolder",
  "assetFolder"
];
var DISTINCT_FOLDER_KEYS = ["inboxFolder", "taskFolder", "projectFolder", "archiveFolder"];
var WEEKDAY_OPTIONS = [
  [1, "周一"],
  [2, "周二"],
  [3, "周三"],
  [4, "周四"],
  [5, "周五"],
  [6, "周六"],
  [7, "周日"]
];
var RECURRENCE_OPTIONS = [
  ["none", "不重复"],
  ["daily", "每天"],
  ["weekly", "每周"],
  ["monthly", "每月"]
];
var MONTHDAY_OPTIONS = Array.from({ length: 31 }, (_, index) => [
  index + 1,
  String(index + 1) + " 号"
]);
var MONTHDAY_SELECT = MONTHDAY_OPTIONS.reduce(
  (accumulator, [value, label]) => {
    accumulator[String(value)] = label;
    return accumulator;
  },
  {}
);
function recurrenceShowWhen(values) {
  return { key: "recurrence", in: values };
}
function fieldVisible(spec, frontmatter) {
  const rule = spec && spec.showWhen;
  if (!rule) return true;
  const current = String(frontmatter && frontmatter[rule.key] || "none").toLowerCase();
  return (rule.in || []).map((value) => String(value).toLowerCase()).indexOf(current) >= 0;
}
function coerceFieldValue(spec, rawText) {
  const text3 = String(rawText === void 0 || rawText === null ? "" : rawText).trim();
  const key = spec && spec.key;
  if (key === "recurrence_weekdays") return normalizeWeekdays(text3);
  if (key === "recurrence_monthday") return normalizeMonthDay(text3);
  if (spec && spec.type === "number") return Number(text3) || 0;
  return text3;
}
var EDITABLE_FIELDS = {
  task: [
    { key: "milestone", label: "关键节点", type: "text" },
    /* 详情抽屉里 DDL 始终可见：重复任务的 DDL 是"本次执行日期"，序列结束日另看「重复结束（DDL）」。
       原生表单只在非重复时显示 DDL —— 那里填的 DDL 就是整段序列的结束日（见 plugin.ts 的 taskEditorFields）。 */
    { key: "due", label: "DDL", type: "date" },
    { key: "duration", label: "预计耗时（分钟）", type: "number" },
    {
      key: "priority",
      label: "优先级",
      type: "select",
      options: [
        ["high", "高"],
        ["medium", "中"],
        ["low", "低"]
      ]
    },
    { key: "assignee", label: "执行者", type: "text" },
    { key: "recurrence", label: "重复周期", type: "select", options: RECURRENCE_OPTIONS },
    /* 参考谷歌日历：每周要指定周几（可多选），每月要指定几号 */
    {
      key: "recurrence_weekdays",
      label: "重复周几",
      type: "multiselect",
      options: WEEKDAY_OPTIONS,
      showWhen: recurrenceShowWhen(["weekly"])
    },
    {
      key: "recurrence_monthday",
      label: "每月几号",
      type: "select",
      options: MONTHDAY_OPTIONS,
      showWhen: recurrenceShowWhen(["monthly"])
    },
    {
      key: "recurrence_until",
      label: "重复结束（DDL）",
      type: "date",
      desc: "重复到这一天为止；留空 = 永不结束",
      showWhen: recurrenceShowWhen(["daily", "weekly", "monthly"])
    },
    { key: "task_set", label: "任务集", type: "text" },
    { key: "task_group", label: "任务组", type: "text" },
    { key: "project", label: "所属项目", type: "text" },
    /* 只在任务被标成阻塞时由渲染层显示；但写入白名单在这里，所以要在这里登记 */
    { key: "blocking_reason", label: "阻塞原因", type: "textarea" }
  ],
  project: [
    { key: "area", label: "长期领域", type: "text" },
    { key: "weight", label: "权重", type: "number" },
    { key: "deadline", label: "DDL", type: "date" },
    { key: "constraints", label: "资源约束", type: "text" },
    { key: "outcome", label: "最终结果（终点画像）", type: "textarea" },
    { key: "acceptance", label: "验收标准", type: "textarea" }
  ]
};

// src/core/settings.ts
var obsidian = __toESM(require("obsidian"));
function clampInt(value, min, max, fallback) {
  const parsed = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
function normalizeFolderSetting(value, fallback) {
  const raw = String(value === void 0 || value === null ? "" : value).trim();
  if (!raw) return fallback;
  const normalized = obsidian.normalizePath(raw.replace(/\\/g, "/")).replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized || fallback;
}
var MOTION_LEVELS = ["full", "subtle", "off"];
function normalizeMotionLevel(value) {
  return MOTION_LEVELS.indexOf(value) >= 0 ? value : DEFAULTS.motionIntensity;
}
function normalizeSettings(settings) {
  const next = Object.assign({}, DEFAULTS, settings || {});
  FOLDER_SETTING_KEYS.forEach((key) => {
    next[key] = normalizeFolderSetting(next[key], DEFAULTS[key]);
  });
  next.defaultTaskDuration = clampInt(next.defaultTaskDuration, 1, 24 * 60, DEFAULTS.defaultTaskDuration);
  next.planningHorizonDays = clampInt(next.planningHorizonDays, 1, 365, DEFAULTS.planningHorizonDays);
  next.dailyCapacityMinutes = clampInt(next.dailyCapacityMinutes, 15, 24 * 60, DEFAULTS.dailyCapacityMinutes);
  next.reminderHour = clampInt(next.reminderHour, 0, 23, DEFAULTS.reminderHour);
  next.motionIntensity = normalizeMotionLevel(next.motionIntensity);
  if (next.bookFolder === DEFAULTS.bookFolder && next.knowledgeFolder !== DEFAULTS.knowledgeFolder) {
    next.bookFolder = obsidian.normalizePath(next.knowledgeFolder + "/图书库");
  }
  return next;
}
function folderClashes(settings) {
  const revert = [];
  DISTINCT_FOLDER_KEYS.forEach((key, index) => {
    DISTINCT_FOLDER_KEYS.slice(index + 1).forEach((other) => {
      if (!settings[key] || settings[key] !== settings[other]) return;
      const target = settings[key] !== DEFAULTS[key] ? key : other;
      if (revert.indexOf(target) < 0) revert.push(target);
    });
  });
  return revert;
}

// src/core/status.ts
function isTaskNote(path, frontmatter, settings) {
  const config = settings || {};
  const type = String(frontmatter && frontmatter.type || "").toLowerCase();
  if (type === "task" || type === "knowledge-gap") return true;
  if (NON_TASK_TYPES.includes(type)) return false;
  if (inFolder(path, config.taskFolder)) return true;
  if (!inFolder(path, config.projectFolder)) return false;
  if (type !== "") return false;
  return !directChild(path, config.projectFolder);
}
function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  return STATUS[value] || status || "未设置";
}
function taskStatus(taskOrFrontmatter) {
  const fm = taskOrFrontmatter && taskOrFrontmatter.frontmatter ? taskOrFrontmatter.frontmatter : taskOrFrontmatter || {};
  const raw = String(fm.status || "").toLowerCase();
  if (["archived", "done", "completed"].includes(raw)) return raw;
  if (raw === "blocked")
    return raw;
  const due = dateOf(fm.due || fm.deadline);
  const offset = daysUntil(due);
  if (offset !== null && offset < 0) return "expired";
  if (["doing", "paused"].includes(raw)) return raw;
  if (!due) return "planning";
  return "todo";
}
function projectStatus(projectOrFrontmatter) {
  const fm = projectOrFrontmatter && projectOrFrontmatter.frontmatter ? projectOrFrontmatter.frontmatter : projectOrFrontmatter || {};
  const raw = String(fm.status || "").toLowerCase();
  if (["archived", "completed"].includes(raw)) return raw;
  const due = dateOf(fm.deadline || fm.ddl);
  const offset = daysUntil(due);
  if (offset !== null && offset < 0) return "expired";
  if (raw === "expired") return due ? "active" : "planning";
  return raw || "planning";
}
function statusBadge(parent, status) {
  const value = String(status || "").toLowerCase();
  return el(parent, "span", statusLabel(value), ["pp-badge", "pp-status-" + (value || "neutral")]);
}

// src/core/tasks.ts
function buildTimePlan(tasks, startDate, horizonDays, capacityMinutes, defaultDuration) {
  const start = dateOf(startDate) || today();
  const horizon = Math.max(1, Number(horizonDays) || 1);
  const capacity = Math.max(1, Number(capacityMinutes) || 1);
  const fallbackDuration = Math.max(0, Number(defaultDuration) || 0);
  const days = Array.from({ length: horizon }, (_value, index) => ({
    date: addDays(start, index),
    tasks: [],
    minutes: 0,
    capacity,
    overloaded: false
  }));
  const scheduledDates = new Set(days.map((day) => day.date));
  const unscheduled = [];
  (tasks || []).forEach((task) => {
    var _a;
    const terminalStatuses = [task.taskStatus, (_a = task.frontmatter) == null ? void 0 : _a.status].map(
      (value) => String(value || "").toLowerCase()
    );
    if (terminalStatuses.some((value) => ["done", "completed", "archived"].includes(value))) return;
    const fm = task.frontmatter || task;
    const due = dateOf(fm.due || fm.deadline);
    if (!due) {
      unscheduled.push(task);
      return;
    }
    if (!scheduledDates.has(due)) return;
    const day = days.find((item) => item.date === due);
    if (!day) return;
    const minutes = Math.max(0, Number(fm.duration) || fallbackDuration);
    day.tasks.push(task);
    day.minutes += minutes;
    day.overloaded = day.minutes > day.capacity;
  });
  return { days, unscheduled };
}
function buildReminderMessages(data, date) {
  const messages = [];
  const overdue = data && data.overdue || [];
  const upcoming = data && data.upcoming || [];
  const inbox = data && data.inbox || [];
  const todayTasks = upcoming.filter(
    (task) => {
      var _a, _b;
      return dateOf(((_a = task.frontmatter) == null ? void 0 : _a.due) || ((_b = task.frontmatter) == null ? void 0 : _b.deadline)) === date;
    }
  );
  if (overdue.length) messages.push("有 " + overdue.length + " 项逾期任务");
  if (todayTasks.length) messages.push("今天有 " + todayTasks.length + " 项到期任务");
  if (inbox.length) {
    const weekday = (/* @__PURE__ */ new Date(date + "T00:00:00")).getDay();
    messages.push(
      weekday === 1 ? "本周草稿箱待清理：" + inbox.length + " 条" : "有 " + inbox.length + " 条未归类文档待分诊"
    );
  }
  return messages;
}
function buildTaskHierarchy(tasks) {
  const sets = [];
  const setMap = /* @__PURE__ */ new Map();
  (tasks || []).forEach((task) => {
    const fm = task.frontmatter || task;
    const setName = String(fm.task_set || fm.taskSet || "").trim() || "未分配任务集";
    const groupName = String(fm.task_group || fm.taskGroup || "").trim() || "未分组";
    let set = setMap.get(setName);
    if (!set) {
      set = { name: setName, groups: [], groupMap: /* @__PURE__ */ new Map() };
      setMap.set(setName, set);
      sets.push(set);
    }
    let group = set.groupMap.get(groupName);
    if (!group) {
      group = { name: groupName, tasks: [] };
      set.groupMap.set(groupName, group);
      set.groups.push(group);
    }
    group.tasks.push(task);
  });
  return sets.map((set) => ({ name: set.name, groups: set.groups }));
}
function taskImportPatch(taskSet, taskGroup) {
  return {
    type: "task",
    stage: "task",
    status: "planning",
    task_set: String(taskSet || "").trim(),
    task_group: String(taskGroup || "").trim()
  };
}
function shouldSplitTask(task, referenceDate) {
  const duration = Math.max(0, Number(task && task.duration) || 0);
  if (duration <= 10) return false;
  const due = dateOf(task && (task.due || task.deadline));
  if (!due) return true;
  const start = dateOf(referenceDate) || today();
  const offset = Math.round(
    ((/* @__PURE__ */ new Date(due + "T00:00:00")).getTime() - (/* @__PURE__ */ new Date(start + "T00:00:00")).getTime()) / 864e5
  );
  return offset > 7;
}
function buildResourceMap(items, settings) {
  const result = {
    areas: [],
    knowledge: [],
    people: [],
    books: [],
    videos: []
  };
  (items || []).forEach((item) => {
    const path = item.file.path;
    const type = String(item.frontmatter.type || "").toLowerCase();
    if (inFolder(path, settings.areaFolder)) result.areas.push(item);
    else if (inFolder(path, settings.peopleFolder)) result.people.push(item);
    else if (inFolder(path, settings.bookFolder) || type === "book") result.books.push(item);
    else if (type === "video") result.videos.push(item);
    else if (inFolder(path, settings.knowledgeFolder)) result.knowledge.push(item);
  });
  return result;
}
function resolveKnowledgeRefs(task, resources) {
  var _a;
  const all = [resources.knowledge, resources.books, resources.videos].flat();
  const wanted = refs(((_a = task.frontmatter) == null ? void 0 : _a.knowledge_refs) || task.knowledge_refs);
  const seen = /* @__PURE__ */ new Set();
  return wanted.map(
    (ref) => all.find(
      (item) => item.file.path === ref || item.file.path.replace(/\.md$/i, "") === ref || nameOf(item.file.path) === ref || item.frontmatter.title === ref
    )
  ).filter((item) => {
    if (!item || seen.has(item.file.path)) return false;
    seen.add(item.file.path);
    return true;
  });
}
function filterTaskList(tasks, filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const taskSet = String(filters.taskSet || "all");
  const taskGroup = String(filters.taskGroup || "all");
  const status = String(filters.status || "all");
  const priority = String(filters.priority || "all");
  return (tasks || []).filter((task) => {
    const fm = task.frontmatter || task;
    const title = String(fm.title || "").toLowerCase();
    const set = String(fm.task_set || fm.taskSet || "").trim() || "未分配任务集";
    const group = String(fm.task_group || fm.taskGroup || "").trim() || "未分组";
    const currentStatus = String(task.taskStatus || fm.status || "").toLowerCase();
    const currentPriority = String(fm.priority || "medium").toLowerCase();
    return (!query || title.includes(query)) && (taskSet === "all" || set === taskSet) && (taskGroup === "all" || group === taskGroup) && (status === "all" || currentStatus === status) && (priority === "all" || currentPriority === priority);
  });
}
function isCompletedTask(task) {
  const record = task || {};
  const frontmatter = record.frontmatter || record;
  const status = String(record.taskStatus || frontmatter.status || "").toLowerCase();
  return status === "done" || status === "completed";
}
function sortTaskList(tasks) {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  return [...tasks || []].sort((a, b) => {
    var _a, _b;
    const completed = (isCompletedTask(a) ? 1 : 0) - (isCompletedTask(b) ? 1 : 0);
    if (completed !== 0) return completed;
    const af = a.frontmatter || a;
    const bf = b.frontmatter || b;
    const ad = dateOf(af.due || af.deadline) || "9999-12-31";
    const bd = dateOf(bf.due || bf.deadline) || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return ((_a = priorityRank[String(af.priority || "medium").toLowerCase()]) != null ? _a : 1) - ((_b = priorityRank[String(bf.priority || "medium").toLowerCase()]) != null ? _b : 1);
  });
}
function selectInboxItems(items, paths) {
  const wanted = new Set(paths || []);
  return (items || []).filter((item) => item && item.file && wanted.has(item.file.path));
}
function blockerItems(frontmatter) {
  var _a, _b, _c;
  const fm = frontmatter || {};
  const value = (_c = (_b = (_a = fm.blockers) != null ? _a : fm.blocking_items) != null ? _b : fm.blocking_reason) != null ? _c : "";
  return normalizeList(value).filter((item) => item !== "-");
}
function buildAssigneeOptions(people, current = "") {
  const options = { "": "不指定执行者" };
  (people || []).forEach((item) => {
    var _a, _b, _c;
    const path = ((_a = item.file) == null ? void 0 : _a.path) || "";
    if (!path) return;
    options[path] = ((_b = item.frontmatter) == null ? void 0 : _b.title) || ((_c = item.frontmatter) == null ? void 0 : _c.name) || nameOf(path);
  });
  if (current && !options[current]) options[current] = current;
  return options;
}
async function mapWithConcurrency(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const out = new Array(list.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(Number(limit) || 8, list.length));
  const runners = Array.from({ length: size }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return out;
}
function buildProjectIndex(entries) {
  const byName = /* @__PURE__ */ new Map();
  const remember = (name, path) => {
    if (!name) return;
    const bucket = byName.get(name);
    if (bucket) {
      if (!bucket.includes(path)) bucket.push(path);
      return;
    }
    byName.set(name, [path]);
  };
  (entries || []).forEach((entry) => {
    [entry.path, nameOf(entry.path), entry.title, entry.folderPath ? nameOf(entry.folderPath) : ""].forEach(
      (name) => remember(name, entry.path)
    );
  });
  return {
    /** 与 projectMatches(task, project) 等价的候选项目路径集合 */
    candidatesFor(frontmatter) {
      const found = /* @__PURE__ */ new Set();
      refs(frontmatter && frontmatter.project).forEach((ref) => {
        (byName.get(ref) || []).forEach((path) => found.add(path));
        (byName.get(nameOf(ref)) || []).forEach((path) => found.add(path));
      });
      return found;
    }
  };
}

// src/core/web.ts
function renderKnowledgeLinks(parent, task, resources, plugin) {
  if (!resources) return;
  resolveKnowledgeRefs(task, resources).forEach((item) => {
    const link = parent.createEl("button", { cls: "pp-link-button pp-resource-reference" });
    link.setText("引用 " + (item.frontmatter.title || nameOf(item.file.path)));
    link.onclick = () => plugin.openFile(item.file);
  });
}
function renderNavigation(parent, plugin, active) {
  const nav = parent.createDiv({ cls: "pp-navigation" });
  nav.setAttr("role", "navigation");
  nav.setAttr("aria-label", "个人规划导航");
  const items = [
    ["dashboard", "仪表盘", () => plugin.activateApp()],
    ["inbox", "草稿箱", () => plugin.activateInbox()],
    ["tasks", "日程待办", () => plugin.activateTasks()],
    ["areas", "长期领域", () => plugin.activateResources("areas")],
    ["knowledge", "知识/图书", () => plugin.activateResources("knowledge")],
    ["people", "人物", () => plugin.activateResources("people")],
    ["about", "关于我", () => plugin.activateResources("about")],
    ["wealth", "财富", () => plugin.activateResources("wealth")]
  ];
  items.forEach(([id, label, callback]) => {
    const button = nav.createEl("button", { cls: id === active ? "pp-nav-link pp-nav-link-active" : "pp-nav-link" });
    button.setText(label);
    button.setAttr("aria-current", id === active ? "page" : "false");
    button.onclick = callback;
  });
}
function webChecklistOf(body) {
  const source = String(body || "");
  const items = [];
  const pattern = /^\s*[-*]\s*\[([ xX])\]\s*(.*)$/gm;
  let match = pattern.exec(source);
  while (match) {
    items.push({ done: match[1].toLowerCase() === "x", text: match[2].trim() });
    match = pattern.exec(source);
  }
  const done = items.filter((item) => item.done).length;
  return { done, open: items.length - done, total: items.length, items };
}
function webSummaryOf(body) {
  return String(body || "").replace(/^#+ .*$/gm, "").replace(/^\s*[-*]\s*\[[ xX]\]\s*/gm, "").replace(/\s+/g, " ").trim().slice(0, 220);
}
function webResourceSummary(list) {
  return (list || []).map((item) => ({
    title: item.frontmatter.title || nameOf(item.file.path),
    path: item.file.path,
    type: String(item.frontmatter.type || "")
  }));
}
function buildNoteIndex(entries, settings) {
  const config = Object.assign({}, DEFAULTS, settings || {});
  return (entries || []).filter(
    (entry) => entry && entry.path && !forbiddenPath(entry.path) && !entry.path.split("/").some((segment) => segment.startsWith("."))
  ).map((entry) => {
    const fm = entry.frontmatter || {};
    const type = String(fm.type || "").toLowerCase();
    const isTask = type === "task" || type === "knowledge-gap";
    const isProject = type === "project";
    const status = isTask ? taskStatus({ frontmatter: fm }) : isProject ? projectStatus({ frontmatter: fm }) : String(fm.status || fm.stage || "").toLowerCase();
    const stage = String(fm.stage || "").toLowerCase();
    const archived = stage === "archived" || ["archived", "done", "completed"].includes(status) || inFolder(entry.path, config.archiveFolder);
    return {
      path: entry.path,
      name: entry.name || nameOf(entry.path),
      title: fm.title || nameOf(entry.path),
      type: type || "note",
      kind: isProject ? "project" : isTask ? "task" : "note",
      status,
      statusLabel: status ? statusLabel(status) : "—",
      stage,
      project: String(fm.project || ""),
      updated: String(fm.updated || fm.created || ""),
      folder: entry.path.split("/")[0] || "",
      archived
    };
  }).sort((a, b) => a.path.localeCompare(b.path, "zh"));
}
function buildWebPayload(notes, settings, options = {}) {
  const config = Object.assign({}, DEFAULTS, settings || {});
  const list = Array.isArray(notes) ? notes : [];
  const isProjectNote = (note) => String(note.frontmatter.type || "").toLowerCase() === "project" || directChild(note.path, config.projectFolder);
  const isTaskNoteOf = (note) => isTaskNote(note.path, note.frontmatter, config);
  const projectNotes = list.filter(isProjectNote);
  const projectFolderOf = (note) => inFolder(note.path, config.projectFolder) ? note.path.split("/").slice(0, -1).join("/") : "";
  const projectIndex = buildProjectIndex(
    projectNotes.map((note) => ({
      path: note.path,
      title: note.frontmatter.title,
      folderPath: projectFolderOf(note)
    }))
  );
  const candidateProjectPaths = (frontmatter) => projectIndex.candidatesFor(frontmatter);
  const taskNotes = list.filter(isTaskNoteOf);
  const ownedByProject = /* @__PURE__ */ new Map();
  projectNotes.forEach((note) => ownedByProject.set(note.path, []));
  taskNotes.forEach((note) => {
    candidateProjectPaths(note.frontmatter).forEach((path) => {
      const bucket = ownedByProject.get(path);
      if (bucket) bucket.push(note);
    });
  });
  const projects = projectNotes.map((note) => {
    const owned = ownedByProject.get(note.path) || [];
    const done = owned.filter((task) => ["done", "completed", "archived"].includes(taskStatus(task))).length;
    const supplied = note.frontmatter.progress;
    const explicit = supplied !== void 0 && supplied !== "" && supplied !== null;
    return Object.assign({}, note, {
      progress: explicit ? Math.max(0, Math.min(100, Number(supplied) || 0)) : owned.length ? Math.round(done / owned.length * 100) : 0,
      done,
      total: owned.length,
      folderPath: projectFolderOf(note),
      /* 正文与这两个派生值都跟着笔记缓存算过了；直接传裸笔记的调用方走兜底 */
      checklist: note.checklist !== void 0 ? note.checklist : webChecklistOf(note.body),
      summary: note.summary !== void 0 ? note.summary : webSummaryOf(note.body)
    });
  });
  projects.forEach((project) => {
    project.status = projectStatus(project);
  });
  const tasks = taskNotes.map(
    (note) => Object.assign({}, note, {
      status: taskStatus(note),
      checklist: note.checklist !== void 0 ? note.checklist : webChecklistOf(note.body),
      summary: note.summary !== void 0 ? note.summary : webSummaryOf(note.body)
    })
  );
  tasks.forEach((task) => {
    const owner = pickProject(task.path, task.frontmatter, projects);
    task.projectPath = owner ? owner.path : "";
    task.projectTitle = owner ? owner.frontmatter.title || owner.name : "";
    task.daysLeft = daysUntil(task.frontmatter.due || task.frontmatter.deadline);
  });
  const tasksByProject = /* @__PURE__ */ new Map();
  tasks.forEach((task) => {
    if (!task.projectPath) return;
    const bucket = tasksByProject.get(task.projectPath);
    if (bucket) bucket.push(task);
    else tasksByProject.set(task.projectPath, [task]);
  });
  projects.forEach((project) => {
    const owned = tasksByProject.get(project.path) || [];
    project.taskPaths = owned.map((task) => task.path);
    project.blockers = blockerItems(project.frontmatter);
    project.daysLeft = daysUntil(project.frontmatter.deadline || project.frontmatter.ddl);
    project.milestones = normalizeList(project.frontmatter.milestones || project.frontmatter.key_nodes);
    owned.forEach((task) => {
      const milestone = String(task.frontmatter.milestone || "").trim() || "未分组";
      if (!project.milestones.includes(milestone)) project.milestones.push(milestone);
    });
    if (!project.milestones.length) project.milestones = ["未分组"];
  });
  const archived = (note) => ["archived", "done", "completed"].includes(taskStatus(note));
  const activeTasks = tasks.filter((note) => !archived(note));
  const inbox = list.filter(
    (note) => inFolder(note.path, config.inboxFolder) || String(note.frontmatter.stage || "").toLowerCase() === "inbox"
  );
  const gaps = activeTasks.filter(
    (note) => String(note.frontmatter.type || "").toLowerCase() === "knowledge-gap" || note.frontmatter.knowledge_gap === true || refs(note.frontmatter.tags).includes("knowledge-gap")
  );
  const overdue = activeTasks.filter((note) => note.daysLeft !== null && note.daysLeft < 0).sort((a, b) => a.daysLeft - b.daysLeft);
  const upcoming = activeTasks.filter((note) => note.daysLeft !== null && note.daysLeft >= 0 && note.daysLeft <= config.planningHorizonDays).sort((a, b) => String(a.frontmatter.due || "").localeCompare(String(b.frontmatter.due || "")));
  const resources = buildResourceMap(
    list.map((note) => ({ file: { path: note.path }, frontmatter: note.frontmatter })),
    config
  );
  const timePlan = buildTimePlan(
    activeTasks,
    today(),
    config.planningHorizonDays,
    config.dailyCapacityMinutes,
    config.defaultTaskDuration
  );
  const hierarchy = buildTaskHierarchy(sortTaskList(activeTasks));
  const stripBody = (note) => ({
    path: note.path,
    name: note.name,
    title: note.frontmatter.title || note.name,
    frontmatter: note.frontmatter,
    summary: note.summary || "",
    checklist: note.checklist || { done: 0, open: 0, total: 0 }
  });
  return {
    generatedAt: options.generatedAt || (/* @__PURE__ */ new Date()).toISOString(),
    assets: options.assets || {},
    vaultName: options.vaultName || "",
    today: today(),
    live: options.live === true,
    /* 最近一次批量操作的失败清单（渲染层用它显示"可重试"的失败条） */
    bulkFailures: options.bulkFailures || null,
    /* 最近一次「本周期完成」（渲染层用它在那条任务上显示「撤销」；只对最近一次有效） */
    recurringUndo: options.recurringUndo || null,
    settings: {
      dailyCapacityMinutes: config.dailyCapacityMinutes,
      planningHorizonDays: config.planningHorizonDays,
      /* Web 面板据此决定动效强度（data-motion）：渲染层与原生视图共用同一个用户偏好 */
      motionIntensity: config.motionIntensity,
      folders: {
        project: config.projectFolder,
        task: config.taskFolder,
        inbox: config.inboxFolder,
        knowledge: config.knowledgeFolder,
        book: config.bookFolder,
        area: config.areaFolder,
        people: config.peopleFolder,
        archive: config.archiveFolder,
        asset: config.assetFolder
      }
    },
    /* 详情页可直改的字段规格：与插件写入口共用同一份定义（见顶层 EDITABLE_FIELDS） */
    fieldSpec: EDITABLE_FIELDS,
    stats: {
      activeProjects: projects.filter(
        (project) => ["planning", "active", "blocked", "paused"].includes(project.status)
      ).length,
      projects: projects.length,
      tasks: tasks.length,
      activeTasks: activeTasks.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      inbox: inbox.length,
      gaps: gaps.length,
      knowledge: resources.knowledge.length + resources.books.length + resources.videos.length,
      people: resources.people.length,
      areas: resources.areas.length,
      capacityMinutes: config.dailyCapacityMinutes
    },
    projects: projects.map(
      (project) => Object.assign(stripBody(project), {
        status: project.status,
        statusLabel: statusLabel(project.status),
        progress: project.progress,
        done: project.done,
        total: project.total,
        deadline: dateOf(project.frontmatter.deadline || project.frontmatter.ddl),
        daysLeft: project.daysLeft,
        outcome: project.frontmatter.outcome || project.frontmatter.final_outcome || "",
        acceptance: project.frontmatter.acceptance || project.frontmatter.acceptance_criteria || "",
        area: project.frontmatter.area || "",
        weight: project.frontmatter.weight || "",
        constraints: project.frontmatter.resource_constraints || project.frontmatter.constraints || "",
        milestones: project.milestones,
        blockers: project.blockers,
        taskPaths: project.taskPaths
      })
    ),
    tasks: tasks.map(
      (task) => Object.assign(stripBody(task), {
        status: task.status,
        statusLabel: statusLabel(task.status),
        projectPath: task.projectPath,
        projectTitle: task.projectTitle,
        milestone: String(task.frontmatter.milestone || "").trim() || "未分组",
        taskSet: String(task.frontmatter.task_set || "").trim() || "未分配任务集",
        taskGroup: String(task.frontmatter.task_group || "").trim() || "未分组",
        due: dateOf(task.frontmatter.due || task.frontmatter.deadline),
        daysLeft: task.daysLeft,
        duration: Number(task.frontmatter.duration) || config.defaultTaskDuration,
        priority: String(task.frontmatter.priority || "medium").toLowerCase(),
        assignee: task.frontmatter.assignee || "",
        recurrence: String(task.frontmatter.recurrence || "none").toLowerCase(),
        /* 重复模式（参考谷歌日历）：周几 / 几号 / 序列结束日（= 重复任务的 DDL）。
           渲染层要按这些值显示与编辑，所以必须随 payload 出来，不能只留在 frontmatter 里。 */
        recurrenceWeekdays: recurrenceWeekdaysOf(task.frontmatter),
        recurrenceMonthDay: recurrenceMonthDayOf(task.frontmatter),
        recurrenceUntil: recurrenceUntilOf(task.frontmatter),
        knowledgeRefs: refs(task.frontmatter.knowledge_refs),
        type: String(task.frontmatter.type || "task").toLowerCase(),
        suggestion: shouldSplitTask(task.frontmatter, today())
      })
    ),
    inbox: inbox.map(
      (note) => Object.assign(stripBody(note), {
        stage: note.frontmatter.stage || "inbox",
        project: String(note.frontmatter.project || "").toLowerCase() === "project"
      })
    ),
    gaps: gaps.map((note) => Object.assign(stripBody(note), { projectTitle: note.projectTitle || "" })),
    timePlan: {
      days: timePlan.days.map((day) => ({
        date: day.date,
        minutes: day.minutes,
        capacity: day.capacity,
        overloaded: day.overloaded,
        taskPaths: day.tasks.map((task) => task.path)
      })),
      unscheduled: timePlan.unscheduled.map((task) => task.path)
    },
    resources: {
      knowledge: webResourceSummary(resources.knowledge),
      books: webResourceSummary(resources.books),
      videos: webResourceSummary(resources.videos),
      people: webResourceSummary(resources.people),
      areas: webResourceSummary(resources.areas)
    },
    hierarchy: hierarchy.map((set) => ({
      name: set.name,
      groups: set.groups.map((group) => ({
        name: group.name,
        taskPaths: group.tasks.map((task) => task.path)
      }))
    })),
    notes: buildNoteIndex(options.noteIndex || [], settings),
    history: Array.isArray(options.history) ? options.history : []
  };
}
var WEB_SHELL_HTML = '<div class="app" id="pp-app"><header class="topbar"><a class="brand" href="#/overview"><span class="brand-text"><strong>个人规划</strong><small>PERSONAL OPERATING SYSTEM</small></span></a><nav class="tabs" id="tabs" role="tablist" aria-label="页面导航"></nav><div class="topbar-side"><button type="button" class="primary-btn" id="source-toggle" hidden>切换数据源</button><span class="date-chip" id="date-chip"></span></div></header><main class="view" id="view" tabindex="-1"></main><div class="sr-only" id="live" role="status" aria-live="polite" aria-atomic="true"></div><footer class="footer" id="footer"></footer></div><aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="详情" hidden></aside><div class="scrim" id="scrim" hidden aria-hidden="true" data-action="close-drawer"></div>';
var WEB_SHADOW_BRIDGE_CSS = "\n/* 插件桥接：html/body 在 Shadow DOM 内不存在，改由宿主元素承担 */\n:host { display: block; height: 100%; min-height: 0; overflow: hidden; position: relative; background-attachment: scroll; container-type: inline-size; }\n:host(.theme-dark) { color-scheme: dark; }\n:host(.theme-light) { color-scheme: light; }\n/* 滚动交给 .app，宿主只负责裁剪：这样抽屉/遮罩才能相对窗格定位。同时把 web 版的\n   min-height:100vh 收掉 —— 窗格高度由宿主决定，用视口高度会让短窗格必然溢出。\n   用 absolute + inset:0 而不是 height:100%：宿主高度来自 flex 分配，百分比高度在宿主内部\n   解析不出确定值（实测 .app 会退化成内容高度，于是滚动又回到宿主上）。 */\n:host .app { position: absolute; inset: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }\n/* .drawer/.scrim 在浏览器版是 position:fixed（相对视口）；在 Obsidian 里 fixed 会逃出窗格、\n   把侧边栏和其它窗格一起盖住，所以这里改成相对宿主的 absolute。 */\n:host .drawer, :host .scrim { position: absolute; }\n";
function shadowScopedCss(css) {
  return String(css || "").replace(/(^|\n)([ \t]*):root([ \t]*)\{/g, "$1$2:host$3{").replace(/(^|\n)([ \t]*)html,[ \t]*body([ \t]*)\{/g, "$1$2:host$3{").replace(/(^|\n)([ \t]*)\.theme-dark(?![-\w])/g, "$1$2:host(.theme-dark)").replace(/(^|\n)([ \t]*)\.theme-light(?![-\w])/g, "$1$2:host(.theme-light)").replace(/(^|\n)([ \t]*)body([ \t]*)\{/g, "$1$2:host$3{").replace(/@media\s*\(([^)]*(?:max|min)-width[^)]*)\)/g, "@container ($1)") + WEB_SHADOW_BRIDGE_CSS;
}

// src/views/modals.ts
var obsidian2 = __toESM(require("obsidian"));

// src/core/motion.ts
var COUNT_UP_MS = 520;
var FLASH_CLASS = "ppd-flash";
var lastAppliedLevel = "full";
function motionLevel(value) {
  if (value === "subtle") return "subtle";
  if (value === "off") return "off";
  return "full";
}
function currentMotionLevel() {
  return lastAppliedLevel;
}
function prefersReducedMotion() {
  if (typeof window === "undefined" || !window) return false;
  const win = window;
  if (typeof win.matchMedia !== "function") return false;
  try {
    return Boolean(win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (error) {
    return false;
  }
}
function jsMotionEnabled(level) {
  if (motionLevel(level) === "off") return false;
  return !prefersReducedMotion();
}
function applyMotionLevel(node, level) {
  if (!node) return;
  const normalized = motionLevel(level);
  lastAppliedLevel = normalized;
  if (typeof node.setAttr === "function") node.setAttr("data-pp-motion", normalized);
  else if (typeof node.setAttribute === "function") node.setAttribute("data-pp-motion", normalized);
  else if (node.dataset) node.dataset.ppMotion = normalized;
}
function setCssVar(node, name, value) {
  if (!node) return;
  const style = node.style;
  if (!style) return;
  if (typeof style.setProperty === "function") style.setProperty(name, value);
  else style[name] = value;
}
function createMotionContext(level) {
  return { level: motionLevel(level), snapshot: {} };
}
function requestFrame() {
  if (typeof window === "undefined" || !window) return null;
  const win = window;
  if (typeof win.requestAnimationFrame !== "function") return null;
  return (callback) => win.requestAnimationFrame(callback);
}
function writeText(node, value) {
  const text3 = String(value);
  if (typeof node.setText === "function") node.setText(text3);
  else node.textContent = text3;
}
function addClass(node, token) {
  if (!node) return;
  if (typeof node.addClass === "function") node.addClass(token);
  else if (node.classList && typeof node.classList.add === "function") node.classList.add(token);
  else if (node.dataset) node.dataset.ppFlash = "1";
}
function removeClass(node, token) {
  if (!node) return;
  if (typeof node.removeClass === "function") node.removeClass(token);
  else if (node.classList && typeof node.classList.remove === "function") node.classList.remove(token);
}
function flash(node) {
  removeClass(node, FLASH_CLASS);
  const frame = requestFrame();
  if (frame) frame(() => addClass(node, FLASH_CLASS));
  else addClass(node, FLASH_CLASS);
}
function countUp(ctx, node, key, value) {
  if (!node) return;
  const target = Math.round(Number(value) || 0);
  if (!ctx) {
    writeText(node, target);
    return;
  }
  const previous = ctx.snapshot[key];
  ctx.snapshot[key] = target;
  if (previous === target) return;
  const from = previous === void 0 ? 0 : previous;
  if (from === target) {
    writeText(node, target);
    return;
  }
  const frame = jsMotionEnabled(ctx.level) ? requestFrame() : null;
  if (!frame) {
    writeText(node, target);
    return;
  }
  let start = null;
  const step = (timestamp) => {
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
function trackPointerSpotlight(root, level) {
  if (!root) return;
  if (motionLevel(level) !== "full") return;
  if (prefersReducedMotion()) return;
  if (typeof root.addEventListener !== "function") return;
  const previous = root.__ppSpotlightHandler;
  if (typeof previous === "function" && typeof root.removeEventListener === "function") {
    root.removeEventListener("pointermove", previous);
  }
  const handler = (event) => {
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    const card = target.closest(".pp-stat-card, .pp-waypoint");
    if (!card || typeof card.getBoundingClientRect !== "function") return;
    const rect = card.getBoundingClientRect();
    const width = Number(rect && rect.width) || 0;
    const height = Number(rect && rect.height) || 0;
    if (width <= 0 || height <= 0) return;
    const x = (Number(event.clientX) - Number(rect && rect.left || 0)) / width;
    const y = (Number(event.clientY) - Number(rect && rect.top || 0)) / height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setCssVar(card, "--pp-mx", (Math.min(1, Math.max(0, x)) * 100).toFixed(2) + "%");
    setCssVar(card, "--pp-my", (Math.min(1, Math.max(0, y)) * 100).toFixed(2) + "%");
  };
  root.__ppSpotlightHandler = handler;
  root.addEventListener("pointermove", handler);
}

// src/views/modals.ts
var FormModal = class extends obsidian2.Modal {
  constructor(app, title, fields, submit) {
    super(app);
    this.title = title;
    this.fields = fields;
    this.submit = submit;
    this.controls = {};
    this.rows = {};
  }
  /** 当前表单取值（键与字段 id 一致）——显隐判定与提交读的是同一份 */
  values() {
    const out = {};
    this.fields.forEach((field) => {
      const control = this.controls[field.id];
      if (control) out[field.id] = typeof control.getValue === "function" ? control.getValue() : "";
    });
    return out;
  }
  /** 按 `showWhen` 显隐字段行。规则是纯数据（不是函数）——同一份规则还要发给 Web 渲染层，
   *  浏览器版的 data.js 是 JSON，函数会在序列化时被丢掉。 */
  refreshVisibility() {
    const current = this.values();
    this.fields.forEach((field) => {
      const row = this.rows[field.id];
      if (!row || !row.style) return;
      row.style.display = fieldVisible(field, current) ? "" : "none";
    });
    return this;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    this.fields.forEach((field) => {
      const setting = new obsidian2.Setting(this.contentEl).setName(field.name);
      if (field.desc) setting.setDesc(field.desc);
      this.rows[field.id] = setting.settingEl;
      if (field.type === "select")
        setting.addDropdown((dropdown) => {
          dropdown.addOptions(field.options || {});
          dropdown.setValue(String(field.value || Object.keys(field.options || {})[0] || ""));
          if (typeof field.onChange === "function") dropdown.onChange((value) => field.onChange(value, this));
          else dropdown.onChange(() => this.refreshVisibility());
          this.controls[field.id] = dropdown;
        });
      else if (field.type === "datalist")
        setting.addText((textControl) => {
          textControl.setValue(String(field.value || ""));
          textControl.setPlaceholder(field.placeholder || "");
          const listId = "pp-datalist-" + field.id;
          const list = setting.controlEl.createEl("datalist", { attr: { id: listId } });
          (field.options || []).forEach((value) => {
            list.createEl("option", { value: String(value) });
          });
          textControl.inputEl.setAttr("list", listId);
          textControl.inputEl.setAttr("autocomplete", "off");
          this.controls[field.id] = textControl;
        });
      else if (field.type === "textarea")
        setting.addTextArea((textarea) => {
          textarea.setValue(String(field.value || ""));
          textarea.setPlaceholder(field.placeholder || "");
          textarea.inputEl.rows = field.rows || 3;
          this.controls[field.id] = textarea;
        });
      else if (field.type === "date")
        setting.addText((dateControl) => {
          dateControl.setValue(String(field.value || ""));
          dateControl.inputEl.type = "date";
          this.controls[field.id] = dateControl;
        });
      else if (field.type === "multiselect") {
        setting.controlEl.addClass("pp-multi-select");
        const parsed = Array.isArray(field.value) ? field.value.map((item) => String(item)) : String(field.value === void 0 || field.value === null ? "" : field.value).split(/[,，、\s]+/).filter(Boolean);
        const boxes = [];
        (field.options || []).forEach((option) => {
          const value = Array.isArray(option) ? option[0] : option;
          const label = Array.isArray(option) ? option[1] : option;
          const item = setting.controlEl.createEl("label", { cls: "pp-multi-select-item" });
          const input = item.createEl("input", { attr: { type: "checkbox" } });
          input.value = String(value);
          input.checked = parsed.indexOf(String(value)) >= 0;
          input.onchange = () => this.refreshVisibility();
          item.createEl("span", { text: String(label) });
          boxes.push(input);
        });
        const control = {
          getValue: () => boxes.filter((box) => box.checked).map((box) => box.value),
          setValue: (next) => {
            const source = Array.isArray(next) ? next : String(next === void 0 || next === null ? "" : next).split(/[,，、\s]+/);
            const wanted = source.map((item) => String(item).trim()).filter(Boolean);
            boxes.forEach((box) => {
              box.checked = wanted.indexOf(box.value) >= 0;
            });
            return control;
          },
          inputEl: setting.controlEl
        };
        this.controls[field.id] = control;
      } else
        setting.addText((textControl) => {
          textControl.setValue(String(field.value || ""));
          textControl.setPlaceholder(field.placeholder || "");
          this.controls[field.id] = textControl;
        });
    });
    this.refreshVisibility();
    new obsidian2.Setting(this.contentEl).addButton((button) => button.setButtonText("取消").onClick(() => this.close())).addButton(
      (button) => button.setCta().setButtonText("保存").onClick(async () => {
        button.setDisabled(true);
        const values = {};
        this.fields.forEach((field) => values[field.id] = this.controls[field.id].getValue());
        try {
          await this.submit(values);
          this.close();
        } catch (error) {
          if (!error || !error.expected) console.error(error);
          new obsidian2.Notice("保存失败：" + (error.message || error));
          button.setDisabled(false);
        }
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ChoiceModal = class extends obsidian2.Modal {
  constructor(app, title, description, choices, choose) {
    super(app);
    this.title = title;
    this.description = description;
    this.choices = choices;
    this.choose = choose;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    if (this.description) el(this.contentEl, "p", this.description, "pp-muted");
    const list = this.contentEl.createDiv({ cls: "pp-choice-list" });
    this.choices.forEach((choice) => {
      const button = list.createEl("button", { cls: "pp-choice-button" });
      el(button, "strong", choice.label);
      el(button, "span", choice.description, "pp-muted");
      button.onclick = async () => {
        button.disabled = true;
        try {
          await this.choose(choice.id);
          this.close();
        } catch (error) {
          new obsidian2.Notice("操作失败：" + (error.message || error));
          button.disabled = false;
        }
      };
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var MultiChoiceModal = class extends obsidian2.Modal {
  constructor(app, title, description, choices, confirm) {
    super(app);
    this.title = title;
    this.description = description;
    this.choices = choices;
    this.confirm = confirm;
    this.selected = /* @__PURE__ */ new Set();
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    if (this.description) el(this.contentEl, "p", this.description, "pp-muted");
    const list = this.contentEl.createDiv({ cls: "pp-multi-choice-list" });
    this.choices.forEach((choice) => {
      var _a;
      const row = list.createDiv({ cls: "pp-multi-choice-row" });
      const checkbox = row.createEl("input");
      checkbox.setAttr("type", "checkbox");
      checkbox.setAttr("id", "pp-choice-" + this.choices.indexOf(choice));
      checkbox.onchange = () => checkbox.checked ? this.selected.add(choice.id) : this.selected.delete(choice.id);
      const label = row.createEl("label");
      label.setAttr("for", ((_a = checkbox.getAttr) == null ? void 0 : _a.call(checkbox, "id")) || "");
      el(label, "strong", choice.label);
      el(label, "span", choice.description, "pp-muted");
    });
    new obsidian2.Setting(this.contentEl).addButton((button) => button.setButtonText("取消").onClick(() => this.close())).addButton(
      (button) => button.setCta().setButtonText("继续").onClick(async () => {
        if (!this.selected.size) return new obsidian2.Notice("至少选择一条草稿。");
        button.setDisabled(true);
        try {
          await this.confirm(Array.from(this.selected));
          this.close();
        } catch (error) {
          new obsidian2.Notice("操作失败：" + (error.message || error));
          button.setDisabled(false);
        }
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends obsidian2.Modal {
  constructor(app, title, description, confirmLabel, confirm) {
    super(app);
    this.title = title;
    this.description = description;
    this.confirmLabel = confirmLabel;
    this.confirm = confirm;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    if (this.description) el(this.contentEl, "p", this.description, "pp-muted");
    new obsidian2.Setting(this.contentEl).addButton((button) => button.setButtonText("取消").onClick(() => this.close())).addButton(
      (button) => button.setCta().setButtonText(this.confirmLabel).onClick(async () => {
        button.setDisabled(true);
        try {
          await this.confirm();
          this.close();
        } catch (error) {
          new obsidian2.Notice("操作失败：" + (error.message || error));
          button.setDisabled(false);
        }
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/views/base.ts
var obsidian3 = __toESM(require("obsidian"));
var PlanningView = class extends obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.renderVersion = 0;
    this.motionCtx = null;
    this.renderedThisOpen = false;
  }
  async onOpen() {
    if (this.renderedThisOpen) {
      this.renderedThisOpen = false;
      return;
    }
    await this.refresh();
  }
  async onClose() {
    this.renderVersion += 1;
    this.renderedThisOpen = false;
    this.containerEl.empty();
  }
  /** 本轮渲染之前容器是不是空的（= 真正"换页"，只有这时才播整页入场）。
   *  children 可能是 getter，先做能力检测再读长度；判定不了就当作"不是首次"——
   *  宁可不播入场，也不要在每次 vault 刷新时重播动画（铁律 3）。 */
  isFirstBuild(root) {
    if (!root) return false;
    let children = null;
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
    return motionLevel(this.plugin && this.plugin.settings ? this.plugin.settings.motionIntensity : void 0);
  }
  /** 取本视图的动效上下文；强度变了就重建（快照不需要跨强度保留） */
  motionContext() {
    const level = this.motionLevelValue();
    if (!this.motionCtx || this.motionCtx.level !== level) this.motionCtx = createMotionContext(level);
    return this.motionCtx;
  }
  /** 清空容器、挂载导航，返回本轮版本号与根节点 */
  beginRender(activeNav) {
    const version = this.renderVersion += 1;
    this.renderedThisOpen = true;
    const root = this.containerEl.children[1] || this.containerEl;
    const firstBuild = this.isFirstBuild(root);
    root.empty();
    root.addClass("pp-view-root");
    applyMotionLevel(root, this.motionLevelValue());
    if (firstBuild) {
      root.addClass("pp-mo-enter");
      root.addClass("pp-mo-loading");
    } else {
      root.removeClass("pp-mo-enter");
      root.removeClass("pp-mo-loading");
    }
    renderNavigation(root, this.plugin, activeNav);
    return { version, root };
  }
  /** 渲染收尾（子类在 DOM 建完后调用，早退路径也要调）：
   *  把强度写到根节点、开启指针光晕委托、摘掉"数据未就绪"的骨架微光。 */
  finishRender(root) {
    const level = this.motionLevelValue();
    applyMotionLevel(root, level);
    trackPointerSpotlight(root, level);
    if (root && typeof root.removeClass === "function") root.removeClass("pp-mo-loading");
    return root;
  }
  /** 统计数字滚动：key 必须是稳定的语义键（"projects"/"overdue"…），不能用数组下标 ——
   *  下标在列表增删后会指向另一个数字，快照就错位了。 */
  countUpStat(node, key, value) {
    countUp(this.motionContext(), node, key, value);
  }
  /** 本轮渲染是否已被更新的一轮取代 */
  isStale(version) {
    return version !== this.renderVersion;
  }
  button(parent, label, callback, primary) {
    const button = parent.createEl("button", { cls: primary ? "pp-button pp-button-primary" : "pp-button" });
    button.setText(label);
    button.onclick = callback;
    return button;
  }
  panel(parent, title, description) {
    const panel = parent.createDiv({ cls: "pp-panel" });
    const head = panel.createDiv({ cls: "pp-panel-head" });
    const copy = head.createDiv();
    el(copy, "h2", title);
    el(copy, "p", description, "pp-muted");
    panel.body = panel.createDiv({ cls: "pp-panel-body" });
    return panel;
  }
  empty(parent, title, description) {
    const box = parent.createDiv({ cls: "pp-empty" });
    el(box, "strong", title);
    el(box, "span", description, "pp-muted");
  }
  /** 空状态附带一个主操作按钮 */
  emptyWithAction(parent, title, description, label, callback) {
    const box = parent.createDiv({ cls: "pp-empty" });
    el(box, "strong", title);
    el(box, "span", description, "pp-muted");
    this.button(box, label, callback, true);
  }
};

// src/views/dashboard.ts
var DashboardView = class extends PlanningView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return DASHBOARD_VIEW;
  }
  getDisplayText() {
    return "个人规划仪表盘";
  }
  getIcon() {
    return "layout-dashboard";
  }
  async refresh() {
    const { version: renderVersion, root } = this.beginRender("dashboard");
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const hero = root.createDiv({ cls: "pp-dashboard-hero" });
    const heroImage = this.plugin.assetResourcePath(this.plugin.settings.heroImage);
    if (heroImage) hero.style.backgroundImage = 'url("' + heroImage + '")';
    applyHeroCrop(hero, this.plugin.settings.heroCrop);
    const heroCopy = hero.createDiv({ cls: "pp-dashboard-hero-copy" });
    el(heroCopy, "span", "PERSONAL OPERATING SYSTEM", "pp-dashboard-hero-kicker");
    el(heroCopy, "h1", "把今天的行动，放回长期方向里。", "pp-dashboard-hero-title");
    el(heroCopy, "p", "项目负责结果，任务负责执行，笔记负责记忆。", "pp-dashboard-hero-subtitle");
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const title = header.createDiv({ cls: "pp-title-block" });
    el(title, "h1", "个人规划仪表盘");
    el(title, "p", today() + " · 视图只读取和跳转，笔记才是唯一事实来源", "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    this.button(actions, "刷新", () => this.refresh());
    this.button(actions, "新建项目", () => this.plugin.newProject(), true);
    this.button(actions, "新建任务", () => this.plugin.newTask());
    this.button(actions, "处理草稿箱", () => this.plugin.triageInbox());
    if (!data.projects.length && !data.allTasks.length) {
      const onboarding = root.createDiv({ cls: "pp-onboarding" });
      el(onboarding, "strong", "先初始化你的知识库目录");
      el(onboarding, "span", "插件只创建默认目录，不会读取或修改“AI禁止阅读”内容。", "pp-muted");
      this.button(onboarding, "初始化目录结构", () => this.plugin.initializeStructure(), true);
    }
    const stats = root.createDiv({ cls: "pp-overview" });
    [
      [
        "进行中项目",
        data.projects.filter(
          (project) => ["planning", "active", "blocked"].includes(String(project.frontmatter.status || "active").toLowerCase())
        ),
        "项目推演",
        "projects"
      ],
      ["未来 " + this.plugin.settings.planningHorizonDays + " 天任务", data.upcoming, "时间监控", "upcoming"],
      ["逾期任务", data.overdue, "执行状态", "overdue"],
      ["草稿箱", data.inbox, "分诊 / 整理", "inbox"]
    ].forEach((item) => {
      const card = stats.createDiv({ cls: "pp-stat-card" });
      el(card, "span", item[2], "pp-stat-hint");
      const value = el(card, "strong", item[1].length, "pp-stat-value");
      this.countUpStat(value, String(item[3]), item[1].length);
      el(card, "span", item[0], "pp-stat-label");
    });
    const focus = root.createDiv({ cls: "pp-focus-strip" });
    const focusText = focus.createDiv({ cls: "pp-focus-copy" });
    el(focusText, "span", "TODAY / 今日焦点", "pp-focus-kicker");
    const focusTask = data.overdue[0] || data.upcoming[0];
    el(
      focusText,
      "strong",
      focusTask ? focusTask.frontmatter.title || nameOf(focusTask.file.path) : "先选择一个值得推进的下一步",
      "pp-focus-title"
    );
    el(
      focusText,
      "span",
      focusTask ? "这是当前最值得优先处理的任务。" : "从新建项目、任务或处理草稿箱开始。",
      "pp-muted"
    );
    const focusActions = focus.createDiv({ cls: "pp-actions" });
    if (focusTask) {
      this.button(focusActions, "打开焦点任务", () => this.plugin.openFile(focusTask.file), true);
    }
    this.button(focusActions, "检查提醒", () => this.plugin.checkReminders(true));
    this.renderVisualWaypoints(root);
    const grid = root.createDiv({ cls: "pp-dashboard-grid" });
    this.renderProjects(grid, data);
    this.renderTimeline(grid, data);
    this.renderTimePlan(grid, data);
    this.renderInbox(grid, data);
    this.renderGaps(grid, data);
    this.finishRender(root);
  }
  renderVisualWaypoints(root) {
    const wrap = root.createDiv({ cls: "pp-waypoints" });
    const picked = resolveAssetImages(this.plugin.app.vault, this.plugin.settings);
    const waypoints = [
      {
        title: "任务执行",
        eyebrow: "01 / BUILD",
        description: "把计划变成下一步行动",
        image: picked.build,
        action: () => this.plugin.activateTasks()
      },
      {
        title: "知识沉淀",
        eyebrow: "02 / LEARN",
        description: "让每次学习都可复用",
        image: picked.learn,
        action: () => this.plugin.activateResources("knowledge")
      },
      {
        title: "个人方向",
        eyebrow: "03 / GROW",
        description: "连接长期领域与今天",
        image: picked.grow,
        action: () => this.plugin.activateResources("about")
      }
    ];
    waypoints.forEach((item) => {
      const card = wrap.createEl("button", { cls: "pp-waypoint" });
      card.setAttr("aria-label", item.title + "：" + item.description);
      const image = this.plugin.assetResourcePath(item.image);
      if (image) card.style.backgroundImage = 'url("' + image + '")';
      el(card, "span", item.eyebrow, "pp-waypoint-eyebrow");
      el(card, "strong", item.title, "pp-waypoint-title");
      el(card, "span", item.description, "pp-waypoint-description");
      card.onclick = item.action;
    });
  }
  renderProjects(parent, data) {
    const panel = this.panel(parent, "项目推演", "项目是决策层，任务是执行层。点击项目进入单项目页面。");
    const projects = data.projects.filter((project) => String(project.frontmatter.status || "active").toLowerCase() !== "archived").slice(0, 8);
    if (!projects.length) return this.empty(panel.body, "暂无项目", "点击“新建项目”创建项目文件夹和项目文档。");
    projects.forEach((project) => {
      const row = panel.body.createDiv({ cls: "pp-project-row" });
      const main = row.createDiv({ cls: "pp-row-main" });
      const link = main.createEl("button", { cls: "pp-link-button" });
      link.setText(project.frontmatter.title || nameOf(project.file.path));
      link.onclick = () => this.plugin.openProject(project.file);
      const meta = main.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, project.projectStatus || projectStatus(project));
      if (project.frontmatter.deadline) el(meta, "span", "DDL " + project.frontmatter.deadline, "pp-muted");
      if (project.frontmatter.area) el(meta, "span", "领域 " + project.frontmatter.area, "pp-muted");
      el(meta, "span", "权重 " + text(project.frontmatter.weight, 3), "pp-muted");
      el(row, "span", project.progress + "% · " + project.done + "/" + project.total + " 任务完成", "pp-progress-text");
      const bar = row.createDiv({ cls: "pp-progress-bar" });
      bar.createDiv({ cls: "pp-progress-fill" }).style.width = project.progress + "%";
    });
  }
  renderTimeline(parent, data) {
    const panel = this.panel(parent, "时间监控", "DDL、关键节点和执行状态。完成后可归档到项目库。");
    const tasks = data.overdue.concat(data.upcoming).slice(0, 12);
    if (!tasks.length)
      return this.empty(panel.body, "时间线上没有待处理任务", "任务会从项目文件夹和日程待办目录读取。");
    tasks.forEach((task) => {
      const row = panel.body.createDiv({ cls: "pp-task-row" });
      const link = row.createEl("button", { cls: "pp-link-button pp-task-content" });
      link.setText(task.frontmatter.title || nameOf(task.file.path));
      link.onclick = () => this.plugin.openFile(task.file);
      const meta = row.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, task.taskStatus || taskStatus(task));
      const offset = daysUntil(task.frontmatter.due || task.frontmatter.deadline);
      const due = offset === null ? "无 DDL" : offset < 0 ? "逾期 " + Math.abs(offset) + " 天" : offset === 0 ? "今天" : offset + " 天后";
      el(
        meta,
        "span",
        due + " · " + text(task.frontmatter.duration, this.plugin.settings.defaultTaskDuration) + " 分钟",
        offset !== null && offset < 0 ? "pp-danger" : "pp-muted"
      );
      const actions = row.createDiv({ cls: "pp-task-actions" });
      const edit = actions.createEl("button", { cls: "pp-icon-button" });
      edit.setText("编辑");
      edit.onclick = () => this.plugin.editTask(task);
      const archive = actions.createEl("button", { cls: "pp-icon-button" });
      archive.setText("归档到项目库");
      archive.onclick = () => this.plugin.archiveTask(task);
      const remove = actions.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteTask(task);
    });
  }
  renderTimePlan(parent, data) {
    const panel = this.panel(parent, "今日任务监控", "今天到期的任务与容量占用；下面是未来几天的负载。");
    const plan = data.timePlan || { days: [], unscheduled: [] };
    if (!plan.days.length)
      return this.empty(panel.body, "暂无时间规划", "设置任务 DDL 和时长后，这里会显示今日容量与未来负载。");
    const todayPlan = plan.days.find((day) => day.date === today()) || plan.days[0];
    const todayTasks = todayPlan.tasks || [];
    const todayMinutes = todayTasks.reduce(
      (sum, task) => {
        var _a;
        return sum + (Number((_a = task.frontmatter) == null ? void 0 : _a.duration) || 0);
      },
      0
    );
    const monitor = panel.body.createDiv({ cls: "pp-today-monitor" });
    const monitorHead = monitor.createDiv({ cls: "pp-time-plan-day-head" });
    el(monitorHead, "strong", "TODAY / 今日 " + todayPlan.date);
    el(
      monitorHead,
      "span",
      todayTasks.length + " 项 · " + todayMinutes + " 分钟" + (todayPlan.overloaded ? " · 超载" : ""),
      todayPlan.overloaded ? "pp-danger" : "pp-muted"
    );
    if (todayTasks.length) {
      const todayList = monitor.createDiv({ cls: "pp-time-plan-tasks" });
      todayTasks.forEach((task) => {
        const link = todayList.createEl("button", { cls: "pp-link-button pp-task-content" });
        link.setText(
          (task.frontmatter.title || nameOf(task.file.path)) + " · " + text(task.frontmatter.duration, 0) + " 分钟"
        );
        link.onclick = () => this.plugin.openFile(task.file);
      });
    } else {
      el(monitor, "p", "今天没有到期的任务。", "pp-muted");
    }
    el(panel.body, "h3", "未来 " + plan.days.length + " 天负载", "pp-task-group-title");
    plan.days.forEach((day) => {
      const row = panel.body.createDiv({
        cls: day.overloaded ? "pp-time-plan-day pp-time-plan-day-overloaded" : "pp-time-plan-day"
      });
      const head = row.createDiv({ cls: "pp-time-plan-day-head" });
      el(head, "strong", day.date);
      el(
        head,
        "span",
        day.minutes + " / " + day.capacity + " 分钟" + (day.overloaded ? " · 超载" : ""),
        day.overloaded ? "pp-danger" : "pp-muted"
      );
      const bar = row.createDiv({ cls: "pp-progress-bar" });
      const fill = bar.createDiv({ cls: "pp-progress-fill" });
      fill.style.width = Math.min(100, Math.round(day.minutes / day.capacity * 100)) + "%";
      if (day.overloaded) fill.style.background = "var(--color-red)";
      if (day.tasks.length) {
        const tasks = row.createDiv({ cls: "pp-time-plan-tasks" });
        day.tasks.forEach((task) => {
          const link = tasks.createEl("button", { cls: "pp-link-button pp-time-plan-task" });
          link.setText(
            (task.frontmatter.title || nameOf(task.file.path)) + " · " + text(task.frontmatter.duration, 0) + " 分钟"
          );
          link.onclick = () => this.plugin.openFile(task.file);
        });
      }
    });
    if (plan.unscheduled.length) el(panel.body, "p", "未排期任务：" + plan.unscheduled.length + " 项", "pp-muted");
  }
  renderInbox(parent, data) {
    const panel = this.panel(
      parent,
      "分诊 / 整理",
      "00 草稿箱只作为入口；处理后移动到项目、任务、知识、领域、人物或归档。"
    );
    if (!data.inbox.length) return this.empty(panel.body, "草稿箱为空", "临时笔记和未归类内容会显示在这里。");
    data.inbox.slice(0, 8).forEach((item) => {
      const row = panel.body.createDiv({ cls: "pp-inbox-row" });
      const link = row.createEl("button", { cls: "pp-link-button" });
      link.setText(item.frontmatter.title || nameOf(item.file.path));
      link.onclick = () => this.plugin.openTriage(item.file);
      const action = row.createEl("button", { cls: "pp-icon-button" });
      action.setText("分诊");
      action.onclick = () => this.plugin.openTriage(item.file);
    });
  }
  renderGaps(parent, data) {
    const panel = this.panel(parent, "知识缺口 / 学习计划", "缺口可以从项目任务中识别，再沉淀回知识库形成复用引用。");
    if (!data.gaps.length)
      return this.empty(panel.body, "暂无显式知识缺口", "新建任务时将类型设为 knowledge-gap，即可在这里追踪。");
    data.gaps.slice(0, 8).forEach((task) => {
      const row = panel.body.createDiv({ cls: "pp-task-row" });
      const link = row.createEl("button", { cls: "pp-link-button pp-task-content" });
      link.setText(task.frontmatter.title || nameOf(task.file.path));
      link.onclick = () => this.plugin.openFile(task.file);
      const meta = row.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, task.taskStatus || taskStatus(task));
      el(meta, "span", text(task.frontmatter.project, "未关联项目"), "pp-muted");
      const actions = row.createDiv({ cls: "pp-task-actions" });
      const edit = actions.createEl("button", { cls: "pp-icon-button" });
      edit.setText("编辑");
      edit.onclick = () => this.plugin.editTask(task);
      const materialize = actions.createEl("button", { cls: "pp-icon-button" });
      materialize.setText("沉淀到知识库");
      materialize.onclick = () => this.plugin.materializeKnowledgeGap(task);
      const remove = actions.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteTask(task);
    });
  }
};

// src/views/inbox.ts
var InboxView = class extends PlanningView {
  getViewType() {
    return INBOX_VIEW;
  }
  getDisplayText() {
    return "草稿箱";
  }
  getIcon() {
    return "inbox";
  }
  async refresh() {
    const { version: renderVersion, root } = this.beginRender("inbox");
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const title = header.createDiv({ cls: "pp-title-block" });
    el(title, "h1", "草稿箱");
    el(title, "p", "所有未分诊内容都先停留在这里；分诊后才进入项目、任务、知识、领域、人物或归档。", "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    const refresh = actions.createEl("button", { cls: "pp-button" });
    refresh.setText("刷新");
    refresh.onclick = () => this.refresh();
    const importTasks = actions.createEl("button", { cls: "pp-button pp-button-primary" });
    importTasks.setText("周维护导入任务集");
    importTasks.onclick = () => this.plugin.importInboxAsTaskSet();
    if (!data.inbox.length) {
      const empty = root.createDiv({ cls: "pp-onboarding" });
      el(empty, "strong", "草稿箱为空");
      el(empty, "span", "新的临时笔记会出现在这里。", "pp-muted");
      this.finishRender(root);
      return;
    }
    const panel = root.createDiv({ cls: "pp-inbox-screen" });
    data.inbox.forEach((item) => {
      const row = panel.createDiv({ cls: "pp-inbox-card" });
      const content = row.createDiv({ cls: "pp-inbox-card-content" });
      const link = content.createEl("button", { cls: "pp-link-button pp-task-content" });
      link.setText(item.frontmatter.title || nameOf(item.file.path));
      link.onclick = () => this.plugin.openFile(item.file);
      el(content, "div", item.file.path, "pp-muted");
      const meta = content.createDiv({ cls: "pp-meta-line" });
      el(meta, "span", "阶段：" + text(item.frontmatter.stage, "inbox"), "pp-muted");
      const actions2 = row.createDiv({ cls: "pp-task-actions" });
      const triage = actions2.createEl("button", { cls: "pp-icon-button" });
      triage.setText("分诊");
      triage.onclick = () => this.plugin.openTriage(item.file);
      const open = actions2.createEl("button", { cls: "pp-icon-button" });
      open.setText("打开");
      open.onclick = () => this.plugin.openFile(item.file);
      const remove = actions2.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteFile(item.file, "草稿");
    });
    this.finishRender(root);
  }
};

// src/views/tasks.ts
var TaskListView = class extends PlanningView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.filters = { query: "", taskSet: "all", taskGroup: "all", status: "all" };
    this.filterTimer = null;
  }
  getViewType() {
    return TASKS_VIEW;
  }
  getDisplayText() {
    return "日程待办";
  }
  getIcon() {
    return "list-checks";
  }
  async onClose() {
    if (this.filterTimer) window.clearTimeout(this.filterTimer);
    await super.onClose();
  }
  addFilterSelect(parent, label, key, values, allLabel) {
    var _a;
    const wrap = parent.createDiv({ cls: "pp-filter-control" });
    el(wrap, "span", label, "pp-filter-label");
    const select = wrap.createEl("select", { cls: "pp-filter-select" });
    values.forEach((value) => {
      const option = select.createEl("option");
      option.value = value;
      option.textContent = value === "all" ? allLabel : value;
    });
    select.value = ((_a = this.filters) == null ? void 0 : _a[key]) || "all";
    select.onchange = () => {
      this.filters = Object.assign({}, this.filters || {}, { [key]: select.value });
      void this.refresh();
    };
  }
  renderTaskRow(panel, task, resources) {
    const row = panel.createDiv({ cls: isCompletedTask(task) ? "pp-task-list-row pp-task-done" : "pp-task-list-row" });
    const content = row.createDiv({ cls: "pp-task-list-content" });
    const link = content.createEl("button", { cls: "pp-link-button pp-task-content" });
    link.setText(task.frontmatter.title || nameOf(task.file.path));
    link.onclick = () => this.plugin.openFile(task.file);
    const meta = content.createDiv({ cls: "pp-meta-line" });
    statusBadge(meta, task.taskStatus || taskStatus(task));
    el(meta, "span", text(task.frontmatter.project, "未关联项目"), "pp-muted");
    el(meta, "span", task.frontmatter.due ? "DDL " + dateOf(task.frontmatter.due) : "无 DDL", "pp-muted");
    if (task.frontmatter.milestone) el(meta, "span", "节点 " + task.frontmatter.milestone, "pp-muted");
    if (task.frontmatter.assignee) el(meta, "span", "执行者 " + task.frontmatter.assignee, "pp-muted");
    if (shouldSplitTask(task.frontmatter, today())) el(meta, "span", "建议拆解", "pp-muted");
    renderKnowledgeLinks(meta, task, resources, this.plugin);
    const actions = row.createDiv({ cls: "pp-task-actions" });
    const edit = actions.createEl("button", { cls: "pp-icon-button" });
    edit.setText("编辑");
    edit.onclick = () => this.plugin.editTask(task);
    const archive = actions.createEl("button", { cls: "pp-icon-button" });
    archive.setText("归档");
    archive.onclick = () => this.plugin.archiveTask(task);
    const remove = actions.createEl("button", { cls: "pp-icon-button" });
    remove.setText("删除");
    remove.onclick = () => this.plugin.deleteTask(task);
  }
  async refresh(restoreSearch = false) {
    var _a, _b;
    const { version: renderVersion, root } = this.beginRender("tasks");
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const title = header.createDiv({ cls: "pp-title-block" });
    el(title, "h1", "日程待办");
    el(title, "p", "统一查看项目任务、孤立任务和日程待办；任务状态会根据 DDL 自动更新。", "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    const refresh = actions.createEl("button", { cls: "pp-button" });
    refresh.setText("刷新");
    refresh.onclick = () => this.refresh();
    const importTasks = actions.createEl("button", { cls: "pp-button pp-button-primary" });
    importTasks.setText("周维护导入任务集");
    importTasks.onclick = () => this.plugin.importInboxAsTaskSet();
    const add = actions.createEl("button", { cls: "pp-button pp-button-primary" });
    add.setText("新建任务");
    add.onclick = () => this.plugin.newTask();
    const filterBar = root.createDiv({ cls: "pp-task-filters" });
    const search = filterBar.createEl("input", { cls: "pp-filter-search" });
    search.setAttr("type", "search");
    search.setAttr("placeholder", "搜索任务名称…");
    search.value = ((_a = this.filters) == null ? void 0 : _a.query) || "";
    if (restoreSearch) {
      search.focus();
      (_b = search.setSelectionRange) == null ? void 0 : _b.call(search, search.value.length, search.value.length);
    }
    search.oninput = () => {
      this.filters = Object.assign({}, this.filters || {}, { query: search.value });
      window.clearTimeout(this.filterTimer);
      this.filterTimer = window.setTimeout(() => {
        void this.refresh(true);
      }, 120);
    };
    const taskSetValues = ["all"].concat(
      Array.from(
        new Set(
          data.tasks.map(
            (task) => String(task.frontmatter.task_set || task.frontmatter.taskSet || "").trim() || "未分配任务集"
          )
        )
      )
    );
    const taskGroupValues = ["all"].concat(
      Array.from(
        new Set(
          data.tasks.map(
            (task) => String(task.frontmatter.task_group || task.frontmatter.taskGroup || "").trim() || "未分组"
          )
        )
      )
    );
    const statusValues = ["all", "planning", "todo", "doing", "blocked", "paused", "expired", "done"];
    const priorityValues = ["all", "high", "medium", "low"];
    [
      ["taskSet", taskSetValues],
      ["taskGroup", taskGroupValues],
      ["status", statusValues],
      ["priority", priorityValues]
    ].forEach(([key, values]) => {
      if (this.filters && this.filters[key] && !values.includes(this.filters[key]))
        this.filters = Object.assign({}, this.filters, { [key]: "all" });
    });
    this.addFilterSelect(filterBar, "任务集", "taskSet", taskSetValues, "全部任务集");
    this.addFilterSelect(filterBar, "任务组", "taskGroup", taskGroupValues, "全部任务组");
    this.addFilterSelect(filterBar, "状态", "status", statusValues, "全部状态");
    this.addFilterSelect(filterBar, "优先级", "priority", priorityValues, "全部优先级");
    const visibleTasks = sortTaskList(filterTaskList(data.tasks, this.filters || {}));
    const panel = root.createDiv({ cls: "pp-task-list-screen" });
    if (!visibleTasks.length) {
      if (data.tasks.length) {
        const empty = panel.createDiv({ cls: "pp-empty" });
        el(empty, "strong", "没有符合筛选的任务");
        el(empty, "span", "调整搜索词或筛选条件，或把筛选重置为“全部”。", "pp-muted");
        this.finishRender(root);
        return;
      }
      this.emptyWithAction(
        panel,
        "没有待办任务",
        "创建第一个任务后，这里会按任务集 → 任务组展示。",
        "新建任务",
        () => this.plugin.newTask()
      );
      this.finishRender(root);
      return;
    }
    buildTaskHierarchy(visibleTasks).forEach((set) => {
      const setSection = panel.createDiv({ cls: "pp-task-set" });
      el(setSection, "h2", set.name, "pp-task-set-title");
      set.groups.forEach((group) => {
        const groupSection = setSection.createDiv({ cls: "pp-task-group" });
        el(groupSection, "h3", group.name, "pp-hierarchy-group-title");
        group.tasks.forEach((task) => this.renderTaskRow(groupSection, task, data.resources));
      });
    });
    this.finishRender(root);
  }
};

// src/views/resources.ts
var obsidian4 = __toESM(require("obsidian"));
var ResourceView = class extends PlanningView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.category = "knowledge";
  }
  getViewType() {
    return RESOURCES_VIEW;
  }
  getDisplayText() {
    return "规划资源";
  }
  getIcon() {
    return "library";
  }
  async setState(state) {
    this.category = (state == null ? void 0 : state.category) === "personal" ? "about" : (state == null ? void 0 : state.category) || "knowledge";
    await this.refresh();
  }
  getState() {
    return { category: this.category };
  }
  async refresh() {
    const { version: renderVersion, root } = this.beginRender(this.category);
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const resourceMap = data.resources || {
      areas: [],
      knowledge: [],
      people: [],
      books: [],
      videos: []
    };
    const titles = {
      areas: "长期领域",
      knowledge: "知识与图书",
      people: "人物库",
      about: "关于我",
      wealth: "财富"
    };
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const titleBlock = header.createDiv({ cls: "pp-title-block" });
    el(titleBlock, "h1", titles[this.category] || titles.knowledge);
    el(titleBlock, "p", "把资料、领域和个人支点放回同一个可执行的规划系统。", "pp-muted");
    if (this.category === "about" || this.category === "wealth") {
      const personal = this.category === "about" ? ["关于我", "关于我.md"] : ["财富相关", "财富.md"];
      const row = root.createDiv({ cls: "pp-resource-section pp-personal-panel" });
      el(row, "h2", personal[0]);
      el(
        row,
        "p",
        this.category === "about" ? "记录你的身份、现状、目标与近期行动。" : "记录收入、支出、资产、风险与财富目标。",
        "pp-muted"
      );
      const path = obsidian4.normalizePath(this.plugin.settings.areaFolder + "/" + personal[1]);
      const existing = this.plugin.app.vault.getAbstractFileByPath(path);
      const button = row.createEl("button", { cls: "pp-button pp-button-primary" });
      button.setText(existing instanceof obsidian4.TFile ? "打开笔记" : "创建并打开笔记");
      button.onclick = () => this.plugin.openPersonalNote(path, personal[0]);
      this.finishRender(root);
      return;
    }
    const groups = this.category === "areas" ? [["长期领域", resourceMap.areas]] : this.category === "people" ? [["人物", resourceMap.people]] : [
      ["知识笔记", resourceMap.knowledge],
      ["图书", resourceMap.books],
      ["视频", resourceMap.videos]
    ];
    groups.forEach(([label, items]) => {
      const section = root.createDiv({ cls: "pp-resource-section" });
      el(section, "h2", label + "（" + items.length + "）");
      if (!items.length) {
        el(section, "p", "暂无条目", "pp-muted");
        return;
      }
      items.forEach((item) => {
        const row = section.createDiv({ cls: "pp-resource-row" });
        const link = row.createEl("button", { cls: "pp-link-button" });
        link.setText(item.frontmatter.title || nameOf(item.file.path));
        link.onclick = () => this.plugin.openFile(item.file);
        el(row, "span", item.file.path, "pp-muted");
        if (this.category === "areas") {
          const areaName = item.frontmatter.title || nameOf(item.file.path);
          const projects = data.projects.filter(
            (project) => project.frontmatter.area === areaName || project.frontmatter.area === item.file.path
          );
          el(row, "span", "关联项目 " + projects.length + " 个", "pp-muted");
          projects.forEach((project) => {
            const button = row.createEl("button", { cls: "pp-icon-button" });
            button.setText(project.frontmatter.title || nameOf(project.file.path));
            button.onclick = () => this.plugin.openProject(project.file);
          });
        }
        if (label === "图书") {
          const archive = row.createEl("button", { cls: "pp-icon-button" });
          archive.setText("阅读完成并归档");
          archive.onclick = () => this.plugin.archiveBook(item);
        }
      });
    });
    this.finishRender(root);
  }
};

// src/views/projects.ts
var obsidian5 = __toESM(require("obsidian"));
var ProjectView = class extends PlanningView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.path = "";
    this.activeMilestone = "";
  }
  getViewType() {
    return PROJECT_VIEW;
  }
  getDisplayText() {
    return "单项目页面";
  }
  getIcon() {
    return "kanban-square";
  }
  async setState(state) {
    this.path = state && state.path || "";
    await this.refresh();
  }
  getState() {
    return { path: this.path };
  }
  async onOpen() {
    if (!this.path) return;
  }
  async refresh() {
    const { version: renderVersion, root } = this.beginRender("project");
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof obsidian5.TFile)) {
      el(root, "p", "项目文件不存在。", "pp-muted");
      this.finishRender(root);
      return;
    }
    const data = await this.plugin.collectData();
    if (this.isStale(renderVersion)) return;
    const project = data.projects.find((item) => item.file.path === file.path);
    if (!project) {
      el(root, "p", "该文件没有被识别为项目，请确认 type: project 或位于项目库目录。", "pp-muted");
      this.finishRender(root);
      return;
    }
    const header = root.createDiv({ cls: "pp-dashboard-header pp-page-header" });
    const titleBlock = header.createDiv({ cls: "pp-title-block" });
    el(titleBlock, "h1", project.frontmatter.title || nameOf(project.file.path));
    const meta = titleBlock.createDiv({ cls: "pp-meta-line" });
    statusBadge(meta, project.projectStatus || projectStatus(project));
    el(meta, "span", project.file.path, "pp-muted");
    const actions = header.createDiv({ cls: "pp-actions" });
    this.button(actions, "添加任务", () => this.plugin.newTask(project), true);
    this.button(actions, "新建关键节点", () => this.plugin.newMilestone(project));
    this.button(actions, "编辑项目", () => this.plugin.editProject(project));
    this.button(actions, "更新状态", () => this.plugin.projectStatus(project.file));
    this.button(actions, "归档项目", () => this.plugin.archiveProject(project));
    this.button(actions, "删除项目", () => this.plugin.deleteProject(project));
    this.button(actions, "打开源笔记", () => this.plugin.openFile(project.file));
    const summary = root.createDiv({ cls: "pp-project-summary" });
    [
      ["完成度", project.progress + "%"],
      ["已完成任务", project.done + "/" + project.total],
      ["DDL", text(project.frontmatter.deadline || project.frontmatter.ddl)],
      ["资源约束", text(project.frontmatter.resource_constraints || project.frontmatter.constraints)],
      ["长期领域", text(project.frontmatter.area)],
      ["项目权重", text(project.frontmatter.weight, 3)]
    ].forEach((item) => {
      const box = summary.createDiv({ cls: "pp-summary-item" });
      el(box, "span", item[0], "pp-muted");
      el(box, "strong", item[1]);
    });
    const details = root.createDiv({ cls: "pp-detail-grid" });
    [
      ["最终结果（终点画像）", project.frontmatter.outcome || project.frontmatter.final_outcome],
      ["验收标准（量化指标）", project.frontmatter.acceptance || project.frontmatter.acceptance_criteria]
    ].forEach((item) => {
      const box = details.createDiv({ cls: "pp-detail-card" });
      el(box, "h3", item[0]);
      el(box, "p", text(item[1], "尚未定义"));
    });
    this.renderTracking(root, project, data);
    const guidance = root.createDiv({ cls: "pp-section pp-guidance" });
    el(guidance, "h2", "项目运行提示");
    const list = guidance.createEl("ul");
    [
      "先定义最终结果和验收标准，再倒推 DDL 与关键节点。",
      "若任务超过 10 分钟且不在一周内完成，进入执行前再拆为可行动步骤。",
      "阻塞项回写项目笔记，更新暂停原因、资源约束或知识缺口。",
      "知识缺口任务完成后，把资料沉淀到知识库，供后续项目复用。"
    ].forEach((item) => el(list, "li", item));
    this.finishRender(root);
  }
  renderTracking(root, project, data) {
    const tasks = data.allTasks.filter((task) => projectMatches(task, project));
    const milestones = this.plugin.getMilestones(project, tasks);
    if (!milestones.includes(this.activeMilestone)) this.activeMilestone = milestones[0];
    const card = root.createDiv({ cls: "pp-task-tracking-card" });
    const head = card.createDiv({ cls: "pp-task-tracking-head" });
    const copy = head.createDiv();
    el(copy, "h2", "任务追踪");
    el(copy, "p", "关键节点作为任务拆解的父级；任务名称、任务属性和归档操作保持在同一行。", "pp-muted");
    const actions = head.createDiv({ cls: "pp-actions" });
    this.button(actions, "添加任务", () => this.plugin.newTask(project), true);
    this.button(actions, "新建关键节点", () => this.plugin.newMilestone(project));
    const tabs = card.createDiv({ cls: "pp-milestone-tabs" });
    milestones.forEach((milestone) => {
      const tabWrap = tabs.createDiv({
        cls: milestone === this.activeMilestone ? "pp-milestone-tab-wrap pp-milestone-tab-wrap-active" : "pp-milestone-tab-wrap"
      });
      const tab = tabWrap.createEl("button", {
        cls: milestone === this.activeMilestone ? "pp-milestone-tab pp-milestone-tab-active" : "pp-milestone-tab"
      });
      tab.setText(milestone);
      tab.onclick = async () => {
        this.activeMilestone = milestone;
        await this.refresh();
      };
      if (milestone !== "未分组") {
        const edit = tabWrap.createEl("button", { cls: "pp-milestone-edit" });
        edit.setText("编辑");
        edit.setAttr("aria-label", "编辑关键节点");
        edit.onclick = (event) => {
          event.stopPropagation();
          this.plugin.editMilestone(project, milestone);
        };
        const remove = tabWrap.createEl("button", { cls: "pp-milestone-delete" });
        remove.setText("×");
        remove.setAttr("aria-label", "删除关键节点");
        remove.onclick = (event) => {
          event.stopPropagation();
          this.plugin.deleteMilestone(project, milestone);
        };
      }
    });
    const body = card.createDiv({ cls: "pp-task-list" });
    el(body, "h3", this.activeMilestone + " · 任务拆解 / 执行状态", "pp-task-group-title");
    const filtered = tasks.filter((task) => (task.frontmatter.milestone || "未分组") === this.activeMilestone);
    if (!filtered.length) {
      const empty = body.createDiv({ cls: "pp-empty" });
      el(empty, "strong", "这个关键节点还没有任务");
      el(empty, "span", "点击“添加任务”把下一步行动放入当前关键节点。", "pp-muted");
      return;
    }
    filtered.forEach((task) => {
      const item = body.createDiv({ cls: "pp-task-item" });
      const content = item.createEl("button", { cls: "pp-link-button pp-task-content" });
      content.setText(task.frontmatter.title || nameOf(task.file.path));
      content.onclick = () => this.plugin.openFile(task.file);
      const meta = item.createDiv({ cls: "pp-meta-line" });
      statusBadge(meta, task.taskStatus || taskStatus(task));
      el(meta, "span", "DDL " + text(task.frontmatter.due || task.frontmatter.deadline), "pp-muted");
      el(meta, "span", text(task.frontmatter.duration, this.plugin.settings.defaultTaskDuration) + " 分钟", "pp-muted");
      if (task.frontmatter.assignee) el(meta, "span", "执行者 " + task.frontmatter.assignee, "pp-muted");
      if (shouldSplitTask(task.frontmatter, today())) el(meta, "span", "建议拆解", "pp-muted");
      renderKnowledgeLinks(meta, task, data.resources, this.plugin);
      const taskActions = item.createDiv({ cls: "pp-task-actions" });
      const edit = taskActions.createEl("button", { cls: "pp-icon-button" });
      edit.setText("编辑");
      edit.onclick = () => this.plugin.editTask(task, project);
      if (String(task.taskStatus || taskStatus(task)).toLowerCase() === "archived") {
        const undo = taskActions.createEl("button", { cls: "pp-icon-button" });
        undo.setText("撤销归档");
        undo.onclick = () => this.plugin.undoArchiveTask(task, project);
      } else {
        const done = taskActions.createEl("button", { cls: "pp-icon-button" });
        done.setText("完成并归档到项目库");
        done.onclick = () => this.plugin.archiveTask(task, project);
      }
      const remove = taskActions.createEl("button", { cls: "pp-icon-button" });
      remove.setText("删除");
      remove.onclick = () => this.plugin.deleteTask(task);
    });
  }
};

// src/views/web-app.ts
var obsidian6 = __toESM(require("obsidian"));
var WebAppView = class extends obsidian6.ItemView {
  constructor(leaf, plugin) {
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
  getIcon() {
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
      "pp-muted"
    );
  }
  /** 渲染层不可用时的错误页：给一条真实可走的退路，而不是让用户对着一段报错发呆 */
  showError(message) {
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
  async onOpen() {
    if (this.hasOwner()) return this.showSingleInstanceNotice();
    await this.refresh();
  }
  async onClose() {
    const wasOwner = this.plugin.appOwner === this;
    if (wasOwner) {
      this.plugin.appOwner = null;
      const other = this.app.workspace.getLeavesOfType(APP_VIEW).map((leaf) => leaf.view).find((view) => view && view !== this && typeof view.refresh === "function");
      this.unmount();
      if (other && other.hasOwner && !other.hasOwner()) void other.refresh();
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
      } catch (error) {
      }
    }
    this.mounted = null;
    this.shadow = null;
    this.shell = null;
  }
  /** 建立与 web/index.html 同构的外壳，并把设计系统注入 Shadow DOM */
  buildShell() {
    this.contentEl.empty();
    this.contentEl.style.padding = "0";
    this.contentEl.style.overflow = "hidden";
    this.contentEl.style.height = "100%";
    this.contentEl.style.minHeight = "0";
    const wrap = this.contentEl.createDiv({ cls: "pp-view-root" });
    wrap.style.padding = "0";
    wrap.style.margin = "0";
    wrap.style.maxWidth = "none";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.height = "100%";
    wrap.style.minHeight = "0";
    applyMotionLevel(wrap, motionLevel(this.plugin.settings.motionIntensity));
    const toolbar = wrap.createDiv({ cls: "pp-web-toolbar" });
    [
      ["新建项目", () => this.plugin.newProject(), true],
      ["新建任务", () => this.plugin.newTask()],
      ["处理草稿箱", () => this.plugin.triageInbox()],
      ["刷新", () => this.refresh()]
    ].forEach((entry) => {
      const button = toolbar.createEl("button", {
        cls: entry[2] ? "pp-web-toolbar-button pp-web-toolbar-primary" : "pp-web-toolbar-button"
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
    const token = this.refreshToken = (this.refreshToken || 0) + 1;
    if (this.hasOwner()) return;
    const detached = this.shell && this.shell.isConnected === false;
    if (!this.shell || !this.shadow || detached) {
      this.mounted = null;
      this.buildShell();
    }
    this.applyTheme();
    const api = this.plugin.webAppApi();
    if (!api) {
      const reason = this.plugin.webAppError ? "（原因：" + this.plugin.webAppError + "）" : "";
      return this.showError(
        "仪表盘界面没能加载：插件文件可能不完整（main.js 里缺少渲染层区块），建议重新安装这个插件。" + reason
      );
    }
    let data;
    try {
      data = await this.plugin.collectWebPayload();
    } catch (error) {
      console.error("[personal-planning-dashboard] Web 渲染层数据采集失败", error);
      return this.showError("读取 Vault 失败：" + (error && error.message || error));
    }
    if (token !== this.refreshToken || !this.shadow) return;
    this.plugin.appOwner = this;
    if (this.mounted && typeof this.mounted.setData === "function") {
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
        setHash: () => {
        },
        onHashChange: () => {
        },
        offHashChange: () => {
        },
        openNote: (target) => this.plugin.openPath(target),
        copyText: (value) => this.plugin.copyToClipboard(value),
        perform: (action, target, extra) => {
          Promise.resolve(this.plugin.webPerform(action, target, extra)).catch((error) => {
            console.error("[personal-planning-dashboard] Web 操作失败", error);
            new obsidian6.Notice("操作失败：" + (error && error.message || error));
          });
        },
        storage: { getItem: () => null, setItem: () => {
        } },
        sources: () => ({ vault: null, sample: null }),
        /* 动效强度交给渲染层：它据此在 Shadow DOM 内的 #pp-app 上写 data-motion（MOTION.md 第 3 节） */
        motionLevel: motionLevel(this.plugin.settings.motionIntensity)
      }
    });
  }
};

// src/settings/tab.ts
var obsidian8 = __toESM(require("obsidian"));

// src/views/banner.ts
var obsidian7 = __toESM(require("obsidian"));
var BannerPickerModal = class extends obsidian7.Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    this.contentEl.addClass("pp-asset-picker-modal");
    applyMotionLevel(this.contentEl, motionLevel(this.plugin.settings.motionIntensity));
    el(this.contentEl, "h2", "选择横幅素材");
    const folder = this.plugin.settings.assetFolder || "图片素材";
    const files = collectImageAssetFiles(this.plugin.app.vault, folder);
    el(
      this.contentEl,
      "p",
      files.length ? "扫描目录：" + folder + "（共 " + files.length + " 张；选择后进入 16:5 裁剪）" : "扫描目录：" + folder + " 下没有可用图片，请直接从电脑选择。",
      "pp-muted"
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
    files.forEach((file) => {
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
        else new obsidian7.Notice("无法读取该图片资源，请使用上方按钮选择本地文件。");
      };
    });
  }
  async openCrop(source) {
    try {
      const image = await loadBannerImage(source.src);
      this.close();
      window.setTimeout(() => new BannerCropModal(this.app, this.plugin, image, source, this.onDone).open(), 0);
    } catch (error) {
      if (source && source.revoke) URL.revokeObjectURL(source.src);
      new obsidian7.Notice("图片加载失败：" + (error.message || error));
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var DIAG_BUILD = "crop-diag-2";
function describeValue(value) {
  if (value === void 0) return "undefined";
  if (value === null) return "null";
  return Object.prototype.toString.call(value) + " · hasStyle=" + Boolean(value && value.style) + " · hasAppendChild=" + (typeof (value && value.appendChild) === "function") + " · ctor=" + String(value && value.constructor && value.constructor.name || "?");
}
function createDivIn(parent, options) {
  if (parent && typeof parent.createDiv === "function") return parent.createDiv(options);
  const node = document.createElement("div");
  node.className = options.cls;
  if (parent && typeof parent.appendChild === "function") parent.appendChild(node);
  return node;
}
function dumpCropDiagnostics(modal) {
  try {
    const adapter = modal.app && modal.app.vault && modal.app.vault.adapter;
    if (!adapter || typeof adapter.exists !== "function" || typeof adapter.write !== "function") return;
    const dir = "ppd-diagnostics";
    Promise.resolve(adapter.exists(dir + "/ENABLE")).then((enabled) => {
      if (!enabled) return;
      const doc = modal.selection && modal.selection.ownerDocument || (typeof document !== "undefined" ? document : null);
      const view = doc && doc.defaultView ? doc.defaultView : null;
      const rect = (node) => {
        if (!node || typeof node.getBoundingClientRect !== "function") return null;
        const r = node.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const css = (node) => {
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
          minHeight: s.minHeight
        };
      };
      const matched = [];
      const target = modal.selection;
      if (target && doc && doc.styleSheets) {
        for (const sheet of Array.from(doc.styleSheets)) {
          let rules = [];
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
                style: String(rule.style && rule.style.cssText).slice(0, 220)
              });
            }
          }
        }
      }
      const body = doc && doc.body;
      const payload = {
        build: DIAG_BUILD,
        at: (/* @__PURE__ */ new Date()).toISOString(),
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
          h: modal.preview && modal.preview.naturalHeight
        },
        matchedRules: matched.slice(0, 40)
      };
      return adapter.write(dir + "/crop-" + Date.now() + ".json", JSON.stringify(payload, null, 2));
    }).catch(() => {
    });
  } catch (error) {
  }
}
function fallbackCropStage(bounds) {
  const width = Math.max(
    240,
    Math.min(Number(bounds && bounds.width) || 480, (Number(bounds && bounds.height) || 300) * HERO_CROP_RATIO)
  );
  return { w: Math.round(width), h: Math.round(width / HERO_CROP_RATIO) };
}
var BannerCropModal = class extends obsidian7.Modal {
  constructor(app, plugin, image, source, onDone) {
    super(app);
    this.plugin = plugin;
    this.image = image;
    this.source = source;
    this.onDone = onDone;
    this.crop = null;
    this.drag = null;
    this.moveHandler = (event) => this.onPointerMove(event);
    this.upHandler = (event) => this.onPointerUp(event);
    this.mouseMoveHandler = (event) => this.onMouseMove(event);
    this.mouseUpHandler = () => this.onMouseUp();
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    this.contentEl.addClass("pp-crop-modal");
    applyMotionLevel(this.contentEl, motionLevel(this.plugin.settings.motionIntensity));
    el(this.contentEl, "h2", "裁剪横幅（16:5）");
    el(
      this.contentEl,
      "p",
      "拖动取景框移动范围，拖动四角调整大小；框内区域就是最终横幅。原始素材不会被修改。",
      "pp-muted"
    );
    this.stage = this.contentEl.createDiv({ cls: "pp-crop-stage" });
    this.preview = this.stage.createEl("img", { cls: "pp-crop-image" });
    this.preview.alt = "";
    this.preview.onload = () => {
      if (!this.closed) this.layoutStage();
    };
    this.preview.onerror = () => new obsidian7.Notice("预览图加载失败，仍可按 16:5 调整取景范围。");
    this.preview.src = this.image && (this.image.currentSrc || this.image.src) || "";
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
    } catch (error) {
      console.error("[personal-planning-dashboard] 裁剪界面初始化失败", error);
      new obsidian7.Notice("裁剪界面初始化异常：" + (error && error.message || error));
      this.diagError = {
        message: String(error && error.message || error),
        stack: String(error && error.stack || "").slice(0, 1200)
      };
    }
    this.scheduleRelayout();
    window.setTimeout(() => dumpCropDiagnostics(this), 120);
    window.setTimeout(() => dumpCropDiagnostics(this), 900);
  }
  /** 可用空间：视口、弹窗实测宽度与内容宽度里取最小值，保证舞台一定放得进可视区 */
  measureStageBounds() {
    const viewportWidth = Number(window.innerWidth) || 1024;
    const viewportHeight = Number(window.innerHeight) || 768;
    const modalWidth = Number(
      this.modalEl && this.modalEl.clientWidth || this.containerEl && this.containerEl.clientWidth || 0
    );
    const contentWidth = Number(this.contentEl && this.contentEl.clientWidth || 0);
    const available = Math.min(viewportWidth - 96, 880, modalWidth ? modalWidth - 56 : 880, contentWidth || 880);
    return { width: Math.max(280, available), height: Math.max(150, Math.min(viewportHeight - 300, 520)) };
  }
  layoutStage() {
    const bounds = this.measureStageBounds();
    const naturalWidth = Number(this.image && this.image.naturalWidth) || Number(this.preview && this.preview.naturalWidth) || 0;
    const naturalHeight = Number(this.image && this.image.naturalHeight) || Number(this.preview && this.preview.naturalHeight) || 0;
    const known = naturalWidth > 0 && naturalHeight > 0;
    const wasFallback = this.displayIsFallback === true;
    this.display = known ? computeCropStage(naturalWidth, naturalHeight, bounds.width, bounds.height) : fallbackCropStage(bounds);
    this.displayIsFallback = !known;
    if (this.stage) {
      this.stage.style.width = this.display.w + "px";
      this.stage.style.height = this.display.h + "px";
    }
    if (this.preview) {
      this.preview.style.width = this.display.w + "px";
      this.preview.style.height = this.display.h + "px";
    }
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
    if (this.selection && this.selection.style && typeof this.selection.appendChild === "function") {
      return this.selection;
    }
    this.selection = createDivIn(this.stage, { cls: "pp-crop-selection" });
    if (!this.selection || !this.selection.style) {
      throw new Error("无法创建取景框元素");
    }
    this.selection.style.left = "10%";
    this.selection.style.top = "30%";
    this.selection.style.width = "80%";
    this.selection.style.height = "40%";
    ["nw", "ne", "sw", "se"].forEach((edge) => {
      const handle = createDivIn(this.selection, { cls: "pp-crop-handle pp-crop-handle-" + edge });
      if (handle && handle.dataset) handle.dataset.edge = edge;
    });
    this.selection.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.selection.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.selection.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.selection.onmousedown = (event) => this.onMouseDown(event);
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
      h: height
    };
    return this.crop;
  }
  clampCrop() {
    if (!this.crop || !this.display) return null;
    const width = Math.max(
      Math.min(120, this.display.w),
      Math.min(this.crop.w, this.display.w, this.display.h * HERO_CROP_RATIO)
    );
    const height = width / HERO_CROP_RATIO;
    this.crop = {
      x: Math.max(0, Math.min(this.display.w - width, this.crop.x)),
      y: Math.max(0, Math.min(this.display.h - height, this.crop.y)),
      w: width,
      h: height
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
  beginDrag(clientX, clientY, target, pointerId) {
    if (this.drag) return;
    const dataset = target && target.dataset ? target.dataset : {};
    this.drag = {
      mode: dataset.edge || "move",
      pointerId,
      startX: clientX,
      startY: clientY,
      crop: Object.assign({}, this.crop)
    };
    return this.drag;
  }
  onPointerDown(event) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    if (!this.crop) return;
    const drag = this.beginDrag(event.clientX, event.clientY, event.target || this.selection, event.pointerId);
    if (drag && this.selection.setPointerCapture && event.pointerId !== void 0) {
      try {
        this.selection.setPointerCapture(event.pointerId);
      } catch (error) {
      }
    }
  }
  onMouseDown(event) {
    if (!this.crop || this.drag) return;
    const drag = this.beginDrag(event.clientX, event.clientY, event.target || this.selection, void 0);
    if (!drag) return;
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    window.addEventListener("mousemove", this.mouseMoveHandler);
    window.addEventListener("mouseup", this.mouseUpHandler);
  }
  onPointerMove(event) {
    if (!this.drag || this.drag.pointerId !== void 0 && event.pointerId !== this.drag.pointerId) return;
    this.applyDrag(event.clientX, event.clientY);
  }
  onMouseMove(event) {
    if (!this.drag || this.drag.pointerId !== void 0) return;
    this.applyDrag(event.clientX, event.clientY);
  }
  applyDrag(clientX, clientY) {
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
    if (this.selection && this.selection.releasePointerCapture && this.drag && this.drag.pointerId !== void 0) {
      try {
        this.selection.releasePointerCapture(this.drag.pointerId);
      } catch (error) {
      }
    }
    this.drag = null;
    window.removeEventListener("mousemove", this.mouseMoveHandler);
    window.removeEventListener("mouseup", this.mouseUpHandler);
  }
  onPointerUp(_event) {
    this.endDrag();
  }
  onMouseUp(_event) {
    this.endDrag();
  }
  /** 归一化取景框（0-1）；渲染端用它算背景焦点，因此与窗口尺寸无关 */
  normalizedCrop() {
    if (this.displayIsFallback) return null;
    if (!this.crop || !this.display) return null;
    const clamp = (value) => Math.max(0, Math.min(1, value));
    return {
      x: clamp(this.crop.x / this.display.w),
      y: clamp(this.crop.y / this.display.h),
      w: clamp(this.crop.w / this.display.w),
      h: clamp(this.crop.h / this.display.h)
    };
  }
  async confirmCrop(button) {
    const crop = this.normalizedCrop();
    if (!crop) {
      new obsidian7.Notice("无法计算取景范围，请重新选择图片。");
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
        heroPath = await this.plugin.uniqueBinaryPath(folder, this.source && this.source.name || "banner");
        await writeBannerBinary(this.plugin.app.vault, heroPath, buffer);
      }
      this.plugin.settings.heroImage = heroPath;
      this.plugin.settings.heroCrop = crop;
      await this.plugin.saveSettings();
      if (typeof this.plugin.refreshViews === "function") this.plugin.refreshViews();
      new obsidian7.Notice(
        this.source && this.source.path ? "横幅取景已应用。" : "已导入 " + heroPath + " 并应用横幅取景。"
      );
      if (this.onDone) this.onDone();
      this.close();
    } catch (error) {
      if (button && typeof button.setDisabled === "function") button.setDisabled(false);
      new obsidian7.Notice("应用失败：" + (error.message || error));
    }
  }
  onClose() {
    this.endDrag();
    this.closed = true;
    if (this.source && this.source.revoke) URL.revokeObjectURL(this.source.src);
    if (this.contentEl) this.contentEl.empty();
  }
};

// src/settings/tab.ts
var SettingsTab = class extends obsidian8.PluginSettingTab {
  /* 参数既要满足 PluginSettingTab 要求的 Obsidian Plugin，又要满足视图契约 DashboardHost */
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  renderHeroSetting(container) {
    const setting = new obsidian8.Setting(container).setName("仪表盘横幅").setDesc("从图片素材中选择图片，预览后进入固定比例裁剪；确认后才会替换当前横幅。");
    setting.addButton(
      (button) => button.setButtonText("选择图片并裁剪").setCta().onClick(() => new BannerPickerModal(this.app, this.plugin, () => this.display()).open())
    );
    if (this.plugin.settings.heroCrop)
      setting.addButton(
        (button) => button.setButtonText("重置取景").onClick(async () => {
          this.plugin.settings.heroCrop = null;
          await this.plugin.saveSettings();
          if (typeof this.plugin.refreshViews === "function") this.plugin.refreshViews();
          this.display();
        })
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
      loadBannerImage(url).then(
        (image) => new BannerCropModal(
          this.app,
          this.plugin,
          image,
          { name: file.name, src: url, revoke: true, blob: file },
          () => this.display()
        ).open()
      ).catch((error) => {
        URL.revokeObjectURL(url);
        new obsidian8.Notice("图片加载失败：" + (error.message || error));
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
  hide() {
    this.plugin.flushSaveSettings();
    this.plugin.warnMissingFolders();
  }
  /** 配置体检面板：问题摆在最上面，每条带一个能直接点掉的修复动作 */
  renderHealthCheck(container) {
    const issues = this.plugin.settingsIssues();
    const box = container.createDiv({ cls: "pp-settings-health" });
    if (!issues.length) {
      el(box, "span", "目录配置正常。", "pp-muted");
      return;
    }
    el(box, "strong", "配置需要处理（" + issues.length + " 项）");
    issues.forEach((issue) => {
      const row = box.createDiv({ cls: "pp-settings-health-row" });
      el(row, "span", issue.text, "pp-muted");
      const button = row.createEl("button", { cls: "pp-icon-button" });
      button.setText(issue.fix === "create" ? "创建这些目录" : "恢复默认值");
      button.onclick = async () => {
        if (issue.fix === "create") {
          const { missing } = this.plugin.missingConfiguredFolders();
          for (const folder of missing) await this.plugin.ensureFolder(folder);
          new obsidian8.Notice("已创建 " + missing.length + " 个目录。");
        } else {
          issue.keys.forEach((key) => {
            this.plugin.settings[key] = DEFAULTS[key];
          });
          await this.plugin.saveSettings({ quiet: true });
          new obsidian8.Notice("已恢复默认值：" + issue.keys.map((key) => DEFAULTS[key]).join("、"));
        }
        this.plugin.lastFolderWarning = null;
        this.plugin.refreshViews();
        this.display();
      };
    });
  }
  display() {
    const c = this.containerEl;
    c.empty();
    this.renderHealthCheck(c);
    el(c, "h2", "个人规划仪表盘");
    el(c, "p", "构建版本：" + PLUGIN_BUILD, "pp-muted");
    el(
      c,
      "p",
      "数据由 Markdown 和 YAML frontmatter 持有；插件不依赖第三方插件，也不会读取“AI禁止阅读”路径。",
      "pp-muted"
    );
    [
      ["inboxFolder", "00 草稿箱"],
      ["areaFolder", "10 长期领域"],
      ["projectFolder", "20 项目库"],
      ["knowledgeFolder", "30 知识库"],
      ["bookFolder", "图书库"],
      ["assetFolder", "图片素材"],
      ["peopleFolder", "40 人物库"],
      ["taskFolder", "50 日程待办"],
      ["archiveFolder", "90 归档库"]
    ].forEach(
      (item) => new obsidian8.Setting(c).setName(item[1]).setDesc("相对于当前 vault 根目录的路径").addText(
        (control) => control.setValue(this.plugin.settings[item[0]]).onChange(async (value) => {
          this.plugin.settings[item[0]] = value.trim().replace(/^\/+|\/+$/g, "");
          this.plugin.scheduleSaveSettings();
        })
      )
    );
    new obsidian8.Setting(c).setName("默认任务时长").addText(
      (control) => control.setValue(String(this.plugin.settings.defaultTaskDuration)).onChange(async (value) => {
        this.plugin.settings.defaultTaskDuration = Math.max(1, Number(value) || 30);
        this.plugin.scheduleSaveSettings();
      })
    );
    new obsidian8.Setting(c).setName("时间监控范围").addText(
      (control) => control.setValue(String(this.plugin.settings.planningHorizonDays)).onChange(async (value) => {
        this.plugin.settings.planningHorizonDays = Math.max(1, Number(value) || 7);
        this.plugin.scheduleSaveSettings();
      })
    );
    new obsidian8.Setting(c).setName("每日可用时间").setDesc("用于时间规划超载判断，单位：分钟").addText(
      (control) => control.setValue(String(this.plugin.settings.dailyCapacityMinutes)).onChange(async (value) => {
        this.plugin.settings.dailyCapacityMinutes = Math.max(1, Number(value) || 120);
        this.plugin.scheduleSaveSettings();
      })
    );
    new obsidian8.Setting(c).setName("启用规划提醒").setDesc("插件加载后按设定时间检查一次，每天最多提醒一次").addToggle(
      (control) => control.setValue(Boolean(this.plugin.settings.remindersEnabled)).onChange(async (value) => {
        this.plugin.settings.remindersEnabled = value;
        this.plugin.scheduleSaveSettings();
      })
    );
    new obsidian8.Setting(c).setName("提醒时间").setDesc("24 小时制整点，例如 9 表示每天 09:00 之后检查").addText(
      (control) => control.setValue(String(this.plugin.settings.reminderHour)).onChange(async (value) => {
        const hour = Number(value);
        this.plugin.settings.reminderHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9;
        this.plugin.scheduleSaveSettings();
      })
    );
    this.renderHeroSetting(c);
    new obsidian8.Setting(c).setName("界面动效").setDesc("控制视图与 Web 面板的动效强度；系统「减少动效」偏好始终优先，两者都会关闭动效。").addDropdown(
      (control) => control.addOptions({ full: "完整", subtle: "克制", off: "关闭" }).setValue(this.plugin.settings.motionIntensity).onChange(async (value) => {
        this.plugin.settings.motionIntensity = value;
        await this.plugin.saveSettings({ quiet: true });
        this.plugin.refreshViews();
      })
    );
    new obsidian8.Setting(c).setName("初始化目录结构").setDesc("只创建不存在的目录，不会删除或批量移动文件。").addButton(
      (button) => button.setButtonText("初始化").setCta().onClick(() => this.plugin.initializeStructure())
    );
  }
};

// src/plugin.ts
var DELETE_HINT = "删除方式跟随 Obsidian 的「删除文件」设置（系统回收站或永久删除）。";
var NOTE_CACHE_LIMIT = 4e3;
var NOTE_CACHE_HARD_LIMIT = NOTE_CACHE_LIMIT * 2;
var PersonalPlanningDashboard = class extends obsidian9.Plugin {
  constructor() {
    super(...arguments);
    /** 用户设置：类型定义在 core/constants 的 Settings（键名写错会在编译期报错） */
    this.settings = normalizeSettings({});
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.settings = normalizeSettings(this.settings);
    this.refreshTimer = null;
    this.assetPathCache = null;
    this.statusSyncFailures = /* @__PURE__ */ new Set();
    this.appOwner = null;
    this.registerView(DASHBOARD_VIEW, (leaf) => new DashboardView(leaf, this));
    this.registerView(PROJECT_VIEW, (leaf) => new ProjectView(leaf, this));
    this.registerView(INBOX_VIEW, (leaf) => new InboxView(leaf, this));
    this.registerView(TASKS_VIEW, (leaf) => new TaskListView(leaf, this));
    this.registerView(RESOURCES_VIEW, (leaf) => new ResourceView(leaf, this));
    this.registerView(APP_VIEW, (leaf) => new WebAppView(leaf, this));
    this.addCommand({ id: "open-dashboard", name: "打开个人规划仪表盘（Web 版）", callback: () => this.activateApp() });
    this.addCommand({ id: "new-project", name: "新建项目", callback: () => this.newProject() });
    this.addCommand({ id: "new-task", name: "新建任务", callback: () => this.newTask() });
    this.addCommand({ id: "triage-inbox", name: "处理草稿箱", callback: () => this.triageInbox() });
    this.addCommand({
      id: "import-inbox-task-set",
      name: "周维护：导入草稿为任务集",
      callback: () => this.importInboxAsTaskSet()
    });
    this.addCommand({
      id: "initialize-structure",
      name: "初始化规划目录结构",
      callback: () => this.initializeStructure()
    });
    this.addCommand({
      id: "archive-active-task",
      name: "归档当前任务到项目库",
      callback: () => this.archiveActiveTask()
    });
    this.addCommand({
      id: "undo-archive-active-task",
      name: "撤销当前任务归档",
      callback: () => this.undoArchiveActiveTask()
    });
    this.addCommand({
      id: "undo-recurring-completion",
      name: "撤销上一次重复周期完成",
      callback: () => this.undoRecurringCompletion()
    });
    this.addCommand({
      id: "open-classic-views",
      name: "打开经典视图（排错用）",
      callback: () => this.activateDashboard()
    });
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRefreshViews()));
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        this.invalidateNoteCache(file);
        this.scheduleRefreshViews();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", () => {
        this.invalidateNoteCache();
        this.scheduleRefreshViews();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", () => {
        this.invalidateNoteCache();
        this.scheduleRefreshViews();
      })
    );
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.app.workspace.getLeavesOfType(APP_VIEW).forEach((leaf) => {
          var _a, _b;
          return (_b = (_a = leaf.view) == null ? void 0 : _a.applyTheme) == null ? void 0 : _b.call(_a);
        });
      })
    );
    this.addCommand({ id: "check-reminders", name: "检查规划提醒", callback: () => this.checkReminders(true) });
    this.registerInterval(
      window.setInterval(
        () => {
          void this.checkReminders(false);
        },
        15 * 60 * 1e3
      )
    );
    void this.checkReminders(false);
  }
  async onunload() {
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
  async readManagedNote(file) {
    const cached = this.fm(file) || {};
    const indexed = Object.keys(cached).length > 0;
    const needsBody = !indexed || isTaskNote(file.path, cached, this.settings) || this.isProjectFile(file, cached);
    if (!needsBody) {
      return {
        path: file.path,
        name: nameOf(file.path),
        frontmatter: cached,
        body: "",
        checklist: void 0,
        summary: void 0
      };
    }
    if (!this.noteCache) this.noteCache = /* @__PURE__ */ new Map();
    const stat = file.stat || {};
    const hit = this.noteCache.get(file.path);
    if (hit && hit.mtime === stat.mtime && hit.size === stat.size && hit.indexed === indexed) {
      if (indexed) hit.frontmatter = cached;
      return {
        path: file.path,
        name: nameOf(file.path),
        frontmatter: hit.frontmatter,
        body: hit.body,
        checklist: hit.checklist,
        summary: hit.summary
      };
    }
    this.trimNoteCache(true);
    const raw = await this.app.vault.cachedRead(file);
    const parsed = parseFM(raw);
    const latest = this.fm(file) || {};
    const latestIndexed = Object.keys(latest).length > 0;
    const frontmatter = latestIndexed ? latest : parsed.data || {};
    const body = parsed.body || "";
    const checklist = webChecklistOf(body);
    const summary = webSummaryOf(body);
    this.noteCache.set(file.path, {
      mtime: stat.mtime,
      size: stat.size,
      indexed: latestIndexed,
      frontmatter,
      body,
      checklist,
      summary
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
  invalidateNoteCache(file) {
    if (!this.noteCache) return;
    if (file && typeof file.path === "string") this.noteCache.delete(file.path);
    else this.noteCache.clear();
  }
  /** 详情页字段直改：extra 是 JSON 字符串 { key, value }。
   *  只允许 EDITABLE_FIELDS 里的字段；空值 = 删除该字段（而不是写一个空字符串）。 */
  /** 任务集 / 任务组下拉里的「＋ 新建…」：问一个名字，然后写进这条任务的对应字段 */
  promptNewTaxonomy(item, extra) {
    if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
      return new obsidian9.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    let payload = {};
    try {
      payload = JSON.parse(String(extra || "{}")) || {};
    } catch (error) {
      payload = {};
    }
    const key = String(payload.key || "").trim();
    const spec = (EDITABLE_FIELDS.task || []).find((field) => field.key === key);
    if (!spec) return new obsidian9.Notice("不支持直接修改的字段：" + key);
    const current = String(
      item.frontmatter && (item.frontmatter[key] || item.frontmatter.taskSet || item.frontmatter.taskGroup) || ""
    );
    new FormModal(
      this.app,
      "新建" + spec.label,
      [
        {
          id: "name",
          name: spec.label + "名称",
          placeholder: spec.label === "任务集" ? "例如：本周维护" : "例如：资料整理",
          value: ""
        }
      ],
      async (values) => {
        const name = String(values.name || "").trim();
        if (!name) throw expectedError(spec.label + "名称不能为空");
        if (name === current) return;
        await this.updateFM(item.file, { [key]: name, updated: today() });
        this.invalidateNoteCache(item.file);
        new obsidian9.Notice(spec.label + "已设为：" + name);
        this.refreshViews();
      }
    ).open();
  }
  async setNoteField(item, extra) {
    if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
      return new obsidian9.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    let payload = {};
    try {
      payload = JSON.parse(String(extra || "{}")) || {};
    } catch (error) {
      payload = {};
    }
    const key = String(payload.key || "").trim();
    const kind = String(item.frontmatter && item.frontmatter.type || "").toLowerCase() === "project" ? "project" : "task";
    const spec = (EDITABLE_FIELDS[kind] || []).find((field) => field.key === key);
    if (!spec) return new obsidian9.Notice("不支持直接修改的字段：" + key);
    const rawText = payload.value === void 0 || payload.value === null ? "" : String(payload.value).trim();
    const patch = { updated: today() };
    if (rawText !== "") patch[key] = coerceFieldValue(spec, rawText);
    await this.updateFM(item.file, patch, rawText === "" ? [key] : []);
    this.invalidateNoteCache(item.file);
    new obsidian9.Notice(spec.label + " 已更新");
    this.scheduleRefreshViews();
  }
  /** 只改正文：frontmatter 原样保留（任务拆解这类编辑必须落在 body 上，不能碰用户手写的 frontmatter） */
  async updateBody(file, transform) {
    if (!file || !this.app.vault.process) return;
    await this.app.vault.process(file, (content) => {
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
  async checklistOp(item, extra) {
    if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
      return new obsidian9.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    let payload = {};
    try {
      payload = JSON.parse(String(extra || "{}")) || {};
    } catch (error) {
      payload = {};
    }
    const op = String(payload.op || "");
    const index = Number(payload.index);
    const text3 = String(payload.text === void 0 || payload.text === null ? "" : payload.text).trim();
    const isItem = (line) => /^\s*[-*]\s*\[[ xX]\]/.test(line);
    let changed = false;
    await this.updateBody(item.file, (body) => {
      const eol = body.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
      const lines = body.split(/\r?\n/);
      const positions = [];
      lines.forEach((line, at) => {
        if (isItem(line)) positions.push(at);
      });
      if (op === "toggle" && positions[index] !== void 0) {
        lines[positions[index]] = lines[positions[index]].replace(
          /^(\s*[-*]\s*\[)([ xX])(\])/,
          (all, head, mark, tail) => head + (mark === " " ? "x" : " ") + tail
        );
        changed = true;
      } else if (op === "remove" && positions[index] !== void 0) {
        lines.splice(positions[index], 1);
        changed = true;
      } else if (op === "rename" && positions[index] !== void 0) {
        lines[positions[index]] = lines[positions[index]].replace(/^(\s*[-*]\s*\[[ xX]\]\s*).*$/, "$1" + text3);
        changed = true;
      } else if (op === "add") {
        const line = "- [ ] " + text3;
        const last = positions.length ? positions[positions.length - 1] : -1;
        if (last >= 0) lines.splice(last + 1, 0, line);
        else {
          const heading = lines.findIndex((item2) => /^#{1,6}\s*任务拆解/.test(item2));
          if (heading >= 0) lines.splice(heading + 1, 0, "", line);
          else lines.push("", "## 任务拆解", "", line);
        }
        changed = true;
      }
      return lines.join(eol);
    });
    if (!changed) return new obsidian9.Notice("没有可修改的任务拆解项，请刷新后重试。");
    new obsidian9.Notice(
      op === "toggle" ? "任务拆解已更新" : op === "add" ? "已添加一步" : op === "remove" ? "已删除一步" : "任务拆解已更新"
    );
  }
  /** Web 渲染层的写操作入口：按路径找到条目，再调用插件原有方法（输入仍走原生弹窗） */
  async webPerform(action, target, extra) {
    const path = String(target || "");
    const key = String(action || "");
    const payload = () => {
      try {
        return JSON.parse(String(extra || "{}")) || {};
      } catch (error) {
        return {};
      }
    };
    const vaultActions = this.webVaultActions(path, extra, payload);
    if (vaultActions[key]) return vaultActions[key]();
    if (key === "triage-draft") {
      const draftFile = this.app.vault.getAbstractFileByPath(path);
      if (!draftFile) return new obsidian9.Notice("草稿已经不存在，请刷新草稿箱后重试。");
      return this.openTriage(draftFile);
    }
    const context = await this.webNoteContext(path);
    const noteActions = this.webNoteActions(context, path, extra);
    if (noteActions[key]) return noteActions[key]();
    return context.missing();
  }
  /** 不针对具体笔记的 Web 动作（新建 / 初始化 / 批量 / 重试）——原 webPerform 内的动作表，逻辑未改 */
  webVaultActions(path, extra, payload) {
    const vaultActions = {
      "init-structure": () => this.initializeStructure(),
      "new-project": () => this.newProject(),
      /* 新建任务：Web 端会把"在哪个项目的哪个节点下新建"放进 data-path / data-name；
         顶栏按钮没有上下文（传 "__vault__"），按"不关联项目"处理。
         以前这里是无参调用 —— 于是从关键节点新建任务时，项目和节点上下文全丢了。 */
      "new-task": () => this.newTask(path && path !== "__vault__" ? path : void 0, String(extra || "")),
      "new-resource": () => this.newResource(String(extra || "")),
      "import-task-set": () => this.importDraftsAsTaskSet(payload().paths || [], payload().taskSet, payload().taskGroup),
      "bulk-set-task-fields": () => this.bulkSetTaskFields(payload().paths || [], payload().patch || {}),
      "bulk-set-project-status": () => this.bulkSetProjectStatus(payload().paths || [], payload().status),
      "bulk-move-notes": () => this.bulkMoveNotes(payload().paths || [], payload().target),
      "bulk-sink-gaps": () => this.bulkSinkGaps(payload().paths || []),
      "clear-bulk-failures": () => this.clearBulkFailures(),
      /* 重试：原样重发上次失败的那一批（action + 载荷都存着） */
      /* 重试：用**存下来的载荷**原样重发上次失败的那一批（本次动作的 extra 是空的，不能拿来用） */
      "retry-bulk": () => {
        const info = this.lastBulkFailures;
        if (!info || !info.action) return new obsidian9.Notice("没有可重试的批量操作。");
        const stored = info.payload || {};
        const retries = {
          "bulk-set-task-fields": () => this.bulkSetTaskFields(stored.paths || [], stored.patch || {}),
          "bulk-set-project-status": () => this.bulkSetProjectStatus(stored.paths || [], stored.status),
          "bulk-archive": () => this.bulkArchiveTasks(stored.paths || [], false),
          "bulk-undo-archive": () => this.bulkArchiveTasks(stored.paths || [], true),
          "bulk-move-notes": () => this.bulkMoveNotes(stored.paths || [], stored.target),
          "import-task-set": () => this.importDraftsAsTaskSet(stored.paths || [], stored.taskSet, stored.taskGroup),
          "bulk-sink-gaps": () => this.bulkSinkGaps(stored.paths || [])
        };
        const retry = retries[info.action];
        if (!retry) return new obsidian9.Notice("这个操作不支持重试，请手动处理。");
        this.lastBulkFailures = null;
        return retry();
      },
      "bulk-archive": () => this.bulkArchiveTasks(payload().paths || [], false),
      "bulk-undo-archive": () => this.bulkArchiveTasks(payload().paths || [], true)
    };
    return vaultActions;
  }
  /** 按路径解析出这条笔记对应的任务 / 项目，以及几个『文件此刻还在』的辅助闭包 ——原 webPerform 中段，逻辑未改 */
  async webNoteContext(path) {
    const data = await this.collectData();
    const pick = (list) => (list || []).find((item) => item.file && item.file.path === path) || null;
    const task = pick(data.allTasks) || pick(data.all);
    const owned = task ? (data.projects || []).filter((candidate) => candidate.file.path !== path).find((candidate) => projectMatches(task, candidate)) || null : null;
    const project = task && owned || pick(data.projects) || null;
    const missing = () => new obsidian9.Notice("这条笔记已经不在活动目录里，请刷新后再试。");
    const withFile = (handler) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian9.TFile)) return new obsidian9.Notice("文件已经不存在，请刷新后重试。");
      return handler(file, this.fm(file) || {});
    };
    const needTask = (handler) => task ? handler(task) : missing();
    const needProject = (handler) => project ? handler(project) : missing();
    return { data, task, project, missing, withFile, needTask, needProject };
  }
  /** 针对某条笔记的动作表 ——原 webPerform 内的动作表，逻辑未改 */
  webNoteActions(context, path, extra) {
    const { data, task, project, missing, withFile, needTask, needProject } = context;
    const noteActions = {
      "set-field": () => this.setNoteField(task || project, extra),
      /* 任务集 / 任务组下拉里的「＋ 新建…」 */
      "new-task-taxonomy": () => this.promptNewTaxonomy(task || project, extra),
      "checklist-op": () => this.checklistOp(task || project, extra),
      "edit-project": () => needProject((item) => this.editProject(item)),
      "project-status": () => needProject((item) => this.projectStatus(item.file)),
      "project-milestone": () => needProject((item) => this.newMilestone(item)),
      "archive-project": () => needProject((item) => this.archiveProject(item)),
      /* 撤销项目归档：归档项目的 folderPath 在归档库，这里按路径现造一个 project 对象 */
      "undo-archive-project": () => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian9.TFile)) return new obsidian9.Notice("项目文件已经不存在，请刷新后重试。");
        return this.undoArchiveProject({
          file,
          frontmatter: this.fm(file) || {},
          folderPath: path.split("/").slice(0, -1).join("/")
        });
      },
      "delete-project": () => needProject((item) => this.deleteProject(item)),
      "edit-task": () => needTask((item) => this.editTask(item, project)),
      "set-task-status": () => needTask((item) => this.setTaskStatus(item, String(extra || ""))),
      "archive-task": () => needTask((item) => this.archiveTask(item, project)),
      "delete-task": () => needTask((item) => this.deleteTask(item)),
      "milestone-rename": () => needProject((item) => this.editMilestone(item, String(extra || ""))),
      "milestone-delete": () => needProject((item) => this.deleteMilestone(item, String(extra || ""))),
      "gap-sink": () => needTask((item) => this.materializeKnowledgeGap(item)),
      "archive-book": () => withFile((file, frontmatter) => this.archiveBook({ file, frontmatter })),
      "undo-archive": () => withFile(
        (file, frontmatter) => this.undoArchiveTask({ file, frontmatter }, this.findProject({ file, frontmatter }, data.projects))
      ),
      /* 撤销「本周期完成」：把执行日与状态放回去（只对最近一次有效，见 undoRecurringCompletion） */
      "undo-recurring-completion": () => this.undoRecurringCompletion(path)
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
    if (!created) await leaf.view.refresh();
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
    this.trimNoteCache();
    const folders = [
      this.settings.inboxFolder,
      this.settings.areaFolder,
      this.settings.projectFolder,
      this.settings.knowledgeFolder,
      this.settings.bookFolder,
      this.settings.peopleFolder,
      this.settings.taskFolder
    ].filter(Boolean);
    const files = (this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles() : []).filter(
      (file) => !forbiddenPath(file.path) && folders.some((folder) => inFolder(file.path, folder))
    );
    const notes = await mapWithConcurrency(files, 24, (file) => this.readManagedNote(file));
    const noteIndex = (this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles() : []).filter(
      (file) => !forbiddenPath(file.path) && !file.path.split("/").some((segment) => segment.startsWith("."))
    ).map((file) => ({ path: file.path, name: nameOf(file.path), frontmatter: this.fm(file) || {} }));
    return buildWebPayload(notes, this.settings, {
      noteIndex,
      vaultName: this.app.vault.getName ? this.app.vault.getName() : "",
      assets: await this.webAssets(),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      /* 最近一次批量操作的失败清单：渲染层据此在界面上留一条「可重试」的提示 */
      bulkFailures: this.lastBulkFailures || null,
      /* 最近一次「本周期完成」：渲染层据此在那条任务上显示「撤销」 */
      recurringUndo: this.lastRecurringCompletion ? { path: this.lastRecurringCompletion.path, due: this.lastRecurringCompletion.due } : null,
      live: true
    });
  }
  /** 按图片实际亮度判断叠字用深色还是浅色（与离线 manifest 同一套算法，阈值 0.62）。
   *  以前这里对四张图一律写死 tone: "dark"，于是亮图（你这张横幅亮度 0.69）也会被套上重遮罩 + 白字，
   *  设计里「亮图留出通透感」的那一档永远走不到。任何一步失败都回落到 dark —— 重遮罩 + 白字永远可读。 */
  async assetTone(path) {
    if (!path) return null;
    if (!this.toneCache) this.toneCache = /* @__PURE__ */ new Map();
    if (this.toneCache.has(path)) return this.toneCache.get(path);
    let tone = "dark";
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      const buffer = file && this.app.vault.readBinary ? await this.app.vault.readBinary(file) : null;
      if (buffer && typeof createImageBitmap === "function" && typeof document !== "undefined" && document.createElement) {
        const bitmap = await createImageBitmap(new Blob([buffer]));
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0, 48, 48);
        const data = context.getImageData(0, 0, 48, 48).data;
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) {
          sum += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        }
        tone = toneFromLuminance(sum / (data.length / 4));
      }
    } catch (error) {
      tone = "dark";
    }
    this.toneCache.set(path, tone);
    return tone;
  }
  /** Web 渲染层的素材：复用插件自己的横幅与导航卡图片，缺失时页面自动回退到纯 CSS 渐变 */
  async webAssets() {
    const assets = {};
    const picked = resolveAssetImages(this.app.vault, this.settings);
    const put = async (key, path) => {
      if (!path) return;
      const file = this.assetResourcePath(path);
      if (!file) return;
      const tone = await this.assetTone(path);
      assets[key] = { file, tone, suggestedInk: TONE_INK[tone] };
    };
    await put("hero", picked.hero);
    if (assets.hero) assets.hero.crop = this.settings.heroCrop || null;
    await put("cardBuild", picked.build);
    await put("cardLearn", picked.learn);
    await put("cardGrow", picked.grow);
    return assets;
  }
  /** 惰性构造 Web 渲染层：文件末尾的生成区块提供 ppWebAppFactory */
  webAppApi() {
    if (this.webApiCache !== void 0) return this.webApiCache;
    try {
      const sandbox = { exports: {} };
      const facade = {
        document,
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window)
      };
      const api = ppWebAppFactory(
        facade,
        document,
        typeof navigator === "undefined" ? null : navigator,
        window && window.localStorage || null,
        sandbox,
        sandbox.exports
      );
      this.webApiCache = api || sandbox.exports || null;
    } catch (error) {
      console.error("[personal-planning-dashboard] Web 渲染层加载失败", error);
      this.webAppError = error && error.message || String(error);
      this.webApiCache = null;
    }
    return this.webApiCache;
  }
  /** 渲染层里的「在 Obsidian 打开」：按路径直接跳转笔记 */
  async openPath(target) {
    const file = this.app.vault.getAbstractFileByPath(String(target || ""));
    if (file && file instanceof obsidian9.TFile) return this.openFile(file);
    new obsidian9.Notice("笔记不存在：" + target);
  }
  /** 渲染层里的「复制路径」 */
  async copyToClipboard(value) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(String(value));
        new obsidian9.Notice("已复制：" + value);
        return;
      }
    } catch (error) {
    }
    new obsidian9.Notice(String(value));
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
    if (!created) await leaf.view.refresh();
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
    if (!created) await leaf.view.refresh();
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
    if (!created) await leaf.view.refresh();
  }
  async activateResources(category) {
    let leaf = this.app.workspace.getLeavesOfType(RESOURCES_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: RESOURCES_VIEW, state: { category }, active: true });
    } else await leaf.setViewState({ type: RESOURCES_VIEW, state: { category }, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async openProject(file) {
    if (!file || !file.path) return new obsidian9.Notice("项目文件不存在，请刷新后重试。");
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: PROJECT_VIEW, state: { path: file.path }, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async openFile(file) {
    if (!file || !file.path) return new obsidian9.Notice("文件不存在，请刷新后重试。");
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    this.app.workspace.revealLeaf(leaf);
  }
  /** 把设置里的素材路径解析为 Obsidian 资源 URL；支持省略扩展名、反斜杠与大小写差异 */
  assetResourcePath(path) {
    const isFile = (file2) => file2 && typeof file2.path === "string" && (!obsidian9.TFile || file2 instanceof obsidian9.TFile || file2.extension);
    const exact = path ? this.app.vault.getAbstractFileByPath(path) : null;
    if (isFile(exact) && this.app.vault.getResourcePath) return this.app.vault.getResourcePath(exact);
    const resolved = resolveAssetPath(path, this.vaultAssetPaths());
    const file = resolved ? this.app.vault.getAbstractFileByPath(resolved) : null;
    if (isFile(file) && this.app.vault.getResourcePath) return this.app.vault.getResourcePath(file);
    if (resolved && this.app.vault.adapter && this.app.vault.adapter.getResourcePath)
      return this.app.vault.adapter.getResourcePath(resolved);
    return "";
  }
  fm(file) {
    var _a;
    return Object.assign({}, ((_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) || {});
  }
  /** metadataCache 是否已经给出这篇笔记的缓存：null = 还没索引到。
   *  未索引时 fm() 会返回空对象，若据此推导状态并回写，会把用户手写的 status 覆盖成 planning/todo。 */
  isFrontmatterIndexed(file) {
    const cache = this.app.metadataCache;
    if (!cache || typeof cache.getFileCache !== "function") return true;
    return cache.getFileCache(file) != null;
  }
  /** 声明了 DDL 却解析不出日期时，状态推导不可信（会被当成「没有 DDL」降级成 planning）——这种情况一律不参与状态回写 */
  isDueDerivable(frontmatter) {
    const declared = frontmatter ? frontmatter.due || frontmatter.deadline : void 0;
    if (declared === void 0 || declared === null || declared === "") return true;
    return Boolean(dateOf(declared));
  }
  isManagedPath(path) {
    return !forbiddenPath(path) && [
      this.settings.projectFolder,
      this.settings.taskFolder,
      this.settings.inboxFolder,
      this.settings.knowledgeFolder,
      this.settings.bookFolder,
      this.settings.areaFolder,
      this.settings.peopleFolder
    ].some((folder) => inFolder(path, folder));
  }
  isProjectFile(file, fm) {
    return String(fm.type || "").toLowerCase() === "project" || directChild(file, this.settings.projectFolder);
  }
  /** 显式声明为这些类型的笔记不是任务，即使放在日程待办目录里（例如 50 日程待办/日程待办.md 首页） */
  isExplicitNonTaskType(fm) {
    return NON_TASK_TYPES.includes(String(fm.type || "").toLowerCase());
  }
  isStatusSyncFailed(path) {
    return Boolean(this.statusSyncFailures && this.statusSyncFailures.has(path));
  }
  markStatusSyncFailed(path, label, error) {
    if (!this.statusSyncFailures) this.statusSyncFailures = /* @__PURE__ */ new Set();
    this.statusSyncFailures.add(path);
    console.error("[personal-planning-dashboard] " + label + " status sync failed", error);
  }
  isTaskFile(file, fm) {
    return isTaskNote(file.path, fm, this.settings);
  }
  async collectData() {
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedPath(file.path));
    const all = files.map((file) => ({ file, frontmatter: this.fm(file) }));
    const projectItems = all.filter((item) => this.isProjectFile(item.file, item.frontmatter));
    const projectIndex = buildProjectIndex(
      projectItems.map((item) => ({
        path: item.file.path,
        title: item.frontmatter.title,
        folderPath: item.folderPath || ""
      }))
    );
    const taskItems = all.filter((item) => this.isTaskFile(item.file, item.frontmatter));
    const ownedByProject = new Map(projectItems.map((item) => [item.file.path, []]));
    taskItems.forEach((item) => {
      projectIndex.candidatesFor(item.frontmatter).forEach((path) => {
        const bucket = ownedByProject.get(String(path));
        if (bucket) bucket.push(item);
      });
    });
    const projects = projectItems.map(
      (item) => Object.assign(item, this.projectStats(item, all, ownedByProject.get(item.file.path) || []))
    );
    projects.forEach((project) => {
      project.projectStatus = projectStatus(project);
    });
    this.syncProjectStatuses(projects);
    const allTasks = all.filter((item) => this.isTaskFile(item.file, item.frontmatter));
    allTasks.forEach((item) => {
      item.taskStatus = taskStatus(item);
    });
    this.syncTaskStatuses(allTasks);
    const tasks = allTasks.filter((item) => item.taskStatus !== "archived");
    const active = tasks.filter((item) => !["done", "completed", "archived"].includes(item.taskStatus));
    const inbox = all.filter(
      (item) => inFolder(item.file, this.settings.inboxFolder) || String(item.frontmatter.stage || "").toLowerCase() === "inbox"
    );
    const overdue = active.filter((item) => {
      const offset = daysUntil(item.frontmatter.due || item.frontmatter.deadline);
      return offset !== null && offset < 0;
    });
    const upcoming = active.filter((item) => {
      const offset = daysUntil(item.frontmatter.due || item.frontmatter.deadline);
      return offset !== null && offset >= 0 && offset <= this.settings.planningHorizonDays;
    }).sort((a, b) => String(a.frontmatter.due || "").localeCompare(String(b.frontmatter.due || "")));
    const gaps = tasks.filter(
      (item) => String(item.frontmatter.type || "").toLowerCase() === "knowledge-gap" || item.frontmatter.knowledge_gap === true || refs(item.frontmatter.tags).includes("knowledge-gap")
    );
    const timePlan = buildTimePlan(
      active,
      today(),
      this.settings.planningHorizonDays,
      this.settings.dailyCapacityMinutes,
      this.settings.defaultTaskDuration
    );
    const resources = buildResourceMap(all, this.settings);
    return { all, projects, allTasks, tasks, inbox, overdue, upcoming, gaps, timePlan, resources };
  }
  /** 读路径的状态修正：只修正插件推导得出的状态；用户自定义状态与已有 updated 一律不动；失败只记一次日志，不再每轮重试 */
  syncProjectStatuses(projects) {
    projects.forEach((project) => {
      if (!this.isFrontmatterIndexed(project.file)) return;
      const live = this.fm(project.file) || {};
      if (!this.isDueDerivable(live)) return;
      const raw = String(live.status || "").toLowerCase();
      const derived = projectStatus(live);
      if (raw === derived) return;
      if (raw && !KNOWN_STATUS_VALUES.includes(raw)) return;
      if (this.isStatusSyncFailed(project.file.path)) return;
      const patch = { status: derived };
      if (!live.updated) patch.updated = today();
      void this.updateFM(
        project.file,
        patch,
        [],
        (live2) => String(live2.status || "").toLowerCase() === raw
      ).catch((error) => this.markStatusSyncFailed(project.file.path, "project", error));
    });
  }
  syncTaskStatuses(tasks) {
    tasks.forEach((task) => {
      if (!this.isFrontmatterIndexed(task.file)) return;
      const live = this.fm(task.file) || {};
      if (!this.isDueDerivable(live)) return;
      const raw = String(live.status || "").toLowerCase();
      const derived = taskStatus(live);
      if (raw === derived) return;
      if (raw && !KNOWN_STATUS_VALUES.includes(raw)) return;
      if (derived !== "expired") return;
      if (this.isStatusSyncFailed(task.file.path)) return;
      const patch = { status: derived };
      if (!live.updated) patch.updated = today();
      void this.updateFM(task.file, patch, [], (live2) => String(live2.status || "").toLowerCase() === raw).catch(
        (error) => this.markStatusSyncFailed(task.file.path, "task", error)
      );
    });
  }
  projectStats(project, all, owned) {
    const tasks = owned || all.filter((item) => this.isTaskFile(item.file, item.frontmatter) && projectMatches(item, project));
    const done = tasks.filter((item) => ["done", "completed", "archived"].includes(taskStatus(item))).length;
    const supplied = project.frontmatter.progress;
    const progress = supplied !== void 0 && supplied !== "" ? Math.max(0, Math.min(100, Number(supplied) || 0)) : tasks.length ? Math.round(done / tasks.length * 100) : 0;
    return { total: tasks.length, done, progress, folderPath: this.projectFolderPath(project) };
  }
  projectFolderPath(project) {
    const parent = folderPathOf(project.file);
    return parent && parent !== this.settings.projectFolder && inFolder(parent, this.settings.projectFolder) ? parent : "";
  }
  async ensureProjectFolder(project) {
    if (project.folderPath) return project.folderPath;
    const parent = folderPathOf(project.file);
    if (parent !== this.settings.projectFolder) return "";
    const folder = await this.uniqueFolderPath(
      this.settings.projectFolder,
      project.frontmatter.title || nameOf(project.file.path)
    );
    const destination = await this.uniqueFilePath(folder, nameOf(project.file.path));
    await this.app.vault.rename(project.file, destination);
    new obsidian9.Notice("已将旧版项目文档迁移到项目文件夹。");
    return folder;
  }
  getMilestones(project, tasks) {
    const values = normalizeList(project.frontmatter.milestones || project.frontmatter.key_nodes);
    tasks.forEach((task) => {
      const value = String(task.frontmatter.milestone || "").trim();
      if (value && !values.includes(value)) values.push(value);
    });
    return values.length ? Array.from(new Set(values)) : ["未分组"];
  }
  async ensureFolder(path) {
    const parts = obsidian9.normalizePath(path).replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? current + "/" + part : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async uniqueFolderPath(folder, title) {
    await this.ensureFolder(folder);
    const clean = cleanName(title);
    let path = obsidian9.normalizePath(folder + "/" + clean);
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = obsidian9.normalizePath(folder + "/" + clean + " " + n);
      n++;
    }
    return path;
  }
  async uniqueFilePath(folder, title, ignorePath) {
    await this.ensureFolder(folder);
    const clean = cleanName(title);
    let path = obsidian9.normalizePath(folder + "/" + clean + ".md");
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path) && path !== ignorePath) {
      path = obsidian9.normalizePath(folder + "/" + clean + " " + n + ".md");
      n++;
    }
    return path;
  }
  /** 素材文件的唯一路径：保留原扩展名，重名时加序号；同时检查磁盘（OneDrive 占位文件 vault 索引可能拿不到） */
  async pathExists(path) {
    if (this.app.vault.getAbstractFileByPath(path)) return true;
    const adapter = this.app.vault.adapter;
    return Boolean(adapter && typeof adapter.exists === "function" && await adapter.exists(path));
  }
  async uniqueBinaryPath(folder, fileName) {
    await this.ensureFolder(folder);
    const raw = String(fileName || "banner.png").replace(/\\/g, "/").split("/").pop() || "banner.png";
    const dot = raw.lastIndexOf(".");
    const base = cleanName(dot > 0 ? raw.slice(0, dot) : raw);
    const extension = dot > 0 ? raw.slice(dot).toLowerCase() : ".png";
    let path = obsidian9.normalizePath(folder + "/" + base + extension);
    let n = 2;
    while (await this.pathExists(path)) {
      path = obsidian9.normalizePath(folder + "/" + base + " " + n + extension);
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
      this.settings.archiveFolder
    ])
      await this.ensureFolder(folder);
    new obsidian9.Notice("已初始化个人规划目录结构。");
    this.refreshViews();
  }
  async createProject(values) {
    if (!values.title.trim()) throw expectedError("项目名称不能为空");
    const folderPath = await this.uniqueFolderPath(this.settings.projectFolder, values.title);
    await this.ensureFolder(folderPath);
    const fileName = nameOf(folderPath);
    const projectPath = obsidian9.normalizePath(folderPath + "/" + fileName + ".md");
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
          created: today()
        },
        "## 项目推演\n\n### 关键节点\n\n- 未分组\n\n### 阻塞项\n\n- \n"
      )
    );
    new obsidian9.Notice("已创建项目文件夹和项目文档：" + folderPath);
    this.refreshViews();
  }
  /** 在资源目录里新建一条笔记：知识 / 图书 / 领域 / 人物。
   *  只写最少 frontmatter + 一个写作骨架，正文留给用户 —— 资源页以前只能"看"，建条目得回 Obsidian 手动建。 */
  newResource(kind, presetTitle) {
    const specs = {
      knowledge: {
        folder: this.settings.knowledgeFolder,
        label: "新建知识笔记",
        titleLabel: "知识点名称",
        placeholder: "例如：如何做周复盘",
        extra: () => ({ type: "knowledge" }),
        body: "## 结论\n\n## 适用场景\n\n## 来源\n"
      },
      book: {
        folder: this.settings.bookFolder,
        label: "新建图书",
        titleLabel: "书名",
        placeholder: "例如：深度工作",
        extra: () => ({ type: "book", status: "reading", started: today() }),
        body: "## 为什么读\n\n## 摘录\n\n## 行动\n"
      },
      area: {
        folder: this.settings.areaFolder,
        label: "新建长期领域",
        titleLabel: "领域名称",
        placeholder: "例如：健康 / 财富 / 关系",
        extra: () => ({ type: "area" }),
        body: "## 这个领域对我意味着什么\n\n## 判断标准\n"
      },
      person: {
        folder: this.settings.peopleFolder,
        label: "新建人物",
        titleLabel: "姓名 / 称呼",
        placeholder: "例如：张三",
        extra: () => ({ type: "person" }),
        body: "## 我为什么关注 TA\n\n## 协作记录\n"
      }
    };
    const spec = specs[String(kind || "")];
    if (!spec) return new obsidian9.Notice("不支持新建的资源类型：" + String(kind || ""));
    if (!spec.folder) return new obsidian9.Notice("还没有配置对应目录，请先在设置里检查目录结构。");
    new FormModal(
      this.app,
      spec.label,
      [{ id: "title", name: spec.titleLabel, value: String(presetTitle || ""), placeholder: spec.placeholder }],
      async (values) => {
        const title = String(values.title || "").trim();
        if (!title) throw expectedError(spec.titleLabel + "不能为空");
        const path = await this.uniqueFilePath(spec.folder, title);
        const patch = Object.assign({ title, created: today() }, spec.extra());
        await this.app.vault.create(path, makeMD(patch, spec.body));
        this.invalidateNoteCache();
        new obsidian9.Notice("已创建：" + path);
        this.refreshViews();
        await this.openFile(this.app.vault.getAbstractFileByPath(path));
      }
    ).open();
  }
  newProject() {
    this.collectData().then((data) => {
      const areaValues = (data.resources && data.resources.areas || []).map((item) => String(item.title || item.path || "")).filter(Boolean).sort();
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
          { id: "weight", name: "项目权重（1-5）", value: 3 }
        ],
        (values) => this.createProject(values)
      ).open();
    }).catch((error) => new obsidian9.Notice("读取数据失败：" + (error.message || error)));
  }
  editMilestone(project, milestone) {
    new FormModal(
      this.app,
      "编辑关键节点",
      [{ id: "name", name: "关键节点名称", value: milestone, placeholder: "例如：完成 MVP" }],
      async (values) => {
        const name = values.name.trim();
        if (!name) throw expectedError("关键节点名称不能为空");
        if (milestone === "未分组") throw expectedError("“未分组”是保底节点，不能改名");
        if (name === milestone) return;
        const data = await this.collectData();
        const projectTasks = data.allTasks.filter((task) => projectMatches(task, project));
        const current = this.getMilestones(project, projectTasks);
        if (current.includes(name)) throw expectedError("已经存在同名关键节点");
        const next = current.map((item) => item === milestone ? name : item);
        for (const task of projectTasks.filter((task2) => (task2.frontmatter.milestone || "未分组") === milestone))
          await this.updateFM(task.file, { milestone: name, updated: today() });
        await this.updateFM(project.file, { milestones: next, updated: today() });
        new obsidian9.Notice("关键节点已改名：" + name);
        this.refreshViews();
      }
    ).open();
  }
  editProject(project) {
    this.collectData().then((data) => {
      const areaValues = (data.resources && data.resources.areas || []).map((item) => String(item.title || item.path || "")).filter(Boolean).sort();
      new FormModal(
        this.app,
        "编辑项目",
        [
          { id: "title", name: "项目名称", value: project.frontmatter.title || nameOf(project.file.path) },
          {
            id: "outcome",
            name: "最终结果（终点画像）",
            type: "textarea",
            value: project.frontmatter.outcome || project.frontmatter.final_outcome || ""
          },
          {
            id: "acceptance",
            name: "验收标准（量化指标）",
            type: "textarea",
            value: project.frontmatter.acceptance || project.frontmatter.acceptance_criteria || ""
          },
          {
            id: "deadline",
            name: "DDL",
            type: "date",
            value: dateOf(project.frontmatter.deadline || project.frontmatter.ddl) || ""
          },
          {
            id: "constraints",
            name: "资金 / 资源约束",
            type: "textarea",
            value: project.frontmatter.resource_constraints || project.frontmatter.constraints || ""
          },
          {
            id: "area",
            name: "所属长期领域",
            type: "datalist",
            options: areaValues,
            value: project.frontmatter.area || ""
          },
          { id: "weight", name: "项目权重（1-5）", value: project.frontmatter.weight || 3 }
        ],
        async (values) => {
          const title = values.title.trim();
          if (!title) throw expectedError("项目名称不能为空");
          const data2 = await this.collectData();
          const projectTasks = data2.allTasks.filter((task) => projectMatches(task, project));
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
            updated: today()
          });
          let newProjectPath = project.file.path;
          if (oldFolder && title !== oldTitle) {
            let newFolder = obsidian9.normalizePath(this.settings.projectFolder + "/" + cleanName(title));
            if (newFolder !== oldFolder && this.app.vault.getAbstractFileByPath(newFolder))
              newFolder = await this.uniqueFolderPath(this.settings.projectFolder, title);
            const folderRef = this.app.vault.getAbstractFileByPath(oldFolder);
            if (!(folderRef instanceof obsidian9.TFolder)) throw new Error("项目文件夹不存在，无法重命名");
            await this.app.vault.rename(folderRef, newFolder);
            const target = obsidian9.normalizePath(newFolder + "/" + cleanName(title) + ".md");
            const newFilePath = this.app.vault.getAbstractFileByPath(target) && target !== project.file.path ? await this.uniqueFilePath(newFolder, cleanName(title), project.file.path) : target;
            if (project.file.path !== newFilePath) await this.app.vault.rename(project.file, newFilePath);
            newProjectPath = newFilePath;
          }
          for (const task of projectTasks)
            await this.updateFM(task.file, { project: newProjectPath, updated: today() });
          new obsidian9.Notice("项目已更新。");
          this.refreshViews();
        }
      ).open();
    }).catch((error) => new obsidian9.Notice("读取数据失败：" + (error.message || error)));
  }
  deleteProject(project) {
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
        await this.app.fileManager.trashFile(target);
        new obsidian9.Notice("项目及其文件夹已删除。");
        this.refreshViews();
      }
    ).open();
  }
  newMilestone(project) {
    new FormModal(
      this.app,
      "新建关键节点",
      [{ id: "name", name: "关键节点名称", placeholder: "例如：完成 MVP" }],
      async (values) => {
        const name = values.name.trim();
        if (!name) throw expectedError("关键节点名称不能为空");
        const current = this.getMilestones(project, []);
        if (!current.includes(name)) {
          current.push(name);
          await this.updateFM(project.file, { milestones: current, updated: today() });
        }
        new obsidian9.Notice("已添加关键节点：" + name);
        this.refreshViews();
      }
    ).open();
  }
  deleteMilestone(project, milestone) {
    if (milestone === "未分组") return new obsidian9.Notice("“未分组”是保底节点，不能删除。");
    new ConfirmModal(
      this.app,
      "删除关键节点",
      "删除后，该节点下的任务会自动移动到“未分组”；任务文件不会被删除。",
      "删除并移动任务",
      async () => {
        const data = await this.collectData();
        const projectTasks = data.allTasks.filter((task) => projectMatches(task, project));
        const affected = projectTasks.filter((task) => (task.frontmatter.milestone || "未分组") === milestone);
        for (const task of affected) await this.updateFM(task.file, { milestone: "未分组", updated: today() });
        const current = this.getMilestones(project, projectTasks);
        const remaining = current.filter((item) => item !== milestone);
        if (!remaining.includes("未分组")) remaining.unshift("未分组");
        await this.updateFM(project.file, { milestones: remaining, updated: today() });
        new obsidian9.Notice("关键节点已删除，相关任务已移动到“未分组”。");
        this.refreshViews();
      }
    ).open();
  }
  openTaskEditor(project, task, presetMilestone) {
    this.collectData().then((data) => {
      const context = this.taskEditorContext(project, task, presetMilestone, data);
      new FormModal(
        this.app,
        task ? "编辑任务" : "新建任务",
        this.taskEditorFields(context, task),
        (values) => this.taskEditorSubmit(context, task, values)
      ).open();
    }).catch((error) => new obsidian9.Notice("读取项目失败：" + (error.message || error)));
  }
  /** 表单上下文：项目 / 节点候选，以及『换项目就重建节点下拉』的联动（原 openTaskEditor 前半段，逻辑未改） */
  taskEditorContext(project, task, presetMilestone, data) {
    const projectFromPath = typeof project === "string" && project ? data.projects.find((item) => item.file.path === project) || null : null;
    const projectRef = projectFromPath || (project && typeof project === "object" ? project : null);
    const existingProject = task ? this.findProject(task, data.projects) : projectRef;
    const projectOptions = { "": "不关联项目" };
    data.projects.forEach(
      (item) => projectOptions[item.file.path] = item.frontmatter.title || nameOf(item.file.path)
    );
    const selectedProject = existingProject || projectRef;
    const selectedTasks = selectedProject ? data.allTasks.filter((item) => projectMatches(item, selectedProject)) : [];
    const preset = String(presetMilestone || "").trim();
    const milestoneSource = selectedProject ? this.getMilestones(selectedProject, selectedTasks) : ["未分组"];
    if (preset && !milestoneSource.includes(preset)) milestoneSource.push(preset);
    const milestoneOptions = Object.fromEntries(milestoneSource.map((item) => [item, item]));
    const knownTaskSetValues = Array.from(
      new Set(
        data.allTasks.map((item) => String(item.frontmatter.task_set || item.frontmatter.taskSet || "").trim()).filter(Boolean)
      )
    ).sort();
    const knownTaskGroupValues = Array.from(
      new Set(
        data.allTasks.map((item) => String(item.frontmatter.task_group || item.frontmatter.taskGroup || "").trim()).filter(Boolean)
      )
    ).sort();
    const syncMilestoneControl = (value, form, preferred) => {
      const nextProject = value ? data.projects.find((item) => item.file.path === value) || null : null;
      const names = nextProject ? this.getMilestones(
        nextProject,
        data.allTasks.filter((item) => projectMatches(item, nextProject))
      ) : ["未分组"];
      const control = form && form.controls ? form.controls.milestone : null;
      if (!control) return;
      const previous = preferred || control.getValue();
      if (control.selectEl && typeof control.selectEl.empty === "function") control.selectEl.empty();
      control.addOptions(Object.fromEntries(names.map((name) => [name, name])));
      control.setValue(names.includes(previous) ? previous : names[0] || "未分组");
    };
    const currentStatus = task ? taskStatus(task) : "planning";
    const statusOptions = {
      planning: "规划中",
      todo: "待办",
      doing: "执行中",
      blocked: "阻塞",
      paused: "暂停",
      completed: "已完成"
    };
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
      syncMilestoneControl
    };
  }
  /** 表单字段表（原来内联在 openTaskEditor 里，逻辑未改） */
  taskEditorFields(context, task) {
    var _a;
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
      syncMilestoneControl
    } = context;
    return [
      {
        id: "title",
        name: "任务内容",
        placeholder: "一个可执行的下一步",
        value: task ? task.frontmatter.title || nameOf(task.file.path) : ""
      },
      {
        id: "project",
        name: "所属项目",
        type: "select",
        options: projectOptions,
        value: selectedProject ? selectedProject.file.path : "",
        /* 用户在表单里改项目 → 立刻重建节点下拉（原节点若在新项目里也有同名节点则保留） */
        onChange: (value, form) => syncMilestoneControl(value, form, preset)
      },
      {
        id: "milestone",
        name: "所属关键节点",
        type: "select",
        options: milestoneOptions,
        value: preset || (task == null ? void 0 : task.frontmatter.milestone) || milestoneSource[0] || "未分组"
      },
      {
        id: "taskSet",
        name: "任务集",
        type: "datalist",
        options: knownTaskSetValues,
        placeholder: "例如：本周维护",
        value: (task == null ? void 0 : task.frontmatter.task_set) || (task == null ? void 0 : task.frontmatter.taskSet) || ""
      },
      {
        id: "taskGroup",
        name: "任务组",
        type: "datalist",
        options: knownTaskGroupValues,
        placeholder: "例如：资料整理",
        value: (task == null ? void 0 : task.frontmatter.task_group) || (task == null ? void 0 : task.frontmatter.taskGroup) || ""
      },
      {
        id: "recurrence",
        name: "重复周期",
        type: "select",
        options: { none: "不重复", daily: "每天", weekly: "每周", monthly: "每月" },
        value: (task == null ? void 0 : task.frontmatter.recurrence) || "none"
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
        value: recurrenceWeekdaysOf(task == null ? void 0 : task.frontmatter).length ? recurrenceWeekdaysOf(task == null ? void 0 : task.frontmatter) : [isoWeekday(recurrenceAnchorOf(task == null ? void 0 : task.frontmatter))],
        showWhen: { key: "recurrence", in: ["weekly"] }
      },
      {
        id: "recurrenceMonthday",
        name: "每月几号",
        desc: "29/30/31 号遇到没有这一天的月份，顺延到当月最后一天",
        type: "select",
        options: MONTHDAY_SELECT,
        value: String(
          recurrenceMonthDayOf(task == null ? void 0 : task.frontmatter) || Number(recurrenceAnchorOf(task == null ? void 0 : task.frontmatter).slice(8, 10)) || 1
        ),
        showWhen: { key: "recurrence", in: ["monthly"] }
      },
      {
        id: "assignee",
        name: "执行者 / 角色",
        type: "select",
        options: buildAssigneeOptions(((_a = data.resources) == null ? void 0 : _a.people) || [], (task == null ? void 0 : task.frontmatter.assignee) || ""),
        value: (task == null ? void 0 : task.frontmatter.assignee) || ""
      },
      {
        id: "knowledgeRefs",
        name: "知识引用",
        placeholder: "笔记路径，多项用逗号分隔",
        value: normalizeList(task == null ? void 0 : task.frontmatter.knowledge_refs).join(", ")
      },
      {
        id: "due",
        name: "DDL",
        desc: "这一次的截止日",
        type: "date",
        value: dateOf((task == null ? void 0 : task.frontmatter.due) || (task == null ? void 0 : task.frontmatter.deadline)) || "",
        showWhen: { key: "recurrence", in: ["none", ""] }
      },
      {
        /* 重复任务的 DDL = 整段序列的结束日（参考谷歌日历的「结束时间：于某日」）。
           留空 = 永不结束；到时归档最后一条时不再生成下一条。 */
        id: "recurrenceUntil",
        name: "重复结束（DDL）",
        desc: "重复到这一天为止；留空 = 永不结束",
        type: "date",
        value: recurrenceUntilOf(task == null ? void 0 : task.frontmatter),
        showWhen: { key: "recurrence", in: ["daily", "weekly", "monthly"] }
      },
      {
        id: "duration",
        name: "预计耗时（分钟）",
        value: (task == null ? void 0 : task.frontmatter.duration) || this.settings.defaultTaskDuration
      },
      {
        id: "priority",
        name: "优先级",
        type: "select",
        options: { high: "高", medium: "中", low: "低" },
        value: (task == null ? void 0 : task.frontmatter.priority) || "medium"
      },
      {
        id: "type",
        name: "任务类型",
        type: "select",
        options: { task: "普通任务", "knowledge-gap": "知识缺口 / 学习计划" },
        value: (task == null ? void 0 : task.frontmatter.type) || "task"
      },
      { id: "status", name: "执行状态", type: "select", options: statusOptions, value: currentStatus }
    ];
  }
  /** 表单提交（原来内联在 openTaskEditor 里，逻辑未改） */
  async taskEditorSubmit(context, task, values) {
    var _a, _b;
    const { data, selectedProject } = context;
    if (!values.title.trim()) throw expectedError("任务内容不能为空");
    const selected = data.projects.find((item) => item.file.path === values.project) || (values.project ? null : null);
    const targetProject = selected || (values.project ? selectedProject : null);
    const folder = targetProject ? targetProject.folderPath || await this.ensureProjectFolder(targetProject) || this.settings.taskFolder : this.settings.taskFolder;
    const recurrence = String(values.recurrence || "none").toLowerCase();
    const isRecurring = recurrence !== "none" && recurrence !== "";
    const pattern = {
      weekdays: recurrence === "weekly" ? normalizeWeekdays(values.recurrenceWeekdays) : [],
      monthday: recurrence === "monthly" ? normalizeMonthDay(values.recurrenceMonthday) : 0
    };
    const until = isRecurring ? dateOf(values.recurrenceUntil) || "" : "";
    const previousRecurrence = String(((_a = task == null ? void 0 : task.frontmatter) == null ? void 0 : _a.recurrence) || "none").toLowerCase();
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
    let completionLog = "";
    let completionEnded = false;
    let completionPrevious = null;
    if (isRecurring && ["done", "completed"].includes(String(nextStatus).toLowerCase())) {
      const outcome = this.recurringCompletionOutcome({
        recurrence,
        due,
        recurrence_weekdays: pattern.weekdays,
        recurrence_monthday: pattern.monthday,
        recurrence_until: until
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
          due,
          status: String(((_b = task == null ? void 0 : task.frontmatter) == null ? void 0 : _b.status) || "")
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
      updated: today()
    };
    const removeKeys = [];
    if (pattern.weekdays.length) patch.recurrence_weekdays = pattern.weekdays;
    else removeKeys.push("recurrence_weekdays");
    if (pattern.monthday) patch.recurrence_monthday = pattern.monthday;
    else removeKeys.push("recurrence_monthday");
    if (until) patch.recurrence_until = until;
    else removeKeys.push("recurrence_until");
    if (task) {
      const originPath = task.file.path;
      const destination = await this.uniqueFilePath(folder, values.title, originPath);
      const moved = destination !== originPath ? await this.app.vault.rename(task.file, destination) : task.file;
      try {
        await this.updateFM(moved, patch, removeKeys);
      } catch (error) {
        if (destination !== originPath) await this.app.vault.rename(moved, originPath).catch(() => {
        });
        throw error;
      }
      if (completionLog) {
        const entry = await this.appendTaskLog(moved, completionLog).catch(() => "");
        this.lastRecurringCompletion = completionPrevious ? {
          path: moved.path,
          title: values.title.trim(),
          due: completionPrevious.due,
          status: completionPrevious.status,
          logLine: entry || ""
        } : null;
      }
      new obsidian9.Notice(
        "任务已更新：" + values.title + (completionEnded ? "。重复已结束，未标「已完成」，可归档收尾。" : "")
      );
    } else {
      const path = await this.uniqueFilePath(folder, values.title);
      await this.app.vault.create(
        path,
        makeMD(
          Object.assign({}, patch, { created: today() }),
          "## 任务拆解\n\n- [ ] \n\n## 执行记录\n\n## 验收标准\n\n- \n\n## 阻塞项\n\n- \n"
        )
      );
      if (completionLog) {
        const entry = await this.appendTaskLog(this.app.vault.getAbstractFileByPath(path), completionLog).catch(
          () => ""
        );
        if (completionPrevious) {
          this.lastRecurringCompletion = {
            path,
            title: values.title.trim(),
            due: completionPrevious.due,
            status: completionPrevious.status,
            logLine: entry || ""
          };
        }
      }
      new obsidian9.Notice("已创建任务：" + values.title);
    }
    this.refreshViews();
  }
  newTask(project, presetMilestone) {
    this.openTaskEditor(project, void 0, presetMilestone);
  }
  editTask(task, project) {
    this.openTaskEditor(project, task);
  }
  deleteFile(file, label = "文件") {
    new ConfirmModal(this.app, "删除" + label, label + "文件将被删除。" + DELETE_HINT, "删除", async () => {
      if (!file || !file.path || !this.app.vault.getAbstractFileByPath(file.path))
        throw new Error(label + "文件已经不存在，请刷新后重试。");
      await this.app.fileManager.trashFile(file);
      new obsidian9.Notice(label + "已删除。");
      this.refreshViews();
    }).open();
  }
  deleteTask(task) {
    new ConfirmModal(this.app, "删除任务", "任务文件将被删除。" + DELETE_HINT, "删除任务", async () => {
      if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
        throw new Error("任务文件已经不存在，请刷新后重试。");
      await this.app.fileManager.trashFile(task.file);
      new obsidian9.Notice("任务已删除。");
      this.refreshViews();
    }).open();
  }
  /** 归档前把会被覆盖的字段快照成 archived_prev_*（撤销归档 / 移动失败回滚靠它还原） */
  archivedSnapshot(frontmatter) {
    const patch = {};
    ARCHIVED_OVERWRITTEN_KEYS.forEach((key) => {
      const value = frontmatter ? frontmatter[key] : void 0;
      if (value !== void 0 && value !== null && value !== "") patch["archived_prev_" + key] = value;
    });
    return patch;
  }
  /** 还原计划：status / completed 回到快照值（没有快照的旧归档保持旧行为），并清掉全部归档痕迹。
   *  注意 patch 与 remove 不得有交集 —— processFrontMatter 是「先 assign 再 delete」，writeFM 是「先删再写」，
   *  同一个 key 同时出现在两边会导致两条路径结果相反。 */
  archivedRestorePlan(frontmatter) {
    const fm = frontmatter || {};
    const patch = {};
    const remove = ["archived", "archived_from", "archived_to"];
    const storedStatus = fm.archived_prev_status;
    if (storedStatus !== void 0 && storedStatus !== null && storedStatus !== "") patch.status = storedStatus;
    const storedCompleted = fm.archived_prev_completed;
    if (storedCompleted !== void 0 && storedCompleted !== null && storedCompleted !== "")
      patch.completed = storedCompleted;
    else remove.push("completed");
    ARCHIVED_OVERWRITTEN_KEYS.forEach((key) => remove.push("archived_prev_" + key));
    return { patch, remove: remove.filter((key) => !(key in patch)) };
  }
  /** 写 frontmatter。CRLF 笔记走自己的行级补丁（writeFM）：
   *  Obsidian 的 processFrontMatter 会用 \n 重新序列化整个 frontmatter 段，Windows 用户的笔记会变成
   *  "上半段 LF、下半段 CRLF"，在 diff / 版本历史里看起来整篇都改了。纯 LF 笔记仍走官方 API（YAML 处理更稳）。
   *  guard：可选断言，拿"写入那一刻"的 frontmatter 判定 —— 用来放弃会覆盖用户刚做修改的后台回写。 */
  async updateFM(file, patch, removeKeys = [], guard) {
    if (!(file instanceof obsidian9.TFile)) return;
    const applyPatch = (frontmatter) => {
      if (guard && !guard(frontmatter)) return false;
      Object.assign(frontmatter, patch);
      removeKeys.forEach((key) => delete frontmatter[key]);
      return true;
    };
    let usesCrlf = false;
    try {
      const raw = this.app.vault.cachedRead ? await this.app.vault.cachedRead(file) : "";
      usesCrlf = typeof raw === "string" && raw.indexOf("\r\n") >= 0;
    } catch (error) {
      usesCrlf = false;
    }
    if (!usesCrlf && this.app.fileManager && this.app.fileManager.processFrontMatter) {
      await this.app.fileManager.processFrontMatter(file, applyPatch);
      return;
    }
    if (this.app.vault.process) {
      await this.app.vault.process(file, (content) => {
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
  projectStatus(file) {
    new ChoiceModal(
      this.app,
      "更新项目状态",
      "状态会写回项目笔记的 frontmatter。",
      [
        { id: "active", label: "进行中", description: "进入执行状态" },
        { id: "blocked", label: "阻塞", description: "保留阻塞原因并回到项目推演" },
        { id: "paused", label: "暂停", description: "暂时停止执行" },
        { id: "completed", label: "已完成", description: "通过验收后再归档" }
      ],
      async (status) => {
        await this.updateFM(file, { status, updated: today() });
        new obsidian9.Notice("项目状态已更新：" + statusLabel(status));
        this.refreshViews();
      }
    ).open();
  }
  /** 把选中的草稿移动成任务集条目：先移动、后写 frontmatter；单条失败只影响它自己，并把文件搬回原位。
   *  命令面板的周维护导入与 Web 端的「导入为任务集」共用这一份实现。 */
  async importDraftsAsTaskSet(paths, taskSet, taskGroup) {
    const data = await this.collectData();
    const selected = selectInboxItems(data.inbox, paths);
    if (!selected.length) return new obsidian9.Notice("没有选择有效草稿。");
    const set = String(taskSet || "").trim() || "本周维护";
    const group = String(taskGroup || "").trim() || "待整理";
    const failures = [];
    const failedPaths = [];
    for (const item of selected) {
      const source = item.file.path;
      const destination = await this.uniqueFilePath(this.settings.taskFolder, nameOf(source));
      let moved;
      try {
        moved = destination === source ? item.file : await this.app.vault.rename(item.file, destination);
      } catch (error) {
        failures.push(nameOf(source) + "（移动失败）");
        failedPaths.push(source);
        console.error("[personal-planning-dashboard] import move failed", error);
        continue;
      }
      try {
        await this.updateFM(moved, Object.assign({}, taskImportPatch(set, group), { updated: today() }));
      } catch (error) {
        if (destination !== source) await this.app.vault.rename(moved, source).catch(() => {
        });
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
      failures
    );
    if (failures.length)
      new obsidian9.Notice(
        "已导入 " + (selected.length - failures.length) + " / " + selected.length + " 条，失败 " + failures.length + " 条：" + failures.join("、")
      );
    else new obsidian9.Notice("已导入 " + selected.length + " 条草稿到任务集：" + set + " / " + group);
    this.refreshViews();
    return { imported: selected.length - failures.length, failures, taskSet: set, taskGroup: group };
  }
  async importInboxAsTaskSet(file) {
    const data = await this.collectData();
    if (!data.inbox.length) return new obsidian9.Notice("草稿箱为空。");
    const importSelected = (paths) => {
      const selected = selectInboxItems(data.inbox, paths);
      if (!selected.length) return new obsidian9.Notice("没有选择有效草稿。");
      new FormModal(
        this.app,
        "周维护：导入草稿为任务集",
        [
          { id: "taskSet", name: "任务集", value: "本周维护", placeholder: "例如：本周维护" },
          { id: "taskGroup", name: "任务组", value: "待整理", placeholder: "例如：资料整理" }
        ],
        async (values) => {
          await this.importDraftsAsTaskSet(paths, values.taskSet, values.taskGroup);
        }
      ).open();
    };
    if (file) return importSelected([file.path]);
    const choices = data.inbox.map((item) => ({
      id: item.file.path,
      label: item.frontmatter.title || nameOf(item.file.path),
      description: item.file.path
    }));
    new MultiChoiceModal(
      this.app,
      "周维护：选择要导入的草稿",
      "可多选草稿；选中后统一指定任务集和任务组。",
      choices,
      importSelected
    ).open();
  }
  triageInbox() {
    this.collectData().then((data) => {
      if (!data.inbox.length) return new obsidian9.Notice("草稿箱为空。");
      this.openTriage(data.inbox[0].file);
    });
  }
  openTriage(file) {
    if (!file || !file.path || !this.app.vault.getAbstractFileByPath(file.path))
      return new obsidian9.Notice("草稿已经不存在，请刷新草稿箱后重试。");
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
        { id: "archive", label: "丢弃 / 归档", description: "移动到归档库并标记 archived" }
      ],
      async (target) => {
        const folders = {
          project: this.settings.projectFolder,
          task: this.settings.taskFolder,
          knowledge: this.settings.knowledgeFolder,
          area: this.settings.areaFolder,
          people: this.settings.peopleFolder,
          archive: this.settings.archiveFolder
        };
        const types = {
          project: "project",
          task: "task",
          knowledge: "knowledge",
          area: "area",
          people: "person",
          archive: "note"
        };
        const statuses = { project: "planning", task: "todo", archive: "archived" };
        const source = file.path;
        const destination = await this.uniqueFilePath(folders[target], nameOf(source));
        const patch = Object.assign(
          {
            type: types[target],
            stage: target === "archive" ? "archived" : target,
            status: statuses[target] || "active",
            updated: today()
          },
          target === "archive" ? { archived_from: source, archived_to: folders[target] } : {}
        );
        let moved;
        try {
          moved = destination === source ? file : await this.app.vault.rename(file, destination);
        } catch (error) {
          console.error("[personal-planning-dashboard] triage move failed", error);
          return new obsidian9.Notice("移动失败，草稿未做任何修改：" + (error && error.message || error));
        }
        try {
          await this.updateFM(moved, patch);
        } catch (error) {
          if (destination !== source) await this.app.vault.rename(moved, source).catch(() => {
          });
          throw error;
        }
        new obsidian9.Notice("已移动到：" + folders[target]);
        this.refreshViews();
        if (target !== "archive") await this.openFile(moved);
      }
    ).open();
  }
  findProject(task, projects) {
    return pickProject(task && task.file ? task.file.path : "", task && task.frontmatter, projects) || void 0;
  }
  async createNextRecurringTask(task, project) {
    this.lastRecurrenceEnded = null;
    const recurrence = String(task.frontmatter.recurrence || "none").toLowerCase();
    const weekdays = recurrenceWeekdaysOf(task.frontmatter);
    const monthday = recurrenceMonthDayOf(task.frontmatter);
    const until = recurrenceUntilOf(task.frontmatter);
    const title = task.frontmatter.title || nameOf(task.file.path);
    if (isCompletedTask(task)) {
      this.lastRecurrenceEnded = { title, until, reason: "completed" };
      return null;
    }
    const nextDue = nextRecurringDate(task.frontmatter.due || task.frontmatter.deadline, recurrence, {
      weekdays,
      monthday
    });
    if (!nextDue) return null;
    if (until && nextDue > until) {
      this.lastRecurrenceEnded = { title, until, nextDue };
      return null;
    }
    const selectedProject = project || null;
    const folder = selectedProject ? selectedProject.folderPath || await this.ensureProjectFolder(selectedProject) : this.settings.taskFolder;
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
      created: today()
    };
    if (weekdays.length) patch.recurrence_weekdays = weekdays;
    if (monthday) patch.recurrence_monthday = monthday;
    if (until) patch.recurrence_until = until;
    await this.app.vault.create(
      destination,
      makeMD(patch, "## 任务拆解\n\n- [ ] \n\n## 执行记录\n\n## 验收标准\n\n- \n\n## 阻塞项\n\n- \n")
    );
    return destination;
  }
  /**
   * 往正文「## 执行记录」小节末尾追加一行，返回写进去的那一行（撤销时按它精确删除）。
   * 保留原文换行风格（CRLF 笔记不会被塞进裸 LF），没有这一节就补一个。
   */
  async appendTaskLog(file, line) {
    if (!file || !this.app.vault.process) return "";
    const entry = "- " + today() + " " + line;
    await this.updateBody(file, (body) => {
      const source = String(body || "");
      const eol = pickEol(source, "\n");
      const heading = /^##[ \t]*执行记录[ \t]*$/m.exec(source);
      if (!heading) return source.replace(/\s*$/, "") + eol + eol + "## 执行记录" + eol + eol + entry + eol;
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
  async removeTaskLog(file, entry) {
    if (!file || !entry || !this.app.vault.process) return;
    await this.updateBody(file, (body) => {
      const source = String(body || "");
      const lines = source.split(/\r?\n/);
      const at = lines.findIndex((line) => line.trim() === entry.trim());
      if (at < 0) return source;
      lines.splice(at, 1);
      if (lines[at] !== void 0 && lines[at].trim() === "" && lines[at - 1] !== void 0 && lines[at - 1].trim() === "")
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
  recurringCompletionOutcome(frontmatter) {
    const recurrence = String(frontmatter && frontmatter.recurrence || "none").toLowerCase();
    const occurrence = dateOf(frontmatter && (frontmatter.due || frontmatter.deadline));
    if (recurrence === "none" || recurrence === "" || !occurrence) return null;
    const weekdays = recurrenceWeekdaysOf(frontmatter);
    const monthday = recurrenceMonthDayOf(frontmatter);
    const until = recurrenceUntilOf(frontmatter);
    let next = nextRecurringDate(occurrence, recurrence, { weekdays, monthday });
    let guard = 0;
    while (next && next < today() && guard < 4e3) {
      next = nextRecurringDate(next, recurrence, { weekdays, monthday });
      guard += 1;
    }
    if (!next || until && next > until) return { ended: true, until, occurrence };
    return {
      ended: false,
      occurrence,
      due: next,
      status: taskStatus({ frontmatter: { status: "", due: next } }),
      log: "本周期完成（原 " + occurrence + "）→ 下一次 " + next
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
  async advanceRecurringCycle(task) {
    const frontmatter = this.fm(task.file) || task.frontmatter || {};
    const outcome = this.recurringCompletionOutcome(frontmatter);
    if (!outcome) return false;
    const title = frontmatter.title || nameOf(task.file.path);
    if (outcome.ended) {
      this.lastRecurringCompletion = null;
      new obsidian9.Notice(
        "「" + title + "」的重复已经走完（重复到 " + (outcome.until || "—") + " 为止），不再有下一个周期。可归档收尾。"
      );
      return true;
    }
    const previous = {
      path: task.file.path,
      title,
      due: dateOf(frontmatter.due || frontmatter.deadline) || "",
      status: String(frontmatter.status || ""),
      logLine: ""
    };
    await this.updateFM(task.file, { due: outcome.due, status: outcome.status, updated: today() });
    previous.logLine = await this.appendTaskLog(task.file, outcome.log);
    this.lastRecurringCompletion = previous;
    new obsidian9.Notice(
      "本周期已完成，下一次：" + outcome.due + "（" + weekdayLabel(isoWeekday(outcome.due)) + "）。可撤销。"
    );
    this.scheduleRefreshViews();
    return true;
  }
  /** 撤销上一次「本周期完成」：执行日与状态回到点击之前，刚写进去的执行记录也删掉。
   *  只保留最近一次（这是"点错了立刻撤回"，不是历史回滚），插件重载后不再可用。 */
  async undoRecurringCompletion(path) {
    const snapshot = this.lastRecurringCompletion;
    if (!snapshot) return new obsidian9.Notice("没有可撤销的「本周期完成」。");
    if (path && String(path) !== snapshot.path) return new obsidian9.Notice("最近一次周期完成不是这条任务，无法撤销。");
    const file = this.app.vault.getAbstractFileByPath(snapshot.path);
    if (!file) {
      this.lastRecurringCompletion = null;
      return new obsidian9.Notice("这条任务的笔记已经不在了，撤销已放弃。");
    }
    const patch = { updated: today() };
    const removeKeys = [];
    if (snapshot.due) patch.due = snapshot.due;
    else removeKeys.push("due");
    if (snapshot.status) patch.status = snapshot.status;
    else removeKeys.push("status");
    await this.updateFM(file, patch, removeKeys);
    if (snapshot.logLine) await this.removeTaskLog(file, snapshot.logLine);
    this.lastRecurringCompletion = null;
    new obsidian9.Notice(
      "已撤销：「" + snapshot.title + "」回到 " + (snapshot.due || "无 DDL") + "（" + statusLabel(taskStatus({ frontmatter: { status: snapshot.status, due: snapshot.due } })) + "）"
    );
    this.scheduleRefreshViews();
  }
  /** 任务状态四选一：规划中 / 待办 / 完成 / 阻塞。
   *  阻塞是"任务的状态"，项目卡片红点与关键节点标红都由它推导 —— 不再有独立的阻塞项清单。
   *  只改 status 与 updated，不碰用户其它字段；写完立刻刷新视图。
   *  重复任务例外：点「完成」= 本周期完成 → 原地滚到下一周期，永不写 done（见 advanceRecurringCycle）。 */
  async setTaskStatus(task, status) {
    if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
      return new obsidian9.Notice("任务文件已经不存在，请刷新后重试。");
    const allowed = { planning: "规划中", todo: "待办", done: "完成", blocked: "阻塞" };
    const next = Object.prototype.hasOwnProperty.call(allowed, String(status)) ? String(status) : "";
    if (!next) return new obsidian9.Notice("不支持的任务状态：" + String(status || ""));
    const current = String((this.fm(task.file) || {}).status || "").toLowerCase();
    if (current === next) return;
    if (next === "done" && await this.advanceRecurringCycle(task)) return;
    await this.updateFM(task.file, { status: next, updated: today() });
    this.invalidateNoteCache(task.file);
    new obsidian9.Notice("任务状态已改为「" + allowed[next] + "」");
    this.scheduleRefreshViews();
  }
  /** 记住最近一次批量操作的失败条目：通知会消失，但"哪几条没成功"应当留在界面上可以重试。
   *  kind / action / payload 一起存下来，渲染层就能原样重发一次。 */
  recordBulkFailures(kind, action, payload, failedPaths, messages) {
    const paths = (failedPaths || []).map(String).filter(Boolean);
    this.lastBulkFailures = paths.length ? {
      kind: String(kind || "批量操作"),
      action: String(action || ""),
      payload: payload || {},
      paths,
      messages: (messages || []).slice(0, 8),
      at: today()
    } : null;
    return this.lastBulkFailures;
  }
  /** 渲染层点「知道了」：清掉失败条 */
  clearBulkFailures() {
    this.lastBulkFailures = null;
    this.refreshViews();
  }
  /** 数据页签的批量移动：**只移动文件位置**，不改 type / status / 正文 ——
  *  改语义（比如"这其实是个任务"）属于分诊，应当在草稿箱里显式选，不能靠搬文件顺带改。
  *  整个批只弹一次确认；逐条独立，重名自动加序号，失败不影响其它条。 */
  async bulkMoveNotes(paths, target) {
    const folders = {
      archive: { path: this.settings.archiveFolder, label: "归档库" },
      knowledge: { path: this.settings.knowledgeFolder, label: "知识库" },
      task: { path: this.settings.taskFolder, label: "日程待办" },
      inbox: { path: this.settings.inboxFolder, label: "草稿箱" },
      area: { path: this.settings.areaFolder, label: "长期领域" },
      people: { path: this.settings.peopleFolder, label: "人物库" }
    };
    const targetFolder = folders[String(target || "")];
    if (!targetFolder || !targetFolder.path) return new obsidian9.Notice("不支持移动到的目标：" + String(target || ""));
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian9.Notice("请先勾选要移动的条目。");
    const movable = wanted.filter((path) => !inFolder(path, targetFolder.path));
    if (!movable.length) return new obsidian9.Notice("选中的条目都已经在" + targetFolder.label + "里了。");
    const preview = movable.slice(0, 5).map((path) => nameOf(path)).join("、") + (movable.length > 5 ? " 等 " + movable.length + " 条" : "");
    new ConfirmModal(
      this.app,
      "批量移动到" + targetFolder.label,
      "把 " + movable.length + " 条笔记移动到「" + targetFolder.path + "」：" + preview + "。只移动文件位置，不会改 type / status，也不会动正文。",
      "移动",
      async () => {
        const failures = [];
        const failedPaths = [];
        let done = 0;
        for (const path of movable) {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof obsidian9.TFile)) {
            failures.push(nameOf(path) + "（文件不存在）");
            failedPaths.push(path);
            continue;
          }
          try {
            const destination = await this.uniqueFilePath(targetFolder.path, nameOf(path), path);
            if (destination !== path) await this.app.vault.rename(file, destination);
            this.invalidateNoteCache(file);
            done += 1;
          } catch (error) {
            failures.push(nameOf(path) + "（" + (error && error.message || "移动失败") + "）");
            failedPaths.push(path);
            console.error("[personal-planning-dashboard] bulk move failed", path, error);
          }
        }
        this.recordBulkFailures(
          "移动到" + targetFolder.label,
          "bulk-move-notes",
          { paths: failedPaths, target },
          failedPaths,
          failures
        );
        if (failures.length)
          new obsidian9.Notice(
            "已移动 " + done + " / " + movable.length + " 条到" + targetFolder.label + "，失败 " + failures.length + " 条：" + failures.slice(0, 6).join("、")
          );
        else new obsidian9.Notice("已移动 " + done + " 条笔记到" + targetFolder.label + "。");
        this.refreshViews();
      }
    ).open();
  }
  /** 项目页签的批量改状态：只改 status / updated，不移动任何文件（归档与否是另一件事）。 */
  async bulkSetProjectStatus(paths, status) {
    const allowed = { active: "进行中", blocked: "阻塞", paused: "暂停", completed: "已完成" };
    const next = Object.prototype.hasOwnProperty.call(allowed, String(status)) ? String(status) : "";
    if (!next) return new obsidian9.Notice("不支持的项目状态：" + String(status || ""));
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian9.Notice("请先勾选要修改的项目。");
    const failures = [];
    const failedPaths = [];
    let done = 0;
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian9.TFile)) {
        failures.push(path + "（文件不存在）");
        continue;
      }
      const frontmatter = this.fm(file) || {};
      if (String(frontmatter.type || "").toLowerCase() !== "project") {
        failures.push(nameOf(path) + "（不是项目）");
        failedPaths.push(path);
        continue;
      }
      if (String(frontmatter.status || "").toLowerCase() === next) continue;
      try {
        await this.updateFM(file, { status: next, updated: today() });
        this.invalidateNoteCache(file);
        done += 1;
      } catch (error) {
        failures.push(nameOf(path) + "（" + (error && error.message || "写入失败") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk set project status failed", path, error);
      }
    }
    this.recordBulkFailures(
      "批量改项目状态",
      "bulk-set-project-status",
      { paths: failedPaths, status: next },
      failedPaths,
      failures
    );
    if (failures.length)
      new obsidian9.Notice(
        "已更新 " + done + " / " + wanted.length + " 个项目为「" + allowed[next] + "」，跳过或失败 " + failures.length + " 条：" + failures.slice(0, 6).join("、")
      );
    else new obsidian9.Notice("已把 " + done + " 个项目设为「" + allowed[next] + "」。");
    this.refreshViews();
    return { done, failures };
  }
  /** 任务页签的批量改字段（状态 / 项目 / 关键节点）：逐条独立，值没变的跳过不算失败，最后统一汇报。 */
  async bulkSetTaskFields(paths, patch) {
    const entries = Object.entries(patch || {}).filter(
      ([, value]) => value !== void 0 && value !== null && String(value).trim() !== ""
    );
    if (!entries.length) return new obsidian9.Notice("没有要修改的内容。");
    const allowed = {
      status: { key: "status", label: "状态", type: "select", options: ["planning", "todo", "done", "blocked"] }
    };
    (EDITABLE_FIELDS.task || []).forEach((item) => {
      allowed[item.key] = item;
      (item.aliases || []).forEach((alias) => {
        allowed[alias] = item;
      });
    });
    const fields = [];
    for (const [key, value] of entries) {
      const field = allowed[key];
      if (!field) return new obsidian9.Notice("不支持批量修改的字段：" + String(key));
      if (field.key === "status" && !["planning", "todo", "done", "blocked"].includes(String(value))) {
        return new obsidian9.Notice("不支持的任务状态：" + String(value));
      }
      const choices = (field.options || []).map(
        (option) => Array.isArray(option) ? String(option[0]) : String(option)
      );
      if (field.type === "select" && choices.length && !choices.includes(String(value))) {
        return new obsidian9.Notice("不支持的取值：" + String(value));
      }
      fields.push({
        key: field.key,
        value: String(value),
        /* 写入时要用归一后的类型（周几 → 数组、几号 → 数字），所以把字段规格一起带上 */
        spec: field,
        coerced: coerceFieldValue(field, value),
        label: field.label || field.key
      });
    }
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian9.Notice("请先勾选要修改的任务。");
    const failures = [];
    const failedPaths = [];
    let done = 0;
    let endedCount = 0;
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian9.TFile)) {
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
      const next = {};
      let completionLog = "";
      let completionEnded = false;
      fields.forEach((field) => {
        const current = frontmatter[field.key];
        if (String(current === void 0 || current === null ? "" : current) !== field.value) {
          if (field.key === "status" && ["done", "completed"].includes(String(field.coerced).toLowerCase())) {
            const outcome = this.recurringCompletionOutcome(frontmatter);
            if (outcome && outcome.ended) {
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
      if (!Object.keys(next).length) continue;
      try {
        await this.updateFM(file, Object.assign({}, next, { updated: today() }));
        if (completionLog) {
          const entry = await this.appendTaskLog(file, completionLog).catch(() => "");
          this.lastRecurringCompletion = {
            path,
            title: String(frontmatter.title || nameOf(path)),
            due: dateOf(frontmatter.due || frontmatter.deadline) || "",
            status: String(frontmatter.status || ""),
            logLine: entry || ""
          };
        }
        this.invalidateNoteCache(file);
        done += 1;
      } catch (error) {
        failures.push(nameOf(path) + "（" + (error && error.message || "写入失败") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk set task fields failed", path, error);
      }
    }
    const labels = fields.map((field) => field.label).join("、");
    this.recordBulkFailures(
      "批量改任务字段",
      "bulk-set-task-fields",
      { paths: failedPaths, patch },
      failedPaths,
      failures
    );
    if (failures.length)
      new obsidian9.Notice(
        "已更新 " + done + " / " + wanted.length + " 条（" + labels + "），跳过或失败 " + failures.length + " 条：" + failures.slice(0, 6).join("、")
      );
    else
      new obsidian9.Notice(
        "已更新 " + done + " 条任务（" + labels + "）。" + (endedCount ? endedCount + " 条重复已结束，未标「已完成」（可归档收尾）。" : "")
      );
    this.refreshViews();
    return { done, failures };
  }
  /** 归档类操作的统一出口：单条调用时弹提示，批量调用时只回结果（否则一次蹦十条通知）。 */
  archiveOutcome(silent, ok, reason, message) {
    if (!silent && message) new obsidian9.Notice(message);
    return ok ? { ok: true } : { ok: false, reason: reason || "未处理" };
  }
  /** 数据页签的批量归档 / 撤销归档：逐条独立处理（一条失败不影响其它条），最后统一汇报。
   *  每条都走 archiveTask / undoArchiveTask 本身，所以单条路径上的校验与回滚照旧生效。 */
  async bulkArchiveTasks(paths, archived) {
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian9.Notice("请先勾选要处理的条目。");
    const verb = archived ? "撤销归档" : "归档";
    const failures = [];
    const failedPaths = [];
    let done = 0;
    const data = await this.collectData();
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian9.TFile)) {
        failures.push(path + "（文件不存在）");
        continue;
      }
      const frontmatter = this.fm(file) || {};
      const noteType = String(frontmatter.type || "").toLowerCase();
      if (noteType !== "task" && noteType !== "knowledge-gap") {
        failures.push(nameOf(path) + "（不是任务）");
        failedPaths.push(path);
        continue;
      }
      const task = { file, frontmatter };
      try {
        const result = archived ? await this.undoArchiveTask(task, this.findProject(task, data.projects), { silent: true }) : await this.archiveTask(task, null, { silent: true });
        if (result && result.ok) done += 1;
        else {
          failures.push(nameOf(path) + "（" + (result && result.reason || "未处理") + "）");
          failedPaths.push(path);
        }
      } catch (error) {
        failures.push(nameOf(path) + "（" + (error && error.message || "出错") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk archive failed", path, error);
      }
    }
    this.recordBulkFailures(
      verb + "任务",
      archived ? "bulk-undo-archive" : "bulk-archive",
      { paths: failedPaths, archived: Boolean(archived) },
      failedPaths,
      failures
    );
    if (failures.length)
      new obsidian9.Notice(
        verb + "完成 " + done + " / " + wanted.length + " 条，跳过或失败 " + failures.length + " 条：" + failures.slice(0, 6).join("、")
      );
    else new obsidian9.Notice(verb + "完成 " + done + " 条。");
    this.refreshViews();
    return { done, failures };
  }
  async archiveTask(task, project, options) {
    var _a, _b, _c, _d;
    const silent = Boolean(options && options.silent);
    if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
      return this.archiveOutcome(silent, false, "文件已不存在", "任务文件已经不存在，请刷新后重试。");
    if (String(((_a = task.frontmatter) == null ? void 0 : _a.status) || "").toLowerCase() === "archived" || ((_b = task.frontmatter) == null ? void 0 : _b.archived_to))
      return this.archiveOutcome(silent, false, "已经归档", "该任务已经归档，无需重复操作。");
    const liveFrontmatter = ((_c = this.app.metadataCache) == null ? void 0 : _c.getFileCache) ? ((_d = this.app.metadataCache.getFileCache(task.file)) == null ? void 0 : _d.frontmatter) || {} : {};
    if (String(liveFrontmatter.status || "").toLowerCase() === "archived" || liveFrontmatter.archived_to)
      return this.archiveOutcome(silent, false, "已经归档", "该任务已经归档，无需重复操作。");
    if (inFolder(task.file.path, this.settings.archiveFolder))
      return this.archiveOutcome(silent, false, "已在归档库", "该任务已经在归档库中，无需重复归档。");
    const data = await this.collectData();
    const selectedProject = project || this.findProject(task, data.projects);
    const projectFolder = selectedProject ? selectedProject.folderPath || await this.ensureProjectFolder(selectedProject) : "";
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
    await this.ensureFolder(folder);
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
          archived_to: folder
        },
        snapshot
      )
    );
    try {
      if (destination !== task.file.path) await this.app.vault.rename(task.file, destination);
    } catch (error) {
      const plan = this.archivedRestorePlan(task.frontmatter);
      const rollback = Object.assign({}, plan.patch);
      if (rollback.status === void 0 && previousStatus) rollback.status = previousStatus;
      await this.updateFM(task.file, rollback, plan.remove).catch(() => {
      });
      console.error("[personal-planning-dashboard] archive move failed", error);
      if (!silent) new obsidian9.Notice("移动到归档库失败，已撤回状态修改：" + (error && error.message || error));
      this.refreshViews();
      return { ok: false, reason: "移动失败" };
    }
    const next = await this.createNextRecurringTask(task, selectedProject);
    if (!silent)
      new obsidian9.Notice(
        next ? "任务已归档，并生成下一周期任务。" : this.lastRecurrenceEnded ? this.lastRecurrenceEnded.reason === "completed" ? "任务已归档（本周期已完成，不再生成下一条）。" : "任务已归档。重复已结束（重复到 " + this.lastRecurrenceEnded.until + " 为止）。" : selectedProject && projectFolder ? "项目任务已归档到归档库项目文件夹，并添加项目名前缀。" : "孤立任务已归档到归档库/孤立任务，并添加日期前缀。"
      );
    this.refreshViews();
    return { ok: true };
  }
  async undoArchiveTask(task, project, options) {
    var _a, _b;
    const silent = Boolean(options && options.silent);
    if (!task || !task.file || !this.app.vault.getAbstractFileByPath(task.file.path))
      return this.archiveOutcome(silent, false, "文件已不存在", "任务文件已经不存在，请刷新后重试。");
    const liveUndo = ((_a = this.app.metadataCache) == null ? void 0 : _a.getFileCache) ? ((_b = this.app.metadataCache.getFileCache(task.file)) == null ? void 0 : _b.frontmatter) || {} : {};
    const mergedUndo = Object.assign({}, task.frontmatter, liveUndo);
    if (String(mergedUndo.status || "").toLowerCase() !== "archived" && !mergedUndo.archived_to && !inFolder(task.file.path, this.settings.archiveFolder)) {
      return this.archiveOutcome(silent, false, "没有归档", "该任务不在归档状态，无需撤销归档。");
    }
    const data = await this.collectData();
    let selectedProject = project || this.findProject(task, data.projects);
    const archivedTo = String(mergedUndo.archived_to || "");
    if (!selectedProject && archivedTo) {
      const bucket = archivedTo.split("/").filter(Boolean).pop() || "";
      if (bucket && bucket !== "孤立任务") {
        selectedProject = data.projects.find((item) => (item.frontmatter.title || nameOf(item.file.path)) === bucket) || null;
      }
    }
    let folder;
    let title;
    if (selectedProject) {
      folder = selectedProject.folderPath || await this.ensureProjectFolder(selectedProject);
      const projectName = selectedProject.frontmatter.title || nameOf(selectedProject.file.path);
      if (!folder) {
        if (!silent) new obsidian9.Notice("找不到原项目文件夹，已恢复到日程待办。");
        folder = this.settings.taskFolder;
        title = stripProjectPrefix(nameOf(task.file.path), projectName).replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
      } else {
        title = stripProjectPrefix(nameOf(task.file.path), projectName);
      }
    } else {
      folder = this.settings.taskFolder;
      title = nameOf(task.file.path).replace(/^\[[^\]]+\]\s*/, "").replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
    }
    const plan = this.archivedRestorePlan(task.frontmatter);
    const status = plan.patch.status !== void 0 ? plan.patch.status : taskStatus({ frontmatter: Object.assign({}, task.frontmatter, { status: "" }) });
    const destination = await this.uniqueFilePath(folder, title, task.file.path);
    const archiveState = {};
    ["status", "updated", "completed", "archived", "archived_from", "archived_to"].concat(ARCHIVED_OVERWRITTEN_KEYS.map((key) => "archived_prev_" + key)).forEach((key) => {
      const value = task.frontmatter[key];
      if (value !== void 0 && value !== null && value !== "") archiveState[key] = value;
    });
    await this.updateFM(task.file, Object.assign({}, plan.patch, { status, updated: today() }), plan.remove);
    try {
      if (destination !== task.file.path) await this.app.vault.rename(task.file, destination);
    } catch (error) {
      await this.updateFM(task.file, archiveState).catch(() => {
      });
      console.error("[personal-planning-dashboard] undo archive move failed", error);
      if (!silent)
        new obsidian9.Notice("恢复到项目/日程目录失败，已撤回状态修改：" + (error && error.message || error));
      this.refreshViews();
      return { ok: false, reason: "移动失败" };
    }
    if (!silent) new obsidian9.Notice(selectedProject ? "项目任务已撤销归档。" : "任务已撤销归档并恢复到日程待办。");
    this.refreshViews();
    return { ok: true };
  }
  async undoArchiveActiveTask() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return new obsidian9.Notice("当前没有打开的 Markdown 文件。");
    const frontmatter = this.fm(file);
    if (String(frontmatter.status || "").toLowerCase() !== "archived")
      return new obsidian9.Notice("当前文件不是已归档任务。");
    const data = await this.collectData();
    await this.undoArchiveTask({ file, frontmatter }, this.findProject({ file, frontmatter }, data.projects));
  }
  async archiveActiveTask() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return new obsidian9.Notice("当前没有打开的 Markdown 文件。");
    const data = await this.collectData();
    const task = data.allTasks.find((item) => item.file.path === file.path);
    if (!task) return new obsidian9.Notice("当前文件不是插件管理的任务。");
    await this.archiveTask(task);
  }
  async uniqueChildPath(folder, name) {
    await this.ensureFolder(folder);
    const clean = cleanName(name);
    let path = obsidian9.normalizePath(folder + "/" + clean);
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = obsidian9.normalizePath(folder + "/" + clean + " " + n);
      n++;
    }
    return path;
  }
  async moveFolderContents(source, destination) {
    const children = [...source.children || []];
    for (const child of children) {
      let targetPath = obsidian9.normalizePath(destination.path + "/" + child.name);
      const existing = this.app.vault.getAbstractFileByPath(targetPath);
      if (existing && child instanceof obsidian9.TFolder && existing instanceof obsidian9.TFolder) {
        await this.moveFolderContents(child, existing);
        continue;
      }
      if (existing) targetPath = await this.uniqueChildPath(destination.path, child.name);
      await this.app.vault.rename(child, targetPath);
    }
  }
  async createKnowledgeFromGap(task, title, options) {
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
        "## 学习记录\n\n## 可复用结论\n\n## 来源\n\n- [[" + source.replace(/\.md$/i, "") + "]]\n"
      )
    );
    const existing = refs(task.frontmatter.knowledge_refs);
    await this.updateFM(task.file, {
      knowledge_refs: Array.from(/* @__PURE__ */ new Set([...existing, destination])),
      updated: today()
    });
    new obsidian9.Notice("已将知识缺口沉淀到知识库：" + name);
    this.refreshViews();
    await this.openFile(file);
  }
  /** 批量沉淀知识缺口：每条按**自己的标题**建一篇知识笔记（重名自动加序号），逐条独立、统一汇报。
   *  单条路径仍走表单让用户改标题；批量路径不逐个提问 —— 要改标题的用单条。 */
  async bulkSinkGaps(paths) {
    const wanted = (paths || []).map(String).filter(Boolean);
    if (!wanted.length) return new obsidian9.Notice("请先勾选要沉淀的知识缺口。");
    const failures = [];
    const failedPaths = [];
    let done = 0;
    for (const path of wanted) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian9.TFile)) {
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
          silent: true
        });
        done += 1;
      } catch (error) {
        failures.push(nameOf(path) + "（" + (error && error.message || "沉淀失败") + "）");
        failedPaths.push(path);
        console.error("[personal-planning-dashboard] bulk sink gap failed", path, error);
      }
    }
    this.recordBulkFailures("沉淀知识缺口", "bulk-sink-gaps", { paths: failedPaths }, failedPaths, failures);
    if (failures.length)
      new obsidian9.Notice(
        "已沉淀 " + done + " / " + wanted.length + " 条知识缺口，跳过或失败 " + failures.length + " 条：" + failures.slice(0, 6).join("、")
      );
    else new obsidian9.Notice("已沉淀 " + done + " 条知识缺口到知识库。");
    this.refreshViews();
    return { done, failures };
  }
  materializeKnowledgeGap(task) {
    new FormModal(
      this.app,
      "沉淀知识缺口",
      [{ id: "title", name: "知识笔记标题", value: task.frontmatter.title || nameOf(task.file.path) }],
      (values) => this.createKnowledgeFromGap(task, values.title)
    ).open();
  }
  async openPersonalNote(path, title) {
    if (forbiddenPath(path) || !inFolder(path, this.settings.areaFolder))
      throw new Error("个人笔记路径不在长期领域目录内");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      await this.ensureFolder(this.settings.areaFolder);
      file = await this.app.vault.create(
        path,
        makeMD({ type: "area", title, created: today() }, "## 现状\n\n## 目标\n\n## 近期行动\n\n")
      );
    }
    if (!(file instanceof obsidian9.TFile)) throw new Error("目标路径不是 Markdown 文件");
    await this.openFile(file);
  }
  archiveBook(item) {
    new ConfirmModal(
      this.app,
      "归档图书",
      "阅读完成后移动到归档库/图书；原笔记内容不会丢失。",
      "归档图书",
      async () => {
        if (!item || !item.file || !this.app.vault.getAbstractFileByPath(item.file.path))
          throw new Error("图书文件已经不存在，请刷新资源页后重试。");
        const source = item.file.path;
        const folder = obsidian9.normalizePath(this.settings.archiveFolder + "/图书");
        await this.ensureFolder(folder);
        const destination = await this.uniqueFilePath(folder, nameOf(source));
        const previousStatus = String(item.frontmatter && item.frontmatter.status || "");
        await this.updateFM(item.file, {
          status: "archived",
          archived: today(),
          archived_from: source,
          archived_to: folder
        });
        try {
          await this.app.vault.rename(item.file, destination);
        } catch (error) {
          await this.updateFM(item.file, previousStatus ? { status: previousStatus } : {}, [
            "archived",
            "archived_from",
            "archived_to"
          ]).catch(() => {
          });
          console.error("[personal-planning-dashboard] book archive move failed", error);
          new obsidian9.Notice("移动到归档库失败，已撤回状态修改：" + (error && error.message || error));
          this.refreshViews();
          return;
        }
        new obsidian9.Notice("图书已归档：" + nameOf(source));
        this.refreshViews();
      }
    ).open();
  }
  async archiveProject(project) {
    const projectFolderPath = project.folderPath || await this.ensureProjectFolder(project);
    if (!projectFolderPath) return new obsidian9.Notice("项目文件夹不存在。");
    const folder = this.app.vault.getAbstractFileByPath(projectFolderPath);
    if (!(folder instanceof obsidian9.TFolder)) return new obsidian9.Notice("项目文件夹不存在。");
    await this.updateFM(project.file, { status: "archived", archived: today(), updated: today() });
    await this.ensureFolder(this.settings.archiveFolder);
    let destinationPath = obsidian9.normalizePath(this.settings.archiveFolder + "/" + nameOf(projectFolderPath));
    const existing = this.app.vault.getAbstractFileByPath(destinationPath);
    if (existing instanceof obsidian9.TFolder) {
      await this.moveFolderContents(folder, existing);
      await this.app.fileManager.trashFile(folder);
    } else {
      if (existing)
        destinationPath = await this.uniqueFolderPath(this.settings.archiveFolder, nameOf(projectFolderPath));
      await this.app.vault.rename(folder, destinationPath);
    }
    new obsidian9.Notice("整个项目文件夹已迁移到归档库。");
    this.refreshViews();
  }
  /** 撤销项目归档：把整个项目文件夹从归档库搬回项目库。
   *  安全前提：归档文件夹里只有这一个项目文档 —— archiveProject 在重名时会把内容**合并**进已有文件夹，
   *  这种情况下无法分出哪些文件属于谁，宁可拒绝也不乱搬。 */
  async undoArchiveProject(project) {
    if (!project || !project.file || !this.app.vault.getAbstractFileByPath(project.file.path))
      return new obsidian9.Notice("项目文件已经不存在，请刷新后重试。");
    const folderPath = project.folderPath || project.file.path.split("/").slice(0, -1).join("/");
    if (!inFolder(folderPath, this.settings.archiveFolder))
      return new obsidian9.Notice("这个项目不在归档库里，无需撤销归档。");
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof obsidian9.TFolder)) return new obsidian9.Notice("找不到项目的归档文件夹，请手动整理。");
    const siblings = (folder.children || []).filter(
      (child) => child instanceof obsidian9.TFile && String((this.fm(child) || {}).type || "").toLowerCase() === "project"
    );
    if (siblings.length > 1) {
      return new obsidian9.Notice(
        "归档文件夹「" + nameOf(folderPath) + "」里还有 " + siblings.length + " 个项目，无法自动拆分，请手动整理后再撤销归档。"
      );
    }
    const projectName = project.frontmatter.title || nameOf(folderPath);
    const destination = await this.uniqueFolderPath(this.settings.projectFolder, nameOf(folderPath));
    await this.app.vault.rename(folder, destination);
    const restoredPath = obsidian9.normalizePath(destination + "/" + (project.file.name || nameOf(project.file.path) + ".md"));
    const restored = this.app.vault.getAbstractFileByPath(restoredPath);
    if (restored instanceof obsidian9.TFile) {
      await this.updateFM(restored, { status: "planning", updated: today() }, [
        "archived",
        "archived_from",
        "archived_to"
      ]);
    }
    this.invalidateNoteCache();
    new obsidian9.Notice("已把项目「" + projectName + "」恢复到项目库，状态设为「规划中」，可在项目详情里改。");
    this.refreshViews();
  }
  async checkReminders(force) {
    if (!this.settings.remindersEnabled) {
      if (force) new obsidian9.Notice("提醒已在设置中关闭（设置 → 个人规划仪表盘）。");
      return;
    }
    const now = window.moment ? window.moment() : /* @__PURE__ */ new Date();
    const date = today();
    const hour = window.moment ? Number(now.format("H")) : now.getHours();
    const rawHour = this.settings.reminderHour;
    const configuredHour = String(rawHour === null || rawHour === void 0 ? "" : rawHour).trim() === "" ? NaN : Number(rawHour);
    const reminderHour = Number.isFinite(configuredHour) ? Math.min(23, Math.max(0, Math.floor(configuredHour))) : 9;
    if (!force && hour < reminderHour) return;
    if (!force && this.settings.lastReminderDate === date) return;
    try {
      const data = await this.collectData();
      const messages = buildReminderMessages(data, date);
      if (messages.length) {
        this.settings.lastReminderDate = date;
        await this.saveData(this.settings);
        const notice = new obsidian9.Notice("规划提醒：\n" + messages.join("\n") + "\n（点击打开仪表盘）", 8e3);
        if (notice && notice.noticeEl) {
          if (notice.noticeEl.addClass) notice.noticeEl.addClass("pp-reminder-notice");
          if (notice.noticeEl.setAttr) notice.noticeEl.setAttr("role", "button");
          notice.noticeEl.onclick = () => {
            if (notice.hide) notice.hide();
            void this.activateApp();
          };
        }
      } else if (force) {
        new obsidian9.Notice("目前没有需要提醒的任务。");
      }
    } catch (error) {
      console.error("[personal-planning-dashboard] reminder check failed", error);
    }
  }
  async saveSettings(options) {
    const next = normalizeSettings(this.settings);
    const reverted = [];
    for (let guard = 0; guard < DISTINCT_FOLDER_KEYS.length + 1; guard += 1) {
      const clashes = folderClashes(next);
      if (!clashes.length) break;
      clashes.forEach((key) => {
        next[key] = DEFAULTS[key];
        if (reverted.indexOf(key) < 0) reverted.push(key);
      });
    }
    if (reverted.length) new obsidian9.Notice("这些目录不能和别的目录相同，已还原为默认值：" + reverted.join("、"));
    const fixed = FOLDER_SETTING_KEYS.filter(
      (key) => String(this.settings[key] === void 0 ? "" : this.settings[key]) !== next[key]
    );
    if (fixed.length) new obsidian9.Notice("路径已自动归一化：" + fixed.join("、"));
    this.settings = next;
    await this.saveData(this.settings);
    this.refreshViews();
    if (!(options && options.quiet)) this.warnMissingFolders();
  }
  /** 配置体检：把【目录缺失 / 重名 / 互相嵌套】这类问题整理成可修列表。
   *  只回数据（id + 文案 + 修复方式），由设置页决定怎么渲染 —— 这样测试不必碰 DOM。 */
  settingsIssues() {
    const issues = [];
    const { missing } = this.missingConfiguredFolders();
    if (missing.length)
      issues.push({
        id: "missing",
        keys: [],
        text: "这些目录还不存在，仪表盘不会采到它们的笔记：" + missing.join("、"),
        fix: "create"
      });
    const clashKeys = folderClashes(this.settings);
    if (clashKeys.length)
      issues.push({
        id: "clash",
        keys: clashKeys,
        text: "这些目录和别的目录配成了同一个路径（会被还原成默认值）：" + clashKeys.join("、"),
        fix: "reset"
      });
    const nested = [];
    DISTINCT_FOLDER_KEYS.forEach((key, index) => {
      DISTINCT_FOLDER_KEYS.slice(index + 1).forEach((other) => {
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
        fix: "reset"
      });
    return issues;
  }
  /** 配置里的目录到底存不存在：手抄错一个字，仪表盘就会静默采不到那一类笔记 */
  missingConfiguredFolders() {
    const keys = DISTINCT_FOLDER_KEYS.concat(["knowledgeFolder", "areaFolder", "peopleFolder"]);
    const seen = /* @__PURE__ */ new Set();
    const missing = [];
    let existing = 0;
    keys.forEach((key) => {
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
    new obsidian9.Notice(
      "这些目录还不存在，仪表盘不会采到它们的笔记：" + signature + "（可用命令「初始化规划目录结构」创建默认目录）"
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
    [DASHBOARD_VIEW, PROJECT_VIEW, INBOX_VIEW, TASKS_VIEW, RESOURCES_VIEW, APP_VIEW].forEach((type) => {
      this.app.workspace.getLeavesOfType(type).forEach((leaf) => {
        var _a, _b;
        return (_b = (_a = leaf.view) == null ? void 0 : _a.refresh) == null ? void 0 : _b.call(_a);
      });
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
    if (this.assetPathCache && Date.now() - this.assetPathCache.at < 2e3) return this.assetPathCache.paths;
    const paths = (this.app.vault.getFiles ? this.app.vault.getFiles() : []).map((file) => file && file.path).filter(Boolean);
    this.assetPathCache = { at: Date.now(), paths };
    return paths;
  }
};

// src/main.ts
module.exports = PersonalPlanningDashboard;

/* ===== PP_WEB_RENDERER_START =================
 * 生成区块：Web 渲染层（不要手工编辑）
 *   源文件：web/app.js（渲染与交互）
 *           web/styles.css（夜航极光设计系统）
 *   重新生成：node tools/sync-app.mjs
 *   校验漂移：node tools/sync-app.mjs --check
 * 运行方式：ppWebAppFactory(...) 返回与浏览器版完全相同的 window.PPDashboard API；
 * 插件侧通过 api.mount({ data, host }) 把界面挂进 Shadow DOM，数据实时取自 Vault。
 * ================= */
/** Web 版设计系统原文：挂载时注入 Shadow DOM，与宿主样式完全隔离 */
const PP_WEB_CSS = "/* =====================================================================\n * 个人规划仪表盘 · Web — 极简主义设计系统（minimalism）\n *\n * 设计依据：仓库根目录 DESIGN.md，与 Obsidian 插件 styles.css 同源：\n *   · 纯白画布 + 黑白灰三色，唯一强调色是「墨黑」\n *   · 细字重衬线展示标题（DM Serif Display / Songti SC） + 细字重无衬线正文\n *   · 零圆角、零阴影、零渐变；只用 1px 单线分隔\n *   · 留白即设计：区块间距 64px，卡内边距 40px，正文行高 1.7\n *   · 最大内容宽 1140px；断点 640 / 1024\n *\n * 这是一个独立静态站：令牌直接写在 :root 上，不依赖 Obsidian 的 CSS 变量，\n * 也不使用任何 require / 构建期变量。深色反相只需给 <body> 加 .theme-dark。\n *\n * 结构：\n *   0. 设计令牌 ............ 颜色 / 字体 / 间距\n *   1. 外壳 ................ 画布、顶部导航、页脚\n *   2. 页首 masthead ....... 眉标 + 展示标题 + 40px 墨线 + 说明与日期\n *   3. 今日焦点与统计卡 .... focus-strip / kpi\n *   4. 索引导航 ............ 01 / 02 / 03 编号入口（无图片）\n *   5. 栅格与面板 .......... panel / project-card\n *   6. 列表与行 ............ 1px 分隔，无背景块\n *   7. 表单与筛选\n *   8. 徽标、时间规划、语义色\n *   9. 抽屉\n *  10. 响应式（1024 / 640）\n *\n * ⚠ 本文件是**两层叠加**，读的时候务必分清楚：\n *   · 第 1–10 节（直到下面的「夜航极光」分隔线）= 极简主义基线：纯白、零圆角、零阴影；\n *   · 第 11 节起 = 夜航极光覆盖层：重写令牌（`:root` 的第二套）并覆盖外壳、卡片、抽屉等规则；\n *   · 第 12 节 = 浅色主题（`.theme-light`），与极光同名令牌给出浅色取值。\n *   基线与覆盖层对同一个类各写一次（用工具扫过：318 条规则里只有 3 条被完全覆盖），\n *   所以**改动某个类时两处都要看**；只改一处最常见的后果是「某些元素停在零圆角/纯白」。\n *   插件的 `styles.css` 调色板由本文件的令牌生成（node tools/sync-app.mjs，--check 会拦漂移），\n *   它自己的排版部分是手写的，不要指望两边逐行一致。\n * ===================================================================== */\n\n/* ---------------------------------------------------------------- *\n * 0. 设计令牌\n * ---------------------------------------------------------------- */\n\n:root {\n  /* 画布与墨色：DESIGN.md 的取值 */\n  --pp-canvas: #ffffff;\n  --pp-surface-light: #f7f7f7;\n  --pp-surface-mid: #f0f0f0;\n  --pp-ink: #0a0a0a;\n  --pp-ink-soft: #1a1a1a;\n  --pp-body: #3a3a3a;\n  --pp-muted: #767676;\n  --pp-faint: #a0a0a0;\n  --pp-hairline: #e0e0e0;\n  --pp-hairline-soft: #ebebeb;\n  --pp-on-ink: #ffffff;\n  --pp-success: #2d6a4f;\n  --pp-warning: #b5621a;\n  --pp-danger: #b91c1c;\n\n  /* 排版：两种字体家族，展示用衬线，界面用无衬线。\n     插件离线运行、不打包 webfont，所以 DM Serif Display / DM Sans 只在用户本机装过时才生效，\n     真正保证观感的是后面的本机字体。无衬线一律优先用 Obsidian 自己的字体变量\n     （--font-interface / --font-text），这样仪表盘和用户选定的界面字体保持一致；\n     浏览器版没有这两个变量，自然回落到系统字体。 */\n  --pp-serif: \"DM Serif Display\", \"Playfair Display\", Georgia, \"Times New Roman\", \"Source Han Serif SC\", \"Noto Serif SC\", \"Songti SC\", SimSun, serif;\n  --pp-sans: var(--font-interface, var(--font-text, \"DM Sans\")), \"Inter\", -apple-system, \"Segoe UI\", \"IBM Plex Sans SC\", \"PingFang SC\", \"Microsoft YaHei\", \"Noto Sans SC\", sans-serif;\n\n  /* 间距：8px 倍数体系 */\n  --pp-xxs: 4px;\n  --pp-xs: 8px;\n  --pp-sm: 16px;\n  --pp-md: 24px;\n  --pp-lg: 40px;\n  --pp-xl: 64px;\n  --pp-xxl: 96px;\n\n  /* ---- 动效节奏（MOTION.md 第 1 节；与插件 styles.css 逐字一致。\n         这两个文件里都手写一份：动效令牌**不进** sync-app.mjs 的 PALETTE_KEYS，\n         与既有的 --pp-r-* 圆角令牌同一模式。 ---- */\n  --pp-mo-instant: 90ms;\n  --pp-mo-fast: 140ms;\n  --pp-mo-base: 220ms;\n  --pp-mo-slow: 380ms;\n  --pp-mo-enter: 480ms;\n  --pp-mo-ambient: 14s;\n  --pp-mo-stagger: 45ms;\n  --pp-mo-ease: cubic-bezier(0.22, 0.61, 0.36, 1);\n  --pp-mo-ease-out: cubic-bezier(0.16, 1, 0.3, 1);\n  --pp-mo-spring: cubic-bezier(0.34, 1.56, 0.64, 1);\n  --pp-mo-lift: -3px;\n\n  /* 内容与外壳共用同一宽度，页首与导航自然对齐 */\n  --pp-content: 1140px;\n  /* 横向留白按**容器**宽度算，不按视口：Obsidian 窗格可能只有 300 多像素，而窗口有 1920 ——\n     用 vw 的话窄窗格里光留白就被吃掉近四成。插件里最近的查询容器是 shadow 宿主\n     （container-type: inline-size，见桥接样式）；浏览器版没有容器时按规范回退到小视口，等价于原来的 vw。 */\n  --pp-gutter: clamp(var(--pp-md), 5cqw, var(--pp-xl));\n\n  color-scheme: light;\n}\n\n/* 深色主题：同一套结构反相，令牌是唯一需要改动的部分 */\n.theme-dark {\n  --pp-canvas: #191919;\n  --pp-surface-light: #1f1f1f;\n  --pp-surface-mid: #242424;\n  --pp-ink: #e9e9e9;\n  --pp-ink-soft: #d6d6d6;\n  --pp-body: #c4c4c4;\n  --pp-muted: #999999;\n  --pp-faint: #6f6f6f;\n  --pp-hairline: #333333;\n  --pp-hairline-soft: #2a2a2a;\n  --pp-on-ink: #191919;\n  --pp-success: #6fbf9a;\n  --pp-warning: #e0a45e;\n  --pp-danger: #e07a7a;\n  color-scheme: dark;\n}\n\n* { box-sizing: border-box; }\n\nhtml, body { margin: 0; padding: 0; }\n\nbody {\n  min-height: 100vh;\n  background: var(--pp-canvas);\n  color: var(--pp-body);\n  font-family: var(--pp-sans);\n  font-size: 16px;\n  font-weight: 300;\n  line-height: 1.7;\n  -webkit-font-smoothing: antialiased;\n}\n\na { color: var(--pp-ink); text-decoration: none; }\n\nbutton { font: inherit; color: inherit; cursor: pointer; }\n\n:focus-visible { outline: 1px solid var(--pp-ink); outline-offset: 2px; }\n\n/* button-primary：墨底白字，零圆角，最小高度 42px，字距 1px */\n.primary-btn {\n  min-height: 42px;\n  padding: 11px 28px;\n  border: 1px solid var(--pp-ink);\n  border-radius: 0;\n  background: var(--pp-ink);\n  color: var(--pp-on-ink);\n  font-size: 13px;\n  font-weight: 400;\n  letter-spacing: 1px;\n  white-space: nowrap;\n}\n\n.primary-btn:hover,\n.primary-btn:focus-visible {\n  background: var(--pp-ink-soft);\n  border-color: var(--pp-ink-soft);\n  outline: none;\n}\n\n/* ---------------------------------------------------------------- *\n * 0.5 工具类\n * ---------------------------------------------------------------- */\n\n/* 只给读屏的文本：视觉隐藏，但保留在可访问树里（不能 display:none，那样读屏也读不到） */\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  margin: -1px;\n  padding: 0;\n  overflow: hidden;\n  clip: rect(0 0 0 0);\n  clip-path: inset(50%);\n  white-space: nowrap;\n  border: 0;\n}\n\n/* ---------------------------------------------------------------- *\n * 1. 外壳\n * ---------------------------------------------------------------- */\n\n.app {\n  display: flex;\n  flex-direction: column;\n  min-height: 100vh;\n  background: var(--pp-canvas);\n}\n\n/* 顶部导航：60px 纯白条 + 1px 底线，导航本身几乎「不存在」 */\n.topbar {\n  position: sticky;\n  top: 0;\n  z-index: 5;\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--pp-sm);\n  width: 100%;\n  max-width: var(--pp-content);\n  min-height: 60px;\n  margin: 0 auto;\n  padding: var(--pp-sm) var(--pp-gutter);\n  border-bottom: 1px solid var(--pp-hairline);\n  background: var(--pp-canvas);\n}\n\n.brand {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  flex: 0 0 auto;\n  margin-right: var(--pp-xs);\n  color: var(--pp-ink);\n}\n\n.brand-text { display: flex; flex-direction: column; }\n\n.brand-text strong {\n  font-family: var(--pp-serif);\n  font-size: 17px;\n  font-weight: 300;\n  letter-spacing: -0.2px;\n  line-height: 1.1;\n}\n\n.brand-text small {\n  color: var(--pp-faint);\n  font-size: 10px;\n  letter-spacing: 2px;\n  text-transform: uppercase;\n}\n\n.tabs {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 2px;\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n/* nav-link：细字重、无底色，靠 1px 下划线表示当前页 */\n.tab {\n  border: 0;\n  border-bottom: 1px solid transparent;\n  border-radius: 0;\n  background: transparent;\n  color: var(--pp-muted);\n  padding: 10px 2px;\n  margin-right: var(--pp-sm);\n  font-size: 13px;\n  font-weight: 300;\n  letter-spacing: 0.3px;\n  white-space: nowrap;\n}\n\n.tab:hover,\n.tab:focus-visible {\n  color: var(--pp-ink);\n  border-bottom-color: var(--pp-hairline);\n  outline: none;\n}\n\n.tab[aria-current=\"page\"] {\n  color: var(--pp-ink);\n  border-bottom-color: var(--pp-ink);\n}\n\n.tab-count {\n  margin-left: 6px;\n  color: var(--pp-faint);\n  font-size: 11px;\n  letter-spacing: 0.5px;\n}\n\n.topbar-side {\n  display: flex;\n  align-items: center;\n  gap: var(--pp-sm);\n  flex: 0 0 auto;\n}\n\n.date-chip {\n  color: var(--pp-faint);\n  font-size: 12px;\n  letter-spacing: 0.5px;\n  white-space: nowrap;\n}\n\n.view {\n  flex: 1 1 auto;\n  width: 100%;\n  max-width: var(--pp-content);\n  margin: 0 auto;\n  /* 顶部是 position:sticky 的 .topbar（min-height 60px）：\n     切换页签时 switchView() 会 scrollIntoView({block:\"start\"})，\n     没有这段留白，内容顶部就会被顶栏永久盖住。 */\n  scroll-margin-top: 76px;\n  padding: var(--pp-xl) var(--pp-gutter) var(--pp-xxl);\n  animation: none;\n}\n\n.view:focus { outline: none; }\n\n.footer {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--pp-xs) var(--pp-md);\n  width: 100%;\n  max-width: var(--pp-content);\n  margin: 0 auto;\n  padding: var(--pp-md) var(--pp-gutter) var(--pp-xl);\n  border-top: 1px solid var(--pp-hairline);\n  color: var(--pp-muted);\n  font-size: 12px;\n  letter-spacing: 0.5px;\n}\n\n.footer strong { color: var(--pp-ink); font-weight: 400; }\n\n.footer code {\n  color: var(--pp-muted);\n  font-family: var(--pp-sans);\n  font-size: 12px;\n  letter-spacing: 0.5px;\n}\n\n/* ---------------------------------------------------------------- *\n * 2. 页首 masthead：眉标 → 展示标题 → 40px 墨线 → 说明 + 日期\n * ---------------------------------------------------------------- */\n\n.masthead {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: var(--pp-xs);\n  margin: 0 0 var(--pp-xl);\n  padding: 0;\n  border: 0;\n  background: none;\n}\n\n.eyebrow {\n  display: block;\n  color: var(--pp-muted);\n  font-family: var(--pp-sans);\n  font-size: 11px;\n  font-weight: 400;\n  letter-spacing: 2px;\n  line-height: 1.4;\n  text-transform: uppercase;\n}\n\n.masthead h1 {\n  max-width: 900px;\n  margin: var(--pp-xs) 0 0;\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 72px;\n  font-weight: 300;\n  letter-spacing: -2px;\n  line-height: 1;\n}\n\n.masthead-rule {\n  width: 40px;\n  height: 1px;\n  margin: var(--pp-sm) 0 var(--pp-xs);\n  background: var(--pp-ink);\n}\n\n.masthead-lede {\n  max-width: 660px;\n  margin: 0;\n  color: var(--pp-muted);\n  font-size: 16px;\n  font-weight: 300;\n  line-height: 1.7;\n}\n\n.masthead-meta {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--pp-xs) var(--pp-md);\n  margin: var(--pp-sm) 0 0;\n}\n\n/* ---------------------------------------------------------------- *\n * 3. 今日焦点（quote-block）与统计卡\n * ---------------------------------------------------------------- */\n\n.focus-strip {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: var(--pp-xs);\n  margin: 0 0 var(--pp-xl);\n  padding: 0 0 0 var(--pp-lg);\n  border: 0;\n  border-left: 3px solid var(--pp-ink);\n  background: none;\n}\n\n.focus-strip strong {\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 26px;\n  font-weight: 300;\n  letter-spacing: -0.4px;\n  line-height: 1.2;\n}\n\n.focus-hint {\n  max-width: 660px;\n  color: var(--pp-muted);\n  font-size: 14px;\n  font-weight: 300;\n}\n\n.kpi {\n  grid-column: span 3;\n  display: flex;\n  flex-direction: column;\n  gap: var(--pp-xs);\n  padding: var(--pp-lg) var(--pp-md) var(--pp-md);\n  border: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: var(--pp-canvas);\n}\n\n.kpi-value {\n  order: 1;\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 52px;\n  font-weight: 300;\n  letter-spacing: -1.5px;\n  line-height: 1.05;\n}\n\n.kpi-hint {\n  order: 2;\n  color: var(--pp-faint);\n  font-size: 11px;\n  font-weight: 400;\n  letter-spacing: 2px;\n  text-transform: uppercase;\n}\n\n.kpi-label {\n  order: 3;\n  color: var(--pp-muted);\n  font-size: 13px;\n  letter-spacing: 0.5px;\n}\n\n.kpi-bar {\n  order: 4;\n  height: 1px;\n  margin-top: var(--pp-xs);\n  background: var(--pp-hairline);\n  border-radius: 0;\n  overflow: hidden;\n}\n\n.kpi-bar span {\n  display: block;\n  height: 1px;\n  background: var(--pp-ink);\n}\n\n/* ---------------------------------------------------------------- *\n * 4. 索引导航：01 / 02 / 03 的编号排版入口，不使用任何图片\n * ---------------------------------------------------------------- */\n\n.waypoints {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 0;\n  margin: 0 0 var(--pp-xl);\n  border-top: 1px solid var(--pp-hairline);\n}\n\n.waypoint {\n  display: grid;\n  grid-template-columns: auto 1fr;\n  grid-template-rows: auto auto auto;\n  align-items: baseline;\n  gap: var(--pp-xxs) var(--pp-sm);\n  padding: var(--pp-md) var(--pp-md) var(--pp-md) 0;\n  border: 0;\n  border-bottom: 1px solid var(--pp-hairline);\n  border-right: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: none;\n  color: var(--pp-ink);\n  font: inherit;\n  text-align: left;\n}\n\n.waypoint:last-child { border-right: 0; }\n\n.waypoint:hover,\n.waypoint:focus-visible {\n  background: var(--pp-surface-light);\n  outline: none;\n}\n\n.waypoint-index {\n  grid-row: 1 / 4;\n  color: var(--pp-faint);\n  font-family: var(--pp-serif);\n  font-size: 26px;\n  font-weight: 300;\n  letter-spacing: -0.4px;\n  line-height: 1;\n}\n\n.waypoint-eyebrow {\n  grid-column: 2;\n  color: var(--pp-muted);\n  font-size: 11px;\n  font-weight: 400;\n  letter-spacing: 2px;\n  text-transform: uppercase;\n}\n\n.waypoint-title {\n  grid-column: 2;\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 20px;\n  font-weight: 300;\n  letter-spacing: -0.3px;\n  line-height: 1.2;\n}\n\n.waypoint-description {\n  grid-column: 2;\n  max-width: 660px;\n  color: var(--pp-muted);\n  font-size: 13px;\n  font-weight: 300;\n}\n\n/* ---------------------------------------------------------------- *\n * 5. 栅格与面板：1px 线框代替色块背景\n * ---------------------------------------------------------------- */\n\n.grid {\n  display: grid;\n  grid-template-columns: repeat(12, minmax(0, 1fr));\n  gap: var(--pp-lg) var(--pp-md);\n}\n\n.span-3 { grid-column: span 3; }\n.span-4 { grid-column: span 4; }\n.span-5 { grid-column: span 5; }\n.span-6 { grid-column: span 6; }\n.span-7 { grid-column: span 7; }\n.span-8 { grid-column: span 8; }\n.span-12 { grid-column: span 12; }\n\n.panel {\n  display: flex;\n  flex-direction: column;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: var(--pp-canvas);\n  overflow: hidden;\n}\n\n.panel-head {\n  display: flex;\n  flex-wrap: wrap;              /* 工具条放不下时换行，而不是把标题与说明压成一列一个字 */\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--pp-md);\n  padding: var(--pp-lg) var(--pp-lg) var(--pp-sm);\n  border-bottom: 1px solid var(--pp-hairline);\n}\n\n/* 文案块至少要能放下一行字；工具条超宽时自己换行 */\n.panel-head > div:first-child {\n  flex: 1 1 16ch;\n  min-width: 0;\n}\n\n.panel-head h2 {\n  margin: 0;\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 26px;\n  font-weight: 300;\n  letter-spacing: -0.4px;\n  line-height: 1.2;\n}\n\n.panel-head p {\n  max-width: 660px;\n  margin: var(--pp-xxs) 0 0;\n  color: var(--pp-muted);\n  font-size: 13px;\n  font-weight: 300;\n}\n\n.panel-body {\n  flex: 1 1 auto;\n  padding: var(--pp-md) var(--pp-lg) var(--pp-lg);\n}\n\n.panel-tools {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--pp-xs);\n  flex: 0 0 auto;\n}\n\n.project-list {\n  display: grid;\n  gap: var(--pp-md);\n  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));\n}\n\n.project-card {\n  display: flex;\n  flex-direction: column;\n  gap: var(--pp-sm);\n  padding: var(--pp-lg);\n  border: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: var(--pp-canvas);\n}\n\n.project-head {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: var(--pp-md);\n}\n\n.project-head h3 {\n  margin: 0;\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 20px;\n  font-weight: 300;\n  letter-spacing: -0.3px;\n  line-height: 1.2;\n}\n\n.project-sub {\n  margin-top: var(--pp-xxs);\n  color: var(--pp-muted);\n  font-size: 12px;\n  letter-spacing: 0.5px;\n}\n\n.project-outcome {\n  max-width: 660px;\n  margin: 0;\n  color: var(--pp-muted);\n  font-size: 14px;\n  font-weight: 300;\n}\n\n.project-foot {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--pp-xs) var(--pp-md);\n  padding-top: var(--pp-sm);\n  border-top: 1px solid var(--pp-hairline-soft);\n}\n\n.project-foot .meta-row { justify-content: flex-end; }\n\n/* 完成度：1px 细线进度 + 衬线百分比（与插件单项目页一致，不使用任何图形元素） */\n.progress-line {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: var(--pp-xs);\n  min-width: 150px;\n}\n\n.progress-value {\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 20px;\n  font-weight: 300;\n  letter-spacing: -0.3px;\n  line-height: 1;\n  white-space: nowrap;\n}\n\n.progress-bar {\n  flex: 1 1 auto;\n  display: block;\n  height: 1px;\n  background: var(--pp-hairline);\n}\n\n.progress-fill {\n  display: block;\n  height: 1px;\n  background: var(--pp-ink);\n}\n\n/* ---------------------------------------------------------------- *\n * 6. 列表与行\n * ---------------------------------------------------------------- */\n\n.chip {\n  display: inline-flex;\n  align-items: center;\n  gap: var(--pp-xxs);\n  padding: 3px 10px;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: transparent;\n  color: var(--pp-muted);\n  font-size: 11px;\n  font-weight: 400;\n  letter-spacing: 1px;\n  line-height: 1.4;\n  white-space: nowrap;\n}\n\n.chip[data-status=\"planning\"],\n.chip[data-status=\"todo\"] { border-color: var(--pp-ink); color: var(--pp-ink); }\n.chip[data-status=\"doing\"],\n.chip[data-status=\"active\"] { border-color: var(--pp-success); color: var(--pp-success); }\n.chip[data-status=\"completed\"] { border-color: var(--pp-hairline); color: var(--pp-muted); }\n.chip[data-status=\"blocked\"],\n.chip[data-status=\"expired\"] { border-color: var(--pp-danger); color: var(--pp-danger); }\n.chip[data-status=\"paused\"] { border-color: var(--pp-warning); color: var(--pp-warning); }\n.chip[data-status=\"archived\"] { border-color: var(--pp-hairline-soft); color: var(--pp-faint); }\n.chip[data-priority=\"high\"] { border-color: var(--pp-danger); color: var(--pp-danger); }\n.chip[data-priority=\"medium\"] { border-color: var(--pp-warning); color: var(--pp-warning); }\n.chip[data-priority=\"low\"] { border-color: var(--pp-hairline-soft); color: var(--pp-faint); }\n.chip[data-tone=\"danger\"] { border-color: var(--pp-danger); color: var(--pp-danger); }\n.chip[data-tone=\"warn\"] { border-color: var(--pp-warning); color: var(--pp-warning); }\n.chip[data-tone=\"muted\"] { border-color: var(--pp-hairline); color: var(--pp-muted); }\n\n.meta-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--pp-xxs) var(--pp-xs);\n}\n\n/* button-ghost：只有文字，hover 出 1px 下划线 */\n.link-btn {\n  min-height: 30px;\n  padding: var(--pp-xxs) 0;\n  border: 0;\n  border-bottom: 1px solid transparent;\n  border-radius: 0;\n  background: none;\n  color: var(--pp-muted);\n  font-size: 12px;\n  font-weight: 400;\n  letter-spacing: 0.5px;\n  white-space: nowrap;\n}\n\n.link-btn:hover,\n.link-btn:focus-visible {\n  border-bottom-color: var(--pp-ink);\n  color: var(--pp-ink);\n  outline: none;\n}\n\n.row-title {\n  padding: 0;\n  border: 0;\n  border-bottom: 1px solid transparent;\n  border-radius: 0;\n  background: transparent;\n  color: var(--pp-ink);\n  font-size: 15px;\n  font-weight: 300;\n  text-align: left;\n  overflow-wrap: anywhere;\n}\n\n.row-title:hover,\n.row-title:focus-visible {\n  border-bottom-color: var(--pp-ink);\n  outline: none;\n}\n\n.empty {\n  display: flex;\n  flex-direction: column;\n  gap: var(--pp-xxs);\n  padding: var(--pp-md) 0;\n  color: var(--pp-muted);\n  font-size: 13px;\n  font-weight: 300;\n}\n\n.empty strong {\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 20px;\n  font-weight: 300;\n  letter-spacing: -0.3px;\n}\n\n.res-list { display: flex; flex-direction: column; }\n\n.res-item {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: var(--pp-md);\n  padding: var(--pp-sm) 0;\n  border-bottom: 1px solid var(--pp-hairline-soft);\n}\n\n.res-item:last-child { border-bottom: 0; }\n\n.res-item small {\n  color: var(--pp-muted);\n  font-size: 12px;\n  letter-spacing: 0.5px;\n}\n\n.area-grid {\n  display: grid;\n  gap: 0;\n  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));\n  border-top: 1px solid var(--pp-hairline);\n}\n\n.area-card {\n  display: flex;\n  flex-direction: column;\n  gap: var(--pp-xxs);\n  padding: var(--pp-lg);\n  border: 0;\n  border-bottom: 1px solid var(--pp-hairline);\n  border-right: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: var(--pp-canvas);\n}\n\n.area-card strong {\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 20px;\n  font-weight: 300;\n  letter-spacing: -0.3px;\n}\n\n.area-card span {\n  color: var(--pp-muted);\n  font-size: 12px;\n  letter-spacing: 0.5px;\n}\n\n/* ---------------------------------------------------------------- *\n * 7. 任务层级、筛选与表单\n * ---------------------------------------------------------------- */\n\n.filters {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-end;\n  gap: var(--pp-sm) var(--pp-md);\n  margin: 0 0 var(--pp-lg);\n  padding: 0 0 var(--pp-md);\n  border-bottom: 1px solid var(--pp-hairline);\n}\n\n.field {\n  display: flex;\n  flex-direction: column;\n  gap: var(--pp-xxs);\n  min-width: 132px;\n}\n\n.field label {\n  color: var(--pp-muted);\n  font-size: 11px;\n  font-weight: 400;\n  letter-spacing: 2px;\n  text-transform: uppercase;\n}\n\n.filters .link-btn { margin-bottom: var(--pp-sm); }\n\ninput[type=\"search\"],\nselect {\n  min-height: 42px;\n  padding: 10px 14px;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: var(--pp-canvas);\n  color: var(--pp-body);\n  font: inherit;\n  font-size: 14px;\n  font-weight: 300;\n}\n\ninput[type=\"search\"] { min-width: 210px; }\n\ninput[type=\"search\"]::placeholder { color: var(--pp-faint); }\n\ninput[type=\"search\"]:focus,\nselect:focus {\n  border-color: var(--pp-ink);\n  outline: none;\n}\n\n.task-set { margin: 0 0 var(--pp-xl); }\n\n.task-set > h3 {\n  margin: 0 0 var(--pp-sm);\n  padding-bottom: var(--pp-xs);\n  border-bottom: 1px solid var(--pp-hairline);\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 20px;\n  font-weight: 300;\n  letter-spacing: -0.3px;\n}\n\n.task-group { margin: 0 0 var(--pp-md); }\n\n.task-group > h4 {\n  margin: 0 0 var(--pp-xxs);\n  color: var(--pp-muted);\n  font-size: 11px;\n  font-weight: 400;\n  letter-spacing: 2px;\n  text-transform: uppercase;\n}\n\n/* 任务行：标题优先拿到宽度。\n   原来是 grid \"minmax(0,1fr) auto\"，右侧那组操作按钮（详情 / 在 Obsidian 打开 /\n   标记完成 / 完成并归档）按最大内容宽度占位；在半宽面板（例如 span-5 的\n   「知识缺口 / 学习计划」）里能把标题挤到只剩几个字宽，标题折行后每行只有几个字。\n   改成可换行的 flex：标题基准宽度 20em，放不下时操作按钮自己换到下一行。 */\n.task-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: var(--pp-xs) var(--pp-md);\n  padding: var(--pp-sm) 0;\n  border-bottom: 1px solid var(--pp-hairline-soft);\n}\n\n.task-row:last-child { border-bottom: 0; }\n\n.task-main { flex: 1 1 20em; min-width: 0; }\n\n.task-title { display: block; }\n\n.task-meta { margin-top: var(--pp-xxs); }\n\n.task-actions {\n  flex: 0 1 auto;\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  justify-content: flex-end;\n  gap: var(--pp-xxs) var(--pp-sm);\n}\n\n/* ---------------------------------------------------------------- *\n * 8. 今日任务监控与语义色\n * ---------------------------------------------------------------- */\n\n/* 今日任务监控：今天的任务清单 + 今天/未来几天的负载柱 */\n.today-monitor { display: grid; gap: var(--pp-xs); padding: 0 0 var(--pp-sm); }\n\n.today-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: var(--pp-xxs) var(--pp-sm);\n}\n\n.today-head strong { color: var(--pp-ink-1); font-size: 15px; }\n\n.today-load {\n  margin-left: auto;\n  color: var(--pp-muted);\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n}\n\n.today-load[data-over=\"true\"] { color: var(--pp-danger); }\n\n.today-tasks { margin-top: var(--pp-xxs); }\n\n/* 今日任务行的标题允许换行：单行省略号会把长标题截成\"只剩前几个字\" */\n.today-line { flex-wrap: wrap; align-items: flex-start; }\n\n.today-line .task-line-title {\n  white-space: normal;\n  overflow: visible;\n  text-overflow: clip;\n  overflow-wrap: anywhere;\n  line-height: 1.45;\n}\n\n.timeline-label {\n  margin: var(--pp-xs) 0 var(--pp-xxs);\n  color: var(--pp-ink-3);\n  font-size: 11px;\n  letter-spacing: 0.08em;\n}\n\n.day[data-today=\"true\"] .day-label { color: var(--pp-coral); font-weight: 600; }\n.day[data-today=\"true\"] .day-bar { border-color: rgba(255, 143, 163, 0.5); }\n\n/* ---------------------------------------------------------------- *\n * 9. 语义色\n * ---------------------------------------------------------------- */\n\n.timeline {\n  display: grid;\n  grid-auto-flow: column;\n  grid-auto-columns: 1fr;\n  gap: var(--pp-xs);\n  align-items: end;\n}\n\n.day {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: var(--pp-xs);\n}\n\n.day-bar {\n  display: flex;\n  align-items: flex-end;\n  width: 100%;\n  height: 92px;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: var(--pp-canvas);\n  overflow: hidden;\n}\n\n.day-fill {\n  width: 100%;\n  min-height: 2px;\n  border-radius: 0;\n  background: var(--pp-ink);\n}\n\n.day[data-overload=\"true\"] .day-fill { background: var(--pp-danger); }\n\n.day-label {\n  color: var(--pp-muted);\n  font-size: 11px;\n  letter-spacing: 0.5px;\n}\n\n.day-minutes {\n  color: var(--pp-faint);\n  font-size: 11px;\n  letter-spacing: 0.5px;\n}\n\n.day[data-overload=\"true\"] .day-minutes { color: var(--pp-danger); }\n\n/* ---------------------------------------------------------------- *\n * 9. 抽屉\n * ---------------------------------------------------------------- */\n\n.scrim {\n  position: fixed;\n  inset: 0;\n  z-index: 50;\n  background: rgba(10, 10, 10, 0.45);\n}\n\n.drawer {\n  position: fixed;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 60;\n  /* 92cqw 而不是 92vw：窄窗格里 92vw 会算出比窗格还宽的抽屉（460px 盖在 340px 的窗格上） */\n  width: min(460px, 92cqw);\n  overflow-y: auto;\n  padding: var(--pp-md) var(--pp-md) var(--pp-lg);\n  border-left: 1px solid var(--pp-hairline);\n  background: var(--pp-canvas);\n}\n\n.drawer[hidden] { display: none; }\n\n.drawer h2 {\n  margin: 0 0 var(--pp-xs);\n  color: var(--pp-ink);\n  font-family: var(--pp-serif);\n  font-size: 26px;\n  font-weight: 300;\n  letter-spacing: -0.4px;\n}\n\n.drawer .drawer-close {\n  display: block;\n  margin-left: auto;\n}\n\n.drawer-section {\n  margin-top: var(--pp-md);\n  padding-top: var(--pp-sm);\n  border-top: 1px solid var(--pp-hairline);\n}\n\n.drawer-section h3 {\n  margin: 0 0 var(--pp-xs);\n  color: var(--pp-muted);\n  font-size: 11px;\n  font-weight: 400;\n  letter-spacing: 2px;\n  text-transform: uppercase;\n}\n\n.drawer dl {\n  display: grid;\n  grid-template-columns: auto 1fr;\n  gap: var(--pp-xs) var(--pp-md);\n  margin: 0;\n  font-size: 14px;\n}\n\n.drawer dt { color: var(--pp-muted); }\n\n.drawer dd { margin: 0; color: var(--pp-body); }\n\n.path-box {\n  padding: var(--pp-xs) 10px;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 0;\n  background: var(--pp-canvas);\n  color: var(--pp-muted);\n  font-size: 12px;\n  letter-spacing: 0.5px;\n  overflow-wrap: anywhere;\n}\n\n.progress-line {\n  height: 1px;\n  margin-top: var(--pp-xs);\n  background: var(--pp-hairline);\n  border-radius: 0;\n  overflow: hidden;\n}\n\n.progress-line span {\n  display: block;\n  height: 1px;\n  background: var(--pp-ink);\n}\n\n/* ---------------------------------------------------------------- *\n * 10. 响应式：<640 单栏；640–1024 两栏\n * ---------------------------------------------------------------- */\n\n@media (max-width: 1024px) {\n  .masthead h1 {\n    font-size: 52px;\n    letter-spacing: -1.5px;\n  }\n\n  .kpi,\n  .span-3,\n  .span-4,\n  .span-5 { grid-column: span 6; }\n\n  .panel,\n  .span-6,\n  .span-7,\n  .span-8 { grid-column: span 12; }\n\n  /* 窄窗格里顶栏必须允许换行：.brand 是 flex:0 0 auto 的固定宽度，配合 nowrap 会把 .tabs\n     挤到 0 宽（实测 340px 窗格下 clientWidth=0，整排导航消失且不可点）。\n     注意不能给 .topbar 加 overflow-x:auto —— 它会把换行后的第二行（页签）裁在 60px 高的\n     盒子里，340/520px 窗格实测页签整排不可见（被下面的 hero 盖住，点也点不到）。\n     横向滚动交给 .tabs 自己。 */\n  .topbar { flex-wrap: wrap; }\n\n  .tabs { flex-wrap: nowrap; overflow-x: auto; }\n\n  .tab { flex: 0 0 auto; }\n}\n\n@media (max-width: 640px) {\n  body { font-size: 15px; }\n\n  .view { padding-top: var(--pp-lg); }\n\n  .masthead h1 {\n    font-size: 36px;\n    letter-spacing: -0.8px;\n  }\n\n  .focus-strip { padding-left: var(--pp-md); }\n\n  .focus-strip strong { font-size: 22px; }\n\n  .kpi,\n  .span-3,\n  .span-4,\n  .span-5,\n  .span-6,\n  .span-7,\n  .span-8,\n  .span-12 { grid-column: span 12; }\n\n  .kpi { padding: var(--pp-md) var(--pp-sm) var(--pp-sm); }\n\n  .kpi-value { font-size: 36px; letter-spacing: -0.8px; }\n\n  .waypoints { grid-template-columns: 1fr; }\n\n  .waypoint { border-right: 0; }\n\n  .panel-head,\n  .panel-body,\n  .project-card,\n  .area-card { padding-left: var(--pp-md); padding-right: var(--pp-md); }\n\n  .task-main { flex-basis: 100%; }\n\n  .task-actions { justify-content: flex-start; }\n\n  .project-list { grid-template-columns: 1fr; }\n\n  .area-grid { grid-template-columns: 1fr; }\n\n  .area-card { border-right: 0; }\n\n  .timeline { gap: var(--pp-xxs); }\n\n  .day-bar { height: 70px; }\n\n  .date-chip { display: none; }\n\n  input[type=\"search\"] { min-width: 0; width: 100%; }\n\n  .primary-btn { width: 100%; min-height: 48px; }\n\n  .drawer { width: 100%; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  /* MOTION.md 铁律 4：不能只把 duration 压到 0.001ms —— 带 animation-delay 的\n     交错序列会因此把内容压在半透明状态。必须是 animation / transition: none。 */\n  *, *::before, *::after {\n    animation: none !important;\n    transition: none !important;\n  }\n}\n\n/* =====================================================================\n * 夜航极光 · Nightfall Aurora（v0.3.0 配色系统）\n *\n * 与 Obsidian 插件 styles.css 末尾的「夜航极光」段同源：第 0 节的设计令牌逐条镜像，\n * 下面的组件规则只是把插件的 .pp-* 选择器换成这个静态站自己的\n * topbar / tab / panel / kpi / hero / waypoint / drawer。第 1–10 节的极简主义\n * 基线规则一行未动，本段全部是覆盖层。\n *\n * 设计目标：美观优先。保留「深夜书房」的深色血统，把配色、层级与质感整体重做。\n *\n *   0. 底色是带蓝调的墨紫，5 级抬升（bg-0…bg-4）：面板之间靠「层级 + 高光」区分，\n *      而不是靠描边；深色界面里堆描边会显脏。\n *   1. 描边用带紫调的半透明白，不用纯白 —— 纯白线在深紫底上会发灰。\n *   2. 主色落日珊瑚 #ff8fa3（只在一处发光），结构色极光青 #5fe3c0，\n *      信息色紫藤 #a78bfa，告警琥珀 #ffc46b，危险玫瑰 #ff5f7a。\n *   3. 颜色只承担少量信息量：状态先靠形状与位置，颜色只做强调。\n *   4. 玻璃面板 = 顶部一线高光 + 上亮下暗的极浅渐变 + 大范围柔和投影，做出「悬浮」感。\n *   5. 数字用等宽数字（tabular-nums），标题用负字距，营造精密感。\n *\n * 遮罩强度与文字色仍由 assets/manifest.json 的实测平均亮度（data-tone=\"light\"/\"dark\"）\n * 分档：亮图用较通透的遮罩 + 深色文字，暗图用重遮罩 + 浅色文字。\n * 想换配色：只改第 0 节令牌即可，下面所有规则都从令牌派生。\n * ===================================================================== */\n\n/* =====================================================================\n * 0. 设计令牌\n * ===================================================================== */\n\n:root {\n  /* ---- 底色：5 级抬升 ---- */\n  --pp-bg-0: #0a0814;\n  --pp-bg-1: #110e1f;\n  --pp-bg-2: #171331;\n  --pp-bg-3: #201a3d;\n  --pp-bg-4: #2a2350;\n\n  /* ---- 描边：带紫调的半透明白 ---- */\n  --pp-line-1: rgba(163, 148, 255, 0.14);\n  --pp-line-2: rgba(163, 148, 255, 0.28);\n  --pp-line-3: rgba(255, 255, 255, 0.05);\n\n  /* ---- 文字：4 级 ---- */\n  --pp-ink-1: #f6f3ff;\n  --pp-ink-2: #cfc8e6;\n  --pp-ink-3: #9890b4;\n  /* 最弱一档文字也要过 AA：旧值 #6a6288 在墨紫底上只有 2.91–3.51:1，\n     日期 chip、抽屉字段名、表单标签、占位符、页脚全部因此不达标。新值 4.74–5.72:1。 */\n  --pp-ink-4: #8d85a8;\n\n  /* ---- 主色：落日珊瑚 ---- */\n  --pp-coral: #ff8fa3;\n  --pp-coral-hi: #ffb7c5;\n  --pp-coral-soft: rgba(255, 143, 163, 0.14);\n\n  /* ---- 结构色 / 语义色 ---- */\n  --pp-mint: #5fe3c0;\n  --pp-mint-soft: rgba(95, 227, 192, 0.14);\n  --pp-lilac: #a78bfa;\n  --pp-lilac-soft: rgba(167, 139, 250, 0.16);\n  --pp-amber: #ffc46b;\n  --pp-amber-soft: rgba(255, 196, 107, 0.14);\n  --pp-rose: #ff5f7a;\n  --pp-rose-soft: rgba(255, 95, 122, 0.14);\n\n  /* ---- 玻璃与投影 ---- */\n  --pp-glass: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.022));\n  --pp-glass-strong: linear-gradient(180deg, rgba(255, 255, 255, 0.085), rgba(255, 255, 255, 0.035));\n  --pp-lift-1: 0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 10px 28px rgba(4, 2, 12, 0.42);\n  --pp-lift-2: 0 1px 0 rgba(255, 255, 255, 0.07) inset, 0 20px 48px rgba(4, 2, 12, 0.55);\n  --pp-glow: 0 0 0 1px var(--pp-coral-soft), 0 10px 30px rgba(255, 143, 163, 0.18);\n  /* 状态呼吸（ppd-pulse）的扩散色：显式定义成一个真令牌，而不是只活在 var() 的兜底里 ——\n     「看起来可配、实际配不到」的令牌是维护陷阱。 */\n  --pp-pulse-ring: rgba(255, 95, 122, 0.34);\n\n  /* ---- 渐变身份 ---- */\n  --pp-grad-cta: linear-gradient(120deg, #ff8fa3 0%, #ffb7c5 100%);\n  --pp-grad-active: linear-gradient(120deg, #ff8fa3 0%, #a78bfa 100%);\n  --pp-grad-fill: linear-gradient(90deg, #ff8fa3 0%, #a78bfa 100%);\n  --pp-grad-hero: linear-gradient(105deg, rgba(10, 8, 20, 0.94) 4%, rgba(23, 19, 49, 0.62) 48%, rgba(167, 139, 250, 0.14) 100%);\n  --pp-halo:\n    radial-gradient(920px 540px at 12% -10%, rgba(255, 143, 163, 0.18), transparent 62%),\n    radial-gradient(780px 500px at 92% 2%, rgba(167, 139, 250, 0.16), transparent 60%),\n    radial-gradient(940px 660px at 50% 112%, rgba(95, 227, 192, 0.10), transparent 62%);\n\n  /* ---- 圆角与节奏 ---- */\n  --pp-r-sm: 8px;\n  --pp-r-md: 12px;\n  --pp-r-lg: 16px;\n  --pp-r-xl: 20px;\n  --pp-r-pill: 999px;\n\n  /* ---- 兼容极简主义基线里的旧令牌名：全部指向新令牌，既有规则自动继承 ---- */\n  --pp-canvas: var(--pp-bg-0);\n  --pp-surface-light: var(--pp-bg-2);\n  --pp-surface-mid: var(--pp-bg-3);\n  --pp-ink: var(--pp-ink-1);\n  --pp-ink-soft: var(--pp-ink-1);\n  --pp-body: var(--pp-ink-2);\n  --pp-muted: var(--pp-ink-3);\n  --pp-faint: var(--pp-ink-4);\n  --pp-hairline: var(--pp-line-1);\n  --pp-hairline-soft: var(--pp-line-3);\n  --pp-on-ink: #1a1020;\n  --pp-success: var(--pp-mint);\n  --pp-warning: var(--pp-amber);\n  --pp-danger: var(--pp-rose);\n  --pp-accent: var(--pp-coral);\n  --pp-accent-strong: var(--pp-coral-hi);\n  --pp-accent-soft: var(--pp-coral-soft);\n  --pp-bar: rgba(255, 255, 255, 0.08);\n  --pp-shadow: var(--pp-lift-1);\n  --pp-shadow-lg: var(--pp-lift-2);\n\n  color-scheme: dark;\n}\n\n/* .theme-dark 也指向同一套取值：夜航极光本身就是深色，避免出现第二种深色 */\n.theme-dark {\n  --pp-canvas: var(--pp-bg-0);\n  --pp-surface-light: var(--pp-bg-2);\n  --pp-surface-mid: var(--pp-bg-3);\n  --pp-ink: var(--pp-ink-1);\n  --pp-ink-soft: var(--pp-ink-1);\n  --pp-body: var(--pp-ink-2);\n  --pp-muted: var(--pp-ink-3);\n  --pp-faint: var(--pp-ink-4);\n  --pp-hairline: var(--pp-line-1);\n  --pp-hairline-soft: var(--pp-line-3);\n  --pp-on-ink: #1a1020;\n  --pp-success: var(--pp-mint);\n  --pp-warning: var(--pp-amber);\n  --pp-danger: var(--pp-rose);\n  color-scheme: dark;\n}\n\n/* =====================================================================\n * 1. 画布与外壳\n * ===================================================================== */\n\n/* 页面底色：三层极光光晕 + 墨紫竖向渐变 */\nbody {\n  background: var(--pp-halo), linear-gradient(180deg, #110e1f 0%, #0a0814 100%);\n  background-attachment: fixed;\n  color: var(--pp-ink-2);\n}\n\n/* 基线的 .app 用不透明底色铺满整页，会把 body 的光晕盖掉 */\n.app { background: transparent; }\n\n::selection { background: rgba(255, 143, 163, 0.26); color: var(--pp-ink-1); }\n\n/* =====================================================================\n * 2. 顶部导航：胶囊 + 珊瑚/紫藤渐变高亮\n * ===================================================================== */\n\n.topbar {\n  /* .app 是列向 flex 容器：不给 flex-shrink:0 时，内容比窗格高就会把顶栏压回 min-height 60px，\n     窄窗格里换行出来的第二行（页签）于是被挤出顶栏盒子、又被下面的 hero 盖住\n     （340/520px 实测整排导航不可见、也点不到）。顶栏与页脚按内容高度，只有正文区伸缩。 */\n  flex: 0 0 auto;\n  border-bottom: 1px solid var(--pp-line-3);\n  background: rgba(10, 8, 20, 0.82);\n  backdrop-filter: blur(16px) saturate(140%);\n}\n\n.brand { color: var(--pp-ink-1); }\n.brand-text strong { color: var(--pp-ink-1); letter-spacing: -0.01em; }\n.brand-text small { color: var(--pp-ink-4); letter-spacing: 0.22em; }\n.date-chip { color: var(--pp-ink-3); }\n\n.tab {\n  padding: 7px 14px;\n  margin-right: 6px;\n  border: 1px solid transparent;\n  border-bottom: 1px solid transparent;\n  border-radius: var(--pp-r-pill);\n  background: transparent;\n  color: var(--pp-ink-3);\n  font-size: 13px;\n  font-weight: 400;\n  letter-spacing: 0.01em;\n  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;\n}\n\n.tab:hover,\n.tab:focus-visible {\n  color: var(--pp-ink-1);\n  background: rgba(255, 255, 255, 0.055);\n  border-color: var(--pp-line-1);\n  outline: none;\n}\n\n.tab[aria-current=\"page\"] {\n  background: var(--pp-grad-active);\n  border-color: transparent;\n  color: #1a1020;\n  font-weight: 600;\n  box-shadow: 0 6px 20px rgba(255, 143, 163, 0.26);\n}\n\n.tab[aria-current=\"page\"]:hover,\n.tab[aria-current=\"page\"]:focus-visible {\n  color: #1a1020;\n  background: var(--pp-grad-active);\n  filter: brightness(1.05);\n}\n\n.tab-count { color: inherit; }\n\n.tab[aria-current=\"page\"] .tab-count { color: #1a1020; }\n\n/* 主操作：珊瑚 → 浅珊瑚渐变胶囊 */\n.primary-btn {\n  border: 0;\n  border-radius: var(--pp-r-pill);\n  background: var(--pp-grad-cta);\n  color: #1a1020;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  box-shadow: 0 6px 20px rgba(255, 143, 163, 0.26);\n}\n\n.primary-btn:hover,\n.primary-btn:focus-visible {\n  background: var(--pp-grad-cta);\n  filter: brightness(1.06);\n  color: #1a1020;\n  outline: none;\n}\n\n.link-btn {\n  padding: 2px 8px;\n  border-bottom-color: transparent;\n  border-radius: var(--pp-r-pill);\n  color: var(--pp-coral);\n}\n\n.link-btn:hover,\n.link-btn:focus-visible {\n  color: var(--pp-coral-hi);\n  background: var(--pp-coral-soft);\n  border-bottom-color: transparent;\n  outline: none;\n}\n\n.row-title { color: var(--pp-ink-1); }\n.row-title:hover { color: var(--pp-coral-hi); }\n\n/* =====================================================================\n * 3. 页首与头图横幅\n * ===================================================================== */\n\n.hero {\n  position: relative;\n  isolation: isolate;\n  min-height: 210px;\n  display: flex;\n  align-items: flex-end;\n  overflow: hidden;\n  margin: 0 0 22px;\n  padding: 28px clamp(20px, 4cqw, 42px);\n  border: 1px solid var(--pp-line-2);\n  border-radius: var(--pp-r-xl);\n  background: var(--pp-grad-hero), linear-gradient(120deg, var(--pp-bg-3), var(--pp-bg-2));\n  background-position: center;\n  background-size: cover;\n  box-shadow: var(--pp-lift-2);\n}\n\n/* 取景**不改变**横幅形状：整屏宽下套 aspect-ratio 会把横幅拉成一大块\n   （用户报过\"主页横幅突然变得很宽\"）。取景由背景尺寸/位置负责：\n   宽度按取景框放大、纵向以取景中心为准 —— 横幅保持原来的矮条样式。 */\n\n/* 遮罩：暗图用重遮罩压住细节，亮图留出通透感；文字色由 tone 分档决定 */\n.hero::before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n  background: var(--pp-grad-hero);\n}\n\n.hero[data-tone=\"light\"]::before {\n  background: linear-gradient(105deg, rgba(10, 8, 20, 0.86) 4%, rgba(23, 19, 49, 0.46) 48%, rgba(167, 139, 250, 0.10) 100%);\n}\n\n.hero::after {\n  content: \"\";\n  position: absolute;\n  inset: auto -10% -45% 42%;\n  z-index: -1;\n  height: 180px;\n  border-radius: 50%;\n  background: rgba(167, 139, 250, 0.42);\n  filter: blur(46px);\n  opacity: 0.9;\n}\n\n.hero-copy { max-width: 680px; }\n.hero .eyebrow { color: var(--pp-coral-hi); }\n\n.hero h1 {\n  margin: 10px 0 8px;\n  color: #ffffff;\n  font-size: clamp(1.7em, 3.4cqw, 2.7em);\n  font-weight: 400;\n  line-height: 1.06;\n  letter-spacing: -0.025em;\n  text-shadow: 0 2px 24px rgba(4, 2, 12, 0.6);\n}\n\n.hero-sub { margin: 0; color: rgba(255, 255, 255, 0.82); }\n\n.hero-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 12px 0 0; }\n.hero-meta .eyebrow { color: rgba(255, 255, 255, 0.66); }\n\n/* =====================================================================\n * 4. 统计卡与今日焦点\n * ===================================================================== */\n\n/* 玻璃面板：上亮下暗的极浅渐变 + 1px 紫调描边 + 大范围柔和投影 */\n.panel,\n.kpi,\n.project-card,\n.task-set,\n.area-card,\n.path-box,\n.filters {\n  border: 1px solid var(--pp-line-1);\n  border-radius: var(--pp-r-lg);\n  background: var(--pp-glass);\n  box-shadow: var(--pp-lift-1);\n  backdrop-filter: blur(10px);\n}\n\n.panel { overflow: hidden; }\n.panel-head { border-bottom: 1px solid var(--pp-line-3); }\n.panel-head h2, .panel h2 { color: var(--pp-ink-1); letter-spacing: -0.01em; }\n.panel-head p { color: var(--pp-ink-3); }\n\n.kpi {\n  position: relative;\n  overflow: hidden;\n  min-height: 104px;\n  padding: 18px 20px;\n  /* 悬停位移统一走 --pp-mo-lift（MOTION.md 第 1 节），这样两个渲染面抬升幅度一致 */\n  transition: transform var(--pp-mo-fast) var(--pp-mo-ease), border-color var(--pp-mo-fast) var(--pp-mo-ease), box-shadow var(--pp-mo-fast) var(--pp-mo-ease);\n}\n\n.kpi:hover {\n  transform: translateY(var(--pp-mo-lift, -3px));\n  border-color: var(--pp-line-2);\n  box-shadow: var(--pp-lift-2);\n}\n\n/* 顶部一线渐变色带：比左侧色条更克制，也更有整体感 */\n.kpi::after {\n  content: \"\";\n  position: absolute;\n  inset: 0 0 auto 0;\n  height: 2px;\n  background: var(--pp-grad-fill);\n  opacity: 0.9;\n}\n\n.kpi:nth-child(2)::after { background: linear-gradient(90deg, var(--pp-lilac), var(--pp-mint)); }\n.kpi:nth-child(3)::after { background: linear-gradient(90deg, var(--pp-rose), var(--pp-amber)); }\n.kpi:nth-child(4)::after { background: linear-gradient(90deg, var(--pp-mint), var(--pp-lilac)); }\n\n.kpi-value {\n  color: var(--pp-ink-1);\n  font-variant-numeric: tabular-nums;\n  letter-spacing: -0.03em;\n}\n\n.kpi-label, .kpi-hint { color: var(--pp-ink-3); }\n.kpi-hint { letter-spacing: 0.06em; }\n\n/* 进度条：底 rgba(255,255,255,.08)，填充珊瑚 → 紫藤 */\n.kpi-bar,\n.progress-bar,\n.drawer .progress-line {\n  background: rgba(255, 255, 255, 0.08);\n  border-radius: var(--pp-r-pill);\n  overflow: hidden;\n}\n\n.kpi-bar { height: 4px; }\n.kpi-bar span { display: block; height: 100%; background: var(--pp-grad-fill); border-radius: inherit; }\n\n.progress-bar { height: 6px; }\n.progress-fill { display: block; height: 6px; background: var(--pp-grad-fill); border-radius: inherit; }\n.progress-value { color: var(--pp-ink-1); font-variant-numeric: tabular-nums; }\n\n/* 项目卡：解除基线里 1px 容器对百分比文字的裁切，改成「百分比 + 6px 进度条」 */\n.project-card .progress-line { height: auto; overflow: visible; background: transparent; }\n\n.drawer .progress-line { height: 6px; margin-top: var(--pp-sm); }\n.drawer .progress-line > span { display: block; height: 100%; background: var(--pp-grad-fill); border-radius: inherit; }\n\n/* 今日焦点：左侧 3px 珊瑚边 + 珊瑚到紫藤的极浅渐变 */\n.focus-strip {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 14px;\n  padding: 18px 22px;\n  border: 1px solid rgba(255, 143, 163, 0.30);\n  border-left: 3px solid var(--pp-coral);\n  border-radius: var(--pp-r-lg);\n  background: linear-gradient(96deg, rgba(255, 143, 163, 0.13), rgba(167, 139, 250, 0.07) 58%, transparent);\n  box-shadow: var(--pp-lift-1);\n}\n\n.focus-strip .eyebrow { color: var(--pp-coral-hi); font-weight: 600; letter-spacing: 0.14em; }\n.focus-strip strong { color: var(--pp-ink-1); letter-spacing: -0.01em; }\n.focus-hint { color: var(--pp-ink-3); }\n\n/* =====================================================================\n * 5. 图像导航卡\n * ===================================================================== */\n\n.waypoints { gap: 14px; margin-bottom: 22px; border-top: 0; }\n\n.waypoint {\n  /* 图片遮罩 ::before 用 absolute + inset:0：卡片必须是包含块，否则伪元素会按初始包含块\n     撑成整页大小（实测 1100×2300 而不是 315×168），遮罩等于失效。isolation 让 z-index:-1\n     的伪元素停在卡片自己的堆叠上下文里，不会沉到宿主背景之下。 */\n  position: relative;\n  isolation: isolate;\n  display: flex;\n  flex-direction: column;\n  justify-content: flex-end;\n  align-items: flex-start;\n  gap: 6px;\n  min-height: 168px;\n  padding: 20px;\n  border: 1px solid var(--pp-line-1);\n  border-radius: var(--pp-r-xl);\n  background: linear-gradient(120deg, var(--pp-bg-3), var(--pp-bg-2));\n  background-position: center;\n  background-size: cover;\n  color: var(--pp-ink-1);\n  text-align: left;\n  transition: transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 200ms ease, border-color 200ms ease;\n}\n\n/* 基线给最后一列去掉了右边框；这里面板本身有完整描边，需要补回来 */\n.waypoint:last-child { border-right: 1px solid var(--pp-line-1); }\n\n.waypoint::before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n  background: linear-gradient(180deg, rgba(10, 8, 20, 0.10) 0%, rgba(10, 8, 20, 0.72) 58%, rgba(10, 8, 20, 0.94) 100%);\n}\n\n/* 亮图：遮罩更通透，文字转深色 */\n.waypoint[data-tone=\"light\"]::before {\n  background: linear-gradient(180deg, rgba(246, 243, 255, 0.10) 0%, rgba(246, 243, 255, 0.58) 58%, rgba(246, 243, 255, 0.90) 100%);\n}\n\n.waypoint[data-tone=\"light\"] .waypoint-title { color: #1a1020; }\n.waypoint[data-tone=\"light\"] .waypoint-description { color: rgba(26, 16, 32, 0.78); }\n.waypoint[data-tone=\"dark\"] .waypoint-title { color: #ffffff; }\n.waypoint[data-tone=\"dark\"] .waypoint-description { color: rgba(255, 255, 255, 0.80); }\n\n.waypoint:hover,\n.waypoint:focus-visible {\n  transform: translateY(var(--pp-mo-lift, -3px));\n  border-color: rgba(255, 143, 163, 0.5);\n  box-shadow: var(--pp-glow), var(--pp-lift-2);\n  outline: none;\n}\n\n.waypoint-eyebrow { color: var(--pp-coral-hi); font-weight: 600; letter-spacing: 0.16em; }\n.waypoint-title { letter-spacing: -0.015em; }\n.waypoint-description { font-size: 0.95em; }\n\n/* =====================================================================\n * 6. 列表与行\n * ===================================================================== */\n\n.task-set { padding: 18px 20px; }\n.task-set > h3, .task-group > h4 { color: var(--pp-ink-4); letter-spacing: 0.06em; }\n\n.project-card { padding: 18px; }\n.project-head h3, .project-head .row-title { color: var(--pp-ink-1); }\n.project-sub { color: var(--pp-ink-3); }\n.project-outcome { color: var(--pp-ink-2); }\n.project-foot { border-top: 1px solid var(--pp-line-3); }\n\n.task-row { border-bottom: 1px solid var(--pp-line-3); }\n.task-row:hover { background: linear-gradient(90deg, rgba(255, 143, 163, 0.06), rgba(255, 255, 255, 0.02)); }\n.task-title { color: var(--pp-ink-1); }\n.task-meta, .meta-row { color: var(--pp-ink-3); }\n\n/* 已完成的任务：留在列表里（排序把它沉到任务组底部），名字打删除线并转灰。\n   只弱化\"名字 + 元信息\"，不整行降透明度 —— 日期/项目仍要能看清。 */\n.task-row.is-done .task-title,\n.task-line.is-done .task-line-title { text-decoration: line-through; color: var(--pp-faint); }\n.task-row.is-done .task-meta { opacity: 0.72; }\n.task-row.is-done .task-line-due { opacity: 0.8; }\n\n/* 「撤销」= 撤回上一次「本周期完成」：用强调色点出来，但仍是弱按钮，不和主操作抢注意力 */\n.task-actions .is-undo { color: var(--pp-coral); }\n.task-actions .is-undo:hover { text-decoration: underline; }\n\n.res-item { border-bottom: 1px solid var(--pp-line-3); }\n.res-item:hover { background: rgba(255, 255, 255, 0.04); }\n\n.empty { color: var(--pp-ink-3); }\n.empty strong { color: var(--pp-ink-2); }\n.path-box { color: var(--pp-ink-3); }\n.area-card strong { color: var(--pp-ink-1); }\n.area-card span { color: var(--pp-ink-3); }\n\n/* 徽标：按 data-status / data-tone 上色，底为对应 -soft，描边同色 34% */\n.chip {\n  border: 1px solid var(--pp-line-1);\n  border-radius: var(--pp-r-pill);\n  background: rgba(255, 255, 255, 0.05);\n  color: var(--pp-ink-3);\n}\n\n.chip[data-status=\"planning\"],\n.chip[data-status=\"todo\"] {\n  background: var(--pp-lilac-soft);\n  border-color: rgba(167, 139, 250, 0.34);\n  color: var(--pp-lilac);\n}\n\n.chip[data-status=\"doing\"],\n.chip[data-status=\"active\"] {\n  background: var(--pp-mint-soft);\n  border-color: rgba(95, 227, 192, 0.34);\n  color: var(--pp-mint);\n}\n\n.chip[data-status=\"blocked\"],\n.chip[data-status=\"expired\"] {\n  background: var(--pp-rose-soft);\n  border-color: rgba(255, 95, 122, 0.36);\n  color: var(--pp-rose);\n}\n\n.chip[data-status=\"paused\"] {\n  background: var(--pp-amber-soft);\n  border-color: rgba(255, 196, 107, 0.34);\n  color: var(--pp-amber);\n}\n\n.chip[data-status=\"done\"],\n.chip[data-status=\"completed\"],\n.chip[data-status=\"archived\"],\n.chip[data-tone=\"muted\"] {\n  background: rgba(255, 255, 255, 0.05);\n  border-color: var(--pp-line-1);\n  color: var(--pp-ink-2);\n}\n\n.chip[data-tone=\"warn\"],\n.chip[data-priority=\"medium\"] {\n  background: var(--pp-amber-soft);\n  border-color: rgba(255, 196, 107, 0.34);\n  color: var(--pp-amber);\n}\n\n.chip[data-tone=\"danger\"],\n.chip[data-priority=\"high\"] {\n  background: var(--pp-rose-soft);\n  border-color: rgba(255, 95, 122, 0.36);\n  color: var(--pp-rose);\n}\n\n.chip[data-priority=\"low\"] {\n  background: rgba(255, 255, 255, 0.05);\n  border-color: var(--pp-line-1);\n  color: var(--pp-ink-4);\n}\n\n/* 时间规划柱状：底槽 + 珊瑚/紫藤与玫瑰/琥珀两组渐变 */\n.timeline .day-bar {\n  border: 1px solid var(--pp-line-1);\n  border-radius: var(--pp-r-md);\n  background: rgba(255, 255, 255, 0.08);\n}\n\n.timeline .day-fill {\n  background: linear-gradient(180deg, var(--pp-coral), var(--pp-lilac));\n  border-radius: inherit;\n}\n\n.timeline .day[data-overload=\"true\"] .day-fill {\n  background: linear-gradient(180deg, var(--pp-rose), var(--pp-amber));\n}\n\n.timeline .day-label, .timeline .day-minutes { color: var(--pp-ink-3); }\n.timeline .day[data-overload=\"true\"] .day-minutes { color: var(--pp-rose); }\n\n/* =====================================================================\n * 7. 表单与筛选\n * ===================================================================== */\n\n.filters { padding: 18px 20px; border-bottom: 1px solid var(--pp-line-1); }\n\n.field label { color: var(--pp-ink-4); letter-spacing: 0.06em; }\n\ninput[type=\"search\"],\nselect,\n.field input,\n.field select {\n  border: 1px solid var(--pp-line-1);\n  border-radius: var(--pp-r-pill);\n  background: rgba(255, 255, 255, 0.05);\n  color: var(--pp-ink-2);\n  transition: border-color 140ms ease, box-shadow 140ms ease;\n}\n\ninput[type=\"search\"]:focus,\nselect:focus,\n.field input:focus,\n.field select:focus {\n  border-color: rgba(255, 143, 163, 0.55);\n  box-shadow: 0 0 0 3px var(--pp-coral-soft);\n  outline: none;\n}\n\ninput[type=\"search\"]::placeholder,\n.field input::placeholder { color: var(--pp-ink-4); }\n\n/* =====================================================================\n * 8. 详情抽屉与页脚\n * ===================================================================== */\n\n.drawer {\n  border-left: 1px solid var(--pp-line-2);\n  background: linear-gradient(180deg, rgba(23, 19, 49, 0.96), rgba(17, 14, 31, 0.96));\n  box-shadow: 0 30px 80px rgba(4, 2, 12, 0.65);\n  backdrop-filter: blur(16px);\n  color: var(--pp-ink-2);\n}\n\n.drawer h2, .drawer-section h3 { color: var(--pp-ink-1); }\n.drawer dt { color: var(--pp-ink-4); }\n.drawer dd { color: var(--pp-ink-2); }\n.drawer-section { border-top: 1px solid var(--pp-line-3); }\n\n.scrim { background: rgba(6, 4, 14, 0.62); }\n\n.footer { border-top: 1px solid var(--pp-line-1); color: var(--pp-ink-3); flex: 0 0 auto; }\n.footer strong { color: var(--pp-ink-1); }\n.footer code {\n  background: rgba(255, 255, 255, 0.05);\n  border: 1px solid var(--pp-line-1);\n  border-radius: var(--pp-r-sm);\n  color: var(--pp-coral-hi);\n}\n\n/* =====================================================================\n * 10. 空库引导\n * ===================================================================== */\n\n/* 整库没有项目也没有任务时出现：光看空面板会让人以为「插件坏了」，\n   这里直接说明数据从哪来、下一步点哪里。 */\n.onboarding {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 6px;\n  margin-bottom: 22px;\n  padding: 20px 22px;\n  border: 1px solid var(--pp-line-2);\n  border-radius: var(--pp-r-xl);\n  background: var(--pp-glass), linear-gradient(120deg, var(--pp-bg-3), var(--pp-bg-2));\n  box-shadow: var(--pp-lift-1);\n}\n\n.onboarding strong {\n  color: var(--pp-ink-1);\n  font-size: 17px;\n  font-weight: 500;\n}\n\n.onboarding .onboarding-hint {\n  color: var(--pp-ink-3);\n  font-size: 13px;\n}\n\n.onboarding-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 10px;\n  margin-top: 8px;\n}\n\n/* =====================================================================\n * 9. 滚动条、动效与响应式\n * ===================================================================== */\n\n::-webkit-scrollbar { width: 10px; height: 10px; }\n::-webkit-scrollbar-track { background: transparent; }\n::-webkit-scrollbar-thumb { background: rgba(255, 143, 163, 0.22); border-radius: var(--pp-r-pill); }\n::-webkit-scrollbar-thumb:hover { background: rgba(255, 143, 163, 0.34); }\n\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after {\n    animation: none !important;\n    transition: none !important;\n  }\n  /* 悬停位移一并归零：只关动画不够，位移来自 :hover 的 transform */\n  .waypoint:hover, .waypoint:focus-visible, .kpi:hover, .kpi:focus-visible,\n  .primary-btn:hover, .primary-btn:focus-visible, .primary-btn:active { transform: none; }\n  /* 指针跟随光晕：减少动效环境下不出现（它只靠动效表达，也拿不到有意义的指针位置） */\n  .kpi::before, .waypoint::after { opacity: 0 !important; }\n}\n\n@media (max-width: 1024px) {\n  .waypoints { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n}\n\n@media (max-width: 640px) {\n  .hero { min-height: 160px; padding: 22px 18px; border-radius: var(--pp-r-lg); }\n  .hero h1 { font-size: 1.6em; }\n  .waypoints { grid-template-columns: 1fr; }\n  .waypoint { min-height: 132px; }\n  .focus-strip .link-btn { margin-left: 0; }\n  /* 窄窗格里页签溢出成横向滚动条：右侧渐隐提示\"还有页签在右边\"。\n     没有这个提示时，375px 窗格里只看得见前 4 个页签，用户根本不知道「数据」页签存在。 */\n  .tabs {\n    flex-wrap: nowrap;\n    overflow-x: auto;\n    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 16px), transparent 100%);\n    mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 16px), transparent 100%);\n  }\n  .tab { flex: 0 0 auto; margin-right: 4px; }\n}\n\n/* =====================================================================\n * 11. 浅色主题：跟随 Obsidian（moonstone 等浅色主题）\n *\n * 深色血统的夜航极光在浅色 Obsidian 里是一个突兀的深色孤岛，所以这里给出同一套令牌的\n * 浅色取值：纸白 5 级抬升 + 4 级深墨 + 压深一档的强调色。只重映射令牌与少量写死的深色底\n * （顶栏 / 抽屉 / 遮罩），其余组件规则一行不动 —— 这套设计本来就是令牌驱动的。\n * 图片上的遮罩（hero / waypoint）保持深色：它们压在照片上，白字才读得清。\n * 对比度：最弱一档文字 5.5:1（@ bg-3），正文 12:1 以上，AA 全部通过。\n * ===================================================================== */\n\n.theme-light {\n  --pp-bg-0: #f2f2f4;\n  --pp-bg-1: #fbfbfc;\n  --pp-bg-2: #ffffff;\n  --pp-bg-3: #f4f4f6;\n  --pp-bg-4: #e9e9ef;\n\n  --pp-line-1: rgba(24, 18, 44, 0.14);\n  --pp-line-2: rgba(24, 18, 44, 0.26);\n  --pp-line-3: rgba(24, 18, 44, 0.06);\n\n  --pp-ink-1: #14111d;\n  --pp-ink-2: #2f2b3c;\n  --pp-ink-3: #4a4658;\n  --pp-ink-4: #625e78;\n\n  --pp-coral: #c93b58;\n  --pp-coral-hi: #e26a83;\n  --pp-coral-soft: rgba(201, 59, 88, 0.12);\n\n  --pp-mint: #137a5b;\n  --pp-mint-soft: rgba(19, 122, 91, 0.12);\n  --pp-lilac: #5b46c8;\n  --pp-lilac-soft: rgba(91, 70, 200, 0.12);\n  --pp-amber: #8f5200;\n  --pp-amber-soft: rgba(143, 82, 0, 0.12);\n  --pp-rose: #b3223c;\n  --pp-rose-soft: rgba(179, 34, 60, 0.12);\n\n  --pp-glass: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.72));\n  --pp-glass-strong: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.88));\n  --pp-lift-1: 0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 8px 24px rgba(20, 16, 40, 0.10);\n  --pp-lift-2: 0 1px 0 rgba(255, 255, 255, 0.8) inset, 0 16px 40px rgba(20, 16, 40, 0.16);\n  --pp-glow: 0 0 0 1px rgba(201, 59, 88, 0.18), 0 8px 24px rgba(201, 59, 88, 0.14);\n  --pp-pulse-ring: rgba(179, 34, 60, 0.34);\n\n  --pp-grad-cta: linear-gradient(120deg, #c93b58 0%, #e26a83 100%);\n  --pp-grad-active: linear-gradient(120deg, #c93b58 0%, #5b46c8 100%);\n  --pp-grad-fill: linear-gradient(90deg, #c93b58 0%, #5b46c8 100%);\n  --pp-halo:\n    radial-gradient(920px 540px at 12% -10%, rgba(201, 59, 88, 0.10), transparent 62%),\n    radial-gradient(780px 500px at 92% 2%, rgba(91, 70, 200, 0.09), transparent 60%),\n    radial-gradient(940px 660px at 50% 112%, rgba(19, 122, 91, 0.07), transparent 62%);\n\n  --pp-on-ink: #ffffff;\n\n  /* 动效节奏：浅色与深色取值**相同**（MOTION.md 第 1 节：两个令牌块都要有） */\n  --pp-mo-instant: 90ms;\n  --pp-mo-fast: 140ms;\n  --pp-mo-base: 220ms;\n  --pp-mo-slow: 380ms;\n  --pp-mo-enter: 480ms;\n  --pp-mo-ambient: 14s;\n  --pp-mo-stagger: 45ms;\n  --pp-mo-ease: cubic-bezier(0.22, 0.61, 0.36, 1);\n  --pp-mo-ease-out: cubic-bezier(0.16, 1, 0.3, 1);\n  --pp-mo-spring: cubic-bezier(0.34, 1.56, 0.64, 1);\n  --pp-mo-lift: -3px;\n\n  color-scheme: light;\n\n  /* Aurora 的页面底色是写死的墨紫竖向渐变（浏览器版作用在 body 上，插件里就是 :host），\n     只换令牌换不掉它 —— 浅色主题下整个画布会保持深色，看起来像只有顶栏变浅了。 */\n  background: var(--pp-halo), linear-gradient(180deg, #fbfbfc 0%, #f2f2f4 100%);\n  background-attachment: fixed;\n}\n\n/* 这几处原本写死了墨紫底，浅色主题下必须换掉，否则仍是深色块 */\n.theme-light .topbar { background: rgba(255, 255, 255, 0.86); border-bottom-color: var(--pp-line-3); }\n.theme-light .drawer { background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(248, 248, 251, 0.97)); }\n.theme-light .scrim { background: rgba(24, 18, 44, 0.32); }\n.theme-light .footer code { background: rgba(24, 18, 44, 0.05); }\n.theme-light ::selection { background: rgba(201, 59, 88, 0.20); color: var(--pp-ink-1); }\n\n/* ------------------------------------------------------------------ *\n * 13. 阻塞与任务状态（任务级）\n * 阻塞是任务的状态之一（规划中 / 待办 / 完成 / 阻塞），不再有独立的阻塞项卡片：\n * 项目卡片右上角的红点数字、关键节点标红，都由\"该项目里有多少 blocked 任务\"推导。\n * ------------------------------------------------------------------ */\n\n.project-card { position: relative; }\n\n.project-card .blocked-badge {\n  position: absolute;\n  top: 12px;\n  right: 12px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 22px;\n  height: 22px;\n  padding: 0 6px;\n  border-radius: 999px;\n  background: var(--pp-danger);\n  color: #fff;\n  font-size: 12px;\n  font-weight: 700;\n  line-height: 1;\n  box-shadow: 0 0 0 3px rgba(255, 107, 129, 0.16);\n}\n\n/* 关键节点（含阻塞任务）整体标红 */\n.chip[data-tone=\"blocked\"] {\n  border-color: var(--pp-danger);\n  color: var(--pp-danger);\n  background: rgba(255, 107, 129, 0.12);\n}\n\n.res-item.is-blocked {\n  padding-left: 10px;\n  border-left: 3px solid var(--pp-danger);\n}\n\n.res-item.is-blocked > span { color: var(--pp-danger); }\n\n/* 任务状态四选一 */\n.status-picker {\n  display: inline-flex;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n\n.status-option {\n  padding: 4px 12px;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 999px;\n  background: transparent;\n  color: var(--pp-muted);\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.status-option:hover {\n  border-color: var(--pp-line-2);\n  color: var(--pp-ink-1);\n}\n\n.status-option.is-active {\n  border-color: var(--pp-coral);\n  background: var(--pp-coral-soft);\n  color: var(--pp-coral-hi);\n}\n\n.status-option[data-status=\"done\"].is-active {\n  border-color: var(--pp-success);\n  background: rgba(76, 217, 158, 0.14);\n  color: var(--pp-success);\n}\n\n.status-option[data-status=\"blocked\"].is-active {\n  border-color: var(--pp-danger);\n  background: rgba(255, 107, 129, 0.14);\n  color: var(--pp-danger);\n}\n\n.status-picker-hint {\n  margin: 8px 0 0;\n  color: var(--pp-muted);\n  font-size: 12px;\n}\n/* 项目详情：关键节点导航条（每个节点一个页签，下面挂该节点的任务） */\n.milestone-nav {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: var(--pp-sm);\n}\n\n.milestone-tab {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 10px;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 999px;\n  background: transparent;\n  color: var(--pp-muted);\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.milestone-tab:hover { border-color: var(--pp-line-2); color: var(--pp-ink-1); }\n\n.milestone-tab.is-active {\n  border-color: var(--pp-coral);\n  background: var(--pp-coral-soft);\n  color: var(--pp-coral-hi);\n}\n\n/* 含阻塞任务的节点整体标红 */\n.milestone-tab.is-blocked {\n  border-color: var(--pp-danger);\n  color: var(--pp-danger);\n}\n\n.milestone-tab.is-blocked.is-active {\n  background: rgba(255, 107, 129, 0.16);\n}\n\n.milestone-count {\n  padding: 0 6px;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.08);\n  font-size: 11px;\n}\n\n.milestone-body { margin-bottom: var(--pp-sm); }\n\n/* 关键节点 / 孤立任务里的任务列表：一条任务只占一行，省空间。\n   以前一条任务摊开 7–9 个标签，窄抽屉里每个标签各占一行 —— 单条能撑到 350px+。 */\n.task-list {\n  display: flex;\n  flex-direction: column;\n  border-top: 1px solid var(--pp-hairline-soft);\n}\n\n.task-line {\n  display: flex;\n  align-items: center;\n  gap: var(--pp-xs);\n  min-height: 28px;\n  padding: 2px 0;\n  border-bottom: 1px solid var(--pp-hairline-soft);\n}\n\n.task-line:hover,\n.task-line:focus-within { background: var(--pp-surface-light); }\n\n.task-line-dot {\n  flex: 0 0 auto;\n  width: 7px;\n  height: 7px;\n  margin-left: 2px;\n  border-radius: 50%;\n  background: var(--pp-faint);\n}\n\n.task-line-dot[data-status=\"planning\"] { background: var(--pp-muted); }\n.task-line-dot[data-status=\"todo\"],\n.task-line-dot[data-status=\"doing\"] { background: var(--pp-ink); }\n.task-line-dot[data-status=\"done\"],\n.task-line-dot[data-status=\"completed\"] { background: var(--pp-success); }\n.task-line-dot[data-status=\"blocked\"],\n.task-line-dot[data-status=\"expired\"] { background: var(--pp-danger); }\n.task-line-dot[data-status=\"archived\"] { background: var(--pp-hairline); }\n\n.task-line-title {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  padding: 0;\n  border: 0;\n  background: none;\n  color: var(--pp-ink);\n  font: inherit;\n  text-align: left;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.task-line-title:hover { text-decoration: underline; }\n\n.task-line[data-status=\"done\"] .task-line-title,\n.task-line[data-status=\"archived\"] .task-line-title {\n  color: var(--pp-muted);\n  text-decoration: line-through;\n}\n\n.task-line-meta {\n  flex: 0 0 auto;\n  display: inline-flex;\n  align-items: center;\n  gap: var(--pp-xs);\n  color: var(--pp-muted);\n  font-size: 11px;\n  white-space: nowrap;\n}\n\n.task-line-due[data-tone=\"overdue\"] { color: var(--pp-danger); }\n.task-line-due[data-tone=\"today\"] { color: var(--pp-warning); }\n.task-line-priority { color: var(--pp-danger); }\n.task-line-note { max-width: 12ch; overflow: hidden; text-overflow: ellipsis; }\n.task-line-note[data-tone=\"blocked\"] { color: var(--pp-danger); }\n\n.task-line-act {\n  flex: 0 0 auto;\n  padding: 1px 6px;\n  border: 1px solid transparent;\n  background: none;\n  color: var(--pp-muted);\n  font-size: 11px;\n  cursor: pointer;\n}\n\n.task-line:hover .task-line-act,\n.task-line:focus-within .task-line-act { border-color: var(--pp-hairline); color: var(--pp-ink); }\n.task-line-act:hover { border-color: var(--pp-ink); }\n\n/* 任务抽屉左上角的返回箭头（从项目详情点进来时出现） */\n.drawer-back {\n  position: absolute;\n  top: 14px;\n  left: 18px;\n  z-index: 2;\n}\n/* ------------------------------------------------------------------ *\n * 14. 详情页字段直改 + 任务拆解编辑\n * 目标是\"看着还是文档，点进去就能改\"：控件平时近乎透明，悬停/聚焦才显出边界。\n * ------------------------------------------------------------------ */\n\n.field-list { display: flex; flex-direction: column; gap: 10px; }\n\n.field-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-height: 26px;\n}\n\n.field-label {\n  flex: 0 0 108px;\n  color: var(--pp-muted);\n  font-size: 12px;\n}\n\n.field-readonly-row { gap: 10px; }\n\n.field-readonly {\n  flex: 1 1 auto;\n  color: var(--pp-ink-2);\n  font-size: 13px;\n}\n\n.field-input {\n  flex: 1 1 auto;\n  min-width: 0;\n  padding: 4px 8px;\n  border: 1px solid transparent;\n  border-radius: var(--pp-r-sm, 6px);\n  background: rgba(255, 255, 255, 0.03);\n  color: var(--pp-ink-1);\n  font: inherit;\n  font-size: 13px;\n}\n\n.field-input:hover { border-color: var(--pp-hairline); background: rgba(255, 255, 255, 0.06); }\n\n.field-input:focus {\n  outline: none;\n  border-color: var(--pp-coral);\n  background: rgba(255, 255, 255, 0.08);\n  box-shadow: 0 0 0 3px var(--pp-coral-soft);\n}\n\n.field-textarea { resize: vertical; line-height: 1.5; }\n\n/* 多选（重复周几）：一组复选框排成一行，窄窗格里自动换行。\n   选中态不靠颜色单独表达 —— 勾选框本身就在，focus-visible 也另给轮廓。 */\n.field-multi {\n  flex: 1 1 auto;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  min-width: 0;\n}\n\n.field-multi-item {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  color: var(--pp-ink-2);\n  font-size: 12px;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.field-multi-item:hover { color: var(--pp-ink-1); }\n\n.field-multi-item input { margin: 0; }\n\n.field-multi-item input:focus-visible { outline: 2px solid var(--pp-coral); outline-offset: 2px; }\n\n.field-hint { margin: 10px 0 0; color: var(--pp-faint); font-size: 12px; }\n\n.checklist { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }\n\n.checklist-row { display: flex; align-items: center; gap: 8px; }\n\n.checklist-row.is-done .checklist-text { color: var(--pp-muted); text-decoration: line-through; }\n\n.checklist-toggle {\n  flex: 0 0 auto;\n  width: 22px;\n  height: 22px;\n  padding: 0;\n  border: 1px solid var(--pp-hairline);\n  border-radius: 6px;\n  background: transparent;\n  color: var(--pp-ink-1);\n  cursor: pointer;\n}\n\n.checklist-toggle:hover { border-color: var(--pp-coral); color: var(--pp-coral-hi); }\n\n.checklist-remove { flex: 0 0 auto; opacity: 0.65; }\n\n.checklist-remove:hover { opacity: 1; }\n/* 可点的节点 chip（项目卡上）：平时和普通 chip 一样，悬停/聚焦才显出可点 */\n.chip-button {\n  font: inherit;\n  color: inherit;\n  cursor: pointer;\n}\n\n.chip-button:hover,\n.chip-button:focus-visible {\n  border-color: var(--pp-coral);\n  color: var(--pp-coral-hi);\n  outline: none;\n  box-shadow: 0 0 0 3px var(--pp-coral-soft);\n}\n/* 今日焦点条：分桶计数 + 接下来三条（每条可就地标记完成） */\n.focus-counts { margin-top: 10px; }\n\n.focus-list {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin: 12px 0 0;\n  padding: 0;\n  list-style: none;\n}\n\n.focus-item {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n}\n\n.focus-item .row-title { flex: 1 1 auto; min-width: 0; text-align: left; }\n\n.focus-empty { margin: 12px 0 0; color: var(--pp-muted); font-size: 13px; }\n/* 草稿箱多选与内联字段（周维护：导入为任务集） */\n.draft-check {\n  flex: 0 0 auto;\n  margin-right: 8px;\n}\n\n.field-inline {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--pp-muted);\n  font-size: 12px;\n}\n\n.field-inline .field-input {\n  width: 110px;\n  flex: 0 0 auto;\n}\n/* 窄窗格：工具条（筛选项、内联输入、按钮）整行放到标题下面，否则标题区会被挤成竖排文字 */\n@container (max-width: 560px) {\n  .panel-head {\n    flex-direction: column;\n    align-items: stretch;\n  }\n\n  .panel-tools {\n    width: 100%;\n    justify-content: flex-start;\n    flex-wrap: wrap;\n  }\n\n  .field-inline {\n    flex: 1 1 auto;\n  }\n\n  .field-inline .field-input {\n    width: auto;\n    flex: 1 1 auto;\n    min-width: 0;\n  }\n}\n/* 项目卡上的批量勾选框：浮在卡片左上角，不参与卡片布局 */\n.card-check {\n  position: absolute;\n  top: 10px;\n  left: 10px;\n  z-index: 2;\n}\n\n.project-card {\n  position: relative;\n}\n/* 数据页签的范围开关（全部 / 只看归档 / 只看在办） */\n.filters .link-btn.is-active {\n  color: var(--pp-ink-1);\n  border-color: var(--pp-coral);\n  background: var(--pp-coral-soft);\n}\n/* 上次批量操作的失败条：跨整行、可重试 */\n.bulk-failure {\n  border-color: var(--pp-warn, #d98a4a);\n  background: var(--pp-bg-2, var(--background-secondary));\n}\n\n.bulk-failure h2 {\n  font-size: 18px;\n}\n/* 可点的 KPI 卡：整卡是按钮，但外观保持卡片 */\n.kpi-link {\n  width: 100%;\n  text-align: left;\n  font: inherit;\n  color: inherit;\n  cursor: pointer;\n}\n\n.kpi-link:hover,\n.kpi-link:focus-visible {\n  border-color: var(--pp-coral);\n  outline: none;\n  box-shadow: 0 0 0 3px var(--pp-coral-soft);\n}\n\n/* =====================================================================\n * 15. 夜航极光 · 流动（Aurora Motion）— 契约见仓库根目录 MOTION.md\n *\n * 铁律（逐条对应 MOTION.md 第 0 节）：\n *   1. 关键帧的终点 = 元素的静态状态；入场一律 animation-fill-mode: backwards\n *      （禁止 forwards）。动画没跑（被打断 / off / 减少动效）时界面必须完整可见。\n *   2. 只动 transform / opacity / filter / background-position / box-shadow。\n *   3. 入场只在「首次渲染 / 真正换页签」时播：mo-enter 由渲染层挂（app.js 的\n *      syncEnter），setData / vault 刷新不挂。\n *   4. 尊重 prefers-reduced-motion 与 data-motion（见文件前面的两个 @media 块\n *      与本节末尾的降级覆盖）。\n *   5. 不做退场动画：抽屉关闭仍是立即 hidden。\n *   6. 任何状态都不只靠动效表达（数字、进度、徽标都另有静态终值）。\n *\n * 强度开关由渲染层写在 .app / .drawer / .scrim 上（每次 render 同步）：\n *   · 缺省 / \"full\" → 下面的规则无条件生效；\n *   · \"subtle\"      → 关环境类与指针跟随、位移减半、stagger 归零、入场 260ms；\n *   · \"off\"         → animation / transition 全部 none，悬停位移归零。\n *\n * 本节不新增宽度断点；响应式仍是文件前面的 @media (max-width: …)。\n * ===================================================================== */\n\n/* ------------------------------------------------------------------ *\n * 15.0 关键帧（名字与插件 styles.css 逐字一致 —— MOTION.md 第 2 节）\n * 注意：@keyframes 块内是安全的，from { / 50% { 不会被插件的 Shadow 适配改写。\n * ------------------------------------------------------------------ */\n\n@keyframes ppd-rise {\n  from { opacity: 0; transform: translate3d(0, 12px, 0); }\n  to { opacity: 1; transform: none; }\n}\n\n@keyframes ppd-rise-sm {\n  from { opacity: 0; transform: translate3d(0, 6px, 0); }\n  to { opacity: 1; transform: none; }\n}\n\n@keyframes ppd-pop {\n  from { opacity: 0; transform: scale(0.97); }\n  to { opacity: 1; transform: none; }\n}\n\n@keyframes ppd-slide-in {\n  from { opacity: 0; transform: translate3d(-10px, 0, 0); }\n  to { opacity: 1; transform: none; }\n}\n\n@keyframes ppd-fade {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n\n@keyframes ppd-grow-x {\n  from { transform: scaleX(0); }\n  to { transform: scaleX(1); }\n}\n\n@keyframes ppd-sheen {\n  from { background-position: -140% 0; }\n  to { background-position: 220% 0; }\n}\n\n@keyframes ppd-halo {\n  from { transform: scale(1) rotate(0deg); }\n  to { transform: scale(1.08) rotate(3deg); }\n}\n\n@keyframes ppd-kenburns {\n  from { transform: scale(1.02); }\n  to { transform: scale(1.06); }\n}\n\n@keyframes ppd-pulse {\n  /* 契约里起点色是占位「同色 34%」：这个面色用真令牌 --pp-pulse-ring 表达\n     （深/浅主题各取自己 --pp-rose 的 34%），而不是 currentColor ——\n     .blocked-badge / .task-line-dot 的文字色是白/近白，用 currentColor 会把呼吸环\n     变成白色，那既不符合\"危险\"的语义，也和插件面（那三个播放者的 currentColor\n     恰好就是语义色）不是同一件事。这一条因此登记为跨面表述差异，只做语义断言。 */\n  from { box-shadow: 0 0 0 0 var(--pp-pulse-ring, rgba(255, 95, 122, 0.34)); }\n  to { box-shadow: 0 0 0 7px transparent; }\n}\n\n@keyframes ppd-shimmer {\n  from { background-position: -160% 0; }\n  to { background-position: 160% 0; }\n}\n\n@keyframes ppd-flash {\n  from { filter: brightness(1); }\n  50% { filter: brightness(1.35); }\n  to { filter: brightness(1); }\n}\n\n@keyframes ppd-march {\n  from { background-position: 0 0; }\n  to { background-position: 16px 0; }\n}\n\n@keyframes ppd-check {\n  from { transform: scale(0.86); }\n  50% { transform: scale(1.12); }\n  to { transform: scale(1); }\n}\n\n/* ------------------------------------------------------------------ *\n * 15.1 整页交错入场（分镜 1）与面板内列表行入场（分镜 2）\n * mo-enter 由渲染层挂在 #view 上，且只在首次渲染 / 真正换页签时出现。\n * ------------------------------------------------------------------ */\n\n.view.mo-enter > *,\n.view.mo-enter .grid > * {\n  animation: ppd-rise var(--pp-mo-enter) var(--pp-mo-ease-out) backwards;\n}\n\n.view.mo-enter .panel-body > *,\n.view.mo-enter .res-list > *,\n.view.mo-enter .task-list > *,\n.view.mo-enter .focus-list > *,\n.view.mo-enter .project-list > *,\n.view.mo-enter .task-group > .task-row {\n  animation: ppd-rise-sm var(--pp-mo-enter) var(--pp-mo-ease-out) backwards;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.2 统计卡弹入（分镜 3）与图像导航卡弹入（分镜 4）\n * 这两条必须写在上面的 ppd-rise 之后：选择器权重相同，靠书写顺序取胜。\n * ------------------------------------------------------------------ */\n\n.view.mo-enter .kpi {\n  animation: ppd-pop var(--pp-mo-enter) var(--pp-mo-ease-out) backwards;\n}\n\n.view.mo-enter .waypoint {\n  animation: ppd-pop var(--pp-mo-enter) var(--pp-mo-ease-out) backwards;\n}\n\n/* 交错：第 N 个子元素晚 (N-1) × --pp-mo-stagger。\n   必须写在所有 animation 简写之后，否则会被简写里的 animation-delay: 0 覆盖。\n   11 个及以后的元素不再延迟（长列表不做无限拖尾）。 */\n.view.mo-enter > *:nth-child(2),\n.view.mo-enter .grid > *:nth-child(2),\n.view.mo-enter .panel-body > *:nth-child(2),\n.view.mo-enter .res-list > *:nth-child(2),\n.view.mo-enter .task-list > *:nth-child(2),\n.view.mo-enter .focus-list > *:nth-child(2),\n.view.mo-enter .project-list > *:nth-child(2),\n.view.mo-enter .task-group > .task-row:nth-child(2) {\n  animation-delay: calc(var(--pp-mo-stagger) * 1);\n}\n\n.view.mo-enter > *:nth-child(3),\n.view.mo-enter .grid > *:nth-child(3),\n.view.mo-enter .panel-body > *:nth-child(3),\n.view.mo-enter .res-list > *:nth-child(3),\n.view.mo-enter .task-list > *:nth-child(3),\n.view.mo-enter .focus-list > *:nth-child(3),\n.view.mo-enter .project-list > *:nth-child(3),\n.view.mo-enter .task-group > .task-row:nth-child(3) {\n  animation-delay: calc(var(--pp-mo-stagger) * 2);\n}\n\n.view.mo-enter > *:nth-child(4),\n.view.mo-enter .grid > *:nth-child(4),\n.view.mo-enter .panel-body > *:nth-child(4),\n.view.mo-enter .res-list > *:nth-child(4),\n.view.mo-enter .task-list > *:nth-child(4),\n.view.mo-enter .focus-list > *:nth-child(4),\n.view.mo-enter .project-list > *:nth-child(4),\n.view.mo-enter .task-group > .task-row:nth-child(4) {\n  animation-delay: calc(var(--pp-mo-stagger) * 3);\n}\n\n.view.mo-enter > *:nth-child(5),\n.view.mo-enter .grid > *:nth-child(5),\n.view.mo-enter .panel-body > *:nth-child(5),\n.view.mo-enter .res-list > *:nth-child(5),\n.view.mo-enter .task-list > *:nth-child(5),\n.view.mo-enter .focus-list > *:nth-child(5),\n.view.mo-enter .project-list > *:nth-child(5),\n.view.mo-enter .task-group > .task-row:nth-child(5) {\n  animation-delay: calc(var(--pp-mo-stagger) * 4);\n}\n\n.view.mo-enter > *:nth-child(6),\n.view.mo-enter .grid > *:nth-child(6),\n.view.mo-enter .panel-body > *:nth-child(6),\n.view.mo-enter .res-list > *:nth-child(6),\n.view.mo-enter .task-list > *:nth-child(6),\n.view.mo-enter .focus-list > *:nth-child(6),\n.view.mo-enter .project-list > *:nth-child(6),\n.view.mo-enter .task-group > .task-row:nth-child(6) {\n  animation-delay: calc(var(--pp-mo-stagger) * 5);\n}\n\n.view.mo-enter > *:nth-child(7),\n.view.mo-enter .grid > *:nth-child(7),\n.view.mo-enter .panel-body > *:nth-child(7),\n.view.mo-enter .res-list > *:nth-child(7),\n.view.mo-enter .task-list > *:nth-child(7),\n.view.mo-enter .focus-list > *:nth-child(7),\n.view.mo-enter .project-list > *:nth-child(7),\n.view.mo-enter .task-group > .task-row:nth-child(7) {\n  animation-delay: calc(var(--pp-mo-stagger) * 6);\n}\n\n.view.mo-enter > *:nth-child(8),\n.view.mo-enter .grid > *:nth-child(8),\n.view.mo-enter .panel-body > *:nth-child(8),\n.view.mo-enter .res-list > *:nth-child(8),\n.view.mo-enter .task-list > *:nth-child(8),\n.view.mo-enter .focus-list > *:nth-child(8),\n.view.mo-enter .project-list > *:nth-child(8),\n.view.mo-enter .task-group > .task-row:nth-child(8) {\n  animation-delay: calc(var(--pp-mo-stagger) * 7);\n}\n\n.view.mo-enter > *:nth-child(9),\n.view.mo-enter .grid > *:nth-child(9),\n.view.mo-enter .panel-body > *:nth-child(9),\n.view.mo-enter .res-list > *:nth-child(9),\n.view.mo-enter .task-list > *:nth-child(9),\n.view.mo-enter .focus-list > *:nth-child(9),\n.view.mo-enter .project-list > *:nth-child(9),\n.view.mo-enter .task-group > .task-row:nth-child(9) {\n  animation-delay: calc(var(--pp-mo-stagger) * 8);\n}\n\n.view.mo-enter > *:nth-child(10),\n.view.mo-enter .grid > *:nth-child(10),\n.view.mo-enter .panel-body > *:nth-child(10),\n.view.mo-enter .res-list > *:nth-child(10),\n.view.mo-enter .task-list > *:nth-child(10),\n.view.mo-enter .focus-list > *:nth-child(10),\n.view.mo-enter .project-list > *:nth-child(10),\n.view.mo-enter .task-group > .task-row:nth-child(10) {\n  animation-delay: calc(var(--pp-mo-stagger) * 9);\n}\n\n/* ------------------------------------------------------------------ *\n * 15.3 指针跟随光晕（分镜 5）—— --pp-mx / --pp-my 由 app.js 的 pointermove\n * 委托写在 .kpi / .waypoint 上；JS 跑不动时变量缺失，radial-gradient 用 50% 兜底，\n * 静态状态是一层完全透明的覆盖（opacity: 0），不会挡住内容。\n * .kpi::before 与 .waypoint::after 是这里新占用的伪元素（另外两个已被色带/遮罩占用）。\n * ------------------------------------------------------------------ */\n\n.kpi::before,\n.waypoint::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  z-index: 0;\n  border-radius: inherit;\n  pointer-events: none;\n  opacity: 0;\n  background-image: radial-gradient(240px circle at var(--pp-mx, 50%) var(--pp-my, 50%), rgba(255, 143, 163, 0.18), transparent 68%);\n  transition: opacity var(--pp-mo-base) var(--pp-mo-ease);\n}\n\n.kpi:hover::before,\n.kpi:focus-visible::before,\n.waypoint:hover::after,\n.waypoint:focus-visible::after {\n  opacity: 1;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.4 KPI 数字滚动（分镜 6）—— 补间由 app.js 的 rAF 完成（只在数值变化时）；\n * 这里只负责补间结束时的 ppd-flash（filter: brightness，不动布局）。\n * ------------------------------------------------------------------ */\n\n.kpi .is-counted-up {\n  animation: ppd-flash var(--pp-mo-base) var(--pp-mo-ease) backwards;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.5 进度条生长 + 高光扫过（分镜 7）\n * 生长用 transform: scaleX()，绝不改 width —— 静态状态就是 scaleX(1)，\n * 所以动画不执行时进度仍然是满值显示。\n * ------------------------------------------------------------------ */\n\n.kpi-bar span,\n.progress-fill,\n.drawer .progress-line > span {\n  position: relative;\n  overflow: hidden;\n  transform-origin: left center;\n  animation: ppd-grow-x var(--pp-mo-enter) var(--pp-mo-ease-out) backwards;\n}\n\n.kpi-bar span::after,\n.progress-fill::after,\n.drawer .progress-line > span::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  border-radius: inherit;\n  pointer-events: none;\n  background-image: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.28), transparent);\n  background-size: 220% 100%;\n  background-repeat: no-repeat;\n  animation: ppd-sheen 1.1s var(--pp-mo-ease) 320ms backwards;\n}\n\n/* 时间规划的负载柱是竖向的，scaleX 会横向压扁：用极轻的位移+淡入代替（铁律 2 禁止动 height） */\n.timeline .day-fill {\n  animation: ppd-rise-sm var(--pp-mo-enter) var(--pp-mo-ease-out) backwards;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.6 横幅极光漂移 + 素材缓推（分镜 8，常驻环境动效）\n * 本文件里素材是 .hero 自身的 background-image（行内样式），::before 是色调遮罩、\n * ::after 是极光光晕：所以「光晕漂移」落在 ::after、「缓推」落在 ::before。\n * 两者都用 alternate + --pp-mo-ambient（14s），属于环境类，subtle 下关闭。\n * ------------------------------------------------------------------ */\n\n.hero::after {\n  animation: ppd-halo var(--pp-mo-ambient) var(--pp-mo-ease) infinite alternate;\n}\n\n.hero::before {\n  animation: ppd-kenburns var(--pp-mo-ambient) var(--pp-mo-ease) infinite alternate;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.7 当前页签胶囊（分镜 9）——只在真正换页签时弹一下：\n * 渲染层会把 mo-enter 同时挂在 #tabs 上（每次重绘都重挂会让胶囊每敲一个字就闪）。\n * ------------------------------------------------------------------ */\n\n.tabs.mo-enter .tab[aria-current=\"page\"] {\n  animation: ppd-pop var(--pp-mo-base) var(--pp-mo-spring) backwards;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.8 按钮按压与主操作辉光（分镜 10）\n * ------------------------------------------------------------------ */\n\n.primary-btn {\n  position: relative;\n  overflow: hidden;\n  transition: transform var(--pp-mo-fast) var(--pp-mo-ease), box-shadow var(--pp-mo-fast) var(--pp-mo-ease), filter var(--pp-mo-fast) var(--pp-mo-ease);\n}\n\n.primary-btn:hover,\n.primary-btn:focus-visible {\n  box-shadow: 0 8px 28px rgba(255, 143, 163, 0.42);\n}\n\n.primary-btn:active {\n  transform: translateY(1px) scale(0.985);\n  box-shadow: 0 2px 10px rgba(255, 143, 163, 0.32);\n}\n\n.primary-btn::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  border-radius: inherit;\n  pointer-events: none;\n  background-image: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.32), transparent);\n  background-size: 220% 100%;\n  background-position: -140% 0;\n  background-repeat: no-repeat;\n}\n\n.primary-btn:hover::after,\n.primary-btn:focus-visible::after {\n  animation: ppd-sheen 700ms var(--pp-mo-ease) backwards;\n}\n\n/* 状态四选一：确认类动作，用回弹（--pp-mo-spring / ppd-check） */\n.status-option.is-active {\n  animation: ppd-check var(--pp-mo-base) var(--pp-mo-spring) backwards;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.9 行悬停左侧强调条（分镜 11）\n * 从行左边滑入的 2px 珊瑚条：transform: scaleY(0 → 1)，不动 padding / border。\n * .res-item.is-blocked 自己已经有 3px 危险色左边框，故排除。\n * ------------------------------------------------------------------ */\n\n.task-row,\n.res-item:not(.is-blocked),\n.task-line,\n.focus-item {\n  position: relative;\n}\n\n.task-row::before,\n.res-item:not(.is-blocked)::before,\n.task-line::before,\n.focus-item::before {\n  content: \"\";\n  position: absolute;\n  top: 6px;\n  bottom: 6px;\n  left: -8px;\n  width: 2px;\n  border-radius: var(--pp-r-pill);\n  background: var(--pp-coral);\n  opacity: 0;\n  transform: scaleY(0);\n  transform-origin: center top;\n  transition: transform var(--pp-mo-base) var(--pp-mo-ease), opacity var(--pp-mo-base) var(--pp-mo-ease);\n}\n\n.task-row:hover::before,\n.task-row:focus-within::before,\n.res-item:not(.is-blocked):hover::before,\n.res-item:not(.is-blocked):focus-within::before,\n.task-line:hover::before,\n.task-line:focus-within::before,\n.focus-item:hover::before,\n.focus-item:focus-within::before {\n  opacity: 1;\n  transform: scaleY(1);\n}\n\n/* ------------------------------------------------------------------ *\n * 15.10 状态呼吸（分镜 12）——阻塞 / 逾期徽标常驻呼吸。\n * 只用 box-shadow（不动布局），且颜色、文字都另有静态终值（铁律 6）。\n * ------------------------------------------------------------------ */\n\n.chip[data-tone=\"danger\"],\n.chip[data-tone=\"blocked\"],\n.chip[data-status=\"blocked\"],\n.chip[data-status=\"expired\"],\n.task-line-dot[data-status=\"blocked\"],\n.task-line-dot[data-status=\"expired\"],\n.blocked-badge {\n  animation: ppd-pulse 2.4s var(--pp-mo-ease) infinite alternate;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.11 抽屉入场 + 遮罩淡入（分镜 13）\n * 只做入场：关闭仍是立即 hidden（铁律 5）。:not([hidden]) 让动画在每次\n * hidden → 显示 时重新开始，而抽屉内重绘（改字段 / 数据刷新）不会重播。\n * 抽屉贴右边，所以用 ppd-pop（scale，origin 在右缘）而不是 ppd-slide-in。\n * ------------------------------------------------------------------ */\n\n.drawer:not([hidden]) {\n  transform-origin: 100% 50%;\n  animation: ppd-pop var(--pp-mo-enter) var(--pp-mo-ease-out) backwards;\n}\n\n.scrim:not([hidden]) {\n  animation: ppd-fade var(--pp-mo-base) var(--pp-mo-ease) backwards;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.12 关键节点页签的指示条（分镜 14）\n * 每个页签自带一条 2px 指示条，切到当前节点时 translateX(-8px → 0) 滑到位。\n * （抽屉里的节点导航是 flex-wrap 的胶囊列表，没有可跨页签滑动的固定轨道，\n *   所以按页签各自出场，用 translateX 表达「滑入」。）\n * ------------------------------------------------------------------ */\n\n.milestone-tab {\n  position: relative;\n}\n\n.milestone-tab::after {\n  content: \"\";\n  position: absolute;\n  left: 10px;\n  right: 10px;\n  bottom: 2px;\n  height: 2px;\n  border-radius: var(--pp-r-pill);\n  background: var(--pp-coral);\n  opacity: 0;\n  transform: translateX(-8px) scaleX(0.4);\n  transition: transform var(--pp-mo-base) var(--pp-mo-ease), opacity var(--pp-mo-fast) var(--pp-mo-ease);\n}\n\n.milestone-tab.is-active::after {\n  opacity: 1;\n  transform: translateX(0) scaleX(1);\n}\n\n.milestone-tab.is-blocked::after {\n  background: var(--pp-danger);\n}\n\n/* ------------------------------------------------------------------ *\n * 15.13 加载骨架微光（分镜 16）\n * 只加一个属性钩子 data-loading（渲染层在「数据未返回」那一帧写上），\n * 不新增 id、不替换任何现有 DOM：微光挂在现有 .empty 的 ::after 上。\n * ------------------------------------------------------------------ */\n\n.view[data-loading=\"true\"] .empty::after {\n  content: \"\";\n  display: block;\n  height: 10px;\n  margin-top: 12px;\n  border-radius: var(--pp-r-pill);\n  background-image: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.14), transparent);\n  background-size: 220% 100%;\n  background-repeat: no-repeat;\n  animation: ppd-shimmer 1.4s linear infinite;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.14 强度降级：subtle\n * 关掉环境类（halo / kenburns / pulse / sheen / spotlight），\n * 位移减半（ppd-rise → ppd-rise-sm 的 6px），stagger 归零，入场降到 260ms。\n * 指针跟随另由 app.js 只在 full 下挂载。\n * ------------------------------------------------------------------ */\n\n.app[data-motion=\"subtle\"],\n.drawer[data-motion=\"subtle\"],\n.scrim[data-motion=\"subtle\"] {\n  --pp-mo-stagger: 0ms;\n  --pp-mo-enter: 260ms;\n}\n\n/* subtle 的弹入类一律换成位移更小的 ppd-rise-sm（6px）：\n   必须把**每个** ppd-pop 播放者都列进来。.waypoint 卡片在 .waypoints 里，\n   不是 .grid 的子节点，漏掉它会只剩时长变短、scale 弹入照旧（两面行为不一致）。\n   抽屉在 .app 之外、用自己那份 data-motion，所以选择器不是 .app 后代。 */\n.app[data-motion=\"subtle\"] .view.mo-enter > *,\n.app[data-motion=\"subtle\"] .view.mo-enter .grid > *,\n.app[data-motion=\"subtle\"] .view.mo-enter .waypoint,\n.app[data-motion=\"subtle\"] .view.mo-enter .kpi,\n.app[data-motion=\"subtle\"] .tabs.mo-enter .tab[aria-current=\"page\"],\n.drawer[data-motion=\"subtle\"]:not([hidden]) {\n  animation-name: ppd-rise-sm;\n}\n\n/* 指针光晕在 subtle 下也要真的关掉：.kpi::before / .waypoint::after 是 transition 驱动的，\n   只写 animation: none 是空操作（插件面用 --pp-spot: none + opacity: 0 达到同一效果）。\n   :hover / :focus-visible 规则的优先级更高，必须一起写进来。 */\n.app[data-motion=\"subtle\"] .kpi::before,\n.app[data-motion=\"subtle\"] .kpi:hover::before,\n.app[data-motion=\"subtle\"] .kpi:focus-visible::before,\n.app[data-motion=\"subtle\"] .waypoint::after,\n.app[data-motion=\"subtle\"] .waypoint:hover::after,\n.app[data-motion=\"subtle\"] .waypoint:focus-visible::after { opacity: 0; }\n\n.app[data-motion=\"subtle\"] .hero::before,\n.app[data-motion=\"subtle\"] .hero::after,\n.app[data-motion=\"subtle\"] .kpi::before,\n.app[data-motion=\"subtle\"] .waypoint::after,\n.app[data-motion=\"subtle\"] .primary-btn::after,\n.app[data-motion=\"subtle\"] .kpi-bar span::after,\n.app[data-motion=\"subtle\"] .progress-fill::after,\n.app[data-motion=\"subtle\"] .drawer .progress-line > span::after,\n.app[data-motion=\"subtle\"] .chip[data-tone=\"danger\"],\n.app[data-motion=\"subtle\"] .chip[data-tone=\"blocked\"],\n.app[data-motion=\"subtle\"] .chip[data-status=\"blocked\"],\n.app[data-motion=\"subtle\"] .chip[data-status=\"expired\"],\n.app[data-motion=\"subtle\"] .task-line-dot[data-status=\"blocked\"],\n.app[data-motion=\"subtle\"] .task-line-dot[data-status=\"expired\"],\n.app[data-motion=\"subtle\"] .blocked-badge {\n  animation: none;\n}\n\n/* ------------------------------------------------------------------ *\n * 15.15 强度降级：off（与 prefers-reduced-motion 等价）\n * 抽屉与遮罩在 .app 之外，所以三个根各自带 data-motion；属性缺失时按 full，\n * 默认规则无条件写满动效，永远不会出现「半透明死界面」。\n * ------------------------------------------------------------------ */\n\n.app[data-motion=\"off\"],\n.app[data-motion=\"off\"] *,\n.app[data-motion=\"off\"] *::before,\n.app[data-motion=\"off\"] *::after,\n.drawer[data-motion=\"off\"],\n.drawer[data-motion=\"off\"] *,\n.drawer[data-motion=\"off\"] *::before,\n.drawer[data-motion=\"off\"] *::after,\n.scrim[data-motion=\"off\"] {\n  animation: none !important;\n  transition: none !important;\n}\n\n.app[data-motion=\"off\"] .kpi:hover,\n.app[data-motion=\"off\"] .kpi:focus-visible,\n.app[data-motion=\"off\"] .waypoint:hover,\n.app[data-motion=\"off\"] .waypoint:focus-visible,\n.app[data-motion=\"off\"] .primary-btn:active {\n  transform: none !important;\n}\n\n.app[data-motion=\"off\"] .kpi::before,\n.app[data-motion=\"off\"] .waypoint::after,\n.app[data-motion=\"off\"] .primary-btn::after {\n  display: none !important;\n}\n";
/** Web 版渲染层工厂：函数体就是 web/app.js 的原文，参数用于替代浏览器全局 */
function ppWebAppFactory(window, document, navigator, localStorage, module, exports) {
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
;return module.exports; }
/* ===== PP_WEB_RENDERER_END ===== */
