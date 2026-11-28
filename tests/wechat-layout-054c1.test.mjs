import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCssLength} from '../platforms/wechat/ui-layout/css-length.mjs';
import {createLayoutSnapshot} from '../platforms/wechat/ui-layout/dom-layout.mjs';
const viewport={width:800,height:400};
const ctx={viewport,percentageBase:600,safeArea:{top:20,right:4,bottom:10,left:6}};
test('typed CSS arithmetic, nested functions and definite bases',()=>{
 for(const [css,want] of [['min(760px, 94%)',564],['calc(100% - 20px)',580],['calc(390px * 0.94 - 96px)',270.6],['clamp(24px, calc(720px * 0.048), 38px)',34.56],['max(8px, env(safe-area-inset-top))',20],['calc(10vw + 5dvh)',100],['calc((20px + 4px) / 2)',12],['clamp(40px, 10px, 30px)',40]]){
  assert.ok(Math.abs(evaluateCssLength(css,ctx)-want)<1e-9,css);
 }
});
test('unknown bases, invalid math and unsafe fallback fail closed',()=>{
 for(const css of ['calc(100% - 2px)','max(8px, env(safe-area-inset-top))','calc(2px * 3px)','calc(4px / 0)','calc(2px + 3)','calc(2px+3px)','calc(1em + 1px)','var(--missing)','clamp(1px, 2px)','calc(1px) junk'])
  assert.throws(()=>evaluateCssLength(css,{viewport}),undefined,css);
});
function mock(){
 const rows=new Map(),log=[];let i=0;
 return {log,reset(){rows.clear();},createNode(){rows.set(++i,{});return i;},append(){},setStyle(h,p,v){rows.get(h)[p]=v;log.push([p,v]);},calculate(){},rect(h){return {x:0,y:0,width:10,height:10};}};
}
const el=()=>({childNodes:[]});
test('root percentage expression and nested viewport expression resolve without guessing',()=>{
 const m=mock(),a=el(),b=el();
 createLayoutSnapshot(m,{element:a,style:{width:'calc(100% - 20px)',height:'min(50%, 300px)'},children:[{element:b,style:{width:'clamp(10px, 10vw, 100px)'}}]},viewport,{rootContainingWidth:600,rootContainingHeight:300});
 assert.deepEqual(m.log,[['width','580px'],['height','150px'],['width','80px']]);
 assert.throws(()=>createLayoutSnapshot(m,{element:a,children:[{element:b,style:{width:'calc(100% - 2px)'}}]},viewport),/Unresolved percentage/);
});
test('bounded nowrap leaf uses injected content metrics; mixed or invalid metrics rejected',()=>{
 const m=mock(),a={childNodes:[{nodeType:3,textContent:'  A   B  '}]};
 const n={element:a,style:{width:'max-content'},textStyle:{'white-space':'nowrap'}};
 createLayoutSnapshot(m,n,viewport,{measureTextLeaf({text}){assert.equal(text,'A B');return {width:42.5,height:20};}});
 assert.deepEqual(m.log,[['width','42.5px'],['height','20px']]);
 assert.throws(()=>createLayoutSnapshot(m,n,viewport),/Intrinsic text/);
 assert.throws(()=>createLayoutSnapshot(m,n,viewport,{measureTextLeaf:()=>({width:NaN,height:20})}),/Invalid text metrics/);
 assert.throws(()=>createLayoutSnapshot(m,{...n,children:[{element:el()}]},viewport,{measureTextLeaf:()=>({width:20,height:20})}),/unsupported text leaf/);
});
