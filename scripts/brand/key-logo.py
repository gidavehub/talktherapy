"""Cut the TALK logo out of its off-white JPG: a transparent PNG, plus a light
version (brown letters cream, tagline light) for dark backgrounds.

  python scripts/brand/key-logo.py <logo.jpg> public/brand
"""
import sys
import numpy as np
from PIL import Image

src, out_dir = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
h, w, _ = im.shape

# The paper colour, from the four corners.
k = 24
corners = np.concatenate([
    im[:k, :k].reshape(-1, 3), im[:k, -k:].reshape(-1, 3),
    im[-k:, :k].reshape(-1, 3), im[-k:, -k:].reshape(-1, 3),
])
bg = np.median(corners, axis=0)
print("paper", bg.round())

d = np.linalg.norm(im - bg, axis=2)
lo, hi = 14.0, 70.0
alpha = np.clip((d - lo) / (hi - lo), 0, 1)

# Un-mix the paper out of the edges, so nothing pale fringes the letters.
a = np.maximum(alpha, 1e-3)[..., None]
rgb = np.clip((im - (1 - a) * bg) / a, 0, 255)

ys, xs = np.where(alpha > 0.05)
pad = 6
y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1)
x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad + 1)
print("content box", x0, y0, x1, y1)

def save(rgb_arr, name):
    rgba = np.dstack([rgb_arr, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]
    img = Image.fromarray(rgba, "RGBA")
    # 2x the header's height is plenty; keep the file small.
    img.save(f"{out_dir}/{name}", optimize=True)
    print("wrote", name, img.size)

save(rgb, "logo.png")

# Light: the dark brown letters to cream; the tagline (the rows under the
# letters) to a light sage.
brown = np.array([72, 54, 48], np.float32)
is_brown = np.linalg.norm(rgb - brown, axis=2) < 70
light = rgb.copy()
light[is_brown] = [243, 233, 218]
# Tagline rows: below the bottom of the big letters.
row_ink = (alpha > 0.5).sum(axis=1)
letters_bottom = None
in_letters = False
for y in range(h):
    if row_ink[y] > w * 0.25:
        in_letters = True
    elif in_letters and row_ink[y] < w * 0.05:
        letters_bottom = y
        break
print("tagline from row", letters_bottom)
if letters_bottom is not None:
    tag = np.zeros((h, w), bool)
    tag[letters_bottom:, :] = True
    greenish = (rgb[..., 1] > rgb[..., 0]) & tag
    light[greenish] = [201, 214, 190]
save(light, "logo-light.png")
