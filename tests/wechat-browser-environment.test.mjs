import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserEnvironment} from '../platforms/wechat/runtime/browser-environment.mjs';

test('browser environment composes verified Mini Game bridges without mutating platform host globals',async()=>{
  let queued=null,cancelled=null,resizeCb=null,offCb=null,perfUs=2_000_000,wallMs=10000;
  const windowInfo={windowWidth:844,windowHeight:390,pixelRatio:2,screenWidth:844,screenHeight:390};
  const wx={
    getWindowInfo:()=>windowInfo,
    getSystemInfoSync:()=>({...windowInfo,platform:'android',system:'Android 14',language:'zh_CN',version:'8.0.50'}),
    getDeviceInfo:()=>({platform:'android',system:'Android 14'}),
    getAppBaseInfo:()=>({language:'zh_CN',version:'8.0.50'}),
    getPerformance:()=>({now:()=>perfUs}),
    onWindowResize:fn=>{resizeCb=fn;},
    offWindowResize:fn=>{offCb=fn;}
  };
  class Event{constructor(type){this.type=type;}}
  const win={document:{},Event,dispatchEvent:()=>true};
  const canvas={
    requestAnimationFrame(cb){queued=cb;return 11;},
    cancelAnimationFrame(id){cancelled=id;}
  };
  const host={platformOwned:true};
  const fetch=async()=>({ok:true});
  const values=new Map(),storage={get:k=>values.get(k)??null,set(k,v){values.set(k,v);return true;},remove(k){values.delete(k);return true;}};
  const env=createBrowserEnvironment({wx,window:win,canvas,host,fetch,storage,wallNow:()=>wallMs});

  assert.equal(env.window,win);assert.equal(env.document,win.document);
  assert.equal(win.navigator,env.navigator);assert.equal(win.performance,env.performance);assert.equal(win.fetch,fetch);assert.equal(win.localStorage,env.localStorage);assert.equal(win.location,env.location);
  assert.equal(win.innerWidth,844);assert.equal(win.innerHeight,390);assert.equal(win.devicePixelRatio,2);
  assert.match(env.navigator.userAgent,/Android Mobile/);assert.equal(env.navigator.maxTouchPoints,1);assert.equal(env.navigator.language,'zh-CN');
  env.localStorage.setItem('save','ok');assert.equal(env.localStorage.getItem('save'),'ok');assert.equal(env.location.protocol,'wechatgame:');
  assert.equal(env.performance.now(),0);
  wallMs+=100;perfUs+=100_000;
  assert.equal(env.performance.now(),100);assert.equal(env.performance.clockUnit,'us');

  let seen=null;
  perfUs+=4_500;wallMs+=4;
  assert.equal(env.requestAnimationFrame(t=>{seen=t;}),11);
  queued(999999);
  assert.equal(seen,104.5);
  env.cancelAnimationFrame(11);assert.equal(cancelled,11);

  assert.deepEqual(host,{platformOwned:true},'platform global host must not be polluted');
  assert.equal(typeof resizeCb,'function');
  env.dispose();assert.equal(offCb,resizeCb);
});

test('browser environment fails closed when required production adapters are missing',()=>{
  const wx={getWindowInfo:()=>({windowWidth:640,windowHeight:360,pixelRatio:1,screenWidth:640,screenHeight:360}),getSystemInfoSync:()=>({windowWidth:640,windowHeight:360,pixelRatio:1,screenWidth:640,screenHeight:360,platform:'devtools'}),getDeviceInfo:()=>({platform:'devtools'}),getPerformance:()=>({now:()=>0})};
  const window={document:{},Event:class{},dispatchEvent:()=>true};
  const canvas={requestAnimationFrame(){return 1;},cancelAnimationFrame(){}};
  const storage={get:()=>null,set:()=>true,remove:()=>true};
  assert.throws(()=>createBrowserEnvironment({wx,window,canvas}),/Packaged fetch/);
  assert.throws(()=>createBrowserEnvironment({wx,window,canvas,fetch:()=>{}}),/storage adapter/);
  assert.throws(()=>createBrowserEnvironment({wx,window:{},canvas,fetch:()=>{},storage}),/DOM window/);
  assert.throws(()=>createBrowserEnvironment({wx,window,canvas:{},fetch:()=>{},storage}),/Native frame scheduler/);
});
