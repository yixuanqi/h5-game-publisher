import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePlanStyle,resolvePlanTree} from '../platforms/wechat/runtime/css-plan-runtime.mjs';

function el(matches,style='',children=[]){
  return {
    children,
    matches:s=>matches.includes(s),
    getAttribute:k=>k==='style'?style:null
  };
}
const plan={
  schema:1,
  maxOrder:20,
  rules:[
    {selector:':root',media:[],specificity:[0,1,0],declarations:[{prop:'--gold',value:'#f0c',important:false,order:1},{prop:'font-family',value:'serif',important:false,order:2}]},
    {selector:'.btn',media:[],specificity:[0,1,0],declarations:[{prop:'display',value:'flex',important:false,order:3},{prop:'color',value:'var(--gold)',important:false,order:4},{prop:'width',value:'100px',important:false,order:5}]},
    {selector:'.btn',media:['(max-width: 680px)'],specificity:[0,1,0],declarations:[{prop:'width',value:'80px',important:false,order:6}]},
    {selector:'#primary',media:[],specificity:[1,0,0],declarations:[{prop:'width',value:'120px',important:false,order:7}]},
    {selector:'.btn',media:[],specificity:[0,1,0],declarations:[{prop:'opacity',value:'0.5',important:true,order:8}]}
  ]
};

test('precompiled cascade applies media, specificity, important, inline style and inherited variables',()=>{
  const root=el([':root']),parent=resolvePlanStyle(plan,root,{width:844,height:390,pointer:'coarse'}).values;
  const button=el(['.btn','#primary'],"width: 130px; opacity: 1 !important; --gold: #abc;");
  const r=resolvePlanStyle(plan,button,{width:640,height:390,pointer:'coarse'},parent);
  assert.equal(r.values.display,'flex');assert.equal(r.values.width,'130px');
  assert.equal(r.values.opacity,'1');assert.equal(r.values.color,'#abc');
  assert.equal(r.values['font-family'],'serif');
});

test('runtime media plan changes at mobile threshold and tree resolves inheritance per node',()=>{
  const root=el([':root']),child=el(['.btn']),treeRoot=el([':root'],'',[child]);
  const desktop=resolvePlanStyle(plan,child,{width:844,height:390,pointer:'coarse'},resolvePlanStyle(plan,root,{width:844,height:390,pointer:'coarse'}).values);
  const mobile=resolvePlanStyle(plan,child,{width:640,height:390,pointer:'coarse'},resolvePlanStyle(plan,root,{width:640,height:390,pointer:'coarse'}).values);
  assert.equal(desktop.values.width,'100px');assert.equal(mobile.values.width,'80px');
  const tree=resolvePlanTree(plan,treeRoot,{width:640,height:390,pointer:'coarse'}).tree;
  assert.equal(tree.children[0].style.color,'#f0c');
});

test('unsupported selector engines fail closed in tree resolution',()=>{
  const bad={...plan,rules:[...plan.rules,{selector:':unsupported-pseudo()',media:[],specificity:[0,1,0],declarations:[{prop:'display',value:'none',important:false,order:19}]}]};
  const node={children:[],getAttribute:()=>'',matches:s=>{if(s.includes('unsupported'))throw Error('selector unsupported');return s===':root';}};
  assert.throws(()=>resolvePlanTree(bad,node,{width:800,height:400,pointer:'fine'}),/Unsupported runtime selector/);
});
