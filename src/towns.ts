import {canTraverse,coastDistance,hillTownSites,landmarks,nearestRoad,random,surface,terrainHeight,towns} from './terrain.js';

export type TownBuilding={town:string;x:number;z:number;roadX:number;roadZ:number;heading:number;variant:number};
export type TownInterest={town:string;name:string;kind:'market'|'culture'|'view'|'water'|'civic'|'rural';x:number;z:number;spawnX:number;spawnZ:number};

// Small named districts follow the existing road graph. Candidate footprints
// are checked against the actual height field, then connected to a walkable
// road or trail by a short front path. Nothing is stamped into open water.
export const townBuildings:TownBuilding[]=[];
const reserved=[...landmarks.map(l=>({x:l.x,z:l.z,r:19})),
  ...hillTownSites.map(([x,z])=>({x,z,r:16})),
  ...[70,94,118,142].map(z=>({x:-420,z,r:15})),
  {x:47,z:815,r:19},{x:-584,z:-773,r:16},{x:-625,z:-58,r:22},{x:554,z:248,r:22}];
for(let townIndex=0;townIndex<towns.length;townIndex++){
  const town=towns[townIndex],rng=random(9021+townIndex*71),candidates:{x:number;z:number;roadX:number;roadZ:number;score:number;heading:number}[]=[];
  const grid=town.character==='highland'?4:5;
  for(let z=town.z-town.radius;z<=town.z+town.radius;z+=grid)for(let x=town.x-town.radius;x<=town.x+town.radius;x+=grid){
    const radial=Math.hypot(x-town.x,z-town.z);if(radial>town.radius)continue;
    const road=nearestRoad(x,z),minDistance=road.width/2+9;
    if(!Number.isFinite(road.distance)||road.distance<minDistance||road.distance>44)continue;
    if(coastDistance(x,z)<10||reserved.some(p=>Math.hypot(p.x-x,p.z-z)<p.r))continue;
    const h=terrainHeight(x,z);
    if(h<2||h>(town.character==='highland'?155:110))continue;
    const corners=[[-6,-6],[-6,6],[6,-6],[6,6]].map(([dx,dz])=>terrainHeight(x+dx,z+dz));
    const spread=Math.max(...corners)-Math.min(...corners);
    if(spread>(town.character==='highland'?2.4:2.15))continue;
    candidates.push({x,z,roadX:road.pointX,roadZ:road.pointZ,
      heading:Math.atan2(road.pointX-x,road.pointZ-z),
      score:spread*5+Math.abs(road.distance-23)*.15+radial*.025+(rng()-.5)*.85});
  }
  candidates.sort((a,b)=>a.score-b.score);
  const selected:typeof candidates=[];
  for(const candidate of candidates){
    if(selected.some(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)<17))continue;
    if(townBuildings.some(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)<17))continue;
    const span=Math.hypot(candidate.x-candidate.roadX,candidate.z-candidate.roadZ),steps=Math.ceil(span/1.3);
    let last=surface(candidate.roadX,candidate.roadZ),walkable=true;
    for(let i=1;i<=steps;i++){
      const t=i/steps,sx=candidate.roadX+(candidate.x-candidate.roadX)*t,sz=candidate.roadZ+(candidate.z-candidate.roadZ)*t;
      if(!canTraverse(sx,sz,last,span/steps)){walkable=false;break;}last=surface(sx,sz);
    }
    if(!walkable)continue;
    selected.push(candidate);if(selected.length>=town.target)break;
  }
  for(let i=0;i<selected.length;i++){
    const c=selected[i];townBuildings.push({...c,town:town.name,
      variant:i===0&&(town.character==='capital'||town.character==='market'||town.character==='port')?2:i%3===1?1:0});
  }
}

// Stops are attached to actual buildings and their approach paths, rather
// than arbitrary points on the minimap. The short descriptions are inspired
// by each district's landscape and craft, within this fictional scale.
const interestNames:Record<string,[string,TownInterest['kind']][]>={
  Kasaragod:[['Northern Fort Lookout','view'],['Coastal Trading Yard','market']],
  Kannur:[['Theyyam Courtyard','culture'],['Fishermen’s Exchange','water']],
  Wayanad:[['Western Ghats View','view'],['Spice Grove','rural'],['Highland Rest House','civic']],
  Kozhikode:[['Spice Bazaar','market'],['Sailors’ Court','water'],['Seafront Promenade','view']],
  Malappuram:[['Hill Market','market'],['Mappila Courtyard','culture']],
  Palakkad:[['Mountain Pass Gate','view'],['Paddy Commons','rural']],
  Thrissur:[['Festival Square','culture'],['Temple Street Market','market'],['Craft Courtyard','civic']],
  Kochi:[['Harbour Exchange','water'],['Old Trading Street','market'],['Ferry Court','civic']],
  Kottayam:[['Backwater Reading Room','civic'],['Rubber Grove Walk','rural']],
  Alappuzha:[['Canal Landing','water'],['Coir Workshop','market'],['Rice Field Walk','rural']],
  Pathanamthitta:[['Foothill Shrine','culture'],['Forest Gate','view']],
  Kollam:[['Cashew Market','market'],['Lakeside Court','water']],
  Thiruvananthapuram:[['Civic Square','civic'],['Coastal Gallery','culture'],['Lighthouse Walk','view']],
};
export const townInterests:TownInterest[]=towns.flatMap(town=>{
  const sites=townBuildings.filter(site=>site.town===town.name),specs=interestNames[town.name];
  return specs.map(([name,kind],i)=>{
    const site=sites[Math.round(i*(sites.length-1)/Math.max(1,specs.length-1))];
    const dx=site.roadX-site.x,dz=site.roadZ-site.z,length=Math.hypot(dx,dz)||1;
    const markerDistance=Math.min(length-2,Math.max(11,length*.7));
    return {town:town.name,name,kind,x:site.x+dx/length*markerDistance,z:site.z+dz/length*markerDistance,spawnX:site.roadX,spawnZ:site.roadZ};
  });
});
