/**
 * 个人规划仪表盘 — 测试用模块包（harness 直连模块，不走 main.js 的 __internals 中转）
 *
 * 做两件事：
 *   1. 扫描 src/ 下所有 .ts，生成一个只做 `export * from` 的入口（放在 tests/.build/，
 *      这样相对模块说明符与机器无关，产物可以逐字节比对）；
 *   2. 用 esbuild 打成 CommonJS 单文件 tests/.build/ppd-modules.cjs。
 *
 * 为什么单独产一个包：测试进程是 Node，读不了 .ts；而 main.js 是给 Obsidian 的交付物，
 * 不该为了测试把内部实现挂在它的导出上。
 *
 * 用法：
 *   node tools/build-modules.mjs            构建
 *   node tools/build-modules.mjs --check     校验产物是否与源码同步（不写文件）
 */
import { build } from "esbuild";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import builtinModules from "builtin-modules";

const CHECK = process.argv.includes("--check");
/** 仓库根 = 插件目录 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BUILD_DIR = join(ROOT, "tests", ".build");
const OUT = join(BUILD_DIR, "ppd-modules.cjs");
const ENTRY = join(BUILD_DIR, "ppd-modules-entry.ts");
const CACHE = tmpdir();

const HEADER = `/*
 * 测试用模块包 —— 由 tools/build-modules.mjs 从 src 下的 TypeScript 模块生成，请勿手改。
 * 用途：tests/harness.js 直接 require 本文件取实现（替代 main.js 的 __internals 中转）。
 */`;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const modules = walk(SRC)
  .filter((file) => !file.endsWith("main.ts"))
  .map((file) => "./" + relative(BUILD_DIR, file).replace(/\\/g, "/").replace(/\.ts$/, ""))
  .sort();

mkdirSync(BUILD_DIR, { recursive: true });
writeFileSync(
  ENTRY,
  "/* 自动生成：把所有源码模块的导出汇总成一个包，供测试直接 import */\n" +
    modules.map((module) => `export * from "${module}";\n`).join("") +
    `export { default as PersonalPlanningDashboard } from "${modules.find((m) => m.endsWith("/plugin"))}";\n`,
  "utf8",
);

const target = CHECK ? join(CACHE, `ppd-modules-check-${process.pid}.cjs`) : OUT;
await build({
  /* 路径注释必须与调用者所在目录无关，否则 --check 会误报漂移 */
  absWorkingDir: ROOT,
  entryPoints: [ENTRY],
  outfile: target,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["es2018"],
  external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  banner: { js: HEADER },
  charset: "utf8",
  legalComments: "none",
  logLevel: "warning"
});

if (CHECK) {
  const fresh = readFileSync(target, "utf8");
  if (!existsSync(OUT)) {
    /* 产物不进版本控制（.gitignore），刚克隆下来时它本来就不存在：
       `npm run check` 不该因为"还没构建过"而红。 */
    rmSync(target, { force: true });
    console.log(
      `ℹ️ 测试用模块包还没构建过（${fresh.split("\n").length} 行待生成），跳过同步校验；运行 npm run build 生成。`,
    );
    process.exit(0);
  }
  const current = readFileSync(OUT, "utf8");
  rmSync(target, { force: true });
  if (fresh !== current) {
    console.error("测试用模块包与源码不同步，请运行：node tools/build-modules.mjs");
    process.exit(1);
  }
  console.log("✅ 测试用模块包与源码同步：" + modules.length + " 个模块 · " + current.split("\n").length + " 行");
  process.exit(0);
}

const text = readFileSync(OUT, "utf8");
console.log(`测试用模块包已生成：${modules.length} 个模块 · ${text.split("\n").length} 行 · ${statSync(OUT).size} 字节`);
