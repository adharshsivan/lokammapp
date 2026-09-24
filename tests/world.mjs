import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Exercise the same quantized coastline used in the browser, rather than
// rebuilding a slightly different unquantized coastline for this test.
const coast=await readFile(new URL('../public/world/coast-v2.bin',import.meta.url));
const originalFetch=globalThis.fetch;globalThis.window={};
globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>coast.buffer.slice(coast.byteOffset,coast.byteOffset+coast.byteLength)});
const {SIZE,SECTOR,roads,landmarks,hillTownSites,towns,nearestRoad,terrainHeight,surface,rawHeight,groundHeight,coastDistance,canTraverse,terrainGeometry}=await import('../.qa/terrain.js');
const {townBuildings,townInterests}=await import('../.qa/towns.js');
const {shelteredShore,tidalShelter}=await import('../.qa/geography.js');
delete globalThis.window;globalThis.fetch=originalFetch;
assert.equal(SIZE*SIZE,4_000_000);
assert.equal((SIZE/SECTOR)**2,64);
assert.equal(towns.length,13,'The repeated Kollam request should produce one named town');
assert.equal(towns[0].name,'Kasaragod');assert.equal(towns.at(-1).name,'Thiruvananthapuram');
for(let i=1;i<towns.length;i++)assert.ok(towns[i-1].z<towns[i].z,`${towns[i].name} is out of north-to-south order`);
const named=new Map(towns.map(t=>[t.name,t]));
assert.ok(named.get('Kasaragod').z<named.get('Kannur').z&&named.get('Kannur').z<named.get('Kozhikode').z&&named.get('Kozhikode').z<named.get('Kochi').z&&named.get('Kochi').z<named.get('Alappuzha').z&&named.get('Alappuzha').z<named.get('Kollam').z&&named.get('Kollam').z<named.get('Thiruvananthapuram').z,'Coastal towns must run north to south');
assert.ok(named.get('Wayanad').z<named.get('Kozhikode').z&&named.get('Wayanad').z<named.get('Thiruvananthapuram').z&&named.get('Wayanad').x>named.get('Kozhikode').x,'Wayanad must sit in the northern inland highlands');
const townCounts=Object.fromEntries(towns.map(t=>[t.name,townBuildings.filter(b=>b.town===t.name).length]));
console.log(JSON.stringify({townCounts}));
for(const [name,count] of Object.entries(townCounts))assert.ok(count>=3,`${name} has only ${count} accessible buildings`);
for(const town of towns){const stops=townInterests.filter(p=>p.town===town.name);assert.ok(stops.length>=2&&stops.length<=3,`${town.name} needs two or three points of interest`);for(const stop of stops){assert.ok(Math.hypot(stop.x-town.x,stop.z-town.z)<town.radius+15,`${stop.name} is outside ${town.name}`);assert.ok(surface(stop.x,stop.z)>1&&coastDistance(stop.x,stop.z)>8,`${stop.name} is not on dry land`);}}
assert.equal(new Set(townInterests.map(p=>p.name)).size,townInterests.length,'Town stops need distinct names');
const coastalRoad=roads.find(r=>r.id==='Coastal village road');assert.ok(coastalRoad.path[0].z<towns[0].z+60&&coastalRoad.path.at(-1).z>towns.at(-1).z-60,'Coastal road must link the northern and southern districts');
assert.ok(Math.abs(nearestRoad(520,-480).height-rawHeight(520,-480))<7,'Wayanad approach must not pull the eastern highway uphill');
for(const [x,z] of [[190,860],[240,830],[180,730]]){
  const slope=Math.hypot((rawHeight(x+5,z)-rawHeight(x-5,z))/10,(rawHeight(x,z+5)-rawHeight(x,z-5))/10);
  assert.ok(shelteredShore(x,z)>.9&&rawHeight(x,z)<6&&slope<.25,`Sheltered bank at ${x},${z} became a cliff`);
}
assert.ok(terrainHeight(790,735)>terrainHeight(620,500)+65,'Hill town must remain well above the coastal through-road');
const townRoads=roads.filter(r=>r.id==='Southern summit road'||r.id.startsWith('Hilltop')).flatMap(r=>r.path);
for(const [tx,tz] of hillTownSites){
  const start=townRoads.reduce((a,b)=>Math.hypot(b.x-tx,b.z-tz)<Math.hypot(a.x-tx,a.z-tz)?b:a);
  const heights=[[-5,-5],[-5,5],[5,-5],[5,5]].map(([dx,dz])=>terrainHeight(tx+dx,tz+dz));
  assert.ok(Math.max(...heights)-Math.min(...heights)<1.3,`Hill town house at ${tx},${tz} is not on level ground`);
  const distance=Math.hypot(start.x-tx,start.z-tz),count=Math.ceil(distance/.15);
  let old=surface(start.x,start.z);
  for(let i=1;i<=count;i++){const t=i/count,x=start.x+(tx-start.x)*t,z=start.z+(tz-start.z)*t;
    assert.ok(canTraverse(x,z,old,distance/count),`Hill town house at ${tx},${tz} is inaccessible from a town street`);old=surface(x,z);
  }
}
let maximumGrade=0,underwaterDecks=0;
for(const r of roads) {
  for(let i=1;i<r.path.length;i++) {
    const a=r.path[i-1],b=r.path[i],grade=Math.abs(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z);
    maximumGrade=Math.max(maximumGrade,grade);
    assert.ok(grade<=(r.trail?.251:r.id==='Southern summit road'?.201:.101),`${r.id} grade ${grade}`);
    assert.ok(Math.abs(b.x)<=1000&&Math.abs(b.z)<=1000,`${r.id} outside boundary`);
    if(rawHeight(b.x,b.z)<0){underwaterDecks++;assert.ok(b.y>=7,'Insufficient bridge clearance');}
    // Traverse each centreline at one-metre intervals and detect mismatched junctions.
    const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.ceil(length);let last=surface(a.x,a.z);
    for(let j=1;j<=n;j++){const t=j/n,h=surface(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);assert.ok(Math.abs(h-last)<.6,`${r.id} surface discontinuity ${Math.abs(h-last).toFixed(2)}m at ${b.x},${b.z}`);last=h;}
  }
  // Check the road lip at sub-step resolution: an instantaneous ledge above
  // the walking controller's 0.16 m step allowance strands the player.
  for(let i=1;!r.trail&&i<r.path.length;i+=12){
    const a=r.path[i-1],b=r.path[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l;
    for(const side of [-1,1]){const edge=r.width/2;let previous=surface(a.x+nx*side*(edge-.08),a.z+nz*side*(edge-.08));for(let dist=0;dist<=2.01;dist+=.08){const x=a.x+nx*side*(edge+dist),z=a.z+nz*side*(edge+dist);if(coastDistance(x,z)>20&&Math.abs(x)<990&&Math.abs(z)<990){const h=surface(x,z);assert.ok(Math.abs(h-previous)<.15,`${r.id} has a blocking road lip: ${Math.abs(h-previous).toFixed(2)}m over 8 cm at ${x},${z} (coast ${coastDistance(x,z)})`);previous=h;}}}
  }
}
// Walk and run off a paved road and back at common frame rates. These dry,
// open lighthouse shoulders reproduce the original invisible road-edge wall.
let crossings=0;
for(const fps of [30,60,120])for(const speed of [3.8,9])for(const side of [-1,1]){
  const r=roads[0],a=r.path[r.path.length-15],b=r.path[r.path.length-14];
  const len=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/len*side,nz=-(b.x-a.x)/len*side;
  for(const reverse of [false,true]){
    const length=r.width/2+12,n=Math.ceil(length/(speed/fps));
    let old=surface(a.x+nx*(reverse?length:0),a.z+nz*(reverse?length:0));
    for(let i=1;i<=n;i++){
      const d=length*(reverse?1-i/n:i/n),x=a.x+nx*d,z=a.z+nz*d;
      assert.ok(canTraverse(x,z,old,length/n),`Road exit blocked at ${fps} FPS, speed ${speed}, side ${side}, distance ${d} (${x.toFixed(1)},${z.toFixed(1)})`);
      old=surface(x,z);
    }
    crossings++;
  }
}
assert.ok(!canTraverse(-950,950,0,.1),'Deep ocean must block walking');
const reached=new Set([0]);let changed=true;
while(changed){changed=false;for(let i=0;i<roads.length;i++)if(!reached.has(i))for(const j of reached)if(roads[i].path.some(a=>roads[j].path.some(b=>Math.hypot(a.x-b.x,a.z-b.z)<6&&Math.abs(a.y-b.y)<.5))){reached.add(i);changed=true;break;}}
assert.equal(reached.size,roads.length,'Disconnected road network');
for(const l of landmarks){assert.ok(surface(l.x,l.z)>0,`${l.name} unsafe spawn`);assert.ok(roads.some(r=>r.path.some(p=>Math.hypot(p.x-l.x,p.z-l.z)<8)),`${l.name} lacks an accessible road`);}
for(let x=-1000;x<=1000;x+=17)for(let z=-1000;z<=1000;z+=17)assert.ok(Number.isFinite(terrainHeight(x,z)));
console.log(JSON.stringify({areaM2:SIZE*SIZE,sectors:64,roadShoulderCrossings:crossings,connectedRoutes:reached.size,landmarkSpawns:landmarks.length,bridgeSamples:underwaterDecks,maximumGrade,checks:'Scale, finite heightfield, grades, bridge clearance, road connectivity and continuous centreline traversal passed.'},null,2));

// Adaptive topology must stay indexed, watertight and consistently shaded
// across neighbouring sectors at different detail levels.
const left=terrainGeometry(-375,-375,50),right=terrainGeometry(-125,-375,100);
function border(geo,edge){const p=geo.attributes.position,n=geo.attributes.normal,s=geo.attributes.broadSlope,out=new Map();for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-edge)<.001)out.set(p.getZ(i),[p.getY(i),n.getX(i),n.getY(i),n.getZ(i),s.getX(i)]);return out;}
const lb=border(left,125),rb=border(right,-125);
assert.equal(lb.size,101,'Shared borders must use a common 2.5 m spacing');assert.equal(rb.size,lb.size);
for(const [z,a] of lb){const b=rb.get(z);assert.ok(b,'Missing seam vertex');for(let i=0;i<5;i++)assert.ok(Math.abs(a[i]-b[i])<1e-5,'LOD height/normal/material seam');}
const mountainFar=terrainGeometry(875,-625,50),mountainNear=terrainGeometry(875,-625,100),ocean=terrainGeometry(-875,875,50);
assert.ok(ocean.index.count<mountainFar.index.count,'Flat terrain should need fewer triangles');
assert.ok(mountainNear.index.count>mountainFar.index.count,'Near ridges should get adaptive refinement');
let maxWalkableError=0,maxWalkableAt='';
for(const [geo,sx,sz] of [[left,-375,-375],[right,-125,-375],[mountainNear,875,-625]]){
  const p=geo.attributes.position,n=geo.attributes.normal,idx=geo.index;
  assert.ok(idx&&p.count<idx.count,'Terrain should share indexed vertices');
  const slope=geo.attributes.broadSlope;assert.equal(slope.count,p.count,'Missing broad-slope material weights');
  for(let i=0;i<slope.count;i++)assert.ok(slope.getX(i)>=0&&slope.getX(i)<=1,'Invalid slope blend weight');
  for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5,'Invalid terrain normal');
  // Count edge usage: internal T-junctions leave non-boundary edges with only
  // one triangle. Index stitching must close those edges at every leaf size.
  const edges=new Map();
  for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];
    for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)||0)+1);}
    const x=ids.reduce((s,k)=>s+p.getX(k),0)/3,z=ids.reduce((s,k)=>s+p.getZ(k),0)/3,y=ids.reduce((s,k)=>s+p.getY(k),0)/3;
    if(geo!==left&&ids.every(k=>n.getY(k)>.8)){const error=Math.abs(y-groundHeight(x+sx,z+sz));if(error>maxWalkableError){maxWalkableError=error;maxWalkableAt=`${x+sx},${z+sz}`;}}
  }
  for(const [key,count] of edges)if(count!==2){const [a,b]=key.split(',').map(Number);assert.equal(count,1);assert.ok((Math.abs(p.getX(a))===125&&p.getX(a)===p.getX(b))||(Math.abs(p.getZ(a))===125&&p.getZ(a)===p.getZ(b)),'Unstitched internal terrain edge');}
}
assert.ok(maxWalkableError<.22,`Walking surface differs from adaptive mesh by ${maxWalkableError} m at ${maxWalkableAt}`);
console.log(JSON.stringify({adaptiveTriangles:{ocean:ocean.index.count/3,mountainFar:mountainFar.index.count/3,mountainNear:mountainNear.index.count/3},seamSamples:lb.size,maxWalkableError},null,2));
for(const geo of [left,right,mountainFar,mountainNear,ocean])geo.dispose();

