# MR-I Ready — Brain

An embeddable, single-file teaching simulator for the Rad-Lad website, built on the MR-I Ready engine (forked from
the femur simulator, with the shoulder simulator's head-first 3-D room). Every diagnostic image comes from **one
real 3 T MRI of a healthy volunteer's brain** (public-domain research data — see `CREDITS.md`) and is shown with its
true geometry. **It's a demonstration only.**

Marker: **Little Grey Cells** — sagittal T1 parallel to the falx, temporal lobe to temporal lobe; axial parallel to
the AC-PC line from the foramen magnum to the vertex; coronal perpendicular to it from frontal pole to occipital
pole; whole head inside every FOV; and the head straight, chin neutral, padded in the coil.

## Flow

1. **Patient set-up.** Supine, **head first**, in a 32-channel head coil. Choose how the head lies (the 3-D room
   changes pose):
   - head straight, chin neutral, foam pads either side — correct;
   - chin tipped up (neck extended) — the AC-PC line swings steeply, the face presses on the coil;
   - head rolled to one side, no pads — oblique in two planes, and it drifts.
2. **Localiser.** A 3-plane localiser (280 mm FOV) is "acquired" line by line from its own k-space. It is
   **synthesised** from the volunteer's 3D T1 (the study's own localiser wasn't shared).
3. **Sagittal first.** Parallel to the falx on the axial (reference 88.9°, the head is nearly straight); both temporal
   lobes, vertex, foramen magnum, frontal and occipital poles.
4. **Axial + coronal** unlock once the sagittal is scanned. Drag (or tap) the sagittal T1 onto the **SAGITTAL** panel
   to unlock the rotate handle — it opens on the midline. Axial parallel to AC-PC (reference 7.9°: the line dips
   posteriorly, so a straight axial fails), coronal perpendicular (97.9°), graded ±5°.
5. **Scan → images.** Sagittal T1; axial T2, FLAIR, DWI + ADC, T2*; coronal T2 and T1 — whatever is ticked.
6. **Debrief.** Coverage and angle per plan, position, hero images (the midline sagittal shows your axial and coronal
   against the AC-PC line), a sequences-to-consider table and the marker.

CLI: `neutral | chinup | tilted`, `load`, `loc`, `plan sag|ax|cor`, `auto`, `slices`, `thick`, `gap`, `fov`,
`angle`, `use <series>`, `restore <sag|cor|ax>`, `scan`, `back`, `finish`, `help`.

## Images

| Series | Source |
|---|---|
| SAG T1, COR T1 | reformatted from the 1 mm 3D MPRAGE T1 (falx / perpendicular to AC-PC) |
| AX T2, COR T2 | reformatted from the 1 mm 3D CUBE T2 (parallel / perpendicular to AC-PC) |
| AX FLAIR, AX T2* | as acquired: straight axial 2D stacks (≈ 8° steeper than AC-PC) |
| AX DWI b1000, AX ADC | as acquired; trace of 24 b = 1000 directions, ADC calculated, 2 mm pairs averaged to 4 mm |
| Localiser | synthesised from the 3D T1 |

## Files

- `brain.embed.html` is the self-contained deliverable (~3.7 MB, every image inlined). `index.html` is an identical
  copy for one-drop hosting.
- `brain.html` + `app.js` + `room3d.js` + `assets/` are the editable sources. After editing, rebuild with
  `python inline.py` (bump the `?v=` tags in `brain.html` and `inline.py` together).
- `tools/gen_assets.py` rebuilds `assets/` from the BIDS session folder of the source subject:
  `python -I tools/gen_assets.py "<.../ds005752/sub-ON02693/ses-01>"`. `tools/pick.py` renders grid-labelled planes
  of the 3D T1, which were used to pick the landmarks (AC, PC, falx, brain edges).
