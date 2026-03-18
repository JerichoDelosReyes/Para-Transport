/*
  Overpass query: T4xx jeepney routes
  Southern Metro Manila, suburban Cavite and Laguna
  Targets route relations with ref tags matching T4xx pattern
  Covers: Alabang, Las Piñas, Muntinlupa, Parañaque, Bacoor, Imus, Dasmariñas, Biñan, Carmona, GMA
*/
[out:json][timeout:120];

// Bounding box: Southern Metro Manila + Cavite + northern Laguna
// south, west, north, east
(
  // Match relations tagged as routes with ref=T4xx
  relation["type"="route"]["route"~"bus|minibus|share_taxi"]["ref"~"^T4"](14.20,120.85,14.58,121.15);

  // Also try matching by name containing T4xx codes
  relation["type"="route"]["route"~"bus|minibus|share_taxi"]["name"~"T4[0-9]"](14.20,120.85,14.58,121.15);

  // Catch jeepney-tagged routes in the area
  relation["type"="route"]["route"~"bus|minibus|share_taxi"]["network"~"[Jj]eep"](14.20,120.85,14.58,121.15);

  // Ways that are part of jeepney route relations in the area
  way["route"~"bus|minibus|share_taxi"]["ref"~"^T4"](14.20,120.85,14.58,121.15);
);

// Recurse down to get all member ways and nodes
(._;>;);

out body;
