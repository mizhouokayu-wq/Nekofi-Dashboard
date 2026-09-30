/**
 * 个人规划仪表盘 — TypeScript 构建脚本
 *
 * 构建：src/*.ts --esbuild(cjs, bundle)--> main.js --sync 注入渲染层区块--> main.js
 *
 * 仓库根就是 Obsidian 插件目录（manifest.json / main.js / styles.css 都在根上），
 * 所以这里所有路径都相对本文件解析 —— 克隆到任何位置都能构建。
 *
 * 用法：
 *   node tools/build.mjs          构建（写 main.js + tests/.build/ppd-modules.cjs）
 *   node tools/build.mjs --check   校验产物是否与源码同步（绝不写 main.js）
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import builtinModules from "builtin-modules";

const CHECK = process.argv.includes("--check");
/** 仓库根 = 插件目录 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const MAIN = join(ROOT, "main.js");
/** 校验用的临时产物放系统临时目录：校验动作绝不碰仓库里的产物 */
const CACHE = tmpdir();
const OUT = CHECK ? join(CACHE, `ppd-main-check-${process.pid}.js`) : MAIN;
const MODULES_SCRIPT = join(ROOT, "tools", "build-modules.mjs");
const SYNC_SCRIPT = join(ROOT, "tools", "sync-app.mjs");

const HEADER = `/*
 * 个人规划仪表盘 — Obsidian 插件运行时（由 TypeScript 源码构建，请勿直接编辑）
 *
 * 源码：src/*.ts（渲染层另有 web/app.js + web/styles.css，构建时注入文件末尾的生成区块）
 * 构建：node tools/build.mjs        （产物就是本文件）
 * 校验：node tools/build.mjs --check
 *
 * 数据边界：Markdown + YAML frontmatter 是唯一事实来源。视图只读取、展示、跳转，
 * 写操作全部由用户显式触发；路径中包含「AI禁止阅读」的文件或目录永不读取。
 */`;

const options = {
  /* 路径注释必须与调用者所在目录无关，否则 --check 会误报漂移 */
  absWorkingDir: ROOT,
  entryPoints: [join(ROOT, "src", "main.ts")],
  outfile: OUT,
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2018"],
  /* obsidian / electron / node 内置模块由宿主提供，绝不打进产物 */
  external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  banner: { js: HEADER },
  /* 必须显式指定 utf8：esbuild 默认 charset=ascii 会把中文转义成 \uXXXX，
     产物既没法读，也会让"扫描 main.js 文本"的门槛用例失效 */
  charset: "utf8",
  legalComments: "none",
  logLevel: "warning"
};

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
const bytes = (text) => Buffer.byteLength(text, "utf8");

if (CHECK) {
  /* 只构建到系统临时目录（含 sync 注入），然后与现有 main.js 逐字节比较 —— 校验绝不改产物 */
  await build(options);
  const injected = spawnSync(process.execPath, [SYNC_SCRIPT, "--target", OUT], { cwd: WEB, encoding: "utf8" });
  if (injected.status !== 0) {
    process.stderr.write(injected.stderr || "");
    process.exit(injected.status ?? 1);
  }
  const fresh = readFileSync(OUT, "utf8");
  const current = readFileSync(MAIN, "utf8");
  rmSync(OUT, { force: true });
  if (fresh !== current) {
    console.error(
      `main.js 与 TypeScript 源码不同步（临时构建 ${fresh.split("\n").length} 行 / 现有 ${current.split("\n").length} 行，sha256 ${hash(fresh)} vs ${hash(current)}）。请运行：node tools/build.mjs`,
    );
    process.exit(1);
  }
  const sync = spawnSync(process.execPath, [SYNC_SCRIPT, "--check"], { cwd: WEB, encoding: "utf8" });
  if (sync.stdout) process.stdout.write(sync.stdout);
  if (sync.stderr) process.stderr.write(sync.stderr);
  if (sync.status !== 0) process.exit(sync.status ?? 1);
  /* 测试用模块包（harness 直连的产物）也要一起校验同步 */
  const modulesCheck = spawnSync(process.execPath, [MODULES_SCRIPT, "--check"], { encoding: "utf8" });
  if (modulesCheck.stdout) process.stdout.write(modulesCheck.stdout);
  if (modulesCheck.stderr) process.stderr.write(modulesCheck.stderr);
  if (modulesCheck.status !== 0) process.exit(modulesCheck.status ?? 1);
  console.log(
    `✅ main.js 与源码同步：${bytes(current)} 字节 · ${current.split("\n").length} 行 · sha256:${hash(current)}`,
  );
  process.exit(0);
}

await build(options);

/* 再跑一次 sync：注入 Web 渲染层区块 + 插件调色板（门槛语义保持不变） */
const sync = spawnSync(process.execPath, [SYNC_SCRIPT], { cwd: WEB, encoding: "utf8" });
if (sync.stdout) process.stdout.write(sync.stdout);
if (sync.stderr) process.stderr.write(sync.stderr);
if (sync.status !== 0) process.exit(sync.status ?? 1);

/* 测试用模块包：harness 直接 require 它取实现（不再走 main.js 的 __internals 中转） */
const modulesBuild = spawnSync(process.execPath, [MODULES_SCRIPT], { encoding: "utf8" });
if (modulesBuild.stdout) process.stdout.write(modulesBuild.stdout);
if (modulesBuild.stderr) process.stderr.write(modulesBuild.stderr);
if (modulesBuild.status !== 0) process.exit(modulesBuild.status ?? 1);

const after = readFileSync(MAIN, "utf8");
console.log(`main.js 已生成：${bytes(after)} 字节 · ${after.split("\n").length} 行 · sha256:${hash(after)}`);
