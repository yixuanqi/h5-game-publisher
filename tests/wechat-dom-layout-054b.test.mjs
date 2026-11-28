import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutSnapshot} from '../platforms/wechat/ui-layout/dom-layout.mjs';
function mock(){
 const records=new Map();let seq=0;const log=[];
 return {log,reset(){records.clear();log.push(['reset']);},createNode(){records.set(++seq,{});return seq;},append(p,c){records.get(c).parent=p;},setStyle(h,k,v){records.get(h)[k]=v;log.push([k,v]);},calculate(){},rect(h){return records.get(h).parent?{x:3,y:4,width:10,height:20}:{x:5,y:6,width:100,height:100};}};
}
const el=()=>({childNodes:[]});
test('root-relative geometry, zero length and definite containing width',()=>{
 const a=el(),b=el(),m=mock();
 const s=createLayoutSnapshot(m,{element:a,style:{display:'grid',width:'min(760px, 94%)'},children:[{element:b,style:{'min-width':'0'}}]},{width:800,height:390});
 assert.deepEqual(s.rect(b),{x:8,y:10,width:10,height:20});
 assert.ok(m.log.some(x=>x[0]==='width'&&x[1]==='752px'));
 assert.ok(m.log.some(x=>x[0]==='min-width'&&x[1]==='0px'));
 assert.deepEqual(m.log.at(-1),['reset']);
});
test('hidden subtree never sends unsupported descendant styles to backend',()=>{
 const a=el(),b=el(),c=el(),m=mock();
 const s=createLayoutSnapshot(m,{element:a,style:{display:'block'},children:[{element:b,style:{display:'none'},children:[{element:c,style:{order:'2'}}]}]},{width:800,height:390});
 assert.equal(s.nodeCount,3);assert.deepEqual(s.rect(c),{x:0,y:0,width:0,height:0});
});
test('unsupported style, direct text, and unresolved expression fail closed and reset',()=>{
 for(const [style,element] of [[{order:'2.5'},el()],[{width:'calc(100% - 1px)'},el()],[{}, {childNodes:[{nodeType:3,textContent:'text'}]}]]){
 const m=mock();assert.throws(()=>createLayoutSnapshot(m,{element,style},{width:800,height:390}));assert.deepEqual(m.log.at(-1),['reset']);
 }
});
test('repeated element and invalid viewport are rejected',()=>{
 const a=el(),m=mock();assert.throws(()=>createLayoutSnapshot(m,{element:a,children:[{element:a}]},{width:800,height:390}),/Invalid/);
 assert.throws(()=>createLayoutSnapshot(m,{element:a},{width:NaN,height:390}),/viewport/);
});

test('flex and grid order uses stable insertion without changing DOM identity',()=>{
 for(const display of ['flex','grid']){
  const root=el(),a=el(),b=el(),c=el(),d=el(),m=mock();
  const kids=[{element:a,style:{order:'2',width:'11px'}},{element:b,style:{order:'-1',width:'22px'}},{element:c,style:{order:'2',width:'33px'}},{element:d,style:{width:'44px'}}];
  const s=createLayoutSnapshot(m,{element:root,style:{display},children:kids},{width:800,height:390});
  assert.deepEqual(m.log.filter(x=>x[0]==='width').map(x=>x[1]),['22px','44px','11px','33px']);
  assert.deepEqual(kids.map(x=>x.element),[a,b,c,d]);
  assert.equal(s.nodeCount,5);for(const child of kids)assert.equal(s.rect(child.element).width,10);
 }
});
test('block flow ignores valid CSS order',()=>{
 const a=el(),b=el(),c=el(),m=mock();
 createLayoutSnapshot(m,{element:a,style:{display:'block'},children:[{element:b,style:{order:'2',width:'11px'}},{element:c,style:{order:'-1',width:'22px'}}]},{width:800,height:390});
 assert.deepEqual(m.log.filter(x=>x[0]==='width').map(x=>x[1]),['11px','22px']);
});
