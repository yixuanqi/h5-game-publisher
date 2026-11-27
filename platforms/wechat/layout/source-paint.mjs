import postcss from 'postcss';
import {calculate} from 'specificity';
import {parseHTML} from 'linkedom';
import {resolveCascade} from './cascade.mjs';
import {boxProperties,expandBox,splitTop} from './box-model.mjs';
const paintProps=new Set(['font-family','font-size','font-weight','line-height','letter-spacing','text-align','color','background','border-radius','border-bottom-color','opacity','min-height','content','top','transform']);
const relevant=p=>boxProperties.has(p)||paintProps.has(p)||p.startsWith('--');
const decls=n=>(n.nodes||[]).filter(d=>d.type==='decl'&&relevant(d.prop)).map(({prop,value,important})=>({prop,value,important:!!important}));
function expand(prop,value){
  const result=expandBox(prop,value);
  if(prop==='border-bottom'||prop==='border'){
    const tokens=splitTop(value),color=tokens.find(x=>/^#|^rgba?\(|^var\(|^transparent$/.test(x));
    if(color)result.push(['border-bottom-color',color]);
  }
  if(paintProps.has(prop)||prop.startsWith('--'))return [[prop,value.trim()]];
  return result;
}
export function compilePaint(css){
  const normal=[],before=[];
  function walk(nodes,media=[]){
    for(const n of nodes){
      if(n.type==='rule'){
        const declarations=decls(n);if(!declarations.length)continue;
        for(const s of n.selectors){
          if(/::before$/.test(s))before.push({selectors:[s.replace(/::before$/,'')],declarations,media});
          else if(!/::/.test(s))normal.push({selectors:[s],declarations,media});
        }
      }else if(n.type==='atrule'&&n.name==='media')walk(n.nodes||[],[...media,n.params]);
      else if(n.type==='atrule'&&!['keyframes','-webkit-keyframes','font-face','charset'].includes(n.name))throw Error('Unsupported paint at-rule: '+n.name);
    }
  }
  walk(postcss.parse(css).nodes);return {normal,before};
}
export function textColumnSource(compiled,html,selector,env){
  const {document}=parseHTML(html),p=document.querySelector(selector),cache=new WeakMap();
  if(!p)throw Error('Missing column '+selector);
  const inherit=['font-family','font-size','font-weight','line-height','letter-spacing','color','text-align'];
  function resolve(el,rules,inline=[]){
    const r=resolveCascade({rules,inline,env,expandDeclaration:expand,matches:s=>el.matches(s),specificity:s=>{const {A,B,C}=calculate(s);return [A,B,C];}});
    if(r.unsupported.length)throw Error('Unsupported source paint selector: '+JSON.stringify(r.unsupported.slice(0,3)));
    return r.values;
  }
  function vars(s){
    const a={...s};
    for(const k of Object.keys(a)){
      if(k.startsWith('--'))continue;
      let v=a[k];
      for(let i=0;i<12&&v.includes('var(');i++){
        const next=v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/g,(_,name,fallback)=>{
          if(a[name]===undefined&&fallback===undefined)throw Error('Unresolved '+name);return a[name]??fallback;
        });
        if(v===next)break;v=next;
      }
      if(v.includes('var('))throw Error('Unsupported variable expression: '+v);a[k]=v;
    }
    return a;
  }
  function get(el){
    if(!el)return {};
    if(cache.has(el))return cache.get(el);
    const parent=get(el.parentElement),raw=resolve(el,compiled.normal,decls(postcss.parse('x{'+(el.getAttribute('style')||'')+'}').first));
    const s={};
    for(const [k,v] of Object.entries(parent))if(k.startsWith('--')||inherit.includes(k))s[k]=v;
    for(const [k,v] of Object.entries(raw))s[k]=v==='inherit'&&parent[k]!==undefined?parent[k]:v;
    // Resolve only consumed properties lazily at leaf to avoid unrelated ancestor CSS expressions.
    cache.set(el,s);return s;
  }
  const rawParent=get(p);
  const parent=Object.fromEntries(Object.entries(rawParent).filter(([k])=>['row-gap','column-gap','display','flex-direction'].includes(k)));
  const children=[...p.children].map(el=>{
    const raw=get(el);
    if(raw.display==='none')return {key:el.id,style:{display:'none'}};
    const before=resolve(el,compiled.before);
    return {key:el.id||el.className,text:el.textContent.trim(),disabled:el.hasAttribute('disabled'),style:vars(raw),before:vars({...Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith('--'))),...before})};
  });
  return {parent,children};
}
