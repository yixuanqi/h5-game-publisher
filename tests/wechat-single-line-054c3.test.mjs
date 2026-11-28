import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutSnapshot} from '../platforms/wechat/ui-layout/dom-layout.mjs';
import {textDescriptor} from '../platforms/wechat/ui-layout/text-metrics.mjs';
const viewport={width:800,height:400};
const el=()=>({childNodes:[]});
const label=()=>({localName:'button',id:'label',childNodes:[{nodeType:3,textContent:'灰钟残誓'}]});
function mock(width=80){let i=0;const log=[];return {log,reset(){},createNode(){return ++i;},append(){},setStyle(h,p,v){log.push([h,p,v]);},calculate(){},rect(h){return {x:0,y:0,width:h===1?300:width,height:24};}};}
test('authored font descriptor supports CJK, nested sizes and spacing',()=>{
 assert.deepEqual(textDescriptor('灰钟残誓',{ 'font-family':'serif','font-size':'clamp(24px, 4vw, 40px)','font-weight':'700','line-height':'1.25','letter-spacing':'2px'},viewport),{text:'灰钟残誓',font:'700 32px serif',letterSpacing:2,lineHeight:40});
 assert.throws(()=>textDescriptor('x',{'font-size':'1em'},viewport),/Unsupported CSS unit/);
});
test('auto flex leaf preserves CJK metrics and border box edges',()=>{
 const root=el(),a=label(),m=mock();
 createLayoutSnapshot(m,{element:root,style:{display:'flex'},children:[{element:a,style:{'box-sizing':'border-box','padding-left':'4px','padding-right':'4px','border-bottom-width':'1px'},textStyle:{'white-space':'nowrap'}}]},viewport,{measureSingleLine:({text})=>{assert.equal(text,'灰钟残誓');return {width:60,height:20};}});
 assert.ok(m.log.some(x=>x[0]===2&&x[1]==='width'&&x[2]==='68px'));
 assert.ok(m.log.some(x=>x[0]===2&&x[1]==='height'&&x[2]==='21px'));
});
test('normal line overflow fails closed; explicit width is not replaced',()=>{
 const n={element:el(),style:{display:'flex'},children:[{element:label(),style:{width:'50px'},textStyle:{'white-space':'normal'}}]};
 const m=mock(50);
 assert.throws(()=>createLayoutSnapshot(m,n,viewport,{measureSingleLine:()=>({width:60,height:20})}),/Text wrapping required/);
 assert.ok(m.log.some(x=>x[0]===2&&x[1]==='width'&&x[2]==='50px'));
});
