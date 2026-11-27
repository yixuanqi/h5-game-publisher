import postcss from 'postcss';
import {calculate} from 'specificity';
import {parseHTML} from 'linkedom';
import {properties,resolveCascade} from './cascade.mjs';
const relevant=new Set([...properties,'gap','flex-flow','grid','grid-template','all']);
const decls=node=>(node.nodes||[]).filter(x=>x.type==='decl'&&relevant.has(x.prop)).map(({prop,value,important})=>({prop,value,important:!!important}));
export function compileStyles(css){
  const rules=[];
  function walk(nodes,media=[]){
    for(const n of nodes){
      if(n.type==='rule'){
        const declarations=decls(n);
        if(declarations.length)rules.push({selectors:n.selectors,declarations,media});
      }else if(n.type==='atrule'&&n.name==='media')walk(n.nodes||[],[...media,n.params]);
      else if(n.type==='atrule'&&!['keyframes','-webkit-keyframes','font-face','charset'].includes(n.name))throw Error('Unsupported stylesheet at-rule: '+n.name);
    }
  }
  walk(postcss.parse(css).nodes);
  return rules;
}
export function sourceStyles(rules,html,selector,env){
  const {document}=parseHTML(html),node=document.querySelector(selector);
  if(!node)throw Error('Missing source-style node '+selector);
  function get(el){
    const raw=el.getAttribute('style')||'';
    const inline=decls(postcss.parse('x{'+raw+'}').first);
    return resolveCascade({rules,inline,env,matches:s=>el.matches(s),specificity:s=>{const {A,B,C}=calculate(s);return [A,B,C];}});
  }
  return {parent:get(node),children:[...node.children].map(el=>({key:el.id||el.className,style:get(el)}))};
}
