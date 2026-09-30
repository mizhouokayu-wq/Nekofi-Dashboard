"use strict";
/**
 * 回归测试入口：node tests/run.js [套件关键字]
 * 失败时以非 0 退出码结束。
 */
const fs = require("node:fs");
const path = require("node:path");
const util = require("./util");

const SUITE_DIR = path.join(__dirname, "suites");
const filter = process.argv[2] || "";
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 15000);

let finished = false;
process.on("exit", (code) => {
  if (!finished) console.error("\n[runner] 进程在输出最终结果前退出（code=" + code + "），常见原因是测试里 await 了依赖定时器的 Promise 造成死锁。");
});

async function main() {
  const files = fs.readdirSync(SUITE_DIR).filter((file) => file.endsWith(".test.js")).sort();
  let passed = 0;
  const failures = [];

  /* 第 5 步之后，harness 的实现来自"测试用模块包"（tests/.build/ppd-modules.cjs）。
     它必须比 src/ 里任何一个文件都新，否则测试就是跑在旧实现上 —— 这里直接拒绝运行。 */
  const modulesPath = path.join(__dirname, ".build", "ppd-modules.cjs");
  const srcDir = path.join(__dirname, "..", "src");
  if (!fs.existsSync(modulesPath)) {
    console.error("[runner] 缺少测试用模块包 tests/.build/ppd-modules.cjs，请先运行：npm run build（或 node tools/build-modules.mjs）");
    process.exit(1);
  }
  const newestSource = (function walkNewest(dir) {
    let newest = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const stamp = entry.isDirectory() ? walkNewest(full) : fs.statSync(full).mtimeMs;
      if (stamp > newest) newest = stamp;
    }
    return newest;
  })(srcDir);
  if (fs.statSync(modulesPath).mtimeMs < newestSource) {
    console.error("[runner] 测试用模块包比源码旧，请先运行：npm run build（或 node tools/build-modules.mjs）");
    process.exit(1);
  }

  for (const file of files) {
    if (filter && !file.includes(filter)) continue;
    // util.tests 是所有套件共享的收集数组：先清空，再加载当前套件，避免跨套件重复执行
    util.tests.length = 0;
    require(path.join(SUITE_DIR, file));
    const suite = { title: null, tests: util.tests.slice() };
    const suiteMeta = require(path.join(SUITE_DIR, file));
    suite.title = suiteMeta.title || file;
    const title = suite.title;
    console.log("\n=== " + title + " ===");
    for (const item of suite.tests) {
      const started = Date.now();
      let timer = null;
      try {
        await Promise.race([
          item.fn(),
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("超时：" + TEST_TIMEOUT_MS + "ms 内未结束（可能有未完成的 await 或死循环）")), TEST_TIMEOUT_MS);
          })
        ]);
        const harness = util.harnessNow();
        const allowErrors = item.options && item.options.allowConsoleErrors;
        if (harness && !allowErrors && harness.consoleErrors.length) {
          throw new Error("用例产生了未预期的错误输出：\n       " + harness.consoleErrors.join("\n       "));
        }
        passed += 1;
        console.log("  ok   " + item.name + " (" + (Date.now() - started) + "ms)");
      } catch (error) {
        failures.push({ suite: title, name: item.name, error });
        console.log("  FAIL " + item.name);
        console.log("       " + String((error && error.message) || error).split("\n").join("\n       "));
        if (error && error.expected !== undefined) {
          console.log("       expected: " + JSON.stringify(error.expected));
          console.log("       actual:   " + JSON.stringify(error.actual));
        }
        if (process.env.STACK && error && error.stack) console.log(error.stack);
      } finally {
        if (timer) clearTimeout(timer);
        util.clearHarness();
      }
    }
  }

  console.log("\n----------------------------------------");
  console.log("通过 " + passed + " / 失败 " + failures.length);
  if (failures.length) {
    failures.forEach((failure) => console.log("  - [" + failure.suite + "] " + failure.name));
    process.exitCode = 1;
  }
  finished = true;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
