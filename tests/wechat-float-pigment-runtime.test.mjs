import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeWxWasmFixture} from '../platforms/wechat/vendor-eval/wx-wasm-fixture.mjs';
const {instantiatePackagedWasm,createFloatPigmentBackend}=createRequire(import.meta.url)('../platforms/wechat/runtime/float-pigment-runtime.cjs');

test('WXWebAssembly is authoritative when present; invalid package paths fail and never fall back',async()=>{
  let standardCalls=0;const exports={};
  const host={WXWebAssembly:{instantiate:async p=>{assert.equal(p,'vendor/layout.wasm');return {exports};}},WebAssembly:{instantiate:async()=>{standardCalls++;}}};
  const loaded=await instantiatePackagedWasm({host,path:'vendor/layout.wasm',bytes:new Uint8Array([0])});
  assert.equal(loaded.runtime,'wx');assert.equal(loaded.instance.exports,exports);assert.equal(standardCalls,0);
  for(const p of ['../x.wasm','/x.wasm','a\\b.wasm','a.wasm?x=1','a//b.wasm'])await assert.rejects(instantiatePackagedWasm({host,path:p}),/Invalid packaged WASM path/);
  const failing={WXWebAssembly:{instantiate:async()=>{throw Error('wx failed')}},WebAssembly:{instantiate:async()=>{standardCalls++;}}};
  await assert.rejects(instantiatePackagedWasm({host:failing,path:'x.wasm',bytes:new Uint8Array([0])}),/wx failed/);assert.equal(standardCalls,0);
});

test('standard WebAssembly path is host-test-only and requires bytes',async()=>{
  const exports={ok:1};const host={WebAssembly:{instantiate:async bytes=>{assert.ok(ArrayBuffer.isView(bytes));return {instance:{exports}};}}};
  const loaded=await instantiatePackagedWasm({host,bytes:new Uint8Array([0])});assert.equal(loaded.runtime,'standard');assert.equal(loaded.instance.exports,exports);
  await assert.rejects(instantiatePackagedWasm({host}),/requires bytes/);
});

test('float-pigment ABI validates exports and serializes generic grid tracks',()=>{
  const memory={buffer:new ArrayBuffer(2048)};let ptr=128,next=1,freed=0,columns,display,width,gaps=[];
  const e={memory,FpAbiVersion:()=>1,FpNodeNew:()=>next++,FpNodeFree(){},FpNodeAppend(){return 1},FpNodeSetDisplay(h,v){display=v;return 1},FpNodeSetWidth(h,u,v){width=[u,v];return 1},FpNodeSetHeight(){return 1},FpNodeSetGap(h,a,u,v){gaps.push([a,u,v]);return 1},FpNodeSetFlexDirection(){return 1},FpNodeSetJustifyContent(){return 1},FpNodeSetAlignItems(){return 1},FpGridTracksAlloc:()=>ptr,FpGridTracksFree:()=>freed++,FpNodeSetGridTemplateColumns(h,p,n){columns=[...new Float32Array(memory.buffer,p,n*2)];return 1},FpNodeSetGridTemplateRows(){return 1},FpNodeCalculate(){return 1},FpNodeLeft:()=>1,FpNodeTop:()=>2,FpNodeWidth:()=>3,FpNodeHeight:()=>4};
  const fp=createFloatPigmentBackend({exports:e}),root=fp.createNode();fp.setDisplay(root,'grid');fp.setWidth(root,{unit:'percent',value:.5});fp.setGap(root,{row:4,column:9});fp.setGridTemplateColumns(root,[{unit:'fr',value:1},{unit:'px',value:20},{unit:'min-content'}]);
  assert.equal(display,3);assert.deepEqual(width,[2,.5]);assert.deepEqual(gaps,[[0,1,4],[1,1,9]]);assert.deepEqual(columns,[3,1,1,20,4,0]);assert.equal(freed,1);assert.deepEqual(fp.rect(root),{x:1,y:2,width:3,height:4});
  assert.throws(()=>fp.setGridTemplateColumns(root,[]),/tracks required/);
  assert.throws(()=>createFloatPigmentBackend({exports:{...e,FpAbiVersion:()=>2}}),/ABI version/);
});


test('WXWebAssembly fixture is a standalone non-release Mini Game project',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'h5pub-fp-')),vendor=path.join(tmp,'vendor'),out=path.join(tmp,'fixture'),wasm=path.join(tmp,'layout.wasm');
  fs.mkdirSync(vendor);fs.writeFileSync(path.join(vendor,'LICENSE'),'MIT fixture license');fs.writeFileSync(wasm,new Uint8Array([0,97,115,109]));
  const manifest=writeWxWasmFixture({wasmPath:wasm,vendor,outDir:out});
  assert.equal(manifest.releaseReady,false);assert.equal(manifest.officialDevTools,'not-run');
  for(const f of ['game.js','game.json','project.config.json','layout-runtime.js','float-pigment-layout.wasm','fixture-manifest.json','third-party/float-pigment-MIT.txt'])assert.ok(fs.existsSync(path.join(out,f)),f);
  const game=fs.readFileSync(path.join(out,'game.js'),'utf8');assert.match(game,/WXWebAssembly/);assert.match(game,/__H5PUBLISHER_FLOAT_PIGMENT_WX__/);assert.match(game,/PUBLISHER_FLOAT_PIGMENT_WX_READY_052D/);assert.match(game,/PUBLISHER_FLOAT_PIGMENT_WX_TOUCHED_052D/);assert.match(game,/wx\.onTouchStart/);
  const cfg=JSON.parse(fs.readFileSync(path.join(out,'project.config.json'),'utf8'));assert.equal(cfg.compileType,'game');assert.equal(cfg.appid,'touristappid');
  fs.rmSync(tmp,{recursive:true,force:true});
});
