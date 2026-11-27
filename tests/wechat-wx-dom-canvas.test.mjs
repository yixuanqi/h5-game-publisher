import test from 'node:test';
import assert from 'node:assert/strict';
import {installWxDomCanvas} from '../platforms/wechat/runtime/wx-dom-canvas.mjs';

function element(localName,id=''){
  const attrs=new Map();if(id)attrs.set('id',id);
  return {
    localName,
    id,
    getAttribute:k=>attrs.get(k)??null,
    setAttribute(k,v){attrs.set(k,String(v));if(k==='id')this.id=String(v);},
    removeAttribute:k=>attrs.delete(k)
  };
}
function documentFixture(){
  const screen=element('canvas','gameCanvas'),created=[];
  return {
    screen,created,
    getElementById:id=>id==='gameCanvas'?screen:null,
    querySelectorAll:sel=>sel==='canvas'?[screen,...created.filter(x=>x.localName==='canvas')]:[],
    createElement(name){const n=element(name);created.push(n);return n;},
    createElementNS(ns,name){const n=element(name);created.push(n);return n;}
  };
}
function surface(kind){
  const ctx={kind};
  return {kind,width:0,height:0,getContext:type=>type==='2d'?ctx:null};
}

test('gameCanvas maps to visible wx canvas and later DOM canvases use independent offscreen surfaces',()=>{
  const doc=documentFixture(),screen=surface('screen'),off=[];
  const wx={createCanvas:()=>screen,createOffscreenCanvas:opts=>{const s=surface('off');s.opts=opts;off.push(s);return s;}};
  const installed=installWxDomCanvas(doc,wx);
  assert.equal(installed.screen,screen);assert.equal(installed.screenNode,doc.screen);
  assert.equal(installed.context.canvas,doc.screen);
  assert.equal(screen.width,300);assert.equal(screen.height,150);

  const profiler=doc.createElement('canvas');profiler.width=64;profiler.height=32;
  const pctx=profiler.getContext('2d');
  assert.equal(pctx.canvas,profiler);assert.equal(off.length,1);assert.equal(off[0].width,64);assert.equal(off[0].height,32);
  assert.notEqual(off[0],screen);
});

test('fallback createCanvas must still provide independent surfaces and missing screen fails closed',()=>{
  const doc=documentFixture(),surfaces=[];
  const wx={createCanvas:()=>{const s=surface('canvas'+surfaces.length);surfaces.push(s);return s;}};
  const installed=installWxDomCanvas(doc,wx);
  const extra=doc.createElement('canvas');extra.getContext('2d');
  assert.equal(surfaces.length,2);assert.notEqual(surfaces[0],surfaces[1]);assert.equal(installed.screen,surfaces[0]);

  assert.throws(()=>installWxDomCanvas({...doc,getElementById:()=>null},wx),/gameCanvas/);
  assert.throws(()=>installWxDomCanvas(doc,{}),/createCanvas/);
});

test('aliased native canvas reuse is rejected by generic bridge',()=>{
  const doc=documentFixture(),same=surface('same');
  const wx={createCanvas:()=>same};
  installWxDomCanvas(doc,wx);
  const extra=doc.createElement('canvas');
  assert.throws(()=>extra.getContext('2d'),/Independent Canvas surface/);
});
