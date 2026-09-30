/** paths 层：由 src/main.ts 在第 2 步机械拆出（逻辑未改，只加了 import/export）。 */
export type PathLike = string | { path: string };
export type TaskLike = { frontmatter?: Record<string, unknown> };
export type ProjectLike = { file: { path: string }; frontmatter?: Record<string, unknown>; folderPath?: string };

export function cleanName(value: unknown): string {
  return (
    String(value || "未命名")
      .trim()
      .replace(/[\\/:*?"<>|#^]/g, "-") || "未命名"
  );
}

export function directChild(fileOrPath: PathLike, folder: string): boolean {
  const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath.path;
  if (!inFolder(path, folder)) return false;
  return path.slice(folder.length + 1).split("/").length === 1;
}

export function folderPathOf(file: { parent?: { path?: string }; path: string }): string {
  return file.parent && file.parent.path ? file.parent.path : file.path.split("/").slice(0, -1).join("/");
}
/** 顶部导航：品牌字标 + 目的地链接 + 右侧主操作。导航本身几乎「不存在」，不与内容争视觉。 */

export function forbiddenPath(path: string): boolean {
  return path.split("/").some((part: any) => part.includes("AI禁止阅读") || part.startsWith("（AI禁止阅读"));
}
/** 并发映射但限制在飞数量：Obsidian 的 cachedRead 是异步 I/O，几百篇笔记串行 await 会把刷新拖到秒级 */

export function inFolder(fileOrPath: PathLike, folder: string): boolean {
  const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath.path;
  return path === folder || path.startsWith(folder + "/");
}

export function nameOf(path: string): string {
  return (path.split("/").pop() || "").replace(/\.md$/i, "");
}

export function normalizeList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .flatMap((item: any) =>
        typeof item === "object" && item ? [item.title || item.name || item.label || ""] : [String(item)],
      )
      .map((item: any) => item.trim())
      .filter(Boolean);
  return String(value || "")
    .split(/[,，\n]/)
    .map((item: any) => item.trim())
    .filter(Boolean);
}

export function projectMatches(task: TaskLike, project: ProjectLike): boolean {
  const taskFm = task.frontmatter || {};
  const projectFm = project.frontmatter || {};
  /* 非字符串标题与旧行为一致地「永远不相等」，不把数字/布尔当名字用 */
  const title = typeof projectFm.title === "string" ? projectFm.title : "";
  const values = refs(taskFm.project);
  const names = [
    project.file.path,
    nameOf(project.file.path),
    title,
    project.folderPath ? nameOf(project.folderPath) : "",
  ];
  return values.some((ref: any) =>
    names.some((name: any) => name && (ref === name || ref.endsWith("/" + name) || nameOf(ref) === nameOf(name))),
  );
}

export function refs(value: unknown): string[] {
  return normalizeList(value)
    .map((item: any) => item.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim())
    .filter(Boolean);
}

/**
 * 任务归属到哪个项目（返回项目对象，没有就返回 null）。
 *
 * 为什么不能只写 `projects.find(projectMatches)`：**同名项目**（例如两个目录下都叫
 * 「仪表盘搭建」）会同时命中多个候选，于是归属取决于 vault 的枚举顺序 —— 而
 * Obsidian 的 `getMarkdownFiles()` 顺序没有契约，不同机器/版本可能不同，
 * 结果就是"同一篇笔记在两台机器上归到不同项目"（CI 上真的红过）。
 *
 * 这里按「引用越具体越优先」定序，全部用码点序兜底，保证跨机器结果一致：
 *   0 = 整条路径命中（`project` 写的就是项目文件的全路径）
 *   1 = 路径后缀命中（`project` 以 `/` + 项目全路径或 `/` + 项目名结尾）
 *   2 = 仅按名字命中（标题 / 文件名 / 所在目录名相同）
 * 同档时先把「任务自己所在目录」对上的项目排前面（任务就住在这个项目文件夹里），
 * 再取路径最小者（`<` 码点序，与 locale 无关）。`projects` 兼容两种形状：
 * 原生是 `{ file: { path }, frontmatter, folderPath }`，Web 载荷是 `{ path, frontmatter, folderPath }`。
 */
export function pickProject(taskPath: string, frontmatter: any, projects: any): any {
  const values = refs(frontmatter && frontmatter.project);
  if (!values.length) return null;
  const taskFolder = String(taskPath || "")
    .split("/")
    .slice(0, -1)
    .join("/");
  let best: any = null;
  let bestRank = Number.POSITIVE_INFINITY;
  let bestFolderHit = false;
  let bestPath = "";
  (projects || []).forEach((project: any) => {
    const path = String((project && project.file && project.file.path) || (project && project.path) || "");
    if (!path) return;
    const projectFm = (project && project.frontmatter) || {};
    const title = typeof projectFm.title === "string" ? projectFm.title : "";
    const base = nameOf(path);
    const folder = project.folderPath ? nameOf(project.folderPath) : "";
    let rank = Number.POSITIVE_INFINITY;
    values.forEach((ref: any) => {
      if (ref === path) rank = Math.min(rank, 0);
      else if (ref.endsWith("/" + path) || (base && ref.endsWith("/" + base))) rank = Math.min(rank, 1);
      else if (ref === base || ref === title || ref === folder || nameOf(ref) === base) rank = Math.min(rank, 2);
    });
    if (rank === Number.POSITIVE_INFINITY) return;
    const folderHit = Boolean(taskFolder && project.folderPath && taskFolder === project.folderPath);
    const better =
      rank < bestRank ||
      (rank === bestRank && folderHit && !bestFolderHit) ||
      (rank === bestRank && folderHit === bestFolderHit && path < bestPath);
    if (better) {
      best = project;
      bestRank = rank;
      bestFolderHit = folderHit;
      bestPath = path;
    }
  });
  return best;
}

export function stripProjectPrefix(filename: string, projectName: string): string {
  const prefix = "[" + projectName + "]";
  return filename.startsWith(prefix) ? filename.slice(prefix.length).trim() : filename;
}
