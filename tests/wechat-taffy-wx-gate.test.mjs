import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {compareMetrics,runTitleGridCases,runNativeTitleGrid,CASES}=require('../platforms/wechat/vendor-eval/taffy-wx-gate.cjs');
const metric=(w,g,i)=>{const free=w-g;const b=Math.max(248,free*.48);const a=free-b;return [a,a+g,b,w][i];};
test('both Grid scenarios require the minimum constraint and fractional tracks',()=>{
  const result=runTitleGridCases({TaffyTitleGridMetric:metric});
  assert.equal(result.pass,true); assert.equal(result.cases.length,2);
  assert.equal(result.cases[1].expected.secondWidth,248);
  assert.ok(result.maxDeltaPx<1e-9);
});
test('reject unconstrained fractions at narrow width',()=>{
  const r=runTitleGridCases({TaffyTitleGridMetric:(w,g,i)=>[(w-g)*.52,(w-g)*.52+g,(w-g)*.48,w][i]});
  assert.equal(r.pass,false);assert.equal(r.cases[0].pass,true);assert.equal(r.cases[1].pass,false);
});
test('compare exactly the same nonempty finite numeric metric set',()=>{
  assert.throws(()=>compareMetrics({},{}),/empty/i);
  assert.throws(()=>compareMetrics({x:1},{y:1}),/keys/i);
  for(const v of [NaN,Infinity,null,'1',undefined]) assert.throws(()=>compareMetrics({x:1},{x:v}),/finite/i);
});
test('0.5 logical pixel threshold, no rounding or permissive NaN',()=>{
  assert.equal(compareMetrics({x:1},{x:1.5}).pass,true);
  assert.equal(compareMetrics({x:1},{x:1.5001}).pass,false);
  assert.throws(()=>compareMetrics({x:1},{x:1},1),/tolerance/i);
});
test('missing and malformed exports cannot pass',()=>{
  assert.throws(()=>runTitleGridCases({}),/export/i);
  assert.throws(()=>runTitleGridCases({TaffyTitleGridMetric:()=>NaN}),/finite/i);
});
test('native loader accepts standard instance shape and wrapped result',async()=>{
  for(const wrap of [false,true]) {
    let calls=0;
    const host={WXWebAssembly:{async instantiate(path,imports){calls++;assert.equal(path,'taffy-title-grid.wasm');assert.deepEqual(imports,{});const instance={exports:{TaffyTitleGridMetric:metric}};return wrap?{instance}:instance;}},WebAssembly:{instantiate(){assert.fail('standard fallback');}}};
    const r=await runNativeTitleGrid(host);assert.equal(r.pass,true);assert.equal(r.runtime,'wx');assert.equal(calls,1);
    assert.equal(r.releaseReady,false);
  }
});
test('native gate never falls back when absent or rejected',async()=>{
  let fallback=0;const WebAssembly={instantiate(){fallback++;}};
  await assert.rejects(runNativeTitleGrid({WebAssembly}),/WXWebAssembly/);
  await assert.rejects(runNativeTitleGrid({WebAssembly,WXWebAssembly:{instantiate(){throw Error('native denied');}}}),/native denied/);
  assert.equal(fallback,0);
});
test('native malformed instance and failing geometry are distinct',async()=>{
  await assert.rejects(runNativeTitleGrid({WXWebAssembly:{instantiate:async()=>({})}}),/instance/i);
  const r=await runNativeTitleGrid({WXWebAssembly:{instantiate:async()=>({exports:{TaffyTitleGridMetric:()=>0}})}});
  assert.equal(r.pass,false);assert.equal(r.releaseReady,false);
});
test('fixtures are immutable',()=>{assert.throws(()=>{CASES[0].expected.firstWidth=0;},TypeError);});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeTaffyWxFixture} from '../platforms/wechat/vendor-eval/taffy-wx-fixture.mjs';
test('fixture refuses invalid or wrong WASM before creating output',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'taffy-gate-'));
  try{
    const wasmPath=path.join(tmp,'probe.wasm'),licensePath=path.join(tmp,'LICENSE'),outDir=path.join(tmp,'fixture');
    fs.writeFileSync(licensePath,'MIT License\nPermission is hereby granted');
    fs.writeFileSync(wasmPath,'not wasm');
    await assert.rejects(writeTaffyWxFixture({wasmPath,licensePath,outDir}),/WebAssembly/);
    assert.equal(fs.existsSync(outDir),false);
    // Valid empty WASM binary, no metric export.
    fs.writeFileSync(wasmPath,Buffer.from([0,97,115,109,1,0,0,0]));
    await assert.rejects(writeTaffyWxFixture({wasmPath,licensePath,outDir}),/export/i);
    assert.equal(fs.existsSync(outDir),false);
    await assert.rejects(writeTaffyWxFixture({wasmPath,licensePath,outDir,appid:'invalid'}),/AppID/);
    assert.equal(fs.existsSync(outDir),false);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

// A 161-byte synthetic WASM test double, not Taffy. Compiled from the same
// metric() above with f32 inputs/outputs; proves packaging, not vendor behavior.
const syntheticWasm=Buffer.from('AGFzbQEAAAABCAFgA319fwF9AwIBAAUDAQACBggBfwFBgIgECwchAgZtZW1vcnkCABRUYWZmeVRpdGxlR3JpZE1ldHJpYwAAClcBVQECfSAAIAGTIgNDAAB4QyADQ4/C9T6UIgMgA0MAAHhDXRsiBJMhAwJAAkACQAJAAkAgAg4EBAABAgMLIAMgAZIPCyAEDwsgAA8LQwAAwH8hAwsgAws=','base64');
import vm from 'node:vm';
test('package a passing test-double WASM and exercise generated game with simulated WX host',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'taffy-fixture-'));
  try{
    const wasmPath=path.join(tmp,'probe.wasm'),licensePath=path.join(tmp,'LICENSE'),outDir=path.join(tmp,'fixture');
    fs.writeFileSync(wasmPath,syntheticWasm);fs.writeFileSync(licensePath,'MIT License\nPermission is hereby granted');
    const manifest=await writeTaffyWxFixture({wasmPath,licensePath,outDir});
    assert.equal(manifest.hostGeometry.pass,true);assert.equal(manifest.wxWebAssembly,'not-run');assert.equal(manifest.releaseReady,false);
    assert.deepEqual(fs.readFileSync(path.join(outDir,'taffy-title-grid.wasm')),syntheticWasm);
    assert.equal(JSON.parse(fs.readFileSync(path.join(outDir,'project.config.json'))).compileType,'game');
    const result=await WebAssembly.instantiate(syntheticWasm,{});
    const gate=require('../platforms/wechat/vendor-eval/taffy-wx-gate.cjs');
    const ctx={fillRect(){},fillText(){}};const host={module:{exports:{}},console:{log(){},error(){}},wx:{createCanvas:()=>({getContext:()=>ctx}),getWindowInfo:()=>({windowWidth:844,windowHeight:390})},WXWebAssembly:{instantiate:async()=>result}};
    host.require=()=>({...gate,runNativeTitleGrid:()=>gate.runNativeTitleGrid(host)});
    vm.runInNewContext(fs.readFileSync(path.join(outDir,'game.js'),'utf8'),host);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(host.__H5PUBLISHER_TAFFY_WX__.phase,'pass');assert.equal(host.__H5PUBLISHER_TAFFY_WX__.releaseReady,false);
    await assert.rejects(writeTaffyWxFixture({wasmPath,licensePath,outDir}),/EEXIST/);
    assert.deepEqual(fs.readFileSync(path.join(outDir,'taffy-title-grid.wasm')),syntheticWasm);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
