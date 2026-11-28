import test from 'node:test';
import assert from 'node:assert/strict';
import {pathBounds,svgDescendantRects,SVG_NS} from '../platforms/wechat/ui-layout/svg-geometry.mjs';
import {createLayoutSnapshot} from '../platforms/wechat/ui-layout/dom-layout.mjs';
const node=(localName,attrs={},children=[])=>({localName,namespaceURI:SVG_NS,children,childNodes:children,getAttribute:k=>attrs[k]??null});
const near=(a,b)=>{for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[k]-b[k])<1e-8,k+': '+a[k]+' vs '+b[k]);};
test('quadratic extrema and absolute arc bounds are geometric, not control hulls',()=>{
 near(pathBounds('M 0 0 Q 10 20 20 0'),{x:0,y:0,width:20,height:10});
 near(pathBounds('M 0 0 A 10 10 0 0 1 20 0'),{x:0,y:-10,width:20,height:10});
 near(pathBounds('M 0 0 A 10 10 0 0 0 20 0'),{x:0,y:0,width:20,height:10});
 near(pathBounds('M 10 20 L 20 30 H 5 V 10 Z'),{x:5,y:10,width:15,height:20});
 assert.throws(()=>pathBounds('M 0 0 C 1 2 3 4 5 6'),/Unsupported SVG path/);
});
test('viewBox meet, definition subtree and primitives preserve element identities',()=>{
 const stop=node('stop'),defs=node('defs',{},[node('radialgradient',{},[stop])]),ellipse=node('ellipse',{cx:'50',cy:'25',rx:'20',ry:'10'});
 const root=node('svg',{viewBox:'0 0 100 50'},[defs,ellipse]);
 const r=svgDescendantRects(root,{x:10,y:20,width:100,height:100});
 assert.deepEqual(r.get(stop),{x:0,y:0,width:0,height:0});
 assert.deepEqual(r.get(ellipse),{x:40,y:60,width:40,height:20});
 assert.equal(r.size,4);
 assert.throws(()=>svgDescendantRects(node('svg',{viewBox:'0 0 100 50'},[node('circle',{r:'4',transform:'translate(2)'})]),{x:0,y:0,width:100,height:50}),/Unsupported SVG transform/);
});
test('SVG descendants do not allocate Taffy HTML boxes and remain addressable',()=>{
 const circle=node('circle',{cx:'50',cy:'25',r:'10'}),svg=node('svg',{viewBox:'0 0 100 50'},[circle]);
 let alloc=0;
 const m={reset(){},createNode(){return ++alloc;},append(){},setStyle(){},calculate(){},rect(){return {x:0,y:0,width:100,height:50};}};
 const snap=createLayoutSnapshot(m,{element:svg,style:{width:'100px',height:'50px'},children:[{element:circle}]},{width:800,height:400});
 assert.equal(alloc,1);assert.equal(snap.nodeCount,2);assert.deepEqual(snap.rect(circle),{x:40,y:15,width:20,height:20});
});
