'use strict';
// This is an engineering probe, NOT a playable or reviewable release.
const {createLocalFetch,createStorageAdapter,createSurface,createOffscreenFactory,attachLifecycle}=require('./runtime.js');
function startProbe(wx,loadEngine,host=globalThis,expected=[25,25,26]) {
  const surface=createSurface(wx), ctx=surface.ctx;
  const fetchLocal=createLocalFetch(wx);
  host.fetch=fetchLocal;
  host.__h5WechatCreateOffscreenCanvas=createOffscreenFactory(wx,surface.canvas);
  const state={phase:'loading',cycle:1,counts:[],error:null,visible:true,busy:true,storage:false,touches:0};
  let engine,disposed=false;
  function paint(){
    if(!state.visible||disposed)return;
    const w=surface.width,h=surface.height;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#101822';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#e7cf92';ctx.font='bold 18px sans-serif';
    ctx.fillText('灰钟残誓 V46.1 · 微信适配诊断',16,26);
    ctx.font='12px sans-serif';ctx.fillStyle='#d9e3ec';
    ctx.fillText('工程测试专用 / 非正式游戏 / 不可提审',16,46);
    ctx.fillText('状态: '+state.phase+'  存储: '+(state.storage?'PASS':'待测')+'  触控: '+state.touches,16,64);
    if(state.error){ctx.fillStyle='#ff9c9c';ctx.fillText(String(state.error).slice(0,90),16,85);return;}
    const rooms=engine?.G?.levelBundle?.rooms||[];
    ctx.fillText('NG'+state.cycle+'  房间: '+rooms.length+' / '+expected[state.cycle-1]+'  三周目: '+state.counts.join('/'),16,82);
    if(rooms.length){
      const b=rooms.map(r=>r.bounds);
      const minX=Math.min(...b.map(r=>r.x)),minY=Math.min(...b.map(r=>r.y));
      const maxX=Math.max(...b.map(r=>r.x+r.w)),maxY=Math.max(...b.map(r=>r.y+r.h));
      const scale=Math.min((w-32)/(maxX-minX),Math.max(20,h-142)/(maxY-minY));
      ctx.strokeStyle='#89c0d6';ctx.fillStyle='#243747';
      for(const r of b){const x=16+(r.x-minX)*scale,y=94+(r.y-minY)*scale;
        ctx.fillRect(x,y,r.w*scale,r.h*scale);ctx.strokeRect(x,y,r.w*scale,r.h*scale);}
    }
    ctx.font='13px sans-serif';
    for(let i=0;i<3;i++){const bw=(w-32)/3,x=16+bw*i;
      ctx.fillStyle=i+1===state.cycle?'#725b31':'#293b4b';ctx.fillRect(x,h-39,bw-4,30);
      ctx.fillStyle='#fff';ctx.fillText('NG'+(i+1),x+10,h-19);}
  }
  async function cycle(n){
    if(!engine||disposed)throw Error('Engine unavailable');
    await engine.ensureWorldForCycle(n);
    const count=engine.G.levelBundle.rooms.length;
    if(count!==expected[n-1]||engine.G.loadedWorldVariant!==n)throw Error('World variant mismatch: NG'+n+' '+count);
    state.cycle=n;return count;
  }
  function fail(e){state.error=e?.stack||String(e);state.phase='ERROR';state.busy=false;console.error('[wechat-bootstrap]',state.error);paint();}
  const off=attachLifecycle(wx,{
    show(){state.visible=true;surface.resize();paint();},
    hide(){state.visible=false;},
    resize(){surface.resize();paint();},
    touch(e){
      if(!state.visible||state.busy||state.phase!=='READY')return;
      const p=e?.touches?.[0]||e?.changedTouches?.[0];
      const x=p?.clientX??p?.x,y=p?.clientY??p?.y;
      if(!Number.isFinite(x)||!Number.isFinite(y)||y<surface.height-39||y>surface.height-9||x<16||x>=surface.width-16)return;
      const n=Math.floor((x-16)/((surface.width-32)/3))+1;
      state.touches++;state.busy=true;
      pending=cycle(n).then(()=>{state.busy=false;paint();}).catch(fail);
    }
  });
  paint();
  const ready=(async()=>{
    try{
      engine=loadEngine();
      engine.setStorageAdapter(createStorageAdapter(wx));
      const k='roundtrip';
      if(!engine.storage.setJSON(k,{version:'46.1.0',ok:true})||engine.storage.getJSON(k)?.ok!==true||
         !engine.storage.remove(k)||engine.storage.get(k)!==null)throw Error('Storage round trip failed');
      state.storage=true;
      for(let n=1;n<=3;n++)state.counts.push(await cycle(n));
      await cycle(1);state.phase='READY';state.busy=false;
      console.log('[wechat-bootstrap] READY '+JSON.stringify({counts:state.counts,storage:state.storage}));
      paint();return state;
    }catch(e){fail(e);throw e;}
  })();
  let pending=ready;
  // Tests can await failures; on a device the visible error remains on screen.
  ready.catch(()=>{});
  return {state,ready,whenIdle:()=>pending,dispose(){disposed=true;off();}};
}
module.exports={startProbe};
