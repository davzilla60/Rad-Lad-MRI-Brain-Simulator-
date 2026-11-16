"""Build ../assets for the MRI BRAIN simulator.

    python -I tools/gen_assets.py "<.../ds005752/sub-ON02693/ses-01>"

Source: OpenNeuro ds005752, the NIMH Healthy Research Volunteer Dataset (CC0), sub-ON02693: a 30-year-old male
healthy volunteer, GE Discovery MR750 3T, 32-channel head coil, head first. BIDS NIfTI (dcm2niix). Defaced by the
dataset authors.
  * SAG T1, AX T2, COR T2, COR T1: REFORMATTED (trilinear, slab-averaged) from the 1 mm 3D MPRAGE T1 and 3D CUBE T2
    in the reference planes a radiographer would plan: axial parallel to the AC-PC line, coronal perpendicular to it,
    sagittal parallel to the falx.
  * AX FLAIR, AX T2*, AX DWI b1000, AX ADC: shown AS ACQUIRED (straight axial 2D stacks, about 8 deg steeper than
    AC-PC); DWI = geometric mean of 24 b=1000 directions, ADC = ln(S0/S)/b; both averaged in pairs to 4 mm.
  * LOCALISER: a straight 3-plane localiser is SYNTHESISED from the 3D T1 (8 mm slab, 256 matrix, 280 mm FOV,
    head-coil shading, noise).
Writes loc_*.png, <series>_NN.jpg and calib.json / calib.js. All coordinates are DICOM patient (LPS) millimetres.
"""
import sys, os, glob, json
import numpy as np, nibabel as nib, cv2
from scipy.ndimage import map_coordinates, gaussian_filter1d

SES = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets"); QA = os.path.join(HERE, "..", "qa")
os.makedirs(OUT, exist_ok=True); os.makedirs(QA, exist_ok=True)
rng = np.random.default_rng(7)
def unit(a): a = np.asarray(a, float); return a / np.linalg.norm(a)
FLIP = np.array([-1.0, -1.0, 1.0])                  # RAS <-> LPS

def nii(pattern):
    f = glob.glob(os.path.join(SES, pattern)); assert len(f) == 1, (pattern, f)
    img = nib.load(f[0]); return img, np.asanyarray(img.dataobj).astype(np.float32)

# ------------------------------------------------------------------ 3D volumes, sampled in LPS
class Vol:
    def __init__(self, pattern):
        img, self.v = nii(pattern); self.inv = np.linalg.inv(img.affine)
    def sample(self, P):                           # P [..., 3] in LPS mm
        ijk = (P * FLIP) @ self.inv[:3, :3].T + self.inv[:3, 3]
        return map_coordinates(self.v, [ijk[..., 0], ijk[..., 1], ijk[..., 2]], order=1, mode="constant", cval=0.0)
T1, T2 = Vol("anat/*MPRAGE_rec-SCIC_T1w.nii.gz"), Vol("anat/*CUBE_rec-SCIC_T2w.nii.gz")
HI = {"t1": float(np.percentile(T1.v[T1.v > 0], 99.7)), "t2": float(np.percentile(T2.v[T2.v > 0], 99.5))}

# ------------------------------------------------------------------ anatomy (picked on the 3D T1, ±2 mm; see qa/pick_*.png)
AC, PC = np.array([6.5, -41.0, 5.0]), np.array([6.5, -12.0, 1.0])
FALX_A, FALX_P = np.array([3.0, -95.0, 10.0]), np.array([6.0, 62.0, 10.0])
BC = np.array([5.0, -22.0, 14.0])                  # brain centre (reference for the readouts)
VA = unit(PC - AC)                                  # AP direction along AC-PC (+posterior)
UA = np.array([1.0, 0, 0]); NA = np.cross(UA, VA)   # axial: normal tilted with AC-PC
UC, VC, NC = UA, -NA, VA                            # coronal: perpendicular to AC-PC
US, VS, NS = np.array([0, 1.0, 0]), np.array([0, 0, -1.0]), np.array([-1.0, 0, 0])   # sagittal (the falx is ~1 deg off)
REF_AX = float(np.degrees(np.arctan2(-VA[2], VA[1])))      # AC-PC line on the sagittal panel (screen: +y right, -z down)
d = FALX_P - FALX_A; REF_SAG = float(np.degrees(np.arctan2(d[1], d[0])))   # falx on the axial panel (screen: +x right, +y down)
print("AC-PC %.1f deg on the sagittal, falx %.1f deg on the axial" % (REF_AX, REF_SAG))

