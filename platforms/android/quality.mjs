import fs from 'node:fs';
import path from 'node:path';
import {sha256} from '../../scripts/source-integrity.mjs';
export const policy=JSON.parse(fs.readFileSync(new URL('./quality-policy.json',import.meta.url)));
export const registry=JSON.parse(fs.readFileSync(new URL('./release-registry.json',import.meta.url)));
const own=(o,k)=>Object.hasOwn(o,k);
export function assertReleaseIdentity(c,{upload=false}={}){
  const games=registry.games;
  for(const [id,r] of Object.entries(games))if(id!==c.id&&r.appId===c.appId)throw Error('Package ID belongs to '+id);
  if(!own(games,c.id)){if(upload)throw Error('Game is not enrolled in release registry');return;}
  const r=games[c.id];
  if(c.appId!==r.appId)throw Error('Registered package ID cannot change');
  if(c.versionCode<r.baselineVersionCode)throw Error('Version code below registered baseline');
  if(c.versionCode===r.baselineVersionCode&&c.versionName!==r.baselineVersionName)throw Error('Registered version code/name mismatch');
  if(upload){
    if(!r.allowUpload)throw Error('Game is not eligible for upload signing');
    if(r.lastUploadedVersionCode!==null&&c.versionCode<=r.lastUploadedVersionCode)throw Error('Version code must exceed last recorded upload');
  }
}
function canonical(x){
  return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
}
export function normalizedLock(lock){
  if(!lock||lock.lockfileVersion!==3||!lock.packages?.[''])throw Error('Expected npm lockfile v3');
  const copy=JSON.parse(JSON.stringify(lock));
  copy.name='h5-publisher-android';copy.packages[''].name=copy.name;
  return canonical(copy);
}
export function lockIdentity(lock){
  const normalized=normalizedLock(lock);
  const actual=sha256(JSON.stringify(normalized)),count=Object.keys(normalized.packages).length;
  if(actual!==policy.dependencyLock.normalizedSha256||count!==policy.dependencyLock.packageCount)throw Error('Android dependency lock drift: '+actual+' ('+count+' entries). Review and explicitly update the approved lock policy.');
  return {normalizedSha256:actual,packageCount:count,lockfileVersion:lock.lockfileVersion};
}
export function readApprovedLock(filename){
  const raw=fs.readFileSync(filename),lock=JSON.parse(raw);
  return {...lockIdentity(lock),fileSha256:sha256(raw)};
}
export function importApprovedLock(filename,dest,gameId){
  const lock=JSON.parse(fs.readFileSync(filename,'utf8'));lockIdentity(lock);
  lock.name=gameId;lock.packages[''].name=gameId;
  fs.writeFileSync(dest,JSON.stringify(lock,null,2)+'\n');
}
export function comparePackagedAssets(staged,actual){
  if(!Array.isArray(staged)||!Array.isArray(actual)||!staged.length)throw Error('Missing staged or packaged resource manifest');
  const a=new Map(),b=new Map();
  for(const e of staged){if(a.has(e.path))throw Error('Duplicate staged resource');a.set(e.path,e.sha256);}
  for(const e of actual){if(b.has(e.path))throw Error('Duplicate packaged resource');b.set(e.path,e.sha256);}
  for(const [p,h] of a)if(b.get(p)!==h)throw Error('Packaged asset missing or modified: '+p);
  const empty=sha256(Buffer.alloc(0)),generated=[];
  for(const [p,h] of b)if(!a.has(p)){
    if(!['cordova.js','cordova_plugins.js'].includes(p)||h!==empty)throw Error('Unexpected packaged asset: '+p);
    generated.push(p);
  }
  return {stagedFiles:a.size,packagedFiles:b.size,generatedEmptyFiles:generated.sort()};
}
