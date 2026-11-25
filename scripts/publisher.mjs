import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {snapshot,assertSnapshot,digestManifest,assertChanges,assertDisjoint,checkoutRoot,sha256} from './source-integrity.mjs';
import {hasAdapter,planAdapter} from '../adapters/index.mjs';
import {validateAndroid,planAndroid,applyAndroid} from '../platforms/android/native.mjs';
import {assertReleaseIdentity,readApprovedLock,importApprovedLock} from '../platforms/android/quality.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const orientations = ['landscape', 'sensorLandscape', 'portrait', 'unspecified'];
const capVersion = '8.0.0';
const frameworkVersion = '0.3.2';
export function validate(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error('Expected JSON object');
  if (!/^[a-z][a-z0-9-]{0,49}$/.test(c.id ?? '')) throw Error('Invalid id');
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(c.appId ?? '')) throw Error('Invalid appId');
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80 || /[\x00-\x1f]/.test(c.name)) throw Error('Invalid name');
  if (!Number.isInteger(c.versionCode) || c.versionCode < 1 || c.versionCode > 2100000000) throw Error('Invalid versionCode');
  if (typeof c.versionName !== 'string' || !/^[0-9]+(\.[0-9]+){0,3}([-.][a-zA-Z0-9]+)*$/.test(c.versionName)) throw Error('Invalid versionName');
  if (!orientations.includes(c.orientation)) throw Error('Invalid orientation');
  if (typeof c.source !== 'string' || !c.source.trim()) throw Error('Missing source');
  if(c.adapter!==undefined&&(!hasAdapter(c.adapter)||(c.adapter!=='none'&&c.adapter!==c.id)))throw Error('Invalid adapter for '+c.id);
  validateAndroid(c);
  assertReleaseIdentity(c);
  return c;
}
function files(dir, rel = '') {
  return fs.readdirSync(path.join(dir,rel), {withFileTypes:true}).sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap(e=>{
    const r=path.join(rel,e.name);
    if (e.isSymbolicLink()) throw Error('Symlink not allowed: '+r);
    if (['.git','node_modules','.work','dist','.env'].includes(e.name) || /\.(jks|keystore|pem|p12|pfx)$/i.test(e.name) || e.name.startsWith('.env.')) throw Error('Source must be a clean web export: '+r);
    if (e.isDirectory()) return files(dir,r);
    if (!e.isFile()) throw Error('Unsupported file: '+r);
    return [r];
  });
}
export function patchIndex(html) {
  if (html.includes('data-h5-publisher-runtime')) throw Error('Publisher runtime already present in source');
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error('index.html needs a head element');
  return html.replace(/<head(?:\s[^>]*)?>/i, m=>m+'\n<script data-h5-publisher-runtime src="./__publisher/runtime.js"></script>');
}
function frameworkIdentity(){
  const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  const status=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'});
  return {commit:head.status===0?head.stdout.trim():null,dirty:status.status===0?Boolean(status.stdout.trim()):null};
}
export function prepare(configPath, sourceOverride, workRoot=path.join(root,'.work')) {
  const c=validate(JSON.parse(fs.readFileSync(configPath,'utf8')));
  const input=fs.realpathSync(sourceOverride ? path.resolve(sourceOverride) : path.resolve(path.dirname(configPath),c.source));
  const work=path.resolve(workRoot,c.id),web=path.join(work,'www');
  const originalCheckout=checkoutRoot(input);
  function guard(destination){
    assertDisjoint(input,destination);
    if(originalCheckout&&originalCheckout!==fs.realpathSync(root))assertDisjoint(originalCheckout,destination);
  }
  guard(work);
  if (!fs.statSync(input).isDirectory()) throw Error('Source must be an extracted web directory');
  if(fs.existsSync(work)&&fs.lstatSync(work).isSymbolicLink())throw Error('Workspace symlink not allowed');
  const entries=files(input);
  if(!entries.includes('index.html'))throw Error('Missing index.html');
  if(entries.some(e=>e.split(path.sep)[0]==='__publisher'))throw Error('Reserved __publisher directory');
  if(entries.includes('publisher-source.json'))throw Error('Legacy adapted export; re-import the original H5 source into a fresh directory');
  const before=snapshot(input);
  const sidecar=input+'.publisher-source.json';
  let source=null,sidecarBytes=null;
  if(fs.existsSync(sidecar)){
    if(!fs.lstatSync(sidecar).isFile())throw Error('Invalid provenance sidecar');
    sidecarBytes=fs.readFileSync(sidecar);
    const meta=JSON.parse(sidecarBytes);
    if(meta.id!==c.id||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(meta.commit??'')||meta.sourceFilesSha256!==digestManifest(before)||JSON.stringify(meta.sourceFiles)!==JSON.stringify(before))throw Error('Imported source provenance mismatch: '+c.id);
    source={repository:meta.repository,commit:meta.commit,originalTreeSha256:meta.sourceTreeSha256,importedFilesSha256:meta.sourceFilesSha256,provenanceSha256:sha256(sidecarBytes)};
  }
  const verifySource=()=>{
    assertSnapshot(input,before,'Game source');
    if(sidecarBytes&&!fs.readFileSync(sidecar).equals(sidecarBytes))throw Error('Source provenance changed');
    if(!sidecarBytes&&fs.existsSync(sidecar))throw Error('Unexpected source provenance appeared');
  };
  try{
    const plan=planAdapter(c.adapter??'none',input,c.id);
    const html=patchIndex(fs.readFileSync(path.join(input,'index.html'),'utf8'));
    const lockPath=path.join(work,'package-lock.json');
    let lock=null;
    if(fs.existsSync(lockPath)){
      const raw=fs.readFileSync(lockPath,'utf8'),deps=JSON.parse(raw).packages?.['']?.dependencies;
      if(['core','android','cli','app'].every(k=>deps?.['@capacitor/'+k]===capVersion))lock=raw;
    }
    fs.rmSync(work,{recursive:true,force:true});fs.mkdirSync(web,{recursive:true});
    for(const e of entries){const dest=path.join(web,e);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(input,e),dest);}
    assertSnapshot(web,before,'Pristine build copy');
    // All platform adaptation happens in the disposable workspace, never in games/ or upstream.
    if(plan.patch!==null)fs.writeFileSync(path.join(web,'src','main.js'),plan.patch);
    fs.writeFileSync(path.join(web,'index.html'),html);
    fs.mkdirSync(path.join(web,'__publisher'));
    fs.copyFileSync(path.join(root,'scripts','runtime.js'),path.join(web,'__publisher','runtime.js'));
    const native=planAndroid(c,web);
    const staged=snapshot(web);
    const changes=assertChanges(before,staged,[...plan.allowed,'index.html','__publisher/runtime.js']);
    const deps=Object.fromEntries(['core','android','cli','app'].map(k=>['@capacitor/'+k,capVersion]));
    fs.writeFileSync(path.join(work,'package.json'),JSON.stringify({name:c.id,version:'1.0.0',private:true,dependencies:deps},null,2)+'\n');
    if(lock)fs.writeFileSync(lockPath,lock);
    fs.writeFileSync(path.join(work,'capacitor.config.json'),JSON.stringify({appId:c.appId,appName:c.name,webDir:'www',android:{allowMixedContent:false}},null,2)+'\n');
    const info={schemaVersion:2,frameworkVersion,framework:frameworkIdentity(),capacitorVersion:capVersion,id:c.id,appId:c.appId,versionCode:c.versionCode,versionName:c.versionName,source:source??{repository:null,commit:null,importedFilesSha256:digestManifest(before)},adapter:plan.identity,android:native.identity,sourceFiles:before,sourceFilesSha256:digestManifest(before),stagedFiles:staged,stagedFilesSha256:digestManifest(staged),changes};
    verifySource();
    fs.writeFileSync(path.join(work,'build-info.json'),JSON.stringify(info,null,2)+'\n');
    return {c,work,web,verifySource,guard,staged,native};
  }finally{verifySource();}
}
export function patchGradle(s,c){
  function replace(re,value){if(!re.test(s)) throw Error('Unexpected Capacitor Gradle template: '+re);s=s.replace(re,value);}
  replace(/\bversionCode\s+\d+/,`versionCode ${c.versionCode}`);
  replace(/\bversionName\s+["'][^"']+["']/,`versionName "${c.versionName}"`);
  return s;
}
export function patchManifest(s,c){
  const re=/<activity\b[^>]*android:name="(?:\.MainActivity|[^" ]+\.MainActivity)"[^>]*>/s;
  if(!re.test(s)) throw Error('MainActivity not found in AndroidManifest');
  return s.replace(re, tag=>tag.replace(/\s+android:screenOrientation="[^"]*"/g,'').replace(/>$/,` android:screenOrientation="${c.orientation}">`));
}
function run(cmd,args,cwd){
  // Windows .cmd/.bat require a command shell; arguments here are fixed tool flags only.
  const isWin=process.platform==='win32';
  const r=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:isWin && /\.(cmd|bat)$/i.test(cmd)});
  if(r.error) throw r.error; if(r.status!==0) throw Error(`${cmd} failed (${r.status})`);
}
function build(p,kind){
  const {work,c}=p; const win=process.platform==='win32';
  const npm=win?'npm.cmd':'npm'; const npx=win?'npx.cmd':'npx';
  const lockPath=path.join(work,'package-lock.json');
  if(process.env.H5_ANDROID_LOCKFILE)importApprovedLock(process.env.H5_ANDROID_LOCKFILE,lockPath,c.id);
  if(!fs.existsSync(lockPath))run(npm,['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],work);
  const lock=readApprovedLock(lockPath);
  run(npm,['ci','--no-audit','--no-fund'],work);
  if(readApprovedLock(lockPath).fileSha256!==lock.fileSha256)throw Error('npm ci changed approved lock');
  const infoPath=path.join(work,'build-info.json'),info=JSON.parse(fs.readFileSync(infoPath,'utf8'));
  info.dependencyLock=lock;fs.writeFileSync(infoPath,JSON.stringify(info,null,2)+'\n');
  run(npx,['--no-install','cap','add','android'],work);
  const android=path.join(work,'android');
  const g=path.join(android,'app','build.gradle'), m=path.join(android,'app','src','main','AndroidManifest.xml');
  fs.writeFileSync(g,patchGradle(fs.readFileSync(g,'utf8'),c));
  fs.writeFileSync(m,patchManifest(fs.readFileSync(m,'utf8'),c));
  run(npx,['--no-install','cap','sync','android'],work);
  applyAndroid(android,c,p.native);
  if(kind==='studio'){run(npx,['--no-install','cap','open','android'],work);return;}
  run(win?'gradlew.bat':'./gradlew',[kind==='apk'?'assembleDebug':'bundleRelease','--no-daemon'],android);
  const src=path.join(android,'app','build','outputs',kind==='apk'?'apk/debug/app-debug.apk':'bundle/release/app-release.aab');
  const output=path.join(root,'dist',c.id,`${c.versionCode}-${c.versionName}`);p.guard(output);p.verifySource();assertSnapshot(p.web,p.staged,'Staged runtime');fs.mkdirSync(output,{recursive:true});
  const dest=path.join(output,c.id+(kind==='apk'?'-debug.apk':'-unsigned.aab'));
  for(const file of [dest,dest+'.sha256',path.join(output,'build-info.json'),path.join(output,'package-lock.json')]){
    try{if(fs.lstatSync(file).isSymbolicLink())throw Error('Artifact symlink not allowed: '+file);}catch(e){if(e.code!=='ENOENT')throw e;}
    p.guard(file);
  }
  fs.copyFileSync(src,dest);fs.copyFileSync(path.join(work,'build-info.json'),path.join(output,'build-info.json'));
  fs.writeFileSync(dest+'.sha256',createHash('sha256').update(fs.readFileSync(dest)).digest('hex')+'  '+path.basename(dest)+'\n');
  fs.copyFileSync(path.join(work,'package-lock.json'),path.join(output,'package-lock.json'));
  console.log('Artifact:',dest); if(kind!=='apk') console.log('UNSIGNED AAB — sign with your upload key before Play Console.');
}
function main(){const [cmd,config,source]=process.argv.slice(2);if(!['prepare','apk','aab','studio'].includes(cmd)||!config) throw Error('Usage: node scripts/publisher.mjs <prepare|apk|aab|studio> <config.json> [web-export-dir]'); const p=prepare(path.resolve(config),source);console.log('Staged:',p.web);if(cmd!=='prepare'){
  if(cmd!=='studio'){const out=path.join(root,'dist',p.c.id,`${p.c.versionCode}-${p.c.versionName}`,p.c.id+(cmd==='apk'?'-debug.apk':'-unsigned.aab'));p.guard(path.dirname(out));fs.rmSync(out,{force:true});fs.rmSync(out+'.sha256',{force:true});if(cmd==='aab')fs.rmSync(out+'.validation.json',{force:true});}
  try{build(p,cmd);}finally{p.verifySource();}
}}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
