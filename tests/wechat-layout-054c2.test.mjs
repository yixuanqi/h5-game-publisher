import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutSnapshot} from '../platforms/wechat/ui-layout/dom-layout.mjs';
import {measureWordLines} from '../platforms/wechat/ui-layout/text-wrap.mjs';
const viewport={width:800,height:400};
const el=()=>({childNodes:[]});
function mock(){
 let seq=0;const log=[];
 return {log,reset(){},createNode(){return ++seq;},append(){},setStyle(h,p,v){log.push([h,p,v]);},calculate(){},rect(){return {x:0,y:0,width:10,height:10};}};
}
test('explicit normal block dimensions propagate independently across nested content boxes',()=>{
 const m=mock();
 createLayoutSnapshot(m,{element:el(),style:{width:'calc(100% - 40px)',height:'300px'},children:[
  {element:el(),style:{width:'min(50%, 300px)',height:'calc(100% - 40px)', 'padding-left':'10px'},children:[
   {element:el(),style:{width:'calc(100% - 20px)',height:'max(50%, 100px)'}}]}]},viewport);
 assert.deepEqual(m.log.filter(x=>['width','height'].includes(x[1])),[[1,'width','760px'],[1,'height','300px'],[2,'width','300px'],[2,'height','260px'],[3,'width','280px'],[3,'height','130px']]);
});
test('ambiguous flex, grid, constrained, border-box and auto containing blocks reject mixed percentages',()=>{
 for(const style of [{display:'flex'},{display:'grid',width:'200px'},{width:'200px','max-width':'150px'},{width:'200px','box-sizing':'border-box','padding-left':'1em'},{}]){
  assert.throws(()=>createLayoutSnapshot(mock(),{element:el(),style,children:[{element:el(),style:{width:'calc(100% - 10px)'}}]},viewport),/Unresolved percentage/);
 }
});
test('word wrap uses actual run advances, preserves overlong words and rejects unsupported text',()=>{
 const options={maxWidth:50,lineHeight:20,measureAdvance:s=>s.length*10};
 assert.deepEqual(measureWordLines('one  two three',options),{width:50,height:60,lines:['one','two','three']});
 assert.deepEqual(measureWordLines('toolong x',options),{width:70,height:40,lines:['toolong','x']});
 assert.throws(()=>measureWordLines('中文',options),/Unsupported/);
 assert.throws(()=>measureWordLines('hello',{...options,measureAdvance:()=>NaN}),/Invalid glyph/);
});
test('constrained leaf passes content width to measurement, and updates with new parent size',()=>{
 const a=el(),b={childNodes:[{nodeType:3,textContent:'one two three four'}]},m=mock();
 const n={element:a,style:{width:'120px'},children:[{element:b,style:{width:'calc(100% - 20px)'},textStyle:{'white-space':'normal'}}]};
 const seen=[];
 const measureTextLeaf=({text,maxWidth})=>{seen.push(maxWidth);return measureWordLines(text,{maxWidth,lineHeight:20,measureAdvance:s=>s.length*10});};
 createLayoutSnapshot(m,n,viewport,{measureTextLeaf});
 n.style.width='70px';createLayoutSnapshot(m,n,viewport,{measureTextLeaf});
 assert.deepEqual(seen,[100,50]);
 assert.deepEqual(m.log.filter(x=>x[1]==='height').map(x=>x[2]),['40px','80px']);
});

test('absolute inset root and column stretch propagate content width through border boxes',()=>{
 const m=mock();
 const tree={element:el(),style:{position:'absolute',top:'0',right:'0',bottom:'0',left:'0',display:'flex','flex-direction':'column','box-sizing':'border-box'},children:[
  {element:el(),style:{display:'flex','box-sizing':'border-box','padding-left':'clamp(14px, 3.2%, 32px)','padding-right':'clamp(14px, 3.2%, 32px)'},children:[
   {element:el(),style:{width:'min(760px, 94%)'}}]}]};
 createLayoutSnapshot(m,tree,viewport);
 assert.ok(m.log.some(x=>x[0]===1&&x[1]==='width'&&x[2]==='800px'));
 assert.ok(m.log.some(x=>x[0]===1&&x[1]==='height'&&x[2]==='400px'));
 assert.ok(m.log.some(x=>x[0]===2&&x[1]==='padding-left'&&x[2]==='25.6px'));
 assert.ok(m.log.some(x=>x[0]===3&&x[1]==='width'&&Math.abs(parseFloat(x[2])-703.872)<1e-8));
 assert.equal(tree.style.width,undefined);
});
test('explicit border box content size subtracts padding and borders',()=>{
 const m=mock();
 createLayoutSnapshot(m,{element:el(),style:{display:'flex',width:'200px','box-sizing':'border-box','padding-left':'10px','border-right-width':'2px'},children:[
  {element:el(),style:{width:'calc(50% - 4px)'}}]},viewport);
 assert.ok(m.log.some(x=>x[0]===2&&x[1]==='width'&&x[2]==='90px'));
});
test('do not propagate flex main-axis size or unknown cross-axis stretch',()=>{
 for(const rootStyle of [{display:'flex',width:'200px'},{display:'flex','flex-direction':'column','align-items':'center',width:'200px'},{display:'flex','flex-direction':'column','flex-wrap':'wrap',width:'200px'}]){
  const childStyle=rootStyle['flex-direction']?{}:{width:'100px'};
  assert.throws(()=>createLayoutSnapshot(mock(),{element:el(),style:rootStyle,children:[
   {element:el(),style:childStyle,children:[{element:el(),style:{width:'calc(50% - 4px)'}}]}]},viewport),/Unresolved percentage/);
 }
});
