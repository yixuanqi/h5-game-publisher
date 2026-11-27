import {createNavigatorFromWx} from './navigator-bridge.mjs';
import {createPerformanceBridge} from './performance-bridge.mjs';
import {createFrameScheduler} from './frame-scheduler.mjs';
import {installViewportBridge} from './viewport-bridge.mjs';

function installValue(target,name,value){
  try{Object.defineProperty(target,name,{configurable:true,writable:false,value});return;}
  catch{}
  try{target[name]=value;if(target[name]===value)return;}catch{}
  throw Error('Unable to install window.'+name);
}

export function createBrowserEnvironment({wx,window,canvas,host=globalThis,fetch}={}){
  if(!wx||typeof wx!=='object')throw Error('wx runtime required');
  if(!window||typeof window!=='object'||!window.document)throw Error('DOM window/document required');
  if(typeof fetch!=='function')throw Error('Packaged fetch adapter required');
  let viewport;
  try{
    viewport=installViewportBridge(window,wx);
    const navigator=createNavigatorFromWx(wx);
    const performance=createPerformanceBridge(wx);
    const frame=createFrameScheduler(canvas,performance,host);
    installValue(window,'navigator',navigator);
    installValue(window,'performance',performance);
    installValue(window,'fetch',fetch);
    installValue(window,'requestAnimationFrame',frame.requestAnimationFrame);
    installValue(window,'cancelAnimationFrame',frame.cancelAnimationFrame);
    return Object.freeze({
      window,
      document:window.document,
      navigator,
      performance,
      fetch,
      requestAnimationFrame:frame.requestAnimationFrame,
      cancelAnimationFrame:frame.cancelAnimationFrame,
      viewport,
      dispose(){viewport.dispose();}
    });
  }catch(e){
    try{viewport?.dispose();}catch{}
    throw e;
  }
}
