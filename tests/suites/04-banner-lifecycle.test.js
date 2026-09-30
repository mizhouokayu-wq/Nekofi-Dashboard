"use strict";
/** 04 横幅 / 设置 / 生命周期：素材解析、裁剪交互（指针 + 鼠标回退）、设置写回、缓存与刷新 */
const assert = require("node:assert/strict");
const { test, tests, setup, eqJson } = require("../util");
const { VIEW } = require("../drive");

/** 造一个已打开的裁剪窗口；默认是 16:9 的 Vault 素材 */
function makeCrop(h, options = {}) {
  const image = Object.assign({ naturalWidth: 1600, naturalHeight: 900, currentSrc: "blob:crop", src: "blob:crop" }, options.image || {});
  const source = Object.assign({ name: "横幅.jpg", src: "blob:crop", revoke: Boolean(options.revoke) }, options.source || {});
  const modal = new h.exposed.BannerCropModal(h.app, h.plugin, image, source, options.onDone || (() => {}));
  modal.open();
  return modal;
}

function primary(modal) { return modal.contentEl.children.flatMap((child) => child.children || []).find((child) => child.classList.contains("pp-button-primary")); }

/* ------------------------------------------------------------------ *
 * 二进制写入
 * ------------------------------------------------------------------ */

test("writeBannerBinary 支持 create / modify / adapter 三条写入路径", async () => {
  const h = await setup();
  const { writeBannerBinary } = h.helpers;
  h.seedFile("图片素材/占位.md", "");
  const target = "图片素材/裁剪结果.png";
  await writeBannerBinary(h.vault, target, new ArrayBuffer(4));
  assert.ok(h.vault.getAbstractFileByPath(target), "新文件应走 createBinary");
  assert.equal(h.vault.__binary.get(target).byteLength, 4);
  await writeBannerBinary(h.vault, target, new ArrayBuffer(12));
  assert.equal(h.vault.__binary.get(target).byteLength, 12, "已存在时应走 modifyBinary");

  let adapterPath = "";
  const adapterOnly = { getAbstractFileByPath: () => null, adapter: { writeBinary: async (path) => { adapterPath = path; }, exists: async (path) => path === adapterPath } };
  await writeBannerBinary(adapterOnly, "图片素材/兜底.png", new ArrayBuffer(2));
  assert.equal(adapterPath, "图片素材/兜底.png", "没有 binary API 时应回退 adapter");
});

test("writeBannerBinary 在无法验证写入结果时抛错", async () => {
  const h = await setup();
  const { writeBannerBinary } = h.helpers;
  const broken = { getAbstractFileByPath: () => null, adapter: { writeBinary: async () => {}, exists: async () => false } };
  await assert.rejects(() => writeBannerBinary(broken, "图片素材/x.png", new ArrayBuffer(1)), /无法验证/);
  await assert.rejects(() => writeBannerBinary({ getAbstractFileByPath: () => null }, "图片素材/x.png", new ArrayBuffer(1)), /没有可用的二进制写入 API/);
});

/* ------------------------------------------------------------------ *
 * 素材路径解析
 * ------------------------------------------------------------------ */

test("assetResourcePath 解析省略扩展名、反斜杠并支持 adapter 回退", async () => {
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  const expected = "app://vault/" + encodeURI("图片素材/横幅.jpg");
  assert.equal(h.plugin.assetResourcePath("图片素材/横幅.jpg"), expected);
  assert.equal(h.plugin.assetResourcePath("图片素材/横幅"), expected, "省略扩展名应解析到真实文件");
  assert.equal(h.plugin.assetResourcePath("图片素材\\横幅"), expected, "反斜杠路径也应解析");
  assert.equal(h.plugin.assetResourcePath("图片素材/不存在.png"), "", "无匹配时返回空字符串");

  const bound = h.plugin.assetResourcePath.bind({
    app: { vault: { getAbstractFileByPath: () => null, adapter: { getResourcePath: (path) => "adapter://" + path } } },
    vaultAssetPaths: () => ["图片素材/横幅.jpg"]
  });
  assert.equal(bound("图片素材/横幅.jpg"), "adapter://图片素材/横幅.jpg", "无 vault.getResourcePath 时应回退 adapter");
});

