import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom/worker';
import {classifyPseudoElement} from '../platforms/wechat/original-entry/pseudo-element-policy.mjs';
import {compileRuntimeCssPlan} from '../platforms/wechat/original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../platforms/wechat/runtime/css-plan-runtime.mjs';

test('generated scrollbar boxes never enter real DOM cascade; preserve paint declarations',()=>{
 const css='.panel{width:120px} .panel::-webkit-scrollbar{width:7px;height:7px} .panel::-webkit-scrollbar-track{margin:10px 0} .panel::-webkit-scrollbar-thumb{border:1px solid red} .panel::-webkit-scrollbar-thumb:hover{background:blue} .panel::-webkit-scrollbar-corner{background:transparent}';
 const plan=compileRuntimeCssPlan(css);
 assert.equal(plan.rules.length,1);
 assert.equal(plan.skippedPseudoElements.length,5);
 assert.equal(plan.deferredPseudoRules.length,5);
 assert.deepEqual(plan.deferredPseudoRules[0].declarations,[{prop:'width',value:'7px',important:false},{prop:'height',value:'7px',important:false}]);
 const {document}=parseHTML('<html><body><div class="panel"></div></body></html>');
 const el=document.querySelector('.panel');
 const resolved=resolvePlanStyle(plan,el,{width:844,height:390,pointer:'coarse'});
 assert.deepEqual(resolved.unsupportedSelectors,[]);
 assert.equal(resolved.values.width,'120px');
 assert.equal(resolved.values.height,undefined);
});
test('mixed selectors and media keep real rules; legacy and double-colon generated boxes defer',()=>{
 const plan=compileRuntimeCssPlan('@media (max-width: 700px){.panel,.panel::before,.panel:after{width:15px !important}}');
 assert.equal(plan.rules.length,1);
 assert.equal(plan.rules[0].selector,'.panel');
 assert.equal(plan.deferredPseudoRules.length,2);
 assert.deepEqual(plan.deferredPseudoRules[0].media,['(max-width: 700px)']);
 assert.equal(plan.deferredPseudoRules[0].declarations[0].important,true);
});
test('attribute literals and ordinary structural or state pseudo-classes are not deferred',()=>{
 for(const selector of ['[data-text="::before"]','.panel:hover:not(:disabled)','.panel:first-child','.panel:not([title="::-webkit-scrollbar"])',String.raw`.literal\:\:before`]){
  assert.equal(classifyPseudoElement(selector),null,selector);
 }
});
test('unknown or nested generated selectors fail closed',()=>{
 for(const selector of ['.panel::unknown','.panel:not(::before)','.panel::before::after']){
  assert.throws(()=>compileRuntimeCssPlan(selector+'{width:1px}'),/Unsupported pseudo-element selector/);
 }
});
test('unhandled real selector errors remain visible',()=>{
 const plan={schema:1,rules:[{selector:'.unsupported:made-up',media:[],specificity:[0,2,0],declarations:[{prop:'width',value:'2px',order:1}]}],maxOrder:1};
 const el={matches(){throw Error('matcher rejected selector');},getAttribute(){return null;}};
 assert.deepEqual(resolvePlanStyle(plan,el,{width:844,height:390,pointer:'coarse'}).unsupportedSelectors,[{selector:'.unsupported:made-up',error:'Error: matcher rejected selector'}]);
});
