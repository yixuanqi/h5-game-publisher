import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewportSnapshot,installViewportBridge,mediaMatches} from '../platforms/wechat/runtime/viewport-bridge.mjs';

test('viewport snapshot derives browser dimensions and truthful coarse-pointer/orientation state',()=>{
  const info={windowWidth:844,windowHeight:390,pixelRatio:3,screenWidth:844,screenHeight:390};
  const wx={getWindowInfo:()=>info,getSystemInfoSync:()=>({...info,platform:'android'}),getDeviceInfo:()=>({platform:'android'})};
  const s=createViewportSnapshot(wx);
  assert.deepEqual(s,{width:844,height:390,dpr:3,screenWidth:844,screenHeight:390,coarse:true,landscape:true});
  assert.equal(mediaMatches('(orientation: landscape)',s),true);
  assert.equal(mediaMatches('(orientation: portrait)',s),false);
  assert.equal(mediaMatches('(hover: none) and (pointer: coarse)',s),true);
  assert.equal(mediaMatches('(display-mode: fullscreen)',s),false);
  assert.equal(mediaMatches('(display-mode: standalone)',s),false);
  assert.throws(()=>mediaMatches('(min-width: 1px)',s),/Unsupported/);
});

test('installed viewport bridge maps optional native resize into browser-style viewport and media changes',()=>{
  let info={windowWidth:844,windowHeight:390,pixelRatio:3,screenWidth:844,screenHeight:390},resizeCb,offCb;
  const wx={
    getWindowInfo:()=>info,
    getSystemInfoSync:()=>({...info,platform:'android'}),
    getDeviceInfo:()=>({platform:'android'}),
    onWindowResize:fn=>{resizeCb=fn;},
    offWindowResize:fn=>{offCb=fn;}
  };
  const events=[];
  class Event{constructor(type){this.type=type;}}
  const win={Event,dispatchEvent:e=>{events.push(e.type);return true;}};
  const bridge=installViewportBridge(win,wx);
  assert.equal(win.innerWidth,844);assert.equal(win.innerHeight,390);assert.equal(win.devicePixelRatio,3);
  assert.equal(win.visualViewport.width,844);assert.equal(win.screen.orientation.type,'landscape-primary');
  assert.equal(win.matchMedia('(hover: none) and (pointer: coarse)').matches,true);

  let orientationChanges=0,visualResizes=0,mediaChanges=0;
  win.screen.orientation.addEventListener('change',()=>orientationChanges++);
  win.visualViewport.addEventListener('resize',()=>visualResizes++);
  win.matchMedia('(orientation: landscape)').addEventListener('change',e=>{mediaChanges++;assert.equal(e.matches,false);});

  info={...info,windowWidth:390,windowHeight:844};
  resizeCb({size:{windowWidth:390,windowHeight:844}});
  assert.equal(win.innerWidth,390);assert.equal(win.innerHeight,844);assert.equal(win.screen.orientation.type,'portrait-primary');
  assert.equal(orientationChanges,1);assert.equal(visualResizes,1);assert.equal(mediaChanges,1);assert.deepEqual(events,['resize']);
  bridge.dispose();assert.equal(offCb,resizeCb);
});

test('resize lifecycle is optional and explicit refresh re-reads native window info',()=>{
  let info={windowWidth:640,windowHeight:360,pixelRatio:2,screenWidth:640,screenHeight:360};
  const wx={getWindowInfo:()=>info,getSystemInfoSync:()=>({...info,platform:'devtools'}),getDeviceInfo:()=>({platform:'devtools'})};
  class Event{constructor(type){this.type=type;}}
  const win={Event,dispatchEvent:()=>true};
  const bridge=installViewportBridge(win,wx);
  assert.equal(win.matchMedia('(hover: none) and (pointer: coarse)').matches,false);
  info={...info,windowWidth:360,windowHeight:640};
  bridge.refresh();
  assert.equal(win.innerWidth,360);assert.equal(win.screen.orientation.type,'portrait-primary');
  bridge.dispose();
});