test("vaultAssetPaths 有 2 秒缓存，失效后重新扫描", async () => {
  const h = await setup();
  const before = h.plugin.vaultAssetPaths().length;
  assert.equal(before, h.vault.getFiles().length);
  h.seedFile("图片素材/新增.png", "");
  assert.equal(h.plugin.vaultAssetPaths().length, before, "2 秒内应命中缓存");
  h.plugin.invalidateAssetCache();
  assert.ok(h.plugin.vaultAssetPaths().includes("图片素材/新增.png"), "缓存失效后应重新扫描");
});

/* ------------------------------------------------------------------ *
 * 素材选择器
 * ------------------------------------------------------------------ */

test("横幅选择器列出图片素材中的图片并排除禁阅目录", async () => {
  const h = await setup();
  h.seedFile("图片素材/可用的.png", "");
  h.seedFile("图片素材/（AI禁止阅读）/隐藏.png", "");
  h.seedFile("图片素材/说明.md", "");
  const modal = new h.exposed.BannerPickerModal(h.app, h.plugin, () => {});
  modal.open();
  const cards = h.findByClass(modal.contentEl, "pp-asset-card");
  eqJson(cards.map((card) => card.children.find((child) => child.classList.contains("pp-asset-card-name")).textContent), ["示例.png", "可用的.png"]);
  assert.ok(h.textOf(modal.contentEl).includes("扫描目录：图片素材"));
});

test("素材目录为空时选择器仍提供原生文件输入", async () => {
  const h = await setup({ seed: false });
  h.seedFile("图片素材/占位.md", "");
  const modal = new h.exposed.BannerPickerModal(h.app, h.plugin, () => {});
  modal.open();
  assert.equal(h.findByClass(modal.contentEl, "pp-asset-card").length, 0, "没有可用图片时不应渲染卡片");
  const input = h.findByClass(modal.contentEl, "pp-native-asset-picker")[0].children.find((child) => child.tag === "input");
  assert.ok(input, "应提供 input[type=file]");
  assert.equal(input.getAttr("type"), "file");
  assert.ok(h.textOf(modal.contentEl).includes("从电脑选择图片"));
});

test("点击素材卡片会先解码图片再打开 16:5 裁剪窗口", async () => {
  const h = await setup({ seed: false });
  h.seedFile("图片素材/横幅.jpg", "");
  const picker = new h.exposed.BannerPickerModal(h.app, h.plugin, () => { h.pickerDone = true; });
  picker.open();
  h.findByClass(picker.contentEl, "pp-asset-card")[0].click();
  await h.settle();
  const crop = h.modals.filter((modal) => !modal.closed).pop();
  assert.ok(crop && crop instanceof h.exposed.BannerCropModal, "应打开裁剪窗口");
  assert.equal(h.findByClass(crop.contentEl, "pp-crop-selection").length, 1, "裁剪界面必须立即可见");
});

test("裁剪窗口：图片尺寸还拿不到时也必须给出取景框", async () => {
  /* 真实场景：图片还没解码完（慢加载 / SVG 没有内在尺寸 / 图坏了），naturalWidth 就是 0。
     旧实现此时 layoutStage() 直接 return，crop 一直是 null → 取景框拿不到宽高 → 界面上"没有裁剪框"。
     用户报的就是这个：打开裁剪窗口只看到图，没有可拖的框。 */
  const h = await setup();
  const modal = makeCrop(h, { image: { naturalWidth: 0, naturalHeight: 0 } });
  assert.ok(modal.crop, "尺寸未知时也必须给出取景框，实际 crop=" + JSON.stringify(modal.crop));
  assert.ok(parseFloat(modal.selection.style.width) > 0, "取景框必须有宽度，实际：" + modal.selection.style.width);
  assert.ok(parseFloat(modal.selection.style.height) > 0, "取景框必须有高度，实际：" + modal.selection.style.height);
  assert.ok(Math.abs(modal.crop.w / modal.crop.h - 16 / 5) < 0.002, "退化取景框也要保持 16:5");
});

