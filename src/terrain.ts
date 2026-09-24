import * as THREE from 'three';
import { naturalCoast,landNoise,shelteredShore } from './geography.js';
import {elevationHeight} from './elevation.js';

// One world unit is one metre. The simulation boundary is exactly 2,000 × 2,000 m.
export const SIZE = 2000, HALF = 1000, SECTOR = 250;
export const clamp = (v:number,a:number,b:number) => Math.max(a,Math.min(b,v));
export const smooth = (a:number,b:number,x:number) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
export function random(seed:number) { return () => { seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function coastDistance(x:number,z:number) {
  return naturalCoast(x,z);
}
export const rawHeight=elevationHeight;

export type Road = { id:string; width:number; path:THREE.Vector3[]; trail:boolean };
const routes:{id:string;width:number;points:number[][];trail?:boolean;loop?:boolean}[]=[
  {id:'Coastal village road',width:7,points:[[-580,-780],[-535,-655],[-440,-525],[-375,-385],[-308,-235],[-250,-40],[-220,115],[-130,270],[-75,440],[30,580],[85,800]]},
  {id:'Eastern highway',width:8,points:[[85,800],[205,840],[355,810],[535,790],[575,750],[590,700],[600,650],[610,580],[620,500],[630,430],[630,290],[595,65],[620,-100],[580,-315],[520,-480],[380,-560],[290,-720],[350,-850]]},
  {id:'North estuary link',width:7,points:[[-375,-385],[-220,-435],[-75,-505],[90,-530],[265,-560],[380,-560]]},
  {id:'Harbour market road',width:6,points:[[-220,115],[-70,120],[25,110],[185,110],[310,118],[470,155],[595,65]]},
  {id:'Harbour access',width:5,points:[[-220,115],[-310,110],[-445,105]]},
  {id:'Fishing quay',width:4,points:[[-440,65],[-445,105],[-440,150]]},
  {id:'Temple lane',width:4.5,points:[[470,155],[485,225],[540,270],[630,290]]},
  {id:'Church approach',width:5,points:[[-250,-40],[-365,-57],[-455,-55],[-535,-65],[-600,-70],[-625,-5]]},
  {id:'Coconut island lane',width:4,points:[[-130,270],[-280,290],[-380,330],[-450,335],[-525,330],[-580,310]]},
  {id:'Southern fishing hamlet',width:4,points:[[30,580],[-140,555],[-265,565],[-335,595]]},
  {id:'Anamala climbing trail',width:3,trail:true,points:[[380,-560],[430,-650],[510,-685],[510,-780],[570,-820],[630,-785],[595,-720],[650,-670],[705,-710]]},
  {id:'Wayanad ridge approach',width:3.5,trail:true,points:[[705,-710],[750,-660],[775,-600],[745,-550],[710,-515],[755,-480],[790,-465]]},
  {id:'Forest contour trail',width:2.5,trail:true,points:[[620,-100],[660,-20],[720,10],[763,-50],[715,-120],[760,-185],[815,-170],[805,-95]]},
  {id:'Southern summit road',width:6.5,points:[[590,700],[625,735],[650,785],[685,830],[735,820],[765,790],[730,775],[700,755],[725,720],[730,715]]},
  {id:'Peninsula coastal road',width:5.5,points:[[535,790],[565,830],[605,870],[655,890],[715,895],[765,882],[810,848],[835,812],[855,777],[865,740],[875,700],[870,675],[850,640],[832,605],[820,565],[800,535],[760,505],[715,490],[665,480],[620,500]]},
  {id:'Hilltop market loop',width:5.5,loop:true,points:[[730,715],[745,685],[775,675],[805,687],[820,712],[805,740],[775,750],[745,740]]},
  {id:'Hilltop cross lane',width:4.5,points:[[745,685],[766,700],[783,717],[805,740]]},
  {id:'Kochi harbour loop',width:5.5,loop:true,points:[[-220,115],[-185,105],[-175,145],[-210,180],[-235,155]]},
  {id:'Kozhikode market loop',width:5,loop:true,points:[[-375,-385],[-400,-365],[-420,-345],[-390,-330],[-365,-350]]},
  {id:'Alappuzha canal lane',width:4.5,points:[[-130,270],[-90,330],[-70,380],[-75,440]]},
  {id:'Thiruvananthapuram civic avenue',width:6,points:[[355,810],[365,770],[405,750],[430,765]]},
  {id:'Kottayam market loop',width:5,loop:true,points:[[630,290],[675,275],[700,315],[660,340]]},
  {id:'Palakkad valley lane',width:3.5,trail:true,points:[[620,-100],[650,-75],[675,-45],[660,-20]]},
  {id:'Thrissur square lane',width:4.5,points:[[-250,-40],[-270,0],[-300,20]]},
  {id:'Malappuram upland approach',width:5,points:[[-308,-235],[-278,-280],[-242,-296],[-210,-277],[-185,-245],[-174,-211]]},
];
export const roads:Road[]=routes.map(r=>{
  const curve=new THREE.CatmullRomCurve3(r.points.map(p=>new THREE.Vector3(p[0],0,p[1])),!!r.loop,'centripetal');
  const path=curve.getSpacedPoints(Math.ceil(curve.getLength()/5));
  if(r.id==='Southern summit road'){
    const start=rawHeight(path[0].x,path[0].z)+.2,end=rawHeight(path.at(-1)!.x,path.at(-1)!.z)+.2;
    let total=0;for(let i=1;i<path.length;i++)total+=Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z);
    let station=0;path[0].y=start;
    for(let i=1;i<path.length;i++){
      station+=Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z);
      const t=station/total;
      // Long ascending tangents ease through the turns; elevation remains
      // strictly monotone and receives the common grade envelope below.
      path[i].y=start+(end-start)*(t-.018*Math.sin(2*Math.PI*t));
    }
  }else path.forEach(p=>{const h=rawHeight(p.x,p.z);p.y=h<1.3?7:Math.max(1.5,h+.2);});
  // A compact mountain road permits steep climbing sections; main roads
  // remain below 10% and never inherit the summit elevation at a junction.
  for(let k=0;k<4;k++) {
    const grade=r.trail?.25:r.id==='Southern summit road'?.2:.1;
    for(let i=1;i<path.length;i++) path[i].y=Math.max(path[i].y,path[i-1].y-path[i].distanceTo(new THREE.Vector3(path[i-1].x,path[i].y,path[i-1].z))*grade);
    for(let i=path.length-2;i>=0;i--) path[i].y=Math.max(path[i].y,path[i+1].y-Math.hypot(path[i].x-path[i+1].x,path[i].z-path[i+1].z)*grade);
  }
  return {id:r.id,width:r.width,path,trail:!!r.trail};
});
export const hillTownSites=[[735,680,0],[775,690,1],[790,700,0],[805,720,2],[745,710,0],[755,720,1],[770,725,0],[780,740,2]] as const;
export type Town={name:string;x:number;z:number;radius:number;target:number;character:'capital'|'port'|'market'|'canal'|'coastal'|'inland'|'backwater'|'foothill'|'highland'};
// Kerala place names and settlement character compressed into this fictional
// two-kilometre world. Each is a small walkable district, not a 1:1 city.
export const towns:Town[]=[
  {name:'Kasaragod',x:-560,z:-800,radius:75,target:5,character:'coastal'},
  {name:'Kannur',x:-470,z:-545,radius:75,target:6,character:'coastal'},
  {name:'Wayanad',x:780,z:-470,radius:72,target:6,character:'highland'},
  {name:'Kozhikode',x:-385,z:-375,radius:78,target:10,character:'market'},
  {name:'Malappuram',x:-190,z:-220,radius:78,target:6,character:'inland'},
  {name:'Palakkad',x:680,z:-90,radius:85,target:6,character:'inland'},
  {name:'Thrissur',x:-260,z:-30,radius:80,target:8,character:'market'},
  {name:'Kochi',x:-230,z:140,radius:92,target:12,character:'port'},
  {name:'Kottayam',x:645,z:290,radius:82,target:9,character:'backwater'},
  {name:'Alappuzha',x:-90,z:330,radius:85,target:9,character:'canal'},
  {name:'Pathanamthitta',x:625,z:570,radius:78,target:5,character:'foothill'},
  {name:'Kollam',x:40,z:575,radius:85,target:8,character:'coastal'},
  {name:'Thiruvananthapuram',x:330,z:800,radius:96,target:12,character:'capital'},
];
// Synchronize shared junction heights, then propagate the grade envelope again.
for(let iteration=0;iteration<3;iteration++) {
  for(const r of roads) for(const end of [r.path[0],r.path.at(-1)!]) for(const other of roads) if(other!==r) for(const p of other.path) if(Math.hypot(p.x-end.x,p.z-end.z)<3) p.y=end.y=Math.max(p.y,end.y);
  for(const r of roads) for(const seq of [r.path,[...r.path].reverse()]) for(let i=1;i<seq.length;i++) seq[i].y=Math.max(seq[i].y,seq[i-1].y-Math.hypot(seq[i].x-seq[i-1].x,seq[i].z-seq[i-1].z)*(r.trail?.25:r.id==='Southern summit road'?.2:.1));
}
type Segment={a:THREE.Vector3;b:THREE.Vector3;road:Road;da:number;db:number};
const grid=new Map<string,Segment[]>();
for(const road of roads) for(let i=1;i<road.path.length;i++) {
  const a=road.path[i-1],b=road.path[i],seg={a,b,road,da:a.y-rawHeight(a.x,a.z),db:b.y-rawHeight(b.x,b.z)};
  for(let gx=Math.floor((Math.min(a.x,b.x)-85)/50);gx<=Math.floor((Math.max(a.x,b.x)+85)/50);gx++) for(let gz=Math.floor((Math.min(a.z,b.z)-85)/50);gz<=Math.floor((Math.max(a.z,b.z)+85)/50);gz++) {
    const key=`${gx},${gz}`; if(!grid.has(key)) grid.set(key,[]); grid.get(key)!.push(seg);
  }
}
export function nearestRoad(x:number,z:number) {
  let distance=Infinity,height=0,width=0,trail=false,pointX=0,pointZ=0,roadId='';
  for(const {a,b,road} of grid.get(`${Math.floor(x/50)},${Math.floor(z/50)}`)||[]) {
    const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(d<distance) {distance=d;height=a.y+(b.y-a.y)*t;width=road.width;trail=road.trail;pointX=a.x+dx*t;pointZ=a.z+dz*t;roadId=road.id;}
  }
  return {distance,height,width,trail,pointX,pointZ,roadId};
}
export function terrainHeight(x:number,z:number) {
  const raw=rawHeight(x,z),r=nearestRoad(x,z);
  if(!Number.isFinite(r.distance))return raw;
  // Blend road cuts from only similarly close curve segments. On mountain
  // switchbacks this avoids a hard height step halfway between parallel roads.
  let influence=0,sum=0,weight=0;
  for(const {a,b,road,da,db} of grid.get(`${Math.floor(x/50)},${Math.floor(z/50)}`)||[]){
    const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    const shoulder=Math.max(0,distance-road.width/2);
    const falloff=(1-smooth(60,85,distance))*Math.exp(-shoulder*shoulder/(35*35));
    if(falloff<=0)continue;
    influence=Math.max(influence,falloff);
    const separation=Math.max(0,distance-r.distance);
    const w=falloff/(1+distance*distance/(35*35))*Math.exp(-separation*separation/9);
    sum+=(da+(db-da)*t)*w;weight+=w;
  }
  const shore=smooth(2,8,coastDistance(x,z));
  const broad=raw+(weight?sum/weight*influence*shore:0);
  const pin=(1-smooth(r.width/2+1,r.width/2+8,r.distance))*shore;
  const mountainGrade=THREE.MathUtils.lerp(broad,r.height-.045,pin);
  // Low estuary roads have no opposing switchbacks. Fit their shoulder to the
  // nearest deck instead of mixing distant cuts into a false riverbank ridge.
  const shoulder=Math.max(0,r.distance-r.width/2);
  const reach=28+Math.min(60,Math.abs(r.height-raw)*2.2);
  const local=THREE.MathUtils.lerp(raw,r.height-.045,(1-smooth(0,reach,shoulder))*shore);
  const estuary=smooth(.1,.35,shelteredShore(x,z))*(1-smooth(25,40,raw));
  return THREE.MathUtils.lerp(mountainGrade,local,estuary);
}
export const platforms:{x1:number;x2:number;z1:number;z2:number;y1:number;y2:number}[]=[];
export function onPlatform(x:number,z:number){return platforms.some(p=>x>=p.x1&&x<=p.x2&&z>=p.z1&&z<=p.z2);}
export function groundHeight(x:number,z:number) {
  // Continuous collision sampling shares the relaxed cubic height field.
  // Nearby mesh refinement limits walkable interpolation error to centimetres.
  return terrainHeight(x,z);
}
export function surface(x:number,z:number) {
  const r=nearestRoad(x,z),ground=groundHeight(x,z);
  const blend=1-smooth(r.width/2,r.width/2+1.5,r.distance);
  // A bridge deck remains the walking surface even over sand and water.
  let h=THREE.MathUtils.lerp(ground,r.height,blend);
  for(const p of platforms)if(x>=p.x1&&x<=p.x2&&z>=p.z1&&z<=p.z2)h=Math.max(h,THREE.MathUtils.lerp(p.y1,p.y2,(x-p.x1)/(p.x2-p.x1)));
  return h;
}
export function canTraverse(x:number,z:number,oldHeight:number,step:number){
  if(Math.abs(x)>999.5||Math.abs(z)>999.5)return false;
  const r=nearestRoad(x,z),deck=r.distance<r.width/2+.1,platform=onPlatform(x,z),h=surface(x,z);
  if(h<-.55||(!deck&&!platform&&rawHeight(x,z)<-.55))return false;
  if(deck||platform)return Math.abs(h-oldHeight)<Math.max(.35,step*.55);
  const slope=Math.hypot(surface(x+.5,z)-surface(x-.5,z),surface(x,z+.5)-surface(x,z-.5));
  return slope<.84&&Math.abs(h-oldHeight)<Math.max(.2,step*.8);
}
export function terrainColor(x:number,z:number,h:number) {
  const d=coastDistance(x,z),n=landNoise(x,z);
  const green=new THREE.Color('#91ad48').multiplyScalar(.94+n*.13),sand=new THREE.Color('#efd5a0');
  green.lerp(new THREE.Color('#9b9680'),smooth(70,145,h)*.65);
  green.lerp(sand,1-smooth(10,30,d+n*9));return green;
}
export function terrainGeometry(sx:number,sz:number,div:number,mobile=false) {
  const near=div>=100,unit=1.25,span=SECTOR/unit;
  const heights=new Map<string,number>(),corners=new Set<string>();
  const key=(u:number,v:number)=>`${u},${v}`;
  const height=(u:number,v:number)=>{
    const k=key(u,v);let h=heights.get(k);
    if(h===undefined){h=terrainHeight(sx-SECTOR/2+u*unit,sz-SECTOR/2+v*unit);heights.set(k,h);}return h;
  };
  const leaves:{u:number;v:number;s:number}[]=[];
  function split(u:number,v:number,s:number){
    const m=s/2,a=height(u,v),b=height(u+s,v),c=height(u+s,v+s),d=height(u,v+s);
    const centreHeight=height(u+m,v+m);
    const error=Math.max(Math.abs(centreHeight-(a+b+c+d)/4),Math.abs(height(u+m,v+s/6)-(centreHeight+a+b)/3),Math.abs(height(u+s*5/6,v+m)-(centreHeight+b+c)/3),Math.abs(height(u+m,v+s*5/6)-(centreHeight+c+d)/3),Math.abs(height(u+s/6,v+m)-(centreHeight+d+a)/3),Math.abs(height(u+m,v)-(a+b)/2),Math.abs(height(u+s,v+m)-(b+c)/2),Math.abs(height(u+m,v+s)-(c+d)/2),Math.abs(height(u,v+m)-(d+a)/2));
    const slope=(Math.max(a,b,c,d)-Math.min(a,b,c,d))/(s*unit);
    const edge=u===0||v===0||u+s===span||v+s===span;
    const minimum=!edge&&((near&&!mobile)||slope>.45)?1:2;
    // 10 m flats, 5 / 2.5 m ridges, 1.25 m close scarps. Sample mid-edges
    // as well as the centre to catch a narrow ridge crossing a flat cell.
    const threshold=near?.055:.28;
    if(s>minimum&&(error>threshold||(slope>.7&&s>2)||(near&&slope>.18&&s>4))){
      split(u,v,m);split(u+m,v,m);split(u,v+m,m);split(u+m,v+m,m);return;
    }
    leaves.push({u,v,s});for(const [x,z] of [[u,v],[u+s,v],[u+s,v+s],[u,v+s]])corners.add(key(x,z));
  }
  for(let v=0;v<span;v+=8)for(let u=0;u<span;u+=8)split(u,v,8);
  // Every LOD uses the same 2.5 m border samples. Stitch hanging vertices
  // explicitly so neither internal adaptive edges nor sector edges crack.
  for(let t=0;t<=span;t+=2)for(const [u,v] of [[0,t],[span,t],[t,0],[t,span]])corners.add(key(u,v));
  const positions:number[]=[],normals:number[]=[],broadSlopes:number[]=[],indices:number[]=[],vertices=new Map<string,number>();
  function vertex(u:number,v:number){
    const k=key(u,v);let i=vertices.get(k);if(i!==undefined)return i;
    i=positions.length/3;vertices.set(k,i);
    positions.push(u*unit-SECTOR/2,height(u,v),v*unit-SECTOR/2);
    // World-space central differences give the same normal on both sides of
    // a sector boundary and at every LOD, independent of triangle shape.
    const dx=(height(u+1,v)-height(u-1,v))/(2*unit),dz=(height(u,v+1)-height(u,v-1))/(2*unit),length=Math.hypot(dx,1,dz);
    normals.push(-dx/length,1/length,-dz/length);
    const bx=(height(u+5,v)-height(u-5,v))/(10*unit),bz=(height(u,v+5)-height(u,v-5))/(10*unit);
    broadSlopes.push(1-1/Math.hypot(bx,1,bz));return i;
  }
  for(const {u,v,s} of leaves){
    const rim:number[]=[];
    for(let t=0;t<s;t++)if(corners.has(key(u+t,v)))rim.push(vertex(u+t,v));
    for(let t=0;t<s;t++)if(corners.has(key(u+s,v+t)))rim.push(vertex(u+s,v+t));
    for(let t=0;t<s;t++)if(corners.has(key(u+s-t,v+s)))rim.push(vertex(u+s-t,v+s));
    for(let t=0;t<s;t++)if(corners.has(key(u,v+s-t)))rim.push(vertex(u,v+s-t));
    const centre=vertex(u+s/2,v+s/2);
    for(let i=0;i<rim.length;i++)indices.push(centre,rim[(i+1)%rim.length],rim[i]);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('broadSlope',new THREE.Float32BufferAttribute(broadSlopes,1));geo.setIndex(indices);
  geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
}
export const landmarks=[
  {name:'Veli Lighthouse',type:'COAST & LIGHT',x:85,z:800,icon:'◉',description:'A red-and-white beacon above the Arabian Sea. Follow the coast road to quiet fishing jetties.'},
  {name:'Kadal Harbour',type:'WORKING WATERFRONT',x:-220,z:115,icon:'⚓',description:'Terracotta roofs, timber jetties and fishing boats gathered around a sheltered tidal inlet.'},
  {name:'St. Thomas Island',type:'ISLAND SANCTUARY',x:-600,z:-70,icon:'♧',description:'A little white church beneath the coconut palms, connected to the mainland by a long sea bridge.'},
  {name:'Lotus Backwaters',type:'LAGOONS & PADDY',x:595,z:65,icon:'≋',description:'Walk the field boundaries beside emerald rice paddies and calm, palm-fringed backwaters.'},
  {name:'Anamala Ridge',type:'THE WESTERN GHATS',x:705,z:-710,icon:'△',description:'A winding mountain trail climbs through open woodland to a sweeping view of the coast.'},
  {name:'Kavu Temple',type:'CULTURE & QUIET',x:540,z:270,icon:'⌂',description:'A layered tiled sanctuary above a branching backwater, reached along the village lane.'},
];
