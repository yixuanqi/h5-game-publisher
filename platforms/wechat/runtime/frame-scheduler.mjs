// Native Mini Game frame scheduler with browser callback-time semantics.
// Keep this outside the shared bootstrap primitives until it is used by production hosts.
export function createFrameScheduler(canvas, performance, host=globalThis) {
  if(!performance||typeof performance.now!=='function')throw Error('Performance clock unavailable');
  const request=typeof canvas?.requestAnimationFrame==='function'
    ? canvas.requestAnimationFrame.bind(canvas)
    : (typeof host?.requestAnimationFrame==='function'?host.requestAnimationFrame.bind(host):null);
  const cancel=typeof canvas?.cancelAnimationFrame==='function'
    ? canvas.cancelAnimationFrame.bind(canvas)
    : (typeof host?.cancelAnimationFrame==='function'?host.cancelAnimationFrame.bind(host):null);
  if(!request||!cancel)throw Error('Native frame scheduler unavailable');
  return Object.freeze({
    requestAnimationFrame(cb){
      if(typeof cb!=='function')throw TypeError('Frame callback required');
      return request(()=>cb(performance.now()));
    },
    cancelAnimationFrame(id){return cancel(id);}
  });
}
