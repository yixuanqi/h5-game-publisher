import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceBridge} from '../platforms/wechat/runtime/performance-bridge.mjs';
test('WeChat microsecond Performance.now is exposed as monotonic Web milliseconds only',()=>{
  const raw=[1_000_000,1_001_500,1_001_000,1_010_000];
  const p=createPerformanceBridge({getPerformance:()=>({now:()=>raw.shift()})});
  assert.equal(p.now(),1000);assert.equal(p.now(),1001.5);assert.equal(p.now(),1001.5);assert.equal(p.now(),1010);
  assert.equal('memory' in p,false);assert.equal(Object.isFrozen(p),true);
});
test('performance bridge fails closed on unsupported or invalid runtime',()=>{
  assert.throws(()=>createPerformanceBridge({}),/getPerformance/);
  assert.throws(()=>createPerformanceBridge({getPerformance:()=>({})}),/Performance\.now/);
  const p=createPerformanceBridge({getPerformance:()=>({now:()=>NaN})});assert.throws(()=>p.now(),/non-finite/);
});
