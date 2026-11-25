import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {findApk,verifyArtifact,verifyBadging,classifyFaults,auditResources,countNativePause,lifecycleRoundTripComplete,systemAnrs,homeWindowFocused} from '../scripts/emulator-lib.mjs';
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

test('native foreground appearance cannot pass until all callbacks arrive in one snapshot (45586844562)',()=>{
  const before={visible:true,nativeActive:true,nativeResumed:true,pageActive:true,paused:false,nativePauses:0,nativeResumes:0,pauses:0,resumes:0};
  const failed={...before,nativeResumed:false,paused:true,nativePauses:1,pauses:1};
  assert.equal(lifecycleRoundTripComplete(before,before),false);
  assert.equal(lifecycleRoundTripComplete(before,failed),false);
  assert.equal(lifecycleRoundTripComplete(before,{...failed,paused:false,nativeResumed:true}),false);
  const complete={...before,nativePauses:1,nativeResumes:1,pauses:1,resumes:1};
  assert.equal(lifecycleRoundTripComplete(before,complete),true);
  assert.equal(lifecycleRoundTripComplete(before,{...complete,visible:false}),false);
  assert.equal(lifecycleRoundTripComplete(before,{...complete,resumes:0}),false);
  assert.equal(lifecycleRoundTripComplete(complete,complete),false);
  assert.equal(lifecycleRoundTripComplete(complete,{...complete,nativePauses:2,nativeResumes:2,pauses:2,resumes:2}),true);
});
test('native pause synchronization only counts exact AppPlugin pause lines for current PID',()=>{
  const log=[
    '11-25 09:44:46.726  2114  2114 V Capacitor/AppPlugin: Notifying listeners for event pause',
    '11-25 09:44:48.855  2114  2114 V Capacitor/AppPlugin: Notifying listeners for event resume',
    '11-25 09:44:46.726  9999  9999 V Capacitor/AppPlugin: Notifying listeners for event pause',
    '11-25 09:44:46.728  2114  2114 D Capacitor: App paused',
  ].join('\n');
  assert.equal(countNativePause(log,'2114'),1);
  assert.equal(countNativePause(log,'9999'),1);
  assert.equal(countNativePause(log,'2115'),0);
  assert.throws(()=>countNativePause(log,'2114 9999'),/numeric/);
});

test('system and launcher ANRs from 45609733049 are infrastructure faults, not app exceptions',()=>{
  const log=[
    '11-25 12:08:30.045 509 1995 I am_anr  : [0,1050,com.android.launcher3,885767749,Input dispatching timed out]',
    '11-25 12:08:43.695 509 1995 E ActivityManager: ANR in com.android.launcher3 (com.android.launcher3/.uioverrides.QuickstepLauncher)',
    '11-25 12:08:58.871 509 2605 E ActivityManager: ANR in system',
    '11-25 12:08:59.000 509 2605 E ActivityManager: ANR in io.github.yixuanqi.ashenbellvow (activity)',
    '11-25 12:09:00.000 2476 2490 I OpenGLRenderer: Davey! duration=3709ms',
    '11-25 12:09:01.000 509 2605 E ActivityManager: ANR in system.fake',
  ].join('\n');
  assert.equal(systemAnrs(log).length,3);
  assert.equal(systemAnrs('ActivityManager: ANR in com.example.home (activity)','com.example.home').length,1);
  assert.deepEqual(systemAnrs('ActivityManager: ANR in io.github.yixuanqi.ashenbellvow (activity)'),[]);
});
test('boot requires focused and resumed home, not merely a running device',()=>{
  const home='com.android.launcher3';
  const focused='mCurrentFocus=Window{abc u0 com.android.launcher3/.QuickstepLauncher}';
  const resumed='topResumedActivity=ActivityRecord{abc u0 com.android.launcher3/.QuickstepLauncher t1}';
  assert.equal(homeWindowFocused(focused,resumed,home),true);
  assert.equal(homeWindowFocused('mCurrentFocus=null',resumed,home),false);
  assert.equal(homeWindowFocused('mCurrentFocus=Window{abc u0 Application Not Responding: com.android.launcher3}',resumed,home),false);
  assert.equal(homeWindowFocused(focused,'topResumedActivity=null',home),false);
  assert.equal(homeWindowFocused(focused,resumed,'com.other.home'),false);
});