test("裁剪窗口：图片解码完成后按真实比例重排（预览图 onload 会重新布局）", async () => {
  const h = await setup();
  const modal = makeCrop(h, { image: { naturalWidth: 0, naturalHeight: 0 } });
  /* 模拟预览图此时才加载完：尺寸出现并触发 load */
  modal.image.naturalWidth = 1600;
  modal.image.naturalHeight = 500;
  if (typeof modal.preview.onload === "function") modal.preview.onload();
  else modal.layoutStage();
  assert.ok(modal.display && modal.display.w > 0, "应按真实比例重排，实际 display=" + JSON.stringify(modal.display));
  const ratio = modal.display.w / modal.display.h;
  assert.ok(Math.abs(ratio - 1600 / 500) < 0.05, "舞台比例应贴合原图，实际 " + ratio.toFixed(3));
  assert.ok(Math.abs(modal.crop.w / modal.crop.h - 16 / 5) < 0.002, "重排后取景框仍保持 16:5");
  assert.ok(modal.crop.x + modal.crop.w <= modal.display.w + 0.001, "取景框不得超出舞台");
});

test("裁剪窗口：selection 被污染成非元素时，仍必须建出取景框（用户报的 Cannot set properties of undefined）", async () => {
  /* 用户实际报错：「裁剪界面初始化异常：Cannot set properties of undefined (setting 'left')」+ 只有图片没有框。
     前提是 this.selection 已经是个**真值但不是元素**的东西：旧实现 `if (this.selection) return this.selection;`
     直接提前返回 → 框和把手一个都没创建 → renderCrop() 再对它设 left 就抛错。 */
  const h = await setup();
  /* 必须在 open() 之前污染：模拟"打开窗口那一刻 this.selection 已经是真值但不是元素" */
  const image = { naturalWidth: 1600, naturalHeight: 500, currentSrc: "blob:crop", src: "blob:crop" };
  const modal = new h.exposed.BannerCropModal(
    h.app,
    h.plugin,
    image,
    { name: "横幅.jpg", src: "blob:crop" },
    () => {},
  );
  modal.selection = { polluted: true };
  modal.open();
  const selection = h.findByClass(modal.contentEl, "pp-crop-selection");
  assert.equal(selection.length, 1, "必须重新建出取景框，而不是复用那个假对象");
  assert.ok(modal.selection && modal.selection.style, "取景框必须是真的元素");
  assert.equal(h.findByClass(modal.contentEl, "pp-crop-handle").length, 4, "四角把手也要建出来");
  modal.layoutStage();
  assert.ok(parseFloat(modal.selection.style.width) > 0, "取景框必须有尺寸");
});

test("裁剪窗口：selection 是残留元素时复用，不重复创建", async () => {
  const h = await setup();
  const modal = makeCrop(h);
  const first = modal.selection;
  modal.createSelection();
  assert.equal(modal.selection, first, "真的是元素时应该复用");
  assert.equal(h.findByClass(modal.contentEl, "pp-crop-selection").length, 1, "不能出现两个取景框");
});

test("应用取景后立刻刷新已打开的仪表盘视图（用户报的『仪表盘还是裁剪前的内容』）", async () => {
  /* 裁剪只改插件设置、不改笔记，所以 vault / metadataCache 事件不会触发：
     不在 confirmCrop 里主动 refreshViews()，仪表盘视图就会一直停在上一次的横幅。 */
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  const leaf = await h.openView(VIEW.dashboard);
  const heroOf = () => h.findByClass(leaf.view.contentEl, "pp-dashboard-hero")[0];
  assert.ok(heroOf(), "仪表盘应渲染出横幅");
  assert.equal(heroOf().dataset.crop, undefined, "初始不应带取景标记");

  const image = { naturalWidth: 1600, naturalHeight: 500, currentSrc: "blob:crop", src: "blob:crop" };
  const modal = new h.exposed.BannerCropModal(
    h.app,
    h.plugin,
    image,
    { name: "横幅.jpg", path: "图片素材/横幅.jpg" },
    () => {},
  );
  modal.open();
  await modal.confirmCrop(primary(modal));
  await h.settle();

  const after = heroOf();
  assert.equal(after.dataset.crop, "true", "应用取景后横幅必须**立刻**带上取景标记");
  assert.ok(String(after.style.backgroundPosition || "").includes("%"), "横幅应带背景焦点");
});

