import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World,makePlayer,obstacles } from './world';
import { landmarks,roads,towns,terrainHeight,terrainColor,surface,nearestRoad,rawHeight,clamp,canTraverse } from './terrain';
import {townBuildings,townInterests} from './towns';
import './style.css';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const icons={compass:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/></svg>',sound:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 5 6 9H3v6h3l5 4V5ZM15 8q6 4 0 8M18 5q9 7 0 14"/></svg>',settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="#f5f2e9"/><circle cx="15" cy="17" r="3" fill="#f5f2e9"/></svg>',arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 19 19 5M5 5h14v14"/></svg>',map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2V5ZM9 3v15M15 6v15"/></svg>'};
$('app').innerHTML=`
  <div id="viewport" aria-label="Interactive 3D Kerala coastal world"></div>
  <header><a class="brand" href="#" aria-label="Malabar home">${icons.compass}<span>malabar<span class="brand-dot">.</span></span><span class="edition">A WORLD TO WANDER</span></a><nav><button class="nav-active" id="world-nav">The world</button><button id="notes-nav">Field notes <span id="visited-count">0/6</span></button><button id="help-nav">How to explore</button></nav><div class="header-actions"><button id="sound" class="icon-button" aria-label="Enable ambient sound" title="Ambient sound">${icons.sound}</button><button id="settings" class="icon-button" aria-label="Open settings">${icons.settings}</button><span class="live-dot"></span><span class="live-label">LIVE WORLD</span></div></header>
  <aside id="intro"><div class="eyebrow"><span></span> KERALA, REIMAGINED</div><h1>Take the <br>scenic <em>route.</em></h1><p class="intro-copy">Salt in the air. Green as far as you can see.<br>A little world with room to get lost.</p><div class="stats"><div><strong>4 <small>km²</small></strong><span>ONE OPEN WORLD</span></div><div><strong>13</strong><span>TOWNS NORTH TO SOUTH</span></div></div><button class="primary" id="explore">Start wandering ${icons.arrow}</button><p class="no-rush">No missions. No hurry. Just explore.</p><div class="divider"></div><div class="section-label">CHOOSE YOUR FIRST STOP <span>↓</span></div><div id="destinations"></div><div class="inspired"><span>✳</span> Inspired by the Malabar Coast<br><span class="inspired-sub">Made for the curious.</span></div></aside>
  <div id="scene-top"><div class="scene-pill"><span class="live-dot"></span><span id="mode-label">WORLD OVERVIEW</span></div><div class="weather"><span>☀</span><div>Golden afternoon<small>26° C · A gentle sea breeze</small></div></div></div>
  <div id="poi-layer"></div>
  <div class="ocean-label" id="ocean-label">A R A B I A N &nbsp; S E A</div>
  <div id="walk-hud" class="hidden"><span class="eyebrow">YOU ARE EXPLORING</span><h2 id="location-name">Veli Lighthouse</h2><p id="location-sub">Coastal road · 8 m above sea level</p></div>
  <div id="crosshair" class="hidden">+</div>
  <div id="toast" role="status"></div>
  <div id="bottom-controls"><div class="control-hint" id="control-hint"><span>↔</span> Drag to orbit <i></i> Scroll to zoom</div><div class="view-switch"><button id="overview" class="selected">${icons.map} Overview</button><button id="onfoot">${icons.compass} On foot</button><button id="camera-mode" class="hidden" title="Switch camera (V)">3rd person</button></div></div>
  <div id="right-tools"><button id="north" class="north-button" aria-label="Reset north view">N<span>↑</span></button><div class="zoom-buttons"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button></div><button id="labels" class="icon-button active" aria-label="Toggle place labels" title="Place labels">⌖</button></div>
  <button id="minimap-button" aria-label="Open world atlas"><div class="minimap-heading">THE MALABAR COAST <span>↗</span></div><canvas id="minimap" width="240" height="240"></canvas><div class="map-scale"><span>0</span><i></i><span>500 m</span></div></button>
  <footer><span>10° N &nbsp; 76° E <b>·</b> A fictional coastal escape</span><span id="performance">2,000 × 2,000 m <b>·</b> Seamless exploration</span></footer>
  <div id="touch-controls" class="hidden"><div id="joystick"><div id="stick"></div></div><div class="touch-actions"><button id="touch-run">RUN</button><button id="touch-jump">↑</button></div></div>
  <dialog id="modal"><button id="close-modal" aria-label="Close dialog">×</button><div id="modal-body"></div></dialog>
  <div id="loading"><div class="brand">malabar.</div><p>Finding the scenic route…</p><div class="load-line"></div></div>
`;

let renderer:THREE.WebGLRenderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});} catch { $('loading').innerHTML='<h2>This world needs WebGL 2</h2><p>Please open it in a browser with hardware acceleration enabled.</p>';throw new Error('WebGL unavailable'); }
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('viewport').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#b5dfe0');scene.fog=new THREE.FogExp2('#b5dfe0',.00015);
const sky=new THREE.Mesh(new THREE.SphereGeometry(6500,20,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec3 vDirection;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.0);vec3 col=mix(vec3(.74,.82,.76),vec3(.23,.48,.65),pow(h,.5));vec2 p=d.xz/(max(d.y,.08))*2.0;float n=noise(p)*.6+noise(p*2.2)*.27+noise(p*4.5)*.13;float clouds=smoothstep(.57,.8,n)*smoothstep(.05,.23,h)*(1.0-smoothstep(.65,.95,h));col=mix(col,vec3(.95,.95,.84),clouds*.65);gl_FragColor=vec4(col,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}));sky.renderOrder=-10;scene.add(sky);
const camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.1,14000);
const hemi=new THREE.HemisphereLight('#d8f1ef','#677b6f',1.35);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff0cb',2.0);sun.position.set(-500,750,250);scene.add(sun);scene.add(sun.target);
sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-85;sun.shadow.camera.right=85;sun.shadow.camera.top=85;sun.shadow.camera.bottom=-85;sun.shadow.camera.near=1;sun.shadow.camera.far=1100;sun.shadow.normalBias=.45;sun.shadow.bias=-.0002;
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=100;controls.maxDistance=5500;controls.maxPolarAngle=Math.PI*.47;controls.target.set(60,0,40);
camera.position.set(1160,1710,1960);controls.update();
// Let the loading state paint before deterministic world generation.
await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const world=new World(scene,renderer),avatar=makePlayer();scene.add(avatar.group);avatar.group.visible=false;
const roadsToggle=document.createElement('button');roadsToggle.id='roads-toggle';roadsToggle.className='road-toggle active';roadsToggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3 4 21M17 3l3 18M12 3v4m0 3v4m0 3v4"/></svg><span>Roads</span>';roadsToggle.setAttribute('aria-label','Toggle road meshes');roadsToggle.setAttribute('aria-pressed','true');roadsToggle.title='Show / hide road and bridge meshes (R)';document.querySelector('.header-actions')!.prepend(roadsToggle);
function toggleRoads(){world.setRoadsVisible(!world.roadGroup.visible);roadsToggle.classList.toggle('active',world.roadGroup.visible);roadsToggle.setAttribute('aria-pressed',String(world.roadGroup.visible));showToast(world.roadGroup.visible?'Road and bridge meshes shown':'Road meshes hidden · R to show again');}
roadsToggle.onclick=toggleRoads;
const player={x:85,z:800,y:surface(85,800),vy:0,yaw:1.95,pitch:.12,distance:6,first:false};
let mode:'overview'|'walk'='overview',lowQuality=matchMedia('(pointer: coarse)').matches,labelsVisible=true,selected=0,travelled=0,running=false,frames=0,fps=60,lastFps=performance.now(),lastStream=0,elapsed=0,lastTime=performance.now(),toastUntil=0;
const visited=new Set<number>(),keys=new Set<string>();let touchMove={x:0,y:0};let paused=false;
try {const saved=JSON.parse(localStorage.getItem('malabar-journal')||'null');if(saved){for(const i of saved.visited||[])if(Number.isInteger(i)&&i>=0&&i<6)visited.add(i);travelled=Math.max(0,Number(saved.travelled)||0);$('visited-count').textContent=`${visited.size}/6`;}} catch { /* A private browser may disable persistent storage. */ }
function saveJournal(){try{localStorage.setItem('malabar-journal',JSON.stringify({visited:[...visited],travelled}));}catch{/* Exploration works without storage. */}}
addEventListener('pagehide',saveJournal);
const mapBase=document.createElement('canvas');mapBase.width=mapBase.height=400;const mapCtx=mapBase.getContext('2d')!,mapPixels=mapCtx.createImageData(400,400);
for(let j=0;j<400;j++)for(let i=0;i<400;i++){const x=i/400*2000-1000,z=j/400*2000-1000,h=terrainHeight(x,z),c=h<0?new THREE.Color('#57bfc0'):terrainColor(x,z,h).convertLinearToSRGB();const k=(j*400+i)*4;mapPixels.data.set([c.r*255,c.g*255,c.b*255,255],k);}
mapCtx.putImageData(mapPixels,0,0);

