// Web-compatible performance.now() semantics backed by WeChat Mini Game Performance.
// WeChat documents Performance.now() in microseconds; browser code expects milliseconds.
export function createPerformanceBridge(wx){
  if(!wx||typeof wx.getPerformance!=='function')throw Error('wx.getPerformance unavailable');
  const native=wx.getPerformance();
  if(!native||typeof native.now!=='function')throw Error('WeChat Performance.now unavailable');
  let last=-Infinity;
  return Object.freeze({
    now(){
      const us=Number(native.now());
      if(!Number.isFinite(us))throw Error('WeChat Performance.now returned non-finite value');
      const ms=us/1000;
      if(ms<last)return last;
      last=ms;return ms;
    }
  });
}
