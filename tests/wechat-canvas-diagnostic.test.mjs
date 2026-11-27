import test from 'node:test';
import assert from 'node:assert/strict';
import {samplePixels,createCanvasEvidence} from '../platforms/wechat/canvas-diagnostic/evidence.mjs';
function fixture(){
  const width=64,height=36,window={},document={body:{dataset:{gameState:'title'}}};
  let frame=0,uniform=false;
  const surface={width,height,getContext(){return {getImageData(){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=uniform?0:((i/4+frame)%251);data[i+1]=uniform?0:((i/4)%97);data[i+3]=255;}return {data};}};}};
  const observer=createCanvasEvidence({surface,window,document});
  return {observer,window,document,surface,next(n){for(let i=0;i<n;i++){frame++;observer.afterFrame();}},uniform(){uniform=true;}};
}
test('no boot marker or static blank pixels cannot establish game rendering',()=>{
  const f=fixture();f.next(60);assert.equal(f.observer.state.completedCallbacks,0);
  f.window.__ABV_MODULE_LOADED__=f.window.__ABV_BOOTED__=true;
  f.uniform();f.next(60);assert.equal(f.observer.state.titleReady,false);
});
test('actual observed changing screen samples and playing phase required',()=>{
  const f=fixture();f.window.__ABV_MODULE_LOADED__=f.window.__ABV_BOOTED__=true;
  f.next(30);assert.equal(f.observer.state.titleReady,true);assert.equal(f.observer.state.playingReady,false);
  f.document.body.dataset.gameState='playing';f.next(29);assert.equal(f.observer.state.playingReady,false);
  f.next(1);assert.equal(f.observer.state.playingReady,true);assert.equal(f.observer.state.playingCallbacks,30);
});
test('invalid raster fails',()=>assert.throws(()=>samplePixels({width:1,height:1})));
