"use strict";
/** 交付物静态检查：manifest / 语法 / 依赖 / 样式一致性 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test, tests, setup, eqJson } = require("../util");
const { analyze, PLUGIN_DIR } = require("../tools/check-css-coverage");

function readPluginFile(name) { return fs.readFileSync(path.join(PLUGIN_DIR, name), "utf8"); }

test("manifest.json 字段完整且 id 与目录名一致", async () => {
  const manifest = JSON.parse(readPluginFile("manifest.json"));
  ["id", "name", "version", "minAppVersion", "description", "author"].forEach((key) => {
    assert.ok(manifest[key], "manifest 缺少字段：" + key);
  });
  /* Obsidian 靠"目录名 = manifest.id"找到插件 —— 只在**已经装进插件目录**时才检查：
     `.../.obsidian/plugins/<id>`。开发时把仓库克隆成任意目录名（CI 的临时目录也是）不该红。 */
  const installedAsPlugin = path.basename(path.dirname(PLUGIN_DIR)) === "plugins";
  if (installedAsPlugin) {
    assert.equal(
      path.basename(PLUGIN_DIR),
      manifest.id,
      "插件目录名必须等于 manifest.id（Obsidian 靠它找插件）",
    );
  } else {
    assert.ok(manifest.id.length > 0, "manifest 必须有 id");
  }
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.isDesktopOnly, "boolean");
});

test("main.js 语法可解析且只依赖 obsidian", async () => {
  const source = readPluginFile("main.js");
  assert.doesNotThrow(() => new vm.Script(source, { filename: "main.js" }), "main.js 语法错误");
  const requires = [...source.matchAll(/require\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]);
  eqJson([...new Set(requires)], ["obsidian"], "插件不应引入第三方运行时依赖");
  /* 入口拆包后 main.ts 只写 `module.exports = PersonalPlanningDashboard;`：
     断言"确实导出了插件类"，但不要求字面量 `= class`（那只是单文件时代的形态）。
     真正的保证在下一行（类必须继承 *.Plugin）+ 测试全程都在 new 这个导出。 */
  assert.ok(/module\.exports\s*=\s*[A-Za-z_$][\w$]*\s*;/.test(source), "必须导出插件类（module.exports = <类>）");
  /* 断言"确实继承了 obsidian.Plugin"，但不写死命名空间变量名：打包器会按需重命名
     （obsidian / import_obsidian / obsidian2…），写死只会因为重构而红，守不住任何东西。 */
  assert.ok(/extends\s+[A-Za-z_$][\w$]*\.Plugin/.test(source),
    "插件类应继承 obsidian.Plugin，实际：" + (source.match(/extends[^\n]{0,40}/) || ["(没找到 extends)"])[0]);
});

