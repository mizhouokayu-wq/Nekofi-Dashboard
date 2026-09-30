/**
 * 入口：只做一件事 —— 把插件类交给 Obsidian。
 *
 * 运行时这里是 main.js；真正的逻辑在 src/core（纯函数）、src/views（视图）、
 * src/settings（设置页）、src/plugin（插件主体）。测试不再从这里取实现：
 * tests/harness.js 直接 require 由 build-modules.mjs 打出的测试用模块包。
 */
import PersonalPlanningDashboard from "./plugin";

module.exports = PersonalPlanningDashboard;
