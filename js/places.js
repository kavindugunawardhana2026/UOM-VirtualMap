// =====================================================================
//  EDIT THIS FILE to add / fix places. Everything else reads from here.
// =====================================================================
//
//  Coordinates come from OpenStreetMap building outlines. They are good
//  enough to find a building, but before the event someone should walk
//  each route and fix anything that is wrong:
//
//   - entrance:  [lat, lng] of the door people should walk to. Routes end
//                here. Leave it out and the route ends at the building
//                centre. (Tip: stand at the door, open Google Maps, long-
//                press your blue dot and copy the numbers.)
//   - floors:    number of floors, shown on the card.
//   - steps:     hand-written directions that replace the automatic ones
//                once someone has walked them and checked them.
//   - rooms:     lecture halls / labs inside the building. They show up in
//                search, e.g. { code: "L1", name: "Lecture Hall 1",
//                floor: "Ground floor", how: "Left after the main stairs" }
//   - photo:     put a photo at photos/<id>.jpg (and optionally
//                photos/<id>-entrance.jpg). Missing photos are skipped.
//
//  "osm" is the OpenStreetMap way id used to highlight the outline.

// Google Street View ("Real view" in the 360° tour).
// Paste a Google Maps *Embed API* key here to show Google's real Street View
// imagery inside the app (the Embed API is free — see README). Without a key,
// "Real view" opens the same spot in the Google Maps app / website instead.
window.GOOGLE_MAPS_EMBED_KEY = "";

window.EVENT = {
  title: "Welcome, Batch 26!",
  subtitle: "Faculty of Information Technology · University of Moratuwa",
  // Set this to the id of the inauguration venue (e.g. "it-faculty") and a
  // "Go to the ceremony" button appears at the top of the app.
  venueId: null,
  // Ceremony start, e.g. "2026-10-20T08:30:00+05:30" — shows a live countdown on the home screen.
  date: null,
  venueNote: "", // e.g. "Ceremony starts 8.30 a.m. — please be seated by 8.15"
};

// Footpaths that are missing from OpenStreetMap. Routes (and 360° arrows) can
// use these. Each one is a list of [lat, lng] points; it must start/end
// exactly on an existing road point or close to one. Walk them to confirm.
// Example: [[6.798751, 79.90202], [6.798990, 79.901860], [6.799223, 79.901704]],
// TODO: routes to Nugasewana currently go round by the outside road because
// OSM has no path from campus to it — add the real footpath (and set the
// hostel's `entrance`) after checking on site.
window.EXTRA_PATHS = [
];

window.CATEGORIES = {
  faculty:  { label: "Faculties & lecture", icon: "🎓", color: "#7c3aed" },
  services: { label: "Offices & services",  icon: "🏛️", color: "#2563eb" },
  food:     { label: "Food",                icon: "🍛", color: "#ea580c" },
  health:   { label: "Medical",             icon: "🏥", color: "#dc2626" },
  sports:   { label: "Sports & open areas", icon: "⚽", color: "#16a34a" },
  hostel:   { label: "Hostels",             icon: "🛏️", color: "#0d9488" },
  other:    { label: "Other departments",   icon: "🏢", color: "#64748b" },
  gate:     { label: "Gates",               icon: "🚪", color: "#0f172a" },
};

// QR checkpoints. Print one QR per checkpoint (qr.html) and stick it at
// that exact spot. Scanning it opens the map with routes starting there.
window.CHECKPOINTS = [
  { id: "main-gate", name: "Main Gate (Katubedda)", si: "ප්‍රධාන ගේට්ටුව",
    at: [6.794955, 79.900744], note: "Main entrance from the Katubedda junction road" },
  { id: "side-gate", name: "Secondary Entrance", si: "දෙවන ගේට්ටුව",
    at: [6.795323, 79.899839], note: "Entrance near the Arthur C. Clarke Institute" },
  { id: "goda-junction", name: "Goda Canteen Junction", si: "ගොඩ කැන්ටිම හන්දිය",
    at: [6.796529, 79.900862], note: "Main Street meets Sumanadasa Front Road" },
  { id: "it-front", name: "In front of the IT Faculty", si: "IT පීඨය ඉදිරිපිට",
    at: [6.797011, 79.901393], note: "Main Street junction next to the IT Faculty" },
];

