function finitePositive(name,value){const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error('Invalid '+name);return n;}
function readInfo(wx,override){
  let info=override||null,system={},device={};
  if(!info){try{if(typeof wx.getWindowInfo==='function')info=wx.getWindowInfo()||null;}catch{}}
  try{if(typeof wx.getSystemInfoSync==='function')system=wx.getSystemInfoSync()||{};}catch{}
  try{if(typeof wx.getDeviceInfo==='function')device=wx.getDeviceInfo()||{};}catch{}
  info=info||system;
  const width=finitePositive('window width',info.windowWidth??system.windowWidth);
  const height=finitePositive('window height',info.windowHeight??system.windowHeight);
  const dpr=finitePositive('pixel ratio',info.pixelRatio??system.pixelRatio??1);
  const screenWidth=finitePositive('screen width',info.screenWidth??system.screenWidth??width);
  const screenHeight=finitePositive('screen height',info.screenHeight??system.screenHeight??height);
  const platform=String(device.platform??system.platform??'').toLowerCase();
  const coarse=platform==='ios'||platform==='android'||platform==='harmonyos'||/mobile|phone|pad/.test(platform);
  return Object.freeze({width,height,dpr,screenWidth,screenHeight,coarse,landscape:width>=height});
}
export function mediaMatches(query,state){
  const q=String(query).trim().replace(/\s+/g,' ');
  if(q==='(orientation: landscape)')return state.landscape;
  if(q==='(orientation: portrait)')return !state.landscape;
  if(q==='(hover: none) and (pointer: coarse)')return state.coarse;
  if(q==='(display-mode: fullscreen)'||q==='(display-mode: standalone)')return false;
  throw Error('Unsupported matchMedia query: '+q);
}
export function createViewportSnapshot(wx){if(!wx||typeof wx!=='object')throw Error('wx runtime required');return readInfo(wx);}
export function installViewportBridge(win,wx){
  if(!win||typeof win!=='object')throw Error('window object required');
  let state=createViewportSnapshot(wx),disposed=false;
  const mqls=new Set(),vvListeners=new Set(),orientationListeners=new Set();
  const define=(name,get)=>Object.defineProperty(win,name,{configurable:true,enumerable:true,get});
  define('innerWidth',()=>state.width);
  define('innerHeight',()=>state.height);
  define('devicePixelRatio',()=>state.dpr);
  const visualViewport={
    get width(){return state.width},
    get height(){return state.height},
    addEventListener(type,fn){if(type==='resize'&&typeof fn==='function')vvListeners.add(fn);},
    removeEventListener(type,fn){if(type==='resize')vvListeners.delete(fn);}
  };
  const orientation={
    get type(){return state.landscape?'landscape-primary':'portrait-primary'},
    addEventListener(type,fn){if(type==='change'&&typeof fn==='function')orientationListeners.add(fn);},
    removeEventListener(type,fn){if(type==='change')orientationListeners.delete(fn);}
  };
  const screen={get width(){return state.screenWidth},get height(){return state.screenHeight},orientation};
  Object.defineProperty(win,'visualViewport',{configurable:true,value:visualViewport});
  Object.defineProperty(win,'screen',{configurable:true,value:screen});
  Object.defineProperty(win,'matchMedia',{configurable:true,value(query){
    const rec={query:String(query),listeners:new Set(),last:mediaMatches(query,state)};
    const mql={
      media:rec.query,
      get matches(){return mediaMatches(rec.query,state)},
      addEventListener(type,fn){if(type==='change'&&typeof fn==='function')rec.listeners.add(fn);},
      removeEventListener(type,fn){if(type==='change')rec.listeners.delete(fn);},
      addListener(fn){if(typeof fn==='function')rec.listeners.add(fn);},
      removeListener(fn){rec.listeners.delete(fn);}
    };
    rec.mql=mql;mqls.add(rec);return mql;
  }});
  function notify(next){
    const prev=state;state=readInfo(wx,next);if(disposed)return;
    if(typeof win.dispatchEvent==='function'&&typeof win.Event==='function')win.dispatchEvent(new win.Event('resize'));
    for(const fn of vvListeners)fn({type:'resize',target:visualViewport});
    if(prev.landscape!==state.landscape)for(const fn of orientationListeners)fn({type:'change',target:orientation});
    for(const rec of mqls){
      const now=mediaMatches(rec.query,state);
      if(now!==rec.last){rec.last=now;for(const fn of rec.listeners)fn({type:'change',matches:now,media:rec.query,target:rec.mql});}
    }
  }
  const listener=e=>notify(e&&e.size?{...state,windowWidth:e.size.windowWidth,windowHeight:e.size.windowHeight}:null);
  if(typeof wx.onWindowResize==='function')wx.onWindowResize(listener);
  return {
    get state(){return state},
    refresh:()=>notify(null),
    dispose(){
      disposed=true;
      if(typeof wx.offWindowResize==='function')wx.offWindowResize(listener);
      mqls.clear();vvListeners.clear();orientationListeners.clear();
    }
  };
}
