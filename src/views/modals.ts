/** modals：视图/弹窗层，由 src/main.ts 机械拆出（逻辑未改）。 */
import * as obsidian from "obsidian";
import { fieldVisible } from "../core/constants";
import { applyMotionLevel, currentMotionLevel } from "../core/motion";
import { el } from "../core/dom";

export class FormModal extends obsidian.Modal {
  controls: any;
  fields: any;
  /** 字段 id → 那一行 Setting 元素：用于按 `showWhen` 显隐（重复周期这类联动字段） */
  rows: any;
  declare submit: (...args: any[]) => any;
  title: any;
  constructor(app: any, title: any, fields: any, submit: any) {
    super(app);
    this.title = title;
    this.fields = fields;
    this.submit = submit;
    this.controls = {};
    this.rows = {};
  }
  /** 当前表单取值（键与字段 id 一致）——显隐判定与提交读的是同一份 */
  values() {
    const out: Record<string, any> = {};
    this.fields.forEach((field: any) => {
      const control = this.controls[field.id];
      if (control) out[field.id] = typeof control.getValue === "function" ? control.getValue() : "";
    });
    return out;
  }
  /** 按 `showWhen` 显隐字段行。规则是纯数据（不是函数）——同一份规则还要发给 Web 渲染层，
   *  浏览器版的 data.js 是 JSON，函数会在序列化时被丢掉。 */
  refreshVisibility() {
    const current = this.values();
    this.fields.forEach((field: any) => {
      const row = this.rows[field.id];
      if (!row || !row.style) return;
      row.style.display = fieldVisible(field, current) ? "" : "none";
    });
    return this;
  }
  override onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    /* 弹窗每次打开都是新节点，入场动画自然播放（不做退场动画，铁律 5）。
       构造函数只拿到 app、拿不到 plugin，所以强度用 currentMotionLevel() 回落。 */
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    this.fields.forEach((field: any) => {
      const setting = new obsidian.Setting(this.contentEl).setName(field.name);
      if (field.desc) setting.setDesc(field.desc);
      this.rows[field.id] = setting.settingEl;
      if (field.type === "select")
        setting.addDropdown((dropdown: any) => {
          dropdown.addOptions(field.options || {});
          dropdown.setValue(String(field.value || Object.keys(field.options || {})[0] || ""));
          /* 联动回调：必须在 setValue 之后注册 —— 测试桩的 setValue 也会触发 changeHandler，
             先注册会把初始值当成"用户改了" */
          if (typeof field.onChange === "function") dropdown.onChange((value: any) => field.onChange(value, this));
          /* 没有自定义回调的 select 也要驱动显隐（重复周期 → 周几 / 几号 / 重复结束） */
          else dropdown.onChange(() => this.refreshVisibility());
          this.controls[field.id] = dropdown;
        });
      else if (field.type === "datalist")
        setting.addText((textControl: any) => {
          textControl.setValue(String(field.value || ""));
          textControl.setPlaceholder(field.placeholder || "");
          /* datalist：既有取值可下拉选，也允许直接写新值（任务集 / 任务组这类"半开放"字段正合适） */ const listId =
            "pp-datalist-" + field.id;
          const list = setting.controlEl.createEl("datalist", { attr: { id: listId } });
          (field.options || []).forEach((value: any) => {
            list.createEl("option", { value: String(value) });
          });
          textControl.inputEl.setAttr("list", listId);
          textControl.inputEl.setAttr("autocomplete", "off");
          this.controls[field.id] = textControl;
        });
      else if (field.type === "textarea")
        setting.addTextArea((textarea: any) => {
          textarea.setValue(String(field.value || ""));
          textarea.setPlaceholder(field.placeholder || "");
          textarea.inputEl.rows = field.rows || 3;
          this.controls[field.id] = textarea;
        });
      else if (field.type === "date")
        setting.addText((dateControl: any) => {
          dateControl.setValue(String(field.value || ""));
          dateControl.inputEl.type = "date";
          this.controls[field.id] = dateControl;
        });
      else if (field.type === "multiselect") {
        /* 多选（重复周几）：Obsidian 的 Setting 没有多选控件，用一行复选框表达。
           取值进出都是值数组，getValue/setValue 让测试能像其它控件一样填充。 */
        setting.controlEl.addClass("pp-multi-select");
        const parsed = Array.isArray(field.value)
          ? field.value.map((item: any) => String(item))
          : String(field.value === undefined || field.value === null ? "" : field.value)
              .split(/[,，、\s]+/)
              .filter(Boolean);
        const boxes: any[] = [];
        (field.options || []).forEach((option: any) => {
          const value = Array.isArray(option) ? option[0] : option;
          const label = Array.isArray(option) ? option[1] : option;
          const item = setting.controlEl.createEl("label", { cls: "pp-multi-select-item" });
          const input = item.createEl("input", { attr: { type: "checkbox" } });
          input.value = String(value);
          input.checked = parsed.indexOf(String(value)) >= 0;
          input.onchange = () => this.refreshVisibility();
          item.createEl("span", { text: String(label) });
          boxes.push(input);
        });
        const control: any = {
          getValue: () => boxes.filter((box: any) => box.checked).map((box: any) => box.value),
          setValue: (next: any) => {
            const source = Array.isArray(next)
              ? next
              : String(next === undefined || next === null ? "" : next).split(/[,，、\s]+/);
            const wanted = source.map((item: any) => String(item).trim()).filter(Boolean);
            boxes.forEach((box: any) => {
              box.checked = wanted.indexOf(box.value) >= 0;
            });
            return control;
          },
          inputEl: setting.controlEl,
        };
        this.controls[field.id] = control;
      } else
        setting.addText((textControl: any) => {
          textControl.setValue(String(field.value || ""));
          textControl.setPlaceholder(field.placeholder || "");
          this.controls[field.id] = textControl;
        });
    });
    /* 初始显隐：新建任务时「重复周几」这类字段要按当前 recurrence 立刻对齐 */
    this.refreshVisibility();
    new obsidian.Setting(this.contentEl)
      .addButton((button: any) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button: any) =>
        button
          .setCta()
          .setButtonText("保存")
          .onClick(async () => {
            button.setDisabled(true);
            const values: Record<string, any> = {};
            this.fields.forEach((field: any) => (values[field.id] = this.controls[field.id].getValue()));
            try {
              await this.submit(values);
              this.close();
            } catch (error: any) {
              if (!error || !error.expected) console.error(error);
              new obsidian.Notice("保存失败：" + (error.message || error));
              button.setDisabled(false);
            }
          }),
      );
  }
  override onClose() {
    this.contentEl.empty();
  }
}

