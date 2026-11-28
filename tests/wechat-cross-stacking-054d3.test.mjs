import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBoxPaintList} from '../platforms/wechat/ui-paint/box-paint.mjs';
const snap={rect:()=>({x:10,y:20,width:100,height:50})};
const n=(background,style={},paintStyle={},children=[])=>({element:{localName:'div',childNodes:[]},style,paintStyle:{...(background?{background}:{}),...paintStyle},children});
const pos={position:'relative'},abs={position:'absolute'},opts={stacking:true,crossAncestor:true};
const root=children=>n('#111',pos,{'z-index':'0'},children);
const colors=list=>list.commands.filter(c=>c.op==='fill').map(c=>c.color);
test('negative and positive contexts escape multiple auto-z ancestors; equal levels retain tree order',()=>{
 const a=n('#222',pos,{},[n('#333',pos,{},[n('#abc',abs,{'z-index':'5'}),n('#444',abs,{'z-index':'-1'})])]);
 const b=n('#555',pos,{},[n('#def',abs,{'z-index':'5'}),n('#666',abs,{'z-index':'2'})]);
 assert.deepEqual(colors(buildBoxPaintList(root([a,b,n('#777')]),snap,opts)),['#111','#444','#777','#222','#333','#555','#666','#abc','#def']);
 assert.throws(()=>buildBoxPaintList(root([a,b]),snap,{stacking:true}),/escaping stacking/);
});
test('real context remains atomic and auto-z descendants retain their normal-flow phase',()=>{
 const isolated=n('#222',pos,{'z-index':'1'},[n('#abc',abs,{'z-index':'999'})]);
 const a=n('#333',pos,{},[n('#444'),n('#555',pos,{'z-index':'2'})]);
 const list=buildBoxPaintList(root([isolated,a,n('#666',pos,{'z-index':'3'})]),snap,opts);
 assert.deepEqual(colors(list),['#111','#333','#444','#222','#abc','#555','#666']);
});
test('hoisted descendant carries its original clips and opacity group without clipping siblings',()=>{
 const clip={'overflow-x':'hidden','overflow-y':'hidden','border-radius':'5px'};
 const a=n('#222',pos,clip,[n('#333',pos,clip,[n('#abc',abs,{'z-index':'5',opacity:'.5'})])]);
 const list=buildBoxPaintList(root([a,n('#def',pos,{'z-index':'3'})]),snap,opts);
 const i=list.commands.findIndex(c=>c.op==='group');
 assert.ok(i>2);assert.equal(list.commands[i].opacity,.5);
 assert.deepEqual(list.commands.slice(i-3,i+3).map(c=>c.op),['fill','pushClip','pushClip','group','popClip','popClip']);
 assert.equal(list.commands[i-3].color,'#def');
 assert.equal(list.commands[i-1].radius,5);
 assert.equal(list.commands[i].commands[0].color,'#abc');
});
test('closed root and ambiguous containing blocks still fail closed',()=>{
 assert.throws(()=>buildBoxPaintList(n('#111'),snap,opts),/explicit root context/);
 assert.throws(()=>buildBoxPaintList(root([n('#222',{}, {},[n('#333',abs,{'z-index':'2'})])]),snap,opts),/absolute paint containing block/);
 assert.throws(()=>buildBoxPaintList(root([n('#222',pos,{'overflow-x':'hidden','overflow-y':'hidden'},[n('#333',{position:'fixed'})])]),snap,opts),/fixed paint/);
 assert.throws(()=>buildBoxPaintList(root([]),snap,{crossAncestor:true}),/requires stacking/);
});
