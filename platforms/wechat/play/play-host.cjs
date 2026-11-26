'use strict';
const {createLocalFetch,createStorageAdapter,createSurface,createOffscreenFactory,attachLifecycle}=require('./runtime.js');
const {createScene}=require('./scene.js');
const {createFrameClock}=require('./clock.js');
const {createUI,viewport,hit}=require('./ui.js');
const {createTouch,ACTIONS}=require('./touch.js');
function startPlay(wx,loadEngine,host=globalThis,options={}){
  const surface=createSurface(wx),ctx=surface.ctx;
  host.__h5WechatFetch=createLocalFetch(wx);host.__h5WechatCreateOffscreenCanvas=createOffscreenFactory(wx,surface.canvas);
  // Never overwrite platform-owned getter-only navigator or fetch properties.
  // The bundler binds free identifiers in engine.js to these private adapters.
  const nav={getGamepads:()=>[],userAgent:'MicroMessenger',maxTouchPoints:5};
  if(options.progress&&typeof wx.vibrateShort==='function')nav.vibrate=pattern=>{const ms=Array.isArray(pattern)?pattern.reduce((a,v,i)=>a+(i%2===0?Number(v)||0:0),0):Number(pattern)||0;if(ms<=0)return false;wx.vibrateShort({type:ms>=45?'heavy':ms>=20?'medium':'light',fail:()=>{}});return true;};
  host.__h5WechatNavigator=Object.freeze(nav);
  if(options.audio){require('./audio-runtime.js').installAudio(wx,host);}
  const request=typeof surface.canvas.requestAnimationFrame==='function'?surface.canvas.requestAnimationFrame.bind(surface.canvas):host.requestAnimationFrame?.bind(host);
  const cancel=typeof surface.canvas.cancelAnimationFrame==='function'?surface.canvas.cancelAnimationFrame.bind(surface.canvas):host.cancelAnimationFrame?.bind(host);
  if(!request||!cancel)throw Error('Native frame scheduler unavailable');
  const state={phase:'loading',visible:true,frames:0,error:null,disposed:false,blocked:null};
  let scene,ui,engine,touch,pending=Promise.resolve();
  const persistence=!!options.persistence;
  let runActive=false,busy=false,interaction=null;
  function fail(e){state.phase='ERROR';state.error=e?.stack||String(e);clock.stop();if(touch)touch.reset();console.error('[wechat-play]',state.error);}
  const clock=createFrameClock(request,cancel,dt=>{
    if(ui.route==='preview'&&!state.blocked&&!busy){engine.stepPlaying(dt);engine.render();}
    else scene.frame(0);
    ui.paint();state.frames++;
    if(state.blocked){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#20202b';ctx.fillRect(0,0,surface.canvas.width,28);ctx.fillStyle='#ffd497';ctx.font='14px sans-serif';ctx.fillText('Not connected: '+state.blocked+' · return to title to restart',8,18);ctx.restore();}
  },fail);
  function route(next){if(touch)touch.reset();if(engine)engine.G.gameState=next==='preview'&&!state.blocked?'playing':next==='title'?'title':next==='dead'?'dead':'modal';}
  function blocked(name){state.blocked=name;route('pause');ui.navigate('pause','preview');}
  function resize(){surface.resize();if(scene)scene.resize();if(ui)ui.invalidate();if(touch)touch.reset();}
  function startEvent(e){
    if(!state.visible||state.phase!=='READY'||state.disposed||busy)return;
    try{
      if(options.audio&&engine.audio.needsRecovery())engine.audio.keepAliveResume(true);
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
  const off=attachLifecycle(wx,{show(){if(state.disposed)return;state.visible=true;try{if(options.audio&&engine?.audio.ctx)engine.audio.setBackgroundDuck(false);resize();if(state.phase==='READY')clock.start();}catch(e){fail(e);}},hide(){state.visible=false;clock.stop();if(options.audio&&engine?.audio.ctx)engine.audio.setBackgroundDuck(true);if(touch)touch.reset();if(ui)ui.invalidate();},resize(){try{resize();}catch(e){fail(e);}},touch:startEvent});
  if(typeof wx.onTouchEnd!=='function'||typeof wx.onTouchCancel!=='function')throw Error('Native touch release APIs unavailable');
  wx.onTouchEnd(endEvent);wx.onTouchCancel(endEvent);
  const ready=(async()=>{
    try{
      engine=loadEngine();engine.setStorageAdapter(createStorageAdapter(wx,options.progress?'h5publisher:wechat:progress-test:':options.audio?'h5publisher:wechat:audio-test:':persistence?'h5publisher:wechat:save-test:':'h5publisher:wechat:play-test:'));
      await engine.ensureWorldForCycle(1);if(state.disposed)return state;
      scene=createScene(engine,surface);scene.select(0);engine.loadUserSettings();engine.loadSavedLocale();
      touch=createTouch(engine.setVirtualAction,engine.clearFrameInputs);
      ui=createUI(engine,scene,surface,{persistence,audio:!!options.audio,progress:!!options.progress,get interaction(){return interaction;},applyAudioSettings(){if(options.audio){const s=engine.G.settings;engine.audio.setVolumes(s.masterVol,s.musicVol,s.sfxVol);engine.audio.setMusicEnabled(s.musicEnabled);}},start(){
        state.blocked=null;
        if(!persistence){engine.startTestRun();return true;}
        if(busy)return false;
        if(options.audio){engine.audio.init();if(!engine.audio.ctx||!engine.audio._bakeReady||!engine.audio.biomeGains)throw Error('Audio graph/bank not ready');}
        busy=true;runActive=false;
        pending=(async()=>{
          try{
            const data=engine.readSaveData();
            if(data)await engine.restoreTestRun(data);
            else{await engine.ensureWorldForCycle(1);if(state.disposed)return;engine.startTestRun();engine.saveProgress(false);}
            if(state.disposed)return;
            runActive=true;state.saveError=null;if(options.audio){engine.audio.resetToExplore(engine.G.themeBlend.activeTheme);engine.audio.setBackgroundDuck(!state.visible);}ui.navigate('preview');
          }catch(e){state.saveError=String(e);console.error('[wechat-save]',e?.stack||e);ui.invalidate();}
          finally{busy=false;}
        })();
        return false;
      },onRoute:route,saveTitle(){
        if(!persistence)return true;
        try{if(runActive)engine.saveProgress(false);runActive=false;state.blocked=null;state.saveError=null;return true;}
        catch(e){state.saveError=String(e);return false;}
      },retry(){engine.respawnAtActiveAltar();ui.navigate('preview');},get saveError(){return state.saveError;}});
      // Unsupported transitions stop explicitly instead of silently claiming full progression.
      const hooks=engine.hooks;
      for(const k of Object.keys(hooks))hooks[k]=(...args)=>blocked(k);
      Object.assign(hooks,{syncHUD:()=>{},refreshTitleSaveUI:()=>{},saveProgress:()=>{},readSaveData:()=>null,cycleWeapon:engine.cycleWeapon,openMapModal:()=>ui.navigate('map','preview'),openCodexModal:()=>ui.navigate('codex','preview'),openPauseModal:()=>ui.navigate('pause','preview')});
      if(persistence)Object.assign(hooks,{saveProgress:engine.saveProgress,readSaveData:engine.readSaveData,
        interactWithAltar:engine.interactWithAltar,respawnAtActiveAltar:()=>{engine.respawnAtActiveAltar();ui.navigate('preview');},
        openModal:id=>{if(id==='altar')ui.navigate('altar','preview');else blocked('modal:'+id);},
        closeModal:()=>ui.navigate('preview'),
        showDeath:()=>{if(engine.G.player.hp<=0)ui.navigate('dead','preview');}
      });
      if(options.progress)Object.assign(hooks,{
        openNpcModal:npc=>{interaction=npc;engine.openNativeNpc(npc);},
        openSmithModal:npc=>{interaction=npc||{id:'npc_smith',kind:'smith'};engine.openNativeNpc(interaction);},
        openLoreModal:tablet=>{interaction=tablet;engine.openNativeLore(tablet);},
        openDummyModal:dummy=>{interaction=dummy;ui.navigate('dummy','preview');},
        openModal:id=>{if(['altar','npc','smith','lore','dummy'].includes(id))ui.navigate(id,'preview');else blocked('modal:'+id);}
      });
      state.phase='READY';if(state.visible)clock.start();return state;
    }catch(e){fail(e);throw e;}
  })();ready.catch(()=>{});
  return {state,ready,get ui(){return ui},get engine(){return engine},whenIdle:()=>pending,get touchCount(){return touch?.count||0},dispose(){state.disposed=true;clock.stop();if(options.audio&&engine?.audio.ctx){engine.audio.emergencySuspend();engine.audio.ctx.close?.();}if(touch)touch.reset();off();wx.offTouchEnd?.(endEvent);wx.offTouchCancel?.(endEvent);}};
}
module.exports={startPlay};