function showToast(message:string) {$('toast').textContent=message;$('toast').classList.add('show');toastUntil=elapsed+4;}
function setOverview(){mode='overview';controls.enabled=true;camera.fov=44;camera.near=5;camera.updateProjectionMatrix();resize();const factor=1.18/Math.min(1,camera.aspect);camera.position.set(700*factor,1950*factor,1900*factor);controls.target.set(100,0,15);controls.update();document.exitPointerLock?.();avatar.group.visible=false;document.body.classList.remove('walking');$('intro').classList.remove('hidden');$('walk-hud').classList.add('hidden');$('crosshair').classList.add('hidden');$('camera-mode').classList.add('hidden');$('touch-controls').classList.add('hidden');$('overview').classList.add('selected');$('onfoot').classList.remove('selected');$('mode-label').textContent='WORLD OVERVIEW';$('control-hint').innerHTML='<span>↔</span> Drag to orbit <i></i> Scroll to zoom';scene.fog=new THREE.FogExp2('#c4dddc',.00010);sun.castShadow=false;sun.position.set(-500,750,250);sun.target.position.set(0,0,0);}
function enterWorld(index=selected,teleport=true) {
  if(teleport){const l=landmarks[index];player.x=l.x;player.z=l.z;player.y=surface(l.x,l.z);player.vy=0;player.yaw=index===0?1.95:index===2?1.6:index===4?2.1:0;selected=index;}
  mode='walk';resize();controls.enabled=false;camera.fov=66;camera.near=.12;camera.updateProjectionMatrix();document.body.classList.add('walking');$('intro').classList.add('hidden');$('walk-hud').classList.remove('hidden');$('camera-mode').classList.remove('hidden');$('crosshair').classList.toggle('hidden',!player.first);$('overview').classList.remove('selected');$('onfoot').classList.add('selected');$('mode-label').textContent='ON FOOT · FREE EXPLORATION';$('control-hint').innerHTML='<kbd>W A S D</kbd> move <kbd>SHIFT</kbd> run <kbd>V</kbd> camera <kbd>M</kbd> map';if(matchMedia('(pointer:coarse)').matches)$('touch-controls').classList.remove('hidden');scene.fog=new THREE.FogExp2('#c4dddc',lowQuality?.00125:.0008);sun.castShadow=!lowQuality;showToast('Take your time. Click or drag the world to look around.');camera.position.set(player.x+6,player.y+4,player.z+6);syncDestination();
}
function syncDestination() {document.querySelectorAll('.destination').forEach((el,i)=>el.classList.toggle('active',i===selected));}
$('destinations').innerHTML=landmarks.slice(0,3).map((l,i)=>`<button class="destination ${i===0?'active':''}" data-index="${i}"><span class="dest-icon">${l.icon}</span><span><strong>${l.name}</strong><small>${l.type}</small></span><span class="dest-arrow">↗</span></button>`).join('')+'<button class="all-places" id="all-places">View all places <span>06 &nbsp; →</span></button>';
document.querySelectorAll<HTMLElement>('.destination').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.index);syncDestination();focusPlace(selected);});
const labelElements=landmarks.map((l,i)=>{const b=document.createElement('button');b.className='poi';b.innerHTML=`<span class="poi-dot">${l.icon}</span><span class="poi-text">${l.name}</span>`;b.onclick=()=>{selected=i;syncDestination();openPlace(i);};$('poi-layer').appendChild(b);return b;});
function focusPlace(i:number) {const l=landmarks[i];if(mode==='overview'){controls.target.set(l.x,0,l.z);camera.position.set(l.x+480,750,l.z+880);}else openPlace(i);}
function openModal(html:string) {paused=true;keys.clear();touchMove={x:0,y:0};document.exitPointerLock?.();$('modal-body').innerHTML=html;$<HTMLDialogElement>('modal').showModal();}
function closeModal() {$<HTMLDialogElement>('modal').close();paused=false;}
function openPlace(i:number) {const l=landmarks[i];openModal(`<div class="eyebrow">${l.type}</div><div class="place-emblem">${l.icon}</div><h2>${l.name}</h2><p>${l.description}</p><div class="place-meta"><span>${Math.round(surface(l.x,l.z))} m elevation</span><span>${visited.has(i)?'✓ Discovered':'Yet to discover'}</span></div><button class="primary" id="travel-place">Wander here ${icons.arrow}</button>`);$('travel-place').onclick=()=>{closeModal();enterWorld(i);};}
function enterTown(index:number){
  const town=towns[index],site=townBuildings.find(b=>b.town===town.name);
  if(!site)return;
  player.x=site.roadX;player.z=site.roadZ;player.y=surface(player.x,player.z);player.vy=0;player.yaw=site.heading;
  enterWorld(selected,false);showToast(`Welcome to ${town.name}`);
}
function enterInterest(index:number){
  const interest=townInterests[index];player.x=interest.spawnX;player.z=interest.spawnZ;player.y=surface(player.x,player.z);player.vy=0;player.yaw=Math.atan2(interest.x-player.x,interest.z-player.z);
  enterWorld(selected,false);showToast(`${interest.town} · ${interest.name}`);
}
function openAtlas() {
  openModal(`<div class="eyebrow">NORTH ↑ · YOUR FIELD NOTES</div><h2>From Kasaragod<br>to the south.</h2><p>13 compact districts and 32 local stops. Wayanad branches into the northern highlands. ${visited.size} of 6 major landmarks discovered.</p><canvas id="atlas" width="500" height="500"></canvas><div class="atlas-subtitle">DISTRICTS · NORTH TO SOUTH</div><div class="atlas-list">${towns.map((t,i)=>`<div class="town-card"><button data-town="${i}"><span>${String(i+1).padStart(2,'0')}</span><strong>${t.name}</strong><small>WALK INTO DISTRICT ↗</small></button><div class="town-stops">${townInterests.map((p,j)=>p.town===t.name?`<button data-interest="${j}">${p.name} ↗</button>`:'').join('')}</div></div>`).join('')}</div><div class="atlas-subtitle">MAJOR LANDMARKS</div><div class="atlas-list">${landmarks.map((l,i)=>`<button data-place="${i}"><span>${l.icon}</span><strong>${l.name}</strong><small>${visited.has(i)?'DISCOVERED':'EXPLORE ↗'}</small></button>`).join('')}</div>`);
  drawMap($<HTMLCanvasElement>('atlas'),true);
  document.querySelectorAll<HTMLElement>('[data-place]').forEach(b=>b.onclick=()=>{closeModal();openPlace(Number(b.dataset.place));});
  document.querySelectorAll<HTMLElement>('[data-town]').forEach(b=>b.onclick=()=>{closeModal();enterTown(Number(b.dataset.town));});
  document.querySelectorAll<HTMLElement>('[data-interest]').forEach(b=>b.onclick=()=>{closeModal();enterInterest(Number(b.dataset.interest));});
  $<HTMLCanvasElement>('atlas').onclick=e=>{
    const bounds=(e.target as HTMLElement).getBoundingClientRect(),x=(e.clientX-bounds.left)/bounds.width*2000-1000,z=(e.clientY-bounds.top)/bounds.height*2000-1000;
    let bestTown=0;towns.forEach((t,i)=>{if(Math.hypot(t.x-x,t.z-z)<Math.hypot(towns[bestTown].x-x,towns[bestTown].z-z))bestTown=i;});
    let bestPlace=0;landmarks.forEach((l,i)=>{if(Math.hypot(l.x-x,l.z-z)<Math.hypot(landmarks[bestPlace].x-x,landmarks[bestPlace].z-z))bestPlace=i;});
    let bestInterest=0;townInterests.forEach((p,i)=>{if(Math.hypot(p.x-x,p.z-z)<Math.hypot(townInterests[bestInterest].x-x,townInterests[bestInterest].z-z))bestInterest=i;});
    closeModal();if(Math.hypot(townInterests[bestInterest].x-x,townInterests[bestInterest].z-z)<18)enterInterest(bestInterest);else if(Math.hypot(landmarks[bestPlace].x-x,landmarks[bestPlace].z-z)<25)openPlace(bestPlace);else enterTown(bestTown);
  };
}
function openHelp(){openModal(`<div class="eyebrow">THE ART OF WANDERING</div><h2>Go where you<br>feel like going.</h2><p>A 2 km × 2 km coastal world, explored at human scale. Follow the roads or find your own path.</p><div class="help-grid"><kbd>W A S D / ↑ ↓ ← →</kbd><span>Walk</span><kbd>SHIFT</kbd><span>Run</span><kbd>SPACE</kbd><span>Jump</span><kbd>V</kbd><span>First / third person</span><kbd>M</kbd><span>World atlas & travel</span><kbd>ESC</kbd><span>Release cursor</span><kbd>Mouse drag / click</kbd><span>Look around</span></div><p class="fine">On touch screens, use the left joystick to move and swipe the world to look. The Run and Jump buttons are on the right. Deep water, cliffs and buildings block movement. All islands are connected by bridges or causeways.</p><button class="primary" id="help-start">Let's wander ${icons.arrow}</button>`);$('help-start').onclick=()=>{closeModal();if(mode==='overview')enterWorld();};}
function openSettings(){openModal(`<div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>Your kind of quiet.</h2><label class="setting-row"><span>Graphics quality<small>Detail distance and shadow quality</small></span><select id="quality"><option value="balanced">Balanced</option><option value="light">Light · mobile</option></select></label><label class="setting-row"><span>Camera sensitivity</span><input id="sensitivity" type="range" min="1" max="5" value="${sensitivity*1000}"/></label><label class="setting-row"><span>Show place names</span><input id="label-check" type="checkbox" ${labelsVisible?'checked':''}/></label><div class="setting-foot">64 streaming sectors · 250 m each<br>1 world unit = 1 metre · ${(renderer.info.render.triangles/1000).toFixed(0)}k rendered triangles<br>${fps} FPS on this device · ${world.active} detailed sectors</div><button id="reset-position" class="secondary">Return to the lighthouse</button>`);$<HTMLSelectElement>('quality').value=lowQuality?'light':'balanced';$('quality').onchange=()=>{lowQuality=$<HTMLSelectElement>('quality').value==='light';renderer.setPixelRatio(Math.min(devicePixelRatio,lowQuality?1:1.5));sun.castShadow=mode==='walk'&&!lowQuality;};$('sensitivity').oninput=()=>{sensitivity=Number($<HTMLInputElement>('sensitivity').value)/1000;};$('label-check').onchange=()=>labelsVisible=$<HTMLInputElement>('label-check').checked;$('reset-position').onclick=()=>{closeModal();enterWorld(0);};}
$('explore').onclick=()=>enterWorld();$('onfoot').onclick=()=>enterWorld(selected,mode!=='walk');$('overview').onclick=setOverview;$('world-nav').onclick=setOverview;$('notes-nav').onclick=openAtlas;$('all-places').onclick=openAtlas;$('minimap-button').onclick=openAtlas;$('help-nav').onclick=openHelp;$('settings').onclick=openSettings;$('close-modal').onclick=closeModal;
$<HTMLDialogElement>('modal').addEventListener('cancel',()=>{paused=false;});$('modal').onclick=e=>{if(e.target===$('modal'))closeModal();};document.querySelector<HTMLAnchorElement>('.brand')!.onclick=e=>{e.preventDefault();setOverview();};
function toggleCamera(){player.first=!player.first;$('camera-mode').textContent=player.first?'1st person':'3rd person';$('crosshair').classList.toggle('hidden',!player.first);}
$('camera-mode').onclick=toggleCamera;$('labels').onclick=()=>{labelsVisible=!labelsVisible;$('labels').classList.toggle('active',labelsVisible);};$('north').onclick=()=>{if(mode==='overview'){camera.position.set(controls.target.x,1800,controls.target.z+1400);}else player.yaw=0;};
function zoom(factor:number){if(mode==='overview')camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);else player.distance=clamp(player.distance*factor,2,14);}
$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.2);
addEventListener('keydown',e=>{if((e.target as HTMLElement).tagName==='INPUT'||(e.target as HTMLElement).tagName==='SELECT')return;if(paused)return;keys.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(!e.repeat){if(e.code==='KeyV'&&mode==='walk')toggleCamera();if(e.code==='KeyM')openAtlas();if(e.code==='Space')jump();if(e.code==='KeyR')toggleRoads();}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();touchMove={x:0,y:0};});
function jump(){if(mode==='walk'&&player.y<=surface(player.x,player.z)+.08)player.vy=5.3;}
let dragging=false,dragDistance=0,pointerX=0,pointerY=0,sensitivity=.0025;
renderer.domElement.addEventListener('pointerdown',e=>{if(mode!=='walk'||paused)return;dragging=true;dragDistance=0;pointerX=e.clientX;pointerY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(mode!=='walk'||paused)return;const locked=document.pointerLockElement===renderer.domElement;if(!dragging&&!locked)return;const dx=locked?e.movementX:e.clientX-pointerX,dy=locked?e.movementY:e.clientY-pointerY;pointerX=e.clientX;pointerY=e.clientY;dragDistance+=Math.abs(dx)+Math.abs(dy);player.yaw-=dx*sensitivity;player.pitch=clamp(player.pitch+dy*sensitivity,-.9,1.15);});
renderer.domElement.addEventListener('pointerup',e=>{dragging=false;if(mode==='walk'&&!paused&&e.pointerType==='mouse'&&dragDistance<4&&!document.pointerLockElement)renderer.domElement.requestPointerLock?.()?.catch(()=>{});});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
let stickPointer:number|null=null;
$('joystick').onpointerdown=e=>{stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);updateStick(e);};$('joystick').onpointermove=e=>{if(e.pointerId===stickPointer)updateStick(e);};
function updateStick(e:PointerEvent){const r=$('joystick').getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/40,y=(e.clientY-r.top-r.height/2)/40,l=Math.max(1,Math.hypot(x,y));touchMove={x:x/l,y:y/l};$('stick').style.transform=`translate(${touchMove.x*32}px,${touchMove.y*32}px)`;}
function releaseStick(){stickPointer=null;touchMove={x:0,y:0};$('stick').style.transform='';}
$('joystick').onpointerup=releaseStick;$('joystick').onpointercancel=releaseStick;$('touch-run').onclick=()=>{running=!running;$('touch-run').classList.toggle('selected',running);};$('touch-jump').onpointerdown=jump;

