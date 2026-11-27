import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFractionGridTemplate} from '../platforms/wechat/runtime/float-pigment-source-style.mjs';

test('authored Ashen save-slot Grid maps to upstream fractional tracks without computing geometry',()=>{
  assert.deepEqual(mapFractionGridTemplate('repeat(3, minmax(0, 1fr))'),[
    {unit:'fr',value:1},{unit:'fr',value:1},{unit:'fr',value:1}
  ]);
  assert.deepEqual(mapFractionGridTemplate('1fr'),[{unit:'fr',value:1}]);
  assert.throws(()=>mapFractionGridTemplate('minmax(220px, 1fr)'),/non-zero minmax/);
});
