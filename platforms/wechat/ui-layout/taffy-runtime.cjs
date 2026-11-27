'use strict';
const PROPS=Object.freeze(Object.fromEntries('display width height min-width min-height max-width max-height column-gap row-gap flex-direction flex-wrap justify-content align-items align-self flex-grow flex-shrink flex-basis grid-template-columns grid-template-rows position top right bottom left padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left border-top-width border-right-width border-bottom-width border-left-width box-sizing aspect-ratio grid-column-start grid-column-end grid-row-start grid-row-end'.split(' ').map((p,i)=>[p,i+1])));
const EXPORTS='TlAbiVersion TlReset TlNodeNew TlNodeFree TlAppend TlDetach TlInputBegin TlInputByte TlSetStyle TlCompute TlRect'.split(' ');
function createTaffyBackend(instance){
  const e=instance?.exports;
  for(const k of EXPORTS)if(typeof e?.[k]!=='function')throw Error('Missing Taffy ABI export: '+k);
  if(e.TlAbiVersion()!==1)throw Error('Unsupported Taffy ABI version');
  const handles=new Set();
  let fresh=false;
  const check=(ok,label)=>{if(ok!==1)throw Error('Taffy rejected '+label);};
  const id=h=>{if(!handles.has(h))throw Error('Invalid Taffy handle');return h;};
  function mutation(label,fn){fresh=false;check(fn(),label);}
  return Object.freeze({
    abiVersion:1,
    reset(){mutation('reset',()=>e.TlReset());handles.clear();},
    createNode(){fresh=false;const h=e.TlNodeNew();if(!Number.isInteger(h)||h<=0||handles.has(h))throw Error('Invalid Taffy allocation');handles.add(h);return h;},
    free(h){mutation('free',()=>e.TlNodeFree(id(h)));handles.delete(h);},
    append(p,c){mutation('append',()=>e.TlAppend(id(p),id(c)));},
    detach(p,c){mutation('detach',()=>e.TlDetach(id(p),id(c)));},
    setStyle(h,prop,value){
      fresh=false;id(h);
      if(!Object.hasOwn(PROPS,prop))throw Error('Unsupported layout property: '+prop);
      if(typeof value!=='string'||!value.trim()||value.length>4096||/[^\x20-\x7e]/.test(value)||/\b(?:calc|var)\s*\(/i.test(value))throw Error('Unsupported layout value: '+prop);
      // No fixed/sticky or inline formatting emulation in V1.
      if(prop==='position'&&!['relative','absolute','static'].includes(value))throw Error('Unsupported positioning: '+value);
      if(prop==='display'&&!['block','flex','grid','none'].includes(value))throw Error('Unsupported display: '+value);
      // CSS accepts a unitless zero length, but Taffy 0.16.0's minimum
      // track parser accepts only px, percentages or size keywords.
      // Normalize only the first argument of minmax on grid track longhands;
      // do not touch fractional tracks, nonzero lengths, or other properties.
      if(prop==='grid-template-columns'||prop==='grid-template-rows'){
        value=value.replace(/(\bminmax\(\s*)([+-]?(?:0+(?:\.0*)?|\.0+))(?=\s*,)/gi,(_,prefix)=>prefix+'0px');
        if(value.length>4096)throw Error('Unsupported layout value: '+prop);
      }
      check(e.TlInputBegin(value.length),'input begin');for(let i=0;i<value.length;i++)check(e.TlInputByte(i,value.charCodeAt(i)),'input byte');
      mutation(prop,()=>e.TlSetStyle(h,PROPS[prop]));
    },
    calculate(root,{width,height}){fresh=false;if(![width,height].every(x=>Number.isFinite(x)&&x>=0&&x<=1e6))throw Error('Invalid viewport');check(e.TlCompute(id(root),width,height),'compute');fresh=true;},
    rect(h){id(h);if(!fresh)throw Error('Stale Taffy geometry');const [x,y,width,height]=[0,1,2,3].map(i=>e.TlRect(h,i));if(![x,y,width,height].every(Number.isFinite)||width<0||height<0)throw Error('Unavailable Taffy geometry');return {x,y,width,height};}
  });
}
async function loadTaffy({host=globalThis,mode,bytes,path='taffy-layout.wasm'}={}){
  let value;
  if(mode==='wx'){
    if(typeof host.WXWebAssembly?.instantiate!=='function')throw Error('WXWebAssembly required');
    if(typeof path!=='string'||!/^([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.wasm$/.test(path))throw Error('Invalid packaged WASM path');
    value=await host.WXWebAssembly.instantiate(path,{});
  }else if(mode==='host'){
    if(!ArrayBuffer.isView(bytes)&&!(bytes instanceof ArrayBuffer))throw Error('Host WASM bytes required');
    value=await host.WebAssembly.instantiate(bytes,{});
  }else throw Error('Explicit WASM runtime mode required');
  return createTaffyBackend(value?.instance??value);
}
module.exports={PROPS,EXPORTS,createTaffyBackend,loadTaffy};
