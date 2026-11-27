import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaMatches,resolveCascade,expand} from '../platforms/wechat/layout/cascade.mjs';
const env={width:844,height:390,pointer:'coarse'};
test('mobile media features and unsupported conditions',()=>{
  assert.equal(mediaMatches('(max-height: 410px) and (pointer: coarse)',env),true);
  assert.equal(mediaMatches('(max-width: 680px)',env),false);
  assert.equal(mediaMatches('(orientation: landscape)',env),true);
  assert.throws(()=>mediaMatches('(prefers-color-scheme: dark)',env),/Unsupported/);
});
test('important, inline, specificity, declaration order and gap expansion',()=>{
  const rule=(sel,prop,value,important=false,media=[])=>({selectors:[sel],declarations:[{prop,value,important}],media});
  const r=resolveCascade({env,matches:()=>true,specificity:s=>s==='#x'?[1,0,0]:[0,1,0],rules:[
    rule('#x','display','grid'),rule('.x','display','flex'),rule('.x','gap','12px 20px'),rule('.x','column-gap','8px',true),rule('.x','justify-content','space-between'),rule('.x','align-items','center'),
    rule('.x','width','50%',false,['(max-width: 680px)']),rule('.x','display','none',true)
  ],inline:[{prop:'display',value:'block'},{prop:'width',value:'100%'}]});
  assert.deepEqual(r.values,{display:'none','row-gap':'12px','column-gap':'8px','justify-content':'space-between','align-items':'center',width:'100%'});
  assert.equal(r.unsupported.length,0);
});
test('unsupported shorthands fail explicitly, unrelated declarations ignored',()=>{
  assert.throws(()=>expand('grid','auto / 1fr'),/Unsupported/);
  assert.deepEqual(expand('color','red'),[]);
});
