function add(map,feature,rule,decl){
  if(!map.has(feature))map.set(feature,{count:0,examples:[]});
  const item=map.get(feature);item.count++;
  if(item.examples.length<20)item.examples.push({selector:rule.selector,media:rule.media??[],property:decl.prop,value:decl.value});
}
function nonZeroMinmax(value){
  for(const m of String(value).matchAll(/minmax\(\s*([^,]+),/g)){
    const min=m[1].trim();
    if(!/^(?:0|0px|0%|0\.0+(?:px|%)?)$/i.test(min))return true;
  }
  return false;
}
export function analyzeLayoutRequirements(plan){
  if(!plan||plan.schema!==1||!Array.isArray(plan.rules))throw Error('CSS plan required');
  const found=new Map();
  for(const rule of plan.rules){
    for(const d of rule.declarations??[]){
      const prop=d.prop,value=String(d.value);
      if(prop==='display'&&/^(?:flex|inline-flex)$/.test(value))add(found,'flex',rule,d);
      if(prop==='display'&&value==='grid')add(found,'grid',rule,d);
      if(/^grid-template-(?:columns|rows)$/.test(prop)){
        if(/minmax\(/i.test(value))add(found,'gridMinmax',rule,d);
        if(nonZeroMinmax(value))add(found,'gridNonzeroMinmax',rule,d);
        if(/repeat\(/i.test(value))add(found,'gridRepeat',rule,d);
        if(/repeat\(\s*(?:auto-fit|auto-fill)\b/i.test(value))add(found,'gridAutoRepeat',rule,d);
        if(/\b(?:min-content|max-content)\b/i.test(value))add(found,'gridIntrinsicTracks',rule,d);
      }
      if(/\bcalc\(/i.test(value))add(found,'calc',rule,d);
      if(prop==='position'&&value==='absolute')add(found,'absolutePosition',rule,d);
      if(prop==='position'&&value==='fixed')add(found,'fixedPosition',rule,d);
      if(prop==='position'&&value==='sticky')add(found,'stickyPosition',rule,d);
      if(prop==='flex-wrap'&&value!=='nowrap')add(found,'flexWrap',rule,d);
    }
  }
  const features=Object.fromEntries(found);
  return {
    schema:1,
    features,
    requiresFullGrid:Boolean(found.get('gridNonzeroMinmax')?.count||found.get('gridAutoRepeat')?.count),
    featureNames:[...found.keys()].sort()
  };
}
export function assessLayoutBackend(requirements,capabilities){
  if(!requirements||requirements.schema!==1)throw Error('Layout requirements required');
  const caps=capabilities||{};
  const missing=requirements.featureNames.filter(name=>caps[name]!==true);
  return {compatible:missing.length===0,missing};
}
export const FLOAT_PIGMENT_0105_CAPABILITIES=Object.freeze({
  flex:true,
  grid:true,
  gridMinmax:false,
  gridNonzeroMinmax:false,
  gridRepeat:false,
  gridAutoRepeat:false,
  gridIntrinsicTracks:true,
  calc:false,
  absolutePosition:true,
  fixedPosition:true,
  stickyPosition:true,
  flexWrap:true
});
export const TAFFY_0160_DECLARED_CAPABILITIES=Object.freeze({
  flex:true,
  grid:true,
  gridMinmax:true,
  gridNonzeroMinmax:true,
  gridRepeat:true,
  gridAutoRepeat:true,
  gridIntrinsicTracks:true,
  calc:true,
  absolutePosition:true,
  fixedPosition:true,
  stickyPosition:true,
  flexWrap:true
});
