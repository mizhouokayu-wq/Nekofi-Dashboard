"use strict";
/**
 * 10 长会话卫生：缓存规模必须收敛，不能随刷新次数增长。
 *
 * 为什么单列：Obsidian 一开就是几个小时，插件会缓存正文与派生值（`noteCache`）。
 * 这类"每轮 +1"的泄漏在功能测试里完全看不出来 —— 每一条用例都只跑一次刷新。
 * 这里用**缓存规模**而不是堆占用做判据：确定性、不会因 GC 时机而 flaky。
 */
const assert = require("node:assert/strict");
const { test, setup } = require("../util");

const PROJECTS = 60;   // 每项目 1 项目 + 3 任务 + 1 知识 + 1 草稿 → 360 篇
const ROUNDS = 20;

function note(kind, extra) {
  const lines = ["---", "type: " + kind, "title: " + kind + " 标题"];
  for (const [key, value] of Object.entries(extra || {})) lines.push(key + ": " + value);
  lines.push("---", "", "## 正文", "", "占位正文。" + "x".repeat(200));
  return lines.join("\n") + "\n";
}

async function seedBigVault(h) {
  for (let p = 0; p < PROJECTS; p += 1) {
    const projectPath = "20 项目库/项目" + p + "/项目" + p + ".md";
    h.seedFile(projectPath, note("project", { status: "active", milestones: '["未分组", "第一版"]', deadline: "2026-12-31" }));
    for (let t = 0; t < 3; t += 1) {
      h.seedFile("50 日程待办/任务" + p + "-" + t + ".md", note("task", {
        status: "todo",
        project: projectPath,
        due: "2026-10-1" + (t % 9),
        duration: 30,
        priority: "high",
      }));
    }
    h.seedFile("30 知识库/知识" + p + ".md", note("knowledge", null));
    h.seedFile("00 草稿箱/草稿" + p + ".md", note("note", { stage: "inbox" }));
  }
}

test("长会话：反复刷新不会让笔记缓存无界增长", async () => {
  const h = await setup({ seed: false });
  await seedBigVault(h);

  await h.plugin.collectWebPayload();
  /* 只有"需要正文"的笔记进缓存：项目 + 任务；知识/草稿读路径不看正文 */
  const expected = PROJECTS * (1 + 3);
  const after = h.plugin.noteCache.size;
  assert.equal(after, expected, "首次采集后缓存应正好是「项目 + 任务」的篇数，实际 " + after);

  for (let round = 0; round < ROUNDS; round += 1) {
    await h.plugin.collectWebPayload();
  }
  assert.equal(h.plugin.noteCache.size, expected,
    "刷新 " + ROUNDS + " 轮后缓存规模不应变化，实际 " + h.plugin.noteCache.size);

  /* 改一篇：只失效那一篇，重新读回之后规模回到同一水平，而不是每轮多一条 */
  const task = h.vault.getFiles().find((file) => file.path.startsWith("50 日程待办/"));
  h.plugin.invalidateNoteCache(task);
  assert.equal(h.plugin.noteCache.size, expected - 1, "精确失效应只丢掉那一篇");
  await h.plugin.collectWebPayload();
  assert.equal(h.plugin.noteCache.size, expected, "重新读回后应回到同一规模");
});

test("长会话：缓存有上限，超过 4000 篇时淘汰最旧的一批（不是整体清空）", async () => {
  const h = await setup({ seed: false });
  await seedBigVault(h);
  await h.plugin.collectWebPayload();

  /* 直接验证上限逻辑存在且生效：把缓存塞到上限之上，再采集一次 */
  for (let index = 0; index < 4200; index += 1) {
    h.plugin.noteCache.set("虚拟路径/" + index + ".md", { mtime: 0, size: 0, indexed: true, frontmatter: {}, body: "" });
  }
  const before = h.plugin.noteCache.size;
  assert.ok(before > 4000, "前置：缓存已超过上限，实际 " + before);
  await h.plugin.collectWebPayload();
  /* 不该被整体清空（那会让下一次刷新把上千篇重新读盘）：应停在轮中硬上限以内，且真实笔记仍在 */
  const hardLimit = 8000;
  assert.ok(h.plugin.noteCache.size <= hardLimit,
    "超过上限后应被裁剪到硬上限以内，实际 " + h.plugin.noteCache.size);
  const stillCached = h.vault.getFiles().filter((file) => h.plugin.noteCache.has(file.path)).length;
  assert.ok(stillCached > 0, "裁剪后仍应保留真实笔记的缓存，而不是清空");
  const stale = [...h.plugin.noteCache.keys()].filter((key) => key.startsWith("虚拟路径/")).length;
  assert.ok(stale < 4200, "陈旧的虚拟条目应被优先淘汰，实际还剩 " + stale);
});

test("长会话：库大于缓存上限时，每轮刷新只重读放不下的那部分（顺序扫描不能抖成 100% 未命中）", async () => {
  /* 这条是"逐条淘汰"那个 bug 的直接护栏：扫描顺序与插入顺序一致时，
     边扫边淘汰会把"还没轮到"的条目先扔掉 —— 4,400 篇的库上实测命中率 0%。
     上限 4,000、库 4,400 → 每轮只应重读约 400 篇（= 工作集 − 上限）。 */
  const h = await setup({ seed: false });
  const PROJECTS_BIG = 1100;
  for (let p = 0; p < PROJECTS_BIG; p += 1) {
    const projectPath = "20 项目库/项目" + p + "/项目" + p + ".md";
    h.seedFile(projectPath, note("project", { status: "active", milestones: '["未分组"]', deadline: "2026-12-31" }));
    for (let t = 0; t < 3; t += 1) {
      h.seedFile("50 日程待办/任务" + p + "-" + t + ".md", note("task", { status: "todo", project: projectPath, due: "2026-10-10", duration: 30 }));
    }
  }

  let reads = 0;
  const vault = h.plugin.app.vault;
  const originalRead = vault.cachedRead.bind(vault);
  vault.cachedRead = async (file) => {
    reads += 1;
    return originalRead(file);
  };

  await h.plugin.collectWebPayload();          /* 冷启动：必然全读 */
  reads = 0;
  await h.plugin.collectWebPayload();          /* 第二轮：应只剩放不下的那几百篇 */
  const managed = PROJECTS_BIG * 4;
  assert.ok(reads <= 700, "第二轮读盘应接近「工作集 − 上限」，实际 " + reads + " / " + managed);

  reads = 0;
  await h.plugin.collectWebPayload();          /* 第三轮同样 */
  assert.ok(reads <= 700, "第三轮读盘应保持同一水平，实际 " + reads + " / " + managed);
});
