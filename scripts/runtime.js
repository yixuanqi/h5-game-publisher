/* Optional game integration: listen to h5publisher:pause/resume/back. No automatic resume of gameplay. */
(() => {
  let paused = document.hidden;
  function emit(name, detail={}) { window.dispatchEvent(new CustomEvent('h5publisher:'+name,{detail})); }
  function active(value) { if(paused===!value)return;paused=!value;emit(value?'resume':'pause'); }
  document.addEventListener('visibilitychange',()=>active(!document.hidden));
  window.addEventListener('pagehide',()=>active(false));
  window.addEventListener('pageshow',()=>active(!document.hidden));
  function attach(){
    const app=window.Capacitor?.Plugins?.App;
    if(!app || typeof app.addListener!=='function') return;
    Promise.resolve(app.addListener('appStateChange',({isActive})=>active(isActive&&!document.hidden))).catch(console.warn);
    Promise.resolve(app.addListener('backButton',()=>emit('back'))).catch(console.warn);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
  window.H5Publisher=Object.freeze({version:'0.1.0',isNative:()=>Boolean(window.Capacitor?.isNativePlatform?.()),isPaused:()=>paused});
})();
