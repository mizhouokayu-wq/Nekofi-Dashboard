/**
 * 版本号统一升级：一处命令同时改四处，避免「manifest 涨了、产物说明没涨」的漂移。
 *
 *   manifest.json             → version（Obsidian 认这个，Release 门禁也拿它对 tag）
 *   package.json              → version
 *   package-lock.json         → 根版本（顶层 version 与 packages[""].version 两处）
 *   src/core/constants.ts     → PLUGIN_BUILD = "<版本>-<slug> (<构建号+1>)"（设置页会显示）
 *
 * 用法：
 *   node tools/bump-version.mjs 0.5.1
 *   node tools/bump-version.mjs 0.6.0 --slug nightfall-aurora   # 不给 slug 就沿用旧的
 *
 * 只改这四处文本，不碰产物：改完必须 `npm run build` 重建 main.js / 测试用模块包，
 * 再 `npm run check && npm test`，然后 commit + 打 tag（发版由 .github/workflows/release.yml 接手）。
 *
 * tag 必须**不带 v 前缀**：Obsidian 找的是「tag 等于 manifest.json 的 version」的那个 Release。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "manifest.json");
const PACKAGE = join(ROOT, "package.json");
const CONSTANTS = join(ROOT, "src", "core", "constants.ts");
const LOCK = join(ROOT, "package-lock.json");

const args = process.argv.slice(2);
const version = String(args[0] || "").trim();
const slugIndex = args.indexOf("--slug");
const slugArg = slugIndex >= 0 ? String(args[slugIndex + 1] || "").trim() : "";

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("用法：node tools/bump-version.mjs <主.次.修> [--slug <英文短名>]");
  console.error("  例：node tools/bump-version.mjs 0.2.10 --slug done-stays");
  process.exit(1);
}

/* ---------- manifest.json / package.json：带缩进的 JSON，逐行替换保住排版 ---------- */
const bumpJsonVersion = (file) => {
  const text = readFileSync(file, "utf8");
  const pattern = /("version"\s*:\s*")([^"]*)(")/;
  if (!pattern.test(text)) throw new Error("找不到 version 字段：" + file);
  const before = pattern.exec(text)[2];
  writeFileSync(file, text.replace(pattern, `$1${version}$3`), "utf8");
  return before;
};

/* ---------- package-lock.json：根版本有两处，依赖项自身的 version 一概不动 ---------- */
const bumpLockVersion = (file) => {
  const raw = readFileSync(file, "utf8");
  /* npm 写的 lockfile 是 2 空格缩进 + 结尾换行；保留原文件的换行风格，避免只为改版本号就churn 整个文件 */
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lock = JSON.parse(raw);
  const before = lock.version;
  lock.version = version;
  if (lock.packages && lock.packages[""] && lock.packages[""].version) lock.packages[""].version = version;
  writeFileSync(file, JSON.stringify(lock, null, 2).replace(/\n/g, eol) + eol, "utf8");
  return before;
};

/* ---------- constants.ts：PLUGIN_BUILD = "<版本>-<slug> (<构建号>)" ---------- */
const constantsText = readFileSync(CONSTANTS, "utf8");
const buildPattern = /export const PLUGIN_BUILD = "([^"]*)";/;
const buildMatch = buildPattern.exec(constantsText);
if (!buildMatch) throw new Error("找不到 PLUGIN_BUILD：" + CONSTANTS);
const current = buildMatch[1];
const currentParts = /^([\d.]+)-([^ ]+)\s*\((\d+)\)$/.exec(current);
const buildNumber = currentParts ? Number(currentParts[3]) + 1 : 1;
const slug = slugArg || (currentParts ? currentParts[2] : "build");
const nextBuild = `${version}-${slug} (${buildNumber})`;

const manifestWas = bumpJsonVersion(MANIFEST);
const packageWas = bumpJsonVersion(PACKAGE);
const lockWas = bumpLockVersion(LOCK);
writeFileSync(CONSTANTS, constantsText.replace(buildPattern, `export const PLUGIN_BUILD = "${nextBuild}";`), "utf8");

console.log(`manifest.json    ${manifestWas} → ${version}`);
console.log(`package.json     ${packageWas} → ${version}`);
console.log(`package-lock.json ${lockWas} → ${version}`);
console.log(`PLUGIN_BUILD     ${current} → ${nextBuild}`);
console.log("");
console.log("接下来：");
console.log("  npm run build          # 重建 main.js 与测试用模块包");
console.log("  npm run check && npm test");
console.log(`  git commit -am "${version}" && git tag ${version} && git push --follow-tags   # tag 不带 v，发版流程接手`);
