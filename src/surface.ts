import {clamp,coastDistance,rawHeight,roads,smooth,hillTownSites} from './terrain.js';
import {tidalShelter} from './geography.js';
import {townBuildings} from './towns.js';

export type SurfaceField={data:Uint8Array;size:number};
// R: moisture, G: paved-road wear, B: loose deposits below slopes,
// A: unpaved-route wear. This is environmental data, never a colour texture.
// A small shared raster adds no geometry and is independent of sector LOD.
export function createSurfaceField(size=512):SurfaceField {
  const step=2000/size,data=new Uint8Array(size*size*4),heights=new Float32Array(size*size);
  const coordinate=(i:number)=>(i+.5)*step-1000;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++)heights[j*size+i]=rawHeight(coordinate(i),coordinate(j));
  const sample=(i:number,j:number)=>heights[clamp(j,0,size-1)*size+clamp(i,0,size-1)];
  const reach=Math.max(1,Math.round(16/step)),span=reach*step;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const x=coordinate(i),z=coordinate(j),h=sample(i,j),shore=coastDistance(x,z),k=(j*size+i)*4;
    const a=sample(i-reach,j),b=sample(i+reach,j),c=sample(i,j-reach),d=sample(i,j+reach);
    const gradient=Math.hypot(b-a,d-c)/(span*2),concavity=(a+b+c+d)/4-h;
    const low=1-smooth(3,19,h),water=1-smooth(4,95,shore),shelter=tidalShelter(x,z);
    const collected=smooth(.15,2.6,concavity)*(1-smooth(.25,.8,gradient));
    const moisture=clamp(water*low*(.26+shelter*.74)+collected*.25*(1-smooth(25,100,h)),0,1);
    const rise=Math.max(a,b,c,d)-h;
    const deposits=smooth(3,13,rise)*smooth(.25,3.5,concavity)*(1-smooth(.28,.95,gradient))*smooth(0,7,shore);
    data[k]=Math.round(moisture*255);data[k+2]=Math.round(deposits*255);
  }
  // Rasterise segments once, instead of searching every road at every pixel
  // each frame. Bridges leave no gravel stripe across the bed beneath them.
  function paint(ax:number,az:number,bx:number,bz:number,width:number,path:boolean,ay?:number,by?:number){
    const channel=path?3:1,skirt=path?3.2:3.6,reach=width/2+skirt+step*.5;
    const x0=clamp(Math.floor((Math.min(ax,bx)-reach+1000)/step),0,size-1),x1=clamp(Math.ceil((Math.max(ax,bx)+reach+1000)/step),0,size-1);
    const z0=clamp(Math.floor((Math.min(az,bz)-reach+1000)/step),0,size-1),z1=clamp(Math.ceil((Math.max(az,bz)+reach+1000)/step),0,size-1);
    const dx=bx-ax,dz=bz-az,len2=dx*dx+dz*dz||1;
    for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++){
      const x=coordinate(i),z=coordinate(j),t=clamp(((x-ax)*dx+(z-az)*dz)/len2,0,1);
      const distance=Math.hypot(x-ax-dx*t,z-az-dz*t),k=(j*size+i)*4;
      if(distance>reach||coastDistance(x,z)<1)continue;
      if(ay!==undefined&&by!==undefined&&sample(i,j)<1&&ay+(by-ay)*t>4)continue;
      const coverage=1-smooth(width/2-.5,width/2+skirt,distance);
      data[k+channel]=Math.max(data[k+channel],Math.round(coverage*255));
    }
  }
  for(const road of roads)for(let i=1;i<road.path.length;i++){
    const a=road.path[i-1],b=road.path[i];paint(a.x,a.z,b.x,b.z,road.width,road.trail,a.y,b.y);
  }
  for(const b of townBuildings)paint(b.x,b.z,b.roadX,b.roadZ,1.3,true);
  const summitRoads=roads.filter(r=>r.id==='Southern summit road'||r.id.startsWith('Hilltop')).flatMap(r=>r.path);
  for(const [x,z] of hillTownSites){const p=summitRoads.reduce((a,b)=>Math.hypot(b.x-x,b.z-z)<Math.hypot(a.x-x,a.z-z)?b:a);paint(x,z,p.x,p.z,1.45,true);}
  return {data,size};
}

export function sampleSurfaceField(field:SurfaceField,x:number,z:number){
  const u=clamp((x+1000)/2000*field.size-.5,0,field.size-1.00001),v=clamp((z+1000)/2000*field.size-.5,0,field.size-1.00001);
  const i=Math.floor(u),j=Math.floor(v),tx=u-i,tz=v-j,channel=(c:number)=>{
    const read=(dx:number,dz:number)=>field.data[((j+dz)*field.size+i+dx)*4+c]/255;
    return (read(0,0)*(1-tx)+read(1,0)*tx)*(1-tz)+(read(0,1)*(1-tx)+read(1,1)*tx)*tz;
  };
  return {moisture:channel(0),roadWear:channel(1),deposits:channel(2),pathWear:channel(3)};
}
