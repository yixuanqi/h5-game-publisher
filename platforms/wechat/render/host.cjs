'use strict';
const {createLocalFetch,createStorageAdapter,createSurface,createOffscreenFactory,attachLifecycle}=require('./runtime.js');
const {createScene,ROOMS}=require('./scene.js');
const {createFrameClock}=require('./clock.js');
function startRender(wx,loadEngine,host=globalThis){
  const surface=createSurface(wx),ctx=surface.ctx;
  host.fetch=createLocalFetch(wx);
  host.__h5WechatCreateOffscreenCanvas=createOffscreenFactory(wx,surface.canvas);
  const request=typeof surface.canvas.requestAnimationFrame==='function'?surface.canvas.requestAnimationFrame.bind(surface.canvas):host.requestAnimationFrame?.bind(host);
  const cancel=typeof surface.canvas.cancelAnimationFrame==='function'?surface.canvas.cancelAnimationFrame.bind(surface.canvas):host.cancelAnimationFrame?.bind(host);
  if(!request||!cancel)throw Error('Native frame scheduler unavailable');
  const state={phase:'loading',visible:true,index:0,frames:0,room:null,error:null,disposed:false};
  let scene=null;
  function overlay(){
    const w=surface.width,h=surface.height;
    ctx.setTransform(surface.canvas.width/w,0,0,surface.canvas.width/w,0,0);
    ctx.fillStyle='rgba(4,8,14,0.88)';ctx.fillRect(0,0,w,32);ctx.fillRect(0,h-34,w,34);
    ctx.font='12px sans-serif';ctx.fillStyle='#ead7a6';
    ctx.fillText('V46.1 原始渲染测试 · 非正式游戏 / 不可提审',8,19);
    if(state.error)ctx.fillText(String(state.error).slice(0,90),8,48);
    for(let i=0;i<ROOMS.length;i++){
      const bw=w/3;ctx.fillStyle=i===state.index?'#705b35':'#243347';ctx.fillRect(i*bw+2,h-30,bw-4,26);
      ctx.fillStyle='#fff';ctx.fillText(['祭坛','铸钟殿','霜骸圣脊'][i],i*bw+8,h-12);
    }
  }
  function fail(e){state.phase='ERROR';state.error=e?.stack||String(e);clock.stop();console.error('[wechat-render]',state.error);if(state.visible){ctx.fillStyle='#101822';ctx.fillRect(0,0,surface.width,surface.height);overlay();}}
  const clock=createFrameClock(request,cancel,dt=>{
    scene.frame(dt);state.frames++;overlay();
  },fail);
  function refresh(){surface.resize();if(scene)scene.resize();}
  const off=attachLifecycle(wx,{
    show(){state.visible=true;try{refresh();if(state.phase==='READY')clock.start();}catch(e){fail(e);}},
    hide(){state.visible=false;clock.stop();},
    resize(){try{refresh();}catch(e){fail(e);}},
    touch(e){
      if(!state.visible||state.phase!=='READY')return;
      const p=e?.touches?.[0]||e?.changedTouches?.[0],x=p?.clientX??p?.x,y=p?.clientY??p?.y;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=surface.width||y<surface.height-34||y>=surface.height)return;
      try{const n=Math.floor(x/(surface.width/3));state.room=scene.select(n);state.index=n;}catch(e){fail(e);}
    }
  });
  const ready=(async()=>{
    try{
      const engine=loadEngine();
      engine.setStorageAdapter(createStorageAdapter(wx,'h5publisher:wechat:render:'));
      await engine.ensureWorldForCycle(1);
      if(state.disposed)return state;
      scene=createScene(engine,surface);state.room=scene.select(0);state.phase='READY';
      if(state.visible)clock.start();
      return state;
    }catch(e){fail(e);throw e;}
  })();ready.catch(()=>{});
  return {state,ready,dispose(){state.disposed=true;clock.stop();off();}};
}
module.exports={startRender};
