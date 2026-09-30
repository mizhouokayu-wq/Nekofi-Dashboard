# 个人规划仪表盘 · Web

Obsidian 插件的**只读风格化 Web 版本**：把 vault 里的项目、任务、时间规划、知识沉淀
渲染成一个可以直接双击打开的静态页面。数据仍然来自 Markdown 与 YAML frontmatter，
这里不做任何写入。

界面与 Obsidian 插件共用同一套「夜航极光」主题：**墨紫抬升 `#0A0814` → `#2A2350` + 珊瑚 `#ff8fa3` +
  紫藤 `#a78bfa` + 极光青 `#5fe3c0`**，玻璃拟态面板、胶囊导航、渐变横幅遮罩。
顶部是**头图横幅**（`assets/hero.jpg`），下面是 `01 / 02 / 03` 三张**图像导航卡**；
遮罩与文字色按 `assets/manifest.json` 里每张图的**实测平均亮度**自动匹配。

## 打开方式

直接双击 `index.html`（推荐 Chrome / Edge / Firefox）。
素材与配色元数据已随仓库提交，`assets/manifest.json` 不存在时页面自动回退到纯 CSS 渐变。
页面不需要服务器、不需要联网、不依赖任何第三方库或 CDN。

- **演示数据**：`data.sample.js`，随仓库提交，用于展示完整形态
  （4 个项目、23 条任务、超载日、阻塞项、知识缺口）。
- **真实数据**：`data.js`，由你自己的 vault 生成（`node web/tools/export-data.mjs`）。
  它属于个人数据，**不进版本控制**（见仓库根的 `.gitignore`）；存在时页面默认显示真实数据，
  右上角也会出现「切换数据源」按钮。

> 页面里的「在 Obsidian 打开」使用 `obsidian://open?vault=…&file=…` 协议，
> 浏览器首次点击可能会询问是否允许打开外部应用；不稳定时用「复制路径」把路径贴回 Obsidian。

## 目录结构

```text
web/
├── index.html              页面骨架
├── styles.css              设计系统（--pp-* 令牌，与插件同源）
├── app.js                  渲染与交互（纯函数 + 视图 + 详情抽屉）
├── data.sample.js          演示数据（生成产物，勿手改）
├── data.js                 真实数据（本机生成、已 gitignore，缺省时页面用演示数据）
├── data.history.json       每次导出的统计快照（同上，本机产物）
├── assets/                 横幅与导航卡素材（仓库里是中性占位图）
│   ├── hero.jpg            顶部横幅
│   ├── card-build.jpg      导航卡：任务执行
│   ├── card-learn.jpg      导航卡：知识沉淀
│   ├── card-grow.jpg       导航卡：项目推演
│   └── manifest.json       每张图的尺寸、平均亮度、平均色、文字色建议
└── tools/
    ├── plugin-helpers.mjs  在 Node 中加载插件 main.js 的纯函数层
    ├── build_assets.py     从你的「图片素材」生成缩略图与配色元数据（Pillow，可选）
    ├── make_placeholders.py 生成仓库自带的中性占位素材
    ├── export-data.mjs     扫描 vault 生成 data.js
    └── build-sample.mjs    生成演示数据 data.sample.js
```

> 把 `app.js` + `styles.css` 生成进插件 `main.js` 的脚本在**仓库根**的 `tools/sync-app.mjs`。

## 重建

在**仓库根**执行：

```bash
# 1) 从你自己的 vault 生成真实数据（覆盖 web/data.js）
npm run web:data
node web/tools/export-data.mjs --vault "<你的库路径>"   # 仓库不在库的 .obsidian/plugins 下时用它指定

# 2) 重新生成演示数据（日期相对运行当天，用默认设置，因此结果可复现）
npm run web:sample

# 可选：用你自己的素材重建 assets/（需要 Pillow；先编辑 tools/build_assets.py 里的 SPECS）
python web/tools/build_assets.py

# 可选：重新生成中性占位图
python web/tools/make_placeholders.py
```

只检查不写入：

```bash
node web/tools/export-data.mjs --stdout
python web/tools/build_assets.py --check   # 可选
```

## 与插件共用同一份渲染层

`app.js` 与 `styles.css` 不只是这个页面在用：插件里那个「打开仪表盘（Web 版）」
视图渲染的就是同一份代码，只是把浏览器全局换成了宿主适配层（`activeHost()` /
`api.mount({ data, host })`），数据改为从 Vault 实时读取。

