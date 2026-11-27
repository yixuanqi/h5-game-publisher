// Bounded cascade for selected layout declarations, with explicit unsupported diagnostics.
export const properties=new Set(['display','flex-direction','grid-template-columns','column-gap','row-gap','width','box-sizing']);
export function mediaMatches(query,env){
  return query.split(',').some(branch=>branch.trim().split(/\s+and\s+/i).every(part=>{
    const m=part.trim().match(/^\(\s*([a-z-]+)\s*:\s*([^)]+)\)$/i);
    if(!m)throw Error('Unsupported media condition: '+part);
    const [,key,value]=m;
    if(key==='orientation')return value.trim()===(env.width>=env.height?'landscape':'portrait');
    if(key==='pointer')return value.trim()===env.pointer;
    const n=key.match(/^(min|max)-(width|height)$/),v=value.trim().match(/^(\d+(?:\.\d+)?)px$/);
    if(!n||!v)throw Error('Unsupported media condition: '+part);
    return n[1]==='min'?env[n[2]]>=Number(v[1]):env[n[2]]<=Number(v[1]);
  }));
}
export function expand(prop,value){
  if(prop==='gap'){
    const v=value.trim().split(/\s+/);
    if(v.length>2||v.some(x=>!(/^(?:\d+(?:\.\d+)?px|0|normal)$/.test(x))))throw Error('Unsupported gap: '+value);
    return [['row-gap',v[0]],['column-gap',v[1]??v[0]]];
  }
  if(prop==='flex-flow'||prop==='grid'||prop==='grid-template'||prop==='all')throw Error('Unsupported layout shorthand: '+prop);
  return properties.has(prop)?[[prop,value.trim()]]:[];
}
export function wins(a,b){
  if(!b)return true;
  const x=[Number(a.important),...a.specificity,a.order],y=[Number(b.important),...b.specificity,b.order];
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]>y[i];
  return true;
}
export function resolveCascade({rules,inline=[],matches,specificity,env}){
  const result={},unsupported=[];let order=0;
  function apply(decl,score,selector){
    let expanded;
    try{expanded=expand(decl.prop,decl.value);}catch(e){unsupported.push({selector,property:decl.prop,error:String(e)});return;}
    for(const [prop,value] of expanded){
      const a={value,important:!!decl.important,specificity:score,order:order++,selector};
      if(wins(a,result[prop]))result[prop]=a;
    }
  }
  for(const r of rules){
    if(r.media.some(q=>!mediaMatches(q,env)))continue;
    for(const sel of r.selectors){
      // Pseudo elements are not properties of their originating node.
      if(/::|:(?:before|after|first-letter|first-line)\b/i.test(sel))continue;
      let yes;try{yes=matches(sel);}catch(e){unsupported.push({selector:sel,error:String(e)});continue;}
      if(!yes)continue;
      const s=specificity(sel);for(const d of r.declarations)apply(d,[0,...s],sel);
    }
  }
  for(const d of inline)apply(d,[1,0,0,0],'<inline>');
  return {values:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.value])),winners:result,unsupported};
}