window.PLACES = [
  // ---- Faculty of IT & nearby teaching buildings -------------------------
  { id: "it-faculty", name: "Faculty of Information Technology",
    si: "තොරතුරු තාක්ෂණ පීඨය", aka: ["IT Faculty", "FIT", "ITFac", "IT Department"],
    cat: "faculty", osm: "395935840", at: [6.797117, 79.901869], floors: 4,
    desc: "Home of Batch 26. Lecture halls, labs and the faculty office are in this building.",
    rooms: [] },
  { id: "business", name: "Faculty of Business", si: "ව්‍යාපාර පීඨය",
    cat: "faculty", osm: "1444650029", at: [6.797415, 79.901229], floors: 2, rooms: [] },
  { id: "l-building", name: "L Building", si: "L ගොඩනැගිල්ල",
    cat: "faculty", osm: "395935842", at: [6.797581, 79.901378], floors: 3, rooms: [] },
  { id: "sumanadasa", name: "Sumanadasa Building", si: "සුමනදාස ගොඩනැගිල්ල",
    aka: ["Engineering Faculty"], cat: "faculty", osm: "220323121", at: [6.796853, 79.900556],
    desc: "Large central building of the Faculty of Engineering.", rooms: [] },
  { id: "new-classroom", name: "New Classroom Block", si: "නව පන්ති කාමර ගොඩනැගිල්ල",
    cat: "faculty", osm: "220323155", at: [6.796577, 79.901582], floors: 3, rooms: [] },
  { id: "exam-hall", name: "Examination Hall", si: "විභාග ශාලාව",
    cat: "faculty", osm: "220296316", at: [6.79602, 79.90189], rooms: [] },

  // ---- Services ----------------------------------------------------------
  { id: "library", name: "University Library", si: "පුස්තකාලය", aka: ["Library"],
    cat: "services", osm: "220323124", at: [6.795391, 79.901029] },
  { id: "admin", name: "Administration Building", si: "පරිපාලන ගොඩනැගිල්ල",
    aka: ["Registrar", "SAR", "Student Affairs", "Admin"],
    cat: "services", osm: "220323158", at: [6.795367, 79.900373] },
  { id: "medical", name: "Medical Center", si: "වෛද්‍ය මධ්‍යස්ථානය", aka: ["Doctor", "Health"],
    cat: "health", osm: "220323120", at: [6.796927, 79.901571] },
  { id: "buddha-statue", name: "Buddha Statue", si: "බුදු පිළිමය",
    cat: "other", osm: "220323156", at: [6.796604, 79.901054],
    desc: "Good landmark and meeting point in the middle of campus." },

  // ---- Food --------------------------------------------------------------
  { id: "goda-canteen", name: "Goda Canteen", si: "ගොඩ කැන්ටිම", aka: ["Canteen"],
    cat: "food", osm: "220323119", at: [6.796399, 79.900171] },
  { id: "wala-canteen", name: "Wala Canteen", si: "වල කැන්ටිම", aka: ["Canteen"],
    cat: "food", osm: "220298434", at: [6.796924, 79.899578] },
  { id: "food-court", name: "Food Court & Study Area", si: "ආහාර සහ අධ්‍යයන ප්‍රදේශය",
    aka: ["Canteen"], cat: "food", osm: "257709525", at: [6.796297, 79.900585] },
  { id: "juice-shop", name: "Juice Shop", si: "යුෂ කඩේ",
    cat: "food", osm: "395935730", at: [6.7987, 79.901158] },

  // ---- Sports & open areas ----------------------------------------------
  { id: "gym", name: "UoM Gymnasium", si: "ව්‍යායාම ශාලාව", aka: ["Gym"],
    cat: "sports", osm: "220298433", at: [6.797641, 79.900542] },
  { id: "playground", name: "University Playground", si: "ක්‍රීඩාංගණය", aka: ["Ground"],
    cat: "sports", at: [6.798146, 79.899463] },
  { id: "lagaan", name: "Lagaan (open-air theatre)", si: "ලගාන්", aka: ["Open air theatre"],
    cat: "sports", osm: "395935732", at: [6.798003, 79.900704] },

  // ---- Hostels -----------------------------------------------------------
  { id: "nugasewana", name: "Nugasewana Hostel Complex", si: "නුගසෙවන නේවාසිකාගාරය",
    cat: "hostel", osm: "395935839", at: [6.799146, 79.902097], floors: 4 },
  { id: "girls-hostel", name: "Girls' Hostel", si: "කාන්තා නේවාසිකාගාරය",
    cat: "hostel", osm: "395935918", at: [6.796881, 79.902756], floors: 3 },
  { id: "boys-hostel", name: "Boys' Hostel", si: "පිරිමි නේවාසිකාගාරය",
    cat: "hostel", osm: "1444650030", at: [6.797339, 79.902217], floors: 3 },

  // ---- Other departments / landmarks ------------------------------------
  { id: "tlm", name: "Dept. of Transport Management & Logistics Engineering",
    aka: ["TLM"], cat: "other", osm: "395935845", at: [6.797766, 79.901817], floors: 5 },
  { id: "textile", name: "Dept. of Textile & Apparel Engineering", aka: ["Textile"],
    cat: "other", osm: "220298430", at: [6.798184, 79.901404] },
  { id: "transport-eng", name: "Dept. of Transport Engineering",
    cat: "other", osm: "220298431", at: [6.795826, 79.901005] },
  { id: "earth-resources", name: "Dept. of Earth Resources Engineering",
    cat: "other", osm: "233522243", at: [6.796451, 79.899693] },
  { id: "architecture", name: "Faculty of Architecture (New Building)",
    aka: ["Architecture"], cat: "other", osm: "540767240", at: [6.795447, 79.901524], floors: 4 },
  { id: "ce-lab", name: "Civil Engineering Research Lab", cat: "other",
    osm: "395935833", at: [6.797976, 79.902657], floors: 4 },
  { id: "accimt", name: "Arthur C. Clarke Institute (ACCIMT)", aka: ["ACCIMT"],
    cat: "other", at: [6.794924, 79.900189] },
  { id: "civil-car-park", name: "Civil Car Park", si: "වාහන නැවැත්වීම", aka: ["Parking"],
    cat: "other", osm: "395935835", at: [6.79823, 79.902498] },
];
