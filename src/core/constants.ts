/** constants 层：由 src/main.ts 机械拆出（逻辑未改，只加了 import/export）。 */
import { collectImageAssetFiles } from "./assets";
import { normalizeMonthDay, normalizeWeekdays } from "./dates";
import { text } from "./frontmatter";
import { inFolder } from "./paths";

export const DASHBOARD_VIEW = "personal-planning-dashboard";

export const PROJECT_VIEW = "personal-planning-project";

export const INBOX_VIEW = "personal-planning-inbox";

export const TASKS_VIEW = "personal-planning-tasks";

export const RESOURCES_VIEW = "personal-planning-resources";
/** Web 渲染层视图：把 web/ 的只读仪表盘挂进 Obsidian（Shadow DOM 与宿主隔离） */

export const APP_VIEW = "personal-planning-dashboard-app";

export const HERO_CROP_RATIO = 16 / 5;

export const PLUGIN_BUILD = "0.1.0-preview (51)";
/** 图片平均亮度 → 叠字用深色还是浅色。阈值与离线产物 web/tools/build_assets.py 保持一致（0.62），
 *  这样插件实时渲染与浏览器版 data.js 的口径一致：亮图应当用深墨字 + 轻遮罩。 */

export const TONE_INK: Record<string, any> = { light: "#1b1420", dark: "#fdf7f4" };
/** 横幅与导航卡素材：设置里选过就用选的，没选就从素材目录按文件名排序兜底。
 *  以前这里（以及 DEFAULTS.heroImage）硬编码了本库的 UUID / 粘贴图片文件名 ——
 *  换一个 vault（或删掉那几张图）这些路径会静默失效，横幅与导航卡全部退成纯色，
 *  而用户完全看不出是"路径写死了"还是"图片没了"。 */

export function resolveAssetImages(vault: any, settings: any) {
  const config = settings || {};
  const explicitWaypoints = config.waypointImages || {};
  const explicitHero = String(config.heroImage || "");
  const available = collectImageAssetFiles(vault, config.assetFolder || "")
    .map((file: any) => file.path)
    .sort();
  /* 先定横幅，再把它从导航卡候选里排除：否则空设置时同一张图会同时当横幅和第一张卡 */
  const hero = explicitHero || available[0] || "";
  const unused = available.filter((path: any) => path !== hero);
  return {
    hero,
    build: explicitWaypoints.build || unused[0] || "",
    learn: explicitWaypoints.learn || unused[1] || "",
    grow: explicitWaypoints.grow || unused[2] || "",
  };
}

/** 用户设置：所有键都在这里声明，键名写错、类型给错都会在编译期被抓住。
 *  迁移期 settings 是 any，拼错的键只能等运行时表现为"设置不起作用"。 */

export interface HeroCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WaypointImages {
  build: string;
  learn: string;
  grow: string;
}

/** 界面动效强度：full 完整 / subtle 克制 / off 关闭。
 *  这是「用户偏好」，系统级 `prefers-reduced-motion` 始终优先于它（两者都会关掉动效）。
 *  类型放在这里而不是 motion.ts，是因为 `Settings` 要用它；
 *  而 `src/core/motion.ts` 只单向 import 本文件，避免两个模块互相 export 同一名字
 *  —— 测试用模块包是 `export * from` 汇总，重名导出会被静默丢掉。 */
export type MotionLevel = "full" | "subtle" | "off";

export interface Settings {
  projectFolder: string;
  taskFolder: string;
  inboxFolder: string;
  archiveFolder: string;
  knowledgeFolder: string;
  bookFolder: string;
  areaFolder: string;
  peopleFolder: string;
  assetFolder: string;
  defaultTaskDuration: number;
  planningHorizonDays: number;
  dailyCapacityMinutes: number;
  remindersEnabled: boolean;
  reminderHour: number;
  lastReminderDate: string;
  heroImage: string;
  /** 归一化取景框 {x,y,w,h}；null 表示显示整张图（cover 居中） */
  heroCrop: HeroCrop | null;
  waypointImages: WaypointImages;
  /** 界面动效强度，见 MotionLevel */
  motionIntensity: MotionLevel;
}

