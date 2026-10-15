import * as THREE from 'three';
import { random, terrainHeight } from './terrain';

export type ApartmentRegion = 'modern-indian' | 'kerala-dense' | 'mixed';
export type ApartmentTimeOfDay = 'day' | 'night';

export interface ApartmentSite {
  x: number;
  z: number;
  heading?: number;
  groundY?: number;
  floors?: number;
  seed?: number;
  id?: string;
  region?: Exclude<ApartmentRegion, 'mixed'>;
}

export interface ApartmentGenerationSettings {
  seed: number;
  region: ApartmentRegion;
  floorRange: readonly [number, number];
  widthRange: readonly [number, number];
  depthRange: readonly [number, number];
  windowDensity: number;
  balconyProbability: number;
  compoundWalls: boolean;
  parking: boolean;
  parkedVehicles: boolean;
  balconies: boolean;
  balconyLaundry: boolean;
  laundryLines: boolean;
  curtains: boolean;
  interiors: boolean;
  indoorPlants: boolean;
  outdoorPlants: boolean;
  windowLights: boolean;
  timeOfDay: ApartmentTimeOfDay;
}

export const DEFAULT_APARTMENT_SETTINGS: Readonly<ApartmentGenerationSettings> = {
  seed: 7132026,
  region: 'mixed',
  floorRange: [3, 6],
  widthRange: [13, 19],
  depthRange: [12, 17],
  windowDensity: 0.94,
  balconyProbability: 0.48,
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
  timeOfDay: 'day',
};

export interface ApartmentObstacle {
  x: number;
  z: number;
  rx: number;
  rz: number;
  top: number;
}

export interface ApartmentDistrict {
  group: THREE.Group;
  obstacles: ApartmentObstacle[];
  buildingCount: number;
  settings: ApartmentGenerationSettings;
  setTimeOfDay: (mode: ApartmentTimeOfDay) => void;
  dispose: () => void;
}

type MaterialKey =
  | 'wall' | 'accent' | 'trim' | 'roof' | 'metal' | 'wood' | 'glass' | 'room'
  | 'reflection' | 'glow' | 'concrete' | 'asphalt' | 'paint' | 'car'
  | 'rubber' | 'foliage' | 'pot';

interface InstanceData {
  matrix: THREE.Matrix4;
  color: THREE.Color;
  uvOffset?: [number, number];
  uvScale?: [number, number];
}

interface Bucket {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  instances: InstanceData[];
}

const palette = {
  modern: {
    wall: ['#e8e1d4', '#d7dfd6', '#e5d5bd', '#d8d4c8', '#e6e0d0'],
    accent: ['#718e83', '#a65e42', '#75889a', '#bd9862', '#74826f'],
    roof: ['#a9583c', '#757b72', '#b7794d'],
  },
  kerala: {
    wall: ['#e6d5ad', '#cad8c9', '#e6c5a7', '#dedbd0', '#d4c89c', '#c0d0cb'],
    accent: ['#a8583c', '#658777', '#c07c4c', '#8f7960', '#6f8d91'],
    roof: ['#a64f36', '#9d593b', '#876e56'],
  },
};

const carColors = ['#d9d2c0', '#657a79', '#a6533d', '#485f58', '#d5bd84', '#69727a'];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function choose<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function coordinateSeed(site: ApartmentSite, seed: number, index: number): number {
  if (site.seed !== undefined) return site.seed | 0;
  let value = seed | 0;
  value = Math.imul(value ^ Math.round(site.x * 10), 0x45d9f3b);
  value = Math.imul(value ^ Math.round(site.z * 10), 0x45d9f3b);
  value ^= index * 0x27d4eb2d;
  if (site.id) for (let i = 0; i < site.id.length; i++) value = Math.imul(value ^ site.id.charCodeAt(i), 0x45d9f3b);
  return value | 0;
}

