// Actual rasterization, no fake rendering methods. wx API host is simulated.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {snapshot,digestManifest,sha256} from '../../../scripts/source-integrity.mjs';
const work=path.resolve('.work/wechat-render-46.1'),project=path.join(work,'project');
const info=JSON.parse(fs.readFileSync(path.join(work,'build-info.json'),'utf8'));
assert.equal(info.projectFilesSha256,digestManifest(snapshot(project)));
assert.equal(info.kind,'wechat-render-not-release');
function make(reference){
  const screen=createCanvas(844,390),events=new Map(),frames=new Map(),cache=new Map();
  let count=0,id=0,seed=123456789,now=0,w=844,h=390;
  const wx={getWindowInfo:()=>({windowWidth:w,windowHeight:h,pixelRatio:1}),
    createCanvas:()=>screen,createOffscreenCanvas:()=>{count++;return createCanvas(1,1)},
    getFileSystemManager:()=>({readFileSync:(p,e)=>fs.readFileSync(path.join(project,p),e)}),
    getStorageSync:()=>'',setStorageSync(){throw Error('Unexpected write')},removeStorageSync(){throw Error('Unexpected remove')}};
  for(const k of ['Show','Hide','TouchStart','WindowResize']){
    wx['on'+k]=f=>events.set(k,f);wx['off'+k]=f=>{if(events.get(k)===f)events.delete(k)};
  }
  const sandbox=vm.createContext({wx,console,setTimeout,clearTimeout,performance:{now:()=>now},
    requestAnimationFrame:cb=>{frames.set(++id,cb);return id},cancelAnimationFrame:i=>frames.delete(i),
    rand:()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}});
  vm.runInContext('Math.random=rand',sandbox);
  if(reference)sandbox.document={createElement(tag){assert.equal(tag,'canvas');return wx.createOffscreenCanvas()}};
  function load(p){
    p=path.resolve(p);if(cache.has(p))return cache.get(p).exports;
    const mod={exports:{}};cache.set(p,mod);
    vm.runInContext('(function(require,module,exports){'+fs.readFileSync(p,'utf8')+'\n})',sandbox,{filename:p})(rel=>{
      assert.match(rel,/^\.\/[a-z-]+\.js$/);
      return load(path.resolve(path.dirname(p),rel));
    },mod,mod.exports);return mod.exports;
  }
  const handle=reference?load(path.join(project,'host.js')).startRender(wx,()=>load(path.join(work,'reference-engine.js')),sandbox):load(path.join(project,'game.js'));
  function tick(ts){assert.equal(frames.size,1);const [i,cb]=frames.entries().next().value;frames.delete(i);now=ts;cb(ts);assert.equal(handle.state.phase,'READY',handle.state.error);}
  function select(i){events.get('TouchStart')({touches:[{clientX:(i+.5)*w/3,clientY:h-14}]});assert.equal(handle.state.index,i);}
  return {screen,events,frames,handle,tick,select,get count(){return count},resize(a,b){w=a;h=b;events.get('WindowResize')();}};
}
const a=make(false),b=make(true);await Promise.all([a.handle.ready,b.handle.ready]);
const screenshots=path.join(work,'screenshots');fs.mkdirSync(screenshots);
const records=[];const names=['sanctuary','foundry','frost-summit'];
function pixels(c){return Buffer.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);}
for(let i=0;i<3;i++){
  if(i){a.select(i);b.select(i);}
  for(let n=0;n<6;n++){const ts=(i*6+n+1)*1000/60;a.tick(ts);b.tick(ts);}
  const pa=pixels(a.screen),pb=pixels(b.screen);
  // Exact reference comparison on same backend and deterministic fixture; not real-device parity.
  assert.equal(sha256(pa),sha256(pb),'Original/adapter raster divergence '+names[i]);
  const colors=new Set();for(let j=0;j<pa.length;j+=4*41)colors.add(pa.readUInt32LE(j));
  assert.ok(colors.size>100,'Blank or flat render '+names[i]);
  const png=a.screen.toBuffer('image/png'),name=names[i]+'.png';fs.writeFileSync(path.join(screenshots,name),png);
  records.push({name,room:a.handle.state.room,width:a.screen.width,height:a.screen.height,uniqueSampleColors:colors.size,pixelSha256:sha256(pa),pngSha256:sha256(png),referenceEqual:true});
}
assert.equal(new Set(records.map(x=>x.pixelSha256)).size,3);
const before=pixels(a.screen);a.tick(333);assert.notEqual(sha256(before),sha256(pixels(a.screen)),'Frame animation must change pixels');
a.events.get('Hide')();assert.equal(a.frames.size,0);const frameCount=a.handle.state.frames;
a.events.get('TouchStart')({touches:[{clientX:10,clientY:380}]});assert.equal(a.handle.state.index,2);
a.events.get('Show')();a.tick(9000);assert.equal(a.handle.state.frames,frameCount+1);
a.resize(780,360);a.tick(9016);assert.equal(a.screen.width,780);assert.equal(a.screen.height,360);
assert.ok(a.count>10,'Expected real offscreen raster allocations');
a.handle.dispose();b.handle.dispose();assert.equal(a.frames.size,0);assert.equal(a.events.size,0);
const report={kind:'render-raster-mock-not-device',sourceSha:info.sourceSha,framework:info.framework,projectFilesSha256:info.projectFilesSha256,records,frames:a.handle.state.frames,offscreenAllocations:a.count,checks:['original renderer raster comparison','three distinct scene pixels','animated frames','hide/show','resize','listener cleanup'],devtools:'not-run',android:'not-run',ios:'not-run',releaseReady:false};
fs.writeFileSync(path.join(work,'render-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
