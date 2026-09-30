/** settings 层：由 src/main.ts 机械拆出（逻辑未改，只加了 import/export）。 */
import * as obsidian from "obsidian";
import {
  DEFAULTS,
  DISTINCT_FOLDER_KEYS,
  FOLDER_SETTING_KEYS,
  type FolderSettingKey,
  type MotionLevel,
  type Settings,
} from "./constants";

export function clampInt(value: any, min: any, max: any, fallback: any) {
  const parsed = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeFolderSetting(value: any, fallback: any) {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  if (!raw) return fallback;
  const normalized = obsidian.normalizePath(raw.replace(/\\/g, "/")).replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized || fallback;
}
/** 动效强度只有三个合法取值：写坏的值一律回落默认值，避免出现"设置项存在但不生效"的静默状态 */
const MOTION_LEVELS: MotionLevel[] = ["full", "subtle", "off"];

export function normalizeMotionLevel(value: any): MotionLevel {
  return MOTION_LEVELS.indexOf(value) >= 0 ? (value as MotionLevel) : DEFAULTS.motionIntensity;
}
/** 设置归一化：路径统一成 vault 相对路径（正斜杠、无首尾斜杠），数值夹到合理区间 */

export function normalizeSettings(settings: any): Settings {
  const next: Settings = Object.assign({}, DEFAULTS, settings || {});
  FOLDER_SETTING_KEYS.forEach((key: FolderSettingKey) => {
    next[key] = normalizeFolderSetting(next[key], DEFAULTS[key]);
  });
  next.defaultTaskDuration = clampInt(next.defaultTaskDuration, 1, 24 * 60, DEFAULTS.defaultTaskDuration);
  next.planningHorizonDays = clampInt(next.planningHorizonDays, 1, 365, DEFAULTS.planningHorizonDays);
  next.dailyCapacityMinutes = clampInt(next.dailyCapacityMinutes, 15, 24 * 60, DEFAULTS.dailyCapacityMinutes);
  next.reminderHour = clampInt(next.reminderHour, 0, 23, DEFAULTS.reminderHour);
  next.motionIntensity = normalizeMotionLevel(next.motionIntensity);
  /* 知识库目录改了，图书库要跟着走：否则图书还指向旧位置，资源页会突然变空 */
  if (next.bookFolder === DEFAULTS.bookFolder && next.knowledgeFolder !== DEFAULTS.knowledgeFolder) {
    next.bookFolder = obsidian.normalizePath(next.knowledgeFolder + "/图书库");
  }
  return next;
}
/** 返回「需要还原成默认值」的目录键：同名目录会让同一篇笔记同时被算作草稿和任务。
 *  优先还原与默认值不同的那一个 —— 用户改的通常是它，还原另一个（仍是默认值）等于没改。 */

export function folderClashes(settings: Settings): FolderSettingKey[] {
  const revert: FolderSettingKey[] = [];
  DISTINCT_FOLDER_KEYS.forEach((key: FolderSettingKey, index: number) => {
    DISTINCT_FOLDER_KEYS.slice(index + 1).forEach((other: FolderSettingKey) => {
      if (!settings[key] || settings[key] !== settings[other]) return;
      const target = settings[key] !== DEFAULTS[key] ? key : other;
      if (revert.indexOf(target) < 0) revert.push(target);
    });
  });
  return revert;
}

/* ============================ 2. 纯函数层 ============================ *
 * 全部为无副作用函数，便于在 Node 环境下直接回归测试。
 * ================================================================== */
