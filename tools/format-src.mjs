/**
 * 个人规划仪表盘 — 源码格式化
 *
 * 只格式化 src 下的 TypeScript 源码。main.js / styles.css 是构建产物，绝不手改、也不格式化。
 *
 * 用法：
 *   node tools/format-src.mjs --check   只报告哪些文件需要格式化（不写文件）
 *   node tools/format-src.mjs           就地格式化
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

/** 仓库根 = 插件目录 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const CHECK = process.argv.includes("--check");

const config = await prettier.resolveConfig(join(SRC, "main.ts"));
const options = { ...config, filepath: "x.ts", parser: "typescript" };

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = walk(SRC).sort();
const changed = [];
for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = await prettier.format(before, { ...options, filepath: file });
  if (after !== before) {
    changed.push(relative(ROOT, file).replace(/\\/g, "/"));
    if (!CHECK) writeFileSync(file, after, "utf8");
  }
}

const longest = (text) => Math.max(...text.split("\n").map((line) => line.length));
if (CHECK) {
  if (changed.length) {
    console.error(`以下 ${changed.length} 个文件需要格式化（运行 node tools/format-src.mjs）：`);
    for (const name of changed) console.error("  " + name);
    process.exit(1);
  }
  console.log(`✅ src 下 ${files.length} 个 .ts 已符合 prettier 配置`);
  process.exit(0);
}

console.log(`已格式化 ${changed.length} / ${files.length} 个文件`);
let worst = { name: "", length: 0 };
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const length = longest(text);
  if (length > worst.length) worst = { name: relative(ROOT, file), length };
}
console.log(`最长行仍是 ${worst.length} 字符（${worst.name}）`);
