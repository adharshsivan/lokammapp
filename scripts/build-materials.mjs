import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const assets=['grass_ground','coast_sand_01','aerial_rocks_02','brown_mud_02','forest_ground_04','cracked_red_ground','asphalt_02','gravel_ground_01'];
const output='public/textures',cache='.texture-cache';
await fs.mkdir(output,{recursive:true});await fs.mkdir(cache,{recursive:true});
const sources=[];
async function fetchFile(url,destination){try{await fs.access(destination);return;}catch{}const r=await fetch(url,{headers:{'User-Agent':'MalabarWorld/1.0'}});if(!r.ok)throw new Error(`${r.status} ${url}`);await fs.writeFile(destination,Buffer.from(await r.arrayBuffer()));}
for(const asset of assets){
  const meta=await (await fetch(`https://api.polyhaven.com/files/${asset}`,{headers:{'User-Agent':'MalabarWorld/1.0'}})).json();
  await Promise.all(['Diffuse','nor_gl','Rough','AO'].map(async channel=>{const entry=meta[channel]?.['1k']?.jpg||meta[channel]?.['1k']?.png;if(!entry){if(channel==='AO')return;throw new Error(`Missing ${asset} ${channel}`);}await fetchFile(entry.url,path.join(cache,`${asset}-${channel}.img`));sources.push({asset,channel,url:entry.url});}));
  console.log(`Downloaded ${asset}`);
}
for(const size of [1024,512]){
  const pad=16,tile=size+2*pad,colorTiles=[],normalTiles=[];
  for(let index=0;index<assets.length;index++){
    const asset=assets[index],load=async name=>sharp(path.join(cache,`${asset}-${name}.img`)).resize(size,size).removeAlpha().raw().toBuffer();
    const [diff,normal,rough]=await Promise.all([load('Diffuse'),load('nor_gl'),load('Rough')]);let ao;try{ao=await load('AO');}catch{}
    const colors=Buffer.alloc(size*size*3),packed=Buffer.alloc(size*size*3);
    for(let i=0;i<size*size;i++){const shade=ao?.[i*3]/255*.22+.78||1;for(let c=0;c<3;c++)colors[i*3+c]=diff[i*3+c]*shade;packed[i*3]=normal[i*3];packed[i*3+1]=normal[i*3+1];packed[i*3+2]=rough[i*3];}
    // Edge gutters duplicate border texels and protect atlas mipmaps.
    const extend=async(data,channels)=>sharp(data,{raw:{width:size,height:size,channels}}).extend({top:pad,bottom:pad,left:pad,right:pad,extendWith:'copy'}).png().toBuffer();
    const left=index%4*tile,top=Math.floor(index/4)*tile;
    colorTiles.push({input:await extend(colors,3),left,top});normalTiles.push({input:await extend(packed,3),left,top});
  }
  await sharp({create:{width:tile*4,height:tile*2,channels:3,background:'#808080'}}).composite(colorTiles).webp({quality:90,effort:5}).toFile(`${output}/ground-color-${size}.webp`);
  await sharp({create:{width:tile*4,height:tile*2,channels:3,background:'#8080ff'}}).composite(normalTiles).webp({quality:95,effort:5}).toFile(`${output}/ground-normal-roughness-${size}.webp`);
  console.log(`Packed ${size}px material tiles with gutters`);
}
await fs.writeFile(`${output}/sources.json`,JSON.stringify({license:'CC0-1.0',provider:'Poly Haven',assets,sources},null,2));
