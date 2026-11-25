import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
export const digestManifest=entries=>sha256(JSON.stringify(entries));
export function snapshot(root){
  const entries=[];
  function walk(dir,rel=''){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const p=path.join(dir,e.name),name=rel?rel+'/'+e.name:e.name;
      if(e.isSymbolicLink())throw Error('Symlink not allowed: '+name);
      if(e.isDirectory())walk(p,name);
      else if(e.isFile())entries.push({path:name,sha256:sha256(fs.readFileSync(p))});
      else throw Error('Unsupported file: '+name);
    }
  }
  walk(root);
  return entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function assertSnapshot(root,expected,label='Source'){
  const actual=snapshot(root);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(label+' changed: '+root);
  return digestManifest(actual);
}
export function changesBetween(before,after){
  const a=new Map(before.map(x=>[x.path,x.sha256])),b=new Map(after.map(x=>[x.path,x.sha256]));
  return [...new Set([...a.keys(),...b.keys()])].sort().filter(p=>a.get(p)!==b.get(p)).map(p=>({path:p,before:a.get(p)??null,after:b.get(p)??null}));
}
export function assertChanges(before,after,allowed){
  const changes=changesBetween(before,after);
  const actual=changes.map(x=>x.path);
  if(JSON.stringify(actual)!==JSON.stringify([...allowed].sort()))throw Error('Unexpected staged changes: '+JSON.stringify(actual));
  for(const change of changes)if(!change.after)throw Error('Staged file removed: '+change.path);
  return changes;
}
export const within=(base,p)=>{const r=path.relative(base,p);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
// Resolve existing parent symlinks even when the destination has not been created.
export function resolveWrite(p){
  p=path.resolve(p);
  try{return fs.realpathSync(p);}catch(e){if(e.code!=='ENOENT')throw e;}
  const parent=path.dirname(p);
  if(parent===p)throw Error('Cannot resolve destination: '+p);
  return path.join(resolveWrite(parent),path.basename(p));
}
export function assertDisjoint(a,b){
  const aa=resolveWrite(a),bb=resolveWrite(b);
  if(within(aa,bb)||within(bb,aa))throw Error('Source and workspace overlap: '+a+' / '+b);
}
export function checkoutRoot(p){
  for(let q=path.resolve(p);;q=path.dirname(q)){
    if(fs.existsSync(path.join(q,'.git')))return fs.realpathSync(q);
    if(path.dirname(q)===q)return null;
  }
}
