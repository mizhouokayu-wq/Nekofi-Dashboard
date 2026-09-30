"""生成仓库自带的占位素材（不含任何个人图片）。

发布到公开仓库时，assets/ 里只放中性的占位图：真实横幅/卡片图属于个人素材，
由你自己的 vault 通过 tools/build_assets.py 生成（脚本会重写 manifest.json）。

用法：python tools/make_placeholders.py
"""
from __future__ import annotations

import json
import os

from PIL import Image, ImageDraw, ImageStat

ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")

# key, 输出文件名, 宽, 高, 渐变起色, 渐变终色, 角标文字
PLACEHOLDERS = [
    ("hero", "hero.jpg", 1800, 563, (16, 13, 32), (44, 33, 74), "PLACEHOLDER · HERO"),
    ("cardBuild", "card-build.jpg", 960, 540, (60, 34, 28), (124, 72, 48), "PLACEHOLDER · BUILD"),
    ("cardLearn", "card-learn.jpg", 960, 540, (38, 44, 40), (96, 104, 84), "PLACEHOLDER · LEARN"),
    ("cardGrow", "card-grow.jpg", 960, 540, (12, 20, 30), (34, 52, 76), "PLACEHOLDER · GROW"),
]


def describe(image: Image.Image) -> dict:
    """与 tools/build_assets.py 完全同一套口径（平均色 / 亮度 / 建议前景色）。"""
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


def gradient(width: int, height: int, top: tuple, bottom: tuple) -> Image.Image:
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return image


def build() -> int:
    os.makedirs(ASSET_DIR, exist_ok=True)
    manifest: dict = {}
    for key, out_name, width, height, top, bottom, label in PLACEHOLDERS:
        image = gradient(width, height, top, bottom)
        draw = ImageDraw.Draw(image)
        draw.text((width // 2 - len(label) * 3, height // 2), label, fill=(235, 232, 240))
        out_path = os.path.join(ASSET_DIR, out_name)
        image.save(out_path, "JPEG", quality=84, optimize=True, progressive=True)
        info = describe(image)
        info.update(
            {
                "file": "assets/" + out_name,
                "placeholder": True,
                "width": image.width,
                "height": image.height,
                "bytes": os.path.getsize(out_path),
            }
        )
        manifest[key] = info
        print(f"[ok] {out_name:18s} {image.width}x{image.height}  亮度 {info['luminance']}  {info['tone']}")

    manifest_path = os.path.join(ASSET_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    print(f"[ok] manifest.json（{len(manifest)} 张占位图）")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
