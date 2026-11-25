import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,within} from '../../scripts/source-integrity.mjs';
import {policy,assertReleaseIdentity,readApprovedLock,comparePackagedAssets} from './quality.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function runJava(args){
  const exe=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin','java'+(process.platform==='win32'?'.exe':'')):'java';
  const r=spawnSync(exe,args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(r.error||r.status!==0)throw Error('Java validation failed: '+(r.error?.message||r.stderr||r.stdout));
  return r.stdout;
}
export function validateAab(input,c,jarPath,{writeReport=true}={}){
  const requested=path.resolve(input);
  if(!fs.lstatSync(requested).isFile())throw Error('Expected regular AAB');
  const aab=fs.realpathSync(requested),dist=fs.realpathSync(path.join(root,'dist'));
  if(!within(dist,aab)||!aab.endsWith('.aab'))throw Error('Expected publisher AAB in dist/');
  const jar=fs.realpathSync(jarPath);
  if(sha256(fs.readFileSync(jar))!==policy.bundletool.sha256)throw Error('Bundletool SHA256 mismatch');
  assertReleaseIdentity(c);
  const reportPath=aab+'.validation.json';
  if(writeReport){
    try{const st=fs.lstatSync(reportPath);if(!st.isFile())throw Error('Invalid validation report destination');fs.unlinkSync(reportPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const hash=sha256(fs.readFileSync(aab));
  if(fs.readFileSync(aab+'.sha256','utf8').trim().split(/\s+/)[0]!==hash)throw Error('AAB SHA256 mismatch');
  const dir=path.dirname(aab),info=JSON.parse(fs.readFileSync(path.join(dir,'build-info.json'),'utf8'));
  for(const k of ['id','appId','versionCode','versionName'])if(info[k]!==c[k])throw Error('Artifact/config mismatch: '+k);
  if(path.basename(dir)!==c.versionCode+'-'+c.versionName||!path.basename(aab).startsWith(c.id+'-'))throw Error('Artifact path/version mismatch');
  const lock=readApprovedLock(path.join(dir,'package-lock.json'));
  if(info.dependencyLock?.fileSha256!==lock.fileSha256||info.dependencyLock?.normalizedSha256!==lock.normalizedSha256)throw Error('Artifact dependency lock provenance mismatch');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'h5-bundle-verify-'));
  try{
    const validation=runJava(['-jar',jar,'validate','--bundle='+aab]);
    const xml=runJava(['-jar',jar,'dump','manifest','--bundle='+aab,'--module=base']);
    const manifest=path.join(temp,'manifest.xml');fs.writeFileSync(manifest,xml);
    const evidence=runJava([path.join(root,'platforms','android','InspectRelease.java'),aab,manifest,c.appId,String(c.versionCode),c.versionName,c.orientation,String(policy.minTargetSdk),String(policy.maxMinSdk)]);
    const lines=evidence.trim().split(/\r?\n/).map(l=>l.split('\t'));
    const sdk=lines.find(l=>l[0]==='SDK');if(!sdk)throw Error('Missing SDK evidence');
    const actual=lines.filter(l=>l[0]==='ASSET').map(l=>({path:l[1],sha256:l[2]}));
    const assets=comparePackagedAssets(info.stagedFiles,actual);
    if(sha256(fs.readFileSync(aab))!==hash)throw Error('AAB changed during validation');
    const report={status:'passed',artifact:path.basename(aab),sha256:hash,id:c.id,appId:c.appId,versionCode:c.versionCode,versionName:c.versionName,frameworkCommit:info.framework?.commit??null,sourceCommit:info.source?.commit??null,bundletool:policy.bundletool.version,bundletoolSha256:policy.bundletool.sha256,dependencyLock:lock,minSdk:Number(sdk[1]),targetSdk:Number(sdk[2]),orientation:c.orientation,debuggable:false,testOnly:false,permissions:lines.filter(l=>l[0]==='PERMISSION').map(l=>l[1]).sort(),assets,manifest:xml,structureOutput:validation.trim(),playConsole:'not checked',signature:'separate verification required'};
    if(writeReport)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('AAB structure, release manifest and '+assets.stagedFiles+' staged resources verified: '+path.basename(aab));
    return report;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [aab,cfg,jar]=process.argv.slice(2);
    if(!aab||!cfg||!jar)throw Error('Usage: node platforms/android/validate-aab.mjs <aab> <config.json> <bundletool.jar>');
    validateAab(aab,JSON.parse(fs.readFileSync(cfg,'utf8')),jar);
  }catch(e){console.error(e.message);process.exitCode=1;}
}
