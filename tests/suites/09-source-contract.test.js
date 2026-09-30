"use strict";
/**
 * 09 源码契约：视图 ↔ 插件之间的类型契约不能被改回 any。
 *
 * 为什么单独守：把 `plugin: DashboardHost` 改回 `plugin: any` 之后，`tsc` 依然是 0 error
 * （any 让检查消失，而不是报错），所以类型系统本身拦不住这种回退 —— 只能靠这条文本契约。
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("../util");

const PLUGIN_DIR = path.resolve(__dirname, "..", "..");
const SRC = path.join(PLUGIN_DIR, "src");

const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
};

test("视图与设置层不再用 plugin: any，而是 DashboardHost 契约", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, "/");
    if (rel === "host.ts") continue;                       // 契约文件自己在注释里提到过 any
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      if (/plugin:\s*any\b/.test(line) && !line.trim().startsWith("*")) offenders.push(rel + " → " + line.trim());
    }
  }
  assert.equal(offenders.length, 0, "不应再有 plugin: any：\n    " + offenders.join("\n    "));
});

test("契约三件套：接口存在、消费方用它、提供方 implements 它", () => {
  const host = read("host.ts");
  assert.ok(/export interface DashboardHost\b/.test(host), "host.ts 应导出 DashboardHost");
  assert.ok(/settings: Settings;/.test(host), "契约里 settings 应是 Settings 类型");

  const base = read("views/base.ts");
  assert.ok(/plugin:\s*DashboardHost;/.test(base), "PlanningView.plugin 应是 DashboardHost");

  const plugin = read("plugin.ts");
  assert.ok(/implements DashboardHost\b/.test(plugin), "插件类应 implements DashboardHost");
  assert.ok(/settings:\s*Settings\b/.test(plugin), "插件类 settings 应是 Settings 类型");
});

test("契约覆盖消费方真正用到的每个成员", () => {
  const host = read("host.ts");
  const declared = new Set([...host.matchAll(/^\s{2}([A-Za-z_$][\w$]*)[(:]/gm)].map((match) => match[1]));
  const used = new Set();
  for (const dir of ["views", "settings"]) {
    for (const file of walk(path.join(SRC, dir))) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/this\.plugin\.([A-Za-z_$][\w$]*)/g)) used.add(match[1]);
    }
  }
  /* core/web.ts 的两个渲染函数是通过参数拿到插件的 */
  for (const match of read("core/web.ts").matchAll(/\bplugin\.([A-Za-z_$][\w$]*)/g)) used.add(match[1]);

  const missing = [...used].filter((name) => !declared.has(name)).sort();
  assert.equal(missing.length, 0, "契约缺少成员：" + missing.join("、"));
});

test("数据安全：删除必须走 fileManager.trashFile，不允许 vault.delete", () => {
  /* 跟随用户「删除文件」设置的入口只有 `fileManager.trashFile`（系统回收站 / 库内 .trash /
     永久删除三选一）。`vault.delete(entry, true)` 是永久删除；`vault.delete(entry)` 也不读设置
     —— 对文件是直接 unlink，在 Obsidian 1.13 里对文件夹更会以 ERR_FS_EISDIR 直接失败
     （FileSystemAdapter.rmdir 把 recursive=force 透给 fs.rm，force 默认 false），
     用户实测报错：Path is a directory: rm returned EISDIR (is a directory) 20 项目库\仪表盘搭建。
     这类回退在功能测试里看不出来（文件确实都没了），只能靠这条文本契约拦住。 */
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file);
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        const at = rel + ":" + (index + 1);
        if (/\.delete\([^)]*,\s*true\s*\)/.test(line)) offenders.push(at + " → 强制永久删除：" + trimmed);
        else if (/\.vault\.delete\(/.test(line)) offenders.push(at + " → 删除要跟随「删除文件」设置，请用 fileManager.trashFile：" + trimmed);
      });
  }
  assert.equal(offenders.length, 0, "删除路径必须跟随用户的「删除文件」设置：\n    " + offenders.join("\n    "));
});

