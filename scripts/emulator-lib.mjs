import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function findApk(root, id) {
  const found=[];
  function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name);
    if(e.isSymbolicLink()) throw Error('Unexpected symlink: '+p);
    if(e.isDirectory())walk(p);
    else if(e.isFile()&&e.name.endsWith('.apk'))found.push(p);
  }}
  walk(root);
  if(found.length!==1 || path.basename(found[0])!==id+'-debug.apk')throw Error('Expected exactly one matching debug APK');
  return found[0];
}
export function verifyArtifact(apk,c){
  const hash=createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
  const checksum=fs.readFileSync(apk+'.sha256','utf8').trim().split(/\s+/)[0];
  if(hash!==checksum)throw Error('APK SHA256 mismatch');
  const info=JSON.parse(fs.readFileSync(path.join(path.dirname(apk),'build-info.json'),'utf8'));
  for(const key of ['id','appId','versionCode','versionName'])if(info[key]!==c[key])throw Error('Build info mismatch: '+key);
  return {hash,info};
}
export function verifyBadging(badging,c){
  const line=badging.split(/\r?\n/).find(l=>l.startsWith('package: '))||'';
  for(const [key,value] of Object.entries({name:c.appId,versionCode:c.versionCode,versionName:c.versionName})){
    const actual=line.match(new RegExp("\\b"+key+"='([^']*)'"))?.[1];
    if(actual!==String(value))throw Error('APK metadata mismatch: '+key+'='+actual);
  }
}
export function classifyFaults(log,pkg){
  // logcat crash buffer is cleared before install, on an isolated emulator.
  return log.split(/\r?\n/).filter(l=>l.includes('Process: '+pkg+',')||l.includes('ANR in '+pkg+' ')||l.includes('ANR in '+pkg+' (')||l.includes('>>> '+pkg+' <<<')||(l.includes('Killing ')&&l.includes(':'+pkg+'/')&&l.includes('depends on provider')));
}
export const visible=(id)=>'(()=>{const e=document.getElementById('+JSON.stringify(id)+');if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.disabled&&r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none"&&e.getClientRects().length>0&&!!e.closest("body")&&(!e.closest(".hidden"));})()';

export function auditResources(snapshots,requests,id){
  const entry=id==='demo'?'/game.js':'/src/main.js';
  const local=u=>/^(https?:\/\/localhost(?:[:/]|$)|data:|blob:|about:)/i.test(u);
  if(!snapshots.length)throw Error('No resource snapshots');
  for(const s of snapshots){
    if(!/^https?:\/\/localhost(?:[:/]|$)/i.test(s.url)||!Array.isArray(s.resources))throw Error('Missing local document evidence: '+s.phase);
    const paths=s.resources.filter(u=>/^https?:\/\/localhost(?:[:/]|$)/i.test(u)).map(u=>new URL(u).pathname);
    for(const required of ['/__publisher/runtime.js',entry])if(!paths.includes(required))throw Error('Missing resource '+required+' in '+s.phase);
  }
  const urls=[...snapshots.flatMap(s=>[s.url,...s.resources]),...requests];
  const external=[...new Set(urls.filter(u=>!local(u)))];
  if(external.length)throw Error('External WebView resources: '+external.join(', '));
  return {snapshots:snapshots.length,observedUrls:[...new Set(urls)].length,cdpRequests:requests.length};
}

/** Native log is used only to synchronize the background phase, not as a substitute for JS delivery. */
export function countNativePause(log,pid){
  if(!/^\d+$/.test(pid))throw Error('Expected one numeric application PID');
  return log.split(/\r?\n/).filter(line=>{
    const m=line.match(/^\S+\s+\S+\s+(\d+)\s+\d+\s+[VDIWEF]\s+Capacitor\/AppPlugin:\s+Notifying listeners for event pause\s*$/);
    return m?.[1]===pid;
  }).length;
}
export function lifecycleRoundTripComplete(before,after){
  if(!before||!after||before.paused!==false||after.paused!==false||
    after.visible!==true||after.nativeActive!==true||after.nativeResumed!==true||after.pageActive!==true)return false;
  return ['nativePauses','nativeResumes','pauses','resumes'].every(k=>
    Number.isSafeInteger(before[k])&&Number.isSafeInteger(after[k])&&before[k]>=0&&after[k]>before[k]);
}
