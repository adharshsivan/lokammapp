# Malabar — a world to wander

A playable, procedural Three.js exploration game inspired by the supplied Kerala coastline illustration. All terrain, architecture, vegetation, water and player geometry are built in code. This is a stylized interpretation, not a pixel-exact reconstruction or real geographical survey.

## Run

```sh
npm install
npm run dev
```

Open **http://localhost:5174/**. Malabar uses a fixed port because 5173 serves another project. `npm run build` creates a deployable `dist/` folder. `npm run preview` serves that build. `npm test` validates world dimensions, bridge clearance, grades, continuous road surfaces, road connectivity and safe landmark spawns.

## Explore

- Choose **Start wandering** to enter at the selected destination.
- **WASD / arrow keys:** walk at 3.8 m/s. **Shift:** run at 9 m/s. **Space:** jump.
- Drag to look, or click the scene to capture the pointer. **Esc:** release it.
- **V:** first/third person. **M:** atlas, field notes and destination travel.
- Touch: left joystick, swipe the scene to look, Run and Jump buttons on the right.
- Settings: balanced/light graphics, sensitivity, labels and return to lighthouse.
- Optional generated coastal ambience; discovered places and distance save locally.

## World and scale

The simulation is bounded by **x/z = −1,000…+1,000 metres**, an exact **4,000,000 m² (4 km²) horizontal footprint**. This includes the ocean and lagoons; it does **not** claim four square kilometres of dry, walkable land in addition to water. Deep water, buildings, extreme slopes and the outer boundary block movement. Shallows are accessible to a depth of 0.55 m.

The world includes a western coastal spine, connected offshore islands, beaches, two lagoons, backwater channels, field mosaics, inland ridges, two lighthouses, a church, a temple, houses, shops, a small hill town, a fishing harbour, jetties and boats. Six major landmarks form the discovery journal. Thirteen compact districts inspired by Kerala places run from Kasaragod in the north to Thiruvananthapuram in the south; Wayanad is a northern highland branch, and Malappuram and Palakkad occupy sculpted inland terrain. Each district has two or three named local stops, for 32 in all. These are a compressed fictional interpretation, not real city footprints or distances.

Twenty-five connected routes now include the coastal through-road, eastern through-road, district market loops and approaches, highland trails, and intentional terminals at beaches, islands and ridge viewpoints. The atlas lists districts in north-to-south order, shows their local stops, and lets the player walk to each one.

Road profiles are grade-limited to **10%** (main and secondary roads), **20%** (the compact hill climb), or **25%** (trails). Main asphalt, secondary paved roads and dirt footpaths use separate shared materials; junction patches seal strip intersections. The entire road mesh group can be toggled with **R** or the Roads button. Water crossings have at least **7 m surface elevation** and pier-supported decks. Dry coastal roads stay embedded in land rather than acquiring bridge piers. Road cuts and fills blend into nearby terrain on dry land. Collision samples the continuous terrain height field; bridge decks and sloped fishing jetties have their own walkable surfaces. Building collision uses compact axis-aligned footprints. There are no building interiors or NPC navigation system.

## Runtime design

- **64 sectors**, each **250 × 250 m**; adaptive indexed cells use 10 m flats, 5–2.5 m ridges and 1.25 m close scarps. Even distant steep interiors receive 1.25 m cells where needed. Curvature and slope control subdivision; shared 2.5 m borders and stitched internal edges prevent cracks.
- At most one detailed sector is generated per streaming tick; distant terrain silhouettes stay resident and detailed sector geometry is released outside the radius (470 m balanced / 330 m light).
- Palms, broadleaf trees and coastal rocks use instancing, shared geometry and sector LODs. Vegetation avoids buildings, roads and most paddy fields.
- Standard frustum culling plus conservative, multi-probe terrain occlusion for distant vegetation. Architecture uses merged material batches.
- Hemisphere light, one directional light and local 1,024² shadows. Light mode disables shadows and caps pixel ratio at 1. Balanced caps at 1.5.
- Procedural painted materials and a 1,024² landscape lookup drive grass, warm sand, damp tidelines, blue-grey cliff faces, paddy parcels, turquoise shallows and animated broken foam ribbons. Terrain and roads no longer request the legacy photographic texture atlases. The existing coastline is loaded from the 2.5 m baked signed-distance field.
- A shared 512² surface mask (1 MiB) records lowland moisture, paved-road wear, loose deposits below concave slopes, and footpath wear. Sheltered tidal margins receive muted mud; exposed beaches blend dry sand into damp sand at the waterline. Road verges and cliff bases receive restrained gravel, while slope exposure blends grass into soil and rock. Procedural grain, smooth normal relief and material roughness give these layers surface definition; fine detail fades with distance and pixel footprint. Dirt-path edges feather into the terrain and meet paved roads without painting across them. No extra terrain meshes or downloaded textures are needed for these layers.
- Analytic terrain / road collision and compact structure footprints avoid full triangle-mesh physics. Third-person camera collision shortens the camera arm at terrain and buildings.
- Vite produces a cacheable Three.js vendor chunk. The only optional external visual dependency is Google Fonts, with local font fallbacks.

