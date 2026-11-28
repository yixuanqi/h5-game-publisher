import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom/worker';
import {compileRuntimeCssPlan} from '../platforms/wechat/original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../platforms/wechat/runtime/css-plan-runtime.mjs';

test('CSS plan preserves strictly increasing declaration source order',()=>{
 const plan=compileRuntimeCssPlan('.x{padding:1px; width:10px} .x{width:20px} @media (max-width: 700px){.x{width:30px}}');
 const all=plan.rules.flatMap(r=>r.declarations);
 assert.deepEqual(all.map(d=>d.order),Array.from({length:all.length},(_,i)=>i+1));
 assert.equal(plan.maxOrder,all.length);
 const {document}=parseHTML('<html><body><div class="x"></div></body></html>');
 const el=document.querySelector('.x');
 assert.equal(resolvePlanStyle(plan,el,{width:640,height:360,pointer:'coarse'}).values.width,'30px');
 assert.equal(resolvePlanStyle(plan,el,{width:844,height:390,pointer:'coarse'}).values.width,'20px');
});
test('grid shorthand/longhand cascade, explicit rows, order and inline placement',()=>{
 const plan=compileRuntimeCssPlan('.x{grid-column:1 / -1;grid-column-end:3;grid-row:2;grid-template-rows:auto 1fr;order:2;aspect-ratio:16 / 10}.x{grid-column:2}');
 const {document}=parseHTML('<html><body><div class="x" style="grid-row:1 / 3"></div></body></html>');
 const {values}=resolvePlanStyle(plan,document.querySelector('.x'),{width:844,height:390,pointer:'coarse'});
 assert.equal(values['grid-column-start'],'2');assert.equal(values['grid-column-end'],'auto');
 assert.equal(values['grid-row-start'],'1');assert.equal(values['grid-row-end'],'3');
 assert.equal(values['grid-template-rows'],'auto 1fr');assert.equal(values.order,'2');assert.equal(values['aspect-ratio'],'16 / 10');
 assert.throws(()=>compileRuntimeCssPlan('.x{grid-column:1 / / 2}'),/Unsupported grid placement/);
 assert.throws(()=>compileRuntimeCssPlan('.x{grid-row:0}'),/Unsupported grid placement/);
});
