import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {jsonModuleSource,writeJsonModule,assertWechatEntryRequires} from '../platforms/wechat/runtime/json-module-build.mjs';

test('observed WX-style JS-only resolver rejects old JSON require and accepts actual data module',()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-json-'));
  try{
    const value=JSON.parse('{"schema":1,"rules":[{"selector":".标题","value":"a\\nb"}],"__proto__":{"safe":true}}');
    fs.writeFileSync(path.join(project,'layout-plan.json'),JSON.stringify(value));
    const requireWX=name=>{
      const file=name.endsWith('.js')?name:name+'.js';
      const p=path.join(project,file);
      if(!fs.existsSync(p))throw Error("module '"+file.slice(2)+"' is not defined, require args is '"+name+"'");
      const module={exports:{}};
      vm.runInNewContext(fs.readFileSync(p,'utf8'),{module,require:requireWX});
      return module.exports;
    };
    const entry=name=>"module.exports=require('./"+name+"');";
    fs.writeFileSync(path.join(project,'game.js'),entry('layout-plan.json'));
    assert.throws(()=>requireWX('./game.js'),/layout-plan\.json\.js/);
    assert.throws(()=>assertWechatEntryRequires(project),/existing explicit JS/);
    writeJsonModule(project,'layout-plan.js',value);
    fs.writeFileSync(path.join(project,'game.js'),entry('layout-plan.js'));
    assert.deepEqual(assertWechatEntryRequires(project),['./layout-plan.js']);
    assert.equal(JSON.stringify(requireWX('./game.js')),JSON.stringify(value));
    assert.throws(()=>writeJsonModule(project,'../escape.js',value));
  }finally{fs.rmSync(project,{recursive:true,force:true});}
});
test('data source handles separators and prototype-like own keys without changing data',()=>{
  const value=JSON.parse('{"__proto__":{"x":1},"text":"a\\u2028b\\u2029c"}');
  const source=jsonModuleSource(value),module={exports:null};
  assert.equal(source.includes('\u2028'),false);
  assert.equal(source.includes('\u2029'),false);
  vm.runInNewContext(source,{module});
  assert.equal(JSON.stringify(module.exports),JSON.stringify(value));
});
