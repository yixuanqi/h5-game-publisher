import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {createTouch}=createRequire(import.meta.url)('../platforms/wechat/play/touch.cjs');
test('multi-finger ownership, release, duplicate and cancel',()=>{
  const edges=[],t=createTouch((a,v)=>edges.push([a,v]),()=>edges.push('clear'));
  assert.ok(t.start(1,'right'));assert.ok(t.start(2,'right'));assert.ok(!t.start(2,'jump'));assert.ok(t.start(3,'jump'));
  t.end(1);assert.equal(edges.length,2);t.end(2);assert.deepEqual(edges.at(-1),['right',false]);
  t.reset();assert.deepEqual(edges.slice(-2),[['jump',false],'clear']);assert.equal(t.count,0);assert.ok(!t.end(3));
});
