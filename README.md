# UoM Campus Finder — Batch 26 (Faculty of IT)

A phone-friendly campus map for the Batch 26 inauguration. Freshers scan a QR code at
the gate or a junction, search for a place (English or Sinhala), and get the walking route
drawn on the map with turn-by-turn directions, a photo and the floor/room.

- `index.html` — the map app (search, routes from any place/QR/GPS to any place, 360° tour)
- `qr.html` — prints the QR codes for each checkpoint
- `print.html` — printable map / "Save as PDF" for offline sharing in the batch group

## Look & feel

Animated welcome screen (once per visit — tap the **26** button to see it again), pins that drop in,
a route line that draws itself with a glowing "comet" walking it, confetti when you arrive in the 360° tour,
light & dark themes that follow the phone, and everything calms down automatically for people who turn
animations off on their phone (reduced motion). Effects live in `js/fx.js`, styles in `css/app.css`.

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

## 360° virtual tour

Every place card has a **360° view** and a **Walk there in 360°** button, and the blue "360" dots on
the map (zoom in) open the tour. Inside the tour, ground arrows take you to the next spot along the
path; with a destination chosen, the arrow to follow glows and the mini-map shows the route.

- Spots are listed in `js/tour.js` (one in front of each building, each QR checkpoint, each junction).
- Arrows between spots are calculated from the campus paths — no need to set them by hand.
- Add the real 360 photos to `pano/` — see `pano/README.md`. Until then a drawn placeholder is shown.
- Built with [Pannellum](https://pannellum.org/) (MIT).

### "Real view" — Google Street View inside the tour

The tour has two modes (switch at the top right):
- **🌐 Real view** — Google's real Street View imagery for each spot. Drag to look around; the
  buttons at the bottom jump to the next spot on the route (the glowing one leads to your destination).
- **📷 Our 360°** — your own 360 photos from `pano/` (placeholders until you add them).

Without a key, "Real view" opens the spot in the Google Maps app/website. To show it **inside** the app:
1. Go to https://console.cloud.google.com/ → create a project → enable **Maps Embed API**
   (it's free for Street View embeds, but Google asks for a billing account on the project).
2. Credentials → **Create API key** → restrict it: *Application restriction* = Websites, add your site
   (e.g. `https://<username>.github.io/*`); *API restriction* = Maps Embed API only.
3. Paste it into `js/places.js` → `GOOGLE_MAPS_EMBED_KEY`.

**Coverage (checked October 2026):** Google has car Street View on the Katubedda road at the Main Gate,
and a few user-uploaded 360° photos inside campus (e.g. near the IT Faculty), but **no imagery at many
spots inside campus** (e.g. Goda Canteen junction) — those show "no imagery". To fill the gaps, take
your own 360 photos (`pano/`), or upload them to Google Maps with a 360 camera so they appear in
Real view too.

## Images

Each place card shows, in order: your photos (`photos/<id>.jpg`, `photos/<id>-entrance.jpg`) if
they exist, a 360° preview, and a satellite **aerial view** with the building outlined — so every
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
