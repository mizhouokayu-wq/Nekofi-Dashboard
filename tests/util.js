"use strict";
const assert = require("node:assert/strict");
const { createHarness } = require("./harness");

const tests = [];
/** 当前用例最后一次建立的 harness：run.js 用它做用例级收尾断言 */
let currentHarness = null;
function harnessNow() { return currentHarness; }
function clearHarness() { currentHarness = null; }
function test(name, fn, options) { tests.push({ name, fn, options: options || {} }); }

/** 建立带默认目录与样例数据的仿真 Vault，并加载插件 */
async function setup(options = {}) {
  const harness = createHarness(Object.assign({ data: {} }, options.data === undefined ? {} : { data: options.data }, options.harness || {}));
  if (options.seed !== false) seedStandardVault(harness);
  await harness.loadPlugin(options.load || {});
  await harness.settle();
  /* onload 期间的真实错误先快照再清空：否则「onload 期间无错误」这类断言永远成立 */
  harness.onloadErrors = harness.consoleErrors.slice();
  harness.resetWriteLog();
  harness.consoleErrors.length = 0;
  harness.notices.length = 0;
  // onload 会立刻做一次提醒检查；测试需要可控的提醒状态
  harness.plugin.settings.lastReminderDate = "";
  if (harness.pluginData && typeof harness.pluginData === "object") harness.pluginData.lastReminderDate = "";
  currentHarness = harness;
  return harness;
}

const STANDARD_FILES = {
  "00 草稿箱/灵感随手记.md": "---\ntype: note\nstage: inbox\ntitle: 灵感随手记\n---\n\n临时想法\n",
  "00 草稿箱/待分诊.md": "---\ntype: note\nstage: inbox\n---\n\n待分诊内容\n",
  "20 项目库/仪表盘搭建/仪表盘搭建.md": "---\ntype: project\ntitle: 仪表盘搭建\nstatus: active\noutcome: 有一个能跑的插件\nacceptance: 视图可用\ndeadline: 2026-10-31\nmilestones: [\"未分组\", \"完成 MVP\"]\narea: 长期领域/健康\nweight: 4\n---\n\n## 项目推演\n",
  "20 项目库/仪表盘搭建/完成首页文案.md": "---\ntype: task\ntitle: 完成首页文案\nstatus: todo\nproject: 20 项目库/仪表盘搭建/仪表盘搭建.md\nmilestone: 完成 MVP\ndue: 2026-09-30\nduration: 45\npriority: high\ntask_set: 本周维护\ntask_group: 资料整理\n---\n\n## 任务拆解\n",
  "20 项目库/仪表盘搭建/过期任务.md": "---\ntype: task\ntitle: 过期任务\nstatus: todo\nproject: 20 项目库/仪表盘搭建/仪表盘搭建.md\nmilestone: 未分组\ndue: 2026-09-10\nduration: 30\n---\n",
  "50 日程待办/整理收件箱.md": "---\ntype: task\ntitle: 整理收件箱\nstatus: planning\ntask_set: 本周维护\ntask_group: 执行\nassignee: 同事\nknowledge_refs: [\"[[方法]]\"]\n---\n",
  "50 日程待办/重复日常.md": "---\ntype: task\ntitle: 重复日常\nstatus: todo\ndue: 2026-09-25\nduration: 15\nrecurrence: weekly\n---\n",
  "30 知识库/方法.md": "---\ntype: knowledge\ntitle: 方法\n---\n\n方法正文\n",
  "30 知识库/图书库/设计心理学.md": "---\ntype: book\ntitle: 设计心理学\n---\n\n读书笔记\n",
  "30 知识库/视频/课程.md": "---\ntype: video\ntitle: 课程\n---\n",
  "40 人物库/同事.md": "---\ntype: person\ntitle: 同事\n---\n",
  "10 长期领域/健康.md": "---\ntype: area\ntitle: 健康\n---\n",
  "（AI禁止阅读）秘密.md": "---\ntype: task\ntitle: 不该被读取\n---\n",
  "图片素材/示例.png": ""
};

function seedStandardVault(harness, extra = {}) {
  harness.seedMarkdown(Object.assign({}, STANDARD_FILES, extra));
}

function hasClass(harness, root, cls) { return harness.findByClass(root, cls); }
function eqJson(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

module.exports = { test, tests, setup, seedStandardVault, STANDARD_FILES, hasClass, eqJson, harnessNow, clearHarness };
