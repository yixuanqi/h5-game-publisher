// Browser-navigator semantics that can be truthfully derived in a WeChat Mini Game.
// Optional browser capabilities stay absent until a native mapping is separately verified.
function clean(value){return String(value??'').replace(/[\0\r\n]/g,' ').trim();}
export function createNavigatorBridge(info={}){
  const rawPlatform=clean(info.platform).toLowerCase(),system=clean(info.system);
  const ios=rawPlatform==='ios'||/\bios\b/i.test(system),android=rawPlatform==='android'||/android/i.test(system);
  const platform=ios?'iPhone':android?'Linux armv8l':rawPlatform==='devtools'?'WeChatDevTools':'WeChatMiniGame';
  const family=ios?'iPhone':android?'Android Mobile':rawPlatform==='devtools'?'WeChatDevTools':'MiniGame';
  const language=clean(info.language||info.languageCode||'zh-CN').replace('_','-');
  const version=clean(info.wechatVersion||info.version);
  const userAgent=[family,'MicroMessenger',version&&('WeChat/'+version),'MiniGame'].filter(Boolean).join(' ');
  const nav={userAgent,platform,maxTouchPoints:(ios||android)?1:0,language,standalone:false,onLine:true};
  // Intentionally absent: serviceWorker, clipboard, getGamepads, vibrate.
  return Object.freeze(nav);
}
export function createNavigatorFromWx(wx){
  if(!wx||typeof wx!=='object')throw Error('wx runtime required');
  let device={},system={},app={};
  try{if(typeof wx.getDeviceInfo==='function')device=wx.getDeviceInfo()||{};}catch{}
  try{if(typeof wx.getSystemInfoSync==='function')system=wx.getSystemInfoSync()||{};}catch{}
  try{if(typeof wx.getAppBaseInfo==='function')app=wx.getAppBaseInfo()||{};}catch{}
  return createNavigatorBridge({
    platform:device.platform??system.platform,
    system:device.system??system.system,
    language:app.language??system.language,
    wechatVersion:app.version??system.version
  });
}
