import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {createCanvas} from '@napi-rs/canvas';
import {build} from 'esbuild';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob,sha256} from '../../../scripts/source-integrity.mjs';
import {installCanvasBridge} from './canvas-bridge.mjs';
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
const report={stage:'0.5.2b-canvas-spike',sourceSha:spec.sourceSha,framework:git(root,'rev-parse','HEAD'),result:'fail',backend:'Skia / Node diagnostic',officialDevTools:'not-run',gameplayParity:'not-run',releaseReady:false};
let rawBefore;
function attempt(code,html,enabled){
  const {window,document}=parseHTML(html);
  const bridge=enabled?installCanvasBridge(document,(w,h)=>createCanvas(w,h)):null;
  const context=vm.createContext({window,document});
  let outcome;
  try{vm.runInContext(code,context,{timeout:5000,filename:'original-main.bundle.js'});outcome={status:'returned-sync-only'};}
  catch(e){outcome={status:'blocked',error:String(e),stack:String(e.stack).split('\n').slice(0,14)};}
  return {...outcome,stats:bridge?{...bridge.stats}:null,bootVerified:false,cssLayoutVerified:false};
}
try{
  const imported=exportGame(spec.game,checkout,raw);rawBefore=snapshot(raw);
  report.rawFilesSha256=imported.sourceFilesSha256;
  const html=fs.readFileSync(path.join(raw,'index.html'),'utf8');
  const bundle=await build({absWorkingDir:raw,entryPoints:['src/main.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2018',metafile:true,logLevel:'silent'});
  const code=bundle.outputFiles[0].text;report.bundleSha256=sha256(code);report.modules=Object.keys(bundle.metafile.inputs).length;
  assert.ok(bundle.metafile.inputs['src/main.js']);
  report.red=attempt(code,html,false);
  assert.match(report.red.error||'',/createRadialGradient/,'Frozen Red blocker changed; inspect before adapting');
  report.green=attempt(code,html,true);
  assert.ok(report.green.stats.contexts>0&&report.green.stats.radialGradients>0,'No real context/gradient reached in original entry');
  assert.doesNotMatch(report.green.error||'',/Cannot read properties of null \(reading 'createRadialGradient'\)/,'Original blocker persists');
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
