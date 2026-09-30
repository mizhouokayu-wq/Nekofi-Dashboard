# 更新日志

本文件只记录**对外发布**的版本。仓库早期在 README 里按 `v0.2.2` … `v0.4.2` 记录的那些小版本
是作者本机的开发里程碑，没有单独对外发布过；它们的完整改动说明仍在
[`README.md`](README.md) 的「持续审查与改善」一节里。

## Nekofi Dashboard 预览版 0.1.0

第一个可以装进别人的 Obsidian 库的版本。

### 要求

**Obsidian 1.6.6+**（桌面与移动端均可）。

`minAppVersion` 从 `1.5.0` 上调到 `1.6.6`：删除路径统一走 `FileManager.trashFile`
（`@since 1.6.6`，见 `node_modules/obsidian/obsidian.d.ts`），在 1.5.0–1.6.5 上该方法不存在，
删除与项目归档会直接报错。代码从不调用 `vault.delete`，因此没有可用的回退路径 ——
换句话说，旧版本上不是「少个功能」，而是「点了删除就报错」。

### 显示名

`manifest.json` 的 `name` 由「个人规划仪表盘」改为 `Nekofi Dashboard`。
社区目录要求显示名只能使用 Basic Latin 字符（已发布的 8211 个插件中没有一个非 ASCII 名），
插件内部的界面文案与命令名仍然是中文。插件 `id`（`personal-planning-dashboard`）不变，
所以 BRAT 与手动安装的目录路径、以及设置里已有的 `data.json` 都不受影响。

### 功能

- **仪表盘（Web 版）** 是默认入口：概览 / 任务 / 项目 / 知识 / 草稿箱 / 数据 六个页签，
  跑在与宿主隔离的 Shadow DOM 里，跟随 Obsidian 深浅色主题。
- **项目与任务**：项目文件夹 + 同名项目文档；关键节点、任务追踪、验收标准、阻塞状态、
  执行者、任务集与任务组。
- **重复任务**（按谷歌日历的口径）：`recurrence` / `recurrence_weekdays` /
  `recurrence_monthday` / `recurrence_until`；「本周期完成」滚动到下一次命中，
  行内「撤销」可回退最近一次。
- **归档与撤销归档**：项目任务进 `90 归档库/<项目名称>/`，孤立任务进
  `90 归档库/孤立任务/`；项目归档会合并同名目录，不产生重复。
- **草稿箱分诊**、**周维护导入任务集**、**批量操作**（勾选后统一改状态 / 移动 / 归档 / 沉淀知识）。
- **规划提醒**：到点通知逾期与当天到期任务；同一自然日最多一次，可在设置里关闭。
- **资源视图**：知识笔记 / 图书 / 人物 / 长期领域，各自带写作骨架。
- **交互动效**：三档强度（完整 / 克制 / 关闭），跟随系统 `prefers-reduced-motion`；
  动画不执行时界面依然完整。

### 数据边界

- Markdown + YAML frontmatter 是唯一事实来源；不依赖 Dataview / Tasks / Templater。
- 路径中包含 `AI禁止阅读` 的文件与目录永远不读取。
- 删除跟随 Obsidian 的「删除文件」设置（系统回收站 / 库内 `.trash` / 永久删除），
  插件从不强制永久删除。
- 横幅「取景」只记录归一化坐标，不改写、不重编码原始素材。

### 工程

- 运行时代码无网络请求、无第三方运行时依赖（`main.js` 只 `require("obsidian")`）。
- 回归套件 348 项；`npm run check` 逐字节校验 `main.js` 与 `src/` 同步。
- 本版本补齐公开发布所需的文件与流程：`LICENSE`、`versions.json`、
  `.github/workflows/release.yml`（打 tag 即发版）；
  `.github/workflows/ci.yml` 在 Linux + Windows 双平台跑门槛。
- `.gitattributes` 把源码与文档钉成 LF：`.prettierrc.json` 要求 `endOfLine: "lf"`，
  而 Windows 上 `core.autocrlf` 默认开启 —— 不钉住的话，克隆出来就是 CRLF，
  `npm run format:check` 会对全部 24 个 `.ts` 报「需要格式化」，
  跨平台的 `npm run check` 也会变成假漂移。
- 新增两条回归门槛，防止本次修掉的版本问题复发：
  `versions.json` 必须把当前版本映射到当前 `minAppVersion`；
  只要代码还在用 `fileManager.trashFile`，`minAppVersion` 就必须 ≥ 1.6.6
  （两条都做过负向对照验证灵敏度）。

### 安装约定

发版的 git tag **不带 `v` 前缀**：官方要求 Release 的 tag 与 `manifest.json` 的 `version` 一致，
Obsidian 正是靠这个相等关系去找可安装的 Release。
