# 360° photos for the virtual tour

One photo per spot in `js/tour.js`, saved as `pano/<spot id>.jpg`
(e.g. `pano/main-gate.jpg`, `pano/library.jpg`, `pano/j6.jpg`).

**Format:** equirectangular 360×180, 2:1 ratio (4096×2048 is plenty; keep under ~1.5 MB each).
This is what 360 cameras (Insta360, Ricoh Theta…) and phone apps like *Panorama 360* or
*Google Camera → Photo Sphere* export.

**How to shoot each spot**
1. Stand at the spot's position (open the map, zoom in — the blue "360" dots show where).
2. Stand in the middle of the path, hold the phone/camera at head height.
3. Start the shot **facing north** if you can (use the phone compass). Then `heading` stays 0.
   If not, note the compass direction you started facing and put it in `heading` for that spot.
4. Export as JPG and name it after the spot id.

Spots without a photo show a drawn placeholder, so you can add photos gradually.
After adding photos, walk the tour once and check the arrows point down the real paths —
if they're all turned by the same angle, fix that spot's `heading`.
