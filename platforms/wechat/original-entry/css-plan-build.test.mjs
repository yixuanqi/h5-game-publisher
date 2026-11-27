import test from 'node:test';
import assert from 'node:assert/strict';
import {compileRuntimeCssPlan} from './css-plan-build.mjs';

test('CSS compiler precomputes cascade metadata and expands authored shorthands',()=>{
  const css=':root { --gap: 8px; }\n.row { display:flex; gap: var(--gap); flex:1 1 160px; inset:0; }\n@media (max-width: 680px) { .row { gap: 4px !important; } }\n.row::before { content:"x"; }';
  const plan=compileRuntimeCssPlan(css);
  assert.equal(plan.schema,1);assert.ok(plan.maxOrder>0);
  const row=plan.rules.find(r=>r.selector==='.row'&&r.media.length===0);
  assert.deepEqual(row.specificity,[0,1,0]);
  const props=Object.fromEntries(row.declarations.map(d=>[d.prop,d.value]));
  assert.equal(props.display,'flex');assert.equal(props['flex-grow'],'1');assert.equal(props['flex-shrink'],'1');assert.equal(props['flex-basis'],'160px');
  assert.equal(props.top,'0');assert.equal(props.right,'0');assert.equal(props.bottom,'0');assert.equal(props.left,'0');
  assert.deepEqual(plan.skippedPseudoElements,['.row::before']);
  const media=plan.rules.find(r=>r.media.length);assert.deepEqual(media.media,['(max-width: 680px)']);assert.equal(media.declarations.some(d=>d.important),true);
});

test('unsupported runtime-relevant flex shorthand fails at build time',()=>{
  assert.throws(()=>compileRuntimeCssPlan('.x{flex: grow potato;}'),/Unsupported flex/);
});


test('each expanded declaration has a strictly increasing source order across media rules',()=>{
  const plan=compileRuntimeCssPlan('.a{gap:4px;color:red!important}@media(max-width:500px){.a{color:blue}}');
  const all=plan.rules.flatMap(r=>r.declarations);
  assert.deepEqual(all.map(d=>d.order),[1,2,3,4]);
  assert.equal(plan.maxOrder,4);
  assert.equal(all[2].important,true);
  assert.equal(all[3].value,'blue');
});
