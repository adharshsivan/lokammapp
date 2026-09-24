import {naturalCoast,landNoise,shelteredShore} from './geography.js';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const fade=(t:number)=>t*t*t*(t*(t*6-15)+10);
function hash(x:number,z:number){let n=Math.imul(x,374761393)^Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295*2-1;}
export function noise(x:number,z:number){
  const ix=Math.floor(x),iz=Math.floor(z),u=fade(x-ix),v=fade(z-iz);
  const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
const peaks=[[705,-710,215,105],[810,-455,175,90],[805,-95,170,82],[815,735,155,125],[-390,-420,115,22]];
function displacedHeight(x:number,z:number,d:number){
  if(d<=0)return Math.max(-28,d*.16);
  const beach=smooth(0,46,d);
  // Keep the existing peak anchors. A broad envelope carries the mass;
  // domain-warped secondary ridges flow between peaks rather than repeating
  // the former high-amplitude sine-wave pattern across every mountain.
  const broad=noise(x*.0035,z*.0035);
  const wx=x+24*noise(x*.005+11,z*.005-3),wz=z+20*noise(x*.005-7,z*.005+19);
  const ridge=1-Math.sqrt(noise(wx*.012,wz*.008)**2+.035);
  const secondary=.7*noise(wx*.014+4,wz*.011)+.3*noise(wx*.029,wz*.024+9);
  let h=2.4+d*.025+4*landNoise(x,z);
  for(const [px,pz,r,height] of peaks){
    const rx=pz===735?155:r,rz=pz===735?180:r;
    const e=Math.exp(-((x-px)**2/(rx*rx)+(z-pz)**2/(rz*rz)));
    const coastEnvelope=pz===735?smooth(18,105,d):1;
    h+=height*e*(.89+.055*broad+.065*(ridge-.5)+.025*secondary)*coastEnvelope;
  }
  // The southeast peninsula rises as a linked shoulder and watershed before
  // reaching its summit. Both fade well inland of the existing shoreline.
  const shoulder=Math.exp(-((x-745)**2/(145*145)+(z-760)**2/(155*155)));
  const fold=.5+.5*noise((x+z*.32)*.012,(z-x*.14)*.008);
  h+=13*shoulder*(.7+.3*fold)*smooth(9,52,d);
  const westRidge=Math.exp(-((x-750)**2/(145*145)+(z-825)**2/(145*145)));
  h+=28*westRidge*smooth(40,110,d);
  const northRidge=Math.exp(-((x-825)**2/(100*100)+(z-675)**2/(130*130)));
  h+=13*northRidge*smooth(38,95,d);
  const eastSpur=Math.exp(-((x-815)**2/(100*100)+(z-765)**2/(92*92)));
  const upperGully=Math.exp(-((x-775)**2/(82*82)+(z-687)**2/(65*65)));
  h+=8*eastSpur*smooth(28,78,d)-9*upperGully*smooth(45,105,d);
  const headland=smooth(-.26,.38,Math.sin(z*.009+x*.003)+.38*Math.sin(x*.017-z*.005))*(1-smooth(160,420,x));
  const setback=23+4*Math.sin(x*.026+z*.014)+2*Math.sin(z*.067);
  const width=17+4*noise(x*.013+2,z*.013);
  const scarp=smooth(setback,setback+width,d);
  const upland=25+13*(.5+.5*Math.sin(z*.012-x*.007));
  // Broad shallow drainage folds retain the cliff silhouette without the
  // evenly spaced, razor-shaped grooves of the former power-of-sine mask.
  const drainage=1-.085*smooth(.05,.7,noise(wx*.035,wz*.019));
  // The estuary beside the lighthouse has a low, eroded approach rather than
  // a sheer shelf under its bridge landing.
  const estuaryNotch=1-clamp(.72*Math.exp(-((x-120)**2/(145*145)+(z-805)**2/(100*100)))+.55*Math.exp(-((x-250)**2/(105*105)+(z-840)**2/(85*85))),0,.85);
  const peninsula=Math.exp(-((x-775)**2/(270*270)+(z-765)**2/(260*260)));
  const shelf=upland*scarp*(1-smooth(85,220,d))*drainage*estuaryNotch*(1-.48*peninsula)*(1-smooth(.2,.75,shelteredShore(x,z)));
  const detail=(.13*noise(x*.08,z*.08)+.045*noise(x*.17+8,z*.17))*smooth(12,50,d);
  const mountain=d*.075*(1-beach)+Math.max(3,h)*beach+headland*shelf+detail;
  // A gently sloped, broad upper bench gives the hill town real building
  // ground. Its long feathered rim merges into the watershed instead of
  // forming a cylindrical mesa or changing the actual shoreline.
  const townRadius=Math.hypot((x-775)/105,(z-713)/85);
  const townWeight=(1-smooth(.58,1.38,townRadius))*smooth(38,88,d);
  const townLevel=97+.023*(x-775)-.014*(z-713)+.3*noise(x*.018,z*.018);
  // A shallow inland saddle carries Malappuram's small market away from the
  // riverbank. The long falloff follows the existing hill instead of making a
  // raised, hard-edged town platform.
  const marketRadius=Math.hypot((x+185)/84,(z+220)/84);
  const marketWeight=(1-smooth(.36,1.34,marketRadius))*smooth(35,95,d)*.75;
  const marketLevel=16-.025*(x+185)+.011*(z+220)+.25*noise(x*.017,z*.017);
  const shaped=mountain+(townLevel-mountain)*townWeight;
  const marketShaped=shaped+(marketLevel-shaped)*marketWeight;
  // Palakkad occupies a broad pass-side terrace, eased into the western
  // slopes of the eastern range. Its edge remains a hillside, not a mesa.
  const passRadius=Math.hypot((x-680)/85,(z+90)/80);
  const passWeight=(1-smooth(.42,1.45,passRadius))*smooth(32,85,d)*.88;
  const passLevel=49+.016*(x-680)-.008*(z+90)+.25*noise(x*.016,z*.016);
  return marketShaped+(passLevel-marketShaped)*passWeight;
}

// A shared, deterministic height field: relax displacement once, not each LOD
// independently. This preserves identical elevations at all sector seams.
const RES=801,STEP=2.5;
let field=new Float32Array(RES*RES);
const coast=new Float32Array(field.length);
for(let j=0;j<RES;j++)for(let i=0;i<RES;i++){
  const x=i*STEP-1000,z=j*STEP-1000,k=j*RES+i,d=naturalCoast(x,z);
  coast[k]=d;field[k]=displacedHeight(x,z,d);
}
for(let pass=0;pass<2;pass++){
  const next=field.slice();
  for(let j=1;j<RES-1;j++)for(let i=1;i<RES-1;i++){
    const k=j*RES+i;if(coast[k]<12)continue;
    const h=field[k],a=field[k-1],b=field[k+1],c=field[k-RES],d=field[k+RES];
    const slope=Math.hypot(a-b,c-d)/(STEP*2),laplacian=(a+b+c+d)*.25-h;
    // Bilateral relaxation: limit both curvature loss and displacement on
    // scarps. Low-curvature ridgelines survive; grid-scale bumps soften.
    const strength=.28/(1+slope*slope*4+Math.abs(laplacian)*2);
    next[k]=h+clamp(laplacian*strength,-.22,.22);
  }
  field=next;
}
function cubic(a:number,b:number,c:number,d:number,t:number){return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
export function elevationHeight(x:number,z:number){
  const shore=naturalCoast(x,z);
  // Pin the original shoreline and tidal strip exactly; no smoothing or
  // cubic overshoot can move the zero-height contour into land or water.
  if(shore<10)return displacedHeight(x,z,shore);
  const fx=(x+1000)/STEP,fz=(z+1000)/STEP,ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
  const sample=(i:number,j:number)=>field[clamp(j,0,RES-1)*RES+clamp(i,0,RES-1)];
  const row=(j:number)=>cubic(sample(ix-1,j),sample(ix,j),sample(ix+1,j),sample(ix+2,j),tx);
  const h=cubic(row(iz-1),row(iz),row(iz+1),row(iz+2),tz);
  if(shore<14){const t=smooth(10,14,shore);return displacedHeight(x,z,shore)*(1-t)+h*t;}
  return h;
}
