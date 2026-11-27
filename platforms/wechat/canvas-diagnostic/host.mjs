import {parseHTML} from 'linkedom/worker';
import {createIsolatedWindow} from '../runtime/isolated-window.mjs';
import runtime from '../bootstrap/runtime.cjs';
import {installWxDomCanvas} from '../runtime/wx-dom-canvas.mjs';
import {createBrowserEnvironment} from '../runtime/browser-environment.mjs';
import {createURLSearchParamsCtor} from '../runtime/url-search-params.mjs';
import {createComputedStyleFacade} from '../runtime/computed-style-facade.mjs';
import {createCanvasEvidence} from './evidence.mjs';
import {installTouchOverlay} from './touch-overlay.mjs';

const {createLocalFetch,createStorageAdapter}=runtime;

function installPrivate(host,name,value,restore){
  const before=Object.getOwnPropertyDescriptor(host,name);
  Object.defineProperty(host,name,{configurable:true,writable:true,value});
  restore.push(()=>{try{if(before)Object.defineProperty(host,name,before);else delete host[name];}catch{}});
}
function installWindowValue(window,name,value){
  try{Object.defineProperty(window,name,{configurable:true,writable:false,value});}
  catch{try{window[name]=value;}catch{}}
}
function timerPair(host){
  const set=typeof host?.setTimeout==='function'?host.setTimeout.bind(host):(typeof setTimeout==='function'?setTimeout:null);
  const clear=typeof host?.clearTimeout==='function'?host.clearTimeout.bind(host):(typeof clearTimeout==='function'?clearTimeout:null);
  if(!set||!clear)throw Error('Native timers unavailable');
  return {set,clear};
}