export class ChoiceModal extends obsidian.Modal {
  choices: any;
  declare choose: (...args: any[]) => any;
  description: any;
  title: any;
  constructor(app: any, title: any, description: any, choices: any, choose: any) {
    super(app);
    this.title = title;
    this.description = description;
    this.choices = choices;
    this.choose = choose;
  }
  override onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    if (this.description) el(this.contentEl, "p", this.description, "pp-muted");
    const list = this.contentEl.createDiv({ cls: "pp-choice-list" });
    this.choices.forEach((choice: any) => {
      const button = list.createEl("button", { cls: "pp-choice-button" });
      el(button, "strong", choice.label);
      el(button, "span", choice.description, "pp-muted");
      button.onclick = async () => {
        button.disabled = true;
        try {
          await this.choose(choice.id);
          this.close();
        } catch (error: any) {
          new obsidian.Notice("操作失败：" + (error.message || error));
          button.disabled = false;
        }
      };
    });
  }
  override onClose() {
    this.contentEl.empty();
  }
}

export class MultiChoiceModal extends obsidian.Modal {
  choices: any;
  declare confirm: (...args: any[]) => any;
  description: any;
  selected: any;
  title: any;
  constructor(app: any, title: any, description: any, choices: any, confirm: any) {
    super(app);
    this.title = title;
    this.description = description;
    this.choices = choices;
    this.confirm = confirm;
    this.selected = new Set();
  }
  override onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    if (this.description) el(this.contentEl, "p", this.description, "pp-muted");
    const list = this.contentEl.createDiv({ cls: "pp-multi-choice-list" });
    this.choices.forEach((choice: any) => {
      const row = list.createDiv({ cls: "pp-multi-choice-row" });
      const checkbox = row.createEl("input");
      checkbox.setAttr("type", "checkbox");
      checkbox.setAttr("id", "pp-choice-" + this.choices.indexOf(choice));
      checkbox.onchange = () => (checkbox.checked ? this.selected.add(choice.id) : this.selected.delete(choice.id));
      const label = row.createEl("label");
      label.setAttr("for", checkbox.getAttr?.("id") || "");
      el(label, "strong", choice.label);
      el(label, "span", choice.description, "pp-muted");
    });
    new obsidian.Setting(this.contentEl)
      .addButton((button: any) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button: any) =>
        button
          .setCta()
          .setButtonText("继续")
          .onClick(async () => {
            if (!this.selected.size) return new obsidian.Notice("至少选择一条草稿。");
            button.setDisabled(true);
            try {
              await this.confirm(Array.from(this.selected));
              this.close();
            } catch (error: any) {
              new obsidian.Notice("操作失败：" + (error.message || error));
              button.setDisabled(false);
            }
          }),
      );
  }
  override onClose() {
    this.contentEl.empty();
  }
}

export class ConfirmModal extends obsidian.Modal {
  declare confirm: (...args: any[]) => any;
  confirmLabel: any;
  description: any;
  title: any;
  constructor(app: any, title: any, description: any, confirmLabel: any, confirm: any) {
    super(app);
    this.title = title;
    this.description = description;
    this.confirmLabel = confirmLabel;
    this.confirm = confirm;
  }
  override onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pp-modal");
    applyMotionLevel(this.contentEl, currentMotionLevel());
    el(this.contentEl, "h2", this.title);
    if (this.description) el(this.contentEl, "p", this.description, "pp-muted");
    new obsidian.Setting(this.contentEl)
      .addButton((button: any) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button: any) =>
        button
          .setCta()
          .setButtonText(this.confirmLabel)
          .onClick(async () => {
            button.setDisabled(true);
            try {
              await this.confirm();
              this.close();
            } catch (error: any) {
              new obsidian.Notice("操作失败：" + (error.message || error));
              button.setDisabled(false);
            }
          }),
      );
  }
  override onClose() {
    this.contentEl.empty();
  }
}

/* ================================================================== *
 * 视图基类：统一渲染版本号、容器、页首与通用 DOM 片段
 * 每个视图的 refresh() 都以 beginRender() 开始，用 isStale() 判定本轮是否还需要落地，
 * 从而避免并发刷新（视图打开 + 元数据事件）产生重复页面。
 * ================================================================== */
