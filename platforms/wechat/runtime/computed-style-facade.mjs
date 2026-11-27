import {resolvePlanStyle} from './css-plan-runtime.mjs';

function camelToKebab(name){return String(name).replace(/[A-Z]/g,m=>'-'+m.toLowerCase());}
function envFromWindow(win){
  const width=Number(win.innerWidth),height=Number(win.innerHeight);
  if(!(width>0&&height>0))throw Error('Viewport unavailable for computed style');
  const coarse=typeof win.matchMedia==='function'&&win.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return {width,height,pointer:coarse?'coarse':'fine'};
}
export function createComputedStyleFacade(plan,win){
  if(!plan||plan.schema!==1)throw Error('CSS plan required');
  if(!win||typeof win!=='object')throw Error('window required');
  function valuesFor(el){
    if(!el||typeof el.matches!=='function')throw Error('Element required');
    const chain=[];let cur=el;
    while(cur&&typeof cur.matches==='function'){chain.push(cur);cur=cur.parentElement;}
    let parent={};const env=envFromWindow(win);
    for(let i=chain.length-1;i>=0;i--)parent=resolvePlanStyle(plan,chain[i],env,parent).values;
    return parent;
  }
  function getComputedStyle(el){
    const values=valuesFor(el);
    const target={
      getPropertyValue(name){return values[String(name)]??'';},
      getPropertyPriority(){return '';},
      item(index){return Object.keys(values)[Number(index)]??'';},
      get length(){return Object.keys(values).length;}
    };
    return new Proxy(target,{
      get(obj,key){
        if(key in obj)return Reflect.get(obj,key);
        if(typeof key!=='string')return undefined;
        return values[camelToKebab(key)]??'';
      },
      has(obj,key){return key in obj||(typeof key==='string'&&camelToKebab(key) in values);}
    });
  }
  return Object.freeze({getComputedStyle,valuesFor});
}
