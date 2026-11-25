import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshot,digestManifest,assertSnapshot} from './source-integrity.mjs';
const [checkoutArg,...ids]=process.argv.slice(2);
if(!checkoutArg||!ids.length)throw Error('Usage: node scripts/verify-upstream.mjs upstream <game ids>');
const checkout=path.resolve(checkoutArg);
function git(args){const r=spawnSync('git',args,{cwd:checkout,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const head=git(['rev-parse','HEAD']);
for(const id of ids){
  if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('Invalid game id');
  const copy=path.resolve('games',id);
  const meta=JSON.parse(fs.readFileSync(copy+'.publisher-source.json','utf8'));
  assert.equal(meta.id,id);assert.equal(meta.commit,head);
  assert.equal(git(['status','--porcelain','--untracked-files=all','--','docs/'+id]),'','Upstream working tree changed');
  assert.equal(digestManifest(snapshot(path.join(checkout,'docs',id))),meta.sourceTreeSha256,'Original source SHA256 changed');
  assertSnapshot(copy,meta.sourceFiles,'Raw game export');
  const info=JSON.parse(fs.readFileSync(path.resolve('.work',id,'build-info.json'),'utf8'));
  assert.equal(info.source.commit,head);assert.equal(info.sourceFilesSha256,meta.sourceFilesSha256);
  assert.equal(info.source.originalTreeSha256,meta.sourceTreeSha256);
  assert.equal(info.framework.commit,process.env.GITHUB_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim());
  console.log('Source isolation verified: '+id+' @ '+head+' SHA256 '+meta.sourceTreeSha256);
}
