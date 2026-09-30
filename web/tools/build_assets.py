#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从「图片素材」生成 Web 仪表盘需要的缩略图与配色元数据。

产物：
  web/assets/hero.jpg          —— 顶部横幅（宽幅，保留原始比例）
  web/assets/card-*.jpg        —— 三张导航卡（16:9 居中裁切）
  web/assets/manifest.json     —— 每张图的尺寸、平均亮度、平均色、文字色建议

用法：
  python tools/build_assets.py           # 生成
  python tools/build_assets.py --check   # 只校验产物是否齐全

只读取原始素材，不做任何修改；所有输出都写在 web/assets/ 下。
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageStat

WEB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 仓库根就是插件目录：真实 vault 默认按老布局回推（仓库位于 <vault>/.obsidian/plugins/<id>），
# 克隆到别处时用 PPD_VAULT 环境变量指定。
VAULT_DIR = os.environ.get("PPD_VAULT") or os.path.dirname(os.path.dirname(os.path.dirname(WEB_DIR)))
ASSET_DIR = os.path.join(WEB_DIR, "assets")
SOURCE_DIR = os.path.join(VAULT_DIR, "图片素材")

# 把你自己的素材文件名填进来（仓库里放的是中性占位图，见 tools/make_placeholders.py）。
# key, 源文件（图片素材/ 下）, 输出文件, 目标宽度, 是否 16:9 居中裁切
SPECS = [
    ("hero", "hero-source.png", "hero.jpg", 1800, False),
    ("cardBuild", "card-build-source.jpg", "card-build.jpg", 960, True),
    ("cardLearn", "card-learn-source.png", "card-learn.jpg", 960, True),
    ("cardGrow", "card-grow-source.jpg", "card-grow.jpg", 960, True),
]


def center_crop_16_9(image: Image.Image) -> Image.Image:
    width, height = image.size
    target = 16 / 9
    if width / height > target:
        new_width = int(height * target)
        left = (width - new_width) // 2
        return image.crop((left, 0, left + new_width, height))
    new_height = int(width / target)
    top = (height - new_height) // 2
    return image.crop((0, top, width, top + new_height))


def describe(image: Image.Image) -> dict:
    """平均亮度 / 平均色 / 建议前景色（用于在图片上叠加文字）"""
    small = image.convert("RGB").resize((48, 48))
    stat = ImageStat.Stat(small)
    r, g, b = (int(value) for value in stat.mean)
    luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return {
        "averageColor": "#%02x%02x%02x" % (r, g, b),
        "luminance": round(luminance, 4),
        "tone": "light" if luminance > 0.62 else "dark",
        "suggestedInk": "#1b1420" if luminance > 0.62 else "#fdf7f4",
    }


def build() -> int:
    os.makedirs(ASSET_DIR, exist_ok=True)
    manifest: dict[str, dict] = {}
    for key, source_name, out_name, target_width, crop in SPECS:
        source_path = os.path.join(SOURCE_DIR, source_name)
        if not os.path.exists(source_path):
            print(f"[skip] 缺少素材：{source_name}")
            continue
        with Image.open(source_path) as raw:
            image = raw.convert("RGB")
            if crop:
                image = center_crop_16_9(image)
            if image.width > target_width:
                height = max(1, round(image.height * target_width / image.width))
                image = image.resize((target_width, height), Image.LANCZOS)
            out_path = os.path.join(ASSET_DIR, out_name)
            image.save(out_path, "JPEG", quality=84, optimize=True, progressive=True)
            info = describe(image)
            info.update({
                "file": "assets/" + out_name,
                "source": "图片素材/" + source_name,
                "width": image.width,
                "height": image.height,
                "bytes": os.path.getsize(out_path),
            })
            manifest[key] = info
            print(f"[ok] {out_name:18s} {image.width}x{image.height}  {info['bytes'] // 1024}KB  亮度 {info['luminance']}  {info['tone']}")

    manifest_path = os.path.join(ASSET_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    print(f"[ok] manifest.json（{len(manifest)} 张图）")
    return 0


def check() -> int:
    manifest_path = os.path.join(ASSET_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        print("[fail] 缺少 assets/manifest.json，请先运行 python tools/build_assets.py")
        return 1
    with open(manifest_path, encoding="utf-8") as handle:
        manifest = json.load(handle)
    missing = []
    for key, info in manifest.items():
        if not os.path.exists(os.path.join(WEB_DIR, info["file"])):
            missing.append(info["file"])
    if missing:
        print("[fail] 缺少产物：" + ", ".join(missing))
        return 1
    print(f"[ok] {len(manifest)} 张缩略图齐全")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else build())