test("重置取景后也会立刻刷新已打开的仪表盘视图", async () => {
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  h.plugin.settings.heroImage = "图片素材/横幅.jpg";
  h.plugin.settings.heroCrop = { x: 0.25, y: 0.5, w: 0.5, h: 0.3125 };
  const leaf = await h.openView(VIEW.dashboard);
  const heroOf = () => h.findByClass(leaf.view.contentEl, "pp-dashboard-hero")[0];
  assert.equal(heroOf().dataset.crop, "true", "初始应套用取景");

  const tab = new h.exposed.SettingsTab(h.app, h.plugin);
  tab.display();
  await h.clickText(tab.containerEl, "重置取景");
  await h.settle();
  assert.equal(heroOf().dataset.crop, undefined, "重置后已打开的仪表盘视图也必须立刻去掉取景");
});

test("（负向对照）关掉视图刷新后，仪表盘就会停在旧横幅 —— 证明上面那条用例真的在测刷新", async () => {
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  const leaf = await h.openView(VIEW.dashboard);
  const heroOf = () => h.findByClass(leaf.view.contentEl, "pp-dashboard-hero")[0];
  const original = h.plugin.refreshViews;
  h.plugin.refreshViews = () => {}; // 模拟修复前：应用取景后不刷新任何视图
  try {
    const image = { naturalWidth: 1600, naturalHeight: 500, currentSrc: "blob:crop", src: "blob:crop" };
    const modal = new h.exposed.BannerCropModal(
      h.app,
      h.plugin,
      image,
      { name: "横幅.jpg", path: "图片素材/横幅.jpg" },
      () => {},
    );
    modal.open();
    await modal.confirmCrop(primary(modal));
    await h.settle();
    assert.equal(
      heroOf().dataset.crop,
      undefined,
      "不刷新时仪表盘必须停在旧横幅 —— 这说明上一条用例测的正是 refreshViews",
    );
  } finally {
    h.plugin.refreshViews = original;
  }
});

test("applyHeroCrop 的取景数学：background-size 要放大、position 要按溢出比例算", async () => {
  /* 只设 background-position 时，cover 只会平移、不会放大到取景区域 ——
     窄窗口下就会显示"图片中间那一块"（用户报的现象）。这里用不对称取景框把公式钉住。 */
  const h = await setup();
  const { applyHeroCrop } = h.helpers;
  const node = { style: {}, dataset: {} };
  assert.equal(applyHeroCrop(node, { x: 0.2, y: 0.1, w: 0.5, h: 0.25 }), true);
  assert.equal(node.dataset.crop, "true");
  /* 取景框宽占 50% → 图要放大到 200% 宽，取景框才刚好铺满元素 */
  assert.equal(node.style.backgroundSize, "200.0000% auto", "必须放大到取景框宽度铺满，实际：" + node.style.backgroundSize);
  /* P = 取景框起点 / (1 - 取景框尺寸)：x 0.2/(1-0.5)=40%，y 0.1/(1-0.25)=13.33% */
  assert.equal(node.style.backgroundPosition, "40.00% 13.33%", "位置应按溢出比例算，实际：" + node.style.backgroundPosition);
  assert.equal(node.style.objectPosition, node.style.backgroundPosition, "img 路径用同一组数值");

  /* 满宽（w=1）时横向没有溢出 → 该轴固定 50% */
  const full = { style: {}, dataset: {} };
  applyHeroCrop(full, { x: 0, y: 0.295, w: 1, h: 0.176 });
  assert.equal(full.style.backgroundSize, "100.0000% auto");
  assert.equal(full.style.backgroundPosition, "50.00% 35.80%", "满宽取景只按纵向定位，实际：" + full.style.backgroundPosition);
});

test("取消取景时把 background-size 也清掉，避免留下放大的残留", async () => {
  const h = await setup();
  const { applyHeroCrop } = h.helpers;
  const node = { style: {}, dataset: {} };
  applyHeroCrop(node, { x: 0.2, y: 0.1, w: 0.5, h: 0.25 });
  assert.equal(applyHeroCrop(node, null), false);
  assert.equal(node.style.backgroundSize, "", "取消取景必须清掉 background-size");
  assert.equal(node.style.backgroundPosition, "");
  assert.equal(node.dataset.crop, undefined);
});

