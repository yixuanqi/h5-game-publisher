/* Lifecycle contract: native activity and document visibility must both be active. */
(() => {
  let visible=!document.hidden, nativeActive=true, pageActive=true, paused=!visible;
  function emit(name, detail={}) { window.dispatchEvent(new CustomEvent('h5publisher:'+name,{detail})); }
  function sync(){const next=!(visible&&nativeActive&&pageActive);if(next===paused)return;paused=next;emit(paused?'pause':'resume');}
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;sync();});
  window.addEventListener('pagehide',()=>{pageActive=false;sync();});
  window.addEventListener('pageshow',()=>{pageActive=true;visible=!document.hidden;sync();});
  function attach(){
    const app=window.Capacitor?.Plugins?.App;
    if(!app || typeof app.addListener!=='function') return;
    let generation=0;
    Promise.resolve(app.addListener('appStateChange',({isActive})=>{generation++;nativeActive=!!isActive;sync();})).catch(console.warn);
    Promise.resolve(app.addListener('backButton',()=>emit('back'))).catch(console.warn);
    if(typeof app.getState==='function'){
      const initial=generation;
      Promise.resolve(app.getState()).then(({isActive})=>{if(initial===generation){nativeActive=!!isActive;sync();}}).catch(console.warn);
    }
  }
  window.H5Publisher=Object.freeze({version:'0.2.0',isNative:()=>Boolean(window.Capacitor?.isNativePlatform?.()),isPaused:()=>paused});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
