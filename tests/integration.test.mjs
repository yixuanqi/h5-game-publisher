import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {auditHtml,adaptMain,exportGame} from '../scripts/import-blog.mjs';
function fixture(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'h5-import-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
const curioMain="  window.addEventListener('pagehide', handleAppHide);";
test('Curio import is byte-identical to selected original source and excludes dev tools',t=>{
  const d=fixture(t),checkout=path.join(d,'upstream'),s=path.join(checkout,'docs','curio-box');fs.mkdirSync(path.join(s,'src'),{recursive:true});
  fs.writeFileSync(path.join(s,'index.html'),'<head><link rel="stylesheet" href="./style.css?v=1"></head><script src="src/main.js"></script>');
  fs.writeFileSync(path.join(s,'style.css'),'');fs.writeFileSync(path.join(s,'src','main.js'),curioMain);fs.writeFileSync(path.join(s,'README.md'),'dev');
  const out=path.join(d,'out');assert.equal(exportGame('curio-box',checkout,out).entryResources.length,2);
  assert.equal(fs.readFileSync(path.join(s,'src','main.js'),'utf8'),curioMain);assert.equal(fs.readFileSync(path.join(out,'src','main.js'),'utf8'),curioMain);
  assert.equal(fs.existsSync(path.join(out,'README.md')),false);assert.throws(()=>exportGame('curio-box',checkout,out),/already exists/);
});
test('adapter fail-closed on absent or duplicate anchors',()=>{
  assert.throws(()=>adaptMain('curio-box','changed'),/anchor/);assert.throws(()=>adaptMain('curio-box',curioMain+'\n'+curioMain),/anchor/);
  const a=adaptMain('ashen-bell-vow',"if ('serviceWorker' in navigator && !window.__ABV_OFFLINE_WORLD__) {\nconst _recoverAudioOnGesture = () => {");
  assert.match(a,/!window\.H5Publisher\?\.isNative/);assert.match(a,/openPauseModal/);
});
test('HTML audit rejects remote, absolute, traversal and absent entry resources',t=>{
  const d=fixture(t);for(const r of ['https://cdn.example/a.js','//cdn.example/a.js','/a.js','../a.js','missing.js']){
    fs.writeFileSync(path.join(d,'index.html'),'<script src="'+r+'"></script>');assert.throws(()=>auditHtml(d));
  }
});
test('native background cannot be overridden by visibility or stale initial state',async()=>{
  const events=[],dom={},native={};let resolveInitial;
  const document={hidden:false,readyState:'complete',addEventListener:(n,f)=>dom[n]=f};
  const window={Capacitor:{isNativePlatform:()=>true,Plugins:{App:{addListener:(n,f)=>{native[n]=f;return Promise.resolve({});},getState:()=>new Promise(r=>resolveInitial=r)}}},addEventListener:(n,f)=>dom[n]=f,dispatchEvent:e=>events.push(e.type)};
  class CustomEvent{constructor(type){this.type=type;}}
  runInNewContext(fs.readFileSync(new URL('../scripts/runtime.js',import.meta.url),'utf8'),{document,window,CustomEvent,console});
  native.appStateChange({isActive:false});resolveInitial({isActive:true});await Promise.resolve();
  document.hidden=true;dom.visibilitychange();document.hidden=false;dom.visibilitychange();
  assert.equal(window.H5Publisher.isPaused(),true);
  native.backButton();native.appStateChange({isActive:true});
  assert.deepEqual(events,['h5publisher:pause','h5publisher:back','h5publisher:resume']);
});

test('Android onPause/onResume without onStop pauses game exactly once (CI 45572525732)',async()=>{
  const events=[],dom={},native={};let resolveInitial;
  const document={hidden:false,readyState:'complete',addEventListener:(n,f)=>dom[n]=f};
  const window={Capacitor:{isNativePlatform:()=>true,Plugins:{App:{addListener:(n,f)=>{native[n]=f;return Promise.resolve({});},getState:()=>new Promise(r=>resolveInitial=r)}}},addEventListener:(n,f)=>dom[n]=f,dispatchEvent:e=>events.push(e.type)};
  class CustomEvent{constructor(type){this.type=type;}}
  runInNewContext(fs.readFileSync(new URL('../scripts/runtime.js',import.meta.url),'utf8'),{document,window,CustomEvent,console});
  native.pause();resolveInitial({isActive:true});await Promise.resolve();
  native.appStateChange({isActive:true});
  assert.equal(window.H5Publisher.isPaused(),true);
  assert.equal(window.H5Publisher.lifecycleSnapshot().nativePauses,1);
  native.pause();document.hidden=true;dom.visibilitychange();
  document.hidden=false;dom.visibilitychange();
  assert.equal(window.H5Publisher.isPaused(),true);
  native.resume();native.resume();
  assert.equal(window.H5Publisher.isPaused(),false);
  assert.deepEqual(events,['h5publisher:pause','h5publisher:resume']);
});
test('full native stop/start and visibility remain separate lifecycle gates',async()=>{
  const events=[],dom={},native={};
  const document={hidden:false,readyState:'complete',addEventListener:(n,f)=>dom[n]=f};
  const window={Capacitor:{isNativePlatform:()=>true,Plugins:{App:{addListener:(n,f)=>{native[n]=f;return Promise.resolve({});},getState:()=>Promise.resolve({isActive:true})}}},addEventListener:(n,f)=>dom[n]=f,dispatchEvent:e=>events.push(e.type)};
  class CustomEvent{constructor(type){this.type=type;}}
  runInNewContext(fs.readFileSync(new URL('../scripts/runtime.js',import.meta.url),'utf8'),{document,window,CustomEvent,console});
  await Promise.resolve();native.pause();native.appStateChange({isActive:false});
  document.hidden=true;dom.visibilitychange();native.appStateChange({isActive:true});native.resume();
  assert.equal(window.H5Publisher.isPaused(),true);
  document.hidden=false;dom.visibilitychange();
  assert.equal(window.H5Publisher.isPaused(),false);
  assert.deepEqual(events,['h5publisher:pause','h5publisher:resume']);
});