def to8(a, hi): return np.clip(a / hi * 255, 0, 255).astype(np.uint8)
calib = {"ser": {}}

def reformat(sid, vol, key, plane, label, params, u, v, n, ctr, N, fov, thk, sp, count, spl):
    ps = fov / N
    I, J = np.meshgrid(np.arange(N) - (N - 1) / 2, np.arange(N) - (N - 1) / 2)
    first = ctr - n * sp * (count - 1) / 2; ipps = []
    for k in range(count):
        c = first + n * sp * k
        base = c + I[..., None] * ps * u + J[..., None] * ps * v
        offs = np.linspace(-thk / 2 + thk / 10, thk / 2 - thk / 10, 5)
        acc = np.mean([vol.sample(base + n * t) for t in offs], axis=0)
        cv2.imwrite(os.path.join(OUT, "%s_%02d.jpg" % (sid, k)), to8(acc, HI[key]), [cv2.IMWRITE_JPEG_QUALITY, 80])
        ipps.append(c - u * ps * (N - 1) / 2 - v * ps * (N - 1) / 2)
    calib["ser"][sid] = {"task": plane, "plane": plane, "seq": label, "params": params, "n": count,
                         "ipp": [[round(float(x), 2) for x in p] for p in ipps], "row": [round(float(x), 5) for x in u],
                         "col": [round(float(x), 5) for x in v], "ps": round(ps, 6), "cols": N, "rows": N,
                         "nrm": [round(float(x), 5) for x in n], "sp": sp, "thk": thk, "spl": spl, "pad": 2}
    print(sid, count, "slices")

reformat("sag_t1", T1, "t1", "sag", "T1", "3D MPRAGE T1 · reformatted 4 mm / 5 mm", US, VS, NS, BC.copy(), 384, 250, 4.0, 5.0, 34, 4.0)
reformat("ax_t2", T2, "t2", "ax", "T2", "3D CUBE T2 · reformatted 5 mm / 6 mm, AC-PC", UA, VA, NA, BC + NA * 2.0, 384, 240, 5.0, 6.0, 30, 5.5)
reformat("cor_t2", T2, "t2", "cor", "T2", "3D CUBE T2 · reformatted 5 mm / 6 mm", UC, VC, NC, BC + NC * (-5.0), 384, 240, 5.0, 6.0, 34, 5.5)
reformat("cor_t1", T1, "t1", "cor", "T1", "3D MPRAGE T1 · reformatted 5 mm / 6 mm", UC, VC, NC, BC + NC * (-5.0), 384, 240, 5.0, 6.0, 34, 4.0)

# ------------------------------------------------------------------ native axial 2D stacks (shown as acquired)
def native(sid, data, img, label, params, spl, pair=False, upscale=1, hi_pct=99.5, hi=None):
    """data indexed like the NIfTI; written in display order (screen right = patient left, down = posterior)."""
    A = img.affine
    assert np.allclose(A[:3, :3], np.diag(np.diag(A[:3, :3]))), "diagonal affine expected"
    ras2lps = np.diag([-1, -1, 1, 1]); L = ras2lps @ A               # voxel -> LPS
    v = data
    if L[0, 0] < 0: v = v[::-1]; L = L @ np.array([[-1, 0, 0, v.shape[0] - 1], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
    if L[1, 1] < 0: v = v[:, ::-1]; L = L @ np.array([[1, 0, 0, 0], [0, -1, 0, v.shape[1] - 1], [0, 0, 1, 0], [0, 0, 0, 1]])
    if L[2, 2] < 0: v = v[:, :, ::-1]; L = L @ np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, -1, v.shape[2] - 1], [0, 0, 0, 1]])
    dz = L[2, 2]
    if pair:                                                     # average neighbouring slices: 2 mm -> 4 mm
        nk = v.shape[2] // 2; v = 0.5 * (v[:, :, 0:2 * nk:2] + v[:, :, 1:2 * nk:2])
        L = L.copy(); L[2, 3] += dz / 2; L[2, 2] = dz * 2; dz *= 2
    hi = hi or float(np.percentile(v[v > np.percentile(v, 30)], hi_pct))
    ps = L[0, 0] / upscale; N = v.shape[0] * upscale
    assert v.shape[0] == v.shape[1] and abs(L[0, 0] - L[1, 1]) < 1e-4
    ipps = []
    for k in range(v.shape[2]):
        sl = v[:, :, k].T                                        # rows = +y (posterior), cols = +x (left)
        if upscale > 1: sl = cv2.resize(sl, (N, N), interpolation=cv2.INTER_CUBIC)
        cv2.imwrite(os.path.join(OUT, "%s_%02d.jpg" % (sid, k)), to8(np.clip(sl, 0, None), hi), [cv2.IMWRITE_JPEG_QUALITY, 82])
        p0 = L @ [0, 0, k, 1]
        ipps.append(p0[:3] - np.array([1, 1, 0]) * (L[0, 0] - ps) / 2)  # centre of the first (upscaled) pixel
    calib["ser"][sid] = {"task": "ax", "plane": "ax", "seq": label, "params": params, "n": v.shape[2],
                         "ipp": [[round(float(x), 2) for x in p] for p in ipps], "row": [1, 0, 0], "col": [0, 1, 0],
                         "ps": round(float(ps), 6), "cols": N, "rows": N, "nrm": [0, 0, 1], "sp": round(float(dz), 3),
                         "thk": round(float(dz), 3), "spl": spl, "pad": 2, "native": True}
    print(sid, v.shape[2], "slices (as acquired)")
    return ipps

