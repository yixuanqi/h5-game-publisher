import test from 'node:test';
import assert from 'node:assert/strict';
import {linearGradient,buildBoxPaintList,replayBoxPaint} from '../platforms/wechat/ui-paint/box-paint.mjs';
import {expandRuntimeDeclaration,parseInlineDeclarations} from '../platforms/wechat/runtime/css-declarations.mjs';
const rect={x:10,y:20,width:100,height:50};
const snap={rect:()=>rect},el=()=>({localName:'div',childNodes:[]});
test('linear gradient projects CSS angle and distributes omitted stops',()=>{
 const g=linearGradient('linear-gradient(90deg, #000, rgba(2, 3, 4, .5), #fff 80%)',rect);
 assert.ok(Math.abs(g.x0-10)<1e-8&&Math.abs(g.x1-110)<1e-8&&Math.abs(g.y0-45)<1e-8&&Math.abs(g.y1-45)<1e-8);
 assert.deepEqual(g.stops.map(s=>s.offset),[0,.4,.8]);
 assert.throws(()=>linearGradient('linear-gradient(90deg, #000 -20%, #fff)',rect),/Unsupported/);
});
test('paint profile preserves border shorthand and inline colors without changing layout profile',()=>{
 const a=Object.fromEntries(expandRuntimeDeclaration('border','2px solid #abc',{paint:true}));
 assert.equal(a['border-left-width'],'2px');assert.equal(a['border-left-style'],'solid');assert.equal(a['border-left-color'],'#abc');
 assert.equal(Object.fromEntries(expandRuntimeDeclaration('border','2px solid #abc'))['border-left-color'],undefined);
 const b=parseInlineDeclarations('border-bottom-color:#123; border-color:#fff #aaa',{paint:true});
 assert.equal(b.filter(x=>x.prop==='border-bottom-color').at(-1).value,'#fff');
});
test('uniform rounded border paints ring then clips children to inner padding box',()=>{
 const style={},paintStyle={background:'linear-gradient(90deg,#000,#fff)','border-radius':'10px','overflow-x':'hidden','overflow-y':'hidden'};
 for(const side of ['top','right','bottom','left']){style['border-'+side+'-width']='2px';paintStyle['border-'+side+'-style']='solid';paintStyle['border-'+side+'-color']='#abc';}
 const list=buildBoxPaintList({element:el(),style,paintStyle},snap);
 assert.deepEqual(list.commands.map(c=>c.op),['gradient','ring','pushClip','popClip']);
 assert.deepEqual(list.commands[2].rect,{x:12,y:22,width:96,height:46});assert.equal(list.commands[2].radius,8);
 assert.throws(()=>buildBoxPaintList({element:el(),style,paintStyle:{...paintStyle,'border-top-style':'dashed'}},snap),/Unsupported border style/);
});
test('replay draws gradient and evenodd border ring, restores state',()=>{
 let depth=0;const calls=[];
 const ctx={save(){depth++},restore(){depth--},beginPath(){},rect(){},createLinearGradient(){return {addColorStop:(offset,color)=>calls.push([offset,color])}},fill(rule){calls.push(rule??'fill')}};
 replayBoxPaint(ctx,{schema:1,commands:[{op:'gradient',rect,radius:0,gradient:linearGradient('linear-gradient(#000,#fff)',rect)},{op:'ring',rect,radius:0,inner:{x:12,y:22,width:96,height:46},innerRadius:0,color:'#abc'}]});
 assert.equal(depth,0);assert.deepEqual(calls,[[0,'#000'],[1,'#fff'],'fill','evenodd']);
});
