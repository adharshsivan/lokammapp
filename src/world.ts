import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainGeometry,terrainHeight,rawHeight,nearestRoad,roads,random,landmarks,coastDistance,platforms,hillTownSites,towns } from './terrain';
import {townBuildings,townInterests,type TownInterest} from './towns';
import {createLandscapeData,createSurfaceData,terrainPBR,roadPBR} from './materials';
import {createApartmentDistrict,type ApartmentDistrict,type ApartmentSite} from './apartments';

const material=(color:string)=>new THREE.MeshLambertMaterial({color});
const palette={wall:material('#f0e2bf'),roof:material('#b75d37'),dark:material('#314e48'),wood:material('#826144'),white:material('#f7edcf'),red:material('#c5523f'),stone:material('#929d99'),leaf:material('#528044'),trunk:material('#907858'),water:material('#27868c'),gold:material('#d7aa55')};
type MatKey=keyof typeof palette;
type Batch=Map<MatKey,THREE.BufferGeometry[]>;
export type Obstacle={x:number;z:number;rx:number;rz:number;top:number};
export const obstacles:Obstacle[]=[];
function add(batch:Batch,key:MatKey,geo:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0) {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));
  if(!batch.has(key)) batch.set(key,[]);batch.get(key)!.push(geo);
}
function box(b:Batch,k:MatKey,x:number,y:number,z:number,w:number,h:number,d:number,ry=0) {add(b,k,new THREE.BoxGeometry(w,h,d),x,y,z,0,ry);}
function cylinder(b:Batch,k:MatKey,x:number,y:number,z:number,rt:number,rb:number,h:number,n=8) {add(b,k,new THREE.CylinderGeometry(rt,rb,h,n),x,y,z);}
function finish(b:Batch) {const g=new THREE.Group();for(const [k,geos] of b) {const merged=mergeGeometries(geos);if(merged) {const mesh=new THREE.Mesh(merged,palette[k]);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);}geos.forEach(x=>x.dispose());}return g;}
function roof(b:Batch,x:number,y:number,z:number,w:number,d:number,h:number) {
  // Hipped four-sided clay roof; the square cone is scaled into a long Kerala roof.
  const geo=new THREE.ConeGeometry(1,h,4);geo.rotateY(Math.PI/4);geo.scale(w/Math.SQRT2,1,d/Math.SQRT2);add(b,'roof',geo,x,y+h/2,z);
  box(b,'wood',x,y,z,w,.18,d);
}
function house(b:Batch,x:number,z:number,rng:()=>number,variant=0,heading=0) {
  const parent=b;if(heading)b=new Map();
  const y=terrainHeight(x,z),w=7+rng()*4,d=7+rng()*4,h=3.3+(variant===2?3:0);
  box(b,'stone',x,y+.3,z,w+1,.6,d+1);box(b,'wall',x,y+h/2+.6,z,w,h,d);roof(b,x,y+h+.6,z,w+2,d+2,2.5);
  box(b,'dark',x,y+1.8,z+d/2+.02,1.25,2.4,.12);
  for(const side of [-1,1]) {box(b,'wood',x+side*w*.3,y+2.2,z+d/2+.08,1.55,1.5,.18);box(b,'dark',x+side*w*.3,y+2.2,z+d/2+.2,1.2,1.2,.08);box(b,'white',x+side*w*.3,y+2.2,z+d/2+.26,.06,1.2,.07);}
  box(b,'stone',x,y+.28,z+d/2+1.1,w+1,.5,2.2);box(b,'roof',x,y+3.15,z+d/2+1.1,w+1,.24,2.6);
  for(const side of [-1,1]) cylinder(b,'wood',x+side*w*.44,y+1.75,z+d/2+1.9,.13,.13,3);
  if(variant===1) {box(b,'gold',x,y+3,z+d/2+2.5,w*.7,.55,.12);box(b,'wood',x+1,y+.8,z+d/2+2.2,2.8,1,1.1);}
  if(heading){
    const matrix=new THREE.Matrix4().makeTranslation(x,0,z).multiply(new THREE.Matrix4().makeRotationY(heading)).multiply(new THREE.Matrix4().makeTranslation(-x,0,-z));
    for(const [key,geos] of b){if(!parent.has(key))parent.set(key,[]);for(const geo of geos){geo.applyMatrix4(matrix);parent.get(key)!.push(geo);}}
  }
  obstacles.push({x,z,rx:Math.max(w,d)/2+.5,rz:Math.max(w,d)/2+.5,top:y+h+3});
}
function interestFeature(b:Batch,p:TownInterest){
  const x=p.x+3.5,z=p.z,y=terrainHeight(x,z);
  // A modest wayside structure marks each named stop without filling the
  // open landscape with large landmark models or blocking its walking path.
  box(b,'stone',x,y+.12,z,4.6,.24,4.2);
  if(p.kind==='market'){
    box(b,'wood',x,y+1.25,z,3.4,.25,1.4);roof(b,x,y+2.6,z,4.4,3.7,1.4);
    for(const side of [-1,1])for(const end of [-1,1])cylinder(b,'wood',x+side*1.55,y+1.4,z+end*1.4,.11,.13,2.7);
  }else if(p.kind==='culture'){
    box(b,'stone',x,y+.45,z,2.4,.65,2.4);cylinder(b,'gold',x,y+2.05,z,.09,.18,2.7);
    roof(b,x,y+3.1,z,3.3,3.3,1.8);
  }else if(p.kind==='view'){
    box(b,'wood',x,y+.55,z,4.2,.22,3.4);
    for(const side of [-1,1]){cylinder(b,'wood',x+side*1.9,y+1.2,z-1.45,.1,.1,1.5);cylinder(b,'wood',x+side*1.9,y+1.2,z+1.45,.1,.1,1.5);box(b,'wood',x+side*1.9,y+1.85,z,.12,.13,3.2);}
  }else if(p.kind==='water'){
    for(const side of [-1,1])cylinder(b,'wood',x+side*1.6,y+1.5,z,.12,.15,3);
    box(b,'wood',x,y+3,z,3.6,.15,.2);box(b,'white',x,y+1.9,z,2.5,1.45,.06);
  }else if(p.kind==='civic'){
    box(b,'wood',x,y+1.65,z,3.2,2.5,.24);roof(b,x,y+3.15,z,3.8,1.7,1.2);
    box(b,'white',x,y+1.7,z+.17,2.6,1.7,.08);
  }else{
    box(b,'wood',x,y+.8,z,3.4,1.3,2.4);roof(b,x,y+1.65,z,3.8,2.8,1.2);
    for(const side of [-1,1])box(b,'gold',x+side*1.1,y+.48,z+1.5,.9,.8,.9);
  }
}
function lighthouse(b:Batch,x:number,z:number) {
  const y=terrainHeight(x,z);cylinder(b,'stone',x,y+.5,z,5,5,1,12);
  for(let i=0;i<7;i++) cylinder(b,i%2?'red':'white',x,y+1+i*3+1.5,z,2.1-i*.12,2.2-i*.12,3,12);
  cylinder(b,'white',x,y+22.5,z,2.7,2.7,.45,12);cylinder(b,'dark',x,y+24,z,1.4,1.4,2.5,8);cylinder(b,'red',x,y+26,z,0,2.2,1.5,8);
  for(let i=0;i<8;i++) {const a=i*Math.PI/4;cylinder(b,'white',x+Math.cos(a)*2.4,y+23.25,z+Math.sin(a)*2.4,.05,.05,1.4);}
  obstacles.push({x,z,rx:2.5,rz:2.5,top:y+27});
}
function church(b:Batch,x:number,z:number) {
  const y=terrainHeight(x,z);box(b,'white',x,y+3.5,z,11,7,20);roof(b,x,y+7,z,13,22,5);
  box(b,'white',x,y+8,z+8,4,16,4);roof(b,x,y+16,z+8,5,5,3);
  box(b,'wood',x,y+20,z+8,.3,3,.3);box(b,'wood',x,y+20.4,z+8,1.7,.25,.3);
  box(b,'dark',x,y+2,z+10.1,2,4,.15);
  for(const side of [-1,1]) for(let iz=-1;iz<=1;iz++) box(b,'dark',x+side*5.55,y+4,z+iz*5,.1,2,1.4);
  obstacles.push({x,z,rx:5.7,rz:10.3,top:y+20});
}
function temple(b:Batch,x:number,z:number) {
  const y=terrainHeight(x,z);box(b,'stone',x,y+.5,z,19,1,19);box(b,'wood',x,y+3,z,12,5,12);roof(b,x,y+5.5,z,17,17,4);
  box(b,'wall',x,y+10,z,7,3,7);roof(b,x,y+11.5,z,11,11,3.5);cylinder(b,'gold',x,y+15.6,z,.1,.6,1.4);
  for(const side of [-1,1]) for(let i=-1;i<=1;i++) cylinder(b,'wood',x+side*7,y+2.8,z+i*6,.19,.23,4.5);
  cylinder(b,'gold',x+12,y+4,z+12,.09,.15,8);obstacles.push({x,z,rx:8,rz:8,top:y+16});
}
function jetty(b:Batch,x:number,z:number) {
  const x1=x-52,x2=x+3,y1=3,y2=7;
  platforms.push({x1,x2,z1:z-2,z2:z+2,y1:y1+.25,y2:y2+.25});
  const slope=Math.atan2(y2-y1,x2-x1);add(b,'wood',new THREE.BoxGeometry(Math.hypot(x2-x1,y2-y1),.5,4),(x1+x2)/2,5,z,0,0,slope);
  box(b,'wood',x1+2,3,z,4,.5,18);platforms.push({x1:x1,x2:x1+4,z1:z-9,z2:z+9,y1:3.25,y2:3.25});
  for(let i=0;i<6;i++) {const px=x1+i*10,y=3+(px-x1)/55*4;cylinder(b,'wood',px,y/2-1,z-1.7,.24,.28,y+2);cylinder(b,'wood',px,y/2-1,z+1.7,.24,.28,y+2);}
}
function boat(b:Batch,x:number,z:number) {add(b,'wood',new THREE.SphereGeometry(1,8,4).scale(1.8,.65,5.5),x,.5,z);box(b,'gold',x,1,z,2.7,.12,8);box(b,'dark',x,1.9,z,2.6,1.8,3.5);roof(b,x,2.8,z,3.5,5,1.1);}
function palmGeo(detailed:boolean) {
  const trunk=new THREE.CylinderGeometry(.14,.32,9,5,detailed?3:1);trunk.translate(0,4.5,0);
  const leaves:THREE.BufferGeometry[]=[];
  for(let j=0;j<(detailed?7:5);j++) {
    const a=j*Math.PI*2/(detailed?7:5),pos:number[]=[],ix:number[]=[],segments=detailed?5:2;
    for(let i=0;i<=segments;i++) {const t=i/segments,l=t*5.2,h=9+2*Math.sin(t*Math.PI*.9)-t*1.9,w=Math.sin(t*Math.PI)*.8+.025;
      for(const side of [-1,1]) pos.push(Math.cos(a)*l+Math.sin(a)*side*w,h,Math.sin(a)*l-Math.cos(a)*side*w);
      if(i<segments) {const k=i*2;ix.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();leaves.push(g);
  }
  return {trunk,leaf:mergeGeometries(leaves)!};
}
const palms=[palmGeo(false),palmGeo(true)];palette.leaf.side=THREE.DoubleSide;
const treeCrown=mergeGeometries([new THREE.IcosahedronGeometry(3.4,1).translate(0,8.4,0),new THREE.IcosahedronGeometry(2.6,0).translate(2.1,6.7,.3),new THREE.IcosahedronGeometry(2.8,0).translate(-1.8,6.6,-.9)])!,treeTrunk=new THREE.CylinderGeometry(.25,.55,7,5).translate(0,3.5,0);
const rockGeo=new THREE.CylinderGeometry(.78,1.1,2,7,3).toNonIndexed();
const rockPositions=rockGeo.attributes.position;
for(let i=0;i<rockPositions.count;i++){
  const x=rockPositions.getX(i),y=rockPositions.getY(i),z=rockPositions.getZ(i);
  const rib=1+.13*Math.sin(Math.atan2(z,x)*5+Math.floor(y*1.5)*.7);
  rockPositions.setXYZ(i,x*rib+y*.14,y+1+.09*Math.sin(x*7+z*3),z*rib+y*.08);
}
rockGeo.computeVertexNormals();
const temp=new THREE.Object3D();
type SectorData={group:THREE.Group;mesh:THREE.Mesh;low:THREE.BufferGeometry;high:THREE.BufferGeometry|null;highMobile:boolean;detail:THREE.Group|null;far:THREE.Group;x:number;z:number;seed:number};
export class World {
  sectors:SectorData[]=[];water:THREE.Mesh;terrainMaterial:THREE.MeshStandardMaterial;active=0;roadGroup=new THREE.Group();
  landscapeData:THREE.DataTexture;surfaceData:THREE.DataTexture;
  apartments:ApartmentDistrict|null=null;
  constructor(public scene:THREE.Scene,_renderer:THREE.WebGLRenderer) {
    this.landscapeData=createLandscapeData();this.surfaceData=createSurfaceData();this.terrainMaterial=terrainPBR(this.landscapeData,this.surfaceData);
    this.roadGroup.name='Road network — toggleable';this.scene.add(this.roadGroup);
    for(let ix=0;ix<8;ix++) for(let iz=0;iz<8;iz++) {
      const x=-875+ix*250,z=-875+iz*250,low=terrainGeometry(x,z,50),mesh=new THREE.Mesh(low,this.terrainMaterial),group=new THREE.Group();
      mesh.position.set(x,0,z);mesh.receiveShadow=true;group.add(mesh);scene.add(group);
      const s={group,mesh,low,high:null,highMobile:false,detail:null,far:new THREE.Group(),x,z,seed:71+ix*103+iz*29} as SectorData;
      s.far=this.vegetation(s,false);group.add(s.far);this.sectors.push(s);
    }
    this.buildRoads();this.buildSettlements();this.water=this.createWater();scene.add(this.water);
  }
  vegetation(s:SectorData,detailed:boolean) {
    const rng=random(s.seed),items:{x:number;y:number;z:number;scale:number;angle:number;kind:number}[]=[];
    for(let i=0;i<45;i++) {
      const x=s.x+(rng()-.5)*244,z=s.z+(rng()-.5)*244,h=terrainHeight(x,z),r=nearestRoad(x,z),chance=rng();
      if(Math.hypot((x-775)/98,(z-713)/80)<1)continue; // open hill-town bench
      if(h<2||h>125||r.distance<r.width/2+7||obstacles.some(o=>Math.abs(o.x-x)<o.rx+7&&Math.abs(o.z-z)<o.rz+7)) continue;
      if(x>300&&h<23&&chance<.72) continue;
      items.push({x,y:h,z,scale:.85+rng()*.6,angle:rng()*Math.PI*2,kind:h<35&&chance<.77?0:1});
    }
    const group=new THREE.Group();
    for(let kind=0;kind<2;kind++) {const list=items.filter(i=>i.kind===kind);if(!list.length) continue;
      const gs=kind===0?palms[detailed?1:0]:{trunk:treeTrunk,leaf:treeCrown};
      for(const part of ['trunk','leaf'] as const) {const inst=new THREE.InstancedMesh(gs[part],palette[part],list.length);list.forEach((it,i)=>{temp.position.set(it.x,it.y,it.z);temp.rotation.set(0,it.angle,0);temp.scale.setScalar(it.scale);temp.updateMatrix();inst.setMatrixAt(i,temp.matrix);});inst.castShadow=detailed;inst.receiveShadow=true;inst.computeBoundingSphere();group.add(inst);}
    }
    const rocks:{x:number;y:number;z:number;s:number}[]=[];
    for(let i=0;i<(detailed?35:12);i++) {const x=s.x+(rng()-.5)*250,z=s.z+(rng()-.5)*250,h=terrainHeight(x,z);if(Math.hypot((x-775)/98,(z-713)/80)<1)continue;if(h>-.9&&(coastDistance(x,z)<18||h>63)&&nearestRoad(x,z).distance>12) rocks.push({x,y:h,z,s:coastDistance(x,z)<18?2+rng()*5:1+rng()*3});}
    if(rocks.length) {const inst=new THREE.InstancedMesh(rockGeo,palette.stone,rocks.length);rocks.forEach((r,i)=>{temp.position.set(r.x,r.y-.5,r.z);temp.scale.set(r.s*1.3,r.s*.85,r.s);temp.rotation.set(.2,i,0);temp.updateMatrix();inst.setMatrixAt(i,temp.matrix);});inst.computeBoundingSphere();inst.castShadow=detailed;group.add(inst);}
    return group;
  }
  stream(x:number,z:number,aerial:boolean,lowQuality:boolean) {
    let changes=0;this.active=0;
    for(const s of this.sectors) {
      const d=Math.hypot(s.x-x,s.z-z),near=!aerial&&d<(lowQuality?330:470)+(s.high?45:0);
      if(near) this.active++;
      if(near&&(!s.high||s.highMobile!==lowQuality)&&changes<1) {s.high?.dispose();s.high=terrainGeometry(s.x,s.z,100,lowQuality);s.highMobile=lowQuality;s.mesh.geometry=s.high;if(!s.detail){s.detail=this.vegetation(s,true);s.group.add(s.detail);}s.far.visible=false;changes++;}
      if(!near&&s.high) {s.mesh.geometry=s.low;s.high.dispose();s.high=null;if(s.detail) {s.detail.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});s.group.remove(s.detail);s.detail=null;}s.far.visible=true;}
      // Conservative terrain occlusion: cull vegetation only when all five
      // upper-bound probes are behind a ridge. Terrain silhouettes persist.
      let occluded=false;
      if(!aerial&&d>380) {
        const eye=terrainHeight(x,z)+2;
        occluded=[[-100,-100],[100,-100],[-100,100],[100,100],[0,0]].every(([dx,dz])=>{
          const tx=s.x+dx,tz=s.z+dz,top=terrainHeight(tx,tz)+22;
          for(let t=.15;t<.9;t+=.15)if(terrainHeight(x+(tx-x)*t,z+(tz-z)*t)>eye+(top-eye)*t+8)return true;
          return false;
        });
      }
      s.far.visible=!s.high&&!occluded;if(s.detail)s.detail.visible=!occluded;
    }
  }
  buildRoads() {
    const b:Batch=new Map(),roadMat=roadPBR('main',this.landscapeData,this.surfaceData),secondaryMat=roadPBR('secondary',this.landscapeData,this.surfaceData),trailMat=roadPBR('path',this.landscapeData,this.surfaceData),lineMat=material('#d6c9a9');
    lineMat.polygonOffset=true;lineMat.polygonOffsetFactor=-2;lineMat.polygonOffsetUnits=-8;
    const asphalt:THREE.BufferGeometry[]=[],secondary:THREE.BufferGeometry[]=[],trails:THREE.BufferGeometry[]=[],lines:THREE.BufferGeometry[]=[];
    const strip=(path:THREE.Vector3[],width:number,offset=0,lift=0)=> {
      const pos:number[]=[],idx:number[]=[],uv:number[]=[];let station=0;
      path.forEach((p,i)=>{const prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)],dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
        if(i)station+=Math.hypot(p.x-prev.x,p.z-prev.z);
        for(const side of [-1,1]){pos.push(p.x+dz/len*(side*width/2+offset),p.y+lift,p.z-dx/len*(side*width/2+offset));uv.push(side,station);}
        if(i<path.length-1){const k=i*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
      });const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('surfaceUv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
    };
    for(const r of roads) {
      (r.trail?trails:r.width>=7?asphalt:secondary).push(strip(r.path,r.width));
      if(!r.trail&&r.width>=6) {for(const side of [-1,1]) lines.push(strip(r.path,.10,side*(r.width/2-.35),.045));
        if(r.width>=7)for(let i=0;i<r.path.length-1;i+=4) lines.push(strip(r.path.slice(i,i+2),.12,0,.05));}
      for(let i=1;i<r.path.length;i++) {const a=r.path[i-1],p=r.path[i];if(coastDistance(p.x,p.z)>=0)continue;
        const dx=p.x-a.x,dz=p.z-a.z,len=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
        box(b,'stone',(p.x+a.x)/2,p.y-.5,(p.z+a.z)/2,r.width+.8,.9,len+.12,angle);
        for(const side of [-1,1]) {const x=(p.x+a.x)/2+Math.cos(angle)*(r.width/2+.1)*side,z=(p.z+a.z)/2-Math.sin(angle)*(r.width/2+.1)*side;box(b,'white',x,p.y+.8,z,.18,.16,len+.2,angle);if(i%2===0)cylinder(b,'stone',x,p.y+.4,z,.12,.12,.9);}
        if(i%5===0) {const foot=Math.max(-2,terrainHeight(p.x,p.z)-1),height=p.y-foot;if(height>2)cylinder(b,'stone',p.x,foot+height/2,p.z,.75,.9,height);}
      }
    }
    // Fill the small wedge where independent strips meet. Each radial vertex
    // follows the shared height field, so the patch meets the cut roadbed.
    const junctions:{x:number;z:number;radius:number;main:boolean;trail:boolean}[]=[];
    for(const r of roads)for(const p of [r.path[0],r.path.at(-1)!]){
      const connections=roads.filter(other=>other!==r&&other.path.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<4));
      if(!connections.length)continue;
      const joined=[r,...connections],radius=Math.max(...joined.map(road=>road.width))/2+1.3,main=joined.some(road=>road.width>=7),trail=joined.every(road=>road.trail);
      const existing=junctions.find(j=>Math.hypot(j.x-p.x,j.z-p.z)<5);
      if(existing){existing.radius=Math.max(existing.radius,radius);existing.main ||= main;existing.trail &&= trail;}
      else junctions.push({x:p.x,z:p.z,radius,main,trail});
    }
    for(const j of junctions){
      const pos=[j.x,terrainHeight(j.x,j.z)+.075,j.z],idx:number[]=[],n=20;
      for(let i=0;i<n;i++){const a=i*Math.PI*2/n,x=j.x+Math.cos(a)*j.radius,z=j.z+Math.sin(a)*j.radius;pos.push(x,terrainHeight(x,z)+.075,z);idx.push(0,(i+1)%n+1,i+1);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('surfaceUv',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3*2),2));g.setIndex(idx);g.computeVertexNormals();(j.trail?trails:j.main?asphalt:secondary).push(g);
    }
    const townRoads=roads.filter(r=>r.id==='Southern summit road'||r.id.startsWith('Hilltop')).flatMap(r=>r.path);
    for(const [x,z] of hillTownSites){
      const nearest=townRoads.reduce((a,p)=>Math.hypot(p.x-x,p.z-z)<Math.hypot(a.x-x,a.z-z)?p:a);
      const dx=x-nearest.x,dz=z-nearest.z,length=Math.hypot(dx,dz),end=Math.max(0,length-5),steps=Math.max(2,Math.ceil(end/2));
      const path:THREE.Vector3[]=[];
      for(let i=0;i<=steps;i++){const t=i/steps,sx=nearest.x+dx*t*end/length,sz=nearest.z+dz*t*end/length;
        path.push(new THREE.Vector3(sx,terrainHeight(sx,sz)+.1,sz));
      }
      trails.push(strip(path,1.45,0,.02));
    }
    for(const site of townBuildings){
      const length=Math.hypot(site.x-site.roadX,site.z-site.roadZ),steps=Math.max(2,Math.ceil(length/2)),path:THREE.Vector3[]=[];
      for(let i=0;i<=steps;i++){
        const t=i/steps,x=site.roadX+(site.x-site.roadX)*t,z=site.roadZ+(site.z-site.roadZ)*t;
        path.push(new THREE.Vector3(x,terrainHeight(x,z)+.11,z));
      }
      trails.push(strip(path,1.3,0,.02));
    }
    for(const [list,mat,name] of [[asphalt,roadMat,'Main asphalt roads and junctions'],[secondary,secondaryMat,'Secondary roads and junctions'],[trails,trailMat,'Dirt walking paths'],[lines,lineMat,'Road paint']] as const) {const geo=mergeGeometries(list);if(geo){const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.receiveShadow=true;this.roadGroup.add(mesh);}list.forEach(g=>g.dispose());}
    const bridges=finish(b);bridges.name='Bridge decks, guardrails and piers';this.roadGroup.add(bridges);
  }
  setRoadsVisible(visible:boolean){this.roadGroup.visible=visible;}
  buildSettlements() {
    const b:Batch=new Map(),rng=random(211);
    lighthouse(b,47,815);lighthouse(b,-584,-773);church(b,-625,-58);temple(b,554,248);
    // A modest hill town occupies the sculpted, near-level upper bench.
    for(const [x,z,kind] of hillTownSites){
      const y=terrainHeight(x,z);box(b,'stone',x,y-.75,z,12,2.1,12);
      house(b,x,z,rng,kind);
    }
    const apartmentTowns=new Set(['Kannur','Kozhikode','Palakkad','Thrissur','Kochi','Kottayam','Alappuzha','Kollam','Thiruvananthapuram']);
    const denseKeralaTowns=new Set(['Kannur','Kozhikode','Thrissur','Kochi','Alappuzha','Kollam']);
    const apartmentSites:ApartmentSite[]=[];
    for(const town of towns) {
      if(!apartmentTowns.has(town.name))continue;
      const candidates=townBuildings.filter(site=>site.town===town.name);
      const wanted=['Kozhikode','Kochi','Thiruvananthapuram'].includes(town.name)?2:1;
      let added=0;
      for(const candidate of candidates) {
        if(apartmentSites.some(site=>Math.hypot(site.x-candidate.x,site.z-candidate.z)<34))continue;
        apartmentSites.push({
          x:candidate.x,z:candidate.z,heading:candidate.heading,
          region:denseKeralaTowns.has(town.name)?'kerala-dense':'modern-indian',
          id:`${town.name.toLowerCase()}-${added+1}`,
        });
        if(++added>=wanted)break;
      }
    }
    const apartmentOrigins=new Set(apartmentSites.map(site=>`${site.x},${site.z}`));
    for(const site of townBuildings)if(!apartmentOrigins.has(`${site.x},${site.z}`))house(b,site.x,site.z,rng,site.variant,site.heading);
    for(const interest of townInterests)interestFeature(b,interest);
    // Working waterfront, beach pavilion and ridge shelter.
    for(let i=0;i<4;i++){house(b,-420,67+i*24,rng,i%3);jetty(b,-445,70+i*24);boat(b,-494,79+i*24);}
    const viewpoint=landmarks[4],vy=terrainHeight(viewpoint.x,viewpoint.z);
    box(b,'wood',viewpoint.x+8,vy+.5,viewpoint.z+8,9,1,9);roof(b,viewpoint.x+8,vy+4.5,viewpoint.z+8,11,11,3);
    for(const a of [-1,1])for(const c of [-1,1])cylinder(b,'wood',viewpoint.x+8+a*4,vy+2.5,viewpoint.z+8+c*4,.2,.2,4);
    this.scene.add(finish(b));
    this.apartments=createApartmentDistrict(apartmentSites,{
      seed:94133,region:'mixed',floorRange:[3,6],
      compoundWalls:false,parking:true,parkedVehicles:true,
      balconies:true,balconyLaundry:true,laundryLines:true,
      curtains:true,interiors:true,indoorPlants:true,outdoorPlants:true,
      windowLights:true,timeOfDay:'day',
    });
    this.scene.add(this.apartments.group);
    obstacles.push(...this.apartments.obstacles);
    // Rebuild far vegetation now that structural collision footprints exist.
    for(const s of this.sectors){s.group.remove(s.far);s.far.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});s.far=this.vegetation(s,false);s.group.add(s.far);}
  }
  createWater() {
    const mat=new THREE.ShaderMaterial({uniforms:{time:{value:0},landscapeData:{value:this.landscapeData}},vertexShader:`varying vec3 world; void main(){world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`
      uniform float time; uniform sampler2D landscapeData; varying vec3 world;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 uv=(world.xz+1000.0)/2000.0;
        float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
        vec4 land=texture2D(landscapeData,clamp(uv,0.0,1.0));
        float shore=(land.r*65280.0+land.g*255.0)/64.0-256.0;
        float offshore=mix(350.0,max(0.0,-shore),inside);
        float n=noise(world.xz*.047+vec2(time*.018,0.0));
        float depth=smoothstep(0.0,75.0,offshore+(n-.5)*12.0);
        vec3 col=mix(vec3(.19,.69,.51),vec3(.018,.285,.345),pow(depth,.55));
        col=mix(col,vec3(.015,.19,.265),smoothstep(120.0,600.0,offshore)*.62);
        float swells=noise(world.xz*.016+vec2(time*.009,-time*.012));
        col*=.94+swells*.14;
        // Broken ribbons follow the authored contour, with a wider mint band
        // behind the whitewash. Their phase rolls gently towards the beach.
        float distortion=(noise(world.xz*.12)-.5)*3.4;
        float wash=1.0-smoothstep(1.2,5.4+sin(time*.55+n*4.0)*1.3,offshore+distortion);
        float ribbon=1.0-smoothstep(.45,1.6,abs(offshore-9.0-sin(time*.48)*2.0-distortion));
        ribbon*=smoothstep(.25,.58,n)*.62;
        float lace=smoothstep(.17,.48,noise(world.xz*.48+time*.04));
        float foam=max(wash*mix(.55,1.0,lace),ribbon*lace)*inside*(1.0-land.a*.72);
        col=mix(col,vec3(.90,.91,.70),foam*.93);
        // Long, sparse brush strokes replace the old noisy glitter pattern.
        vec2 flow=vec2(world.x*.09+world.z*.035+time*.024,world.z*.24-world.x*.06);
        float streak=pow(noise(flow),19.0)*smoothstep(5.0,20.0,offshore);
        col+=vec3(.09,.13,.12)*streak;
        float haze=1.0-exp(-distance(cameraPosition,world)*.000025);
        col=mix(col,vec3(.39,.67,.65),haze);
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    const g=new THREE.PlaneGeometry(18000,18000);g.rotateX(-Math.PI/2);return new THREE.Mesh(g,mat);
  }
}

export function makePlayer() {
  const g=new THREE.Group(),skin=material('#b77e56'),shirt=material('#ead9ac'),pants=material('#304c4b'),pack=material('#bb6946');
  const part=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;};
  part(new THREE.CapsuleGeometry(.25,.4,3,6),shirt,0,1.13,0);part(new THREE.SphereGeometry(.18,8,6),skin,0,1.7,0);
  part(new THREE.CylinderGeometry(.24,.28,.08,8),palette.gold,0,1.86,0);part(new THREE.BoxGeometry(.37,.45,.19),pack,0,1.18,.27);
  const legs=[-1,1].map(s=>part(new THREE.CapsuleGeometry(.105,.46,2,5),pants,s*.13,.4,0));
  const arms=[-1,1].map(s=>part(new THREE.CapsuleGeometry(.08,.42,2,5),skin,s*.32,1.13,0));
  return {group:g,legs,arms};
}
