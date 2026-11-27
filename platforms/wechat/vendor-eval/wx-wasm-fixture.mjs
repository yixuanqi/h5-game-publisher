import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {FLOAT_PIGMENT} from '../runtime/float-pigment-pin.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const runtime=path.resolve(here,'../runtime/float-pigment-runtime.cjs');
export function writeWxWasmFixture({wasmPath,vendor,outDir,appid='touristappid'}){
  outDir=path.resolve(outDir);wasmPath=path.resolve(wasmPath);vendor=fs.realpathSync(vendor);
  if(!/^(?:touristappid|wx[0-9a-f]{16})$/.test(appid))throw Error('Invalid AppID');
  fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(path.join(outDir,'third-party'),{recursive:true});
  fs.copyFileSync(wasmPath,path.join(outDir,'float-pigment-layout.wasm'));
  fs.copyFileSync(runtime,path.join(outDir,'layout-runtime.js'));
  fs.copyFileSync(path.join(vendor,'LICENSE'),path.join(outDir,'third-party/float-pigment-MIT.txt'));
  fs.writeFileSync(path.join(outDir,'game.json'),JSON.stringify({deviceOrientation:'landscape'},null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'project.config.json'),JSON.stringify({appid,compileType:'game',projectname:'h5publisher-float-pigment-wx-wasm-NOT-RELEASE',miniprogramRoot:'./',setting:{es6:true,minified:false}},null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'game.js'),`'use strict';\nconst {instantiatePackagedWasm,createFloatPigmentBackend}=require('./layout-runtime.js');\nconst canvas=wx.createCanvas(),ctx=canvas.getContext('2d');\nconst state=globalThis.__H5PUBLISHER_FLOAT_PIGMENT_WX__={phase:'loading',releaseReady:false,expectedX:103};\nfunction paint(){const s=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();canvas.width=Math.max(1,s.windowWidth||640);canvas.height=Math.max(1,s.windowHeight||360);ctx.fillStyle='#111827';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=state.phase==='pass'?'#d1fae5':'#fee2e2';ctx.font='20px sans-serif';ctx.fillText('float-pigment WXWebAssembly: '+state.phase,24,48);ctx.font='14px sans-serif';ctx.fillText(state.message||'',24,78);}\npaint();\ninstantiatePackagedWasm({host:globalThis,path:'float-pigment-layout.wasm',imports:{}}).then(({runtime,instance})=>{\n  const fp=createFloatPigmentBackend(instance),root=fp.createNode(),a=fp.createNode(),b=fp.createNode(),c=fp.createNode();\n  fp.setDisplay(root,'grid');fp.setWidth(root,300);fp.setGap(root,{column:9});fp.setGridTemplateColumns(root,[{unit:'fr',value:1},{unit:'fr',value:1},{unit:'fr',value:1}]);\n  for(const child of [a,b,c]){fp.setHeight(child,20);fp.appendChild(root,child);}\n  fp.calculate(root,{width:300,height:100,maxWidth:300,maxHeight:100});const x=fp.rect(b).x,delta=Math.abs(x-state.expectedX);\n  Object.assign(state,{phase:delta<=0.05?'pass':'fail',runtime,actualX:x,delta,abiVersion:fp.abiVersion,message:'x='+x+' delta='+delta});\n  console.log('[h5publisher-float-pigment-wx]',JSON.stringify(state));paint();\n}).catch(error=>{Object.assign(state,{phase:'error',message:error&&error.stack||String(error)});console.error('[h5publisher-float-pigment-wx]',state.message);paint();});\nmodule.exports=state;\n`);
  const wasm=fs.readFileSync(wasmPath);
  const manifest={kind:'wechat-wxwebassembly-layout-fixture-not-release',candidate:{...FLOAT_PIGMENT},wasm:{bytes:wasm.length,sha256:createHash('sha256').update(wasm).digest('hex')},expectedGlobal:'__H5PUBLISHER_FLOAT_PIGMENT_WX__',expectedPhase:'pass',officialDevTools:'not-run',releaseReady:false};
  fs.writeFileSync(path.join(outDir,'fixture-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
