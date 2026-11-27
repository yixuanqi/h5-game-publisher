// Node/Skia diagnostic only: real raster, real frozen bundle, simulated wx API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),{createCanvas}=require('@napi-rs/canvas');
const {stageNodeProject}=require('./node-project.cjs');
const sourceProject=path.resolve(process.argv[2]||'.work/wechat-canvas-diagnostic-052g/project');
let staged,project=sourceProject;
const out=path.resolve('.work/wechat-canvas-diagnostic-052g/evidence');fs.mkdirSync(out,{recursive:true});
let screen,seq=0;const frames=new Map(),storage=new Map();
const originalTimer=setTimeout;
globalThis.requestAnimationFrame=cb=>{const id=++seq;const timer=originalTimer(()=>{frames.delete(id);cb(performance.now());},16);frames.set(id,timer);return id;};
globalThis.cancelAnimationFrame=id=>{clearTimeout(frames.get(id));frames.delete(id);};
const wx={
 createCanvas(){const c=createCanvas(300,150);if(!screen)screen=c;return c;},
 createOffscreenCanvas({width,height}){return createCanvas(width,height);},
 getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:1,screenWidth:844,screenHeight:390}),
 getSystemInfoSync:()=>({windowWidth:844,windowHeight:390,pixelRatio:1,platform:'android',system:'Android 14',language:'zh_CN',version:'8.0'}),
 getDeviceInfo:()=>({platform:'android',system:'Android 14'}),getAppBaseInfo:()=>({language:'zh_CN',version:'8.0'}),
 getPerformance:()=>({now:()=>performance.now()*1000}),
 getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),
 getFileSystemManager:()=>({readFileSync:(name,enc)=>fs.readFileSync(path.join(project,name),enc)})
};
globalThis.wx=wx;
let app,report={result:'fail',backend:'Node/Skia simulated wx API, not official runtime',releaseReady:false,officialDevTools:'not-run'};
(async()=>{
 try{
  staged=stageNodeProject(sourceProject);project=staged.project;
  app=require(path.join(project,'game.js'));const state=await app.ready;report.state=state;
  assert.equal(state.phase,'CANVAS_PLAYING_OBSERVED',state.error||state.phase);
  assert.equal(state.canvas.playingReady,true);
  report.result='pass';
 }catch(e){report.error=String(e.stack||e);if(app)report.state=app.state;process.exitCode=1;}
 finally{
  try{if(screen)fs.writeFileSync(path.join(out,'last-screen.png'),screen.toBuffer('image/png'));}catch(e){report.screenshotError=String(e);report.result='fail';process.exitCode=1;}
  app?.dispose();for(const timer of frames.values())clearTimeout(timer);
  try{staged?.cleanup();}catch(e){report.cleanupError=String(e);report.result='fail';process.exitCode=1;}
  fs.writeFileSync(path.join(out,'canvas-report.json'),JSON.stringify(report,null,2)+'\n');fs.writeSync(1,JSON.stringify(report)+'\n');process.exit(process.exitCode||0);
 }
})();
