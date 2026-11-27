// Normalize native time to Web milliseconds. DevTools 3.18.1 was measured
// returning ms; older/documented hosts may return us. Never assume either.
export function createPerformanceBridge(wx,{wallNow=Date.now}={}){
  if(!wx||typeof wx.getPerformance!=='function')throw Error('wx.getPerformance unavailable');
  const native=wx.getPerformance();
  if(!native||typeof native.now!=='function')throw Error('WeChat Performance.now unavailable');
  if(typeof wallNow!=='function')throw Error('Wall clock required');
  let originWall,anchorWall,anchorRaw,anchorOutput,scale=null,last=0;
  return Object.freeze({
    get clockUnit(){return scale===null?'calibrating':scale===1?'ms':'us';},
    now(){
      const raw=Number(native.now()),wall=Number(wallNow());
      if(!Number.isFinite(raw)||!Number.isFinite(wall))throw Error('WeChat Performance.now returned non-finite value');
      if(originWall===undefined){
        originWall=anchorWall=wall;anchorRaw=raw;return 0;
      }
      if(scale===null){
        // Initial output is elapsed wall milliseconds; no startup wait or
        // wrong-speed frames while the native unit is still unknown.
        last=Math.max(last,wall-originWall);
        const elapsed=wall-anchorWall;
        if(elapsed>=100){
          const ratio=(raw-anchorRaw)/elapsed;
          const candidate=ratio>=0.5&&ratio<=2?1:ratio>=500&&ratio<=2000?0.001:null;
          if(candidate!==null){
            scale=candidate;anchorOutput=last;anchorRaw=raw;
          }else{
            // Do not guess ambiguous, stalled, or reset counters.
            anchorWall=wall;anchorRaw=raw;
          }
        }else if(elapsed<0){
          anchorWall=wall;anchorRaw=raw;
        }
        return last;
      }
      last=Math.max(last,anchorOutput+(raw-anchorRaw)*scale);
      return last;
    }
  });
}