test("Web 载荷里的横幅素材必须带上取景（否则 Web 面板只能按默认居中显示）", async () => {
  /* Web 面板的 hero 就是设置里选的横幅（constants 里 explicitHero = settings.heroImage），
     载荷不带取景时它只能 cover + 居中 —— 用户看到的就是"图片最中间那一块"。 */
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  h.plugin.settings.heroImage = "图片素材/横幅.jpg";
  h.plugin.settings.heroCrop = { x: 0.2, y: 0.1, w: 0.5, h: 0.25 };
  const assets = await h.plugin.webAssets();
  assert.ok(assets && assets.hero, "应下发 hero 素材");
  assert.ok(assets.hero.crop, "hero 素材必须带上取景，实际：" + JSON.stringify(assets.hero.crop));
  assert.equal(assets.hero.crop.w, 0.5);
  assert.equal(assets.hero.crop.x, 0.2);
  assert.equal(assets.hero.crop.y, 0.1);

  /* 没有取景时是 null（Web 侧按空值判"不套取景"） */
  h.plugin.settings.heroCrop = null;
  const again = await h.plugin.webAssets();
  assert.equal(again.hero.crop, null, "无取景时应显式下发 null");
});

/* ------------------------------------------------------------------ *
 * 裁剪几何与交互
 * ------------------------------------------------------------------ */

test("裁剪窗口初始取景框完整落在舞台内并保持 16:5", async () => {
  const h = await setup();
  const modal = makeCrop(h);
  assert.equal(h.findByClass(modal.contentEl, "pp-crop-selection").length, 1);
  assert.equal(h.findByClass(modal.contentEl, "pp-crop-handle").length, 4, "四角各一个手柄");
  assert.ok(modal.crop.x + modal.crop.w <= modal.display.w + 0.001, "取景框不得超出舞台宽度");
  assert.ok(modal.crop.y + modal.crop.h <= modal.display.h + 0.001, "取景框不得超出舞台高度");
  assert.ok(Math.abs(modal.crop.w / modal.crop.h - 16 / 5) < 0.002, "裁剪框保持 16:5");
});

test("窗口变小后重新布局，舞台与取景框都在可视区内", async () => {
  const h = await setup();
  const modal = makeCrop(h);
  const before = modal.display.w;
  h.window.innerWidth = 620;
  h.window.innerHeight = 520;
  modal.layoutStage();
  assert.ok(modal.display.w < before, "舞台应随视口收窄");
  assert.ok(modal.display.w <= 620 - 96 + 0.001, "舞台宽度必须落在视口内");
  assert.ok(modal.crop.x + modal.crop.w <= modal.display.w + 0.001);
  assert.ok(modal.crop.y + modal.crop.h <= modal.display.h + 0.001);
  assert.ok(Math.abs(modal.crop.w / modal.crop.h - 16 / 5) < 0.002, "重新布局后仍保持 16:5");
  h.window.innerWidth = 1440;
  h.window.innerHeight = 900;
});

test("拖动取景框被舞台边界夹住", async () => {
  const h = await setup();
  const modal = makeCrop(h);
  const start = Object.assign({}, modal.crop);
  modal.onPointerDown({ preventDefault() {}, stopPropagation() {}, target: modal.selection, pointerId: 3, clientX: 100, clientY: 100 });
  modal.onPointerMove({ pointerId: 3, clientX: 100, clientY: 160 });
  assert.ok(modal.crop.y > start.y, "向下拖动应改变 y");
  assert.equal(modal.crop.x, start.x, "占满宽度时 x 应被夹住而不是溢出");
  modal.onPointerMove({ pointerId: 3, clientX: 100, clientY: 100000 });
  assert.ok(modal.crop.y + modal.crop.h <= modal.display.h + 0.001, "不应越出下边界");
  modal.onPointerUp({ pointerId: 3 });
  assert.ok(modal.crop.x >= 0 && modal.crop.y >= 0, "不应越出左/上边界");
});

test("超宽素材的取景框横向有移动空间", async () => {
  const h = await setup();
  const modal = makeCrop(h, { image: { naturalWidth: 4840, naturalHeight: 900 } });
  const start = Object.assign({}, modal.crop);
  assert.ok(start.w < modal.display.w + 0.001, "超宽素材不应占满舞台宽度");
  assert.ok(start.x > 0, "超宽素材的取景框横向有移动空间");
  modal.onPointerDown({ preventDefault() {}, stopPropagation() {}, target: modal.selection, pointerId: 4, clientX: 400, clientY: 200 });
  modal.onPointerMove({ pointerId: 4, clientX: 260, clientY: 200 });
  assert.ok(modal.crop.x < start.x, "向左拖动应让取景框左移");
  modal.onPointerUp({ pointerId: 4 });
});

