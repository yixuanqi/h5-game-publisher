import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFractionGridTemplate,mapFlexParent} from '../platforms/wechat/runtime/float-pigment-source-style.mjs';

test('authored Ashen save-slot Grid maps to upstream fractional tracks without computing geometry',()=>{
  assert.deepEqual(mapFractionGridTemplate('repeat(3, minmax(0, 1fr))'),[
    {unit:'fr',value:1},{unit:'fr',value:1},{unit:'fr',value:1}
  ]);
  assert.deepEqual(mapFractionGridTemplate('1fr'),[{unit:'fr',value:1}]);
  assert.throws(()=>mapFractionGridTemplate('minmax(220px, 1fr)'),/non-zero minmax/);
});


test('float-pigment flex parent mapping carries authored alignment without solving geometry',()=>{
  assert.deepEqual(mapFlexParent({display:'flex','justify-content':'space-between','align-items':'center'}),{
    display:'flex',direction:'row',justify:'space-between',align:'center'
  });
  assert.deepEqual(mapFlexParent({display:'flex','flex-direction':'column'}),{
    display:'flex',direction:'column',justify:'normal',align:'stretch'
  });
  assert.throws(()=>mapFlexParent({display:'grid'}),/display:flex/);
  assert.throws(()=>mapFlexParent({display:'flex','flex-wrap':'wrap'}),/wrapping/);
});
