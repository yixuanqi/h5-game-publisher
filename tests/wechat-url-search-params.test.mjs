import test from 'node:test';
import assert from 'node:assert/strict';
import {createURLSearchParamsCtor} from '../platforms/wechat/runtime/url-search-params.mjs';

test('URLSearchParams fallback covers frozen preview query reads without depending on platform globals',()=>{
  const Params=createURLSearchParamsCtor(undefined),p=new Params('?preview=1&room=hall+one&room=hall%202');
  assert.equal(p.get('preview'),'1');assert.equal(p.has('room'),true);assert.deepEqual(p.getAll('room'),['hall one','hall 2']);assert.equal(p.get('missing'),null);
  assert.match(p.toString(),/preview=1/);
});
test('native URLSearchParams constructor is reused when available',()=>{
  class Native{}
  assert.equal(createURLSearchParamsCtor(Native),Native);
});
