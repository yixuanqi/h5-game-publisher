import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {createCanvas} from '@napi-rs/canvas';
import {snapshot,digestManifest,sha256} from '../../../scripts/source-integrity.mjs';
const work=path.resolve('.work/wechat-save-46.1'),project=path.join(work,'project'),info=JSON.parse(fs.readFileSync(path.join(work,'build-info.json'),'utf8'));
assert.equal(info.projectFilesSha256,digestManifest(snapshot(project)));assert.equal(info.kind,'wechat-save-not-release');
const stored=new Map(),prefix='h5publisher:wechat:save-test:';let quota=false;
function make(){
  const screen=createCanvas(844,390),events=new Map(),frames=new Map(),cache=new Map();let id=0,now=0;
  const wx={getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:1}),createCanvas:()=>screen,createOffscreenCanvas:()=>createCanvas(1,1),getFileSystemManager:()=>({readFileSync:(p,e)=>fs.readFileSync(path.join(project,p),e)}),getStorageSync:k=>stored.get(k)??'',setStorageSync(k,v){assert.ok(k.startsWith(prefix));if(quota)throw Error('quota');stored.set(k,v)},removeStorageSync:k=>stored.delete(k)};
  for(const k of ['Show','Hide','TouchStart','TouchEnd','TouchCancel','WindowResize']){wx['on'+k]=f=>events.set(k,f);wx['off'+k]=f=>{if(events.get(k)===f)events.delete(k)}}
  const sandbox=vm.createContext({wx,console,setTimeout,clearTimeout,performance:{now:()=>now},requestAnimationFrame:cb=>{frames.set(++id,cb);return id},cancelAnimationFrame:i=>frames.delete(i)});
  function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p).exports;const mod={exports:{}};cache.set(p,mod);vm.runInContext('(function(require,module,exports){'+fs.readFileSync(p,'utf8')+'\n})',sandbox,{filename:p})(rel=>{assert.match(rel,/^\.\/[a-z-]+\.js$/);return load(path.resolve(path.dirname(p),rel))},mod,mod.exports);return mod.exports;}
  const a=load(path.join(project,'game.js'));
  function tick(n=1){for(let j=0;j<n;j++){assert.equal(frames.size,1);const [i,cb]=frames.entries().next().value;frames.delete(i);now+=1000/60;cb(now);assert.equal(a.state.phase,'READY',a.state.error);}}
  async function tap(name){const b=a.ui.targets.find(b=>b.id===name);assert.ok(b,name);events.get('TouchStart')({changedTouches:[{identifier:1,clientX:b.x+b.w/2,clientY:b.y+b.h/2}]});tick();events.get('TouchEnd')({changedTouches:[{identifier:1}]});await a.whenIdle();tick();}
  return {a,screen,tick,tap,events};
}
const dir=path.join(work,'screenshots');fs.mkdirSync(dir);const records=[];
function shot(h,name){const png=h.screen.toBuffer('image/png');fs.writeFileSync(path.join(dir,name+'.png'),png);records.push({name,sha256:sha256(png)});}
function slot(n){return JSON.parse(JSON.parse(stored.get(prefix+'ashen_bell_vow_slot_'+n)).value);}
const h=make();await h.a.ready;h.tick();await h.tap('preview');const G=h.a.engine.G;
assert.equal(G.gameState,'playing');assert.equal(slot(0).v,42);assert.equal(slot(0).ngPlusCycle,1);assert.equal(slot(0).activeAltarId,'altar_start');
h.tick(75);await h.tap('interact');assert.equal(h.a.ui.route,'altar');assert.equal(G.player.hp,G.player.maxHp);shot(h,'01-altar');await h.tap('back');
await h.tap('pause');const old=stored.get(prefix+'ashen_bell_vow_slot_0');quota=true;await h.tap('title');assert.equal(h.a.ui.route,'pause');assert.equal(stored.get(prefix+'ashen_bell_vow_slot_0'),old);assert.ok(h.a.state.saveError);quota=false;
await h.tap('title');assert.equal(h.a.ui.route,'title');assert.ok(slot(0).playTimeSec>=1);shot(h,'02-title-saved');const saved=slot(0);
await h.tap('slots');await h.tap('slot-1');await h.tap('back');await h.tap('preview');assert.equal(slot(1).v,42);assert.equal(JSON.stringify(slot(0)),JSON.stringify(saved));
await h.tap('pause');await h.tap('title');h.a.dispose();assert.equal(h.events.size,0);
const q=make();await q.a.ready;q.tick();await q.tap('preview');const Q=q.a.engine.G;assert.equal(Q.worldState.activeAltarId,saved.activeAltarId);assert.equal(Q.worldState.echoes,saved.echoes);assert.equal(Q.worldState.ngPlusCycle,saved.ngPlusCycle);assert.equal(Q.worldState.unlockedWeapons.size,saved.unlockedWeapons.length);
assert.equal(Q.gameState,'playing',q.a.state.saveError);assert.equal(Q.playTimeSec>=saved.playTimeSec,true);shot(q,'03-relaunch-resume');
// Controlled death state tests actual original death guard and respawn; not combat death evidence.
Q.player.hp=0;Q.player.deathTimer=0;q.tick();assert.equal(q.a.ui.route,'dead');await q.tap('retry');assert.equal(Q.gameState,'playing');assert.equal(Q.player.hp,Q.player.maxHp);shot(q,'04-respawn');
q.a.dispose();
const report={kind:'save-raster-mock-not-device',sourceSha:info.sourceSha,framework:info.framework,projectFilesSha256:info.projectFilesSha256,records,checks:['real v42 serialization','actual altar interaction/rest','failed write preserves previous slot and prevents title navigation','slot isolation','fresh host reload','controlled death and original respawn'],audio:'not-run',devtools:'not-run',android:'not-run',ios:'not-run',releaseReady:false};fs.writeFileSync(path.join(work,'save-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
