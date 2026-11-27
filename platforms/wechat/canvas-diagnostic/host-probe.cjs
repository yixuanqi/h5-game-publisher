// Node/Skia diagnostic only: real raster, real frozen bundle, simulated wx API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),{createCanvas}=require('@napi-rs/canvas');
const {stageNodeProject}=require('./node-project.cjs');
const sourceProject=path.resolve(process.argv[2]||'.work/wechat-canvas-diagnostic-052g/project');
let staged,project=sourceProject;
const clockUnit=process.env.WX_DIAG_CLOCK_UNIT||'ms';
if(!['ms','us'].includes(clockUnit))throw Error('Unknown diagnostic clock unit');
const out=path.resolve('.work/wechat-canvas-diagnostic-052g/evidence',clockUnit==='us'?'clock-us':'.');fs.mkdirSync(out,{recursive:true});
let screen,seq=0;const frames=new Map(),storage=new Map();
const originalTimer=setTimeout;
globalThis.requestAnimationFrame=cb=>{const id=++seq;const timer=originalTimer(()=>{frames.delete(id);cb(performance.now());},16);frames.set(id,timer);return id;};
globalThis.cancelAnimationFrame=id=>{clearTimeout(frames.get(id));frames.delete(id);};
const touchCallbacks=new Map();
const wx={
 createCanvas(){const c=createCanvas(300,150);if(!screen)screen=c;return c;},
 createOffscreenCanvas({width,height}){return createCanvas(width,height);},
 getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:1,screenWidth:844,screenHeight:390}),
 getSystemInfoSync:()=>({windowWidth:844,windowHeight:390,pixelRatio:1,platform:'android',system:'Android 14',language:'zh_CN',version:'8.0'}),
 getDeviceInfo:()=>({platform:'android',system:'Android 14'}),getAppBaseInfo:()=>({language:'zh_CN',version:'8.0'}),
 getPerformance:()=>({now:()=>performance.now()*(clockUnit==='us'?1000:1)}),
 getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),
 getFileSystemManager:()=>({readFileSync:(name,enc)=>fs.readFileSync(path.join(project,name),enc)})
};
// Reproduce the platform-owned location constraint from DevTools 3.18.1.
const nativeLocation=Object.freeze({href:'https://native-host.invalid/',protocol:'https:'});
Object.defineProperty(globalThis,'location',{value:nativeLocation,configurable:false,writable:false});
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide']){
 wx['on'+name]=fn=>{assert.ok(!touchCallbacks.has(name));touchCallbacks.set(name,fn);};
 wx['off'+name]=fn=>{assert.equal(touchCallbacks.get(name),fn);touchCallbacks.delete(name);};
}
globalThis.wx=wx;
let app,report={result:'fail',backend:'Node/Skia simulated wx API, not official runtime',releaseReady:false,officialDevTools:'not-run'};
(async()=>{
 try{
  staged=stageNodeProject(sourceProject);project=staged.project;
  app=require(path.join(project,'game.js'));
  const wallStart=performance.now(),gameStart=app.environment.performance.now();
  const state=await app.ready;report.state=state;
  const wallElapsed=performance.now()-wallStart,gameElapsed=app.environment.performance.now()-gameStart;
  report.clock={expected:clockUnit,detected:app.environment.performance.clockUnit,wallElapsed,gameElapsed};
  assert.equal(report.clock.detected,clockUnit);
  assert.ok(wallElapsed>100&&gameElapsed/wallElapsed>=0.9&&gameElapsed/wallElapsed<=1.1,'Game clock must track wall elapsed milliseconds');
  assert.equal(state.phase,'CANVAS_PLAYING_OBSERVED',state.error||state.phase);
  assert.equal(state.canvas.playingReady,true);
  assert.equal(globalThis.location,nativeLocation,'platform location must remain untouched');
  assert.equal(app.window.location.protocol,'wechatgame:');
  assert.equal(app.window.window,app.window);
  report.lockedNativeLocationPreserved=true;
  const touch=app.touch;
  assert.ok(touch?.stats.registered);
  const region=id=>touch.regions.find(r=>r.id===id),center=(id,r)=>({identifier:id,clientX:r.x+r.w/2,clientY:r.y+r.h/2});
  const emit=(name,...changedTouches)=>touchCallbacks.get(name)({changedTouches});
  const wait=ms=>new Promise(resolve=>originalTimer(resolve,ms));
  const joy=region('joystick-zone'),jump=region('fan-jump'),atk=region('fan-attack'),parry=region('fan-parry');
  const a=center(1,joy),b=center(2,jump),c=center(3,atk),d=center(4,parry);
  const el=id=>app.document.getElementById(id);
  await wait(80);
  assert.ok(touch.stats.draws>0);
  // Native callback fixture -> diagnostic routing -> original DOM listeners.
  emit('TouchStart',a,b);
  emit('TouchMove',{...a,clientX:a.clientX+joy.w*.32});
  await wait(70);
  assert.ok(el('joystick-base').querySelector('[data-dir="right"]').classList.contains('active'),'original joystick direction');
  assert.ok(el('fan-jump').classList.contains('pressed'),'original jump listener');
  emit('TouchEnd',b);
  assert.equal(el('fan-jump').classList.contains('pressed'),false);
  assert.equal(touch.routerStats.active,1);
  emit('TouchStart',c,d);await wait(70);
  assert.ok(el('fan-attack').classList.contains('pressed'));assert.ok(el('fan-parry').classList.contains('pressed'));
  fs.writeFileSync(path.join(out,'touch-held-screen.png'),screen.toBuffer('image/png'));
  emit('TouchCancel',c); // cancel resets all, never a deferred tap
  assert.equal(touch.routerStats.active,0);
  for(const id of ['fan-jump','fan-attack','fan-parry'])assert.equal(el(id).classList.contains('pressed'),false);
  assert.equal(el('joystick-base').classList.contains('active'),false);
  emit('TouchStart',d);assert.ok(el('fan-parry').classList.contains('pressed'));
  touchCallbacks.get('Hide')();assert.equal(el('fan-parry').classList.contains('pressed'),false);assert.equal(touch.routerStats.active,0);
  report.touch={result:'pass',originalDomListeners:true,simulatedNativeCallbacks:true,nativeDeviceInput:'not-run',stats:{...touch.routerStats},draws:touch.stats.draws};
  report.result='pass';
 }catch(e){report.error=String(e.stack||e);if(app)report.state=app.state;process.exitCode=1;}
 finally{
  try{if(screen)fs.writeFileSync(path.join(out,'last-screen.png'),screen.toBuffer('image/png'));}catch(e){report.screenshotError=String(e);report.result='fail';process.exitCode=1;}
  app?.dispose();if(touchCallbacks.size){report.cleanupError='Touch callbacks not removed';report.result='fail';process.exitCode=1;}for(const timer of frames.values())clearTimeout(timer);
  try{staged?.cleanup();}catch(e){report.cleanupError=String(e);report.result='fail';process.exitCode=1;}
  fs.writeFileSync(path.join(out,'canvas-report.json'),JSON.stringify(report,null,2)+'\n');fs.writeSync(1,JSON.stringify(report)+'\n');process.exit(process.exitCode||0);
 }
})();
