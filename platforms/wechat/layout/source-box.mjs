import postcss from 'postcss';
import {calculate} from 'specificity';
import {parseHTML} from 'linkedom';
import {resolveCascade} from './cascade.mjs';
import {boxProperties,expandBox,horizontalBox,length} from './box-model.mjs';
import {gridTracks} from './tracks.mjs';
const declarations=node=>(node.nodes||[]).filter(x=>x.type==='decl'&&boxProperties.has(x.prop)).map(({prop,value,important})=>({prop,value,important:!!important}));
export function compileBoxStyles(css){
  const rules=[];
  function visit(nodes,media=[]){
    for(const n of nodes){
      if(n.type==='rule'){
        const d=declarations(n);if(d.length)rules.push({selectors:n.selectors,declarations:d,media});
      }else if(n.type==='atrule'&&n.name==='media')visit(n.nodes||[],[...media,n.params]);
      else if(n.type==='atrule'&&!['keyframes','-webkit-keyframes','font-face','charset'].includes(n.name))throw Error('Unsupported box at-rule: '+n.name);
    }
  }
  visit(postcss.parse(css).nodes);return rules;
}
export function sourceBox(rules,html,selector,env){
  const {document}=parseHTML(html),target=document.querySelector(selector);
  if(!target)throw Error('Missing box target: '+selector);
  const cache=new WeakMap(),chain=[];
  function style(el){
    if(!cache.has(el)){
      const inline=declarations(postcss.parse('x{'+(el.getAttribute('style')||'')+'}').first);
      const r=resolveCascade({rules,inline,env,expandDeclaration:expandBox,matches:s=>el.matches(s),specificity:s=>{const {A,B,C}=calculate(s);return [A,B,C];}});
      if(r.unsupported.length)throw Error('Unsupported matched box declarations: '+JSON.stringify(r.unsupported.slice(0,3)));
      cache.set(el,r.values);
    }
    return cache.get(el);
  }
  function parentBox(el){
    let p=el.parentElement;
    while(p&&style(p).display==='contents')p=p.parentElement;
    return p;
  }
  function visit(el){
    if(!el)return {contentWidth:env.width};
    const s=style(el),p=parentBox(el),parent=visit(p),ps=p?style(p):{};
    let available=parent.contentWidth;
    if(ps.display==='grid'){
      const children=[...p.children].filter(c=>style(c).display!=='none');
      const index=children.indexOf(el);
      if(index<0)throw Error('Nested display:contents in grid is unsupported');
      const tracks=gridTracks(available,length(ps['column-gap']??'0',available,env),ps['grid-template-columns']);
      available=tracks[index%tracks.length].width;
    }
    // Bounded auto-width contexts: normal blocks, grid items, stretched column
    // flex children, or an absolutely positioned inset:0 overlay.
    const flex=ps.display==='flex'||ps.display==='inline-flex';
    const stretch=ps.display==='grid'||!flex||(ps['flex-direction']==='column'&&(s['align-self']??ps['align-items']??'stretch')==='stretch')||(s.position==='absolute'&&s.inset==='0');
    const b=horizontalBox(s,available,env,{autoStretch:stretch});
    chain.push({node:el.id||el.className||el.localName,available,style:s,...b});
    return b;
  }
  const result=visit(target);return {...result,chain};
}
