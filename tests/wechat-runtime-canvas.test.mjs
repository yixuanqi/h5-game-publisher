import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameScheduler} from '../platforms/wechat/runtime/frame-scheduler.mjs';
import {installCanvasBridge} from '../platforms/wechat/runtime/canvas-bridge.mjs';
import {createNavigatorBridge} from '../platforms/wechat/runtime/navigator-bridge.mjs';
import {createPerformanceBridge} from '../platforms/wechat/runtime/performance-bridge.mjs';
function dom(){
  function element(localName){
    const attrs=new Map();return {localName,getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,String(v)),removeAttribute:k=>attrs.delete(k)};
  }
  const screen=element('canvas');return {screen,querySelectorAll:()=>[screen],createElement:element};
}
function backend(w,h){
  const calls=[],ctx={fillStyle:'black',createRadialGradient(...args){calls.push(['gradient',...args]);return {};},drawImage(...args){calls.push(['draw',...args]);},createPattern(...args){calls.push(['pattern',...args]);return {};},calls};
  return {width:w,height:h,getContext(){return ctx;}};
}
test('Red null/missing DOM context then Green real backend bridge; same node/context and resize',()=>{
  const d=dom();assert.equal(d.screen.getContext,undefined);
  const b=installCanvasBridge(d,backend),s=d.screen,c=s.getContext('2d');
  assert.equal(c.canvas,s);assert.equal(s.getContext('2d'),c);assert.equal(s.getContext('webgl'),null);
  assert.equal(s.width,300);s.width=64;s.setAttribute('height','32');
  assert.equal(b.getSurface(s).width,64);assert.equal(b.getSurface(s).height,32);assert.equal(s.getContext('2d'),c);
  c.fillStyle='red';assert.equal(b.getSurface(s).getContext().fillStyle,'red');
  assert.throws(()=>{s.width=0;},RangeError);
});
test('offscreen sources are independent and unwrapped for drawImage/pattern',()=>{
  const d=dom(),b=installCanvasBridge(d,backend),s=d.screen,c=s.getContext('2d'),a=d.createElement('canvas');
  a.width=16;a.height=16;a.getContext('2d').createRadialGradient(0,0,0,0,0,1);
  c.drawImage(a,1,2);c.createPattern(a,'repeat');
  assert.deepEqual(c.calls,[['draw',b.getSurface(a),1,2],['pattern',b.getSurface(a),'repeat']]);
  assert.notEqual(b.getSurface(a),b.getSurface(s));assert.equal(b.stats.radialGradients,1);
  assert.equal(d.createElement('div').getContext,undefined);
});
test('reject missing native context or aliased native surface',()=>{
  const d=dom(),s=backend(300,150);installCanvasBridge(d,()=>s);
  d.screen.getContext('2d');assert.throws(()=>d.createElement('canvas').getContext('2d'),/Independent/);
  const e=dom();installCanvasBridge(e,()=>({getContext:()=>null}));assert.throws(()=>e.screen.getContext('2d'),/unavailable/);
});

test('Mini Game navigator exposes only truthful passive environment fields',()=>{
  const ios=createNavigatorBridge({platform:'ios',system:'iOS 18.0',language:'zh_CN',wechatVersion:'8.0.50'});
  assert.match(ios.userAgent,/iPhone/);assert.match(ios.userAgent,/MicroMessenger/);assert.equal(ios.platform,'iPhone');assert.equal(ios.maxTouchPoints,1);assert.equal(ios.language,'zh-CN');
  assert.equal(ios.standalone,false);assert.equal(ios.onLine,true);
  for(const key of ['serviceWorker','clipboard','getGamepads','vibrate'])assert.equal(key in ios,false,key+' must stay absent until mapped');
  const android=createNavigatorBridge({platform:'android',system:'Android 15'});
  assert.match(android.userAgent,/Android Mobile/);assert.equal(android.maxTouchPoints,1);
});

test('performance bridge keeps browser millisecond units and omits Chromium memory',()=>{
  let wall=10000,raw=2_000_000;
  const p=createPerformanceBridge({getPerformance:()=>({now:()=>raw})},{wallNow:()=>wall});
  const origin=p.now();assert.equal(origin,0);
  wall+=100;raw+=100_000;assert.equal(p.now()-origin,100);assert.equal(p.clockUnit,'us');
  raw+=4_250;wall+=4;assert.equal(p.now()-origin,104.25);assert.equal('memory' in p,false);
});

test('frame scheduler uses native queue but supplies normalized Web clock timestamp',()=>{
  let queued=null,cancelled=null;
  const host={requestAnimationFrame(cb){queued=cb;return 7;},cancelAnimationFrame(id){cancelled=id;}};
  const clock={now:()=>123.5},f=createFrameScheduler(null,clock,host);let seen=null;
  assert.equal(f.requestAnimationFrame(t=>{seen=t;}),7);queued(999999);assert.equal(seen,123.5);
  f.cancelAnimationFrame(7);assert.equal(cancelled,7);
  assert.throws(()=>createFrameScheduler(null,clock,{}),/Native frame scheduler/);
});