img, fl = nii("anat/*FLAIR.nii.gz"); native("ax_flair", fl, img, "FLAIR", "2D T2 FLAIR · 5 mm · as acquired (straight axial)", 7.5)
img, ts = nii("anat/*T2starw.nii.gz"); native("ax_t2s", ts, img, "T2*", "2D T2* GRE · 4 mm · as acquired (straight axial)", 3.5)
img, dwi = nii("dwi/*dir-unflipped_dwi.nii.gz")
bv = np.loadtxt(glob.glob(os.path.join(SES, "dwi/*dir-unflipped_dwi.bval"))[0])
b0 = dwi[..., bv < 50].mean(-1); hb = bv > 50
tr = np.exp(np.log(np.clip(dwi[..., hb], 1, None)).mean(-1))
mask = b0 > np.percentile(b0, 99) * 0.12
adc = np.where(mask, np.log(np.clip(b0, 1, None) / np.clip(tr, 1, None)) / bv[hb].mean() * 1e6, 0)
native("ax_dwi", tr, img, "DWI b1000", "EPI DWI b = 1000 trace · 4 mm (2 mm pairs) · as acquired", 2.6, pair=True, upscale=2)
native("ax_adc", np.clip(adc, 0, 3200), img, "ADC", "ADC map from b0 + b1000 · 4 mm · as acquired", 0, pair=True, upscale=2, hi=3200.0)

# ------------------------------------------------------------------ synthetic 3-plane localiser (straight)
LOC_FOV, LN = 280.0, 256
LPSZ = LOC_FOV / LN
LOC_C = np.array([5.0, -25.0, 5.0])
LOC = {"sag": (US, VS, np.array([1.5, 0, 0])), "cor": (UA, np.array([0, 0, -1.0]), np.array([0, 0.0, 0])),
       "ax": (UA, np.array([0, 1.0, 0]), np.array([0, 0, 15.0]))}
calib["loc"] = {"n": LN, "fov": LOC_FOV}
for p, (r, c, off) in LOC.items():
    n = np.cross(r, c); ctr = LOC_C + off; SS = 2; N2 = LN * SS
    I, J = np.meshgrid((np.arange(N2) + 0.5) / SS - LN / 2, (np.arange(N2) + 0.5) / SS - LN / 2)
    base = ctr + I[..., None] * r * LPSZ + J[..., None] * c * LPSZ
    im = np.mean([T1.sample(base + n * t) for t in np.linspace(-3.5, 3.5, 6)], axis=0)
    im = cv2.resize(im.astype(np.float32), (LN, LN), interpolation=cv2.INTER_AREA)
    Pc = ctr + ((np.arange(LN) + 0.5) - LN / 2)[None, :, None] * r * LPSZ + ((np.arange(LN) + 0.5) - LN / 2)[:, None, None] * c * LPSZ
    rr = np.linalg.norm((Pc - BC) / [80, 100, 95], axis=-1)       # 32-ch head array: brighter toward the surface
    im = im * (0.78 + 0.3 * np.clip(rr, 0, 1.2) ** 2) * np.exp(-np.clip(BC[2] - 60 - Pc[..., 2], 0, None) / 90)
    im = gaussian_filter1d(im, 0.8, axis=0)
    sig = 0.025 * np.percentile(im, 99.5)
    im = np.hypot(im + rng.normal(0, sig, im.shape), rng.normal(0, sig, im.shape))
    hi = np.percentile(im[im > 0], 99.6)
    cv2.imwrite(os.path.join(OUT, "loc_" + p + ".png"), np.clip((im / hi) ** 0.9 * 255, 0, 255).astype(np.uint8))
    ipp = ctr - r * LPSZ * LN / 2 - c * LPSZ * LN / 2 + (r + c) * LPSZ / 2
    calib["loc"][p] = {"ipp": [round(float(x), 2) for x in ipp], "row": r.tolist(), "col": c.tolist(), "ps": round(LPSZ, 6), "cols": LN, "rows": LN}