Obsidian 只加载插件的 `main.js` / `styles.css` / `manifest.json`，所以这一层会被
生成进 `main.js` 末尾的「生成区块」（脚本在仓库根的 `tools/`）：

```bash
node tools/sync-app.mjs          # 改完 app.js / styles.css 后重新生成
node tools/sync-app.mjs --check  # 只校验漂移，不写盘（插件回归套件 08 也做同样检查）
```

数据推导收敛在插件的 `buildWebPayload()`：`tools/export-data.mjs` 只负责扫描 vault、
读正文、维护历史快照并写 `data.js`，不再自己算一套统计。

## 数据口径

`tools/plugin-helpers.mjs` 会在 Node 里用一个最小的 `obsidian` 桩加载插件的
`main.js`，并复用它的纯函数（`taskStatus` / `projectStatus` / `buildTimePlan` /
`buildTaskHierarchy` / `buildResourceMap` / `parseFM` …）。

也就是说：**网页与插件对同一条笔记的判定完全一致**，不存在「两边各算一套」的问题。

- 只扫描插件设置里的活动目录（草稿箱 / 长期领域 / 项目库 / 知识库 / 图书库 / 人物库 / 日程待办）。
- 路径中包含「AI禁止阅读」的文件与目录永不读取。
- 归档库不参与扫描（与插件一致）。
- `type: task-index` 之类的索引导航页不会被当成任务。
- 状态由 DDL 推导：无 DDL → 规划中；有未来 DDL → 待办；DDL 过期 → 过期；
  `doing` / `blocked` / `paused` 保留显式状态；`completed` / `archived` 保留终态。

## 页面内容

| 视图 | 内容 |
| --- | --- |
| 概览 | 头图横幅（横幅素材 + 长期定位 + 日期与统计）、今日焦点、4 张 KPI、01 / 02 / 03 图像导航卡、项目推演、今日任务监控（今日到期任务与容量 + 未来 7 天负载）、时间监控、知识缺口 |
| 任务 | 任务集 → 任务组 → 任务层级；搜索、任务集、任务组、状态、优先级筛选与排序 |
| 项目 | 完成度百分比 + 1px 细线进度、关键节点、阻塞项、DDL 倒计时、完成/总任务数 |
| 知识 | 知识笔记、图书、视频课程、人物库、长期领域（含关联项目数） |
| 草稿箱 | 待分诊草稿与摘要 |
| 详情抽屉 | 点击任意任务 / 项目，查看完整字段、任务拆解进度、知识引用与笔记路径 |

快捷键：`/` 聚焦搜索框，`Esc` 关闭抽屉。

## 样式说明

- 主题：夜航极光（v0.3.0）。墨紫 5 级抬升 `--pp-bg-0…4` = `#0A0814` / `#110E1F` / `#171331` /
  `#201A3D` / `#2A2350`；正文 4 级 `--pp-ink-1…4`；语义色：珊瑚 `#ff8fa3`、紫藤 `#a78bfa`、
  极光青 `#5fe3c0`、琥珀 `#ffc46b`、玫瑰 `#ff5f7a`。
- 令牌与插件 `styles.css` 完全同源（`--pp-*` 颜色 / 圆角 / 间距 / 玻璃与光晕），
  且这份调色板会被 `tools/sync-app.mjs` 同步进插件 `styles.css` 的两个标记区域 ——
  配色只维护一份，不存在「改了 web 忘了插件」。
- 玻璃拟态面板（`backdrop-filter`）、胶囊圆角（`--pp-r-pill`）、渐变主操作与进度线；
  最大内容宽 1140px，断点 640 / 1024，窄屏单列。
- `prefers-reduced-motion: reduce` 与插件的「界面动效」三档开关（`data-motion`）都会关掉动画与过渡，
  关闭后信息量不变。
- 头图与三张导航卡用 `background-image` 铺满，配 `linear-gradient` 遮罩保证文字可读；
  遮罩档位按实测亮度选（`[data-tone="light"]` / `dark`），素材缺失或 manifest 读不到时
  自动回退到纯 CSS 渐变，页面不会报错。仓库里放的是中性占位图，换成你自己的素材见上面的重建步骤。
