import test from 'node:test';
import assert from 'node:assert/strict';
import {fontRuns,measureRuns,drawRuns,measureFontRun} from '../platforms/wechat/layout/font-runs.mjs';
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

test('whole-run measurement preserves Latin kerning and spacing',()=>{
  const m={font:'',measureText(text){return {width:text==='AV'?17:[...text].length*10,fontBoundingBoxAscent:8,fontBoundingBoxDescent:2};}};
  const runs=fontRuns('AV',{'font-family':'serif'},10);
  assert.equal(measureRuns(m,runs,2).textWidth,21);
  const calls=[];m.fillText=(...args)=>calls.push(args);
  drawRuns(m,runs,0,10,2);
  assert.deepEqual(calls,[['A',0,10],['V',9,10]]);
});

test('fractional font size preserves subpixel advance instead of rounding every glyph',()=>{
  const m={font:'',measureText(text){const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)[1]);return {width:Math.round(size)*[...text].length,fontBoundingBoxAscent:size,fontBoundingBoxDescent:size/4};}};
  const run={font:'400 11.5px serif',text:'中文'};
  assert.equal(measureFontRun(m,run).width,23);
  assert.equal(m.font,run.font);
  assert.equal(measureRuns(m,[run],1.2).textWidth,25.4);
});
