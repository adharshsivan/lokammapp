# Procedural apartment generator

`src/apartments.ts` adds a self-contained, deterministic Three.js generator for low-poly Indian apartment districts. It is already wired into the settlement pass in `src/world.ts`; the game continues to own its scene, camera, controls, global lights, terrain, and streaming.

## What it generates

- Modern Indian and dense Kerala apartment styles, with variable footprints, 2–10 floors, facade colors, and window grids.
- An atlas of randomized room interiors with curtains, furniture silhouettes, and occasional indoor plants. Recessed room planes, frame depth, reflective panes, and a small view-dependent UV offset create a fake-parallax window effect.
- Optional balconies, hanging laundry, compound walls and gate, a parking pad, parked low-poly cars, and potted plants.
- Day/night window appearance through the returned `setTimeOfDay()` method. It changes only the apartment window materials and does not alter the game's lighting system.
- Batched `InstancedMesh` components and a small set of shared materials. No generated trees or people.

## Tune the generated district

Edit the options passed to `createApartmentDistrict()` in `src/world.ts`:

```ts
this.apartments = createApartmentDistrict(apartmentSites, {
  seed: 94133,
  region: 'mixed',                 // 'modern-indian' | 'kerala-dense' | 'mixed'
  floorRange: [3, 6],
  widthRange: [13, 19],
  depthRange: [12, 17],
  windowDensity: 0.94,             // 0–1
  balconyProbability: 0.48,        // 0–1
  compoundWalls: false,
  parking: true,
  parkedVehicles: true,
  balconies: true,
  balconyLaundry: true,
  laundryLines: true,
  curtains: true,
  interiors: true,
  indoorPlants: true,
  outdoorPlants: true,
  windowLights: true,
  timeOfDay: 'day',                // 'day' | 'night'
});
```

The current integration supplies existing town-building sites so apartments sit on terrain already checked for slope, water, and road access. `groundY` can be supplied per site when integrating with a different height field; otherwise the generator uses this game's `terrainHeight()`. Each site can override `region`, `floors`, `seed`, and `heading`. Reusing the same site list and seed reproduces the same buildings and details.

## Use the module in another scene

```ts
import { createApartmentDistrict } from './apartments';

const district = createApartmentDistrict(
  [{ id: 'market-block-01', x: 30, z: -12, groundY: 0, heading: Math.PI / 2, region: 'kerala-dense' }],
  { seed: 24, floorRange: [4, 6], compoundWalls: true },
);
scene.add(district.group);
collisionObstacles.push(...district.obstacles);

district.setTimeOfDay('night'); // or 'day'
// When removing the district:
scene.remove(district.group);
district.dispose();
```

In Lokam's existing runtime, a day/night mode can call
`window.__malabar.apartments.setTimeOfDay('night')` or `'day'`. To turn on compound walls in this world, set `compoundWalls: true` in the settlement integration options; use plots with extra clearance around the apartment and its gate.

## Defaults and performance

`DEFAULT_APARTMENT_SETTINGS` is the standalone starting configuration. The game uses nine urban town districts, with twelve selected apartment sites after adding extra blocks in its three largest urban areas; buildings have 3–6 floors, mixed regional styles, atlas-backed windows, and instanced/batched geometry. Compounds are off in the game defaults to preserve clearance beside existing narrow streets; parking, vehicles, balconies, laundry, and potted plants are on. The generator returns collision footprints for buildings and enabled compound walls/gates and can be disposed without changing the rest of the world.