export function startCanvasDiagnostic(wx,loadEngine,html,layoutPlan,host=globalThis){
  if(!wx||typeof wx!=='object')throw Error('wx runtime required');
  if(typeof loadEngine!=='function')throw Error('engine loader required');
  if(typeof html!=='string'||!html.includes('id="gameCanvas"'))throw Error('Frozen HTML payload required');
  if(!layoutPlan||layoutPlan.schema!==1||!Array.isArray(layoutPlan.rules))throw Error('Precompiled CSS layout plan required');

  const {window:domWindow,document}=parseHTML(html);
  const window=createIsolatedWindow(domWindow);
  const canvas=installWxDomCanvas(document,wx);
  const fetch=createLocalFetch(wx);
  const storage=createStorageAdapter(wx,'h5publisher:wechat:canvas-diagnostic:');
  const environment=createBrowserEnvironment({wx,window,canvas:canvas.screen,host,fetch,storage});
  const computedStyle=createComputedStyleFacade(layoutPlan,window);
  installWindowValue(window,'getComputedStyle',computedStyle.getComputedStyle);
  const timers=timerPair(host);
  const URLSearchParams=createURLSearchParamsCtor(host?.URLSearchParams);
  installWindowValue(window,'URLSearchParams',URLSearchParams);
  installWindowValue(window,'setTimeout',timers.set);
  installWindowValue(window,'clearTimeout',timers.clear);
  if(host?.console)installWindowValue(window,'console',host.console);

  const restore=[];
  const evidence=createCanvasEvidence({surface:canvas.screen,window,document,onError:fail});
  let touch=null;
  const observedRequest=cb=>environment.requestAnimationFrame(timestamp=>{try{cb(timestamp);evidence.afterFrame();touch?.draw();if(touch)Object.assign(state.touch,touch.stats);}catch(e){fail(e);throw e;}});
  installWindowValue(window,'requestAnimationFrame',observedRequest);
  const aliases={
    __h5WechatWindow:window,
    __h5WechatDocument:document,
    __h5WechatNavigator:environment.navigator,
    __h5WechatFetch:environment.fetch,
    __h5WechatPerformance:environment.performance,
    __h5WechatRequestAnimationFrame:observedRequest,
    __h5WechatCancelAnimationFrame:environment.cancelAnimationFrame,
    __h5WechatLocalStorage:environment.localStorage,
    __h5WechatURLSearchParams:URLSearchParams,
    __h5WechatSetTimeout:timers.set,
    __h5WechatClearTimeout:timers.clear
  };
  for(const [name,value] of Object.entries(aliases))installPrivate(host,name,value,restore);

  const state={
    phase:'PREPARING',
    moduleLoaded:false,
    booted:false,
    error:null,
    checks:0,
    releaseReady:false,
    visualParity:false,
    domPaint:'not-wired',
    inputBridge:'not-wired',
    layoutBackend:'intentionally-isolated',
    wxWebAssembly:'not-required-for-this-diagnostic',
    cssPlanRules:layoutPlan.rules.length,
    cssPlanReady:true,
    computedStyle:'source-plan',
    canvas:evidence.state,
    officialDevTools:'not-verified',
    syntheticDomStart:false
  };
  let timer=null,disposed=false,engine;
  installPrivate(host,'__H5PUBLISHER_CANVAS_PROBE__',state,restore);

  function fail(error){
    if(disposed)return;
    state.phase='ERROR';
    state.error=error?.stack||String(error);
    host.console?.error('[H5PUBLISHER] original entry failed:',state.error);
  }
  window.__ABV_SHOW_FATAL__=message=>fail(Error(String(message)));
  function inspect(){
    if(disposed||state.phase==='ERROR')return;
    state.checks++;
    state.moduleLoaded=window.__ABV_MODULE_LOADED__===true;
    state.booted=window.__ABV_BOOTED__===true;
    if(evidence.state.playingReady){
      touch=installTouchOverlay({wx,window,document,surface:canvas.screen,viewport:environment.viewport,onError:fail});
      state.inputBridge='native-touch-to-original-dom-diagnostic';state.touch={...touch.stats,router:touch.routerStats};
      state.phase='CANVAS_PLAYING_OBSERVED';host.console?.info('[H5PUBLISHER] Canvas playing observed',JSON.stringify({clockUnit:environment.performance.clockUnit,completedCallbacks:evidence.state.completedCallbacks,playingCallbacks:evidence.state.playingCallbacks}));return;}
    if(evidence.state.titleReady&&!state.syntheticDomStart){
      const button=document.getElementById('btn-start');
      if(!button||button.disabled)throw Error('Original start button unavailable');
      state.syntheticDomStart=true;
      // Exercise the original click handler; not native touch or UI rendering evidence.
      button.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));
    }
    if(state.checks>=600){state.phase='BOOT_TIMEOUT';state.error='Original Canvas playing evidence did not reach gate within bounded observation';host.console?.error('[H5PUBLISHER]',state.error,JSON.stringify({clockUnit:environment.performance.clockUnit,moduleLoaded:state.moduleLoaded,booted:state.booted,canvas:evidence.state}));return;}
  }

  const ready=(async()=>{
    try{
      state.phase='CANVAS_HOST_READY';

      engine=loadEngine();
      state.moduleLoaded=window.__ABV_MODULE_LOADED__===true;
      if(!state.moduleLoaded)throw Error('Original src/main.js did not set module marker');
      state.phase='BOOTING';
      return await new Promise(resolve=>{
        function wait(){
          if(disposed||state.phase==='ERROR'||state.phase==='CANVAS_PLAYING_OBSERVED'||state.phase==='BOOT_TIMEOUT'){resolve(state);return;}
          try{inspect();}catch(e){fail(e);resolve(state);return;}
          if(state.phase==='CANVAS_PLAYING_OBSERVED'||state.phase==='BOOT_TIMEOUT'||state.phase==='ERROR'){resolve(state);return;}
          timer=timers.set(wait,55);
        }
        wait();
      });
    }catch(e){fail(e);return state;}
  })();

  return {
    state,
    ready,
    window,
    document,
    layoutPlan,
    computedStyle,
    screen:canvas.screen,
    get touch(){return touch;},
    canvasBridge:canvas.bridge,
    environment,
    get engine(){return engine;},
    dispose(){
      if(disposed)return;
      disposed=true;
      if(timer!==null)timers.clear(timer);
      touch?.dispose();environment.dispose();
      while(restore.length)restore.pop()();
      state.phase=state.phase==='ERROR'?'ERROR':'DISPOSED';
    }
  };
}
