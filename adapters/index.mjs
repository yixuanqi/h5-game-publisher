import fs from 'node:fs';
import path from 'node:path';
import {sha256,gitBlob} from '../scripts/source-integrity.mjs';
import {adapt as ashen} from './ashen-bell-vow/adapter.mjs';
import {adapt as curio} from './curio-box/adapter.mjs';
const registry=Object.freeze({'ashen-bell-vow':ashen,'curio-box':curio});
export function hasAdapter(id){return id==='none'||Object.hasOwn(registry,id);}
export function adaptMain(id,s){
  if(!Object.hasOwn(registry,id))throw Error('Unknown game adapter: '+id);
  return registry[id](s);
}
export function planAdapter(id,input,gameId){
  if(!hasAdapter(id))throw Error('Unknown adapter: '+id);
  if(id==='none')return {identity:{id:'none',version:null},patch:null,allowed:[]};
  if(id!==gameId)throw Error('Adapter/game mismatch: '+id+' / '+gameId);
  const directory=new URL('./'+id+'/',import.meta.url);
  const raw=fs.readFileSync(new URL('compatibility.json',directory));
  const meta=JSON.parse(raw);
  const main=fs.readFileSync(path.join(input,'src','main.js'));
  const blob=gitBlob(main);
  if(meta.id!==id||!meta.approvedMainGitBlobs.includes(blob))throw Error('Unreviewed game entry for '+id+' (Git blob '+blob+'); review adapter compatibility before release');
  if(JSON.stringify(meta.allowedChanges)!==JSON.stringify(['src/main.js']))throw Error('Invalid adapter allowlist: '+id);
  return {identity:{id,version:meta.version,baselineSourceCommit:meta.baselineSourceCommit,mainGitBlob:blob,compatibilitySha256:sha256(raw),implementationSha256:sha256(fs.readFileSync(new URL('adapter.mjs',directory))),commonSha256:sha256(fs.readFileSync(new URL('./common/patch.mjs',import.meta.url)))},patch:adaptMain(id,main.toString('utf8')),allowed:meta.allowedChanges};
}
