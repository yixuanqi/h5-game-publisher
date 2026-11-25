import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateAndroid,validatePng,planAndroid,patchActivity,patchBrandManifest,applyAndroid} from '../platforms/android/native.mjs';
test('native options are opt-in and fail closed',()=>{
  assert.equal(planAndroid({id:'demo'},'.').immersive,false);
  for(const a of [{immersive:'yes'},{icon:'../icon.png'},{icon:'/icon.png'},{splashColor:'#123456'},{icon:'x.png',splashColor:'bad'},{unknown:true}])assert.throws(()=>validateAndroid({android:a}));
  assert.throws(()=>planAndroid({id:'other',android:{icon:'publisher-demo'}},'.'),/reserved/);
});
test('PNG header and required dimensions',()=>{
  const b=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(512,16);b.writeUInt32BE(512,20);validatePng(b);
  b.writeUInt32BE(511,16);assert.throws(()=>validatePng(b),/512x512/);assert.throws(()=>validatePng(Buffer.from('not png')),/header/);
});
test('native bar policy retains generated Activity and transient system gestures',()=>{
  const original='package io.test.demo;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}\n';
  const patched=patchActivity(original);
  assert.match(patched,/super\.onResume\(\)/);assert.match(patched,/BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
  assert.match(patched,/Type\.systemBars\(\)/);assert.throws(()=>patchActivity('unrecognized'),/template/);
});
test('branding only writes generated native resources',t=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'native-test-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
  const c={id:'demo',appId:'io.test.demo',android:{icon:'publisher-demo',splashColor:'#173042',immersive:true}};
  const plan=planAndroid(c,d),main=path.join(d,'app','src','main'),java=path.join(main,'java','io','test','demo'),values=path.join(main,'res','values');
  fs.mkdirSync(java,{recursive:true});fs.mkdirSync(values,{recursive:true});
  fs.writeFileSync(path.join(java,'MainActivity.java'),'public class MainActivity extends BridgeActivity {}');
  fs.writeFileSync(path.join(main,'AndroidManifest.xml'),'<application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"><activity android:theme="@style/AppTheme.NoActionBarLaunch"/></application>');
  applyAndroid(d,c,plan);assert.match(fs.readFileSync(path.join(main,'AndroidManifest.xml'),'utf8'),/@style\/H5PublisherLaunchTheme/);
  assert.ok(fs.existsSync(path.join(main,'res','drawable-nodpi','h5publisher_icon.xml')));
  assert.match(fs.readFileSync(path.join(values,'h5publisher_launch.xml'),'utf8'),/windowSplashScreenAnimatedIcon/);
  assert.throws(()=>patchBrandManifest('<application/>',plan),/template/);
});