export const DEFAULTS: Settings = {
  projectFolder: "20 项目库",
  taskFolder: "50 日程待办",
  inboxFolder: "00 草稿箱",
  archiveFolder: "90 归档库",
  knowledgeFolder: "30 知识库",
  bookFolder: "30 知识库/图书库",
  areaFolder: "10 长期领域",
  peopleFolder: "40 人物库",
  defaultTaskDuration: 30,
  planningHorizonDays: 7,
  dailyCapacityMinutes: 120,
  remindersEnabled: true,
  reminderHour: 9,
  lastReminderDate: "",
  heroImage: "",
  heroCrop: null,
  waypointImages: { build: "", learn: "", grow: "" },
  assetFolder: "图片素材",
  motionIntensity: "full",
};

export const STATUS: Record<string, any> = {
  planning: "规划中",
  active: "进行中",
  blocked: "阻塞",
  paused: "暂停",
  completed: "已完成",
  archived: "已归档",
  todo: "待办",
  doing: "执行中",
  expired: "过期",
  done: "完成",
};
/** 插件认识（并能推导）的状态值：在此之外的状态视为用户自定义，读路径不得覆盖 */

export const KNOWN_STATUS_VALUES = Object.keys(STATUS);
/** frontmatter 显式声明为这些结构化类型时，即使位于日程待办/项目目录也不按任务采集（如 50 日程待办/日程待办.md） */

export const NON_TASK_TYPES = [
  "project",
  "knowledge",
  "book",
  "video",
  "area",
  "person",
  "index",
  "task-index",
  "moc",
  "dashboard",
  "note",
  "daily",
  "journal",
  "template",
];
/** 归档会覆盖这些字段：归档前快照进 archived_prev_*，撤销归档时才能原样还原（否则手写的 completed 会永久丢失） */

export const ARCHIVED_OVERWRITTEN_KEYS = ["status", "completed", "archived", "updated"];
/** 目录类设置：用户手抄 Windows 路径会写反斜杠，而 inFolder() 是严格字符串比较，
 *  不归一化就会让整个仪表盘静默变空（而且不报错）。 */

export type FolderSettingKey =
  | "projectFolder"
  | "taskFolder"
  | "inboxFolder"
  | "archiveFolder"
  | "knowledgeFolder"
  | "bookFolder"
  | "areaFolder"
  | "peopleFolder"
  | "assetFolder";

export const FOLDER_SETTING_KEYS: FolderSettingKey[] = [
  "projectFolder",
  "taskFolder",
  "inboxFolder",
  "archiveFolder",
  "knowledgeFolder",
  "bookFolder",
  "areaFolder",
  "peopleFolder",
  "assetFolder",
];
/** 这几个目录不能相同：相同时同一篇笔记会同时被算作草稿和任务 */

export const DISTINCT_FOLDER_KEYS: FolderSettingKey[] = ["inboxFolder", "taskFolder", "projectFolder", "archiveFolder"];

/** 重复模式：ISO 周几（1=周一 … 7=周日）与「每月几号」的候选值。
 *  原生表单与 Web 抽屉共用同一份，避免两处出现不同的周几顺序。 */
export const WEEKDAY_OPTIONS: [number, string][] = [
  [1, "周一"],
  [2, "周二"],
  [3, "周三"],
  [4, "周四"],
  [5, "周五"],
  [6, "周六"],
  [7, "周日"],
];

export const RECURRENCE_OPTIONS: [string, string][] = [
  ["none", "不重复"],
  ["daily", "每天"],
  ["weekly", "每周"],
  ["monthly", "每月"],
];

export const MONTHDAY_OPTIONS: [number, string][] = Array.from({ length: 31 }, (_, index) => [
  index + 1,
  String(index + 1) + " 号",
]);

/** 下拉控件要的映射形式（{ "1": "1 号", … }）。ES2018 的 lib 里没有 Object.fromEntries，手写累加。 */
export const MONTHDAY_SELECT: Record<string, string> = MONTHDAY_OPTIONS.reduce(
  (accumulator, [value, label]) => {
    accumulator[String(value)] = label;
    return accumulator;
  },
  {} as Record<string, string>,
);

/** 重复模式的字段显隐：声明式（不用函数）——这块数据会随 payload 发给 Web 渲染层，
 *  浏览器版 data.js 是 JSON，函数会在这里被丢掉，只有纯数据才两边一致。 */
function recurrenceShowWhen(values: string[]): any {
  return { key: "recurrence", in: values };
}

