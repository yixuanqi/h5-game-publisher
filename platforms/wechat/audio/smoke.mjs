import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createCanvas} from '@napi-rs/canvas';import WAE from 'web-audio-engine';
import {snapshot,digestManifest,sha256} from '../../../scripts/source-integrity.mjs';
const work=path.resolve('.work/wechat-audio-46.1'),project=path.join(work,'project'),info=JSON.parse(fs.readFileSync(path.join(work,'build-info.json'),'utf8'));
assert.equal(info.projectFilesSha256,digestManifest(snapshot(project)));assert.equal(info.kind,'wechat-audio-not-release');
const bank=JSON.parse(fs.readFileSync(path.join(project,'audio/bank.json'),'utf8')),pcm=fs.readFileSync(path.join(project,'audio/bank.pcm'));
assert.equal(bank.records.length,69);assert.equal(sha256(pcm),bank.sha256);assert.ok(bank.records.every(r=>r.rms>0&&r.clipped===0));
const screen=createCanvas(844,390),events=new Map(),frames=new Map(),cache=new Map(),store=new Map();let id=0,now=0,context=null,creations=0;
const wx={getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:1}),createCanvas:()=>screen,createOffscreenCanvas:()=>createCanvas(1,1),
  getFileSystemManager:()=>({readFileSync:(p,e)=>fs.readFileSync(path.join(project,p),e)}),
  getStorageSync:k=>store.get(k)??'',setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k),
  createWebAudioContext(){creations++;context=new WAE.RenderingAudioContext({sampleRate:24000,numberOfChannels:1});return context;}};
for(const k of ['Show','Hide','TouchStart','TouchEnd','TouchCancel','WindowResize']){wx['on'+k]=f=>events.set(k,f);wx['off'+k]=f=>{if(events.get(k)===f)events.delete(k)}}
const sandbox=vm.createContext({wx,console,setTimeout,clearTimeout,performance:{now:()=>now},requestAnimationFrame:cb=>{frames.set(++id,cb);return id},cancelAnimationFrame:i=>frames.delete(i)});
function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p).exports;const mod={exports:{}};cache.set(p,mod);vm.runInContext('(function(require,module,exports){'+fs.readFileSync(p,'utf8')+'\n})',sandbox,{filename:p})(rel=>{assert.match(rel,/^\.\/[a-z-]+\.js$/);return load(path.resolve(path.dirname(p),rel))},mod,mod.exports);return mod.exports;}
const a=load(path.join(project,'game.js'));await a.ready;
function tick(n=1){for(let j=0;j<n;j++){assert.equal(frames.size,1);const [i,cb]=frames.entries().next().value;frames.delete(i);now+=1000/60;cb(now);assert.equal(a.state.phase,'READY',a.state.error);if(context&&context.state!=='closed')context.processTo(context.currentTime+1/60);}}
function down(name){const b=a.ui.targets.find(b=>b.id===name);assert.ok(b,name);events.get('TouchStart')({changedTouches:[{identifier:1,clientX:b.x+b.w/2,clientY:b.y+b.h/2}]});}
function up(){events.get('TouchEnd')({changedTouches:[{identifier:1}]});}
async function tap(name){down(name);up();await a.whenIdle();tick();}
tick();assert.equal(creations,0,'Audio starts only on gesture');await tap('preview');const {audio,G}=a.engine;
assert.equal(a.ui.route,'preview',a.state.saveError);assert.equal(creations,1);assert.equal(Object.keys(audio._baked).length,69);assert.equal(audio._bakeReady,true);
assert.ok(audio.biomeGains&&audio.masterGain&&audio.musicGain);
tick(30);const step=audio.musicStep;assert.ok(step>0,'actual explore sequencer advanced');const startSamples=context.exportAsAudioData().channelData[0].length;
down('attack');tick(3);up();tick(20);assert.ok(G.player.attackCd>0||G.player.comboStep>0||G.slashes.length>0);
assert.ok(Object.keys(audio._lastSfxTime).length>0,'Actual gameplay triggered SFX');
const rendered=context.exportAsAudioData().channelData[0],sample=rendered.slice(startSamples);
let peak=0,sum=0;for(const v of sample){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));sum+=v*v;}
assert.ok(peak>.0001&&sum>0,'Actual waveform nonzero');
await tap('settings');const vol=audio.musicVol;await tap('musicVol-minus');assert.ok(audio.musicVol<vol);assert.equal(audio.musicVol,G.settings.musicVol);await tap('back');
events.get('Hide')();assert.equal(audio.bgDucked,true);assert.equal(frames.size,0);events.get('Show')();assert.equal(audio.bgDucked,false);tick(2);
a.dispose();assert.equal(events.size,0);
const report={kind:'audio-render-mock-not-device',sourceSha:info.sourceSha,framework:info.framework,projectFilesSha256:info.projectFilesSha256,bankCount:69,bankBytes:pcm.length,bankRate:bank.sampleRate,maxQuantRms:Math.max(...bank.records.map(r=>r.quantRms)),waveformSamples:sample.length,waveformPeak:peak,waveformRms:Math.sqrt(sum/sample.length),checks:['original offline recipes rendered','all 69 buffers populated','gesture gated native context bridge','real ambience graph and score sequencer','gameplay attack SFX','nonzero rendered waveform','live volume','hide/show duck','cleanup'],devtools:'not-run',android:'not-run',ios:'not-run',releaseReady:false};
fs.writeFileSync(path.join(work,'audio-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
