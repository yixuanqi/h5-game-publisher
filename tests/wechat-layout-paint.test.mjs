import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutTextColumn,hitColumn,linearBackground} from '../platforms/wechat/layout/paint-column.mjs';
const env={width:800,height:400};
test('independent single-line column geometry, gap and hit testing',()=>{
  const ctx={measureText:()=>({width:8,fontBoundingBoxAscent:12,fontBoundingBoxDescent:4})};
  const style={width:'100%','box-sizing':'border-box','font-size':'14px','text-align':'left','padding-top':'8px','padding-bottom':'8px','border-bottom-width':'1px','min-height':'36px'};
  const r=layoutTextColumn(ctx,200,{'row-gap':'4px'},[{key:'a',text:'A',style},{key:'b',text:'B',style,disabled:true},{key:'c',text:'C',style} ],env);
  assert.equal(r.height,116);assert.equal(r.rows[2].y,80);assert.equal(hitColumn(r,100,20),'a');
  assert.equal(hitColumn(r,100,37),null);assert.equal(hitColumn(r,100,50),null);assert.equal(hitColumn(r,100,90),'c');
  assert.throws(()=>layoutTextColumn(ctx,200,{},[{key:'bad',text:'x',style:{...style,width:'auto'}}],env),/Unsupported/);
});
test('source gradient stops parsed; unknown direction rejected',()=>{
  const stops=[],ctx={createLinearGradient:(...a)=>{assert.deepEqual(a,[0,0,100,0]);return {addColorStop:(...s)=>stops.push(s)};}};
  linearBackground(ctx,'linear-gradient(90deg, rgba(1, 2, 3, .5) 0%, transparent 92%)',100,30);
  assert.deepEqual(stops,[[0,'rgba(1, 2, 3, .5)'],[.92,'transparent']]);
  assert.throws(()=>linearBackground(ctx,'linear-gradient(45deg, red 0%, blue 100%)',100,30),/Unsupported/);
});

test('CJK fallback uses actual selected font metrics and cumulative vertical geometry',()=>{
  const ctx={font:'',measureText(s){const cjk=this.font.includes('CJK');return {width:[...s].length*(cjk?16:8),fontBoundingBoxAscent:cjk?18.4:12,fontBoundingBoxDescent:cjk?4.6:4};}};
  const style={width:'100%','box-sizing':'border-box','font-size':'16px','font-family':'serif','text-align':'left','padding-top':'10px','padding-bottom':'10px','border-bottom-width':'1px'};
  const input=[{key:'a',text:'A 中文',style},{key:'b',text:'字',style}];
  const resolver=({script,family})=>script==='han'?'"CJK"':family;
  const red=layoutTextColumn(ctx,200,{'row-gap':'6px'},input,env);
  const green=layoutTextColumn(ctx,200,{'row-gap':'6px'},input,env,{resolveFamily:resolver});
  assert.equal(red.rows[0].height,37);
  assert.equal(green.rows[0].height,44);assert.equal(green.rows[1].y,50);assert.equal(green.height,94);
  assert.deepEqual(green.rows[0].runs.map(r=>r.text),['A ','中文']);
  assert.equal(green.rows[0].metrics.textWidth,48);
});