# ------------------------------------------------------------------ landmarks (LPS mm, ±3 mm)
calib["lm"] = {
    "conf":   [round(float(x), 1) for x in BC],
    "ac": AC.tolist(), "pc": PC.tolist(),
    "vertex": [5.0, -20.0, 80.0],      # top of the brain (high convexity)
    "fm":     [5.0, -8.0, -48.0],      # foramen magnum (medulla)
    "cbl":    [5.0, 18.0, -40.0],      # inferior cerebellum (vermis, tonsils)
    "fpole":  [5.0, -100.0, 15.0],     # frontal pole
    "opole":  [5.0, 58.0, 0.0],        # occipital pole
    "rtl":    [-56.0, -20.0, -15.0],   # right temporal lobe, lateral
    "ltl":    [64.0, -20.0, -15.0],    # left temporal lobe, lateral
    "rtp":    [-45.0, -50.0, -28.0],   # right temporal pole
    "ltp":    [50.0, -50.0, -28.0],    # left temporal pole
    "pons":   [5.0, -18.0, -25.0],     # pons
    "mid":    [5.0, -20.0, 20.0],      # midline (interhemispheric fissure)
    "front":  [5.0, -120.0, 17.0],     # forehead skin
    "back":   [5.0, 70.0, 0.0],        # occiput skin
    "rskull": [-72.0, -20.0, 0.0],     # right side of the head
    "lskull": [84.0, -20.0, 0.0],      # left side of the head
}
calib["real"] = {"ax": round(REF_AX, 1), "cor": round(REF_AX + 90, 1), "sag": round(REF_SAG, 1)}
json.dump(calib, open(os.path.join(OUT, "calib.json"), "w"), indent=1)
open(os.path.join(OUT, "calib.js"), "w").write("window.MRS_CALIB=" + json.dumps(calib, separators=(",", ":")) + ";\n")

def qa(sid, keys):
    s = calib["ser"][sid]; ipp = np.array(s["ipp"]); r = np.array(s["row"]); c = np.array(s["col"]); nrm = np.array(s["nrm"])
    tiles = []
    for key in keys:
        P = np.array(calib["lm"][key]); k = int(np.argmin(np.abs((P - ipp) @ nrm)))
        im = cv2.cvtColor(cv2.imread(os.path.join(OUT, "%s_%02d.jpg" % (sid, k)), 0), cv2.COLOR_GRAY2BGR)
        im = cv2.resize(im, (384, 384)); f = 384 / s["cols"]
        x, y = (P - ipp[k]) @ r / s["ps"] * f, (P - ipp[k]) @ c / s["ps"] * f
        cv2.circle(im, (int(x), int(y)), 6, (0, 0, 255), 1); cv2.putText(im, key, (int(x) + 8, int(y)), 0, 0.45, (0, 255, 255), 1)
        tiles.append(im)
    cv2.imwrite(os.path.join(QA, "qa_" + sid + ".png"), np.hstack(tiles))
qa("sag_t1", ["ac", "vertex", "fm", "fpole", "opole", "cbl"])
qa("ax_t2", ["rtl", "ac", "opole", "pons", "vertex", "front"])
qa("cor_t2", ["rtl", "ltl", "vertex", "fm", "rtp", "mid"])
qa("ax_flair", ["rtl", "ac", "opole", "pons"])
qa("ax_dwi", ["rtl", "ac", "opole", "pons"])
print("ok")
