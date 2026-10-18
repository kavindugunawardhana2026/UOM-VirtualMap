# UoM Campus Finder — Batch 26 (Faculty of IT)

A phone-friendly campus map for the Batch 26 inauguration. Freshers scan a QR code at
the gate or a junction, search for a place (English or Sinhala), and get the walking route
drawn on the map with turn-by-turn directions, a photo and the floor/room.

- `index.html` — the map app (search, routes from any place/QR/GPS to any place, 3D map)
- `qr.html` — prints the QR codes for each checkpoint
- `print.html` — printable map / "Save as PDF" for offline sharing in the batch group

## Look & feel

A scrolling landing page opens first (once per visit — tap the **26** button to see it again): the faculty
photo as the hero, then sections about the faculty, its departments and degrees, a "places you'll need" list
that opens the map at that place, and a final "Open the campus map" button. Headings decode from scrambled
letters as they scroll in, the hero photo drifts in parallax, and a glossy orb changes shape for each numbered
step. There is a dark (navy + electric blue) and a light theme: it follows the phone until someone taps
the sun/moon button (on the map and in the landing page top bar), then remembers their choice. Pins drop in and the route line draws
itself with a glowing "comet" walking it. Everything calms down for people who turn animations off on their
phone (reduced motion). Effects live in `js/fx.js`, styles in `css/app.css`, landing text in `index.html`.

## Run it on your computer

```
python -m http.server 8765
```
Open http://localhost:8765

## Put it online (free)

**GitHub Pages:** create a repo, upload this folder, Settings → Pages → Deploy from branch `main`.
The address will look like `https://<username>.github.io/<repo>/`.
**Netlify:** drag this folder onto https://app.netlify.com/drop.

Then open `qr.html` on the live site, check the address box, and print.

## Before the event — checklist

1. **Set the ceremony venue.** In `js/places.js`, set `EVENT.venueId` (e.g. `"it-faculty"`)
   and `venueNote`. A "Take me to the inauguration" button appears. Set `EVENT.date`
   (e.g. `"2026-10-20T08:30:00+05:30"`) to show a live countdown on the home screen.
2. **Walk every route** from each QR checkpoint. Fix anything wrong in `js/places.js`:
   - `entrance: [lat, lng]` — the door to walk to (routes currently end at the building centre)
   - `steps: { "main-gate": ["…", "…"] }` — hand-checked directions; shown with a ✔ badge
     instead of the automatic ones.
3. **Add rooms** (lecture halls, labs) to `rooms: [...]` of the IT Faculty building — they become searchable.
4. **Take photos** — see `photos/README.md` for names and the shot list.
5. **Check the checkpoint positions** in `CHECKPOINTS`, then print `qr.html` and stick each QR at its spot.
6. **Test with someone new** to campus: give them the QR and ask them to find 3 places alone.

## 3D map

The cube button (and **Explore campus in 3D** / **See it in 3D** / **Route in 3D** in the app) opens a
3D model of the campus built from OpenStreetMap (`js/map3d.js`, no key needed). The open place and its
route are shown in 3D, and 📍 **Live Track** follows your GPS position. Campus buildings are drawn 50%
taller than real so they stand out from the town around them — change `CAMPUS_HEIGHT_BOOST` in
`js/map3d.js` (e.g. `1.3` = +30%, `2` = double).

## Images

Each place card shows, in order: your photos (`photos/<id>.jpg`, `photos/<id>-entrance.jpg`) if
they exist, a "See it in 3D" button, and a satellite **aerial view** with the building outlined — so every
place has an image from day one.

## Directions between any two places

Pick any start from the "From" box (QR checkpoint, any place, or GPS), or press **📍 Start from here**
on a place card, then tap where you want to go. Links like `?from=goda-canteen&to=library` work too.
If OSM is missing a footpath, routes can get long (the app warns) — add it to `EXTRA_PATHS` in
`js/places.js`.

## Where the data comes from

- Building outlines, positions and campus roads: © OpenStreetMap contributors (ODbL), in
  `js/campus-data.js`. Regenerate with `python tools/build_campus_data.py` after updating
  `tools/campus.osm` (instructions at the top of that script). If a building or path is missing
  you can fix it on openstreetmap.org — it helps everyone.
- Base map tiles: OpenStreetMap; satellite view: Esri World Imagery.
- Photos: not included — Google Maps photos belong to the people who uploaded them and can't be
  copied into the site. Each place has an "Open in Google Maps" button instead, and the team adds
  its own photos (which is better anyway: they show the exact door freshers should use).

## Offline

The app draws the campus (buildings + roads) itself, so the map still shows with weak/no
internet once loaded. Over HTTPS it also caches itself for offline use. For zero-internet
use, share the PDF from `print.html`.