test("拖动手柄缩放保持 16:5 且不越界", async () => {
  const h = await setup();
  const modal = makeCrop(h);
  const handle = h.findByClass(modal.contentEl, "pp-crop-handle-se")[0];
  const before = Object.assign({}, modal.crop);
  modal.onPointerDown({ preventDefault() {}, stopPropagation() {}, target: handle, pointerId: 5, clientX: 400, clientY: 300 });
  modal.onPointerMove({ pointerId: 5, clientX: 300, clientY: 240 });
  assert.ok(modal.crop.w < before.w, "向内拖动缩放点应缩小取景框");
  assert.ok(Math.abs(modal.crop.w / modal.crop.h - 16 / 5) < 0.002);
  assert.ok(modal.crop.x + modal.crop.w <= modal.display.w + 0.001);
  assert.ok(modal.crop.y + modal.crop.h <= modal.display.h + 0.001);
  modal.onPointerUp({ pointerId: 5 });
});

test("指针拖动会捕获并释放 pointer capture", async () => {
  const h = await setup();
  const modal = makeCrop(h);
  const beforeY = modal.crop.y;
  modal.onPointerDown({ preventDefault() {}, stopPropagation() {}, target: modal.selection, pointerId: 7, clientX: 100, clientY: 100 });
  assert.equal(modal.selection.captured, 7, "拖动开始应捕获指针");
  modal.onPointerMove({ pointerId: 7, clientX: 100, clientY: 140 });
  assert.ok(modal.crop.y > beforeY);
  modal.onPointerUp({ pointerId: 7 });
  assert.equal(modal.selection.released, 7, "拖动结束应释放指针");
});

test("鼠标回退路径（window mousemove）同样能拖动取景框", async () => {
  const h = await setup();
  const modal = makeCrop(h);
  const before = Object.assign({}, modal.crop);
  modal.onMouseDown({ preventDefault() {}, target: modal.selection, clientX: 200, clientY: 200 });
  assert.ok(modal.drag, "鼠标按下应进入拖动状态");
  h.window.dispatchEvent("mousemove", { clientX: 200, clientY: 250 });
  assert.ok(modal.crop.y > before.y, "window mousemove 应驱动拖动");
  h.window.dispatchEvent("mouseup", {});
  assert.equal(modal.drag, null, "鼠标抬起应结束拖动");
  assert.equal(h.window.listenerCount("mousemove"), 0, "结束时必须解绑 window 监听器");
});

/* ------------------------------------------------------------------ *
 * 确认与应用
 * ------------------------------------------------------------------ */

test("Vault 素材确认后写回 heroImage 与归一化取景并持久化", async () => {
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  let done = false;
  const modal = makeCrop(h, { source: { name: "图片素材/横幅.jpg", path: "图片素材/横幅.jpg" }, onDone: () => { done = true; } });
  await modal.confirmCrop(primary(modal));
  await h.settle();
  assert.equal(h.plugin.settings.heroImage, "图片素材/横幅.jpg", "Vault 素材应直接引用原图，不写新文件");
  const crop = h.plugin.settings.heroCrop;
  assert.ok(crop && crop.w > 0 && crop.w <= 1 && crop.h > 0 && crop.h <= 1, "取景框必须是归一化坐标");
  assert.ok(Math.abs((crop.w * 1600) / (crop.h * 900) - 16 / 5) < 0.02, "取景比例保持 16:5，实际：" + ((crop.w * 1600) / (crop.h * 900)));
  assert.equal(h.pluginData.heroCrop.w, crop.w, "取景必须持久化到 data.json");
  assert.equal(done, true, "确认后应回调 onDone");
  assert.ok(h.notices.some((notice) => notice.includes("横幅取景已应用")));
});

test("确认取景后仪表盘横幅用背景焦点呈现", async () => {
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  const modal = makeCrop(h, { source: { name: "图片素材/横幅.jpg", path: "图片素材/横幅.jpg" } });
  await modal.confirmCrop(primary(modal));
  await h.settle();
  const leaf = await h.openView(VIEW.dashboard);
  await h.settle();
  const hero = h.findByClass(leaf.containerEl.children[1], "pp-dashboard-hero")[0];
  assert.equal(hero.dataset.crop, "true", "套用取景时应打上 data-crop 标记");
  const focus = String(hero.style.backgroundPosition).match(/([\d.]+)%\s+([\d.]+)%/);
  assert.ok(focus, "背景焦点格式应为 x% y%：" + hero.style.backgroundPosition);
  assert.ok(Number(focus[1]) > 0 && Number(focus[1]) <= 100 && Number(focus[2]) > 0 && Number(focus[2]) <= 100);
  assert.ok(String(hero.style.backgroundImage).includes(encodeURI("图片素材/横幅.jpg")));
});

