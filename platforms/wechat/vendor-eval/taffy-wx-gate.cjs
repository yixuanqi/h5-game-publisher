'use strict';
// Geometry only; does not claim a renderer, browser parity, or release readiness.
const TOLERANCE_PX=0.5;
const METRICS=Object.freeze(['firstWidth','secondX','secondWidth','rootWidth']);
const CASES=Object.freeze([
  // Available track space 788px; neither minimum binds.
  Object.freeze({id:'fractional-tracks',width:800,gap:12,expected:Object.freeze({firstWidth:409.76,secondX:421.76,secondWidth:378.24,rootWidth:800})}),
  // Available track space 388px; second track is clamped to 248px.
  Object.freeze({id:'nonzero-minmax',width:400,gap:12,expected:Object.freeze({firstWidth:140,secondX:152,secondWidth:248,rootWidth:400})})
]);
function compareMetrics(expected,actual,tolerance=TOLERANCE_PX){
  if(typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<0||tolerance>TOLERANCE_PX)throw Error('Invalid geometry tolerance');
  if(!expected||!actual||typeof expected!=='object'||typeof actual!=='object'||Array.isArray(expected)||Array.isArray(actual))throw Error('Metric objects required');
  const keys=Object.keys(expected).sort(), actualKeys=Object.keys(actual).sort();
  if(!keys.length)throw Error('Empty geometry metrics');
  if(keys.length!==actualKeys.length||keys.some((key,i)=>key!==actualKeys[i]))throw Error('Geometry metric keys differ');
  const delta=Object.fromEntries(keys.map(key=>{
    if(!Number.isFinite(expected[key])||!Number.isFinite(actual[key]))throw Error('Geometry metric must be finite: '+key);
    return [key,Math.abs(expected[key]-actual[key])];
  }));
  const maxDelta=Math.max(...Object.values(delta));
  return {pass:maxDelta<=tolerance,geometryGatePx:tolerance,delta,maxDelta};
}
function runTitleGridCases(exports){
  const metric=exports?.TaffyTitleGridMetric;
  if(typeof metric!=='function')throw Error('Missing TaffyTitleGridMetric export');
  const cases=CASES.map(({id,width,gap,expected})=>{
    const actual=Object.fromEntries(METRICS.map((key,i)=>[key,metric(width,gap,i)]));
    return {id,width,gap,expected,actual,...compareMetrics(expected,actual)};
  });
  return {pass:cases.every(c=>c.pass),maxDeltaPx:Math.max(...cases.map(c=>c.maxDelta)),cases,releaseReady:false};
}
async function runNativeTitleGrid(host=globalThis){
  const wasm=host?.WXWebAssembly;
  if(typeof wasm?.instantiate!=='function')throw Error('WXWebAssembly is required for native gate');
  const result=await wasm.instantiate('taffy-title-grid.wasm',{});
  const instance=result?.instance??result;
  if(!instance||typeof instance.exports!=='object'||!instance.exports)throw Error('Invalid WXWebAssembly instance');
  return {...runTitleGridCases(instance.exports),runtime:'wx'};
}
module.exports={CASES,TOLERANCE_PX,compareMetrics,runTitleGridCases,runNativeTitleGrid};
