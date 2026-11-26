import test from 'node:test';
import assert from 'node:assert/strict';
import {collect,memberPath,summarize} from '../platforms/wechat/audit/inventory.mjs';
const id=name=>({type:'Identifier',name,loc:{start:{line:4}}});
const member=(object,property,computed=false)=>({type:'MemberExpression',object,property,computed,loc:{start:{line:7}}});
test('member chains preserve exact and dynamic keys',()=>{
  assert.equal(memberPath(member(member(id('window'),id('document')),id('getElementById'))),'window.document.getElementById');
  assert.equal(memberPath(member(id('window'),{type:'Literal',value:'AudioContext'},true)),'window.AudioContext');
  assert.equal(memberPath(member(id('window'),id('key'),true)),'window[*]');
});
test('collect outer paths and avoid counting properties as globals',()=>{
  const ast={type:'Program',body:[member(member(id('window'),id('document')),id('querySelector')),member(id('obj'),id('document')),id('fetch'),member(id('document'),id('key'),true)]};
  const hits=collect(ast,'main.js');
  assert.deepEqual(hits.map(h=>h.api),['window.document.querySelector','fetch','document[*]']);
  assert.equal(hits[0].line,7);
});
test('aggregate counts and cap location samples without hiding totals',()=>{
  const hits=Array.from({length:20},(_,i)=>({api:'document.body',file:'main.js',line:i+1}));
  assert.deepEqual(summarize(hits).map(x=>[x.api,x.count,x.locations.length]),[['document.body',20,12]]);
});
