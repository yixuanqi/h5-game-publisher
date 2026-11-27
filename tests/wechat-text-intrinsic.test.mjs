import test from 'node:test';
import assert from 'node:assert/strict';
import {measureTextLeaf,boxEdges} from '../platforms/wechat/runtime/text-intrinsic.mjs';
const ctx={font:'',measureText:s=>({width:s.length*10,fontBoundingBoxAscent:8,fontBoundingBoxDescent:2})},env={width:200,height:100};
test('intrinsic text measurement owns only leaf size, not flex position',()=>{
  const node={key:'x',text:'AB',children:[],style:{'font-size':'10px','letter-spacing':'1px','padding-left':'4px','padding-right':'6px','padding-top':'2px','padding-bottom':'3px','min-height':'20px'}};
  const m=measureTextLeaf(ctx,node,200,env);
  assert.equal(m.width,32);assert.equal(m.height,20);assert.equal(m.textX,4);assert.equal(m.metrics.textWidth,22);
  assert.equal('x' in m,false);assert.equal('y' in m,false);
  assert.deepEqual(boxEdges(node.style,200,env),{left:4,right:6,top:2,bottom:3});
});
test('intrinsic text measurement rejects container geometry and explicit widths',()=>{
  assert.throws(()=>measureTextLeaf(ctx,{key:'c',text:'',children:[{}],style:{}},200,env),/leaf node/);
  assert.throws(()=>measureTextLeaf(ctx,{key:'w',text:'A',children:[],style:{'font-size':'10px',width:'40px'}},200,env),/Explicit leaf width/);
});
