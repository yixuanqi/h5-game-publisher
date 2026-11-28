import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutSnapshot} from '../platforms/wechat/ui-layout/dom-layout.mjs';
import {textDescriptor,directTextRun} from '../platforms/wechat/ui-layout/text-metrics.mjs';
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

test('inline-block text control is blockified only in flex or grid item context',()=>{
 for(const display of ['flex','grid']){
  const m=mock(80);
  const tree={element:el(),style:{display},children:[{element:label(),style:{display:'inline-block',width:'80px','box-sizing':'border-box'},textStyle:{'white-space':'nowrap'}}]};
  createLayoutSnapshot(m,tree,viewport,{measureSingleLine:()=>({width:60,height:20})});
  assert.ok(m.log.some(x=>x[0]===2&&x[1]==='display'&&x[2]==='block'));
  assert.equal(tree.children[0].style.display,'inline-block');
 }
 const bad={element:el(),style:{display:'block'},children:[{element:label(),style:{display:'inline-block',width:'80px'}}]};
 assert.throws(()=>createLayoutSnapshot(mock(),bad,viewport,{measureSingleLine:()=>({width:60,height:20})}),/Unsupported inline formatting/);
});
test('inline-flex and inline-grid containers blockify without losing inner layout mode',()=>{
 for(const [input,output] of [['inline-flex','flex'],['inline-grid','grid']]){
  const m=mock();
  createLayoutSnapshot(m,{element:el(),style:{display:'flex'},children:[{element:el(),style:{display:input},children:[{element:el(),style:{width:'20px'}}]}]},viewport);
  assert.ok(m.log.some(x=>x[0]===2&&x[1]==='display'&&x[2]===output));
 }
 assert.throws(()=>createLayoutSnapshot(mock(),{element:el(),style:{display:'flex'},children:[{element:el(),style:{display:'inline-block'},children:[{element:el()}]}]},viewport),/Unsupported inline-block formatting context/);
});

test('logical text preserves entity characters and whitespace across adjacent nodes and comments',()=>{
 const t=textContent=>({nodeType:3,textContent});
 const n={children:[],childNodes:[t('  键鼠 / Xbox '),t('&'),{nodeType:8,textContent:'comment'},t(' PS  手柄  ')]};
 assert.equal(directTextRun(n),'键鼠 / Xbox & PS 手柄');
 assert.equal(directTextRun({childNodes:[t('A'),t('&'),t('B')]}),'A&B');
 assert.equal(directTextRun({childNodes:[t('A'),t('\u00a0'),t('B')]}),'A\u00a0B');
 assert.equal(directTextRun({childNodes:[t('\u00a0')]}),'\u00a0');
 assert.equal(directTextRun({childNodes:[t('  \n ')]}),null);
 assert.equal(directTextRun({childNodes:[t('a'),{nodeType:1,textContent:'b'}]}),null);
 assert.equal(n.childNodes.length,4);
});
test('adjacent nodes are measured exactly once; mixed markup remains rejected',()=>{
 const n={localName:'span',childNodes:[{nodeType:3,textContent:'Xbox '},{nodeType:3,textContent:'&'},{nodeType:3,textContent:' PS'}]};
 const root={element:el(),style:{display:'flex'},children:[{element:n,style:{width:'80px'},textStyle:{'white-space':'nowrap'}}]};
 const measured=[];
 createLayoutSnapshot(mock(),root,viewport,{measureSingleLine:({text})=>{measured.push(text);return {width:60,height:20};}});
 assert.deepEqual(measured,['Xbox & PS']);
 assert.equal(n.childNodes.length,3);
 const mixed={...root.children[0],element:{...n,childNodes:[...n.childNodes,{nodeType:1}]}};
 assert.throws(()=>createLayoutSnapshot(mock(),{...root,children:[mixed]},viewport,{measureSingleLine:()=>({width:60,height:20})}),/mixed content/);
});
