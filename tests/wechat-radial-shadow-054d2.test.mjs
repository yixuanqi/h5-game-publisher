import test from 'node:test';
import assert from 'node:assert/strict';
import {radialGradient,outerShadows,buildBoxPaintList,replayBoxPaint} from '../platforms/wechat/ui-paint/box-paint.mjs';
const r={x:10,y:20,width:100,height:50},el={localName:'div',childNodes:[]},snap={rect:()=>r};
test('radial farthest corner ellipse uses source center and both radii',()=>{
 const g=radialGradient('radial-gradient(ellipse at 70% 50%, #fff, #000)',r);
 assert.equal(g.cx,80);assert.equal(g.cy,45);
 assert.ok(Math.abs(g.rx-70*Math.SQRT2)<1e-8&&Math.abs(g.ry-25*Math.SQRT2)<1e-8);
 const c=radialGradient('radial-gradient(circle closest-side at 50% 50%, #000, #fff)',r);
 assert.equal(c.rx,25);assert.equal(c.ry,25);
 const e=radialGradient('radial-gradient(ellipse 80% 60% at 50% 50%, #000, #fff)',r);
 assert.equal(e.rx,80);assert.equal(e.ry,30);
 assert.throws(()=>radialGradient('radial-gradient(circle closest-side at 0% 50%, #fff, #000)',r),/Degenerate/);
});
test('outer shadow lengths, spread and layer order are explicit',()=>{
 const s=outerShadows('3px 2px 0px 2px rgba(0, 0, 0, .4), 1px 2px 6px #000',r,0);
 assert.deepEqual(s[0].caster,{x:8,y:18,width:104,height:54});assert.equal(s[1].blur,6);
 assert.throws(()=>outerShadows('inset 1px 1px #000',r,0),/Unsupported inset/);
 assert.throws(()=>outerShadows('1px 1px -2px #000',r,0),/Invalid shadow/);
 assert.throws(()=>outerShadows('1px 1px 0px 2px #000',r,8),/Unsupported rounded/);
});
test('background and shadow layers render back-to-front before child clip',()=>{
 const list=buildBoxPaintList({element:el,paintStyle:{background:'linear-gradient(#111,#222), radial-gradient(ellipse at 70% 50%, #333,#444), #555','box-shadow':'1px 2px #111, 3px 4px #222','overflow-x':'hidden','overflow-y':'hidden'}},snap);
 assert.deepEqual(list.commands.map(c=>c.op),['shadow','shadow','fill','radial','gradient','pushClip','popClip']);
 assert.equal(list.commands[0].shadow.dx,3);assert.equal(list.commands[1].shadow.dx,1);
});
test('radial replay and shadow failure restore state',()=>{
 let depth=0;const log=[];
 const ctx={save(){depth++},restore(){depth--},beginPath(){},rect(){},translate(x,y){log.push(['translate',x,y])},scale(x,y){log.push(['scale',x,y])},createRadialGradient(){return {addColorStop(){}}},fill(){log.push(['fill'])},clip(rule){log.push(['clip',rule])}};
 const list=buildBoxPaintList({element:el,paintStyle:{background:'radial-gradient(circle closest-side,#fff,#000)','box-shadow':'3px 2px #000'}},snap);
 replayBoxPaint(ctx,list);assert.equal(depth,0);assert.ok(log.some(x=>x[0]==='scale'));assert.ok(log.some(x=>x[0]==='clip'&&x[1]==='evenodd'));
 assert.throws(()=>replayBoxPaint(ctx,{schema:1,commands:[{...list.commands[0],shadow:{...list.commands[0].shadow,blur:-1}}]}),/Invalid shadow/);
 assert.equal(depth,0);
});
