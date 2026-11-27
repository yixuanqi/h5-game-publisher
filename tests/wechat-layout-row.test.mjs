import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutRow,flattenRow} from '../platforms/wechat/layout/paint-row.mjs';
const ctx={measureText:s=>({width:s.length*10,fontBoundingBoxAscent:8,fontBoundingBoxDescent:2})},env={width:200,height:100};
const leaf=(key,text,extra={})=>({key,text,children:[],style:{'font-size':'10px','letter-spacing':'0',...extra}});
test('nested row intrinsic sizes, center alignment and space-between',()=>{
  const tree={key:'root',style:{display:'flex','justify-content':'space-between','align-items':'center','padding-left':'10px','padding-right':'10px','padding-top':'4px'},children:[leaf('brand','AB'),{key:'group',style:{display:'flex','column-gap':'5px','align-items':'center'},children:[leaf('a','A',{'padding-top':'2px','padding-bottom':'2px'}),leaf('b','B')]}]};
  const r=layoutRow(ctx,tree,200,env);
  assert.equal(r.height,18);
  const v=Object.fromEntries(flattenRow(r).map(n=>[n.key,n]));
  assert.equal(v.brand.x,10);assert.equal(v.brand.y,6);
  assert.equal(v.group.x,165);assert.equal(v.a.x,165);assert.equal(v.b.x,180);assert.equal(v.b.y,6);
  assert.throws(()=>layoutRow(ctx,tree,30,env),/shrink\/wrap/);
});
