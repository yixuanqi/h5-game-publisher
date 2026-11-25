import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {findApk,verifyArtifact,verifyBadging,classifyFaults,auditResources} from '../scripts/emulator-lib.mjs';
const c={id:'demo',appId:'io.github.yixuanqi.h5demo',versionCode:1,versionName:'0.1.0'};
test('emulator consumes a unique APK with matching checksum and provenance',t=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'apk-check-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
  const apk=path.join(d,'demo-debug.apk');fs.writeFileSync(apk,'fixture');
  fs.writeFileSync(apk+'.sha256',createHash('sha256').update('fixture').digest('hex'));
  fs.writeFileSync(path.join(d,'build-info.json'),JSON.stringify(c));
  assert.equal(findApk(d,'demo'),apk);assert.equal(verifyArtifact(apk,c).info.appId,c.appId);
  assert.throws(()=>verifyArtifact(apk,{...c,versionCode:2}),/mismatch/);
  fs.writeFileSync(apk,'tampered');assert.throws(()=>verifyArtifact(apk,c),/SHA256/);
  fs.writeFileSync(path.join(d,'other.apk'),'bad');assert.throws(()=>findApk(d,'demo'),/exactly one/);
});
test('APK manifest identity and version are verified independently',()=>{
  const s="package: name='io.github.yixuanqi.h5demo' versionCode='1' versionName='0.1.0' platformBuildVersionName='16'";
  verifyBadging(s,c);assert.throws(()=>verifyBadging(s,{...c,versionName:'2.0'}),/metadata mismatch/);
});
test('logcat rejects application crash and ANR without unrelated process noise',()=>{
  const p=c.appId;const log='Process: unrelated, PID: 42\nProcess: '+p+', PID: 43\nANR in '+p+' (activity)\n>>> '+p+' <<<';
  assert.equal(classifyFaults(log,p).length,3);assert.deepEqual(classifyFaults('Process: unrelated, PID: 42',p),[]);
});

test('dependent-provider process death is an app failure, intentional force-stop is not',()=>{
  const p=c.appId;
  assert.equal(classifyFaults('ActivityManager: Killing 2414:'+p+'/u0a192 (adj 0): depends on provider com.google.android.gms/.fonts.provider.FontsProvider',p).length,1);
  assert.deepEqual(classifyFaults('ActivityManager: Killing 2414:'+p+'/u0a192 (adj 0): stop '+p,p),[]);
});

test('resource audit checks every cold/relaunch document without forced reload',()=>{
  const first={phase:'cold-launch',url:'https://localhost/',resources:['https://localhost/__publisher/runtime.js','https://localhost/src/main.js?v=45.7']};
  const second={...first,phase:'process-relaunch'};
  assert.equal(auditResources([first,second],[],'ashen-bell-vow').snapshots,2);
  assert.throws(()=>auditResources([first,{...second,resources:[]}],[],'ashen-bell-vow'),/Missing resource/);
  assert.throws(()=>auditResources([first,second],['https://cdn.example/a.js'],'ashen-bell-vow'),/External/);
  assert.throws(()=>auditResources([{...first,resources:[...first.resources,'https://cdn.example/a.js']}],[],'ashen-bell-vow'),/External/);
  assert.throws(()=>auditResources([],[],'demo'),/No resource snapshots/);
});
