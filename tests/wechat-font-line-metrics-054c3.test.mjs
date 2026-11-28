import test from 'node:test';
import assert from 'node:assert/strict';
import {composeFontLineMetrics} from '../platforms/wechat/ui-layout/font-line-metrics.mjs';
test('normal line metrics use union of primary and fallback baseline extents',()=>{
 assert.deepEqual(composeFontLineMetrics({ascent:8,descent:3},[{ascent:10,descent:4},{ascent:9,descent:5}]),{ascent:10,descent:5,height:15,primaryHeight:11});
 assert.deepEqual(composeFontLineMetrics({ascent:8,descent:3}),{ascent:8,descent:3,height:11,primaryHeight:11});
});
test('explicit CSS line height overrides natural metrics even when smaller',()=>{
 assert.equal(composeFontLineMetrics({ascent:10,descent:4},[{ascent:12,descent:5}],12.5).height,12.5);
});
test('invalid or unavailable font extents fail closed',()=>{
 for(const m of [{ascent:NaN,descent:2},{ascent:-1,descent:3},{ascent:0,descent:0}])assert.throws(()=>composeFontLineMetrics(m),/Invalid font extents/);
 assert.throws(()=>composeFontLineMetrics({ascent:8,descent:3},[],0),/Invalid explicit/);
});
