#!/usr/bin/env python3
"""
디자인 에셋이 없는 유형의 감정 행성을, 기존 에셋의 색조를 돌려 파생시킨다.

원본 3종(storm/foggy/drifting)은 디자이너 에셋이므로 건드리지 않고,
파생본만 생성한다. 디자이너가 정식 에셋을 주면 이 스크립트 없이 교체하면 된다.

    python3 scripts/derive-planets.py
"""
import colorsys
from pathlib import Path

from PIL import Image

ASSET_DIR = Path(__file__).resolve().parent.parent / "public" / "emotion_planet"

# (출력 파일, 원본, 목표 hue°, 채도 배율, 명도 배율)
DERIVATIONS = [
    # 과열 항성형 — 번개 행성을 주황/적색으로. 타오르는 느낌.
    ("burning-star.png", "storm-planet.png", 18, 1.25, 1.06),
    # 가면 은하형 — 번개 행성을 마젠타로. 겉은 화사, 속은 과부하.
    ("masked-galaxy.png", "storm-planet.png", 320, 1.15, 1.02),
    # 새벽 별형 — 구름 행성을 금빛으로. 유일하게 건강한 유형이라 부드러운 원본 사용.
    ("dawn-star.png", "foggy-nebula.png", 40, 1.10, 1.08),
]


def shift_hue(src: Path, dst: Path, target_hue: float, sat_mul: float, val_mul: float) -> None:
    image = Image.open(src).convert("RGBA")
    pixels = image.load()
    width, height = image.size

    # 원본의 대표 색조를 구해 목표 색조까지의 회전량을 정한다.
    hues = []
    for y in range(0, height, 3):
        for x in range(0, width, 3):
            r, g, b, a = pixels[x, y]
            if a > 120 and (r + g + b) > 90:
                h, s, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                if s > 0.15:
                    hues.append(h * 360)
    hues.sort()
    base_hue = hues[len(hues) // 2]
    rotation = (target_hue - base_hue) % 360

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            h = ((h * 360 + rotation) % 360) / 360
            s = min(1.0, s * sat_mul)
            v = min(1.0, v * val_mul)
            nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
            pixels[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)

    image.save(dst)
    print(f"{dst.name:22} ← {src.name:20} hue {base_hue:.0f}° → {target_hue}°")


if __name__ == "__main__":
    for out_name, src_name, hue, sat, val in DERIVATIONS:
        shift_hue(ASSET_DIR / src_name, ASSET_DIR / out_name, hue, sat, val)
