import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeometryFacade,hitTestElements} from '../platforms/wechat/runtime/geometry-facade.mjs';

test('geometry facade exposes provider rectangles through browser geometry APIs and restores prototype on dispose',()=>{
  class Element{}
  const window={Element},a=new Element(),rects=new Map([[a,{x:10,y:20,width:100,height:40}]]);
  let layouts=0;
  const provider={layout(){layouts++;return {nodes:1};},rect:el=>rects.get(el)};
  const facade=createGeometryFacade(window,provider);
  const r=a.getBoundingClientRect();
  assert.deepEqual(r.toJSON(),{x:10,y:20,width:100,height:40,left:10,top:20,right:110,bottom:60});
  assert.equal(a.clientWidth,100);assert.equal(a.clientHeight,40);assert.equal(a.offsetWidth,100);assert.equal(a.offsetHeight,40);
  assert.ok(layouts>=5);assert.ok(facade.generation>=5);assert.deepEqual(facade.lastMeta,{nodes:1});
  rects.set(a,{x:12,y:24,width:80,height:30});assert.equal(a.getBoundingClientRect().left,12);
  facade.dispose();
  assert.equal(typeof a.getBoundingClientRect,'undefined');
});

test('hit testing uses reverse paint order and source visibility/pointer semantics',()=>{
  class Element{constructor(name,rect){this.name=name;this._rect=rect;}getBoundingClientRect(){const {x,y,width,height}=this._rect;return {x,y,width,height,left:x,top:y,right:x+width,bottom:y+height};}}
  const back=new Element('back',{x:0,y:0,width:100,height:100});
  const front=new Element('front',{x:20,y:20,width:60,height:60});
  const styles=new Map([[back,{display:'block'}],[front,{display:'block'}]]);
  assert.equal(hitTestElements([back,front],30,30,{styleOf:e=>styles.get(e)}),front);
  styles.set(front,{display:'block','pointer-events':'none'});
  assert.equal(hitTestElements([back,front],30,30,{styleOf:e=>styles.get(e)}),back);
  styles.set(back,{display:'none'});
  assert.equal(hitTestElements([back,front],30,30,{styleOf:e=>styles.get(e)}),null);
});
