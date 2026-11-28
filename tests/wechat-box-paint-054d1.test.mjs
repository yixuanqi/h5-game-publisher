import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBoxPaintList,replayBoxPaint} from '../platforms/wechat/ui-paint/box-paint.mjs';
const el=()=>({localName:'div',childNodes:[]});
const rect={x:0,y:0,width:100,height:50};
const snap={rect:()=>rect};
test('paint commands preserve parent fill, clip scope and child order',()=>{
 const tree={element:el(),paintStyle:{background:'#123','border-radius':'40px','overflow-x':'hidden','overflow-y':'hidden'},children:[{element:el(),paintStyle:{'background-color':'rgba(0, 0, 0, 0.5)'}},{element:el(),style:{display:'none'},paintStyle:{background:'unsupported'}}]};
 const list=buildBoxPaintList(tree,snap);
 assert.deepEqual(list.commands.map(c=>c.op),['fill','pushClip','fill','popClip']);
 assert.equal(list.commands[0].radius,25);
 assert.equal(list.commands[2].color,'rgba(0, 0, 0, 0.5)');
});
test('unknown effects, text and unsupported stacking cannot produce a successful plan',()=>{
 for(const n of [{paintStyle:{background:'linear-gradient(red,blue)'}},{paintStyle:{opacity:'0.5'}},{paintStyle:{'box-shadow':'1px 1px black'}},{style:{position:'absolute'}},{paintStyle:{'overflow-x':'hidden'}},{element:{localName:'div',childNodes:[{nodeType:3,textContent:'hi'}]}}])
  assert.throws(()=>buildBoxPaintList({element:el(),...n},snap),/Unsupported/);
});
test('replay balances saved canvas state on success and failure',()=>{
 let depth=0;const calls=[];
 const ctx={save(){depth++;},restore(){depth--;},beginPath(){},rect(){},clip(){calls.push('clip');},fill(){calls.push('fill');}};
 const list={schema:1,commands:[{op:'pushClip',rect,radius:0},{op:'fill',rect,radius:0,color:'#abc'},{op:'popClip'}]};
 replayBoxPaint(ctx,list);assert.equal(depth,0);assert.deepEqual(calls,['clip','fill']);
 assert.throws(()=>replayBoxPaint(ctx,{schema:1,commands:[list.commands[0],{op:'unknown'}]}),/Unsupported/);assert.equal(depth,0);
 assert.throws(()=>replayBoxPaint(ctx,{schema:1,commands:[list.commands[0]]}),/Unbalanced/);assert.equal(depth,0);
});
