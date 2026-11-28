import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStaticTitleGeometry,compareRectangles} from '../platforms/wechat/ui-layout/title-audit-utils.mjs';
import {typographyRequests} from '../platforms/wechat/ui-layout/isolated-font-provider.mjs';
function fixture(){
 const paths=Array.from({length:61},(_,i)=>String(i));
 return [[844,390],[640,360]].map(([width,height])=>{
  const oracle=paths.map(path=>({path,rect:{x:0,y:0,width:10,height:10}}));
  return {viewport:{width,height},nodeCount:61,oracle,inventory:paths.map(path=>({path})),issues:[],
   attempt:{status:'computed',actual:Object.fromEntries(oracle.map(x=>[x.path,{...x.rect}]))},
   textEvidence:{descriptorErrors:[],used:paths.slice(0,13),measured:paths.slice(0,13)}};
 });
}
test('gate checks both viewports and all 61 rectangles even if a reported flag claims success',()=>{
 const a=fixture();a[0].attempt.actual['0'].width+=0.5;assert.doesNotThrow(()=>assertStaticTitleGeometry(a));
 a[0].attempt.actual['0'].width+=0.001;a[0].attempt.pass=true;
 assert.throws(()=>assertStaticTitleGeometry(a),/exceeds 0.5px/);
});
test('missing nodes, duplicate viewports or missing text evidence fail closed',()=>{
 const a=fixture();delete a[0].attempt.actual['60'];assert.throws(()=>assertStaticTitleGeometry(a),/Incomplete/);
 const b=fixture();b[1].viewport=b[0].viewport;assert.throws(()=>assertStaticTitleGeometry(b),/Incomplete/);
 const c=fixture();c[0].textEvidence.used.pop();assert.throws(()=>assertStaticTitleGeometry(c),/Incomplete/);
});
test('metric input contains only typography, not source element identity or box geometry',()=>{
 const d={path:'0/1',text:'AV 中文',font:'400 11px serif',letterSpacing:.6,lineHeight:null,lang:'zh-CN',width:999,x:777};
 assert.deepEqual(typographyRequests([d]),[{text:d.text,font:d.font,letterSpacing:.6,lineHeight:null,lang:'zh-CN'}]);
 assert.throws(()=>typographyRequests([{...d,lang:'<html>'}]),/Invalid/);
});
test('max error reports subthreshold differences rather than rounding to zero',()=>{
 const a={'0':{x:0,y:0,width:10,height:10}},b={'0':{x:.25,y:0,width:10,height:10}};
 assert.deepEqual(compareRectangles(a,b),{pass:true,differences:[],maxDeltaPx:.25});
});
