"""Render planes of the 3D T1 in LPS mm with a labelled grid, for picking landmarks.
   python -I pick.py <nifti> <out.png> sag|cor|ax <fixed mm> [lo1 hi1 lo2 hi2]"""
import sys, numpy as np, nibabel as nib, cv2
from scipy.ndimage import map_coordinates
f, out, plane, fixed = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
img = nib.load(f); vol = np.asanyarray(img.dataobj).astype(np.float32); inv = np.linalg.inv(img.affine)
rng_ = [float(x) for x in sys.argv[5:9]] if len(sys.argv) > 5 else [-120, 120, -120, 120]
S = 3  # px per mm
a = np.arange(rng_[0], rng_[1], 1 / S); b = np.arange(rng_[2], rng_[3], 1 / S)
A, B = np.meshgrid(a, b)            # A = screen x, B = screen y
if plane == 'sag': P = np.stack([np.full_like(A, fixed), A, -B], -1)        # x fixed, screen x=+y(P), down=-z
elif plane == 'cor': P = np.stack([A, np.full_like(A, fixed), -B], -1)      # screen x=+x(L), down=-z
else: P = np.stack([A, B, np.full_like(A, fixed)], -1)                       # screen x=+x(L), down=+y(P)
ras = P * [-1, -1, 1]
ijk = ras @ inv[:3, :3].T + inv[:3, 3]
v = map_coordinates(vol, [ijk[..., 0], ijk[..., 1], ijk[..., 2]], order=1)
hi = np.percentile(v, 99.5); im = cv2.cvtColor(np.clip(v / hi * 255, 0, 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
for t in range(int(np.ceil(rng_[0] / 10)) * 10, int(rng_[1]), 10):
    x = int((t - rng_[0]) * S); cv2.line(im, (x, 0), (x, im.shape[0]), (0, 90, 0) if t % 50 else (0, 200, 0), 1)
    if t % 20 == 0: cv2.putText(im, str(t), (x + 2, 12), 0, 0.4, (0, 255, 255), 1)
for t in range(int(np.ceil(rng_[2] / 10)) * 10, int(rng_[3]), 10):
    y = int((t - rng_[2]) * S); cv2.line(im, (0, y), (im.shape[1], y), (0, 90, 0) if t % 50 else (0, 200, 0), 1)
    if t % 20 == 0: cv2.putText(im, str(-t if plane != 'ax' else t), (2, y - 2), 0, 0.4, (0, 255, 255), 1)
cv2.imwrite(out, im)
