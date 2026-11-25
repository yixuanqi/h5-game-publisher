import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../scripts/source-integrity.mjs';
import {assertReleaseIdentity,normalizedLock,lockIdentity,comparePackagedAssets,policy} from '../platforms/android/quality.mjs';
const c={id:'ashen-bell-vow',appId:'io.github.yixuanqi.ashenbellvow',versionCode:450700,versionName:'45.7.0'};
test('registered Android package identity and version floor cannot regress',()=>{
  assertReleaseIdentity(c,{upload:true});
  assert.throws(()=>assertReleaseIdentity({...c,appId:'io.other.game'}),/cannot change/);
  assert.throws(()=>assertReleaseIdentity({...c,versionCode:450699}),/below/);
  assert.throws(()=>assertReleaseIdentity({...c,versionName:'45.7.1'}),/mismatch/);
  assertReleaseIdentity({...c,versionCode:450701,versionName:'45.7.1'});
  assert.throws(()=>assertReleaseIdentity({...c,id:'other'}),/belongs to/);
  assert.throws(()=>assertReleaseIdentity({id:'new',appId:'io.test.new'},{upload:true}),/not enrolled/);
});
test('lock normalization ignores only workspace name and object ordering',()=>{
  const a={name:'game-a',lockfileVersion:3,packages:{'':{name:'game-a',version:'1.0.0'},'node_modules/x':{version:'1.0.0'}}};
  const b={packages:{'node_modules/x':{version:'1.0.0'},'':{version:'1.0.0',name:'game-b'}},lockfileVersion:3,name:'game-b'};
  assert.deepEqual(normalizedLock(a),normalizedLock(b));
  b.packages['node_modules/x'].version='2.0.0';assert.notDeepEqual(normalizedLock(a),normalizedLock(b));
  assert.throws(()=>lockIdentity(a),/drift/);assert.equal(policy.dependencyLock.packageCount,99);
});
test('AAB packaged game bytes must exactly match staging except known empty generated files',()=>{
  const staged=[{path:'index.html',sha256:sha256('html')},{path:'src/main.js',sha256:sha256('main')}];
  const empty={path:'cordova.js',sha256:sha256('')};
  assert.equal(comparePackagedAssets(staged,[...staged,empty]).stagedFiles,2);
  assert.throws(()=>comparePackagedAssets(staged,[staged[0]]),/missing or modified/);
  assert.throws(()=>comparePackagedAssets(staged,[staged[0],{...staged[1],sha256:'wrong'}]),/missing or modified/);
  assert.throws(()=>comparePackagedAssets(staged,[...staged,{path:'secret.js',sha256:'x'}]),/Unexpected/);
  assert.throws(()=>comparePackagedAssets(staged,[...staged,{...empty,sha256:'x'}]),/Unexpected/);
  assert.throws(()=>comparePackagedAssets(staged,[...staged,staged[0]]),/Duplicate/);
});
