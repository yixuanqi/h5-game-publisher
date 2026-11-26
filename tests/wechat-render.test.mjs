import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createFrameClock}=createRequire(import.meta.url)('../platforms/wechat/render/clock.cjs');
function harness(){
  let id=0;const callbacks=new Map(),canceled=[],dt=[],errors=[];
  const clock=createFrameClock(cb=>{callbacks.set(++id,cb);return id},i=>{canceled.push(i);callbacks.delete(i)},d=>dt.push(d),e=>errors.push(e));
  function tick(ts){const [i,cb]=callbacks.entries().next().value;callbacks.delete(i);cb(ts);}
  return {clock,callbacks,canceled,dt,errors,tick};
}
test('single loop, clamps dt, pause cancels and resume resets time',()=>{
  const h=harness();h.clock.start();h.clock.start();assert.equal(h.callbacks.size,1);
  h.tick(100);h.tick(120);h.tick(1000);assert.deepEqual(h.dt,[1/60,.02,.033]);
  const stale=[...h.callbacks.values()][0];h.clock.stop();assert.equal(h.callbacks.size,0);
  h.clock.start();stale(9000);assert.equal(h.dt.length,3);assert.equal(h.callbacks.size,1);
  h.tick(10000);assert.equal(h.dt.at(-1),1/60);h.clock.stop();
});
test('invalid timestamp stops and reports instead of swallowing',()=>{
  const h=harness();h.clock.start();h.tick(NaN);
  assert.equal(h.clock.active,false);assert.equal(h.errors.length,1);assert.equal(h.callbacks.size,0);
});