let audioContext:AudioContext|null=null,gain:GainNode|null=null,soundOn=false;
$('sound').onclick=()=>{if(!audioContext){audioContext=new AudioContext();const buffer=audioContext.createBuffer(1,audioContext.sampleRate*6,audioContext.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last*3*(.7+.3*Math.sin(i/audioContext.sampleRate));}const source=audioContext.createBufferSource();source.buffer=buffer;source.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;gain=audioContext.createGain();gain.gain.value=0;source.connect(filter).connect(gain).connect(audioContext.destination);source.start();}audioContext.resume();soundOn=!soundOn;gain!.gain.setTargetAtTime(soundOn?.28:0,audioContext.currentTime,.6);$('sound').classList.toggle('active',soundOn);$('sound').setAttribute('aria-label',soundOn?'Mute ambient sound':'Enable ambient sound');showToast(soundOn?'Coastal ambience on':'Coastal ambience off');};

function blocked(x:number,z:number){return obstacles.some(o=>Math.abs(x-o.x)<o.rx+.35&&Math.abs(z-o.z)<o.rz+.35);}
function canMove(x:number,z:number,oldHeight:number,step:number){return !blocked(x,z)&&canTraverse(x,z,oldHeight,step);}
function movePlayer(dt:number){
  let mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touchMove.x;
  let mz=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touchMove.y;
  const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')||running)?9:3.8;
  const dx=(mx*Math.cos(player.yaw)-mz*Math.sin(player.yaw))*speed*dt,dz=(-mx*Math.sin(player.yaw)-mz*Math.cos(player.yaw))*speed*dt,oldHeight=surface(player.x,player.z),step=Math.hypot(dx,dz);
  let moved=0;
  if(step>0){const ox=player.x,oz=player.z;if(canMove(player.x+dx,player.z+dz,oldHeight,step)){player.x+=dx;player.z+=dz;}else{if(canMove(player.x+dx,player.z,oldHeight,Math.abs(dx)))player.x+=dx;if(canMove(player.x,player.z+dz,surface(player.x,player.z),Math.abs(dz)))player.z+=dz;}
    moved=Math.hypot(player.x-ox,player.z-oz);travelled+=moved;
  }
  const ground=surface(player.x,player.z);player.vy-=18*dt;player.y+=player.vy*dt;if(player.y<ground){player.y=ground;player.vy=0;}
  avatar.group.visible=!player.first;avatar.group.position.set(player.x,player.y,player.z);
  if(moved>.001)avatar.group.rotation.y=Math.atan2(-dx,-dz);
  const stride=moved>.001?Math.sin(elapsed*(speed>5?14:9))*.48:0;avatar.legs.forEach((m,i)=>m.rotation.x=stride*(i?1:-1));avatar.arms.forEach((m,i)=>m.rotation.x=stride*(i?-1:1));
  const eye=new THREE.Vector3(player.x,player.y+1.6,player.z),direction=new THREE.Vector3(-Math.sin(player.yaw)*Math.cos(player.pitch),-Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch));
  if(player.first){camera.position.copy(eye);camera.lookAt(eye.clone().add(direction));}
  else {const desired=eye.clone().addScaledVector(direction,-player.distance);desired.y+=1.0;
    // Shorten the camera arm before it crosses terrain or building volumes.
    for(let t=.1;t<=1;t+=.05){const p=eye.clone().lerp(desired,t);if(p.y<surface(p.x,p.z)+.35||obstacles.some(o=>Math.abs(p.x-o.x)<o.rx+.25&&Math.abs(p.z-o.z)<o.rz+.25&&p.y<o.top)){desired.copy(eye.clone().lerp(desired,Math.max(.05,t-.08)));break;}}
    camera.position.lerp(desired,1-Math.exp(-12*dt));camera.lookAt(eye.clone().addScaledVector(direction,3));
  }
  sun.position.set(player.x-180,player.y+260,player.z+100);sun.target.position.set(player.x,player.y,player.z);sun.target.updateMatrixWorld();
  let closest=0;landmarks.forEach((l,i)=>{const d=Math.hypot(player.x-l.x,player.z-l.z);if(d<Math.hypot(player.x-landmarks[closest].x,player.z-landmarks[closest].z))closest=i;if(d<65&&!visited.has(i)){visited.add(i);$('visited-count').textContent=`${visited.size}/6`;showToast(`Discovered · ${l.name}`);}});
  const loc=landmarks[closest],dist=Math.hypot(player.x-loc.x,player.z-loc.z);
  const town=towns.reduce((a,b)=>Math.hypot(player.x-b.x,player.z-b.z)<Math.hypot(player.x-a.x,player.z-a.z)?b:a);
  const townDistance=Math.hypot(player.x-town.x,player.z-town.z);
  const interest=townInterests.filter(p=>p.town===town.name).reduce((a,b)=>!a||Math.hypot(player.x-b.x,player.z-b.z)<Math.hypot(player.x-a.x,player.z-a.z)?b:a,undefined as typeof townInterests[number]|undefined);
  $('location-name').textContent=dist<38?loc.name:townDistance<town.radius+12?town.name:player.y>50?'The highland trail':player.x>300?'Backwater country':'The coastal road';
  $('location-sub').textContent=`${interest&&Math.hypot(player.x-interest.x,player.z-interest.z)<24?interest.name+' · ':''}${Math.round(player.y)} m elevation · ${(travelled/1000).toFixed(2)} km wandered`;
}
function drawMap(canvas:HTMLCanvasElement,atlas=false){
  const c=canvas.getContext('2d')!,w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);c.drawImage(mapBase,0,0,w,h);
  if(world.roadGroup.visible){for(const r of roads){c.strokeStyle=r.trail?'#d9c69e':r.width>=7?'#f5e5be':'#e9d7b0';c.lineWidth=atlas?r.trail?1:2:r.trail?.6:1;c.beginPath();r.path.forEach((p,i)=>{const x=(p.x+1000)/2000*w,z=(p.z+1000)/2000*h;if(!i)c.moveTo(x,z);else c.lineTo(x,z);});c.stroke();}}
  if(atlas)for(const p of townInterests){const x=(p.x+1000)/2000*w,y=(p.z+1000)/2000*h;c.fillStyle='#ad7141';c.beginPath();c.arc(x,y,2.3,0,Math.PI*2);c.fill();}
  towns.forEach((t,i)=>{const x=(t.x+1000)/2000*w,y=(t.z+1000)/2000*h;
    c.fillStyle='#f5ecd5';c.strokeStyle='#285446';c.lineWidth=atlas?2:1;c.beginPath();c.arc(x,y,atlas?5:2.6,0,Math.PI*2);c.fill();c.stroke();
    if(atlas){c.font='bold 8px sans-serif';c.fillStyle='#23473c';c.fillText(`${i+1} ${t.name}`,x+8,y-6);}
  });
  if(atlas){c.fillStyle='#20483d';c.font='bold 13px sans-serif';c.fillText('N ↑',17,25);}
  for(let i=0;i<landmarks.length;i++){const l=landmarks[i],x=(l.x+1000)/2000*w,y=(l.z+1000)/2000*h;c.fillStyle=visited.has(i)?'#b16e3e':'#214c43';c.beginPath();c.arc(x,y,atlas?4:2.5,0,Math.PI*2);c.fill();}
  if(mode==='walk'){const x=(player.x+1000)/2000*w,y=(player.z+1000)/2000*h;c.save();c.translate(x,y);c.rotate(-player.yaw);c.fillStyle='#f6f0db';c.strokeStyle='#1b5347';c.lineWidth=2;c.beginPath();c.moveTo(0,-8);c.lineTo(6,6);c.lineTo(0,3);c.lineTo(-6,6);c.closePath();c.fill();c.stroke();c.restore();}
}
const projected=new THREE.Vector3();
function viewBounds(){const left=mode==='overview'&&innerWidth>900?(innerWidth>=1500?390:innerWidth<=1100?310:350):0;return {left,width:innerWidth-left,height:innerHeight};}
function updateLabels(){const b=viewBounds();landmarks.forEach((l,i)=>{const el=labelElements[i];projected.set(l.x,surface(l.x,l.z)+18,l.z);const distance=camera.position.distanceTo(projected);projected.project(camera);const x=b.left+(projected.x*.5+.5)*b.width,y=(-projected.y*.5+.5)*b.height;const visible=labelsVisible&&projected.z<1&&projected.z>-1&&(mode==='overview'||(distance<300&&distance>45))&&x>b.left+40&&y>130&&y<innerHeight-130;el.style.display=visible?'flex':'none';el.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;});}
function resize(){const b=viewBounds();camera.aspect=b.width/b.height;camera.updateProjectionMatrix();renderer.setSize(b.width,b.height);$('viewport').style.left=b.left+'px';}
addEventListener('resize',resize);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;showToast('Graphics paused. Restoring your world…');});renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
document.addEventListener('visibilitychange',()=>{keys.clear();lastTime=performance.now();});
function animate(now:number){requestAnimationFrame(animate);const dt=Math.min((now-lastTime)/1000,.045);lastTime=now;if(document.hidden)return;elapsed+=dt;
  if(!paused){if(mode==='walk')movePlayer(dt);else controls.update();}
  if(elapsed-lastStream>.12){world.stream(player.x,player.z,mode==='overview',lowQuality);lastStream=elapsed;updateLabels();drawMap($<HTMLCanvasElement>('minimap'));}
  (world.water.material as THREE.ShaderMaterial).uniforms.time.value=elapsed;
  if(elapsed>toastUntil)$('toast').classList.remove('show');
  sky.position.copy(camera.position);renderer.render(scene,camera);frames++;if(now-lastFps>1000){fps=Math.round(frames*1000/(now-lastFps));frames=0;lastFps=now;$('performance').innerHTML=mode==='walk'?`${fps} FPS <b>·</b> ${world.active} nearby sectors <b>·</b> 4 km² world`:'2,000 × 2,000 m <b>·</b> Seamless exploration';saveJournal();}
}
setOverview();
if(new URLSearchParams(location.search).get('focus')==='summit'){
  controls.target.set(790,115,735);camera.position.set(935,340,1080);controls.update();
}
if(new URLSearchParams(location.search).get('focus')==='bridge'){
  controls.target.set(190,12,835);camera.position.set(320,130,1000);controls.update();
}
drawMap($<HTMLCanvasElement>('minimap'));$('loading').classList.add('loaded');setTimeout(()=>$('loading').remove(),600);requestAnimationFrame(animate);
// A small read-only diagnostics surface for scale, rendering and traversal validation.
(window as any).__malabar={getState:()=>({mode,player:{...player},fps,activeSectors:world.active,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,visited:[...visited],travelled,worldSize:2000,sectorSize:250}),surface,rawHeight,terrainHeight,nearestRoad,roads:roads.map(r=>({id:r.id,width:r.width,trail:r.trail,path:r.path.map(p=>({x:p.x,y:p.y,z:p.z}))})),landmarks,towns,townBuildings,townInterests,apartments:world.apartments,obstacles};
