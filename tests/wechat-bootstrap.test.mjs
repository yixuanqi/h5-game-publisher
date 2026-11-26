import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createLocalFetch,createStorageAdapter,createSurface,attachLifecycle}=createRequire(import.meta.url)('../platforms/wechat/bootstrap/runtime.cjs');
test('packaged JSON only, missing and corrupt fail',async()=>{
  const fetch=createLocalFetch({getFileSystemManager:()=>({readFileSync(p){if(p==='data/ok.json')return '{"ok":true}';if(p==='data/bad.json')return '{';throw Error('missing')}})});
  assert.deepEqual(await (await fetch('./data/ok.json')).json(),{ok:true});
  for(const p of ['https://host/data/ok.json','../data/ok.json','data/../ok.json','/data/ok.json','data//ok.json','data/ok.json?x=1','data/missing.json'])await assert.rejects(fetch(p));
  await assert.rejects((await fetch('data/bad.json')).json());
});
test('storage preserves empty and nonempty strings, isolates and removes, failure is false',()=>{
  const m=new Map([['unrelated','keep']]);const wx={getStorageSync:k=>m.get(k)??'',setStorageSync:(k,v)=>m.set(k,v),removeStorageSync:k=>m.delete(k)};
  const a=createStorageAdapter(wx);assert.equal(a.get('x'),null);assert.equal(a.set('x',''),true);assert.equal(a.get('x'),'');
  assert.equal(a.set('x','中文'),true);assert.equal(a.get('x'),'中文');assert.equal(a.remove('x'),true);assert.equal(a.get('x'),null);assert.equal(m.get('unrelated'),'keep');
  wx.setStorageSync=()=>{throw Error('quota')};assert.equal(a.set('x','y'),false);
});
test('surface respects DPR budget, resize, missing 2D is fatal',()=>{
  let w=800;const transforms=[];const canvas={getContext:()=>({setTransform:(...a)=>transforms.push(a)})};
  const wx={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:w,windowHeight:400,pixelRatio:3})};
  const s=createSurface(wx);assert.equal(canvas.width,1600);assert.equal(s.width,800);assert.deepEqual(transforms[0],[2,0,0,2,0,0]);
  w=900;s.resize();assert.equal(canvas.width,1800);
  assert.throws(()=>createSurface({...wx,createCanvas:()=>({getContext:()=>null})}),/2D/);
});
test('lifecycle registers and removes same callbacks',()=>{
  const calls=[];const fn=()=>{};const wx={onShow:f=>calls.push(['on',f]),offShow:f=>calls.push(['off',f])};
  const off=attachLifecycle(wx,{show:fn});off();assert.deepEqual(calls,[['on',fn],['off',fn]]);
  assert.throws(()=>attachLifecycle({}, {touch:fn}),/onTouchStart/);
});