test("本地文件确认后按原始字节导入素材目录，重名自动加序号", async () => {
  const h = await setup();
  const modal = makeCrop(h, { source: { name: "横幅.jpg", blob: h.makeBlob() } });
  await modal.confirmCrop(primary(modal));
  await h.settle();
  assert.equal(h.plugin.settings.heroImage, "图片素材/横幅.jpg");
  assert.ok(h.vault.getAbstractFileByPath("图片素材/横幅.jpg"), "本地文件应写入素材目录");
  assert.equal(h.vault.__binary.get("图片素材/横幅.jpg").byteLength, 16, "应写入原始字节");

  const again = makeCrop(h, { source: { name: "横幅.jpg", blob: h.makeBlob() } });
  await again.confirmCrop(primary(again));
  await h.settle();
  assert.ok(h.vault.getAbstractFileByPath("图片素材/横幅 2.jpg"), "重名应自动加序号");
  assert.equal(h.plugin.settings.heroImage, "图片素材/横幅 2.jpg", "不应覆盖已有素材");
});

test("图片自然尺寸为 0 时不会写入任何设置", async () => {
  const h = await setup();
  const modal = makeCrop(h, { image: { naturalWidth: 0, naturalHeight: 0 } });
  await modal.confirmCrop(primary(modal));
  await h.settle();
  assert.equal(h.plugin.settings.heroCrop, null);
  assert.equal(h.plugin.settings.heroImage, h.helpers.DEFAULTS.heroImage, "不应改动原设置");
  assert.ok(h.notices.some((notice) => notice.includes("无法计算取景范围")));
});

test("二进制写入失败时不写入取景", async () => {
  const h = await setup();
  const original = h.vault.createBinary.bind(h.vault);
  h.vault.createBinary = async () => { throw new Error("磁盘写入失败"); };
  const modal = makeCrop(h, { source: { name: "横幅.jpg", blob: h.makeBlob() } });
  await modal.confirmCrop(primary(modal));
  await h.settle();
  assert.equal(h.plugin.settings.heroCrop, null, "写入失败时不应写入取景");
  assert.ok(h.notices.some((notice) => notice.includes("应用失败")), "应提示失败原因");
  h.vault.createBinary = original;
});

test("缺少可写入的图片数据时给出提示且不写设置", async () => {
  const h = await setup();
  const modal = makeCrop(h, { source: { blob: null } });
  await modal.confirmCrop(primary(modal));
  await h.settle();
  assert.equal(h.plugin.settings.heroCrop, null);
  assert.ok(h.notices.some((notice) => notice.includes("没有可写入的图片数据")));
});

test("本地文件来源关闭窗口时释放 Object URL，Vault 素材不释放", async () => {
  const h = await setup();
  makeCrop(h, { revoke: true, source: { src: "blob:harness-1" } }).close();
  assert.ok(h.revokedObjectUrls.some((url) => url.includes("blob:harness-1")), "实际：" + h.revokedObjectUrls.join(","));
  makeCrop(h, { revoke: false, source: { src: "blob:keep-1" } }).close();
  assert.equal(h.revokedObjectUrls.some((url) => url.includes("blob:keep-1")), false, "Vault 素材不应释放 URL");
});

/* ------------------------------------------------------------------ *
 * 设置页与刷新
 * ------------------------------------------------------------------ */

