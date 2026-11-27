import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceBridge} from '../platforms/wechat/runtime/performance-bridge.mjs';
for(const [unit,factor] of [['ms',1],['us',1000]]){
 test('measured '+unit+' clock exposes continuous monotonic Web milliseconds',()=>{
  let wall=10_000,raw=2_000_000;
  const p=createPerformanceBridge({getPerformance:()=>({now:()=>raw})},{wallNow:()=>wall});
  assert.equal(p.now(),0);assert.equal(p.clockUnit,'calibrating');
  wall+=16;raw+=16*factor;assert.equal(p.now(),16);
  wall+=100;raw+=100*factor;assert.equal(p.now(),116);assert.equal(p.clockUnit,unit);
  wall+=17;raw+=17.25*factor;assert.equal(p.now(),133.25);
  raw-=2*factor;assert.equal(p.now(),133.25);
  raw+=1000*factor;wall+=1000;assert.equal(p.now(),1131.25);
  assert.equal('memory' in p,false);assert.equal(Object.isFrozen(p),true);
 });
}
test('observed DevTools sample and ambiguous clocks do not slow startup',()=>{
 let wall=0,raw=0;
 const p=createPerformanceBridge({getPerformance:()=>({now:()=>raw})},{wallNow:()=>wall});
 assert.equal(p.now(),0);
 wall=1017;raw=1016.6;assert.equal(p.now(),1017);assert.equal(p.clockUnit,'ms');
 wall+=1000;raw+=1000;assert.equal(p.now(),2017);
 let w=0,r=0;const q=createPerformanceBridge({getPerformance:()=>({now:()=>r})},{wallNow:()=>w});
 q.now();w=1000;r=10000;assert.equal(q.now(),1000);assert.equal(q.clockUnit,'calibrating');
 w=1100;r=10100;assert.equal(q.now(),1100);assert.equal(q.clockUnit,'ms');
});
test('performance bridge fails closed on unsupported or invalid runtime',()=>{
 assert.throws(()=>createPerformanceBridge({}),/getPerformance/);
 assert.throws(()=>createPerformanceBridge({getPerformance:()=>({})}),/Performance\.now/);
 const p=createPerformanceBridge({getPerformance:()=>({now:()=>NaN})});assert.throws(()=>p.now(),/non-finite/);
});