// Material geography is shared by every terrain LOD. Low sheltered banks
// must be wetter than dry uplands, and bridges must not paint the ocean bed.
const {createSurfaceField,sampleSurfaceField}=await import('../.qa/surface.js');
const surfaceField=createSurfaceField(),wetBanks=[],exposedBeaches=[],uplands=[];let deposits=0,pavedSamples=0,bridgeBeds=0;
for(let z=-980;z<1000;z+=20)for(let x=-980;x<1000;x+=20){
  const sample=sampleSurfaceField(surfaceField,x,z),d=coastDistance(x,z),h=rawHeight(x,z);
  if(d>2&&d<10&&h<4&&tidalShelter(x,z)>.8)wetBanks.push(sample.moisture);
  if(d>2&&d<10&&h<4&&tidalShelter(x,z)<.1)exposedBeaches.push(sample.moisture);
  if(d>80&&h>65)uplands.push(sample.moisture);
  if(sample.deposits>.3)deposits++;
}
const average=list=>list.reduce((a,b)=>a+b,0)/list.length;
assert.ok(wetBanks.length>10&&average(wetBanks)>.65,'Sheltered tidal banks should carry a continuous damp material mask');
assert.ok(exposedBeaches.length>10&&average(exposedBeaches)<.35,'Exposed sandy beaches must not inherit backwater mud');
assert.ok(uplands.length>10&&average(uplands)<.08,'High inland terrain must not inherit shoreline mud');
assert.ok(deposits>5,'Concave slope bases need local loose-rock deposits');
for(const road of roads)for(let i=0;i<road.path.length;i+=12){
  const p=road.path[i],d=coastDistance(p.x,p.z),sample=sampleSurfaceField(surfaceField,p.x,p.z);
  if(d< -10){assert.equal(sample.roadWear,0,'Gravel painted beneath a bridge');assert.equal(sample.pathWear,0,'Path dirt painted beneath a bridge');bridgeBeds++;}
  if(!road.trail&&d>20&&rawHeight(p.x,p.z)>2){assert.ok(sample.roadWear>.65,`${road.id} is missing its surface-wear mask`);pavedSamples++;}
}
assert.ok(bridgeBeds>0&&pavedSamples>40);
console.log(JSON.stringify({surfaceMaskBytes:surfaceField.data.byteLength,wetBankMoisture:average(wetBanks),uplandMoisture:average(uplands),looseRockSamples:deposits,pavedSamples,bridgeBeds},null,2));
