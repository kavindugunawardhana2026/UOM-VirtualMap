# UoM Campus Finder — Batch 26 (Faculty of IT)

A phone-friendly campus map for the Batch 26 inauguration. Freshers scan a QR code at
the gate or a junction, search for a place (English or Sinhala), and get the walking route
drawn on the map with turn-by-turn directions, a photo and the floor/room.

- `index.html` — the map app
- `qr.html` — prints the QR codes for each checkpoint
- `print.html` — printable map / "Save as PDF" for offline sharing in the batch group

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
   and `venueNote`. A "Take me to the inauguration" button appears.
2. **Walk every route** from each QR checkpoint. Fix anything wrong in `js/places.js`:
   - `entrance: [lat, lng]` — the door to walk to (routes currently end at the building centre)
   - `steps: { "main-gate": ["…", "…"] }` — hand-checked directions; shown with a ✔ badge
     instead of the automatic ones.
3. **Add rooms** (lecture halls, labs) to `rooms: [...]` of the IT Faculty building — they become searchable.
4. **Take photos** — see `photos/README.md` for names and the shot list.
5. **Check the checkpoint positions** in `CHECKPOINTS`, then print `qr.html` and stick each QR at its spot.
6. **Test with someone new** to campus: give them the QR and ask them to find 3 places alone.

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