test("main.js 不残留调试输出", async () => {
  const source = readPluginFile("main.js");
  assert.equal((source.match(/console\.log\(/g) || []).length, 0, "生产代码不应保留 console.log");
  assert.equal((source.match(/debugger/g) || []).length, 0);
  assert.equal((source.match(/TODO|FIXME|XXX/g) || []).length, 0, "不应遗留未完成标记");
});

test("styles.css 结构完好且覆盖全部插件 class", async () => {
  const css = readPluginFile("styles.css");
  assert.ok(!css.startsWith("\uFEFF"), "styles.css 不应有 BOM");
  assert.ok(!/\\n/.test(css), "styles.css 不应包含字面量 \\n 转义");
  const opens = (css.match(/\{/g) || []).length;
  const closes = (css.match(/\}/g) || []).length;
  assert.equal(opens, closes, "CSS 花括号不配对：" + opens + " vs " + closes);
  const result = analyze(PLUGIN_DIR);
  eqJson(result.missing, [], "以下 class 在 main.js 中使用但没有样式定义");
  assert.ok(result.used.length > 80, "样式覆盖率检查应覆盖全部视图 class，实际：" + result.used.length);
});

test("夜航极光配色只作用于插件视图与弹窗", async () => {
  const css = readPluginFile("styles.css");

  // 0. 令牌齐全：5 级底色 / 描边 / 4 级文字 / 主色与语义色 / 渐变身份 / 圆角
  ["--pp-bg-0:", "--pp-bg-1:", "--pp-bg-2:", "--pp-bg-3:", "--pp-bg-4:",
    "--pp-line-1:", "--pp-line-2:", "--pp-line-3:",
    "--pp-ink-1:", "--pp-ink-2:", "--pp-ink-3:", "--pp-ink-4:",
    "--pp-coral:", "--pp-coral-hi:", "--pp-mint:", "--pp-lilac:", "--pp-amber:", "--pp-rose:",
    "--pp-grad-cta:", "--pp-grad-active:", "--pp-grad-fill:", "--pp-grad-hero:", "--pp-halo:",
    "--pp-lift-1:", "--pp-lift-2:",
    "--pp-r-sm:", "--pp-r-md:", "--pp-r-lg:", "--pp-r-xl:", "--pp-r-pill:"].forEach((token) => {
    assert.ok(css.includes(token), "配色系统缺少令牌 " + token);
  });
  ["#ff8fa3", "#a78bfa", "#5fe3c0", "#ffc46b", "#ff5f7a", "#110e1f"].forEach((hex) => {
    assert.ok(css.includes(hex), "配色系统缺少颜色 " + hex);
  });

  // 1. 令牌必须定义在插件自己的作用域块里，并把 Obsidian 变量映射回主题令牌
  //    （弹窗容器也在作用域里：`.modal` 才是画背景的那层，而自定义属性不向父级继承）
  const scope = css.match(/\.pp-view-root,\s*\n\.pp-modal,\s*\n\.modal-container:has\(\.pp-modal\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(scope, "应存在 .pp-view-root / .pp-modal / .modal-container:has(.pp-modal) 的令牌作用域块");
  assert.ok(scope[1].includes("--background-primary: var(--pp-bg-1)"), "页面底色应定义在插件作用域内");
  assert.ok(scope[1].includes("--text-normal: var(--pp-ink-2)"), "正文色应指向主题令牌");
  assert.ok(scope[1].includes("--interactive-accent: var(--pp-coral)"), "唯一主色应是落日珊瑚");
  assert.equal((css.match(/--background-primary:\s*var\(--pp-bg-1\)/g) || []).length, 1, "页面底色只应定义一次");

  // 2. 不允许把配色写到全局作用域，避免污染 Obsidian 其它界面
  [":root", "body", "html", ".workspace", ".app-container"].forEach((selector) => {
    const pattern = new RegExp("(^|\\n)\\s*" + selector.replace(".", "\\.") + "\\s*\\{[^}]*--(background-primary|text-normal|interactive-accent)", "m");
    assert.ok(!pattern.test(css), "不得在 " + selector + " 上覆盖 Obsidian 主题变量");
  });

  // 3. 质感：玻璃面板（顶部高光 + 柔和投影）、渐变身份、胶囊圆角
  assert.ok(/--pp-lift-1:\s*0 1px 0 rgba\(255, 255, 255/.test(css), "玻璃面板应有顶部一线高光");
  assert.ok(css.includes("backdrop-filter"), "导航应有毛玻璃");
  assert.ok(css.includes("prefers-reduced-motion"), "应尊重 prefers-reduced-motion");

  // 4. 弹窗换底用 :has 渐进增强，失败时自然退回原生外观
  assert.ok(/\.modal-container:has\(\.pp-modal\)/.test(css), "弹窗换底应使用 :has 作用域");
  assert.ok(/\.modal-container:has\(\.pp-crop-modal\)/.test(css), "裁剪弹窗需要放宽宽度");
});

test("data.json 可解析且字段类型正确（没有这个文件时校验默认值）", async () => {
  const dataPath = path.join(PLUGIN_DIR, "data.json");
  /* data.json 是 Obsidian 运行时写的设置文件、且含本机库的目录名，**不进版本控制**：
     仓库里没有它是正常的；此时退而校验代码里的默认配置，保证"缺文件也不会崩"。 */
  if (!fs.existsSync(dataPath)) {
    const h = await setup({ seed: false, data: {} });
    const defaults = h.helpers.DEFAULTS;
    assert.equal(typeof defaults.projectFolder, "string", "默认配置应提供 projectFolder");
    assert.equal(typeof defaults.dailyCapacityMinutes, "number", "默认配置应提供 dailyCapacityMinutes");
    assert.equal(typeof defaults.remindersEnabled, "boolean", "默认配置应提供 remindersEnabled");
    assert.equal(typeof defaults.assetFolder, "string", "默认配置应提供 assetFolder");
    return;
  }
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  assert.equal(typeof data.projectFolder, "string");
  assert.equal(typeof data.dailyCapacityMinutes, "number");
  assert.equal(typeof data.remindersEnabled, "boolean");
  assert.equal(typeof data.assetFolder, "string");
});

test("默认配置与文档中的目录结构一致", async () => {
  const h = await setup({ seed: false, data: {} });
  const defaults = h.helpers.DEFAULTS;
  eqJson([
    defaults.inboxFolder, defaults.areaFolder, defaults.projectFolder,
    defaults.knowledgeFolder, defaults.bookFolder, defaults.peopleFolder,
    defaults.taskFolder, defaults.archiveFolder
  ], ["00 草稿箱", "10 长期领域", "20 项目库", "30 知识库", "30 知识库/图书库", "40 人物库", "50 日程待办", "90 归档库"]);
  assert.equal(defaults.dailyCapacityMinutes, 120);
  assert.equal(defaults.planningHorizonDays, 7);
  assert.equal(defaults.reminderHour, 9);
  assert.equal(defaults.assetFolder, "图片素材");
});

test("测试目录本身不进入插件运行时路径", async () => {
  const source = readPluginFile("main.js");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!code.includes("tests/"), "运行时代码不应引用测试目录（注释除外）");
  assert.ok(!code.includes('require("./'), "main.js 必须保持单文件可加载");
  assert.ok(!code.includes("__helpers") && !code.includes("__exposed"), "main.js 不应包含仅为测试注入的导出钩子");
});

test("versions.json 存在，且把当前版本映射到当前 minAppVersion", async () => {
  /* 官方样例仓库在根目录放 versions.json（版本 → 该版本要求的 minAppVersion），
     是 Obsidian 判断「老 app 该退到哪个插件版本」的依据。缺失不会让插件装不上，
     但会让兼容性回退无从判断 —— 公开发布前补齐。 */
  const manifest = JSON.parse(readPluginFile("manifest.json"));
  const versions = JSON.parse(readPluginFile("versions.json"));
  assert.equal(
    versions[manifest.version],
    manifest.minAppVersion,
    "versions.json 必须把当前版本 " + manifest.version + " 映射到当前 minAppVersion",
  );
});

test("minAppVersion 覆盖了删除路径硬依赖的 FileManager.trashFile（@since 1.6.6）", async () => {
  /* 真实踩过的坑：manifest 写 1.5.0，而删除路径统一走 fileManager.trashFile
     （obsidian.d.ts 标注 @since 1.6.6）。Obsidian 只拦「app 版本 < minAppVersion」，
     所以 1.5.0–1.6.5 的用户能装上、能打开，然后每次删除都抛 TypeError；
     而插件刻意不提供 vault.delete 回退（那会绕过用户的「删除文件」设置），于是没有退路。
     代码若哪天不再用 trashFile，这条门槛自动失效（不是写死一个"必须 ≥ 1.6.6"的教条）。 */
  const manifest = JSON.parse(readPluginFile("manifest.json"));
  const usesTrashFile = /fileManager\.trashFile\(/.test(readPluginFile("main.js"));
  if (!usesTrashFile) return;
  const required = [1, 6, 6];
  const actual = manifest.minAppVersion.split(".").map(Number);
  const covered =
    actual[0] !== required[0]
      ? actual[0] > required[0]
      : actual[1] !== required[1]
        ? actual[1] > required[1]
        : actual[2] >= required[2];
  assert.ok(
    covered,
    "删除路径用 FileManager.trashFile（@since 1.6.6），minAppVersion 必须 ≥ 1.6.6，实际：" + manifest.minAppVersion,
  );
});

module.exports = { title: "06 交付物静态检查", tests };