## Coastal art direction

The existing geographic outlines, lagoons and channels are preserved. A cached geomorphic context distinguishes exposed sea headlands from sheltered channels, lagoon banks and small islands. Cliff shelves now fade out on sheltered shores, where lower grassy banks, narrow silty edges and calmer water replace the former uniform walls and surf bands. Alternating raised headlands and low coves still create grassy scarp tops, eroded cliff faces and sandy shelves on exposed coasts. Wider cliff setbacks soften triangular strips without changing the shoreline layout. The southeast mountain spreads into a broader coastal headland, with a near-level upper bench for eight buildings and a lower grassy apron before its cliffs. Rock faces use mineral seams, smooth lighting and warm top planes; grass uses broad painted variation instead of photographic micro-detail. Rock/grass coverage follows a wider terrain-slope sample, so material changes do not trace individual triangles. Lighting combines warm sun, cool sky fill and light coastal haze. Terrain lighting uses smooth height-field normals instead of triangle-face normals. Broad mountain envelopes, domain-warped secondary ridges and restrained fine noise share a bicubic height field with two constrained relaxation passes. Smoothing pins the shoreline and attenuates on steep scarps.

Dry road shoulders share their rendered embankment with the collision heightfield. Low estuary shoulders use a local road profile so neighbouring curve segments cannot build false ridges, while overlapping mountain switchbacks retain a broad blend. Road materials use a depth offset to avoid disappearing into terrain at nearly coplanar bridge approaches. The road deck remains walkable across low shore and water; deep water and steep cliffs still block walking. Regression tests cross a road in both directions at walking/running speeds and 30/60/120 FPS, alongside full-route surface checks and representative sheltered-bank slopes.

## Validation and scope

The desktop in-app browser was visually inspected in overview and ground-level modes. The responsive layout is checked at a mobile viewport. The automated world test covers every road at roughly one-metre traversal intervals, all road-network connections, the walkable approaches to all summit houses, all six spawns and the full heightfield for finite values. Mesh tests verify indexed topology, internal edge stitching, matching LOD boundary normals/heights/material weights, adaptive triangle counts and walking-height agreement on representative coastal and mountain sectors.

This is a playable browser prototype. Actual mobile hardware and a range of mid-range GPUs still need profiling; desktop preview frame rates are not a mobile performance guarantee. Architecture and vegetation are deliberately sparse and stylized. Terrain occlusion is conservative, streaming is procedural in-memory generation rather than network fetching, and LOD switches do not use geometric morphing. The ocean is a lightweight shader rather than a fluid simulation.

## Source

- `src/elevation.ts`: multi-scale mountain displacement, constrained relaxation and cubic height sampling.
- `src/terrain.ts`: adaptive terrain topology, shared normals, road network, traversal surfaces, landmarks and district anchors.
- `src/towns.ts`: level, accessible building plots and district-specific local stops.
- `src/surface.ts`: cached moisture, wear and slope-deposit masks shared by terrain and road materials.
- `src/materials.ts`: stylized terrain/road colour blends, fine relief and moisture-aware roughness.
- `src/world.ts`: terrain sectors, streaming, materials, instanced vegetation, architecture, harbour and avatar.
- `src/main.ts`: controls, collisions, cameras, atlas, discovery, audio and UI.
- `src/style.css`: desktop/mobile interface.
- `tests/world.mjs`: deterministic world integrity checks.
