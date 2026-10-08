// =====================================================================
//  360° VIRTUAL TOUR SPOTS  — edit this file to match your 360 photos
// =====================================================================
//
//  Each spot is one place where someone stands and takes a 360° photo.
//  Arrows between neighbouring spots are worked out automatically from the
//  campus paths, so you only need to list the spots.
//
//   id       file name of the photo: pano/<id>.jpg  (equirectangular 2:1,
//            e.g. 4096x2048 or 6000x3000 — what phone 360 apps / 360 cameras export)
//   at       where you stood [lat, lng]. Move it if you took the photo elsewhere.
//   heading  compass direction (0 = north, 90 = east…) that the CENTRE of
//            the photo is facing. Get it right and the arrows line up with
//            the real paths. Tip: start the 360 shot facing a known direction.
//   places   places this spot is "outside of" — used for the 360° button on
//            each place card.
//
//  Spots without a photo yet show a labelled placeholder so the tour still works.
//  Spots were placed in front of every building, at every QR checkpoint and
//  at road junctions. Delete ones you don't need, add more on long paths
//  (every 30–50 m feels like Street View).

window.TOUR_SPOTS = [
  { id: "main-gate", name: "Main Gate (Katubedda)", at: [6.794955, 79.900744] },
  { id: "side-gate", name: "Secondary Entrance", at: [6.795323, 79.899839] },
  { id: "goda-junction", name: "Goda Canteen Junction", at: [6.796529, 79.900862] },
  { id: "it-front", name: "In front of the IT Faculty", at: [6.797011, 79.901393] },
  { id: "it-faculty", name: "Outside Faculty of Information Technology", at: [6.797289, 79.901729], places: ["it-faculty"] },
  { id: "business", name: "Outside Faculty of Business", at: [6.797446, 79.900964], places: ["business"] },
  { id: "l-building", name: "Outside L Building & UoM Gymnasium", at: [6.797665, 79.900994], places: ["l-building", "gym"] },
  { id: "sumanadasa", name: "Outside Sumanadasa Building", at: [6.796614, 79.900466], places: ["sumanadasa"] },
  { id: "new-classroom", name: "Outside New Classroom Block", at: [6.796699, 79.901649], places: ["new-classroom"] },
  { id: "exam-hall", name: "Outside Examination Hall", at: [6.795884, 79.901778], places: ["exam-hall"] },
  { id: "library", name: "Outside University Library", at: [6.7954, 79.900812], places: ["library"] },
  { id: "admin", name: "Outside Administration Building & Arthur C. Clarke Institute (ACCIMT)", at: [6.795142, 79.900281], places: ["admin", "accimt"] },
  { id: "medical", name: "Outside Medical Center", at: [6.796784, 79.901492], places: ["medical"] },
  { id: "buddha-statue", name: "Outside Buddha Statue", at: [6.796669, 79.900964], places: ["buddha-statue"] },
  { id: "goda-canteen", name: "Outside Goda Canteen", at: [6.796594, 79.90019], places: ["goda-canteen"] },
  { id: "wala-canteen", name: "Outside Wala Canteen", at: [6.796655, 79.899552], places: ["wala-canteen"] },
  { id: "food-court", name: "Outside Food Court & Study Area", at: [6.796306, 79.900445], places: ["food-court"] },
  { id: "juice-shop", name: "Outside Juice Shop", at: [6.798594, 79.901165], places: ["juice-shop"] },
  { id: "playground", name: "Outside University Playground", at: [6.798295, 79.898684], places: ["playground"] },
  { id: "lagaan", name: "Outside Lagaan (open-air theatre)", at: [6.797948, 79.901053], places: ["lagaan"] },
  { id: "nugasewana", name: "Outside Nugasewana Hostel Complex", at: [6.799321, 79.902055], places: ["nugasewana"] },
  { id: "girls-hostel", name: "Outside Girls' Hostel", at: [6.79683, 79.902317], places: ["girls-hostel"] },
  { id: "boys-hostel", name: "Outside Boys' Hostel", at: [6.797539, 79.902208], places: ["boys-hostel"] },
  { id: "tlm", name: "Outside Dept. of Transport Management & Logistics Engineering", at: [6.797761, 79.902073], places: ["tlm"] },
  { id: "textile", name: "Outside Dept. of Textile & Apparel Engineering", at: [6.798213, 79.901094], places: ["textile"] },
  { id: "transport-eng", name: "Outside Dept. of Transport Engineering", at: [6.795833, 79.90083], places: ["transport-eng"] },
  { id: "earth-resources", name: "Outside Dept. of Earth Resources Engineering", at: [6.79664, 79.899711], places: ["earth-resources"] },
  { id: "architecture", name: "Outside Faculty of Architecture (New Building)", at: [6.795316, 79.901892], places: ["architecture"] },
  { id: "ce-lab", name: "Outside Civil Engineering Research Lab", at: [6.798101, 79.902613], places: ["ce-lab"] },
  { id: "civil-car-park", name: "Outside Civil Car Park", at: [6.798098, 79.902438], places: ["civil-car-park"] },
  { id: "j1", name: "Junction near Civil Engineering Research Lab", at: [6.798248, 79.903232] },
  { id: "j2", name: "Junction near Nugasewana Hostel Complex", at: [6.798751, 79.90202] },
  { id: "j3", name: "Junction near Dept. of Transport Management & Logistics Engineering", at: [6.798068, 79.902079] },
  { id: "j4", name: "Junction near University Playground", at: [6.798897, 79.899053] },
  { id: "j5", name: "Junction near University Playground", at: [6.799045, 79.899599] },
  { id: "j6", name: "Junction near Sumanadasa Building", at: [6.797097, 79.900923] },
  { id: "j7", name: "Junction near Wala Canteen", at: [6.797239, 79.898923] },
  { id: "j8", name: "Junction near New Classroom Block", at: [6.796514, 79.901855] },
  { id: "j9", name: "Junction near Wala Canteen", at: [6.796719, 79.898882] },
  { id: "j10", name: "Junction near Food Court & Study Area", at: [6.796043, 79.900428] },
];