/** 字段是否应当显示：`showWhen: { key, in: [...] }`（缺省 = 总是显示）。
 *  Web 侧 app.js 有一份等价实现（它拿不到 TS），两处必须保持同一语义。 */
export function fieldVisible(spec: any, frontmatter: any): boolean {
  const rule = spec && spec.showWhen;
  if (!rule) return true;
  const current = String((frontmatter && frontmatter[rule.key]) || "none").toLowerCase();
  return (rule.in || []).map((value: any) => String(value).toLowerCase()).indexOf(current) >= 0;
}

/** 把界面送来的字符串值归一成 frontmatter 该有的类型。
 *  详情抽屉（原生与 Web）只传字符串，周几/几号这类结构化值必须在这里落地，
 *  否则会写进 `recurrence_weekdays: "1,3"` 这种半字符串，读回来还要再猜一次。
 *  判据用字段 key，而不是控件类型：「多选控件」是界面形状，数组 / 数字才是数据模型的事实。 */
export function coerceFieldValue(spec: any, rawText: unknown): unknown {
  const text = String(rawText === undefined || rawText === null ? "" : rawText).trim();
  const key = spec && spec.key;
  if (key === "recurrence_weekdays") return normalizeWeekdays(text);
  if (key === "recurrence_monthday") return normalizeMonthDay(text);
  if (spec && spec.type === "number") return Number(text) || 0;
  return text;
}

export const EDITABLE_FIELDS = {
  task: [
    { key: "milestone", label: "关键节点", type: "text" },
    /* 详情抽屉里 DDL 始终可见：重复任务的 DDL 是"本次执行日期"，序列结束日另看「重复结束（DDL）」。
       原生表单只在非重复时显示 DDL —— 那里填的 DDL 就是整段序列的结束日（见 plugin.ts 的 taskEditorFields）。 */
    { key: "due", label: "DDL", type: "date" },
    { key: "duration", label: "预计耗时（分钟）", type: "number" },
    {
      key: "priority",
      label: "优先级",
      type: "select",
      options: [
        ["high", "高"],
        ["medium", "中"],
        ["low", "低"],
      ],
    },
    { key: "assignee", label: "执行者", type: "text" },
    { key: "recurrence", label: "重复周期", type: "select", options: RECURRENCE_OPTIONS },
    /* 参考谷歌日历：每周要指定周几（可多选），每月要指定几号 */
    {
      key: "recurrence_weekdays",
      label: "重复周几",
      type: "multiselect",
      options: WEEKDAY_OPTIONS,
      showWhen: recurrenceShowWhen(["weekly"]),
    },
    {
      key: "recurrence_monthday",
      label: "每月几号",
      type: "select",
      options: MONTHDAY_OPTIONS,
      showWhen: recurrenceShowWhen(["monthly"]),
    },
    {
      key: "recurrence_until",
      label: "重复结束（DDL）",
      type: "date",
      desc: "重复到这一天为止；留空 = 永不结束",
      showWhen: recurrenceShowWhen(["daily", "weekly", "monthly"]),
    },
    { key: "task_set", label: "任务集", type: "text" },
    { key: "task_group", label: "任务组", type: "text" },
    { key: "project", label: "所属项目", type: "text" },
    /* 只在任务被标成阻塞时由渲染层显示；但写入白名单在这里，所以要在这里登记 */
    { key: "blocking_reason", label: "阻塞原因", type: "textarea" },
  ],
  project: [
    { key: "area", label: "长期领域", type: "text" },
    { key: "weight", label: "权重", type: "number" },
    { key: "deadline", label: "DDL", type: "date" },
    { key: "constraints", label: "资源约束", type: "text" },
    { key: "outcome", label: "最终结果（终点画像）", type: "textarea" },
    { key: "acceptance", label: "验收标准", type: "textarea" },
  ],
};

/** 判定一条笔记是不是「任务」：插件视图与 Web 渲染层必须用同一套口径，否则两处会给出不同的任务数。
 *  · 显式 type: task / knowledge-gap → 是任务；
 *  · 显式声明为其它已知结构化类型 → 不是任务；
 *  · 日程待办目录下的笔记 → 是任务（手写任务常常不写 type）；
 *  · 项目目录下：只有「没写 type」的才算项目子任务，显式写了别的类型（例如 type: habit）不当任务，
 *    否则会被计进项目进度并自动回写状态。 */
