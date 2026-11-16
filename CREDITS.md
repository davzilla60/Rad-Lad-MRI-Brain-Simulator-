# Credits

## Imaging

Adapted from the **NIMH Healthy Research Volunteer Dataset**, OpenNeuro
[ds005752](https://openneuro.org/datasets/ds005752), released under **CC0 1.0** (public domain).

> Nugent, A. C., Thomas, A. G., Mahoney, M., Gibbons, A., Smith, J. T., Charles, A. J., Shaw, J. S., Stout, J. D.,
> Namyst, A. M., Basavaraj, A., Earl, E., Riddle, T., Snow, J., Japee, S., Pavletic, A. J., Sinclair, S.,
> Roopchansingh, V., Bandettini, P. A., & Chung, J. (2022). The NIMH intramural healthy volunteer dataset: A
> comprehensive MEG, MRI, and behavioral resource. *Scientific Data*, 9, 518.
> https://doi.org/10.1038/s41597-022-01623-9

Participant **sub-ON02693**: one healthy adult volunteer, GE Discovery MR750 3 T, 32-channel head coil. The dataset
authors removed the face (defacing). **The clinical request in the simulator is fictional** — the volunteer had no
symptoms.

### Changes made

- Sagittal T1, axial T2 and coronal T1 / T2 are **reformatted** (trilinear, slab-averaged) from the volunteer's 1 mm
  3D MPRAGE T1 and 3D CUBE T2: sagittal parallel to the falx, axial parallel to the AC-PC line, coronal perpendicular.
- FLAIR, T2*, DWI and ADC are shown **as acquired** (straight axial 2D stacks); the DWI is the trace (geometric mean)
  of 24 b = 1000 directions and the ADC is calculated from it; both are averaged from 2 mm to 4 mm.
- The 3-plane localiser is **synthesised** from the 3D T1 (8 mm slab, 280 mm FOV, coil shading, noise).
- Pixel values windowed to 8-bit JPEG / PNG.
- The 3-D room shows a generic closed-bore magnet and head coil, not any real product.

Educational simulation — not a medical device, not for clinical use.
