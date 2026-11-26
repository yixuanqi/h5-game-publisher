import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {snapshot,digestManifest,sha256} from '../../../scripts/source-integrity.mjs';
const work=path.resolve('.work/wechat-ui-46.1'),project=path.join(work,'project');
const info=JSON.parse(fs.readFileSync(path.join(work,'build-info.json'),'utf8'));
assert.equal(info.projectFilesSha256,digestManifest(snapshot(project)));assert.equal(info.kind,'wechat-ui-not-release');
const prefix='h5publisher:wechat:ui-test:';
const stored=new Map([[prefix+'ashen_bell_vow_slot_1',JSON.stringify({value:JSON.stringify({v:42,ngPlusCycle:2,playTimeSec:600})})]]);
const fixture=stored.get(prefix+'ashen_bell_vow_slot_1');
function make(){
  const screen=createCanvas(844,390),events=new Map(),frames=new Map(),cache=new Map();let id=0,now=0,w=844,h=390,failWrite=false;
  const wx={getWindowInfo:()=>({windowWidth:w,windowHeight:h,pixelRatio:1}),createCanvas:()=>screen,createOffscreenCanvas:()=>createCanvas(1,1),
    getFileSystemManager:()=>({readFileSync:(p,e)=>fs.readFileSync(path.join(project,p),e)}),
    getStorageSync:k=>stored.get(k)??'',setStorageSync(k,v){if(failWrite)throw Error('quota');assert.ok(k.startsWith(prefix));assert.ok(!k.includes('_slot_'));stored.set(k,v)},removeStorageSync(){throw Error('unexpected remove')}};
  for(const k of ['Show','Hide','TouchStart','WindowResize']){wx['on'+k]=f=>events.set(k,f);wx['off'+k]=f=>{if(events.get(k)===f)events.delete(k)}}
  const sandbox=vm.createContext({wx,console,setTimeout,clearTimeout,performance:{now:()=>now},requestAnimationFrame:cb=>{frames.set(++id,cb);return id},cancelAnimationFrame:i=>frames.delete(i)});
  function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p).exports;const mod={exports:{}};cache.set(p,mod);vm.runInContext('(function(require,module,exports){'+fs.readFileSync(p,'utf8')+'\n})',sandbox,{filename:p})(rel=>{assert.match(rel,/^\.\/[a-z-]+\.js$/);return load(path.resolve(path.dirname(p),rel))},mod,mod.exports);return mod.exports;}
  const handle=load(path.join(project,'game.js'));
  function tick(){assert.equal(frames.size,1);const [i,cb]=frames.entries().next().value;frames.delete(i);now+=16.67;cb(now);assert.equal(handle.state.phase,'READY',handle.state.error);}
  function target(id){const b=handle.ui.targets.find(b=>b.id===id);assert.ok(b,'Missing target '+id);const s=Math.min(w/844,h/390);return {clientX:(w-844*s)/2+(b.x+b.w/2)*s,clientY:(h-390*s)/2+(b.y+b.h/2)*s};}
  function send(p){events.get('TouchStart')({changedTouches:[p]});}
  function tap(id){send(target(id));tick();}
  return {handle,screen,events,frames,tick,tap,target,send,setFail:v=>failWrite=v,resize(a,b){w=a;h=b;events.get('WindowResize')();}};
}
const a=make();await a.handle.ready;a.tick();
const dir=path.join(work,'screenshots');fs.mkdirSync(dir);const records=[];
function shot(name){
  const c=a.screen,px=Buffer.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data),colors=new Set();
  for(let i=0;i<px.length;i+=4*41)colors.add(px.readUInt32LE(i));assert.ok(colors.size>100,name);
  const png=c.toBuffer('image/png');fs.writeFileSync(path.join(dir,name+'.png'),png);
  records.push({name,route:a.handle.ui.route,width:c.width,height:c.height,sha256:sha256(png),pixelSha256:sha256(px),colors:colors.size});
}
shot('01-title');a.tap('slots');assert.equal(a.handle.ui.route,'slots');assert.equal(a.handle.engine.listSaveSlots()[1].data.ngPlusCycle,2);a.tap('slot-1');assert.equal(a.handle.engine.G.activeSaveSlot,1);shot('02-slots');a.tap('back');
a.tap('settings');const G=a.handle.engine.G,old=G.settings.dynamicLighting;a.tap('lighting');assert.equal(G.settings.dynamicLighting,!old);
const vol=G.settings.musicVol;a.tap('musicVol-minus');assert.ok(G.settings.musicVol<vol);
a.setFail(true);const prev=G.settings.musicVol;a.tap('musicVol-minus');assert.equal(G.settings.musicVol,prev);a.setFail(false);
shot('03-settings');a.tap('language');assert.equal(G.locale,'en-US');shot('04-settings-en');a.tap('back');a.tap('preview');shot('05-hud');
const before=G.player.attackTimer;a.tap('attack');assert.equal(G.player.attackTimer,before);assert.equal(a.handle.ui.route,'preview');
a.tap('scene-1');assert.equal(G.currentRoomId,'r05_foundry');a.tap('map');shot('06-map');a.tap('back');
a.tap('codex');shot('07-weapons');a.tap('tab-beasts');shot('08-bestiary');a.tap('next');assert.equal(a.handle.ui.page,1);a.tap('tab-lore');assert.equal(a.handle.ui.page,0);shot('09-lore');a.tap('tab-achievements');shot('10-achievements');a.tap('back');
a.tap('altar');shot('11-altar');a.tap('back');a.tap('pause');shot('12-pause');const t=G.globalTime;a.tick();assert.equal(G.globalTime,t);a.tap('resume');
const oldTouch=a.target('settings');a.events.get('Hide')();assert.equal(a.frames.size,0);a.send(oldTouch);assert.equal(a.handle.ui.route,'preview');
a.events.get('Show')();a.send(oldTouch);assert.equal(a.handle.ui.route,'preview');a.tick();a.resize(944,390);a.send(oldTouch);assert.equal(a.handle.ui.route,'preview');a.tick();a.tap('settings');assert.equal(a.handle.ui.route,'settings');shot('13-resized');
a.handle.dispose();assert.equal(a.frames.size,0);assert.equal(a.events.size,0);
const b=make();await b.handle.ready;b.tick();assert.equal(b.handle.engine.G.locale,'en-US');assert.equal(b.handle.engine.G.settings.dynamicLighting,!old);assert.equal(b.handle.engine.G.settings.musicVol,prev);b.handle.dispose();
assert.equal(stored.get(prefix+'ashen_bell_vow_slot_1'),fixture);
assert.equal([...stored.keys()].filter(k=>k.includes('_slot_')).length,1);
assert.equal(new Set(records.map(r=>r.pixelSha256)).size,records.length);
const report={kind:'ui-raster-mock-not-device',sourceSha:info.sourceSha,framework:info.framework,projectFilesSha256:info.projectFilesSha256,records,checks:['native canvas navigation','real slot read/select no progression writes','original settings persistence/relaunch','failed write rollback','original localization persistence','actual scene/HUD/map data','codex tabs/pagination','disabled combat','pause ambient clock','hide/show stale touch guard','letterbox resize','dispose'],devtools:'not-run',android:'not-run',ios:'not-run',releaseReady:false};
fs.writeFileSync(path.join(work,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