test("批量失败清单：同一个数组不该连续两次推入同一个值", () => {
  /* 真实 bug 的样子（已修）：批量移动的 catch 里
       failedPaths.push(path);
       （空行）
       failedPaths.push(path);
     多出来的那一次会让 lastBulkFailures.paths 出现重复条目，而渲染层正是用它显示
     "上次操作有 N 条没成功" 与 "重试这 N 条" —— 计数直接翻倍、同一篇笔记列两遍。
     这类复制粘贴残留不会让 tsc 或功能测试变红（数据本身没错），只能靠文本检查。 */
  const offenders = [];
  const PUSH = /^\s*([A-Za-z_$][\w$]*)\.push\(([^;]+)\);\s*$/;
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const first = PUSH.exec(lines[index]);
      if (!first) continue;
      for (let step = 1; step <= 2; step += 1) {
        const second = PUSH.exec(lines[index + step] || "");
        if (second && second[1] === first[1] && second[2] === first[2]) {
          offenders.push(rel + ":" + (index + 1) + " 与 " + (index + step + 1) + " → " + lines[index].trim());
        }
      }
    }
  }
  assert.equal(offenders.length, 0, "同一个数组连续推入同一个值，疑似复制粘贴残留：\n    " + offenders.join("\n    "));
});

test("删除确认框的文案不得与行为相反", () => {
  /* 删除入口走的是 fileManager.trashFile（跟随用户的「删除文件」设置），
     所以确认框里不能出现"不能撤销 / 会被永久删除"这类断言 —— 那是永久删除语义的说法。
     这类不一致 tsc 与功能测试都看不出来，只有用户会被误导。 */
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file);
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (!line.includes("ConfirmModal(")) return;          // 只查确认框那一行
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        if (line.includes("不能撤销") || line.includes("会被永久删除"))
          offenders.push(rel + ":" + (index + 1) + " → " + trimmed);
      });
  }
  assert.equal(offenders.length, 0, "确认框文案必须与实际删除语义一致：\n    " + offenders.join("\n    "));
});

test("取景不能改变横幅形状，且必须由 background-size 承载（两条都别再走回头路）", async () => {
  /* 这条路踩过两个坑，各留一条静态契约：
     ① 只设 background-position 时，cover 只会平移不会放大 → 显示的是"图片最中间那一块"；
     ② 反过来给横幅无条件套 aspect-ratio 时，整屏宽下横幅被拉成一大块
        （用户报的"主页横幅突然变得很宽"）。
     结论：形状保持原样，取景靠 background-size + background-position 表达。 */

  /* ① 取景必须设置背景尺寸 */
  const assets = fs.readFileSync(path.join(SRC, "core", "assets.ts"), "utf8");
  const fnStart = assets.indexOf("export function applyHeroCrop");
  assert.ok(fnStart >= 0, "找不到 applyHeroCrop");
  const fnBody = assets.slice(fnStart, fnStart + 2200);
  assert.ok(
    /style\.backgroundSize\s*=/.test(fnBody),
    "applyHeroCrop 必须设置 background-size —— 否则 cover 只会平移，取景区域显示不出来",
  );
  assert.ok(/style\.backgroundPosition\s*=/.test(fnBody), "applyHeroCrop 必须设置 background-position");

  /* ② Web 面板的横幅不许按取景改形状（原生视图的宽屏 16:5 是原设计，保留） */
  const webCss = fs.readFileSync(path.join(PLUGIN_DIR, "web", "styles.css"), "utf8");
  const offenders = [];
  for (const match of webCss.matchAll(/([^{}]*\[data-crop[^{}]*)\{([^}]*)\}/g)) {
    if (/aspect-ratio|min-height\s*:\s*0/.test(match[2])) offenders.push(match[1].trim() + " { " + match[2].trim() + " }");
  }
  assert.equal(
    offenders.length,
    0,
    "Web 横幅不得用 aspect-ratio / min-height:0 改形状（整屏宽下会被拉宽）：\n    " + offenders.join("\n    "),
  );
});
