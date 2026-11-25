import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readApprovedLock} from '../platforms/android/quality.mjs';
import {upgradeConfig,assertUpgradePair} from '../platforms/android/upgrade-config.mjs';
import {verifyRun,verifyAcceptance,assertSigningEvidence} from '../platforms/android/release-evidence.mjs';
const sha='a'.repeat(40),hash='b'.repeat(64),other='c'.repeat(64),id='123';
const c={id:'ashen-bell-vow',appId:'io.github.yixuanqi.ashenbellvow',versionCode:450700,versionName:'45.7.0'};
test('committed canonical dependency lock matches independently approved hash',()=>{
  assert.equal(readApprovedLock(new URL('../platforms/android/package-lock.json',import.meta.url)).packageCount,99);
});
test('test upgrade changes only version and rejects different source or adapter',()=>{
  const base={...c,framework:{commit:sha},source:{commit:sha},adapter:{id:c.id},android:{},stagedFilesSha256:hash,sourceFilesSha256:hash,dependencyLock:{normalizedSha256:hash}};
  const next={...base,...upgradeConfig(c)};assertUpgradePair(base,next,c);
  assert.throws(()=>assertUpgradePair(base,{...next,source:{commit:'x'}},c),/Upgrade changed/);
  assert.throws(()=>assertUpgradePair(base,{...next,versionCode:c.versionCode},c),/upgrade versionCode/);
  assert.throws(()=>upgradeConfig({...c,versionCode:2100000000}));
});
test('release requires exact fresh main run and all nine successful jobs',()=>{
  const run={id:123,path:'.github/workflows/ci.yml',head_sha:sha,head_branch:'main',head_repository:{full_name:'owner/repo'},event:'push',status:'completed',conclusion:'success',run_attempt:1};
  const jobs=['unit (ubuntu-24.04)','unit (windows-latest)','real-game-staging',...['demo','ashen-bell-vow','curio-box'].flatMap(g=>['android-smoke ('+g+')','android-emulator ('+g+')'])].map(name=>({name,status:'completed',conclusion:'success'}));
  verifyRun(run,jobs,sha,'owner/repo',id);
  assert.throws(()=>verifyRun({...run,run_attempt:2},jobs,sha,'owner/repo',id),/fresh full CI/);
  assert.throws(()=>verifyRun({...run,head_sha:'x'},jobs,sha,'owner/repo',id));
  assert.throws(()=>verifyRun(run,jobs.slice(1),sha,'owner/repo',id));
  assert.throws(()=>verifyRun(run,[{...jobs[0],conclusion:'failure'},...jobs.slice(1)],sha,'owner/repo',id));
});
test('acceptance gate rejects missing upgrade, wrong APK, run, API or failed test',()=>{
  const names=['isolated emulator device only','artifact integrity, APK manifest and signature','disable Wi-Fi and cellular before first launch','launch installed APK and native WebView','enter first level with touch','Android back opens game pause menu','Home background and foreground without automatic gameplay resume','committed local storage survives force-stop and relaunch','same-signer higher-version APK upgrade preserves storage','runtime fault and network audit'];
  const r={run:id,status:'passed',game:c.id,appId:c.appId,version:c.versionName,apkSha256:hash,api:'34',deviceConnectedAtCleanup:true,tests:names.map(name=>({name,status:'passed'})),upgrade:{status:'passed',baseApkSha256:hash,upgradeApkSha256:other,baseVersionCode:c.versionCode,upgradeVersionCode:c.versionCode+1,storagePreserved:true,signerSha256:hash}};
  assert.equal(verifyAcceptance(r,c,hash,other,id),10);
  for(const x of [{...r,run:'124'},{...r,api:'29'},{...r,apkSha256:other},{...r,tests:r.tests.slice(0,-2)},{...r,upgrade:{...r.upgrade,storagePreserved:false}},{...r,tests:[{...r.tests[0],status:'failed'},...r.tests.slice(1)]}])assert.throws(()=>verifyAcceptance(x,c,hash,other,id));
});
test('upload signing evidence is bound to exact artifact and explicit hash',()=>{
  const i={...c,framework:{commit:sha},source:{commit:sha},stagedFilesSha256:hash,dependencyLock:{normalizedSha256:hash}};
  const e={...c,schemaVersion:1,status:'passed',ciRunId:id,frameworkCommit:sha,sourceCommit:sha,stagedFilesSha256:hash,unsignedAabSha256:hash,dependencyLockSha256:hash,emulatorApi:34,upgradeStoragePreserved:true,requiredTestsPassed:10,apkSha256:hash,upgradeApkSha256:other,validationReportSha256:hash,emulatorReportSha256:hash};
  assertSigningEvidence(e,i,hash,hash);
  assert.throws(()=>assertSigningEvidence(e,i,hash,other),/approved AAB hash/);
  assert.throws(()=>assertSigningEvidence({...e,upgradeStoragePreserved:false},i,hash,hash));
  assert.throws(()=>assertSigningEvidence({...e,sourceCommit:'x'},i,hash,hash));
});