function createRoomAtlas(seed: number, settings: ApartmentGenerationSettings): THREE.CanvasTexture {
  const size = 512, cells = 4, cell = size / cells;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the apartment window atlas.');
  const rng = random(seed ^ 0x41ac72);
  const walls = ['#d8c6a5', '#c7c9b7', '#d5bba2', '#c5cec6', '#d4cbb7', '#c1b8a5'];
  const curtains = ['#eee3cf', '#b59b7c', '#d3c5ad', '#8b9b8c', '#c8a883', '#d6d8cf'];
  const furniture = ['#70594a', '#90745e', '#6e7770', '#a17c60', '#63675f'];

  for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) {
    const x = col * cell, y = row * cell;
    ctx.fillStyle = choose(walls, rng);
    ctx.fillRect(x, y, cell, cell);
    if (settings.interiors) {
      // A distant ceiling, wall and floor establish a shallow room beyond the facade.
      ctx.fillStyle = '#b8a98e';
      ctx.fillRect(x + 5, y + 5, cell - 10, 6);
      ctx.fillStyle = choose(['#806b55', '#988068', '#6e746a'], rng);
      ctx.fillRect(x + 4, y + cell - 18, cell - 8, 14);
      ctx.fillStyle = choose(furniture, rng);
      const furnitureKind = Math.floor(rng() * 3);
      if (furnitureKind === 0) {
        ctx.fillRect(x + 16, y + 65, 42, 19);
        ctx.fillRect(x + 19, y + 58, 9, 12);
        ctx.fillRect(x + 47, y + 58, 9, 12);
      } else if (furnitureKind === 1) {
        ctx.fillRect(x + 20, y + 43, 36, 31);
        ctx.fillStyle = '#d6c6a8';
        ctx.fillRect(x + 23, y + 46, 30, 7);
      } else {
        ctx.fillRect(x + 17, y + 58, 45, 7);
        ctx.fillRect(x + 22, y + 43, 4, 17);
        ctx.fillRect(x + 54, y + 47, 4, 13);
      }
    }

    if (settings.curtains && rng() < 0.82) {
      ctx.fillStyle = choose(curtains, rng);
      const curtainWidth = 12 + Math.floor(rng() * 11);
      ctx.fillRect(x + 4, y + 9, curtainWidth, cell - 22);
      ctx.fillRect(x + cell - curtainWidth - 4, y + 9, curtainWidth, cell - 22);
      ctx.fillStyle = 'rgba(64, 54, 43, 0.14)';
      for (let fold = 0; fold < 3; fold++) {
        ctx.fillRect(x + 7 + fold * Math.max(2, curtainWidth / 3), y + 11, 1.5, cell - 26);
        ctx.fillRect(x + cell - curtainWidth - 2 + fold * Math.max(2, curtainWidth / 3), y + 11, 1.5, cell - 26);
      }
    }

    if (settings.indoorPlants && rng() < 0.36) {
      const px = x + 84, py = y + 80;
      ctx.fillStyle = '#876d54';
      ctx.fillRect(px - 5, py + 2, 10, 9);
      ctx.fillStyle = choose(['#52765a', '#617d55', '#74834f'], rng);
      ctx.fillRect(px - 2, py - 9, 4, 12);
      ctx.fillRect(px - 9, py - 5, 7, 4);
      ctx.fillRect(px + 3, py - 4, 7, 4);
    }

    // A fine inset line gives each atlas cell the appearance of a room behind glass.
    ctx.strokeStyle = 'rgba(41, 53, 48, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function windowAtlasUv(tile: number): { offset: [number, number]; scale: [number, number] } {
  const cells = 4, inset = 2.5 / 512, cell = 1 / cells;
  const col = tile % cells, rowFromBottom = cells - 1 - Math.floor(tile / cells);
  return {
    offset: [col * cell + inset, rowFromBottom * cell + inset],
    scale: [cell - inset * 2, cell - inset * 2],
  };
}

function makeRoomMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: texture,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 apartmentUvOffset;\nattribute vec2 apartmentUvScale;\nvarying vec3 apartmentViewPosition;',
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvMapUv = uv * apartmentUvScale + apartmentUvOffset;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\napartmentViewPosition = normalize(-mvPosition.xyz);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 apartmentViewPosition;')
      .replace(
        /texture2D\(\s*map\s*,\s*vMapUv\s*\)/,
        'texture2D( map, vMapUv + apartmentViewPosition.xy * 0.006 )',
      );
  };
  material.customProgramCacheKey = () => 'lokam-apartment-atlas-parallax-v1';
  return material;
}

/**
 * Creates a deterministic, instanced apartment district.
 * Sites are world-space building origins; Y is sampled from the game terrain unless groundY is supplied.
 */
