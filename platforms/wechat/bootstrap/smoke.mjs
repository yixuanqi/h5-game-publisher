// Executes the actual packaged CommonJS modules with a deliberately limited wx mock.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {snapshot,digestManifest} from '../../../scripts/source-integrity.mjs';
const work=path.resolve(process.argv[2]||'.work/wechat-bootstrap-46.1');
const project=path.join(work,'project');
const info=JSON.parse(fs.readFileSync(path.join(work,'build-info.json'),'utf8'));
assert.equal(info.projectFilesSha256,digestManifest(snapshot(project)));
assert.equal(JSON.parse(fs.readFileSync(path.join(project,'game.json'))).deviceOrientation,'landscape');
assert.equal(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).compileType,'game');
const store=new Map(),events=new Map(),reads=new Set(),draws=[];
const ctx={setTransform(){},clearRect(){},fillRect(){},strokeRect(){},fillText(t){draws.push(t)}};
const wx={
  getWindowInfo:()=>({windowWidth:844,windowHeight:390,pixelRatio:2}),
  createCanvas:()=>({getContext:t=>t==='2d'?ctx:null}),
  getFileSystemManager:()=>({readFileSync(p,encoding){reads.add(p);return fs.readFileSync(path.join(project,p),encoding)}}),
  getStorageSync:k=>store.get(k)??'',
  setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k)
};
for(const name of ['Show','Hide','TouchStart','WindowResize']){
  wx['on'+name]=fn=>events.set(name,fn);wx['off'+name]=fn=>{if(events.get(name)===fn)events.delete(name)};
}
const sandbox=vm.createContext({wx,console,setTimeout,clearTimeout,performance:{now:()=>0}});
const cache=new Map();
function load(p){
  p=path.resolve(p);
  if(cache.has(p))return cache.get(p).exports;
  const mod={exports:{}};cache.set(p,mod);
  vm.runInContext('(function(require,module,exports){'+fs.readFileSync(p,'utf8')+'\n})',sandbox,{filename:p})(id=>{
    assert.match(id,/^\.\/[a-z-]+\.js$/);
    return load(path.resolve(path.dirname(p),id));
  },mod,mod.exports);
  return mod.exports;
}
const handle=load(path.join(project,'game.js'));
await handle.ready;
assert.equal(handle.state.phase,'READY');
assert.deepEqual(Array.from(handle.state.counts),info.roomCounts);
assert.equal(handle.state.cycle,1);
assert.equal(handle.state.storage,true);assert.equal(store.size,0);
assert.ok(reads.size>=79,'Expected real manifests and rooms');
assert.ok(reads.has('data/worlds/world_ng3.json'));
assert.ok(draws.some(x=>x.includes('非正式游戏')));
events.get('TouchStart')({touches:[{clientX:420,clientY:365}]});
await handle.whenIdle();assert.equal(handle.state.cycle,2);assert.equal(handle.state.touches,1);
events.get('Hide')();const prev=draws.length;
events.get('TouchStart')({touches:[{clientX:720,clientY:365}]});
assert.equal(handle.state.touches,1);assert.equal(draws.length,prev);
events.get('Show')();assert.ok(draws.length>prev);
events.get('TouchStart')({touches:[{clientX:720,clientY:365}]});
await handle.whenIdle();assert.equal(handle.state.cycle,3);assert.equal(handle.state.touches,2);
handle.dispose();assert.equal(events.size,0);
const report={kind:'wx-mock-only',sourceSha:info.sourceSha,framework:info.framework,projectFilesSha256:info.projectFilesSha256,roomCounts:Array.from(handle.state.counts),packagedFilesRead:reads.size,checks:['entry execution','real world hydration NG1/2/3','storage roundtrip','touch cycle switch','hide ignores touch','show redraw','dispose listeners'],devtools:'not-run',android:'not-run',ios:'not-run',releaseReady:false};
fs.writeFileSync(path.join(work,'smoke-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
