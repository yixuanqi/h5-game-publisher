import {parseHTML} from 'linkedom/worker';
import runtime from '../bootstrap/runtime.cjs';
import {installWxDomCanvas} from '../runtime/wx-dom-canvas.mjs';
import {createBrowserEnvironment} from '../runtime/browser-environment.mjs';
import {createURLSearchParamsCtor} from '../runtime/url-search-params.mjs';

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

export function startOriginalEntry(wx,loadEngine,html,host=globalThis){
  if(!wx||typeof wx!=='object')throw Error('wx runtime required');
  if(typeof loadEngine!=='function')throw Error('engine loader required');
  if(typeof html!=='string'||!html.includes('id="gameCanvas"'))throw Error('Frozen HTML payload required');

  const {window,document}=parseHTML(html);
  const canvas=installWxDomCanvas(document,wx);
  const fetch=createLocalFetch(wx);
  const storage=createStorageAdapter(wx,'h5publisher:wechat:original-entry:');
  const environment=createBrowserEnvironment({wx,window,canvas:canvas.screen,host,fetch,storage});
  const timers=timerPair(host);
  const URLSearchParams=createURLSearchParamsCtor(host?.URLSearchParams);
  installWindowValue(window,'URLSearchParams',URLSearchParams);
  installWindowValue(window,'setTimeout',timers.set);
  installWindowValue(window,'clearTimeout',timers.clear);
  if(host?.console)installWindowValue(window,'console',host.console);

  const restore=[];
  const aliases={
    __h5WechatWindow:window,
    __h5WechatDocument:document,
    __h5WechatNavigator:environment.navigator,
    __h5WechatFetch:environment.fetch,
    __h5WechatPerformance:environment.performance,
    __h5WechatRequestAnimationFrame:environment.requestAnimationFrame,
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
    inputBridge:'not-wired'
  };
  let timer=null,disposed=false,engine;

  function fail(error){
    if(disposed)return;
    state.phase='ERROR';
    state.error=error?.stack||String(error);
  }
  window.__ABV_SHOW_FATAL__=message=>fail(Error(String(message)));
  function inspect(){
    if(disposed||state.phase==='ERROR')return;
    state.checks++;
    state.moduleLoaded=window.__ABV_MODULE_LOADED__===true;
    state.booted=window.__ABV_BOOTED__===true;
    if(state.booted){state.phase='FIRST_FRAME';return;}
    if(state.checks>=100){state.phase='BOOT_TIMEOUT';state.error='Original entry did not reach __ABV_BOOTED__ within bounded observation';return;}
    timer=timers.set(inspect,50);
  }

  try{
    engine=loadEngine();
    state.moduleLoaded=window.__ABV_MODULE_LOADED__===true;
    if(!state.moduleLoaded)throw Error('Original src/main.js did not set module marker');
    state.phase='BOOTING';
    inspect();
  }catch(e){fail(e);}

  return {
    state,
    window,
    document,
    screen:canvas.screen,
    canvasBridge:canvas.bridge,
    environment,
    engine,
    dispose(){
      if(disposed)return;
      disposed=true;
      if(timer!==null)timers.clear(timer);
      environment.dispose();
      while(restore.length)restore.pop()();
      state.phase=state.phase==='ERROR'?'ERROR':'DISPOSED';
    }
  };
}
