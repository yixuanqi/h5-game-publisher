import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {stageNodeProject}=require('../platforms/wechat/canvas-diagnostic/node-project.cjs');
test('generated CommonJS .js and JSON run outside publisher ESM scope without changing the package',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'h5publisher-esm-red-'));
  let staged;
  try{
    const project=path.join(root,'project');
    fs.mkdirSync(project);fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
    const game="const host=require('./host.js');\nmodule.exports=host;\n";
    fs.writeFileSync(path.join(project,'game.js'),game);
    fs.writeFileSync(path.join(project,'host.js'),"module.exports=require('./world.json').value;\n");
    fs.writeFileSync(path.join(project,'world.json'),'{"value":42}');
    assert.throws(()=>require(path.join(project,'game.js')),/require is not defined|ERR_REQUIRE_ESM|require\(\) of ES Module/i);
    staged=stageNodeProject(project);
    assert.equal(require(path.join(staged.project,'game.js')),42);
    assert.equal(fs.existsSync(path.join(project,'package.json')),false);
    assert.equal(fs.readFileSync(path.join(project,'game.js'),'utf8'),game);
    assert.equal(fs.readFileSync(path.join(project,'world.json'),'utf8'),'{"value":42}');
    staged.cleanup();assert.equal(fs.existsSync(staged.project),false);
  }finally{staged?.cleanup();fs.rmSync(root,{recursive:true,force:true});}
});
