import * as THREE from 'three';

// Authored land / water contours: headlands, spits, coves and tidal channels.
// There are deliberately no ellipses or repeated circular island primitives.
type Point=readonly [number,number];
function contour(points:Point[],samples:number){return new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal',.5).getPoints(samples).map(p=>[p.x,p.z] as Point);}
const mainland=contour([
  [-625,-910],[-470,-885],[-390,-785],[-260,-720],[-155,-772],[-90,-890],[80,-930],[225,-845],[405,-910],[660,-905],[800,-802],[948,-720],[906,-560],[956,-420],[886,-270],[940,-132],[912,58],[833,211],[908,397],[843,581],[902,721],[805,875],[646,938],[428,874],[330,939],[140,925],[7,889],[-110,747],[-215,635],[-267,507],[-358,420],[-350,272],[-453,216],[-478,86],[-414,-77],[-474,-210],[-552,-310],[-465,-434],[-537,-529],[-674,-664],[-702,-802],
],240);
const lagoons=[contour([[127,-411],[245,-464],[337,-438],[384,-377],[455,-357],[466,-293],[532,-253],[519,-169],[449,-118],[463,-59],[374,38],[277,62],[237,-6],[171,-35],[190,-123],[237,-211],[202,-269],[134,-299]],104),
  contour([[212,367],[318,309],[392,331],[468,390],[539,379],[584,443],[548,512],[582,589],[520,667],[426,656],[365,727],[300,715],[289,621],[248,559],[280,459]],100)];
const islands=[contour([[-682,-145],[-615,-189],[-545,-157],[-531,-95],[-571,-20],[-554,21],[-637,55],[-675,13],[-654,-43],[-703,-83]],64),
  contour([[-631,253],[-580,255],[-535,284],[-500,298],[-509,338],[-564,359],[-594,333],[-651,317]],52),
  contour([[-385,520],[-336,533],[-321,569],[-286,601],[-319,643],[-351,630],[-385,578],[-408,557]],48)];
const channelCurve=new THREE.CatmullRomCurve3([[-100,-1020],[-13,-770],[74,-615],[35,-485],[147,-324],[171,-154],[120,17],[202,187],[197,375],[239,539],[277,689],[146,875],[170,1040]].map(p=>new THREE.Vector3(p[0],0,p[1])),false,'centripetal');
const channel=channelCurve.getSpacedPoints(165);
const tributary=new THREE.CatmullRomCurve3([[500,-215],[565,-163],[543,-81],[584,-20],[568,44]].map(p=>new THREE.Vector3(p[0],0,p[1])),false,'centripetal').getSpacedPoints(38);
function polyDistance(x:number,z:number,points:Point[]){let inside=false,min=Infinity;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const [ax,az]=points[j],[bx,bz]=points[i],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
  const ex=x-ax-dx*t,ez=z-az-dz*t;min=Math.min(min,ex*ex+ez*ez);
  if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
}return Math.sqrt(min)*(inside?1:-1);}
function waterChannel(x:number,z:number,path:THREE.Vector3[],small=false){let result=-Infinity;for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  const width=small?9+10*(1-i/path.length):43+18*Math.sin((i+t)*.073)+12*Math.sin((i+t)*.193);
  result=Math.max(result,width-Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
}return result;}
function pathDistance(x:number,z:number,path:THREE.Vector3[]){let closest=Infinity;for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  closest=Math.min(closest,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
}return closest;}
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
// Cliffs belong on exposed sea headlands, not on both banks of a sheltered
// channel or around a small island. Cache this broad geomorphic context at
// 20 m so the 2.5 m height field does not repeat polygon/path searches.
const CONTEXT_RES=101,CONTEXT_STEP=20,context=new Float32Array(CONTEXT_RES*CONTEXT_RES);
const tidalContext=new Float32Array(context.length);
for(let j=0;j<CONTEXT_RES;j++)for(let i=0;i<CONTEXT_RES;i++){
  const x=i*CONTEXT_STEP-1000,z=j*CONTEXT_STEP-1000;
  const channelMask=1-smooth(85,185,Math.min(pathDistance(x,z,channel),pathDistance(x,z,tributary)));
  const lagoonMask=1-smooth(20,120,Math.min(...lagoons.map(p=>Math.abs(polyDistance(x,z,p)))));
  const islandMask=Math.max(...islands.map(p=>smooth(-40,0,polyDistance(x,z,p))));
  context[j*CONTEXT_RES+i]=Math.max(channelMask,lagoonMask,islandMask);
  // Small islands need low banks, but an exposed sea island is not a muddy
  // backwater. Keep hydrological shelter separate from the cliff mask.
  tidalContext[j*CONTEXT_RES+i]=Math.max(channelMask,lagoonMask);
}
function sampleContext(field:Float32Array,x:number,z:number){
  const fx=Math.max(0,Math.min(CONTEXT_RES-1.00001,(x+1000)/CONTEXT_STEP)),fz=Math.max(0,Math.min(CONTEXT_RES-1.00001,(z+1000)/CONTEXT_STEP));
  const i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j,k=j*CONTEXT_RES+i;
  return (field[k]*(1-tx)+field[k+1]*tx)*(1-tz)+(field[k+CONTEXT_RES]*(1-tx)+field[k+CONTEXT_RES+1]*tx)*tz;
}
export function shelteredShore(x:number,z:number){return sampleContext(context,x,z);}
export function tidalShelter(x:number,z:number){return sampleContext(tidalContext,x,z);}
function exactCoast(x:number,z:number){
  // Domain warp adds erosion-scale variation without changing the authored layout.
  const xx=x+4.5*Math.sin(z*.047+x*.019)+2*Math.sin(z*.119),zz=z+3.8*Math.sin(x*.039-z*.023)+1.8*Math.sin(x*.103);
  let d=polyDistance(xx,zz,mainland);
  for(const island of islands)d=Math.max(d,polyDistance(xx,zz,island));
  for(const lagoon of lagoons)d=Math.min(d,-polyDistance(xx,zz,lagoon));
  d=Math.min(d,-waterChannel(xx,zz,channel),-waterChannel(xx,zz,tributary,true));
  return d;
}
// Cache the signed coastline at 2.5 m; bilinear sampling keeps simulation fast.
// Prebaked once per load, shared by physics, terrain, splat painting and water.
const RES=801,STEP=2000/(RES-1),field=new Float32Array(RES*RES);
if(typeof window!=='undefined'){
  const response=await fetch('/world/coast-v2.bin');if(!response.ok)throw new Error('Coastline data is unavailable');
  const baked=new Int16Array(await response.arrayBuffer());for(let i=0;i<field.length;i++)field[i]=baked[i]/16;
}else for(let j=0;j<RES;j++)for(let i=0;i<RES;i++)field[j*RES+i]=exactCoast(i*STEP-1000,j*STEP-1000);
export const coastSamples=field;
export function naturalCoast(x:number,z:number){
  if(Math.abs(x)>1000||Math.abs(z)>1000)return -100;
  const fx=(x+1000)/STEP,fz=(z+1000)/STEP,ix=Math.min(RES-2,Math.floor(fx)),iz=Math.min(RES-2,Math.floor(fz)),tx=fx-ix,tz=fz-iz,k=iz*RES+ix;
  return (field[k]*(1-tx)+field[k+1]*tx)*(1-tz)+(field[k+RES]*(1-tx)+field[k+RES+1]*tx)*tz;
}
export function landNoise(x:number,z:number){return Math.sin(x*.006+Math.sin(z*.004)*1.5)*Math.cos(z*.005-x*.003)*.5+Math.sin(x*.019+z*.011)*.19+Math.sin(x*.041-z*.031)*.075;}
