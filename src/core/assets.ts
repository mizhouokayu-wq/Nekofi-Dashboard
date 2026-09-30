/** assets 层：由 src/main.ts 机械拆出（逻辑未改，只加了 import/export）。 */
import { forbiddenPath, inFolder } from "./paths";

export function toneFromLuminance(luminance: any) {
  const value = Number(luminance);
  return Number.isFinite(value) && value > 0.62 ? "light" : "dark";
}
/** 两档文字色：亮图用深墨，暗图用近白 */

export function resolveAssetPath(input: any, paths: any) {
  const normalized = String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized) return "";
  const candidates = (paths || []).map((path: any) =>
    String(path || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, ""),
  );
  const exact = candidates.find((path: any) => path === normalized);
  if (exact) return exact;
  const lower = normalized.toLowerCase();
  return (
    candidates.find(
      (path: any) => path.toLowerCase() === lower || path.replace(/\.[^/.]+$/, "").toLowerCase() === lower,
    ) || ""
  );
}

export function isImageAssetPath(path: any, folder: any) {
  const normalized = String(path || "").replace(/\\/g, "/");
  return !forbiddenPath(normalized) && inFolder(normalized, folder) && /\.(png|jpe?g|gif|webp)$/i.test(normalized);
}

export function listImageAssetPaths(paths: any, folder: any) {
  return (paths || [])
    .map((path: any) => String(path || "").replace(/\\/g, "/"))
    .filter((path: any) => isImageAssetPath(path, folder));
}
/** 递归收集素材目录中的图片；没有 children 时回退到全库文件列表 */

export function collectImageAssetFiles(vault: any, folder: any) {
  const result: any[] = [];
  const root = vault && vault.getAbstractFileByPath ? vault.getAbstractFileByPath(folder) : null;
  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
      return;
    }
    if (node.path && isImageAssetPath(node.path, folder)) result.push(node);
  };
  visit(root);
  if (!result.length && vault && vault.getFiles) {
    const files = vault.getFiles().filter(Boolean);
    const allowed = new Set(
      listImageAssetPaths(
        files.map((file: any) => file.path),
        folder,
      ),
    );
    files.forEach((file: any) => {
      if (allowed.has(file.path)) result.push(file);
    });
  }
  const seen = new Set();
  return result.filter((file: any) => !seen.has(file.path) && seen.add(file.path));
}

export function computeBannerDisplay(naturalWidth: any, naturalHeight: any, viewportWidth: any, viewportHeight: any) {
  const ratio = Math.max(0.01, Number(naturalWidth) || 1) / Math.max(0.01, Number(naturalHeight) || 1);
  const maxWidth = Math.max(120, Math.min(760, (Number(viewportWidth) || 480) - 32));
  const maxHeight = Math.min(460, Math.max(180, (Number(viewportHeight) || 700) - 260));
  let width = Math.min(maxWidth, maxHeight * ratio);
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
}
/** 裁剪舞台：在给定可用空间内按图片原始比例取最大矩形（保证舞台永远放得进弹窗） */

export function computeCropStage(naturalWidth: any, naturalHeight: any, maxWidth: any, maxHeight: any) {
  const ratio = Math.max(0.01, Number(naturalWidth) || 1) / Math.max(0.01, Number(naturalHeight) || 1);
  const width = Math.max(1, Math.min(Number(maxWidth) || 480, (Number(maxHeight) || 400) * ratio));
  return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(width / ratio)) };
}
/** 把归一化取景框（0-1）转成背景焦点：cover 缩放 + 焦点定位，不变形也能复现选择区域 */

export function applyHeroCrop(node: any, crop: any) {
  if (!node || !node.style) return false;
  const width = Number(crop && crop.w);
  const height = Number(crop && crop.h);
  if (!(width > 0 && width <= 1 && height > 0 && height <= 1)) {
    if (node.dataset) delete node.dataset.crop;
    node.style.backgroundPosition = "";
    node.style.backgroundSize = "";
    node.style.objectPosition = "";
    return false;
  }
  const clamp = (value: any) => Math.max(0, Math.min(1, Number(value) || 0));
  const w = clamp(width);
  const h = clamp(height);
  /* 只设 background-position 是不够的：cover 只会平移，**不能放大到取景区域** ——
     窄窗口下就会显示"图片中间那一块"，而不是用户选的区域。
     要真的复现取景框，得同时把图放大到"取景框宽度刚好铺满元素"：
       background-size 宽度 = 100 / w  （高度 auto 保持比例）
     位置用 CSS 百分比定位公式 —— 百分比是相对**溢出部分**算的，不是相对整张图：
       offset = (元素尺寸 - 图片尺寸) × P   →   P = 取景框起点 / (1 - 取景框尺寸)
     某一轴没有溢出时（w 或 h 为 1）该轴位置固定 50%。 */
  const posX = w >= 1 ? 50 : (clamp(Number(crop.x) || 0) / (1 - w)) * 100;
  const posY = h >= 1 ? 50 : (clamp(Number(crop.y) || 0) / (1 - h)) * 100;
  const position = posX.toFixed(2) + "% " + posY.toFixed(2) + "%";
  node.style.backgroundSize = (100 / w).toFixed(4) + "% auto";
  node.style.backgroundPosition = position;
  node.style.objectPosition = position;
  if (node.dataset) node.dataset.crop = "true";
  return true;
}

export async function writeBannerBinary(vault: any, path: any, buffer: any) {
  const existing = vault.getAbstractFileByPath(path);
  if (existing && typeof vault.modifyBinary === "function") {
    await vault.modifyBinary(existing, buffer);
  } else if (typeof vault.createBinary === "function" && !existing) {
    await vault.createBinary(path, buffer);
  } else if (vault.adapter && typeof vault.adapter.writeBinary === "function") {
    await vault.adapter.writeBinary(path, buffer);
  } else throw new Error("当前 Obsidian 没有可用的二进制写入 API");
  const saved = vault.getAbstractFileByPath(path);
  if (!saved && !(vault.adapter && typeof vault.adapter.exists === "function" && (await vault.adapter.exists(path))))
    throw new Error("裁剪文件写入后无法验证");
  return path;
}

export function loadBannerImage(src: any, imageFactory = () => document.createElement("img")) {
  return new Promise((resolve: any, reject: any) => {
    const image = imageFactory();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

/* ============================ 4. 通用 Modal ============================ *
 * 所有写操作都必须经过这些显式确认窗口，插件不会静默修改笔记。
 * ================================================================== */
/** 可预期的错误（用户输入校验 / 状态已失效）：只提示用户，不写 console.error */
