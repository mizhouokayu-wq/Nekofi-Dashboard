/** dates 层：由 src/main.ts 在第 2 步机械拆出（逻辑未改，只加了 import/export）。 */
/* Obsidian 与 moment 对象都长得像这样：有 format / getTime 但不一定是原生 Date */
type DateLike = { format?: (pattern: string) => string; getTime?: () => number };
declare global {
  interface Window {
    moment?: () => { format(pattern: string): string };
  }
}

/** 字符串日期的解析结果缓存。
 *
 * 为什么需要：CPU profile 显示一次载荷推导里 `dateOf` + 它内部的 `iso`/`pad` 占 **25%**，
 * 加 `daysUntil` 接近 **40%** —— 同一个日期串（今天的日期、每篇任务的 due）在一次推导里会被
 * `taskStatus`、`daysUntil` 等路径反复解析。`dateOf` 对字符串输入是纯函数，缓存结果不改变语义。
 *
 * 只缓存字符串：Date / 数字 / moment 对象不参与（它们的解析带时区与"当前时间"语义）。
 */
const DATE_CACHE = new Map<string, string | null>();
const DATE_CACHE_LIMIT = 2000;

export function dateOf(value: unknown): string | null {
  const like = value as DateLike;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && value !== null && typeof like.format === "function") {
    const formatted = like.format("YYYY-MM-DD");
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
  }
  /* 字符串走缓存（含"解析失败 = null"的结果，避免反复尝试同一种错误格式） */
  if (typeof value === "string") {
    const key = value.trim();
    if (DATE_CACHE.has(key)) return DATE_CACHE.get(key) ?? null;
    const computed = parseDateString(key);
    if (DATE_CACHE.size >= DATE_CACHE_LIMIT) DATE_CACHE.clear();
    DATE_CACHE.set(key, computed);
    return computed;
  }
  return parseDateValue(value, like);
}

