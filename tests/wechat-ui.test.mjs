import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {viewport,hit}=createRequire(import.meta.url)('../platforms/wechat/ui/ui.cjs');
test('letterboxed coordinates retain uniform scale and centered layout',()=>{
  assert.deepEqual(viewport(844,390),{s:1,x:0,y:0});
  assert.deepEqual(viewport(1688,780),{s:2,x:0,y:0});
  assert.deepEqual(viewport(944,390),{s:1,x:50,y:0});
  assert.throws(()=>viewport(0,390));
});
test('touch hitbox boundaries cannot activate adjacent targets',()=>{
  const r={x:10,y:20,w:30,h:40};assert.ok(hit(r,10,20));assert.ok(!hit(r,40,59));assert.ok(!hit(r,39,60));
});
