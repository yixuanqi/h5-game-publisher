import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {snapshot,assertSnapshot,digestManifest,assertChanges,assertDisjoint,gitBlob} from '../scripts/source-integrity.mjs';
import {exportGame} from '../scripts/import-blog.mjs';
import {prepare,validate} from '../scripts/publisher.mjs';
import {planAdapter,adaptMain} from '../adapters/index.mjs';
const demo=JSON.parse(fs.readFileSync(new URL('../configs/demo.json',import.meta.url)));
function fixture(t){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'h5-isolation-'));
  t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
  const src=path.join(d,'input');fs.mkdirSync(src);
  fs.writeFileSync(path.join(src,'index.html'),'<html><head></head><body>raw</body></html>');
  const cfg=path.join(d,'config.json');fs.writeFileSync(cfg,JSON.stringify({...demo,source:'input'}));
  return {d,src,cfg,work:path.join(d,'work')};
}
test('source guard detects changed, removed and added files; deterministic order',t=>{
  const {src}=fixture(t),before=snapshot(src);
  fs.writeFileSync(path.join(src,'a.js'),'a');assert.throws(()=>assertSnapshot(src,before),/changed/);
  fs.unlinkSync(path.join(src,'a.js'));assert.equal(assertSnapshot(src,before),digestManifest(before));
  fs.writeFileSync(path.join(src,'index.html'),'changed');assert.throws(()=>assertSnapshot(src,before),/changed/);
  fs.unlinkSync(path.join(src,'index.html'));assert.throws(()=>assertSnapshot(src,before),/changed/);
  assert.equal(gitBlob(Buffer.from('test\n')),'9daeafb9864cf43055ae93beb0afd6c7d144bfa4');
});
test('workspace allows only exact declared platform modifications',t=>{
  const {src,cfg,work}=fixture(t),before=snapshot(src);
  const p=prepare(cfg,null,work),info=JSON.parse(fs.readFileSync(path.join(p.work,'build-info.json')));
  assert.deepEqual(snapshot(src),before);assert.deepEqual(info.sourceFiles,before);
  assert.equal(info.schemaVersion,2);assert.equal(info.frameworkVersion,'0.3.3');
  assert.equal(info.source.commit,null);assert.equal(info.adapter.id,'none');
  assert.deepEqual(info.changes.map(x=>x.path),['__publisher/runtime.js','index.html']);
  assert.equal(info.stagedFilesSha256,digestManifest(snapshot(p.web)));
  fs.writeFileSync(path.join(p.web,'unexpected.js'),'x');
  assert.throws(()=>assertChanges(before,snapshot(p.web),['__publisher/runtime.js','index.html']),/Unexpected staged changes/);
  fs.writeFileSync(path.join(src,'new.js'),'x');assert.throws(p.verifySource,/Game source changed/);
});
test('provenance sidecar verified, never included in runtime payload',t=>{
  const {src,cfg,work}=fixture(t),files=snapshot(src);
  const sidecar=src+'.publisher-source.json';
  fs.writeFileSync(sidecar,JSON.stringify({id:'demo',repository:'example/game',commit:'a'.repeat(40),sourceTreeSha256:digestManifest(files),sourceFiles:files,sourceFilesSha256:digestManifest(files)}));
  const p=prepare(cfg,null,work),info=JSON.parse(fs.readFileSync(path.join(p.work,'build-info.json')));
  assert.equal(info.source.commit,'a'.repeat(40));assert.ok(!fs.existsSync(path.join(p.web,'publisher-source.json')));
  fs.writeFileSync(path.join(src,'extra.js'),'x');assert.throws(()=>prepare(cfg,null,work),/provenance mismatch/);
});
test('adapter is explicit, unknown or mismatched adapters reject, changed game entry fails closed',t=>{
  const {src}=fixture(t);fs.mkdirSync(path.join(src,'src'));fs.writeFileSync(path.join(src,'src','main.js'),"  window.addEventListener('pagehide', handleAppHide);");
  assert.throws(()=>validate({...demo,adapter:'unknown'}),/Invalid adapter/);
  assert.throws(()=>validate({...demo,adapter:'curio-box'}),/Invalid adapter/);
  assert.throws(()=>planAdapter('curio-box',src,'curio-box'),/Unreviewed game entry/);
  assert.match(adaptMain('curio-box',fs.readFileSync(path.join(src,'src','main.js'),'utf8')),/h5publisher:pause/);
});
test('destination cannot overlap source checkout or resolve through a symlink to source',t=>{
  const {d,src,cfg}=fixture(t);const checkout=path.join(d,'upstream');fs.mkdirSync(path.join(checkout,'docs','curio-box'),{recursive:true});
  assert.throws(()=>exportGame('curio-box',checkout,path.join(checkout,'output')),/overlap/);
  assert.throws(()=>assertDisjoint(src,path.join(src,'nested')),/overlap/);
  const linked=path.join(d,'link');
  fs.symlinkSync(src,linked,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>prepare(cfg,null,linked),/overlap/);
  assert.deepEqual(snapshot(src).map(x=>x.path),['index.html']);
});
