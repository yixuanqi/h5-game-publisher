import {mediaMatches} from '../layout/cascade.mjs';
import {parseInlineDeclarations} from './css-declarations.mjs';

const inheritedProps=new Set([
  'font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform','color','white-space'
]);

function better(a,b){
  if(!b)return true;
  const x=[Number(a.important),a.origin,...a.specificity,a.order];
  const y=[Number(b.important),b.origin,...b.specificity,b.order];
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]>y[i];
  return true;
}
function resolveVars(value,scope){
  if(typeof value!=='string'||!value.includes('var('))return value;
  let v=value;
  for(let i=0;i<16&&v.includes('var(');i++){
    const next=v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/g,(_,name,fallback)=>{
      const found=scope[name];
      if(found===undefined&&fallback===undefined)throw Error('Unresolved CSS variable '+name);
      return found??fallback.trim();
    });
    if(next===v)break;
    v=next;
  }
  if(v.includes('var('))throw Error('Unsupported nested CSS variable expression: '+v);
  return v;
}
export function resolvePlanStyle(plan,element,env,parentStyle={}){
  if(!plan||plan.schema!==1||!Array.isArray(plan.rules))throw Error('CSS runtime plan schema mismatch');
  if(!element||typeof element.matches!=='function')throw Error('DOM element with matches() required');
  const winners={},unsupportedSelectors=[];
  function apply(prop,value,important,specificity,order,origin,selector){
    const next={value,important:!!important,specificity,order,origin,selector};
    if(better(next,winners[prop]))winners[prop]=next;
  }
  for(const rule of plan.rules){
    if(rule.media?.some(q=>!mediaMatches(q,env)))continue;
    let matched=false;
    try{matched=element.matches(rule.selector);}catch(e){unsupportedSelectors.push({selector:rule.selector,error:String(e)});continue;}
    if(!matched)continue;
    for(const d of rule.declarations)apply(d.prop,d.value,d.important,rule.specificity,d.order,0,rule.selector);
  }
  let inlineOrder=Number(plan.maxOrder)||0;
  for(const d of parseInlineDeclarations(element.getAttribute?.('style')||'')){
    apply(d.prop,d.value,d.important,[0,0,0],++inlineOrder,1,'<inline>');
  }

  const values={};
  for(const [k,v] of Object.entries(parentStyle||{})){
    if(k.startsWith('--')||inheritedProps.has(k))values[k]=v;
  }
  for(const [prop,entry] of Object.entries(winners)){
    if(entry.value==='inherit'){if(parentStyle[prop]!==undefined)values[prop]=parentStyle[prop];continue;}
    if(entry.value==='unset'){if(inheritedProps.has(prop)&&parentStyle[prop]!==undefined)values[prop]=parentStyle[prop];continue;}
    values[prop]=entry.value;
  }
  const scope={...values};
  for(const prop of Object.keys(values)){
    if(prop.startsWith('--'))continue;
    values[prop]=resolveVars(values[prop],scope);
  }
  return {values,winners,unsupportedSelectors};
}

export function resolvePlanTree(plan,root,env){
  const cache=new WeakMap();
  function visit(el,parentStyle={}){
    const resolved=resolvePlanStyle(plan,el,env,parentStyle);
    if(resolved.unsupportedSelectors.length)throw Error('Unsupported runtime selector: '+JSON.stringify(resolved.unsupportedSelectors));
    cache.set(el,resolved.values);
    return {
      element:el,
      style:resolved.values,
      children:[...(el.children??[])].map(child=>visit(child,resolved.values))
    };
  }
  return {tree:visit(root,{}),styleOf:el=>cache.get(el)};
}
