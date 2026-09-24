import * as THREE from 'three';
import {coastDistance,rawHeight,clamp} from './terrain';
import {shelteredShore} from './geography';
import {createSurfaceField} from './surface';

export const farms=[{x:-190,z:390,w:205,h:405,a:.21},{x:690,z:345,w:235,h:285,a:-.15},{x:312,z:-720,w:180,h:230,a:-.24}];
export function farmAt(x:number,z:number){for(let i=0;i<farms.length;i++){const f=farms[i],dx=x-f.x,dz=z-f.z,u=dx*Math.cos(f.a)+dz*Math.sin(f.a),v=-dx*Math.sin(f.a)+dz*Math.cos(f.a);if(Math.abs(u)<f.w/2&&Math.abs(v)<f.h/2&&coastDistance(x,z)>26&&rawHeight(x,z)<25)return {i,u,v};}return null;}
export function createLandscapeData(){const n=1024,data=new Uint8Array(n*n*4);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=i/(n-1)*2000-1000,z=j/(n-1)*2000-1000,k=(j*n+i)*4,d=clamp(Math.round((coastDistance(x,z)+256)*64),0,65535);data[k]=d>>8;data[k+1]=d&255;data[k+2]=farmAt(x,z)?255:0;data[k+3]=Math.round(shelteredShore(x,z)*255);}
  const t=new THREE.DataTexture(data,n,n);t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
}
export function createSurfaceData(){
  const {data,size}=createSurfaceField();
  const texture=new THREE.DataTexture(data,size,size);texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.name='Moisture, road wear, slope deposits, path wear';texture.needsUpdate=true;return texture;
}
const sharedGLSL=`
uniform sampler2D landscapeData;
uniform sampler2D surfaceData;
varying vec3 terrainPosition;varying vec3 terrainNormal;varying float terrainBroadSlope;
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x),f.y);}
float terrainNoise(vec2 p){return noise2(p)*.57+noise2(p*2.13)*.28+noise2(p*4.71)*.15;}
// Analytic value-noise gradient. This perturbs the continuous terrain normal;
// it never derives a face normal from the underlying triangle's derivatives.
vec3 noiseGradient(vec2 p){
  vec2 cell=floor(p),f=fract(p),u=f*f*(3.0-2.0*f),du=6.0*f*(1.0-f);
  float a=hash2(cell),b=hash2(cell+vec2(1,0)),c=hash2(cell+vec2(0,1)),d=hash2(cell+vec2(1,1));
  return vec3(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(b-a,d-c,u.y)*du.x,mix(c-a,d-b,u.x)*du.y);
}
`;
// Broad painted color masses, mineral seams and soft tonal variation. The
// landscape mask is shared with the water so sand and foam meet at one contour.
export function terrainPBR(data:THREE.Texture,surfaceData:THREE.Texture){
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{landscapeData:{value:data},surfaceData:{value:surfaceData}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float broadSlope;varying vec3 terrainPosition;varying vec3 terrainNormal;varying float terrainBroadSlope;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nterrainPosition=(modelMatrix*vec4(transformed,1.0)).xyz;terrainNormal=normalize(mat3(modelMatrix)*objectNormal);terrainBroadSlope=broadSlope;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+sharedGLSL);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 wp=terrainPosition.xz;vec2 landscapeUV=(wp+1000.0)/2000.0;
      vec4 land=texture2D(landscapeData,landscapeUV),context=texture2D(surfaceData,landscapeUV);
      float shore=(land.r*65280.0+land.g*255.0)/64.0-256.0;
      float broad=terrainNoise(wp*.017),brush=terrainNoise(wp*.085);
      float up=abs(normalize(terrainNormal).y);
      float slope=max(0.0,terrainBroadSlope+(broad-.5)*.035+(brush-.5)*.014);
      float rock=smoothstep(.11,.52,slope)*smoothstep(2.5,10.0,terrainPosition.y);
      rock=max(rock,smoothstep(88.0,150.0,terrainPosition.y)*smoothstep(.12,.50,slope)*.45);
      float shelter=land.a;
      float beach=(1.0-smoothstep(mix(15.0,4.0,shelter),mix(31.0,15.0,shelter),shore+(broad-.5)*9.0))*(1.0-rock)*(1.0-smoothstep(7.0,21.0,terrainPosition.y));
      float moisture=context.r*(1.0-smoothstep(12.0,35.0,terrainPosition.y));
      float wet=(1.0-smoothstep(1.0,11.0,shore+(brush-.5)*2.8))*(1.0-smoothstep(1.0,6.0,terrainPosition.y));
      float fineFade=(1.0-smoothstep(65.0,220.0,distance(cameraPosition,terrainPosition)))*(1.0-smoothstep(.4,1.4,length(fwidth(wp))));
      float microFade=(1.0-smoothstep(35.0,110.0,distance(cameraPosition,terrainPosition)))*(1.0-smoothstep(.03,.13,length(fwidth(wp))));
      float micro=.5;if(microFade>.01)micro=noise2(wp*5.7);
      vec3 grain=vec3(.5,0,0),rockGrain=grain;
      if(fineFade>.01){grain=noiseGradient(wp*.85);if(rock>.05)rockGrain=noiseGradient(vec2(wp.x*.65+wp.y*.4,terrainPosition.y*.65));}
      // Surface processes drive coverage; noise only breaks up their margins.
      float erosion=smoothstep(.018,.12,slope)*(1.0-rock)*smoothstep(.42,.72,brush)*(1.0-moisture*.8);
      float soil=max(context.a*.70,max(context.g*.18,erosion*.42))*(1.0-beach)*(1.0-rock);
      float gravel=max(context.g*.32,context.b*(.68+brush*.3));
      gravel=max(gravel,erosion*.23)*(1.0-rock)*(1.0-beach*.78)*smoothstep(1.0,5.0,shore);
      float mud=smoothstep(.28,.75,moisture)*smoothstep(.3,.85,shelter)*(1.0-smoothstep(.025,.2,slope))*(1.0-smoothstep(6.0,26.0,shore))*.75;
      mud=max(mud,max(context.a,context.g*.55)*smoothstep(.18,.65,moisture)*.8);
      mud*=1.0-rock;mud*=.72+smoothstep(.22,.74,brush)*.28;
      vec3 grassC=mix(vec3(.245,.385,.047),vec3(.45,.565,.105),smoothstep(.23,.8,broad));
      grassC*=.88+brush*.24+(grain.x-.5)*fineFade*.20+(micro-.5)*microFade*.08;
      grassC=mix(grassC,grassC*vec3(.87,.94,.88),moisture*.35);
      vec3 sandC=mix(vec3(.76,.61,.355),vec3(.40,.32,.20),wet*.83);
      sandC=mix(sandC,vec3(.48,.445,.285),shelter*.28);
      sandC*=.9+brush*.20+(grain.x-.5)*fineFade*.18+(micro-.5)*microFade*.07;
      vec3 soilC=mix(vec3(.36,.285,.15),vec3(.52,.425,.255),brush);
      soilC*=.97+(grain.x-.5)*fineFade*.24+(micro-.5)*microFade*.12;
      vec3 gravelC=mix(vec3(.34,.355,.28),vec3(.50,.465,.35),brush);
      gravelC+=(smoothstep(.56,.8,grain.x)-.25)*fineFade*.14+(micro-.5)*microFade*.12;
      vec3 mudC=mix(vec3(.21,.205,.125),vec3(.34,.295,.175),brush);
      mudC*=.97+(grain.x-.5)*fineFade*.10+(micro-.5)*microFade*.035;
      // Long vertical fissures and broad, slanted rock planes read at both
      // ground and overview scale; subtle warm caps catch the afternoon light.
      vec2 seamUV=vec2(wp.x*.105+wp.y*.066,terrainPosition.y*.022);
      float seams=terrainNoise(seamUV+vec2(terrainPosition.y*.009,0.0));
      float fissure=1.0-smoothstep(.23,.33,seams);
      vec3 rockC=mix(vec3(.225,.278,.292),vec3(.43,.43,.35),smoothstep(.27,.72,seams));
      rockC*=1.0-fissure*.27;
      float strata=(noise2(vec2(wp.x*.021+wp.y*.015,terrainPosition.y*.16))-.5)*.045;
      rockC+=strata+(rockGrain.x-.5)*fineFade*.08;rockC=mix(rockC,vec3(.59,.535,.38),smoothstep(.58,.9,up)*.5);
      vec3 albedo=mix(grassC,soilC,soil);albedo=mix(albedo,gravelC,gravel);
      albedo=mix(albedo,sandC,beach);albedo=mix(albedo,rockC,rock);albedo=mix(albedo,mudC,mud);
      // Preserve existing paddy districts as quiet, irregular painted parcels.
      float fa=wp.x<0.0?.21:(wp.y<0.0?-.24:-.15);vec2 fp=mat2(cos(fa),-sin(fa),sin(fa),cos(fa))*wp;
      vec2 fieldCell=floor((fp+vec2(terrainNoise(wp*.008)*12.0,0.0))/vec2(48.0,64.0));
      vec2 edge=abs(fract(fp/vec2(48.0,64.0))-.5);float bund=smoothstep(.477,.497,max(edge.x,edge.y));
      vec3 crop=mix(vec3(.31,.44,.08),vec3(.50,.56,.16),hash2(fieldCell));
      float field=land.b*(1.0-beach)*(1.0-rock)*(1.0-soil)*(1.0-mud);
      albedo=mix(albedo,crop,field*.48);
      albedo=mix(albedo,mix(soilC,mudC,moisture),bund*field*.19);
      diffuseColor.rgb*=albedo;
      float groundRoughness=mix(.98,.92,beach);
      groundRoughness=mix(groundRoughness,.60,wet*beach);groundRoughness=mix(groundRoughness,.68,mud);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=groundRoughness;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      vec3 smoothNormal=normalize(terrainNormal);
      float relief=mix(.06,.065,beach);relief=mix(relief,.13,gravel);relief=mix(relief,.025,mud);
      vec3 surfaceGradient=vec3(grain.y,0.0,grain.z)*relief;
      vec3 mineralGradient=vec3(rockGrain.y*.65,rockGrain.z*.65,rockGrain.y*.4)*.075;
      surfaceGradient=mix(surfaceGradient,mineralGradient,rock)*fineFade;
      surfaceGradient-=smoothNormal*dot(surfaceGradient,smoothNormal);
      normal=normalize(mat3(viewMatrix)*normalize(smoothNormal-surfaceGradient));
    `);
  };mat.customProgramCacheKey=()=> 'malabar-location-aware-surfaces-v5';return mat;
}
export function roadPBR(kind:'main'|'secondary'|'path',data:THREE.Texture,surfaceData:THREE.Texture){
  const mat=new THREE.MeshStandardMaterial({color:kind==='path'?0xffffff:kind==='secondary'?'#898b78':'#747d73',roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-3,transparent:kind==='path',depthWrite:kind!=='path',alphaTest:kind==='path'?.02:0});
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{landscapeData:{value:data},surfaceData:{value:surfaceData}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 surfaceUv;varying vec2 roadUv;varying vec3 terrainPosition;varying vec3 terrainNormal;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nterrainPosition=(modelMatrix*vec4(transformed,1.0)).xyz;roadUv=surfaceUv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 roadUv;\n'+sharedGLSL)
      .replace('#include <map_fragment>',`
        vec2 wp=terrainPosition.xz,uv=(wp+1000.0)/2000.0;vec4 context=texture2D(surfaceData,uv),land=texture2D(landscapeData,uv);
        float shore=(land.r*65280.0+land.g*255.0)/64.0-256.0;
        float wet=context.r*(1.0-smoothstep(6.0,24.0,terrainPosition.y))*smoothstep(0.0,4.0,shore);
        float brush=terrainNoise(wp*.22),edge=abs(roadUv.x);
        float detailFade=(1.0-smoothstep(50.0,170.0,distance(cameraPosition,terrainPosition)))*(1.0-smoothstep(.25,1.2,length(fwidth(wp))));
        float aggregate=.5;if(detailFade>.01)aggregate=noise2(wp*2.5);
        ${kind==='path'?`
          vec3 dirt=mix(vec3(.43,.345,.21),vec3(.56,.46,.28),brush);
          dirt=mix(dirt,vec3(.245,.225,.145),wet*(.6+brush*.25));
          dirt*=.95+(aggregate-.5)*detailFade*.08+(1.0-smoothstep(.1,.8,edge))*.065;
          diffuseColor.rgb*=dirt;
          diffuseColor.a*=(1.0-smoothstep(.62,1.0,edge))*(1.0-smoothstep(.80,.99,context.g));
        `:`
          diffuseColor.rgb*=.94+brush*.12+(aggregate-.5)*detailFade*.10;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.385,.26),smoothstep(.68,1.0,edge)*.16*(1.0-wet));
          diffuseColor.rgb*=1.0-wet*.12;
        `}
        float roadRoughness=mix(.97,${kind==='path'?'.68':'.82'},wet);
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=roadRoughness;');
  };mat.customProgramCacheKey=()=>`painted-road-${kind}-surface-v3`;return mat;
}
