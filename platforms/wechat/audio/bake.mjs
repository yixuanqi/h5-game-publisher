import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import WAE from 'web-audio-engine';
// Build-only rendering of the original recipes. 24 kHz signed PCM16 mono is
// a documented packaging tradeoff; the live score and synthesis recipes remain original.
export async function bakeBank(raw,project){
  const rate=24000;
  const mod=await build({entryPoints:[path.join(raw,'src/audioSfxBank.js')],bundle:true,write:false,format:'esm',platform:'node'});
  const {buildSfxBakeTasks}=await import('data:text/javascript;base64,'+Buffer.from(mod.outputFiles[0].text).toString('base64'));
  function makeNoise(c){
    const len=Math.floor(c.sampleRate*0.55),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
    // Same seed and arithmetic as original SoundEngine.init.
    let seed=0x1a2b3c4d;for(let i=0;i<len;i++){seed=(seed*1664525+1013904223)|0;d[i]=((seed>>>8)/8388608)-1;}
    return b;
  }
  const tasks=buildSfxBakeTasks(makeNoise),records=[],parts=[];let offset=0;
  if(tasks.length!==69||new Set(tasks.map(t=>t[0])).size!==69)throw Error('Unreviewed bank');
  for(const [key,dur,recipe] of tasks){
    const frames=Math.max(256,Math.ceil(dur*rate)),c=new WAE.OfflineAudioContext(1,frames,rate);
    recipe(c,c.destination);const rendered=await c.startRendering(),d=rendered.getChannelData(0),pcm=Buffer.alloc(frames*2);
    let sum=0,err=0,peak=0,clipped=0;
    for(let i=0;i<frames;i++){
      const v=d[i];if(!Number.isFinite(v))throw Error('Non-finite audio '+key);peak=Math.max(peak,Math.abs(v));sum+=v*v;
      if(Math.abs(v)>1)clipped++;
      const n=Math.max(-32768,Math.min(32767,Math.round(v*32767)));
      pcm.writeInt16LE(n,i*2);err+=(v-n/32767)**2;
    }
    const rms=Math.sqrt(sum/frames),quantRms=Math.sqrt(err/frames);
    if(!(rms>0.00001)||clipped||quantRms>Math.max(.00004,rms*.01))throw Error('Audio quality gate '+key+' '+JSON.stringify({rms,peak,clipped,quantRms}));
    records.push({key,offset,frames,rms,peak,quantRms,clipped});offset+=pcm.length;parts.push(pcm);
  }
  const dir=path.join(project,'audio');fs.mkdirSync(dir);
  const data=Buffer.concat(parts);fs.writeFileSync(path.join(dir,'bank.pcm'),data);
  fs.writeFileSync(path.join(dir,'bank.json'),JSON.stringify({format:'pcm16le-mono',sampleRate:rate,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),records}));
  console.log('[audio-bank] '+JSON.stringify({count:records.length,bytes:data.length,rate,maxQuantRms:Math.max(...records.map(r=>r.quantRms))}));
}
