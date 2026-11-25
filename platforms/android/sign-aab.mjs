import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,within} from '../../scripts/source-integrity.mjs';
import {assertReleaseIdentity} from './quality.mjs';
import {validateAab} from './validate-aab.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function required(env,k){if(!env[k])throw Error('Missing '+k);return env[k];}
export function signingOptions(env){
  const mode=required(env,'H5_SIGNING_MODE');
  if(!['test','upload'].includes(mode))throw Error('Explicit test or upload signing mode required');
  const pin=required(env,'H5_UPLOAD_CERT_SHA256').replace(/:/g,'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(pin))throw Error('Invalid upload certificate SHA256');
  const alias=required(env,'H5_KEY_ALIAS');
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(alias))throw Error('Invalid key alias');
  required(env,'H5_STORE_PASSWORD');required(env,'H5_KEY_PASSWORD');
  return {mode,pin,alias,keystore:required(env,'H5_KEYSTORE')};
}
function invoke(exe,args,env){
  const bin=env.JAVA_HOME?path.join(env.JAVA_HOME,'bin',exe+(process.platform==='win32'?'.exe':'')):exe;
  const r=spawnSync(bin,args,{env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  if(r.error||r.status!==0)throw Error(exe+' failed (exit '+r.status+'): '+(r.error?.message||r.stderr||r.stdout).replaceAll(env.H5_STORE_PASSWORD,'[redacted]').replaceAll(env.H5_KEY_PASSWORD,'[redacted]'));
  return r.stdout.trim();
}
function fresh(p){try{fs.lstatSync(p);throw Error('Output already exists: '+p);}catch(e){if(e.code!=='ENOENT')throw e;}}
export function signAab(input,env=process.env){
  const o=signingOptions(env);
  const requested=path.resolve(input);
  if(!fs.lstatSync(requested).isFile())throw Error('Expected regular unsigned AAB');
  const src=fs.realpathSync(requested);
  const dist=fs.realpathSync(path.join(root,'dist'));
  if(!within(dist,src)||!src.endsWith('-unsigned.aab'))throw Error('Input must be a publisher unsigned AAB inside dist/');
  const key=fs.realpathSync(o.keystore);
  if(!fs.statSync(key).isFile()||within(root,key))throw Error('Keystore must be a regular file outside publisher checkout');
  const before=sha256(fs.readFileSync(src)),claimed=fs.readFileSync(src+'.sha256','utf8').trim().split(/\s+/)[0];
  if(before!==claimed)throw Error('Unsigned AAB SHA256 mismatch');
  const info=JSON.parse(fs.readFileSync(path.join(path.dirname(src),'build-info.json'),'utf8'));
  if(path.basename(src)!==info.id+'-unsigned.aab'||path.basename(path.dirname(src))!==info.versionCode+'-'+info.versionName)throw Error('Build metadata does not match artifact path');
  if(o.mode==='upload'&&(!info.framework?.commit||info.framework.dirty!==false||!info.source?.commit))throw Error('Upload signing requires clean framework and recorded source commit');
  let releaseConfig=null,bundletool=null;
  if(o.mode==='upload'){
    if(!/^[a-z][a-z0-9-]{0,49}$/.test(info.id))throw Error('Invalid registered game ID');
    releaseConfig=JSON.parse(fs.readFileSync(path.join(root,'configs',info.id+'.json'),'utf8'));
    assertReleaseIdentity(releaseConfig,{upload:true});
    bundletool=required(env,'H5_BUNDLETOOL_JAR');
    validateAab(src,releaseConfig,bundletool,{writeReport:false});
  }
  const dest=src.replace(/-unsigned\.aab$/,o.mode==='test'?'-test-signed.aab':'-upload-signed.aab');
  const report=dest+'.signing.json',sum=dest+'.sha256';
  for(const f of [dest,report,sum])fresh(f);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'h5-aab-sign-'));
  const written=[];
  try{
    const signed=path.join(temp,'signed.aab');
    // JDK passwords are passed by environment variable name, never as command-line values.
    invoke('jarsigner',['-keystore',key,'-storepass:env','H5_STORE_PASSWORD','-keypass:env','H5_KEY_PASSWORD','-signedjar',signed,src,o.alias],env);
    const evidence=invoke('java',[path.join(root,'platforms','android','VerifyBundle.java'),src,signed,o.pin],env);
    if(sha256(fs.readFileSync(src))!==before)throw Error('Unsigned input changed during signing');
    const bytes=fs.readFileSync(signed),hash=sha256(bytes);
    fs.copyFileSync(signed,dest,fs.constants.COPYFILE_EXCL);written.push(dest);
    fs.writeFileSync(sum,hash+'  '+path.basename(dest)+'\n',{flag:'wx'});written.push(sum);
    fs.writeFileSync(report,JSON.stringify({mode:o.mode,id:info.id,appId:info.appId,versionCode:info.versionCode,versionName:info.versionName,sourceCommit:info.source?.commit??null,frameworkCommit:info.framework?.commit??null,unsignedSha256:before,signedSha256:hash,certificateSha256:o.pin,verification:evidence,playValidation:'not performed'},null,2)+'\n',{flag:'wx'});written.push(report);
    if(o.mode==='upload'){validateAab(dest,releaseConfig,bundletool);written.push(dest+'.validation.json');}
    return {dest,report};
  }catch(e){for(const f of written)fs.rmSync(f,{force:true});throw e;}
  finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==3)throw Error('Usage: node platforms/android/sign-aab.mjs <unsigned.aab>');const r=signAab(process.argv[2]);console.log('Signed and verified:',r.dest);}
  catch(e){console.error(e.message);process.exitCode=1;}
}
