function domRect(rect){
  const x=Number(rect?.x),y=Number(rect?.y),width=Number(rect?.width),height=Number(rect?.height);
  if(![x,y,width,height].every(Number.isFinite)||width<0||height<0)throw Error('Invalid layout rect');
  return Object.freeze({
    x,y,width,height,left:x,top:y,right:x+width,bottom:y+height,
    toJSON(){return {x,y,width,height,left:x,top:y,right:x+width,bottom:y+height};}
  });
}
export function createGeometryFacade(window,provider){
  if(!window?.Element?.prototype)throw Error('DOM Element prototype required');
  if(!provider||typeof provider.layout!=='function'||typeof provider.rect!=='function')throw Error('Geometry provider required');
  let disposed=false,generation=0,lastMeta=null;
  function resolve(el){
    if(disposed)throw Error('Geometry facade disposed');
    lastMeta=provider.layout();
    generation++;
    return domRect(provider.rect(el));
  }
  const proto=window.Element.prototype;
  const saved={
    getBoundingClientRect:Object.getOwnPropertyDescriptor(proto,'getBoundingClientRect'),
    clientWidth:Object.getOwnPropertyDescriptor(proto,'clientWidth'),
    clientHeight:Object.getOwnPropertyDescriptor(proto,'clientHeight'),
    offsetWidth:Object.getOwnPropertyDescriptor(proto,'offsetWidth'),
    offsetHeight:Object.getOwnPropertyDescriptor(proto,'offsetHeight')
  };
  Object.defineProperty(proto,'getBoundingClientRect',{configurable:true,writable:true,value:function(){return resolve(this);}});
  for(const [name,key] of [['clientWidth','width'],['clientHeight','height'],['offsetWidth','width'],['offsetHeight','height']]){
    Object.defineProperty(proto,name,{configurable:true,get:function(){return resolve(this)[key];}});
  }
  return Object.freeze({
    rect:resolve,
    get generation(){return generation;},
    get lastMeta(){return lastMeta;},
    dispose(){
      if(disposed)return;disposed=true;
      for(const [name,desc] of Object.entries(saved)){
        try{if(desc)Object.defineProperty(proto,name,desc);else delete proto[name];}catch{}
      }
    }
  });
}
export function hitTestElements(elements,x,y,{styleOf}={}){
  x=Number(x);y=Number(y);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid hit-test point');
  const list=[...elements];
  for(let i=list.length-1;i>=0;i--){
    const el=list[i];if(!el||typeof el.getBoundingClientRect!=='function')continue;
    const style=styleOf?styleOf(el):null;
    if(style&&(style.display==='none'||style.visibility==='hidden'||style['pointer-events']==='none'||style.opacity==='0'))continue;
    const r=el.getBoundingClientRect();
    if(x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom)return el;
  }
  return null;
}
