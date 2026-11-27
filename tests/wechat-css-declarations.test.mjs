import test from 'node:test';
import assert from 'node:assert/strict';
import {expandRuntimeDeclaration,parseInlineDeclarations} from '../platforms/wechat/runtime/css-declarations.mjs';

test('runtime CSS expansion covers authored flex/inset/gap/overflow forms and rejects unknown flex shorthand',()=>{
  assert.deepEqual(expandRuntimeDeclaration('flex','1'),[['flex-grow','1'],['flex-shrink','1'],['flex-basis','0%']]);
  assert.deepEqual(expandRuntimeDeclaration('flex','1 1 160px'),[['flex-grow','1'],['flex-shrink','1'],['flex-basis','160px']]);
  assert.deepEqual(expandRuntimeDeclaration('inset','0'),[['top','0'],['right','0'],['bottom','0'],['left','0']]);
  assert.deepEqual(expandRuntimeDeclaration('gap','8px 14px'),[['row-gap','8px'],['column-gap','14px']]);
  assert.deepEqual(expandRuntimeDeclaration('overflow','hidden'),[['overflow-x','hidden'],['overflow-y','hidden']]);
  assert.deepEqual(expandRuntimeDeclaration('grid-column','1 / -1'),[['grid-column','1 / -1']]);
  assert.deepEqual(expandRuntimeDeclaration('grid-row','1 / 3'),[['grid-row','1 / 3']]);
  assert.deepEqual(expandRuntimeDeclaration('white-space','nowrap'),[['white-space','nowrap']]);
  assert.throws(()=>expandRuntimeDeclaration('flex','grow potato'),/Unsupported flex/);
});

test('inline parser preserves parentheses, custom properties and important priority',()=>{
  const out=parseInlineDeclarations("--stage-h: 390px; width: min(340px, 100%); gap: 6px 10px !important; flex: 1 1 0;");
  assert.deepEqual(out,[
    {prop:'--stage-h',value:'390px',important:false},
    {prop:'width',value:'min(340px, 100%)',important:false},
    {prop:'row-gap',value:'6px',important:true},
    {prop:'column-gap',value:'10px',important:true},
    {prop:'flex-grow',value:'1',important:false},
    {prop:'flex-shrink',value:'1',important:false},
    {prop:'flex-basis',value:'0',important:false}
  ]);
});