function parseDateString(raw: string): string | null {
  if (!raw) return null;
  /* 手写日期不一定是 ISO：2026/9/30、2026.9.30、2026年9月30日 都很常见。
     旧实现只认连字符，解析不出就被当成「没有 DDL」，于是用户的 todo 被改写成 planning。 */
  const match = raw.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (!match) return null;
  return isoOf(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseDateValue(value: unknown, like: DateLike): string | null {
  const pad = (part: number | string): string => String(part).padStart(2, "0");
  if (
    Object.prototype.toString.call(value) === "[object Date]" ||
    typeof like.getTime === "function" ||
    typeof value === "number"
  ) {
    /* 8 位整数（19000101–99991231）是紧凑日期，不是毫秒时间戳：
       否则 due: 20261031 会被算成 1970-01-01，任务判成逾期并把 status 改写成 expired。 */
    if (typeof value === "number" && Number.isInteger(value) && value >= 19000101 && value <= 99991231) {
      const digits = String(value);
      return isoOf(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    }
    const date =
      typeof value === "number"
        ? new Date(value)
        : new Date(like.getTime ? like.getTime.call(value) : (value as string | number | Date));
    if (!Number.isNaN(date.getTime()))
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }
  return parseDateString(String(value).trim());
}

/** 统一在这里校验年月日是否真的存在（2026-02-30 必须被拒绝，而不是滚到 3 月 2 日） */
function isoOf(year: number, month: number, day: number): string | null {
  const pad = (part: number | string): string => String(part).padStart(2, "0");
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return year + "-" + pad(month) + "-" + pad(day);
}

export function daysUntil(value: unknown): number | null {
  const date = dateOf(value);
  if (!date) return null;
  return Math.round((new Date(date + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000);
}

export function addDays(date: string, amount: number): string {
  const value = new Date(date + "T00:00:00");
  value.setDate(value.getDate() + amount);
  const pad = (part: number | string): string => String(part).padStart(2, "0");
  return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate());
}

/** ISO 周几：1=周一 … 7=周日（JS 的 getDay() 是 0=周日，统一成 ISO，与 frontmatter 里存的一致） */
export function isoWeekday(date: unknown): number {
  const value = dateOf(date);
  if (!value) return 0;
  return ((new Date(value + "T00:00:00").getDay() + 6) % 7) + 1;
}

/** 重复周几：接受 [1,3] / "1,3" / "1、3" 等写法，去重、排序、只保留 1..7。空 = 未设置。 */
export function normalizeWeekdays(value: unknown): number[] {
  const raw = Array.isArray(value)
    ? value
    : String(value === undefined || value === null ? "" : value).split(/[,，、\s]+/);
  const out: number[] = [];
  raw.forEach((item: any) => {
    const day = Math.round(Number(String(item).trim()));
    if (Number.isFinite(day) && day >= 1 && day <= 7 && out.indexOf(day) < 0) out.push(day);
  });
  return out.sort((a, b) => a - b);
}

/** 每月几号：1..31；非法或未设置返回 0。 */
export function normalizeMonthDay(value: unknown): number {
  const day = Math.round(Number(String(value === undefined || value === null ? "" : value).trim()));
  if (!Number.isFinite(day) || day < 1 || day > 31) return 0;
  return day;
}

/** 周几的中文名（周一…周日），用于界面与通知 */
export function weekdayLabel(day: unknown): string {
  const index = Math.round(Number(day));
  return ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"][index] || "";
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function pad2(part: number | string): string {
  return String(part).padStart(2, "0");
}

function formatDate(value: Date): string {
  return value.getFullYear() + "-" + pad2(value.getMonth() + 1) + "-" + pad2(value.getDate());
}

/** 某年某月按「几号」算出的执行日：29/30/31 号遇到没有这一天的月份顺延到当月最后一天。
 *  返回 null 表示 monthday 不是 1..31。 */
export function monthDayIn(year: number, monthIndex: number, monthday: unknown): string | null {
  const day = normalizeMonthDay(monthday);
  if (!day) return null;
  return formatDate(new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex))));
}

/**
 * 重复任务的下一次执行日期（严格晚于 `date`）。
 *
 * `options.weekdays` / `options.monthday` 来自 frontmatter 的重复模式：
 *  · weekly 带周几（可多选）→ 取下一个命中的周几，而不是死板地 +7 天；
 *  · monthly 带几号 → 取下个月的这一天（29/30/31 号顺延到月末）；
 *  · 没给模式时保持旧行为（weekly +7 / monthly 同号 +1 月 / daily +1），
 *    这样老笔记（只有 `recurrence: weekly`）的语义一个字都不变。
 */
export function nextRecurringDate(
  date: unknown,
  recurrence: unknown,
  options: { weekdays?: unknown; monthday?: unknown } = {},
): string | null {
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
    const current = new Date(value + "T00:00:00");
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    const explicit = normalizeMonthDay(options.monthday);
    if (explicit) return monthDayIn(next.getFullYear(), next.getMonth(), explicit);
    const last = daysInMonth(next.getFullYear(), next.getMonth());
    return formatDate(new Date(next.getFullYear(), next.getMonth(), Math.min(current.getDate(), last)));
  }
  return null;
}

/**
 * 重复序列的**第一次**执行日期（不早于 `from`）。
 * 新建重复任务时用它把「周几 / 几号」变成具体一天：今天命中就今天，否则往后找最近一次。
 * 参考谷歌日历：选了重复规则之后，日期由规则决定，不该让用户再填一遍。
 */
export function firstOccurrenceOnOrAfter(
  recurrence: unknown,
  options: { weekdays?: unknown; monthday?: unknown },
  from: unknown,
): string | null {
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
    const current = new Date(start + "T00:00:00");
    /* 只看本月与下月：本月那天已过就落到下月，两个月内必有解 */
    for (let step = 0; step <= 1; step += 1) {
      const month = new Date(current.getFullYear(), current.getMonth() + step, 1);
      const candidate = monthDayIn(month.getFullYear(), month.getMonth(), explicit);
      if (candidate && candidate >= start) return candidate;
    }
    return null;
  }
  return null;
}

/** frontmatter 里的重复结束日期（DDL 的重复语义）：空 = 永不结束 */
export function recurrenceUntilOf(frontmatter: any): string {
  return dateOf(frontmatter && (frontmatter.recurrence_until || frontmatter.recurrenceUntil)) || "";
}

/** 重复模式的锚点日期：本次执行日，没有就取今天。
 *  表单用它给「周几 / 几号」算默认值 —— 默认值取锚点那一天，老笔记（只有 recurrence、没有模式）
 *  重新保存时语义才不会被悄悄改掉。 */
export function recurrenceAnchorOf(frontmatter: any, fallback?: string): string {
  return dateOf(frontmatter && (frontmatter.due || frontmatter.deadline)) || dateOf(fallback) || today();
}

/** frontmatter 里存的重复周几（兼容 recurrenceWeekdays 这种驼峰写法） */
export function recurrenceWeekdaysOf(frontmatter: any): number[] {
  return normalizeWeekdays(frontmatter && (frontmatter.recurrence_weekdays ?? frontmatter.recurrenceWeekdays));
}

/** frontmatter 里存的「每月几号」，未设置返回 0 */
export function recurrenceMonthDayOf(frontmatter: any): number {
  return normalizeMonthDay(frontmatter && (frontmatter.recurrence_monthday ?? frontmatter.recurrenceMonthday));
}

export function today(): string {
  if (window.moment) return window.moment().format("YYYY-MM-DD");
  /* 兜底也要用本地日期：toISOString() 是 UTC，东八区 0:00–8:00 会算成前一天 */
  const now = new Date();
  const pad = (value: any) => String(value).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}
