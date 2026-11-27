// Diagnostic overlay only; no game rules, input state or original source edits.
export function controlRects(width,height){
  if(!(width>=320&&height>=180))throw Error('Diagnostic controls require landscape viewport');
  const size=Math.min(58,Math.floor(height*.16),Math.floor(width*.1)),gap=Math.max(5,Math.round(size*.12)),pad=12;
  const box=(id,label,x,y,w,h=w)=>({id,label,x,y,w,h});
  const y=height-pad-size, x=width-pad-size;
  const joySize=Math.min(180,Math.floor(height*.44),Math.floor(width*.3));
  return [box('joystick-zone','DRAG',pad,height-pad-joySize,joySize),box('fan-jump','JUMP',x,y,size),box('fan-attack','ATK',x-size-gap,y,size),box('fan-parry','PARRY',x,y-size-gap,size),box('fan-dash','DASH',x-size-gap,y-size-gap,size),box('mobile-interact-btn','USE',x-2*(size+gap),y,size)];
}
const hit=(r,t)=>t.clientX>=r.x&&t.clientX<r.x+r.w&&t.clientY>=r.y&&t.clientY<r.y+r.h;
function point(t){
  const clientX=Number(t.clientX??t.x??t.pageX),clientY=Number(t.clientY??t.y??t.pageY);
  if(t.identifier==null||!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
  return {identifier:t.identifier,clientX,clientY,pageX:clientX,pageY:clientY};
}
// Capture each touch at start; subsequent moves/end never retarget.
export function createTouchRouter({regions,emit,reset}){
  const active=new Map();
  const stats={starts:0,moves:0,ends:0,cancels:0,active:0};
  function releaseAll(){
    if(active.size){active.clear();stats.active=0;reset();}
  }
  function route(type,event){
    if(type==='touchcancel'){
      stats.cancels++;releaseAll();return;
    }
    const changed=Array.from(event?.changedTouches||[]).map(point).filter(Boolean),groups=new Map();
    for(const t of changed){
      let rec=active.get(t.identifier);
      if(type==='touchstart'){
        if(rec)continue;
        const region=regions().find(r=>hit(r,t));
        if(!region)continue;
        // The original joystick supports exactly one pointer.
        if(region.id==='joystick-zone'&&[...active.values()].some(v=>v.id===region.id))continue;
        rec={id:region.id,t};active.set(t.identifier,rec);stats.starts++;
      }else{
        if(!rec)continue;
        rec.t=t;
        if(type==='touchend'){active.delete(t.identifier);stats.ends++;}
        else if(type==='touchmove')stats.moves++;
      }
      if(!groups.has(rec.id))groups.set(rec.id,[]);
      groups.get(rec.id).push(t);
    }
    stats.active=active.size;
    for(const [id,list] of groups)emit(id,type,list,[...active.values()].filter(v=>v.id===id).map(v=>v.t));
  }
  return {route,releaseAll,stats,isPressed:id=>[...active.values()].some(v=>v.id===id)};
}
const rect=r=>({x:r.x,y:r.y,left:r.x,top:r.y,right:r.x+r.w,bottom:r.y+r.h,width:r.w,height:r.h});
export function installTouchOverlay({wx,window,document,surface,viewport,onError}){
  const names=['TouchStart','TouchMove','TouchEnd','TouchCancel'];
  for(const n of names)if(typeof wx['on'+n]!=='function'||typeof wx['off'+n]!=='function')throw Error('Native touch registration/unregistration unavailable: '+n);
  const nodes=new Map(),undo=[],subscriptions=[];
  let layout=[],sizeKey='',disposed=false,enabled=false;
  const stats={registered:false,draws:0,error:null};
  const get=id=>{
    if(!nodes.has(id)){
      const e=document.getElementById(id);if(!e)throw Error('Original control missing: '+id);nodes.set(id,e);
    }
    return nodes.get(id);
  };
  function override(node,name,getter){
    const before=Object.getOwnPropertyDescriptor(node,name);
    Object.defineProperty(node,name,{configurable:true,get:getter});
    undo.push(()=>{if(before)Object.defineProperty(node,name,before);else delete node[name];});
  }
  const router=createTouchRouter({regions:()=>layout,emit(id,type,changed,touches){
    const event=new window.Event(type,{bubbles:false,cancelable:true});
    Object.defineProperties(event,{changedTouches:{value:changed},touches:{value:touches},targetTouches:{value:touches}});
    get(id).dispatchEvent(event);
  },reset(){window.dispatchEvent(new window.Event('blur'));}});
  function geometry(id){
    if(id==='joystick-base'){
      const z=layout.find(r=>r.id==='joystick-zone');
      if(z){const s=Math.floor(z.w*.65);return {x:z.x+(z.w-s)/2,y:z.y+(z.h-s)/2,w:s,h:s};}
    }
    return layout.find(r=>r.id===id)||{x:0,y:0,w:0,h:0};
  }
  function refresh(){
    const {width,height}=viewport.state,key=width+'x'+height;
    if(sizeKey===key)return;
    router.releaseAll();layout=controlRects(width,height);sizeKey=key;
  }
  function active(){return enabled&&document.body.dataset.gameState==='playing';}
  function safe(fn){return e=>{try{fn(e);}catch(err){stats.error=String(err?.stack||err);router.releaseAll();onError?.(err);}};}
  function dispose(){
    if(disposed)return;disposed=true;enabled=false;
    try{router.releaseAll();}finally{while(subscriptions.length)subscriptions.pop()();while(undo.length)undo.pop()();stats.registered=false;}
  }
  try{
    refresh();
    const ids=['joystick-zone','joystick-base',...Array.from(document.querySelectorAll('#action-fan .fan-btn')).map(e=>e.id),'mobile-interact-btn'];
    for(const id of new Set(ids)){
      const node=get(id);
      override(node,'getBoundingClientRect',()=>()=>rect(geometry(id)));
      override(node,'clientWidth',()=>geometry(id).w);
      override(node,'clientHeight',()=>geometry(id).h);
    }
    for(const r of layout)get(r.id);
    for(const n of names){
      const handler=safe(e=>{if(!active()){router.releaseAll();return;}refresh();router.route(n.toLowerCase(),e);});
      wx['on'+n](handler);subscriptions.push(()=>wx['off'+n](handler));
    }
    if(typeof wx.onHide==='function'&&typeof wx.offHide==='function'){
      const hide=safe(()=>router.releaseAll());wx.onHide(hide);subscriptions.push(()=>wx.offHide(hide));
    }
    stats.registered=true;enabled=true;
  }catch(e){dispose();throw e;}
  function draw(){
    if(disposed||stats.error)return;
    if(!active()){router.releaseAll();return;}
    refresh();
    const {width,height}=viewport.state,ctx=surface.getContext('2d');
    ctx.save();
    try{
      ctx.setTransform(surface.width/width,0,0,surface.height/height,0,0);
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;
      for(const r of layout){
        const pressed=router.isPressed(r.id);
        ctx.fillStyle=pressed?'#826b3e':'#172330';ctx.strokeStyle='#d9b970';ctx.lineWidth=1.5;
        ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeRect(r.x+.75,r.y+.75,r.w-1.5,r.h-1.5);
        ctx.fillStyle='#f0dfb2';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(r.label,r.x+r.w/2,r.y+r.h/2);
        if(r.id==='joystick-zone'){
          ctx.beginPath();ctx.arc(r.x+r.w/2,r.y+r.h/2,r.w*.32,0,Math.PI*2);ctx.stroke();
          ctx.font='16px sans-serif';ctx.fillText('<',r.x+r.w*.14,r.y+r.h/2);ctx.fillText('>',r.x+r.w*.86,r.y+r.h/2);
        }
      }
      stats.draws++;
    }finally{ctx.restore();}
  }
  return {draw,dispose,stats,routerStats:router.stats,get regions(){return layout.map(r=>({...r}));}};
}
