import postcss from 'postcss';
import {calculate} from 'specificity';
import {expandRuntimeDeclaration} from '../runtime/css-declarations.mjs';
import {classifyPseudoElement} from './pseudo-element-policy.mjs';

const allowedAtRules=new Set(['keyframes','-webkit-keyframes','font-face','charset']);

export function compileRuntimeCssPlan(css){
  const root=postcss.parse(String(css)),rules=[],skippedPseudoElements=[],deferredPseudoRules=[];let order=0;
  function visit(nodes,media=[]){
    for(const node of nodes){
      if(node.type==='rule'){
        for(const selector of node.selectors){
          const pseudo=classifyPseudoElement(selector);
          if(pseudo){
            skippedPseudoElements.push(selector);
            // Preserve authored declaration text and media for later paint work.
            deferredPseudoRules.push({selector,pseudo,media:[...media],declarations:(node.nodes||[]).filter(d=>d.type==='decl').map(d=>({prop:d.prop,value:d.value,important:!!d.important}))});
            continue;
          }
          const declarations=[];
          for(const decl of node.nodes||[]){
            if(decl.type!=='decl')continue;
            const expanded=expandRuntimeDeclaration(decl.prop,decl.value);
            for(const [prop,value] of expanded)declarations.push({prop,value,important:!!decl.important,order:++order});
          }
          if(!declarations.length)continue;
          const {A,B,C}=calculate(selector);
          rules.push({selector,media:[...media],specificity:[A,B,C],declarations});
        }
      }else if(node.type==='atrule'&&node.name==='media'){
        visit(node.nodes||[],[...media,node.params]);
      }else if(node.type==='atrule'&&!allowedAtRules.has(node.name)){
        throw Error('Unsupported runtime CSS at-rule: '+node.name);
      }
    }
  }
  visit(root.nodes);
  return {
    schema:1,
    rules,
    maxOrder:order,
    deferredPseudoRules,
    skippedPseudoElements:[...new Set(skippedPseudoElements)].sort()
  };
}
