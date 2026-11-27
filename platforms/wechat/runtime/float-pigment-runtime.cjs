'use strict';
const ABI_VERSION=1;
const LENGTH=Object.freeze({auto:0,px:1,percent:2,undefined:3});
const TRACK=Object.freeze({auto:0,px:1,percent:2,fr:3,'min-content':4,'max-content':5});
const DISPLAY=Object.freeze({none:0,block:1,flex:2,grid:3});
const FLEX_DIRECTION=Object.freeze({row:0,'row-reverse':1,column:2,'column-reverse':3});
const JUSTIFY=Object.freeze({center:0,'flex-start':1,'flex-end':2,'space-between':3,'space-around':4,'space-evenly':5,start:6,end:7,left:8,right:9,stretch:10,baseline:11,normal:12});
const ALIGN=Object.freeze({stretch:0,normal:1,center:2,start:3,end:4,'flex-start':5,'flex-end':6,'self-start':7,'self-end':8,baseline:9});
function packagedPath(path){
  if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||path.includes('?')||path.includes('#')||path.split('/').some(x=>x===''||x==='.'||x==='..')||!/\.wasm(?:\.br)?$/.test(path))throw Error('Invalid packaged WASM path: '+path);
  return path;
}
function normalizeInstance(value){
  const instance=value&&value.instance&&value.instance.exports?value.instance:value;
  if(!instance||typeof instance!=='object'||!instance.exports)throw Error('WASM instantiate returned no instance exports');
  return instance;
}
async function instantiatePackagedWasm({host=globalThis,path,bytes,imports={}}={}){
  const wxWasm=host&&host.WXWebAssembly;
  if(wxWasm&&typeof wxWasm.instantiate==='function'){
    const instance=normalizeInstance(await wxWasm.instantiate(packagedPath(path),imports));
    return {runtime:'wx',instance};
  }
  const standard=host&&host.WebAssembly;
  if(!standard||typeof standard.instantiate!=='function')throw Error('No supported WebAssembly runtime');
  if(!(bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(bytes))throw Error('Standard WebAssembly requires bytes');
  const instance=normalizeInstance(await standard.instantiate(bytes,imports));
  return {runtime:'standard',instance};
}
function finite(name,v){v=Number(v);if(!Number.isFinite(v))throw Error(name+' must be finite');return v;}
function available(name,v){v=Number(v);if(Number.isFinite(v)||v===Infinity)return v;throw Error(name+' must be finite or +Infinity');}
function enumValue(name,map,value){if(!Object.hasOwn(map,value))throw Error('Unsupported '+name+': '+value);return map[value];}
function lengthValue(value){
  if(typeof value==='number')return [LENGTH.px,finite('length',value)];
  if(!value||typeof value!=='object')throw Error('Invalid length');
  const unit=enumValue('length unit',LENGTH,value.unit);const n=unit===LENGTH.auto||unit===LENGTH.undefined?0:finite('length',value.value);
  return [unit,n];
}
function createFloatPigmentBackend(instance){
  const e=normalizeInstance(instance).exports;
  const req=['FpAbiVersion','FpNodeNew','FpNodeFree','FpNodeAppend','FpNodeSetDisplay','FpNodeSetWidth','FpNodeSetHeight','FpNodeSetGap','FpNodeSetFlexDirection','FpNodeSetJustifyContent','FpNodeSetAlignItems','FpGridTracksAlloc','FpGridTracksFree','FpNodeSetGridTemplateColumns','FpNodeSetGridTemplateRows','FpNodeCalculate','FpNodeLeft','FpNodeTop','FpNodeWidth','FpNodeHeight'];
  for(const name of req)if(typeof e[name]!=='function')throw Error('Missing float-pigment ABI export: '+name);
  if(!e.memory||!(e.memory.buffer instanceof ArrayBuffer))throw Error('Missing float-pigment memory export');
  if(e.FpAbiVersion()!==ABI_VERSION)throw Error('Unsupported float-pigment ABI version: '+e.FpAbiVersion());
  function node(v){if(!Number.isInteger(v)||v<=0)throw Error('Invalid node handle');return v;}
  function accepted(name,value){if(value!==1)throw Error(name+' rejected input');}
  function setTracks(handle,tracks,fn){
    node(handle);if(!Array.isArray(tracks)||tracks.length<1)throw Error('Grid tracks required');
    const ptr=e.FpGridTracksAlloc(tracks.length*2);if(!Number.isInteger(ptr)||ptr<=0)throw Error('Track allocation failed');
    try{
      const a=new Float32Array(e.memory.buffer,ptr,tracks.length*2);
      tracks.forEach((t,i)=>{if(!t||typeof t!=='object')throw Error('Invalid grid track');a[i*2]=enumValue('grid track',TRACK,t.unit);a[i*2+1]=['auto','min-content','max-content'].includes(t.unit)?0:finite('grid track',t.value);});
      const ok=fn(handle,ptr,tracks.length);if(ok!==1)throw Error('Grid track setter rejected input');
    } finally {e.FpGridTracksFree(ptr,tracks.length*2);}
  }
  return Object.freeze({
    abiVersion:ABI_VERSION,
    createNode(){return node(e.FpNodeNew());},
    freeNode(h){e.FpNodeFree(node(h));},
    appendChild(p,c){accepted('appendChild',e.FpNodeAppend(node(p),node(c)));},
    setDisplay(h,v){accepted('display',e.FpNodeSetDisplay(node(h),enumValue('display',DISPLAY,v)));},
    setWidth(h,v){const [u,n]=lengthValue(v);accepted('width',e.FpNodeSetWidth(node(h),u,n));},
    setHeight(h,v){const [u,n]=lengthValue(v);accepted('height',e.FpNodeSetHeight(node(h),u,n));},
    setGap(h,{row=0,column=0}={}){const [ru,rv]=lengthValue(row),[cu,cv]=lengthValue(column);accepted('row gap',e.FpNodeSetGap(node(h),0,ru,rv));accepted('column gap',e.FpNodeSetGap(node(h),1,cu,cv));},
    setFlexDirection(h,v){accepted('flex-direction',e.FpNodeSetFlexDirection(node(h),enumValue('flex-direction',FLEX_DIRECTION,v)));},
    setJustifyContent(h,v){accepted('justify-content',e.FpNodeSetJustifyContent(node(h),enumValue('justify-content',JUSTIFY,v)));},
    setAlignItems(h,v){accepted('align-items',e.FpNodeSetAlignItems(node(h),enumValue('align-items',ALIGN,v)));},
    setGridTemplateColumns(h,tracks){setTracks(h,tracks,e.FpNodeSetGridTemplateColumns);},
    setGridTemplateRows(h,tracks){setTracks(h,tracks,e.FpNodeSetGridTemplateRows);},
    calculate(h,{width,height,maxWidth=width,maxHeight=height}){width=available('width',width);height=available('height',height);maxWidth=finite('maxWidth',maxWidth);maxHeight=finite('maxHeight',maxHeight);accepted('calculate',e.FpNodeCalculate(node(h),width,height,maxWidth,maxHeight));},
    rect(h){h=node(h);return {x:e.FpNodeLeft(h),y:e.FpNodeTop(h),width:e.FpNodeWidth(h),height:e.FpNodeHeight(h)};}
  });
}
module.exports={ABI_VERSION,instantiatePackagedWasm,createFloatPigmentBackend};