test("设置页列出素材目录并可以重置取景", async () => {
  const h = await setup();
  h.seedFile("图片素材/横幅.jpg", "");
  h.plugin.settings.heroImage = "图片素材/横幅.jpg";
  h.plugin.settings.heroCrop = { x: 0.25, y: 0.5, w: 0.5, h: 0.3125 };
  const tab = new h.exposed.SettingsTab(h.app, h.plugin);
  tab.display();
  assert.equal(h.findByClass(tab.containerEl, "pp-hero-setting").length, 1);
  const text = h.textOf(tab.containerEl);
  ["00 草稿箱", "10 长期领域", "20 项目库", "30 知识库", "图书库", "图片素材", "40 人物库", "50 日程待办", "90 归档库"].forEach((label) => {
    assert.ok(text.includes(label), "设置页缺少 " + label);
  });
  const preview = h.findByClass(tab.containerEl, "pp-hero-setting-image")[0];
  assert.equal(preview.dataset.crop, "true", "预览应套用取景");
  assert.ok(String(preview.style.backgroundPosition || preview.style.objectPosition).includes("%"));

  await h.clickText(tab.containerEl, "重置取景");
  await h.settle();
  assert.equal(h.plugin.settings.heroCrop, null);
  assert.equal(h.pluginData.heroCrop, null, "重置应持久化");
  const refreshed = h.findByClass(tab.containerEl, "pp-hero-setting-image")[0];
  assert.equal(refreshed.dataset.crop, undefined, "重置后不再套用取景");
});

test("设置页配置体检：缺目录 / 目录重名 / 互相嵌套都报得出来", async () => {
  const h = await setup({ seed: false });
  /* 全新库：所有目录都不存在 → 缺目录问题（修复方式是"创建"） */
  let issues = h.plugin.settingsIssues();
  assert.ok(issues.some((issue) => issue.id === "missing" && issue.fix === "create"), "应报出缺目录，实际：" + JSON.stringify(issues));

  /* 互相嵌套：把任务库塞进草稿箱里面 —— 两边会同时认领同一批笔记 */
  h.plugin.settings.taskFolder = h.plugin.settings.inboxFolder + "/任务";
  await h.plugin.saveSettings({ quiet: true });
  issues = h.plugin.settingsIssues();
  const nested = issues.find((issue) => issue.id === "nested");
  assert.ok(nested, "应报出目录嵌套，实际：" + JSON.stringify(issues));
  assert.equal(nested.keys[0], "taskFolder", "该还原的是被改过的那个（任务库）");
  assert.equal(nested.fix, "reset");

  /* 建目录之后缺失问题消失（这就是体检面板「创建这些目录」按钮做的事） */
  for (const folder of h.plugin.missingConfiguredFolders().missing) await h.plugin.ensureFolder(folder);
  issues = h.plugin.settingsIssues();
  assert.ok(!issues.some((issue) => issue.id === "missing"), "目录都建好了就不该再报缺失，实际：" + JSON.stringify(issues));
});
test("多次刷新不会重复渲染横幅", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.dashboard);
  await h.settle();
  await leaf.view.refresh();
  await h.settle();
  assert.equal(h.findByClass(leaf.containerEl.children[1], "pp-dashboard-hero").length, 1, "刷新不应重复渲染");
  assert.equal(h.consoleErrors.length, 0, h.consoleErrors.join(" | "));
});

test("元数据事件驱动的合并刷新仍然可用", async () => {
  const h = await setup();
  const leaf = await h.openView(VIEW.dashboard);
  await h.settle();
  h.resetWriteLog();
  await h.vault.modify(h.vault.getAbstractFileByPath("50 日程待办/整理收件箱.md"), "---\ntype: task\ntitle: 整理收件箱\nstatus: doing\n---\n");
  await h.settle();
  assert.equal(h.findByClass(leaf.containerEl.children[1], "pp-dashboard-hero").length, 1);
  assert.equal(h.stormDetected, false, "不该出现刷新风暴");
});

test("素材图片解码失败时给出提示，且不写错误日志", async () => {
  const h = await setup();
  h.imageMode = "error";
  const picker = new h.exposed.BannerPickerModal(h.app, h.plugin, () => {});
  // 解码用的是 harness 排队中的定时器：必须先用 settle 推进定时器，再 await 这个 promise
  const pending = picker.openCrop({ name: "坏图.jpg", path: "图片素材/坏图.jpg", src: "blob:bad" });
  await h.settle();
  await pending;
  assert.ok(h.notices.some((message) => String(message).includes("图片加载失败")), "应提示图片加载失败：" + JSON.stringify(h.notices));
  assert.equal(h.consoleErrors.length, 0, "解码失败是可预期的，不应写 console.error");
});

module.exports = { title: "04 横幅 / 设置 / 生命周期", tests };
