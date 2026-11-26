'use strict';
// Only platform primitives. No DOM stubs or silent network/audio fallbacks.
function createLocalFetch(wx) {
  const fs = wx.getFileSystemManager();
  return async function fetchLocal(url) {
    if (typeof url !== 'string' || !/^(?:\.\/)?data\/[A-Za-z0-9_/-]+\.json$/.test(url) ||
        url.split('/').some(s => s === '..' || s === '') || url.includes('//')) {
      throw Error('Only packaged JSON is allowed: ' + url);
    }
    const name = url.replace(/^\.\//, '');
    const raw = fs.readFileSync(name, 'utf8');
    return {ok:true, status:200, json:async()=>JSON.parse(raw)};
  };
}
function createStorageAdapter(wx, prefix='h5publisher:wechat:bootstrap:') {
  const key = k => prefix + String(k);
  return {
    get(k) {
      try {
        const raw=wx.getStorageSync(key(k));
        if (typeof raw !== 'string' || raw === '') return null;
        const parsed=JSON.parse(raw);
        return typeof parsed.value === 'string' ? parsed.value : null;
      } catch { return null; }
    },
    set(k,v) {
      try { wx.setStorageSync(key(k),JSON.stringify({value:String(v)})); return true; }
      catch { return false; }
    },
    remove(k) {
      try { wx.removeStorageSync(key(k)); return true; }
      catch { return false; }
    }
  };
}
function createSurface(wx) {
  const canvas=wx.createCanvas();
  const ctx=canvas.getContext('2d');
  if (!ctx) throw Error('Canvas 2D unavailable');
  let width=0,height=0,dpr=1;
  function resize() {
    const s=typeof wx.getWindowInfo==='function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    width=Number(s.windowWidth); height=Number(s.windowHeight);
    if (!(width>0 && height>0 && Number.isFinite(width+height))) throw Error('Invalid viewport');
    dpr=Math.min(2,Math.max(1,Number(s.pixelRatio)||1));
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  return {canvas,ctx,resize,get width(){return width},get height(){return height}};
}
function attachLifecycle(wx, handlers) {
  const pairs=[['Show',handlers.show],['Hide',handlers.hide],['TouchStart',handlers.touch],['WindowResize',handlers.resize]];
  const active=[];
  for(const [event,fn] of pairs){
    if(typeof fn!=='function')continue;
    if(typeof wx['on'+event]!=='function'){
      if(event==='WindowResize')continue;
      throw Error('Missing wx.on'+event);
    }
    wx['on'+event](fn);active.push([event,fn]);
  }
  return ()=>{for(const [event,fn] of active)if(typeof wx['off'+event]==='function')wx['off'+event](fn);};
}
module.exports={createLocalFetch,createStorageAdapter,createSurface,attachLifecycle};
