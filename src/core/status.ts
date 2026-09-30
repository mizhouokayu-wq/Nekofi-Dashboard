/** status 层：由 src/main.ts 机械拆出（逻辑未改，只加了 import/export）。 */
import { NON_TASK_TYPES, STATUS } from "./constants";
import { dateOf, daysUntil } from "./dates";
import { el } from "./dom";
import { directChild, inFolder } from "./paths";

export function isTaskNote(path: any, frontmatter: any, settings: any) {
  const config = settings || {};
  const type = String((frontmatter && frontmatter.type) || "").toLowerCase();
  if (type === "task" || type === "knowledge-gap") return true;
  if (NON_TASK_TYPES.includes(type)) return false;
  if (inFolder(path, config.taskFolder)) return true;
  if (!inFolder(path, config.projectFolder)) return false;
  if (type !== "") return false;
  return !directChild(path, config.projectFolder);
}

export function statusLabel(status: any) {
  const value = String(status || "").toLowerCase();
  return STATUS[value] || status || "未设置";
}

export function taskStatus(taskOrFrontmatter: any) {
  const fm =
    taskOrFrontmatter && taskOrFrontmatter.frontmatter ? taskOrFrontmatter.frontmatter : taskOrFrontmatter || {};
  const raw = String(fm.status || "").toLowerCase();
  if (["archived", "done", "completed"].includes(raw)) return raw;
  /* blocked 是用户手动选的状态：DDL 过了也仍然是"阻塞"，否则会被状态同步改成 expired，红点与节点标红会在刷新后消失 */ if (
    raw === "blocked"
  )
    return raw;
  const due = dateOf(fm.due || fm.deadline);
  const offset = daysUntil(due);
  if (offset !== null && offset < 0) return "expired";
  if (["doing", "paused"].includes(raw)) return raw;
  if (!due) return "planning";
  return "todo";
}

export function projectStatus(projectOrFrontmatter: any) {
  const fm =
    projectOrFrontmatter && projectOrFrontmatter.frontmatter
      ? projectOrFrontmatter.frontmatter
      : projectOrFrontmatter || {};
  const raw = String(fm.status || "").toLowerCase();
  if (["archived", "completed"].includes(raw)) return raw;
  const due = dateOf(fm.deadline || fm.ddl);
  const offset = daysUntil(due);
  if (offset !== null && offset < 0) return "expired";
  if (raw === "expired") return due ? "active" : "planning";
  return raw || "planning";
}

export function statusBadge(parent: any, status: any) {
  const value = String(status || "").toLowerCase();
  return el(parent, "span", statusLabel(value), ["pp-badge", "pp-status-" + (value || "neutral")]);
}
