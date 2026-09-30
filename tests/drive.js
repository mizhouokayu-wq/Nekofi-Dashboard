"use strict";
/** 驱动插件交互的测试辅助：打开表单、填值、提交、读取 frontmatter */
const { parseFrontmatter } = require("./harness");

const VIEW = {
  dashboard: "personal-planning-dashboard",
  project: "personal-planning-project",
  inbox: "personal-planning-inbox",
  tasks: "personal-planning-tasks",
  resources: "personal-planning-resources",
  app: "personal-planning-dashboard-app"
};

function fm(harness, filePath) {
  const raw = harness.vault.__readRaw(filePath);
  if (raw === undefined) throw new Error("文件不存在：" + filePath);
  return parseFrontmatter(raw);
}

function raw(harness, filePath) { return harness.vault.__readRaw(filePath); }

function paths(harness) { return harness.vault.getMarkdownFiles().map((file) => file.path); }

function exists(harness, filePath) { return Boolean(harness.vault.getAbstractFileByPath(filePath)); }

/** 触发表单/Modal 并等待其出现 */
async function openModal(harness, trigger) {
  trigger();
  await harness.settle();
  const modal = harness.lastModal();
  if (!modal || modal.closed) throw new Error("没有打开任何 Modal");
  return modal;
}

function fill(modal, values) {
  Object.keys(values).forEach((key) => {
    const control = modal.controls && modal.controls[key];
    if (!control) throw new Error("表单缺少字段：" + key + "（现有字段：" + Object.keys(modal.controls || {}).join(", ") + "）");
    control.setValue(values[key]);
  });
  return modal;
}

async function submit(harness, modal, label) {
  const result = await harness.submitModal(modal, label);
  await harness.settle();
  return result;
}

/** 选择 ChoiceModal 中的一项 */
async function choose(harness, label) {
  const modal = harness.lastModal();
  const result = harness.clickText(modal.contentEl, label);
  await harness.settle();
  if (result && typeof result.then === "function") await result;
  await harness.settle();
  return result;
}

/** 勾选 MultiChoiceModal 中的条目并继续 */
async function checkItems(harness, labels) {
  const modal = harness.lastModal();
  const checkboxes = harness.findByClass(modal.contentEl, "pp-multi-choice-row").map((row) => row.children[0]);
  labels.forEach((label) => {
    const target = harness.findText(modal.contentEl, label)[0];
    if (!target) throw new Error("找不到草稿：" + label);
    let row = target;
    while (row && !row.classList.contains("pp-multi-choice-row")) row = row.parentElement;
    const index = harness.findByClass(modal.contentEl, "pp-multi-choice-row").indexOf(row);
    const checkbox = checkboxes[index];
    checkbox.checked = true;
    checkbox.dispatch("change");
  });
  return harness.clickText(modal.contentEl, "继续");
}

module.exports = { VIEW, fm, raw, paths, exists, openModal, fill, submit, choose, checkItems };
