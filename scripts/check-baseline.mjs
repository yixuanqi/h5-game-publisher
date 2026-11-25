import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshot,changesBetween} from './source-integrity.mjs';
const commit='d05464e15070a9519b6cbeeec384cc4c9c656953';
const checkout=path.resolve(process.argv[2]||'upstream'),root=process.cwd();
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'h5pub-baseline-'));
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,...opts});if(r.status!==0)throw Error(cmd+' '+args.join(' ')+': '+r.stderr);return r.stdout;}
try{
  fs.mkdirSync(path.join(temp,'scripts'),{recursive:true});
  for(const file of ['scripts/import-blog.mjs','scripts/publisher.mjs','scripts/runtime.js'])fs.writeFileSync(path.join(temp,file),run('git',['show',commit+':'+file]));
  for(const id of ['ashen-bell-vow','curio-box']){
    const source=path.join(temp,'games',id);
    run(process.execPath,[path.join(temp,'scripts/import-blog.mjs'),id,checkout,source]);
    run(process.execPath,[path.join(temp,'scripts/publisher.mjs'),'prepare',path.join(root,'configs',id+'.json'),source]);
    // Previous importer included build-only provenance in the web payload. It is intentionally excluded now.
    const before=snapshot(path.join(temp,'.work',id,'www')).filter(f=>f.path!=='publisher-source.json');
    const after=snapshot(path.join(root,'.work',id,'www'));
    assert.deepEqual(changesBetween(before,after),[],id+' runtime payload differs from green baseline');
    console.log('Baseline runtime payload byte-identical: '+id+' ('+after.length+' files; excludes legacy provenance metadata)');
  }
}finally{fs.rmSync(temp,{recursive:true,force:true});}
