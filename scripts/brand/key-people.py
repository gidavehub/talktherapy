"""Strip the magenta backdrop off the OptiQ portraits: transparent WebP, 640px.

The portraits are rendered by OptiQ (C:/Projects/optiq/scratch/talk-redesign.mjs:
gemini-3-pro-image on flat magenta), then cut out here into public/people/.

Keys on each image's OWN backdrop colour (sampled from the top corners — the
model sometimes greys the magenta down), by how magenta a pixel is
(min(R, B) - G, which terracotta and skin never are) and how close it is to
the backdrop, then un-mixes the backdrop out of the edges.

  python scripts/brand/key-people.py <inDir> public/people [id ...]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
only = set(sys.argv[3:])
out.mkdir(parents=True, exist_ok=True)

for f in sorted(src.glob("*.png")) + sorted(src.glob("*.jpg")):
    if only and f.stem not in only:
        continue
    im = np.asarray(Image.open(f).convert("RGB")).astype(np.float32)
    h, w, _ = im.shape
    k = max(8, w // 40)
    corners = np.concatenate([im[:k, :k].reshape(-1, 3), im[:k, -k:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)

    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mag = np.minimum(r, b) - g
    mag_bg = max(20.0, float(np.minimum(bg[0], bg[2]) - bg[1]))
    # How backdrop-like by colour: 0 below a quarter of the backdrop's
    # magenta-ness, 1 above two-thirds of it.
    by_tone = np.clip((mag - 0.25 * mag_bg) / (0.66 * mag_bg - 0.25 * mag_bg), 0, 1)
    d = np.linalg.norm(im - bg, axis=2)
    by_distance = np.clip((90 - d) / (90 - 28), 0, 1)
    backdrop = np.minimum(by_tone, by_distance)
    # A pixel that is plainly backdrop by distance alone still counts.
    backdrop = np.maximum(backdrop, np.clip((40 - d) / 20, 0, 1))
    alpha = 1 - backdrop

    # Keep only the person: drop specks of "foreground" in the backdrop.
    a_img = Image.fromarray((alpha * 255).astype(np.uint8))
    a_img = a_img.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(0.8))
    alpha = np.asarray(a_img).astype(np.float32) / 255

    # Un-mix the backdrop from the edges, then take any magenta cast off.
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((im - (1 - a) * bg) / a, 0, 255)
    spill = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, None)
    rgb[..., 0] -= spill * 0.6
    rgb[..., 2] -= spill * 0.9
    rgb = np.clip(rgb, 0, 255)

    rgba = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")
    rgba = rgba.resize((640, 640), Image.LANCZOS)
    dest = out / f"{f.stem}.webp"
    rgba.save(dest, "WEBP", quality=80, method=6)
    print(f"{f.stem}: backdrop {bg.round().astype(int).tolist()} -> {dest.name} {dest.stat().st_size // 1024} KB")
