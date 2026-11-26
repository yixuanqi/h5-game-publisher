// Static candidate inventory: syntactic observations, not runtime coverage or free-variable analysis.
export const roots=new Set(['window','document','navigator','localStorage','sessionStorage','performance','screen','location','history','fetch','XMLHttpRequest','Image','Audio','AudioContext','webkitAudioContext','OfflineAudioContext','webkitOfflineAudioContext','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','setInterval','clearInterval','getComputedStyle','matchMedia','ResizeObserver','IntersectionObserver','MutationObserver','PointerEvent','TouchEvent','KeyboardEvent','Event','CustomEvent','HTMLElement','HTMLCanvasElement','CanvasRenderingContext2D','OffscreenCanvas','URL','URLSearchParams','TextEncoder','TextDecoder','Blob','FileReader','WebSocket','indexedDB','crypto','alert','confirm','console','globalThis']);
export function memberPath(node){
  if(node?.type==='Identifier')return node.name;
  if(node?.type==='ChainExpression')return memberPath(node.expression);
  if(node?.type==='MemberExpression'){
    const base=memberPath(node.object);
    if(!base)return null;
    const prop=node.computed?(node.property.type==='Literal'&&typeof node.property.value==='string'?node.property.value:'[*]'):node.property.name;
    return base+(prop==='[*]'?'[*]':'.'+prop);
  }
  return null;
}
export function collect(ast,file){
  const hits=[];
  function visit(n,parent,key){
    if(!n||typeof n!=='object')return;
    if(typeof n.type==='string'){
      const path=memberPath(n);
      const nested=parent?.type==='MemberExpression'&&key==='object';
      const property=parent?.type==='MemberExpression'&&key==='property'&&!parent.computed;
      if(path&&!nested&&!property&&roots.has(path.split(/[.\[]/)[0]))hits.push({file,line:n.loc?.start.line??null,api:path});
    }
    for(const [k,v] of Object.entries(n)){
      if(k==='loc'||k==='start'||k==='end')continue;
      if(Array.isArray(v))for(const child of v)visit(child,n,k);
      else if(v&&typeof v==='object')visit(v,n,k);
    }
  }
  visit(ast,null,null);return hits;
}
export function summarize(hits){
  const m=new Map();
  for(const h of hits){
    if(!m.has(h.api))m.set(h.api,{api:h.api,count:0,locations:[]});
    const row=m.get(h.api);row.count++;if(row.locations.length<12)row.locations.push({file:h.file,line:h.line});
  }
  return [...m.values()].sort((a,b)=>b.count-a.count||a.api.localeCompare(b.api));
}
