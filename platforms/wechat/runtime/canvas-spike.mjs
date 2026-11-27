import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom/worker';
import {createCanvas} from '@napi-rs/canvas';
import {build} from 'esbuild';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob,sha256} from '../../../scripts/source-integrity.mjs';
import {installCanvasBridge} from './canvas-bridge.mjs';
import {createNavigatorBridge} from './navigator-bridge.mjs';
import {createPerformanceBridge} from './performance-bridge.mjs';
import {createFrameScheduler} from './frame-scheduler.mjs';
import {installViewportBridge} from './viewport-bridge.mjs';
import {performance as nodePerformance} from 'node:perf_hooks';
const {createLocalFetch}=createRequire(import.meta.url)('../bootstrap/runtime.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream'),source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-runtime-052b-canvas'),raw=path.join(work,'raw'),out=path.join(work,'evidence');
assertDisjoint(checkout,work);assert.ok(!fs.existsSync(work),'Fresh workspace required');
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);
const before=snapshot(source);
fs.mkdirSync(out,{recursive:true});
const report={stage:'0.5.2b-canvas-spike',sourceSha:spec.sourceSha,framework:git(root,'rev-parse','HEAD'),result:'fail',backend:'Skia / Node diagnostic',domSemantics:'linkedom/worker@0.18.15',officialDevTools:'not-run',gameplayParity:'not-run',releaseReady:false};
let rawBefore;
async function attempt(code,html,{canvas=false,navigator=false,timers=false,packagedFetch=false,performanceBridge=false,frames=false}={}){
  const {window,document}=parseHTML(html);
  const viewport=installViewportBridge(window,{getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:2,screenWidth:844,screenHeight:390}),getSystemInfoSync:()=>({windowWidth:844,windowHeight:390,pixelRatio:2,screenWidth:844,screenHeight:390,platform:'android'}),getDeviceInfo:()=>({platform:'android'})});
  const bridge=canvas?installCanvasBridge(document,(w,h)=>createCanvas(w,h)):null;
  const nav=navigator?createNavigatorBridge({platform:'android',system:'Android 14',language:'zh_CN',wechatVersion:'8.0'}):undefined;
  if(nav){
    try{Object.defineProperty(window,'navigator',{configurable:true,value:nav});}
    catch{try{window.navigator=nav;}catch{}}
  }
  const fetchLocal=packagedFetch?createLocalFetch({getFileSystemManager:()=>({readFileSync(name,enc){return fs.readFileSync(path.join(raw,name),enc);}})}):undefined;
  const webPerformance=performanceBridge?createPerformanceBridge({getPerformance:()=>({now:()=>nodePerformance.now()*1000})}):undefined;
  if(webPerformance){
    try{Object.defineProperty(window,'performance',{configurable:true,value:webPerformance});}
    catch{try{window.performance=webPerformance;}catch{}}
  }
  const frameQueue=new Map();let frameId=0;
  const rawFrameHost=frames?{
    requestAnimationFrame(cb){const id=++frameId;frameQueue.set(id,cb);return id;},
    cancelAnimationFrame(id){frameQueue.delete(id);}
  }:undefined;
  const frame=frames?createFrameScheduler(null,webPerformance,rawFrameHost):undefined;
  if(frame){
    try{
      Object.defineProperty(window,'requestAnimationFrame',{configurable:true,value:frame.requestAnimationFrame});
      Object.defineProperty(window,'cancelAnimationFrame',{configurable:true,value:frame.cancelAnimationFrame});
    }catch{try{window.requestAnimationFrame=frame.requestAnimationFrame;window.cancelAnimationFrame=frame.cancelAnimationFrame;}catch{}}
  }
  const observed=[];
  const observedConsole={
    log:(...args)=>observed.push({level:'log',text:args.map(String).join(' ')}),
    warn:(...args)=>observed.push({level:'warn',text:args.map(String).join(' ')}),
    error:(...args)=>observed.push({level:'error',text:args.map(String).join(' ')})
  };
  const context=vm.createContext({window,document,console:observedConsole,...(nav?{navigator:nav}:{}),...(timers?{setTimeout,clearTimeout}:{}),...(fetchLocal?{fetch:fetchLocal}:{}),...(webPerformance?{performance:webPerformance}:{}),...(frame?{requestAnimationFrame:frame.requestAnimationFrame,cancelAnimationFrame:frame.cancelAnimationFrame}:{})});
  let outcome;
  try{vm.runInContext(code,context,{timeout:5000,filename:'original-main.bundle.js'});outcome={status:'returned-sync'};}
  catch(e){outcome={status:'blocked',error:String(e),stack:String(e.stack).split('\n').slice(0,14)};}
  // Let bootstrapGame() promise continuations and its own catch handler run.
  await Promise.resolve();await Promise.resolve();
  // Frozen NG1 loader retries the primary manifest (450+900 ms) and then
  // the legacy fallback (450+900 ms). This is observation time only.
  await new Promise(resolve=>setTimeout(resolve,packagedFetch?80:timers?2900:0));
  await Promise.resolve();
  if(frame&&frameQueue.size&&observed.every(x=>x.level!=='error')){
    const [id,cb]=frameQueue.entries().next().value;frameQueue.delete(id);
    try{cb();}catch(e){observed.push({level:'error',text:'[FrameError] '+String(e)});}
    await Promise.resolve();
  }
  const asyncErrors=observed.filter(x=>x.level==='error');
  const bootVerified=window.__ABV_BOOTED__===true;
  const viewportState={width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio,landscape:window.matchMedia('(orientation: landscape)').matches,coarse:window.matchMedia('(hover: none) and (pointer: coarse)').matches};viewport.dispose();
  return {...outcome,asyncErrors,observed:observed.slice(-20),queuedFrames:frameQueue.size,stats:bridge?{...bridge.stats}:null,navigator:nav?{userAgent:nav.userAgent,platform:nav.platform,maxTouchPoints:nav.maxTouchPoints,serviceWorker:'serviceWorker' in nav}:null,viewport:viewportState,bootVerified,cssLayoutVerified:false};
}
try{
  const imported=exportGame(spec.game,checkout,raw);rawBefore=snapshot(raw);
  report.rawFilesSha256=imported.sourceFilesSha256;
  const html=fs.readFileSync(path.join(raw,'index.html'),'utf8');
  const bundle=await build({absWorkingDir:raw,entryPoints:['src/main.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2018',metafile:true,logLevel:'silent'});
  const code=bundle.outputFiles[0].text;report.bundleSha256=sha256(code);report.modules=Object.keys(bundle.metafile.inputs).length;
  assert.ok(bundle.metafile.inputs['src/main.js']);
  report.red=await attempt(code,html);
  assert.match(report.red.error||'',/createRadialGradient/,'Frozen Red blocker changed; inspect before adapting');
  report.canvasOnly=await attempt(code,html,{canvas:true});
  assert.ok(report.canvasOnly.stats.contexts>0&&report.canvasOnly.stats.radialGradients>0,'No real context/gradient reached in original entry');
  assert.match(report.canvasOnly.error||'',/navigator is not defined/,'Expected navigator Red blocker changed; inspect before adapting');
  report.navigatorOnly=await attempt(code,html,{canvas:true,navigator:true});
  assert.ok(report.navigatorOnly.stats.contexts>0&&report.navigatorOnly.stats.radialGradients>0,'Navigator slice lost native Canvas progress');
  assert.equal(report.navigatorOnly.navigator.serviceWorker,false,'Mini Game navigator must not advertise ServiceWorker');
  assert.match(JSON.stringify(report.navigatorOnly.asyncErrors),/setTimeout is not defined/,'Expected timer Red blocker changed; inspect before adapting');
  report.timerOnly=await attempt(code,html,{canvas:true,navigator:true,timers:true});
  assert.ok(report.timerOnly.stats.contexts>0&&report.timerOnly.stats.radialGradients>0,'Timer slice lost native Canvas progress');
  assert.match(JSON.stringify(report.timerOnly.asyncErrors),/fetch is not defined/,'Expected packaged fetch Red blocker changed; inspect before adapting');
  report.fetchOnly=await attempt(code,html,{canvas:true,navigator:true,timers:true,packagedFetch:true});
  assert.ok(report.fetchOnly.stats.contexts>0&&report.fetchOnly.stats.radialGradients>0,'Packaged fetch slice lost native Canvas progress');
  assert.match(JSON.stringify(report.fetchOnly.asyncErrors),/performance is not defined/,'Expected performance Red blocker changed; inspect before adapting');
  report.performanceOnly=await attempt(code,html,{canvas:true,navigator:true,timers:true,packagedFetch:true,performanceBridge:true});
  assert.ok(report.performanceOnly.stats.contexts>0&&report.performanceOnly.stats.radialGradients>0,'Performance slice lost native Canvas progress');
  assert.match(JSON.stringify(report.performanceOnly.asyncErrors),/requestAnimationFrame is not defined/,'Expected rAF Red blocker changed; inspect before adapting');
  report.green=await attempt(code,html,{canvas:true,navigator:true,timers:true,packagedFetch:true,performanceBridge:true,frames:true});
  assert.ok(report.green.stats.contexts>0&&report.green.stats.radialGradients>0,'Frame scheduler slice lost native Canvas progress');
  assert.doesNotMatch(JSON.stringify(report.green.asyncErrors),/requestAnimationFrame is not defined/,'Frame scheduler blocker persists');
  assert.ok(report.green.bootVerified||report.green.asyncErrors.length>0,'One native-style frame produced neither boot evidence nor an observable blocker');
  // Independent native raster evidence, not a screenshot of the game or a visual parity result.
  const {document}=parseHTML('<html><body><canvas id="screen" width="32" height="32"></canvas></body></html>');
  const bridge=installCanvasBridge(document,(w,h)=>createCanvas(w,h));
  const screen=document.getElementById('screen'),ctx=screen.getContext('2d'),sprite=document.createElement('canvas');
  sprite.width=8;sprite.height=8;const s=sprite.getContext('2d');
  const gradient=s.createRadialGradient(4,4,0,4,4,4);gradient.addColorStop(0,'red');gradient.addColorStop(1,'red');
  s.fillStyle=gradient;s.fillRect(0,0,8,8);
  ctx.drawImage(sprite,0,0);ctx.fillStyle=ctx.createPattern(sprite,'repeat');ctx.fillRect(8,0,8,8);
  const a=Array.from(ctx.getImageData(2,2,1,1).data),b=Array.from(ctx.getImageData(10,2,1,1).data);
  assert.deepEqual(a,[255,0,0,255]);assert.deepEqual(b,a);
  assert.equal(screen.getContext('2d'),ctx);assert.equal(ctx.canvas,screen);assert.notEqual(bridge.getSurface(screen),bridge.getSurface(sprite));
  screen.width=64;assert.equal(bridge.getSurface(screen).width,64);assert.equal(screen.getContext('2d'),ctx);
  assert.equal(ctx.getImageData(2,2,1,1).data[3],0,'Resize must clear raster');
  ctx.drawImage(sprite,0,0);assert.deepEqual(Array.from(ctx.getImageData(2,2,1,1).data),a);
  fs.writeFileSync(path.join(out,'raster-control.png'),bridge.getSurface(screen).toBuffer('image/png'));
  report.rasterControl={drawImage:a,createPattern:b,resizeCleared:true,stats:bridge.stats};
  report.result='pass';
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  try{assertSnapshot(source,before,'Original game');if(rawBefore)assertSnapshot(raw,rawBefore,'Raw export');report.sourceIntegrity='pass';}
  catch(e){report.sourceIntegrity='fail';report.result='fail';report.error=String(e);process.exitCode=1;}
  fs.writeFileSync(path.join(out,'canvas-spike-report.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeSync(1,JSON.stringify(report)+'\n');
}
