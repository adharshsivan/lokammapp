import fs from 'node:fs/promises';
const {coastSamples}=await import('../.qa/geography.js');
const quantized=Int16Array.from(coastSamples,x=>Math.max(-32767,Math.min(32767,Math.round(x*16))));
await fs.mkdir('public/world',{recursive:true});
await fs.writeFile('public/world/coast-v2.bin',Buffer.from(quantized.buffer));
console.log(`Baked ${quantized.length} coastline samples (${quantized.byteLength} bytes)`);
