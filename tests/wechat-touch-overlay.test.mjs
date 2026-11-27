import test from 'node:test';
import assert from 'node:assert/strict';
import {controlRects,createTouchRouter} from '../platforms/wechat/canvas-diagnostic/touch-overlay.mjs';
test('landscape control regions fit, do not overlap, and retain logical coordinates across sizes',()=>{
 for(const [w,h] of [[844,390],[667,375],[320,180]]){
  const a=controlRects(w,h);
  for(const r of a){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=w&&r.y+r.h<=h);for(const q of a.filter(v=>v!==r))assert.ok(r.x+r.w<=q.x||q.x+q.w<=r.x||r.y+r.h<=q.y||q.y+q.h<=r.y);}
 }
});
test('native touch ids retain original target; simultaneous touches, duplicate starts, cancel and release',()=>{
 const regions=controlRects(844,390),calls=[];let resets=0;
 const router=createTouchRouter({regions:()=>regions,emit:(...a)=>calls.push(a),reset:()=>resets++});
 const [joy,jump]=regions;
 const touch=(id,r)=>({identifier:id,clientX:r.x+r.w/2,clientY:r.y+r.h/2});
 const a=touch(1,joy),b=touch(2,jump);
 router.route('touchstart',{changedTouches:[a,b]});assert.equal(router.stats.active,2);
 router.route('touchstart',{changedTouches:[a,touch(3,joy)]});assert.equal(router.stats.active,2);
 router.route('touchmove',{changedTouches:[{...a,clientX:b.clientX,clientY:b.clientY}]});
 assert.equal(calls.at(-1)[0],joy.id);
 router.route('touchend',{changedTouches:[b]});assert.equal(router.isPressed(jump.id),false);assert.equal(router.isPressed(joy.id),true);
 router.route('touchcancel',{changedTouches:[]});assert.equal(router.stats.active,0);assert.equal(resets,1);
 router.releaseAll();assert.equal(resets,1);
});
