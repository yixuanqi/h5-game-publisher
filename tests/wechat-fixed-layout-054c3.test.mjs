import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutSnapshot} from '../platforms/wechat/ui-layout/dom-layout.mjs';
const el=()=>({childNodes:[]});
const viewport={width:800,height:400};
function mock(){
 let seq=0,fresh=null;const nodes=new Map(),log=[];
 return {log,reset(){nodes.clear();fresh=null;log.push(['reset']);},createNode(){nodes.set(++seq,{});return seq;},
 append(p,c){nodes.get(c).parent=p;log.push(['append',p,c]);},
 setStyle(h,p,v){nodes.get(h)[p]=v;log.push([h,p,v]);},
 calculate(h,env){fresh=h;log.push(['compute',h,env]);},
 rect(h){let root=h;while(nodes.get(root).parent)root=nodes.get(root).parent;assert.equal(root,fresh,'stale rect');return {x:3,y:4,width:10,height:20};}};
}
const fixed={position:'fixed',top:'0',right:'0',bottom:'0',left:'0'};
test('fixed subtree uses viewport group, never offsets by original parent',()=>{
 const root=el(),overlay=el(),child=el(),m=mock();
 const snap=createLayoutSnapshot(m,{element:root,style:{width:'200px'},children:[{element:overlay,style:fixed,children:[{element:child}]}]},viewport,{rootContainingWidth:300,rootContainingHeight:200});
 assert.equal(snap.nodeCount,3);
 assert.deepEqual(snap.rect(overlay),{x:3,y:4,width:10,height:20});
 assert.deepEqual(snap.rect(child),{x:6,y:8,width:10,height:20});
 assert.deepEqual(m.log.filter(x=>x[0]==='compute'),[['compute',1,{width:300,height:200}],['compute',2,viewport]]);
 assert.ok(m.log.some(x=>x[1]==='position'&&x[2]==='absolute'));
});
test('root fixed and nested fixed expressions resolve against viewport',()=>{
 const m=mock(),a=el(),b=el();
 const snap=createLayoutSnapshot(m,{element:a,style:{...fixed,width:'calc(50% - 10px)'},children:[{element:b,style:{...fixed,left:'calc(25% + 2px)'}}]},viewport,{rootContainingWidth:300});
 assert.equal(snap.nodeCount,2);
 assert.ok(m.log.some(x=>x[1]==='width'&&x[2]==='390px'));
 assert.ok(m.log.some(x=>x[1]==='left'&&x[2]==='202px'));
 assert.equal(m.log.filter(x=>x[0]==='compute').length,2);
});
test('unsupported static position, auto sizing and changed containing blocks fail closed',()=>{
 for(const tree of [
  {element:el(),style:{position:'fixed',width:'10px',height:'10px'}},
  {element:el(),style:{position:'fixed',top:'0',left:'0'}},
  {element:el(),style:{...fixed,'margin-left':'auto'}},
  {element:el(),establishesFixedContainingBlock:true,children:[{element:el(),style:fixed}]},
  {element:el(),fixedAncestorOutsideTree:true,style:fixed}
 ]){
  const m=mock();assert.throws(()=>createLayoutSnapshot(m,tree,viewport),/Unsupported fixed/);assert.deepEqual(m.log.at(-1),['reset']);
 }
});
test('hidden fixed descendants neither allocate nor compute a group',()=>{
 const m=mock(),a=el(),b=el();
 const snap=createLayoutSnapshot(m,{element:a,style:{display:'none'},children:[{element:b,style:fixed}]},viewport);
 assert.deepEqual(snap.rect(b),{x:0,y:0,width:0,height:0});assert.equal(m.log.filter(x=>x[0]==='compute').length,0);
});
