import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sha256,digestManifest} from '../../scripts/source-integrity.mjs';
import {findApk,verifyArtifact} from '../../scripts/emulator-lib.mjs';
import {upgradeConfig,assertUpgradePair} from './upgrade-config.mjs';
import {assertReleaseIdentity,readApprovedLock,policy} from './quality.mjs';
const hex=/^[0-9a-f]{64}$/;
const commit=/^[0-9a-f]{40}$/;
const runId=/^[1-9]\d*$/;
export function verifyRun(run,jobs,sha,repo,id){
  assert.match(sha,commit);assert.match(String(id),runId);
  assert.equal(String(run.id),String(id));
  assert.equal(run.path,'.github/workflows/ci.yml');
  assert.equal(run.head_sha,sha);assert.equal(run.head_branch,'main');
  assert.equal(run.head_repository?.full_name,repo);
  assert.ok(['push','workflow_dispatch'].includes(run.event),'Untrusted CI event');
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
  assert.equal(run.run_attempt,1,'Use a fresh full CI run, not mixed-attempt artifacts');
  const expected=['unit (ubuntu-24.04)','unit (windows-latest)','real-game-staging',...['demo','ashen-bell-vow','curio-box'].flatMap(g=>['android-smoke ('+g+')','android-emulator ('+g+')'])].sort();
  assert.deepEqual(jobs.map(j=>j.name).sort(),expected);
  assert.ok(jobs.every(j=>j.status==='completed'&&j.conclusion==='success'),'CI job not successful');
}
export function verifyAcceptance(report,c,apkHash,upgradeHash,id){
  assert.equal(report.run,String(id));assert.equal(report.status,'passed');
  assert.equal(report.game,c.id);assert.equal(report.appId,c.appId);assert.equal(report.version,c.versionName);
  assert.equal(report.apkSha256,apkHash);assert.equal(String(report.api),'34');
  assert.equal(report.deviceConnectedAtCleanup,true);
  const expected=['isolated emulator device only','artifact integrity, APK manifest and signature','disable Wi-Fi and cellular before first launch','launch installed APK and native WebView',...(c.id==='demo'?['demo touch increments score']:['enter first level with touch','Android back opens game pause menu']),'Home background and foreground without automatic gameplay resume','committed local storage survives force-stop and relaunch','same-signer higher-version APK upgrade preserves storage','runtime fault and network audit'];
  const actual=report.tests.map(t=>t.name);
  assert.equal(new Set(actual).size,actual.length,'Duplicate test evidence');
  assert.ok(report.tests.every(t=>t.status==='passed'),'Failed acceptance test');
  for(const name of expected)assert.ok(actual.includes(name),'Missing acceptance test: '+name);
  assert.ok(report.tests.length===expected.length||report.tests.length===expected.length+1&&actual.includes('optional explicit WebView reload stress'),'Unexpected acceptance tests');
  const u=report.upgrade;
  assert.equal(u.status,'passed');assert.equal(u.baseApkSha256,apkHash);assert.equal(u.upgradeApkSha256,upgradeHash);
  assert.equal(u.baseVersionCode,c.versionCode);assert.equal(u.upgradeVersionCode,upgradeConfig(c).versionCode);
  assert.equal(u.storagePreserved,true);assert.match(u.signerSha256,hex);
  if(c.id==='demo')assert.equal(u.demoScorePreserved,true);
  return expected.length;
}
function json(f){return JSON.parse(fs.readFileSync(f,'utf8'));}
function one(root,filename){
  const found=[];
  function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name);if(e.isSymbolicLink())throw Error('Unexpected symlink: '+p);
    if(e.isDirectory())walk(p);else if(e.isFile()&&e.name===filename)found.push(p);
  }}
  walk(root);assert.equal(found.length,1,'Expected exactly one '+filename);return found[0];
}
export function collectEvidence(c,apkRoot,aabRoot,upgradeRoot,reportRoot,sha,id){
  assertReleaseIdentity(c);assert.match(sha,commit);assert.match(String(id),runId);
  const apk=verifyArtifact(findApk(apkRoot,c.id),c);
  const upgrade=verifyArtifact(findApk(upgradeRoot,c.id),upgradeConfig(c));
  assertUpgradePair(apk.info,upgrade.info,c);
  const aab=one(aabRoot,c.id+'-unsigned.aab'),dir=path.dirname(aab);
  const aabHash=sha256(fs.readFileSync(aab));
  assert.equal(fs.readFileSync(aab+'.sha256','utf8').trim().split(/\s+/)[0],aabHash);
  const info=json(path.join(dir,'build-info.json'));
  for(const k of ['id','appId','versionCode','versionName'])assert.equal(info[k],c[k]);
  for(const k of ['framework','source','adapter','android','sourceFilesSha256','stagedFilesSha256','dependencyLock'])assert.deepEqual(info[k],apk.info[k],'APK/AAB provenance mismatch: '+k);
  assert.equal(info.framework.commit,sha);assert.equal(info.framework.dirty,false);
  if(c.id!=='demo'){assert.equal(info.source.repository,'yixuanqi/PhotoGallery');assert.match(info.source.commit,commit);}
  assert.equal(digestManifest(info.stagedFiles),info.stagedFilesSha256);
  assert.equal(digestManifest(info.sourceFiles),info.sourceFilesSha256);
  const lock=readApprovedLock(path.join(dir,'package-lock.json'));assert.deepEqual(lock,info.dependencyLock);
  const validationPath=aab+'.validation.json',v=json(validationPath);
  for(const k of ['id','appId','versionCode','versionName'])assert.equal(v[k],c[k]);
  assert.equal(v.status,'passed');assert.equal(v.sha256,aabHash);assert.equal(v.frameworkCommit,sha);
  assert.equal(v.sourceCommit,info.source.commit??null);assert.equal(v.debuggable,false);assert.equal(v.testOnly,false);
  assert.equal(v.bundletoolSha256,policy.bundletool.sha256);assert.deepEqual(v.dependencyLock,lock);
  assert.equal(v.assets.stagedFiles,info.stagedFiles.length);
  const reportPath=one(reportRoot,'test-results.json'),report=json(reportPath);
  const tests=verifyAcceptance(report,c,apk.hash,upgrade.hash,id);
  return {schemaVersion:1,status:'passed',ciRunId:String(id),frameworkCommit:sha,sourceCommit:info.source.commit??null,id:c.id,appId:c.appId,versionCode:c.versionCode,versionName:c.versionName,unsignedAabSha256:aabHash,apkSha256:apk.hash,upgradeApkSha256:upgrade.hash,stagedFilesSha256:info.stagedFilesSha256,dependencyLockSha256:lock.normalizedSha256,validationReportSha256:sha256(fs.readFileSync(validationPath)),emulatorReportSha256:sha256(fs.readFileSync(reportPath)),emulatorApi:34,requiredTestsPassed:tests,upgradeStoragePreserved:true};
}
export function assertSigningEvidence(e,info,hash,approved){
  assert.equal(e.schemaVersion,1);assert.equal(e.status,'passed');assert.match(e.ciRunId,runId);
  assert.match(hash,hex);assert.equal(approved,hash,'Explicit approved AAB hash mismatch');
  for(const k of ['id','appId','versionCode','versionName','stagedFilesSha256'])assert.equal(e[k],info[k]);
  assert.equal(e.frameworkCommit,info.framework.commit);assert.equal(e.sourceCommit,info.source.commit);
  assert.equal(e.unsignedAabSha256,hash);assert.equal(e.dependencyLockSha256,info.dependencyLock.normalizedSha256);
  assert.equal(e.emulatorApi,34);assert.equal(e.upgradeStoragePreserved,true);assert.ok(e.requiredTestsPassed>=9);
  for(const k of ['apkSha256','upgradeApkSha256','validationReportSha256','emulatorReportSha256'])assert.match(e[k],hex);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [cfg,apk,aab,upgrade,report,sha,id,out]=process.argv.slice(2);
    if(!out)throw Error('Usage: release-evidence.mjs config apkDir aabDir upgradeDir reportDir frameworkSHA runID output');
    const e=collectEvidence(json(cfg),apk,aab,upgrade,report,sha,id);
    fs.writeFileSync(out,JSON.stringify(e,null,2)+'\n',{flag:'wx'});
    console.log('Exact candidate evidence passed: '+e.id+' '+e.unsignedAabSha256);
  }catch(e){console.error(e.message);process.exitCode=1;}
}
