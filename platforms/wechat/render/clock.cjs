'use strict';
// One scheduled frame at a time; generation fence protects against canceled callbacks.
function createFrameClock(request,cancel,frame,onError){
  let id=null,active=false,last=null,generation=0;
  function schedule(){
    const token=generation;
    id=request(ts=>{
      if(!active||token!==generation)return;
      id=null;
      try{
        if(!Number.isFinite(ts))throw Error('Invalid rAF timestamp');
        const dt=last===null?1/60:Math.min(0.033,Math.max(0,(ts-last)/1000));
        last=ts;frame(dt);
      }catch(e){stop();onError(e);return;}
      if(active&&token===generation)schedule();
    });
  }
  function start(){if(active)return;active=true;last=null;generation++;schedule();}
  function stop(){active=false;last=null;generation++;if(id!==null){cancel(id);id=null;}}
  return {start,stop,get active(){return active}};
}
module.exports={createFrameClock};
