'use strict';
const {createLocalFetch,createStorageAdapter,createSurface,createOffscreenFactory,attachLifecycle}=require('./runtime.js');
const {createScene}=require('./scene.js');
const {createFrameClock}=require('./clock.js');
const {createUI}=require('./ui.js');
function startUI(wx,loadEngine,host=globalThis){
  const surface=createSurface(wx),ctx=surface.ctx;
  host.fetch=createLocalFetch(wx);host.__h5WechatCreateOffscreenCanvas=createOffscreenFactory(wx,surface.canvas);
  const request=typeof surface.canvas.requestAnimationFrame==='function'?surface.canvas.requestAnimationFrame.bind(surface.canvas):host.requestAnimationFrame?.bind(host);
  const cancel=typeof surface.canvas.cancelAnimationFrame==='function'?surface.canvas.cancelAnimationFrame.bind(surface.canvas):host.cancelAnimationFrame?.bind(host);
  if(!request||!cancel)throw Error('Native frame scheduler unavailable');
  const state={phase:'loading',visible:true,frames:0,error:null,disposed:false};
  let scene,ui,engine;
  function fail(e){state.phase='ERROR';state.error=e?.stack||String(e);clock.stop();console.error('[wechat-ui]',state.error);if(state.visible&&!state.disposed){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#111c27';ctx.fillRect(0,0,surface.canvas.width,surface.canvas.height);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(String(e).slice(0,110),8,25);}}
  const clock=createFrameClock(request,cancel,dt=>{scene.frame(ui.route==='pause'?0:dt);ui.paint();state.frames++;},fail);
  function resize(){surface.resize();if(scene)scene.resize();if(ui)ui.invalidate();}
  const off=attachLifecycle(wx,{
    show(){if(state.disposed)return;state.visible=true;try{resize();if(state.phase==='READY')clock.start();}catch(e){fail(e);}},
    hide(){state.visible=false;clock.stop();if(ui)ui.invalidate();},
    resize(){try{resize();}catch(e){fail(e);}},
    touch(e){
      if(!state.visible||state.phase!=='READY'||state.disposed)return;
      const p=e?.changedTouches?.[0]||e?.touches?.[0];
      try{ui.touch(p?.clientX??p?.x,p?.clientY??p?.y);}catch(e){fail(e);}
    }
  });
  const ready=(async()=>{
    try{
      engine=loadEngine();
      engine.setStorageAdapter(createStorageAdapter(wx,'h5publisher:wechat:ui-test:'));
      await engine.ensureWorldForCycle(1);
      if(state.disposed)return state;
      scene=createScene(engine,surface);scene.select(0);
      engine.loadUserSettings();engine.loadSavedLocale();
      ui=createUI(engine,scene,surface);state.phase='READY';if(state.visible)clock.start();return state;
    }catch(e){fail(e);throw e;}
  })();ready.catch(()=>{});
  return {state,ready,get ui(){return ui},get engine(){return engine},dispose(){state.disposed=true;clock.stop();if(ui)ui.invalidate();off();}};
}
module.exports={startUI};
