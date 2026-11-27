import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayoutRequirements,assessLayoutBackend,FLOAT_PIGMENT_0105_CAPABILITIES,TAFFY_0160_DECLARED_CAPABILITIES} from './layout-requirements.mjs';

const plan={schema:1,rules:[
  {selector:'.desktop',media:[],declarations:[
    {prop:'display',value:'flex'},
    {prop:'flex-wrap',value:'wrap'},
    {prop:'position',value:'absolute'},
    {prop:'aspect-ratio',value:'16 / 10'},
    {prop:'order',value:'2'}
  ]},
  {selector:'body.is-mobile .title-hero-column',media:['(max-height: 560px)'],declarations:[
    {prop:'display',value:'grid'},
    {prop:'grid-template-columns',value:'minmax(0, 1.04fr) minmax(248px, 0.96fr)'},
    {prop:'grid-column',value:'1 / -1'},
    {prop:'max-height',value:'calc(100% - 20px)'}
  ]},
  {selector:'.cards',media:[],declarations:[
    {prop:'display',value:'grid'},
    {prop:'grid-template-columns',value:'repeat(auto-fit, minmax(150px, 1fr))'}
  ]}
]};

test('layout requirement audit identifies the mobile title blockers instead of normalizing them away',()=>{
  const r=analyzeLayoutRequirements(plan);
  assert.equal(r.requiresFullGrid,true);
  assert.equal(r.features.flex.count,1);
  assert.equal(r.features.grid.count,2);
  assert.equal(r.features.gridNonzeroMinmax.count,2);
  assert.equal(r.features.gridPlacement.count,1);
  assert.equal(r.features.gridAutoRepeat.count,1);
  assert.equal(r.features.calc.count,1);
  assert.equal(r.features.absolutePosition.count,1);
  assert.equal(r.features.aspectRatio.count,1);assert.equal(r.features.order.count,1);
  assert.ok(r.features.gridNonzeroMinmax.examples.some(x=>x.selector.includes('title-hero-column')));
});

test('backend assessment rejects float-pigment 0.10.5 for full source plan and keeps Taffy as unproven declared candidate',()=>{
  const requirements=analyzeLayoutRequirements(plan);
  const fp=assessLayoutBackend(requirements,FLOAT_PIGMENT_0105_CAPABILITIES);
  assert.equal(fp.compatible,false);
  for(const feature of ['gridNonzeroMinmax','gridAutoRepeat','gridPlacement','calc','aspectRatio','order'])assert.ok(fp.missing.includes(feature));
  assert.equal(fp.missing.includes('gridMinmax'),false);assert.equal(fp.missing.includes('gridRepeat'),false);

  const taffy=assessLayoutBackend(requirements,TAFFY_0160_DECLARED_CAPABILITIES);
  assert.equal(taffy.compatible,true);
  assert.deepEqual(taffy.missing,[]);
});
