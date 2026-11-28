import test from 'node:test';
import assert from 'node:assert/strict';
import {collectElementPaths,compareRectangles} from '../platforms/wechat/ui-layout/title-audit-utils.mjs';
const el=(...children)=>({nodeType:1,children});
test('structural paths cover every element including hidden descendants',()=>{
 const root=el(el(el()),el());
 assert.deepEqual(collectElementPaths(root).map(x=>x.path),['0','0/0','0/0/0','0/1']);
});
test('geometry gate rejects missing, extra, nonfinite or deviating rectangles',()=>{
 const r={x:0,y:0,width:10,height:20};
 assert.equal(compareRectangles({'0':r},{'0':{...r,x:.5}}).pass,true);
 assert.equal(compareRectangles({'0':r},{'0':{...r,x:.51}}).pass,false);
 assert.equal(compareRectangles({'0':r},{}).pass,false);
 assert.equal(compareRectangles({'0':r},{'0':r,'1':r}).pass,false);
 assert.throws(()=>compareRectangles({'0':r},{'0':{...r,x:NaN}}),/Invalid geometry/);
});
