import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBoxPaintList,replayBoxPaint,transformMatrix} from '../platforms/wechat/ui-paint/box-paint.mjs';
const rect={x:10,y:20,width:100,height:50},snap={rect:()=>rect};
const node=(background,style={},paintStyle={},children=[])=>({element:{localName:'div',childNodes:[]},style,paintStyle:{background,...paintStyle},children});
test('CSS transform order, percent translation and origin are represented by affine matrix',()=>{
 assert.deepEqual(transformMatrix('translateY(50%) scale(2)',rect,'0px 0px'),[2,0,0,2,-10,5]);
 assert.deepEqual(transformMatrix('scale(2) translateX(10px)',rect,'0px 0px'),[2,0,0,2,10,-20]);
 const m=transformMatrix('rotate(90deg)',rect,'50% 50%');
 assert.ok(Math.abs(m[0])<1e-8&&Math.abs(m[1]-1)<1e-8&&Math.abs(m[4]-105)<1e-8&&Math.abs(m[5]+15)<1e-8);
 assert.throws(()=>transformMatrix('rotateX(10deg)',rect),/Unsupported/);
});
test('negative z, normal flow, zero/auto, positive z and equal-level DOM order',()=>{
 const pos={position:'absolute'};
 const root=node('#111',{position:'relative'},{'z-index':'0'},[
  node('#aaa',pos,{'z-index':'3'}),node('#bbb'),node('#ccc',pos,{'z-index':'-2'}),node('#ddd',pos),node('#eee',pos,{'z-index':'3'})]);
 assert.deepEqual(buildBoxPaintList(root,snap,{stacking:true}).commands.map(c=>c.color),['#111','#ccc','#bbb','#ddd','#aaa','#eee']);
});
test('nested opacity and transform contain their subtree; unsupported escaping context fails closed',()=>{
 const nested=node('#333',{position:'absolute'},{opacity:'.5'});
 const child=node('#222',{position:'relative'},{opacity:'.5',transform:'translateY(0)'},[nested]);
 const root=node('#111',{position:'relative'},{'z-index':'0'},[child]);
 const list=buildBoxPaintList(root,snap,{stacking:true});
 assert.equal(list.commands[1].op,'group');assert.equal(list.commands[1].commands[1].op,'group');
 const bad=node('#111',{position:'relative'},{'z-index':'0'},[node('#222',{position:'relative'},{},[nested])]);
 assert.throws(()=>buildBoxPaintList(bad,snap,{stacking:true}),/escaping stacking/);
 const fixed=node('#444',{position:'fixed'});
 const clipped=node('#111',{position:'relative'},{'z-index':'0','overflow-x':'hidden','overflow-y':'hidden'},[fixed]);
 assert.throws(()=>buildBoxPaintList(clipped,snap,{stacking:true}),/fixed paint/);
});
test('opacity is composited once for overlapping child commands, not applied per fill',()=>{
 const log=[];let surfaces=0;
 function context(canvas,label){
  let depth=0;const saved=[];
  return {canvas,globalAlpha:1,save(){depth++;saved.push(this.globalAlpha)},restore(){depth--;this.globalAlpha=saved.pop()},get depth(){return depth},transform(){},getTransform(){return {a:1,b:0,c:0,d:1,e:0,f:0}},setTransform(){},clearRect(){},beginPath(){},rect(){},fill(){log.push([label,'fill',this.globalAlpha])},drawImage(){log.push([label,'drawImage',this.globalAlpha])}};
 }
 const main=context({width:100,height:100},'main');
 const list={schema:1,commands:[{op:'group',opacity:.5,matrix:[1,0,0,1,0,0],commands:[{op:'fill',rect,radius:0,color:'#abc'},{op:'fill',rect,radius:0,color:'#def'}]}]};
 const createSurface=(w,h)=>{surfaces++;const surface={width:w,height:h};const ctx=context(surface,'layer');surface.getContext=()=>ctx;return surface;};
 replayBoxPaint(main,list,{createSurface});
 assert.deepEqual(log,[['layer','fill',1],['layer','fill',1],['main','drawImage',.5]]);
 assert.equal(surfaces,1);assert.equal(main.depth,0);assert.equal(main.globalAlpha,1);
 assert.throws(()=>replayBoxPaint(main,list),/opacity surface/);assert.equal(main.depth,0);
});
