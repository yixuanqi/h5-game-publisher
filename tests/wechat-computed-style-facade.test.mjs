import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputedStyleFacade} from '../platforms/wechat/runtime/computed-style-facade.mjs';

function element(matches,style='',parent=null){
  return {parentElement:parent,matches:s=>matches.includes(s),getAttribute:k=>k==='style'?style:null};
}
const plan={schema:1,maxOrder:20,rules:[
  {selector:':root',media:[],specificity:[0,1,0],declarations:[{prop:'--alpha',value:'0.5',important:false,order:1},{prop:'color',value:'#fff',important:false,order:2}]},
  {selector:'.hidden',media:[],specificity:[0,1,0],declarations:[{prop:'display',value:'none',important:true,order:3}]},
  {selector:'.item',media:[],specificity:[0,1,0],declarations:[{prop:'display',value:'flex',important:false,order:4},{prop:'opacity',value:'var(--alpha)',important:false,order:5}]},
  {selector:'.item',media:['(max-width: 680px)'],specificity:[0,1,0],declarations:[{prop:'visibility',value:'hidden',important:false,order:6}]}
]};

test('computed style facade re-resolves source cascade, inheritance, inline style and media',()=>{
  let width=844;
  const win={get innerWidth(){return width},innerHeight:390,matchMedia:q=>({matches:q.includes('coarse')})};
  const root=element([':root']),item=element(['.item'],'opacity: 1;',root);
  const facade=createComputedStyleFacade(plan,win);
  let style=facade.getComputedStyle(item);
  assert.equal(style.display,'flex');assert.equal(style.opacity,'1');assert.equal(style.color,'#fff');
  assert.equal(style.getPropertyValue('display'),'flex');assert.equal(style.visibility,'');
  width=640;style=facade.getComputedStyle(item);assert.equal(style.visibility,'hidden');
});

test('computed style reflects class mutations instead of caching stale browser state',()=>{
  const win={innerWidth:844,innerHeight:390,matchMedia:()=>({matches:false})};
  const active=new Set(['.item']);
  const root=element([':root']),item={parentElement:root,getAttribute:()=>'',matches:s=>active.has(s)};
  const facade=createComputedStyleFacade(plan,win);
  assert.equal(facade.getComputedStyle(item).display,'flex');
  active.add('.hidden');
  assert.equal(facade.getComputedStyle(item).display,'none');
});
