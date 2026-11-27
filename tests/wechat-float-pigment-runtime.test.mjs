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
  const memory={buffer:new ArrayBuffer(2048)};let ptr=128,next=1,freed=0,columns,display,width,gaps=[],calculated;
  const e={memory,FpAbiVersion:()=>1,FpNodeNew:()=>next++,FpNodeFree(){},FpNodeAppend(){return 1},FpNodeSetDisplay(h,v){display=v;return 1},FpNodeSetWidth(h,u,v){width=[u,v];return 1},FpNodeSetHeight(){return 1},FpNodeSetGap(h,a,u,v){gaps.push([a,u,v]);return 1},FpNodeSetFlexDirection(){return 1},FpNodeSetJustifyContent(){return 1},FpNodeSetAlignItems(){return 1},FpGridTracksAlloc:()=>ptr,FpGridTracksFree:()=>freed++,FpNodeSetGridTemplateColumns(h,p,n){columns=[...new Float32Array(memory.buffer,p,n*2)];return 1},FpNodeSetGridTemplateRows(){return 1},FpNodeCalculate(...args){calculated=args;return 1},FpNodeLeft:()=>1,FpNodeTop:()=>2,FpNodeWidth:()=>3,FpNodeHeight:()=>4};
  const fp=createFloatPigmentBackend({exports:e}),root=fp.createNode();fp.setDisplay(root,'grid');fp.setWidth(root,{unit:'percent',value:.5});fp.setGap(root,{row:4,column:9});fp.setGridTemplateColumns(root,[{unit:'fr',value:1},{unit:'px',value:20},{unit:'min-content'}]);
  assert.equal(display,3);assert.deepEqual(width,[2,.5]);assert.deepEqual(gaps,[[0,1,4],[1,1,9]]);assert.deepEqual(columns,[3,1,1,20,4,0]);assert.equal(freed,1);assert.deepEqual(fp.rect(root),{x:1,y:2,width:3,height:4});
  fp.calculate(root,{width:530,height:Infinity,maxWidth:530,maxHeight:720});assert.deepEqual(calculated,[root,530,Infinity,530,720]);
  assert.throws(()=>fp.calculate(root,{width:530,height:-Infinity,maxWidth:530,maxHeight:720}),/finite or \+Infinity/);
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


test('additive DOM box ABI serializes flex sizing, box edges, positioning and fails closed when capability is absent',()=>{
  const memory={buffer:new ArrayBuffer(4096)},calls=[],base={
    memory,FpAbiVersion:()=>1,FpNodeNew:()=>1,FpNodeFree(){},FpNodeAppend(){return 1},
    FpNodeSetDisplay(){return 1},FpNodeSetWidth(){return 1},FpNodeSetHeight(){return 1},FpNodeSetGap(){return 1},
    FpNodeSetFlexDirection(){return 1},FpNodeSetJustifyContent(){return 1},FpNodeSetAlignItems(){return 1},
    FpGridTracksAlloc:()=>128,FpGridTracksFree(){},FpNodeSetGridTemplateColumns(){return 1},FpNodeSetGridTemplateRows(){return 1},
    FpNodeCalculate(){return 1},FpNodeLeft:()=>0,FpNodeTop:()=>0,FpNodeWidth:()=>0,FpNodeHeight:()=>0
  };
  const extra={
    FpNodeSetMinWidth:(...a)=>(calls.push(['minw',...a]),1),
    FpNodeSetMinHeight:(...a)=>(calls.push(['minh',...a]),1),
    FpNodeSetMaxWidth:(...a)=>(calls.push(['maxw',...a]),1),
    FpNodeSetMaxHeight:(...a)=>(calls.push(['maxh',...a]),1),
    FpNodeSetBoxSizing:(...a)=>(calls.push(['box',...a]),1),
    FpNodeSetPadding:(...a)=>(calls.push(['pad',...a]),1),
    FpNodeSetMargin:(...a)=>(calls.push(['margin',...a]),1),
    FpNodeSetBorder:(...a)=>(calls.push(['border',...a]),1),
    FpNodeSetPosition:(...a)=>(calls.push(['position',...a]),1),
    FpNodeSetInset:(...a)=>(calls.push(['inset',...a]),1),
    FpNodeSetFlexGrow:(...a)=>(calls.push(['grow',...a]),1),
    FpNodeSetFlexShrink:(...a)=>(calls.push(['shrink',...a]),1),
    FpNodeSetFlexBasis:(...a)=>(calls.push(['basis',...a]),1),
    FpNodeSetFlexWrap:(...a)=>(calls.push(['wrap',...a]),1),
    FpNodeSetAlignSelf:(...a)=>(calls.push(['self',...a]),1)
  };
  const fp=createFloatPigmentBackend({exports:{...base,...extra}});
  fp.setMinWidth(1,{unit:'percent',value:.5});fp.setMinHeight(1,36);fp.setMaxWidth(1,500);fp.setMaxHeight(1,{unit:'undefined'});
  fp.setBoxSizing(1,'border-box');
  fp.setPadding(1,{top:10,right:20,bottom:30,left:40});
  fp.setMargin(1,{top:{unit:'auto'},right:2,bottom:3,left:4});
  fp.setBorder(1,{top:1,right:2,bottom:3,left:4});
  fp.setPosition(1,'absolute');fp.setInset(1,{top:10,left:{unit:'percent',value:.5}});
  fp.setFlexGrow(1,1);fp.setFlexShrink(1,0);fp.setFlexBasis(1,{unit:'percent',value:0});
  fp.setFlexWrap(1,'wrap');fp.setAlignSelf(1,'flex-end');

  assert.ok(calls.some(x=>x[0]==='minw'&&x[2]===2&&x[3]===.5));
  assert.deepEqual(calls.filter(x=>x[0]==='pad').map(x=>x.slice(2)),[[0,1,10],[1,1,20],[2,1,30],[3,1,40]]);
  assert.ok(calls.some(x=>x[0]==='margin'&&x[2]===0&&x[3]===0));
  assert.deepEqual(calls.find(x=>x[0]==='box').slice(1),[1,2]);
  assert.deepEqual(calls.find(x=>x[0]==='position').slice(1),[1,2]);
  assert.ok(calls.some(x=>x[0]==='inset'&&x[2]===1&&x[3]===3&&x[4]===0),'unspecified inset uses undefined length');
  assert.deepEqual(calls.find(x=>x[0]==='grow').slice(1),[1,1]);
  assert.deepEqual(calls.find(x=>x[0]==='wrap').slice(1),[1,1]);
  assert.deepEqual(calls.find(x=>x[0]==='self').slice(1),[1,9]);

  const legacy=createFloatPigmentBackend({exports:base});
  assert.throws(()=>legacy.setPadding(1,{top:1}),/Missing float-pigment DOM ABI export/);
  assert.throws(()=>fp.setFlexGrow(1,-1),/non-negative/);
  assert.throws(()=>fp.setPosition(1,'potato'),/Unsupported position/);
});