export function createApartmentDistrict(
  sites: readonly ApartmentSite[],
  overrides: Partial<ApartmentGenerationSettings> = {},
): ApartmentDistrict {
  const settings: ApartmentGenerationSettings = {
    ...DEFAULT_APARTMENT_SETTINGS,
    ...overrides,
    floorRange: overrides.floorRange ?? DEFAULT_APARTMENT_SETTINGS.floorRange,
    widthRange: overrides.widthRange ?? DEFAULT_APARTMENT_SETTINGS.widthRange,
    depthRange: overrides.depthRange ?? DEFAULT_APARTMENT_SETTINGS.depthRange,
    windowDensity: clamp01(overrides.windowDensity ?? DEFAULT_APARTMENT_SETTINGS.windowDensity),
    balconyProbability: clamp01(overrides.balconyProbability ?? DEFAULT_APARTMENT_SETTINGS.balconyProbability),
  };

  const group = new THREE.Group();
  group.name = 'Procedural apartments — instanced';
  const obstacles: ApartmentObstacle[] = [];
  const resources = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const buckets = new Map<string, Bucket>();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const potGeometry = new THREE.CylinderGeometry(0.43, 0.30, 1, 7);
  const foliageGeometry = new THREE.IcosahedronGeometry(0.5, 0);
  const atlas = createRoomAtlas(settings.seed, settings);

  const baseMaterial = (color = '#ffffff', roughness = 0.86, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mat: Record<MaterialKey, THREE.Material> = {
    wall: baseMaterial(),
    accent: baseMaterial(),
    trim: baseMaterial('#ffffff', 0.62),
    roof: baseMaterial('#ffffff', 0.88),
    metal: baseMaterial('#ffffff', 0.48, 0.3),
    wood: baseMaterial('#ffffff', 0.88),
    glass: baseMaterial('#ffffff', 0.27, 0.14),
    room: makeRoomMaterial(atlas),
    reflection: new THREE.MeshBasicMaterial({ color: '#b9d2d0', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffd084', transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
    concrete: baseMaterial('#ffffff', 0.97),
    asphalt: baseMaterial('#ffffff', 0.96),
    paint: baseMaterial('#ffffff', 0.72),
    car: baseMaterial('#ffffff', 0.3, 0.12),
    rubber: baseMaterial('#ffffff', 0.97),
    foliage: baseMaterial('#ffffff', 0.9),
    pot: baseMaterial('#ffffff', 0.9),
  };
  Object.values(mat).forEach(material => materials.add(material));
  [boxGeometry, planeGeometry, cylinderGeometry, potGeometry, foliageGeometry].forEach(geometry => resources.add(geometry));

  const getBucket = (key: string, geometry: THREE.BufferGeometry, material: THREE.Material): Bucket => {
    let value = buckets.get(key);
    if (!value) {
      value = { key, geometry, material, instances: [] };
      buckets.set(key, value);
    }
    return value;
  };
  const put = (
    key: string,
    geometry: THREE.BufferGeometry,
    materialKey: MaterialKey,
    site: ApartmentSite,
    groundY: number,
    lx: number, ly: number, lz: number,
    sx: number, sy: number, sz: number,
    color: string,
    localYaw = 0,
    uv?: { offset: [number, number]; scale: [number, number] },
    localRotation?: THREE.Quaternion,
  ) => {
    const yaw = site.heading ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const position = new THREE.Vector3(site.x + lx * c + lz * s, groundY + ly, site.z - lx * s + lz * c);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + localYaw);
    if (localRotation) rotation.multiply(localRotation);
    const matrix = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(sx, sy, sz));
    const isPlane = geometry === planeGeometry;
    const bucket = getBucket(`${isPlane ? 'plane' : geometry === boxGeometry ? 'box' : geometry === foliageGeometry ? 'foliage' : 'cylinder'}-${materialKey}`, geometry, mat[materialKey]);
    bucket.instances.push({
      matrix,
      color: new THREE.Color(color),
      ...(uv ? { uvOffset: uv.offset, uvScale: uv.scale } : {}),
    });
  };
  const box = (
    site: ApartmentSite, groundY: number, materialKey: MaterialKey, color: string,
    x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0,
  ) => put(materialKey, boxGeometry, materialKey, site, groundY, x, y, z, w, h, d, color, yaw);
  const plane = (
    site: ApartmentSite, groundY: number, materialKey: MaterialKey, color: string,
    x: number, y: number, z: number, w: number, h: number, yaw: number,
    uv?: { offset: [number, number]; scale: [number, number] },
  ) => put(materialKey, planeGeometry, materialKey, site, groundY, x, y, z, w, h, 1, color, yaw, uv);
  const cylinder = (
    site: ApartmentSite, groundY: number, materialKey: MaterialKey, color: string,
    x: number, y: number, z: number, w: number, h: number, d: number,
    geometry = cylinderGeometry, localRotation?: THREE.Quaternion,
  ) => put(materialKey, geometry, materialKey, site, groundY, x, y, z, w, h, d, color, 0, undefined, localRotation);

  const addObstacle = (site: ApartmentSite, groundY: number, lx: number, lz: number, halfW: number, halfD: number, top: number) => {
    const yaw = site.heading ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
    obstacles.push({
      x: site.x + lx * c + lz * s,
      z: site.z - lx * s + lz * c,
      rx: Math.abs(c) * halfW + Math.abs(s) * halfD + 0.15,
      rz: Math.abs(s) * halfW + Math.abs(c) * halfD + 0.15,
      top: groundY + top,
    });
  };

  const addPottedPlant = (site: ApartmentSite, groundY: number, x: number, y: number, z: number, rng: () => number, scale = 1) => {
    const potColor = choose(['#a85e42', '#826b55', '#b3a181'], rng);
    cylinder(site, groundY, 'pot', potColor, x, y + 0.3 * scale, z, 0.48 * scale, 0.6 * scale, 0.48 * scale, potGeometry);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + rng() * 0.3;
      const leafColor = choose(['#547653', '#6f865c', '#456a56'], rng);
      put(
        `foliage-plant`, foliageGeometry, 'foliage', site, groundY,
        x + Math.cos(angle) * 0.12 * scale, y + (0.78 + rng() * 0.16) * scale, z + Math.sin(angle) * 0.12 * scale,
        0.18 * scale, 0.42 * scale, 0.18 * scale, leafColor,
      );
    }
  };

  const addVehicle = (site: ApartmentSite, groundY: number, x: number, z: number, color: string, heading: number) => {
    const y = 0.13;
    box(site, groundY, 'car', color, x, y + 0.45, z, 1.85, 0.72, 4.25, heading);
    box(site, groundY, 'glass', '#8fa5a3', x, y + 0.98, z - 0.12, 1.48, 0.58, 2.25, heading);
    box(site, groundY, 'car', color, x, y + 0.69, z - 0.2, 1.53, 0.12, 2.18, heading);
    const wheelRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      cylinder(site, groundY, 'rubber', '#252824', x + side * 0.91, y + 0.34, z + end * 1.35, 0.62, 0.28, 0.62, cylinderGeometry, wheelRotation);
    }
    box(site, groundY, 'paint', '#f1e6c6', x - 0.55, y + 0.43, z + 2.14, 0.26, 0.12, 0.06, heading);
    box(site, groundY, 'paint', '#f1e6c6', x + 0.55, y + 0.43, z + 2.14, 0.26, 0.12, 0.06, heading);
    addObstacle(site, groundY, x, z, 1.1, 2.35, 1.7);
  };

  const makeBalcony = (
    site: ApartmentSite, groundY: number, rng: () => number,
    face: 'front' | 'back' | 'right' | 'left',
    wx: number, wz: number, floorBase: number, width: number,
    region: Exclude<ApartmentRegion, 'mixed'>,
  ) => {
    const normal = face === 'front' ? [0, 1] : face === 'back' ? [0, -1] : face === 'right' ? [1, 0] : [-1, 0];
    const front = face === 'front' || face === 'back';
    const balWidth = Math.min(width + 0.38, front ? 3.05 : 2.5);
    const balDepth = 1.12;
    const cx = wx + normal[0] * 0.72, cz = wz + normal[1] * 0.72;
    const slabY = floorBase + 0.22;
    const longSide = front
      ? { x: cx, z: cz + normal[1] * (balDepth / 2), w: balWidth, d: 0.10 }
      : { x: cx + normal[0] * (balDepth / 2), z: cz, w: 0.10, d: balWidth };
    box(site, groundY, 'concrete', region === 'kerala-dense' ? '#c5bba8' : '#cfd0c8', cx, slabY, cz, front ? balWidth : balDepth, 0.2, front ? balDepth : balWidth);
    box(site, groundY, 'metal', region === 'kerala-dense' ? '#e8dfca' : '#dce3db', longSide.x, slabY + 0.56, longSide.z, longSide.w, 0.82, longSide.d);
    box(site, groundY, 'trim', '#f1eadc', longSide.x, slabY + 1.0, longSide.z, longSide.w, 0.09, longSide.d);
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5 - 0.5;
      const bx = front ? cx + t * balWidth : longSide.x;
      const bz = front ? longSide.z : cz + t * balWidth;
      box(site, groundY, 'metal', '#e6e0d2', bx, slabY + 0.52, bz, front ? 0.055 : 0.09, 0.78, front ? 0.09 : 0.055);
    }
    if (settings.outdoorPlants && rng() < 0.54) {
      const along = (rng() - 0.5) * balWidth * 0.68;
      addPottedPlant(site, groundY, front ? cx + along : cx + normal[0] * 0.42, slabY + 0.10, front ? cz + normal[1] * 0.42 : cz + along, rng, 0.72);
    }
    if (settings.balconyLaundry && rng() < 0.34) {
      const lineY = slabY + 1.07;
      if (front) {
        box(site, groundY, 'metal', '#77766a', cx, lineY, cz + normal[1] * 0.38, balWidth * 0.72, 0.025, 0.025);
        const count = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const lx = cx + (i - (count - 1) / 2) * 0.42;
          box(site, groundY, 'wood', choose(['#a35c48', '#d0ae72', '#718a82', '#b7b9ac', '#718396'], rng), lx, lineY - 0.38, cz + normal[1] * 0.40, 0.34, 0.68 + rng() * 0.18, 0.035);
        }
      } else {
        box(site, groundY, 'metal', '#77766a', cx + normal[0] * 0.38, lineY, cz, 0.025, 0.025, balWidth * 0.72);
        const count = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const lz = cz + (i - (count - 1) / 2) * 0.42;
          box(site, groundY, 'wood', choose(['#a35c48', '#d0ae72', '#718a82', '#b7b9ac', '#718396'], rng), cx + normal[0] * 0.40, lineY - 0.38, lz, 0.035, 0.68 + rng() * 0.18, 0.34);
        }
      }
    }
  };

  const addApartment = (site: ApartmentSite, index: number) => {
    const rng = random(coordinateSeed(site, settings.seed, index));
    const region = site.region ?? (settings.region === 'mixed'
      ? (rng() < 0.55 ? 'kerala-dense' : 'modern-indian')
      : settings.region);
    const colors = region === 'kerala-dense' ? palette.kerala : palette.modern;
    const minFloors = Math.max(2, Math.min(10, Math.floor(settings.floorRange[0])));
    const maxFloors = Math.max(minFloors, Math.min(10, Math.floor(settings.floorRange[1])));
    const floors = Math.max(2, Math.min(10, site.floors ?? minFloors + Math.floor(rng() * (maxFloors - minFloors + 1))));
    const width = settings.widthRange[0] + rng() * Math.max(0, settings.widthRange[1] - settings.widthRange[0]);
    const depth = settings.depthRange[0] + rng() * Math.max(0, settings.depthRange[1] - settings.depthRange[0]);
    const floorHeight = region === 'kerala-dense' ? 3.0 : 3.12;
    const buildingHeight = floors * floorHeight + 0.75;
    const wall = choose(colors.wall, rng), accent = choose(colors.accent, rng), roof = choose(colors.roof, rng);
    const trim = region === 'kerala-dense' ? '#e9dfc9' : '#f4eee1';
    const groundY = site.groundY ?? terrainHeight(site.x, site.z);

    // One low-poly shell and repeated floor bands keep the structural draw cost small.
    box(site, groundY, 'concrete', '#928f82', 0, 0.20, 0, width + 0.8, 0.4, depth + 0.8);
    box(site, groundY, 'wall', wall, 0, buildingHeight / 2, 0, width, buildingHeight, depth);
    for (let floor = 1; floor < floors; floor++) {
      const y = floor * floorHeight;
      box(site, groundY, 'trim', trim, 0, y, 0, width + 0.12, 0.10, depth + 0.12);
    }

    // Facade arrays are generated once and drawn with an atlas-backed instanced mesh.
    const columnsX = Math.max(3, Math.min(6, Math.floor(width / 3.1)));
    const columnsZ = Math.max(2, Math.min(5, Math.floor(depth / 3.1)));
    const facades: { face: 'front' | 'back' | 'right' | 'left'; columns: number; step: number; yaw: number }[] = [
      { face: 'front', columns: columnsX, step: width / columnsX, yaw: 0 },
      { face: 'back', columns: columnsX, step: width / columnsX, yaw: Math.PI },
      { face: 'right', columns: columnsZ, step: depth / columnsZ, yaw: Math.PI / 2 },
      { face: 'left', columns: columnsZ, step: depth / columnsZ, yaw: -Math.PI / 2 },
    ];

    for (let floor = 0; floor < floors; floor++) {
      const floorBase = floor * floorHeight;
      const windowY = floorBase + (floor === 0 ? 1.85 : 1.68);
      for (const facade of facades) {
        for (let col = 0; col < facade.columns; col++) {
          if (floor === 0 && facade.face === 'front' && col === Math.floor(facade.columns / 2)) continue;
          if (rng() > settings.windowDensity) continue;
          const along = (col - (facade.columns - 1) / 2) * facade.step;
          const windowWidth = Math.min(1.7, facade.step * 0.62) * (0.9 + rng() * 0.16);
          const windowHeight = floor === 0 ? 1.55 : 1.58;
          let wx = 0, wz = 0, nx = 0, nz = 0;
          if (facade.face === 'front' || facade.face === 'back') {
            wx = along;
            nz = facade.face === 'front' ? 1 : -1;
            wz = nz * (depth / 2 + 0.035);
          } else {
            wz = along;
            nx = facade.face === 'right' ? 1 : -1;
            wx = nx * (width / 2 + 0.035);
          }
          const tile = Math.floor(rng() * 16);
          const uv = windowAtlasUv(tile);
          plane(site, groundY, 'room', '#ffffff', wx, windowY, wz, windowWidth, windowHeight, facade.yaw, uv);
          plane(site, groundY, 'reflection', '#ffffff', wx + nx * 0.025, windowY, wz + nz * 0.025, windowWidth * 0.97, windowHeight * 0.96, facade.yaw);
          const frameY = windowY;
          const frameDepth = facade.face === 'front' || facade.face === 'back' ? depth / 2 + 0.10 : width / 2 + 0.10;
          const frameX = facade.face === 'front' || facade.face === 'back' ? wx : nx * frameDepth;
          const frameZ = facade.face === 'front' || facade.face === 'back' ? nz * frameDepth : wz;
          const verticalFrameOffsetX = facade.face === 'front' || facade.face === 'back' ? windowWidth / 2 : 0;
          const verticalFrameOffsetZ = facade.face === 'front' || facade.face === 'back' ? 0 : windowWidth / 2;
          box(site, groundY, 'trim', trim, frameX - verticalFrameOffsetX, frameY, frameZ - verticalFrameOffsetZ, 0.075, windowHeight + 0.15, 0.08, facade.yaw);
          box(site, groundY, 'trim', trim, frameX + verticalFrameOffsetX, frameY, frameZ + verticalFrameOffsetZ, 0.075, windowHeight + 0.15, 0.08, facade.yaw);
          box(site, groundY, 'trim', trim, frameX, frameY + windowHeight / 2, frameZ, windowWidth + 0.15, 0.075, 0.08, facade.yaw);
          box(site, groundY, 'trim', trim, frameX, frameY - windowHeight / 2, frameZ, windowWidth + 0.15, 0.075, 0.08, facade.yaw);
          box(site, groundY, 'metal', '#88918a', frameX, frameY, frameZ + (nz || 0) * 0.035, 0.045, windowHeight, 0.035, facade.yaw);
          box(site, groundY, 'concrete', '#c7c1b1', frameX + nx * 0.015, frameY - windowHeight / 2 - 0.10, frameZ + nz * 0.015, windowWidth + 0.32, 0.13, 0.28, facade.yaw);
          if (region === 'kerala-dense' && rng() < 0.78) {
            box(
              site, groundY, 'roof', roof,
              frameX + nx * 0.08, frameY + windowHeight / 2 + 0.14, frameZ + nz * 0.08,
              windowWidth + 0.32, 0.12, 0.46, facade.yaw,
            );
          }

          if (settings.windowLights && rng() < 0.34) {
            const glowX = wx + (rng() - 0.5) * windowWidth * 0.42 + nx * 0.04;
            const glowZ = wz + (rng() - 0.5) * 0.08 + nz * 0.04;
            plane(site, groundY, 'glow', '#ffffff', glowX, windowY + windowHeight * (rng() - 0.5) * 0.5, glowZ, 0.13, 0.17, facade.yaw);
          }

          const balconyFace = facade.face === 'front' || facade.face === 'back';
          const balconyEligible = floor > 0 && (balconyFace || rng() < 0.32);
          if (settings.balconies && balconyEligible && rng() < settings.balconyProbability) {
            makeBalcony(site, groundY, rng, facade.face, wx, wz, floorBase, windowWidth, region);
          }
        }
      }
    }

    // A clear central entrance replaces the middle ground-floor window.
    const entryZ = depth / 2 + 0.085;
    box(site, groundY, 'wood', '#493c31', 0, 1.18, entryZ, 1.35, 2.30, 0.11);
    box(site, groundY, 'trim', trim, -0.74, 1.20, entryZ + 0.045, 0.12, 2.52, 0.12);
    box(site, groundY, 'trim', trim, 0.74, 1.20, entryZ + 0.045, 0.12, 2.52, 0.12);
    box(site, groundY, 'trim', trim, 0, 2.48, entryZ + 0.045, 1.6, 0.12, 0.12);
    cylinder(site, groundY, 'metal', '#c3a56c', 0.48, 1.16, entryZ + 0.12, 0.08, 0.12, 0.08);

    // Roof coping, modest stair headroom and the rooftop water tank common to Indian apartments.
    const roofY = floors * floorHeight;
    box(site, groundY, 'trim', trim, 0, roofY + 0.34, depth / 2, width + 0.35, 0.58, 0.28);
    box(site, groundY, 'trim', trim, 0, roofY + 0.34, -depth / 2, width + 0.35, 0.58, 0.28);
    box(site, groundY, 'trim', trim, width / 2, roofY + 0.34, 0, 0.28, 0.58, depth);
    box(site, groundY, 'trim', trim, -width / 2, roofY + 0.34, 0, 0.28, 0.58, depth);
    const stairX = region === 'kerala-dense' ? -width * 0.30 : width * 0.28;
    box(site, groundY, 'accent', accent, stairX, roofY + 1.1, -depth * 0.18, width * 0.22, 1.7, depth * 0.3);
    box(site, groundY, 'roof', roof, stairX, roofY + 2.0, -depth * 0.18, width * 0.27, 0.22, depth * 0.35);
    cylinder(site, groundY, 'glass', '#9caead', width * 0.22, roofY + 0.98, depth * 0.2, 1.3, 1.9, 1.3, potGeometry);
    box(site, groundY, 'metal', '#87918a', width * 0.22, roofY + 1.98, depth * 0.2, 1.38, 0.08, 1.38);

    if (settings.outdoorPlants) {
      addPottedPlant(site, groundY, -width * 0.34, 0.42, depth / 2 + 0.5, rng, 0.9);
      addPottedPlant(site, groundY, width * 0.34, 0.42, depth / 2 + 0.5, rng, 0.9);
    }

    if (settings.parking) {
      const parkingZ = depth / 2 + 2.1;
      box(site, groundY, 'asphalt', '#77766c', 0, 0.035, parkingZ, 8.1, 0.07, 5.4);
      box(site, groundY, 'paint', '#d9d4c1', -3.7, 0.075, parkingZ, 0.08, 0.035, 4.7);
      box(site, groundY, 'paint', '#d9d4c1', 3.7, 0.075, parkingZ, 0.08, 0.035, 4.7);
      if (settings.parkedVehicles && rng() < 0.76) {
        addVehicle(site, groundY, (rng() - 0.5) * 1.2, parkingZ + (rng() - 0.5) * 0.55, choose(carColors, rng), 0);
      }
    }

    if (settings.laundryLines && rng() < 0.62) {
      const lineZ = depth / 2 + 3.45, poleHeight = 2.05;
      box(site, groundY, 'metal', '#8b8779', -2.2, poleHeight / 2, lineZ, 0.07, poleHeight, 0.07);
      box(site, groundY, 'metal', '#8b8779', 2.2, poleHeight / 2, lineZ, 0.07, poleHeight, 0.07);
      box(site, groundY, 'metal', '#77766a', 0, poleHeight, lineZ, 4.4, 0.025, 0.025);
      for (let i = 0; i < 4; i++) {
        const lx = -1.5 + i * 1.0;
        box(site, groundY, 'wood', choose(['#b35d47', '#d1ae6e', '#728a83', '#ddd4c2', '#7b8690'], rng), lx, poleHeight - 0.38, lineZ, 0.65, 0.68 + rng() * 0.20, 0.035);
      }
    }

    if (settings.compoundWalls) {
      const compoundW = width + 8, compoundD = depth + 9, wallH = 1.35, gateW = 4.5;
      const frontZ = depth / 2 + 4.5, backZ = -depth / 2 - 4.5;
      const segmentW = (compoundW - gateW) / 2;
      for (const side of [-1, 1]) {
        const x = side * (gateW / 2 + segmentW / 2);
        box(site, groundY, 'concrete', '#c5bca8', x, wallH / 2, frontZ, segmentW, wallH, 0.22);
        addObstacle(site, groundY, x, frontZ, segmentW / 2, 0.22, wallH);
      }
      box(site, groundY, 'concrete', '#c5bca8', 0, wallH / 2, backZ, compoundW, wallH, 0.22);
      addObstacle(site, groundY, 0, backZ, compoundW / 2, 0.22, wallH);
      for (const side of [-1, 1]) {
        const x = side * compoundW / 2;
        box(site, groundY, 'concrete', '#c5bca8', x, wallH / 2, 0, 0.22, wallH, compoundD);
        addObstacle(site, groundY, x, 0, 0.22, compoundD / 2, wallH);
      }
      for (const side of [-1, 1]) {
        const gx = side * gateW / 2;
        box(site, groundY, 'concrete', '#a99c83', gx, 1.2, frontZ, 0.26, 2.4, 0.30);
      }
      for (let i = 0; i < 7; i++) {
        const gx = -gateW / 2 + (i + 0.5) * gateW / 7;
        box(site, groundY, 'metal', '#65736b', gx, 0.72, frontZ, 0.065, 1.08, 0.08);
      }
      box(site, groundY, 'metal', '#65736b', 0, 1.24, frontZ, gateW, 0.08, 0.08);
      if (settings.outdoorPlants) {
        addPottedPlant(site, groundY, -compoundW / 2 + 0.9, 0, frontZ - 0.8, rng, 0.9);
        addPottedPlant(site, groundY, compoundW / 2 - 0.9, 0, frontZ - 0.8, rng, 0.9);
      }
    }

    // A conservative building footprint keeps the game's existing analytic collision simple.
    addObstacle(site, groundY, 0, 0, Math.hypot(width / 2, depth / 2), Math.hypot(width / 2, depth / 2), buildingHeight);
  };

  sites.forEach(addApartment);

  const geometryResources = new Set(resources);
  let nightGlowMesh: THREE.InstancedMesh | null = null;
  for (const bucket of buckets.values()) {
    const geometry = bucket.key === 'plane-room' ? bucket.geometry.clone() : bucket.geometry;
    if (geometry !== bucket.geometry) geometryResources.add(geometry);
    const instances = bucket.instances;
    if (bucket.key === 'plane-room') {
      const offsets = new Float32Array(instances.length * 2);
      const scales = new Float32Array(instances.length * 2);
      instances.forEach((entry, i) => {
        offsets.set(entry.uvOffset ?? [0, 0], i * 2);
        scales.set(entry.uvScale ?? [1, 1], i * 2);
      });
      geometry.setAttribute('apartmentUvOffset', new THREE.InstancedBufferAttribute(offsets, 2));
      geometry.setAttribute('apartmentUvScale', new THREE.InstancedBufferAttribute(scales, 2));
    }
    const mesh = new THREE.InstancedMesh(geometry, bucket.material, instances.length);
    mesh.name = bucket.key.replace('-', ' ');
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    instances.forEach((entry, i) => {
      mesh.setMatrixAt(i, entry.matrix);
      mesh.setColorAt(i, entry.color);
    });
    mesh.castShadow = bucket.key.startsWith('box-') && !bucket.key.includes('glow');
    mesh.receiveShadow = bucket.key.startsWith('box-') || bucket.key === 'plane-room';
    mesh.computeBoundingSphere();
    if (bucket.key === 'plane-glow') {
      mesh.visible = settings.timeOfDay === 'night' && settings.windowLights;
      mesh.renderOrder = 2;
      nightGlowMesh = mesh;
    } else if (bucket.key === 'plane-reflection') {
      mesh.renderOrder = 1;
    }
    group.add(mesh);
  }

  const roomMaterial = mat.room as THREE.MeshStandardMaterial;
  const setTimeOfDay = (mode: ApartmentTimeOfDay) => {
    settings.timeOfDay = mode;
    roomMaterial.color.set(mode === 'night' ? '#89918e' : '#ffffff');
    if (nightGlowMesh) nightGlowMesh.visible = mode === 'night' && settings.windowLights;
  };
  setTimeOfDay(settings.timeOfDay);
  group.userData.apartmentSettings = settings;
  group.userData.setTimeOfDay = setTimeOfDay;

  return {
    group,
    obstacles,
    buildingCount: sites.length,
    settings,
    setTimeOfDay,
    dispose: () => {
      group.clear();
      geometryResources.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      atlas.dispose();
    },
  };
}
