import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {runTitleGridCases}=require('./taffy-wx-gate.cjs');
const here=path.dirname(fileURLToPath(import.meta.url));
const game=`'use strict';
const {runNativeTitleGrid}=require('./taffy-wx-gate.js');
const state=globalThis.__H5PUBLISHER_TAFFY_WX__={phase:'loading',releaseReady:false};
const canvas=wx.createCanvas(),ctx=canvas.getContext('2d');
function paint(){
  const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
  canvas.width=Math.max(1,info.windowWidth||640);canvas.height=Math.max(1,info.windowHeight||360);
  ctx.fillStyle=state.phase==='pass'?'#184c37':state.phase==='loading'?'#16324f':'#6b1d2a';
  ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ffffff';ctx.font='20px sans-serif';
  ctx.fillText('Taffy WX Grid: '+state.phase,20,40);ctx.font='14px sans-serif';
  ctx.fillText(state.message||'NOT RELEASE',20,66);
}
paint();
runNativeTitleGrid(globalThis).then(result=>{
  Object.assign(state,result,{phase:result.pass?'pass':'fail',message:'max delta: '+result.maxDeltaPx+' px'});
  console.log('[h5publisher-taffy-wx]',JSON.stringify(state));paint();
}).catch(error=>{
  Object.assign(state,{phase:'error',message:String(error)});console.error('[h5publisher-taffy-wx]',state.message);paint();
});
module.exports=state;
`;
export async function writeTaffyWxFixture({wasmPath,licensePath,outDir,appid='touristappid'}){
  if(!/^(?:touristappid|wx[0-9a-f]{16})$/.test(appid))throw Error('Invalid AppID');
  const bytes=fs.readFileSync(wasmPath),license=fs.readFileSync(licensePath,'utf8');
  if(!/permission is hereby granted/i.test(license)||!/mit license/i.test(license))throw Error('Expected upstream MIT license');
  const module=new WebAssembly.Module(bytes);
  if(WebAssembly.Module.imports(module).length)throw Error('Taffy diagnostic WASM must be import-free');
  const instance=await WebAssembly.instantiate(module,{});
  const hostGeometry=runTitleGridCases(instance.exports);
  if(!hostGeometry.pass)throw Error('Host Grid geometry gate failed: '+JSON.stringify(hostGeometry));
  const manifest={kind:'wechat-taffy-wx-grid-not-release',wasm:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},hostGeometry,expectedGlobal:'__H5PUBLISHER_TAFFY_WX__',officialDevTools:'not-run',wxWebAssembly:'not-run',releaseReady:false};
  // Refuse an existing destination; never delete/overwrite a checkout or fixture.
  outDir=path.resolve(outDir);
  fs.mkdirSync(outDir,{recursive:false});
  fs.mkdirSync(path.join(outDir,'third-party'));
  fs.writeFileSync(path.join(outDir,'taffy-title-grid.wasm'),bytes);
  fs.writeFileSync(path.join(outDir,'third-party/taffy-MIT.txt'),license);
  fs.copyFileSync(path.join(here,'taffy-wx-gate.cjs'),path.join(outDir,'taffy-wx-gate.js'));
  fs.writeFileSync(path.join(outDir,'game.js'),game);
  const json=(name,value)=>fs.writeFileSync(path.join(outDir,name),JSON.stringify(value,null,2)+'\n');
  json('game.json',{deviceOrientation:'landscape'});
  json('project.config.json',{appid,compileType:'game',projectname:'h5publisher-taffy-grid-NOT-RELEASE',miniprogramRoot:'./',setting:{es6:true,minified:false}});
  json('fixture-manifest.json',manifest);
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [wasmPath,licensePath,outDir,appid]=process.argv.slice(2);
  if(!wasmPath||!licensePath||!outDir)throw Error('Usage: node taffy-wx-fixture.mjs <probe.wasm> <Taffy LICENSE> <new-output-dir> [appid]');
  console.log(JSON.stringify(await writeTaffyWxFixture({wasmPath,licensePath,outDir,appid}),null,2));
}
