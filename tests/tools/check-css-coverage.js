"use strict";
/**
 * 静态一致性检查：main.js 中使用的 pp-* class 是否都在 styles.css 里有定义。
 * 用法：node tests/tools/check-css-coverage.js
 *
 * 注意：这里必须做「边界匹配」而不是子串匹配。
 * 早期实现用 css.includes("." + token)，会把 .pp-crop-handle-se 误判为
 * 已覆盖 pp-crop-handle- 这类前缀 token，从而漏掉真正缺样式的类。
 */
const fs = require("node:fs");
const path = require("node:path");

const PLUGIN_DIR = path.resolve(__dirname, "..", "..");

function collectUsedClasses(source) {
  const used = new Set();
  // 以 - 结尾的 token 是代码里拼出来的动态前缀（如 "pp-crop-handle-" + name），不参与静态检查
  const add = (value) => String(value).split(/\s+/).forEach((token) => { if (token.startsWith("pp-") && !token.endsWith("-")) used.add(token); });
  for (const match of source.matchAll(/cls:\s*"([^"]+)"/g)) add(match[1]);
  for (const match of source.matchAll(/cls:\s*\[([^\]]+)\]/g)) for (const quote of match[1].matchAll(/"([^"]+)"/g)) add(quote[1]);
  for (const match of source.matchAll(/addClass\("([^"]+)"\)/g)) add(match[1]);
  for (const match of source.matchAll(/\?\s*"([^"]*pp-[^"]*)"\s*:/g)) add(match[1]);
  for (const match of source.matchAll(/:\s*"([^"]*pp-[^"]*)"\s*\}/g)) add(match[1]);
  return used;
}

/** 在 CSS 里找 .token，且 token 后面不能再跟 \w 或 -（避免前缀误判为已覆盖） */
function hasClassRule(css, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\." + escaped + "(?![\\w-])").test(css);
}

function analyze(dir = PLUGIN_DIR) {
  const main = fs.readFileSync(path.join(dir, "main.js"), "utf8");
  const css = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
  const used = collectUsedClasses(main);
  const missing = [...used].filter((token) => !hasClassRule(css, token)).sort();
  return { used: [...used].sort(), missing, css, main };
}

module.exports = { analyze, collectUsedClasses, hasClassRule, PLUGIN_DIR };

if (require.main === module) {
  const result = analyze();
  console.log("used=" + result.used.length + " missing=" + result.missing.length);
  if (result.missing.length) { console.log(result.missing.join("\n")); process.exitCode = 1; }
}
