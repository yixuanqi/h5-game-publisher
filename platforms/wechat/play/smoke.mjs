import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {createCanvas} from '@napi-rs/canvas';
import {snapshot,digestManifest,sha256} from '../../../scripts/source-integrity.mjs';
const work=path.resolve('.work/wechat-play-46.1'),project=path.join(work,'project'),info=JSON.parse(fs.readFileSync(path.join(work,'build-info.json'),'utf8'));
assert.equal(info.projectFilesSha256,digestManifest(snapshot(project)));assert.equal(info.kind,'wechat-play-not-release');
const screen=createCanvas(844,390),events=new Map(),frames=new Map(),cache=new Map();let id=0,now=0,seed=123456789;
const wx={getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:1}),createCanvas:()=>screen,createOffscreenCanvas:()=>createCanvas(1,1),getFileSystemManager:()=>({readFileSync:(p,e)=>fs.readFileSync(path.join(project,p),e)}),getStorageSync:()=>'',setStorageSync(){throw Error('unexpected write')},removeStorageSync(){throw Error('unexpected remove')}};
for(const k of ['Show','Hide','TouchStart','TouchEnd','TouchCancel','WindowResize']){wx['on'+k]=f=>events.set(k,f);wx['off'+k]=f=>{if(events.get(k)===f)events.delete(k)}}
const sandbox=vm.createContext({wx,console,setTimeout,clearTimeout,performance:{now:()=>now},requestAnimationFrame:cb=>{frames.set(++id,cb);return id},cancelAnimationFrame:i=>frames.delete(i),rand:()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}});
vm.runInContext('Math.random=rand',sandbox);
function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p).exports;const mod={exports:{}};cache.set(p,mod);vm.runInContext('(function(require,module,exports){'+fs.readFileSync(p,'utf8')+'\n})',sandbox,{filename:p})(rel=>{assert.match(rel,/^\.\/[a-z-]+\.js$/);return load(path.resolve(path.dirname(p),rel))},mod,mod.exports);return mod.exports;}
const a=load(path.join(project,'game.js'));await a.ready;
function tick(n=1){for(let j=0;j<n;j++){assert.equal(frames.size,1);const [i,cb]=frames.entries().next().value;frames.delete(i);now+=1000/60;cb(now);assert.equal(a.state.phase,'READY',a.state.error);}}
function start(name,finger=1){const b=a.ui.targets.find(b=>b.id===name);assert.ok(b,name);events.get('TouchStart')({changedTouches:[{identifier:finger,clientX:b.x+b.w/2,clientY:b.y+b.h/2}]});}
function end(finger=1,event='TouchEnd'){events.get(event)({changedTouches:[{identifier:finger}]});}
function tap(name){start(name);end();tick();}
const dir=path.join(work,'screenshots');fs.mkdirSync(dir);const records=[];
function shot(name){const png=screen.toBuffer('image/png');fs.writeFileSync(path.join(dir,name+'.png'),png);records.push({name,sha256:sha256(png)});}
tick();tap('preview');const G=a.engine.G;assert.equal(G.gameState,'playing');tick(15);const x=G.player.x,y=G.player.y;
start('right');tick(12);end();tick(2);assert.ok(G.player.x>x+10,'movement '+G.player.x+' vs '+x);shot('01-move');
start('jump');tick(4);end();assert.ok(G.player.y<y-5,'jump '+G.player.y+' vs '+y);shot('02-jump');
tick(40);start('attack');tick(2);end();tick(2);assert.ok(G.player.attackTimer>0||G.slashes.length>0,'attack');shot('03-attack');
tick(30);start('parry');tick(2);end();assert.ok(G.player.parryActive||G.player.parryCooldown>0,'parry activation');shot('04-parry');
tick(30);start('dash');tick(2);end();assert.ok(G.player.dashTimer>0||G.player.dashCd>0,'dash');shot('05-dash');
tick(35);const soul=G.player.soul;start('spell');tick(3);end();assert.ok(G.player.soul<soul||G.player.castTimer>0,'spell');shot('06-spell');
tick(35);start('left',4);start('jump',5);tick(2);assert.equal(a.touchCount,2);end(4,'TouchCancel');assert.equal(a.touchCount,1);a.events.get('Hide')();assert.equal(a.touchCount,0);assert.equal(frames.size,0);a.events.get('Show')();tick();tap('map');assert.equal(G.gameState,'modal');const px=G.player.x,playtime=G.playTimeSec;tick(5);assert.equal(G.player.x,px);assert.equal(G.playTimeSec,playtime);tap('back');assert.equal(G.gameState,'playing');
assert.equal(a.state.blocked,null);a.dispose();assert.equal(events.size,0);assert.equal(frames.size,0);
const report={kind:'play-raster-mock-not-device',sourceSha:info.sourceSha,framework:info.framework,projectFilesSha256:info.projectFilesSha256,frames:a.state.frames,records,checks:['original fresh start','original simulation movement/jump/attack/parry activation/dash/spell','multi-touch cancellation','hide release','map pauses simulation','resume','cleanup'],audio:'not-run',save:'disabled',devtools:'not-run',android:'not-run',ios:'not-run',releaseReady:false};fs.writeFileSync(path.join(work,'play-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
