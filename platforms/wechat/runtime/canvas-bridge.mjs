// Backend-neutral 2D bridge for actual DOM canvas nodes; no CSS/layout or gameplay emulation.
export function installCanvasBridge(document,createSurface){
  const records=new WeakMap(),surfaces=new WeakSet();
  const stats={surfaces:0,contexts:0,radialGradients:0,drawImages:0,patterns:0};
  function dimension(node,key){
    const raw=node.getAttribute(key);
    return raw!==null&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):key==='width'?300:150;
  }
  function validate(n){if(!Number.isSafeInteger(n)||n<1||n>16384)throw new RangeError('Canvas dimension unsupported by bridge: '+n);return n;}
  function unwrap(value){return records.get(value)?.surface||value;}
  function attach(node){
    if(String(node.localName).toLowerCase()!=='canvas'||records.has(node))return node;
    const rec={surface:null,ctx:null,proxy:null};
    records.set(node,rec);
    const set=node.setAttribute.bind(node),remove=node.removeAttribute.bind(node);
    function update(key){
      if(!rec.surface)return;
      rec.surface[key]=validate(dimension(node,key));
      rec.ctx=rec.surface.getContext('2d');
      if(!rec.ctx)throw Error('Canvas 2D context unavailable after resize');
    }
    node.setAttribute=function(key,value){
      const k=String(key).toLowerCase();
      if(k==='width'||k==='height'){
        const next=String(value);
        if(/^\d+$/.test(next))validate(Number(next));
        set(k,next);update(k);return;
      }
      return set(key,value);
    };
    node.removeAttribute=function(key){const k=String(key).toLowerCase();remove(key);if(k==='width'||k==='height')update(k);};
    for(const key of ['width','height']){
      Object.defineProperty(node,key,{configurable:true,enumerable:true,get:()=>dimension(node,key),set(value){node.setAttribute(key,String(validate(Number(value))));}});
    }
    Object.defineProperty(node,'getContext',{configurable:true,value(type,options){
      if(type!=='2d')return null;
      if(rec.proxy)return rec.proxy;
      const surface=createSurface(validate(dimension(node,'width')),validate(dimension(node,'height')),node);
      if(!surface||surfaces.has(surface)||typeof surface.getContext!=='function')throw Error('Independent Canvas surface required');
      const ctx=surface.getContext('2d',options);
      if(!ctx)throw Error('Native Canvas 2D unavailable');
      surfaces.add(surface);rec.surface=surface;rec.ctx=ctx;stats.surfaces++;stats.contexts++;
      const cache=new Map();
      rec.proxy=new Proxy(Object.create(null),{
        get(_,key){
          if(key==='canvas')return node;
          const value=Reflect.get(rec.ctx,key,rec.ctx);
          if(typeof value!=='function')return value;
          if(!cache.has(key))cache.set(key,(...args)=>{
            if(key==='drawImage'||key==='createPattern'){
              args[0]=unwrap(args[0]);
              if(key==='drawImage')stats.drawImages++;else stats.patterns++;
            }
            if(key==='createRadialGradient')stats.radialGradients++;
            return Reflect.apply(Reflect.get(rec.ctx,key,rec.ctx),rec.ctx,args);
          });
          return cache.get(key);
        },
        set(_,key,value){if(key==='canvas')return false;return Reflect.set(rec.ctx,key,value,rec.ctx);},
        has(_,key){return key==='canvas'||key in rec.ctx;}
      });
      return rec.proxy;
    }});
    return node;
  }
  for(const node of document.querySelectorAll('canvas'))attach(node);
  const create=document.createElement.bind(document);
  document.createElement=(...args)=>attach(create(...args));
  if(typeof document.createElementNS==='function'){
    const ns=document.createElementNS.bind(document);
    document.createElementNS=(...args)=>attach(ns(...args));
  }
  return {attach,stats,getSurface:node=>records.get(node)?.surface||null};
}
