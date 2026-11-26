'use strict';
const {createLocalFetch,createStorageAdapter,createSurface,createOffscreenFactory,attachLifecycle}=require('./runtime.js');
const {createScene}=require('./scene.js');
const {createFrameClock}=require('./clock.js');
const {createUI,viewport,hit}=require('./ui.js');
const {createTouch,ACTIONS}=require('./touch.js');
function startPlay(wx,loadEngine,host=globalThis){
  const surface=createSurface(wx),ctx=surface.ctx;
  host.fetch=createLocalFetch(wx);host.__h5WechatCreateOffscreenCanvas=createOffscreenFactory(wx,surface.canvas);
  // Browser gamepad API is not used on this platform; no fake audio or DOM.
  host.navigator={getGamepads:()=>[]};
  const request=typeof surface.canvas.requestAnimationFrame==='function'?surface.canvas.requestAnimationFrame.bind(surface.canvas):host.requestAnimationFrame?.bind(host);
  const cancel=typeof surface.canvas.cancelAnimationFrame==='function'?surface.canvas.cancelAnimationFrame.bind(surface.canvas):host.cancelAnimationFrame?.bind(host);
  if(!request||!cancel)throw Error('Native frame scheduler unavailable');
  const state={phase:'loading',visible:true,frames:0,error:null,disposed:false,blocked:null};
  let scene,ui,engine,touch;
  function fail(e){state.phase='ERROR';state.error=e?.stack||String(e);clock.stop();if(touch)touch.reset();console.error('[wechat-play]',state.error);}
  const clock=createFrameClock(request,cancel,dt=>{
    if(ui.route==='preview'&&!state.blocked){engine.stepPlaying(dt);engine.render();}
    else scene.frame(0);
    ui.paint();state.frames++;
    if(state.blocked){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#20202b';ctx.fillRect(0,0,surface.canvas.width,28);ctx.fillStyle='#ffd497';ctx.font='14px sans-serif';ctx.fillText('Not connected: '+state.blocked+' · return to title to restart',8,18);ctx.restore();}
  },fail);
  function route(next){if(touch)touch.reset();if(engine)engine.G.gameState=next==='preview'&&!state.blocked?'playing':next==='title'?'title':'modal';}
  function blocked(name){state.blocked=name;route('pause');ui.navigate('pause','preview');}
  function resize(){surface.resize();if(scene)scene.resize();if(ui)ui.invalidate();if(touch)touch.reset();}
  function startEvent(e){
    if(!state.visible||state.phase!=='READY'||state.disposed)return;
    try{
      const points=e?.changedTouches||e?.touches||[];
      const v=viewport(surface.width,surface.height);
      for(const p of points){
        const x=p.clientX??p.x,y=p.clientY??p.y;
        if(!Number.isFinite(x)||!Number.isFinite(y))continue;
        const b=ui.targets.find(b=>hit(b,(x-v.x)/v.s,(y-v.y)/v.s));
        if(ui.route==='preview'&&!state.blocked&&b&&ACTIONS.has(b.id)){touch.start(p.identifier,b.id);continue;}
        if(ui.touch(x,y))break;
      }
    }catch(e){fail(e);}
  }
  function endEvent(e){if(touch)for(const p of e?.changedTouches||[])touch.end(p.identifier);}
  const off=attachLifecycle(wx,{show(){if(state.disposed)return;state.visible=true;try{resize();if(state.phase==='READY')clock.start();}catch(e){fail(e);}},hide(){state.visible=false;clock.stop();if(touch)touch.reset();if(ui)ui.invalidate();},resize(){try{resize();}catch(e){fail(e);}},touch:startEvent});
  if(typeof wx.onTouchEnd!=='function'||typeof wx.onTouchCancel!=='function')throw Error('Native touch release APIs unavailable');
  wx.onTouchEnd(endEvent);wx.onTouchCancel(endEvent);
  const ready=(async()=>{
    try{
      engine=loadEngine();engine.setStorageAdapter(createStorageAdapter(wx,'h5publisher:wechat:play-test:'));
      await engine.ensureWorldForCycle(1);if(state.disposed)return state;
      scene=createScene(engine,surface);scene.select(0);engine.loadUserSettings();engine.loadSavedLocale();
      touch=createTouch(engine.setVirtualAction,engine.clearFrameInputs);
      ui=createUI(engine,scene,surface,{start(){state.blocked=null;engine.startTestRun();},onRoute:route});
      // Unsupported transitions stop explicitly instead of silently claiming full progression.
      const hooks=engine.hooks;
      for(const k of Object.keys(hooks))hooks[k]=(...args)=>blocked(k);
      Object.assign(hooks,{syncHUD:()=>{},refreshTitleSaveUI:()=>{},saveProgress:()=>{},readSaveData:()=>null,cycleWeapon:engine.cycleWeapon,openMapModal:()=>ui.navigate('map','preview'),openCodexModal:()=>ui.navigate('codex','preview'),openPauseModal:()=>ui.navigate('pause','preview')});
      state.phase='READY';if(state.visible)clock.start();return state;
    }catch(e){fail(e);throw e;}
  })();ready.catch(()=>{});
  return {state,ready,get ui(){return ui},get engine(){return engine},get touchCount(){return touch?.count||0},dispose(){state.disposed=true;clock.stop();if(touch)touch.reset();off();wx.offTouchEnd?.(endEvent);wx.offTouchCancel?.(endEvent);}};
}
module.exports={startPlay};
