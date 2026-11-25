import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {upgradeConfig,assertUpgradePair} from '../platforms/android/upgrade-config.mjs';
import {findApk,verifyArtifact,verifyBadging,classifyFaults,visible,auditResources,countNativePause,lifecycleRoundTripComplete} from './emulator-lib.mjs';
const [config,artifactDir,reportDir]=process.argv.slice(2);
if(!config||!artifactDir||!reportDir)throw Error('Usage: node scripts/emulator-smoke.mjs <config> <artifact-dir> <report-dir>');
const c=JSON.parse(fs.readFileSync(config,'utf8')), pkg=c.appId;
if(!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pkg))throw Error('Invalid appId');
const out=path.resolve(reportDir);fs.mkdirSync(out,{recursive:true});
const report={game:c.id,appId:pkg,version:c.versionName,run:process.env.GITHUB_RUN_ID||null,status:'failed',tests:[],limitations:['Software GPU; no audio output; no real-device performance verdict','Storage and same-source version bump upgrade test use a committed probe; not actual game-save migration or sub-second crash durability','Network audit uses Resource Timing snapshots and observed CDP requests; not a complete packet capture','Explicit in-page reload stress is opt-in; normal runtime gate uses cold launch and process relaunch','Single-touch start/menu interaction; no full combat or multitouch assertion']};
const messages=[], faults=[], network=[], resourceSnapshots=[];
let cdp,port,offline=false,installed=false,serial=null,logStream=null,baseInfo=null,baseSigner=null;
const diagnostics=[];
function record(message){const entry={at:new Date().toISOString(),message:String(message)};diagnostics.push(entry);fs.appendFileSync(path.join(out,'diagnostics.jsonl'),JSON.stringify(entry)+'\n');}
function cmd(exe,args,opts={}){
  const r=spawnSync(exe,args,{encoding:opts.binary?null:'utf8',timeout:opts.timeout??60000,maxBuffer:32*1024*1024});
  if(r.error||r.status!==0){if(opts.allowFail)return opts.binary?Buffer.alloc(0):'';throw Error(exe+' '+args.join(' ')+': '+(r.error||r.stderr||r.stdout));}
  return r.stdout;
}
const adb=(...args)=>cmd('adb',serial?['-s',serial,...args]:args);
const shell=(...args)=>adb('shell',...args).trim();
function deviceAlive(){if(!serial)return false;try{return cmd('adb',['-s',serial,'get-state'],{timeout:5000}).trim()==='device';}catch(e){record(e.message);return false;}}
function startLogcat(){const fd=fs.openSync(path.join(out,'logcat-stream.txt'),'a');try{logStream=spawn('adb',['-s',serial,'logcat','-b','all','-v','threadtime'],{stdio:['ignore',fd,fd]});logStream.on('error',e=>record('logcat stream error: '+e.message));logStream.on('exit',(code,signal)=>record('logcat stream exit: '+code+' '+signal));}finally{fs.closeSync(fd);}}
const capture=(name)=>{const b=cmd('adb',['exec-out','screencap','-p'],{binary:true});assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');fs.writeFileSync(path.join(out,name+'.png'),b);};
async function step(name,fn){const start=Date.now();try{const detail=await fn();report.tests.push({name,status:'passed',ms:Date.now()-start,detail:detail??null});console.log('PASS '+name);}catch(e){report.tests.push({name,status:'failed',ms:Date.now()-start,error:String(e.message||e)});throw e;}finally{fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(report,null,2));}}
async function eventually(fn,desc,ms=60000){let last;const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(e){last=e;if(e.infrastructure)throw e;}await sleep(350);}throw Error('Timeout: '+desc+(last?' ('+last.message+')':''));}
class CDP{
  constructor(ws){this.ws=ws;this.seq=0;this.pending=new Map();
    ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);return;}
      if(m.method==='Runtime.exceptionThrown'){const x=m.params.exceptionDetails;faults.push(x.exception?.description||x.text);}
      if(m.method==='Runtime.consoleAPICalled'){messages.push({type:m.params.type,args:m.params.args.map(a=>a.value??a.description??a.type)});}
      if(m.method==='Network.requestWillBeSent'){const url=m.params.request.url;network.push(url);}
      if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&!m.params.response.url.endsWith('/favicon.ico'))faults.push('HTTP '+m.params.response.status+' '+m.params.response.url);
    });
    ws.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CDP disconnected'));}this.pending.clear();});
  }
  static async connect(url){const ws=new WebSocket(url);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('WebSocket connect timeout'));},10000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WebSocket open failed'));},{once:true});});return new CDP(ws);}
  send(method,params={}){const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},20000);this.pending.set(id,{resolve,reject,timer});try{this.ws.send(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  async eval(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  close(){this.ws.close();}
}
async function attach(){
  const pid=await eventually(()=>shell('pidof',pkg).split(/\s+/).find(x=>/^\d+$/.test(x)),'app pid');
  port=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid).trim();
  const page=await eventually(async()=>{const res=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(3000)});const pages=await res.json();return pages.find(p=>p.type==='page'&&/^https?:\/\/localhost(?:[:/]|$)/.test(p.url)&&p.webSocketDebuggerUrl);},'local WebView devtools page');
  const socket=new URL(page.webSocketDebuggerUrl);socket.hostname='127.0.0.1';socket.port=port;
  const x=await CDP.connect(socket.href);await x.send('Runtime.enable');await x.send('Network.enable');return x;
}
async function detach(){if(cdp){cdp.close();cdp=null;}if(port){adb('forward','--remove','tcp:'+port);port=null;}}
const launch=()=>{const res=adb('shell','am','start','-W','-n',pkg+'/.MainActivity');if(/Error|Exception/.test(res))throw Error(res);};
const wait=(expr,desc,ms)=>eventually(async()=>{
  try{return await cdp.eval(expr);}catch(e){
    record(desc+': '+e.message);
    if(!deviceAlive()){const failure=Error('Emulator connection lost during '+desc+': '+e.message);failure.infrastructure=true;throw failure;}
    throw e;
  }
},desc,ms);
async function lifecycleRoundTrip(label,settleMs){
  const before=await wait('(()=>{const s=window.H5Publisher?.lifecycleSnapshot();return s&&!s.paused&&!document.hidden?s:false;})()',label+' initial foreground');
  const pid=shell('pidof',pkg);assert.match(pid,/^\d+$/,'one application PID required');
  const nativeLog=()=>fs.readFileSync(path.join(out,'logcat-stream.txt'),'utf8');
  const pauseCount=countNativePause(nativeLog(),pid);
  const evidence={label,before,pid,pauseCount,after:null};
  (report.lifecycleCycles??=[]).push(evidence);
  if(label==='Home')report.lifecycle=evidence;
  shell('input','keyevent','KEYCODE_HOME');
  // Android may update the activity stack before the app's main thread runs onPause.
  await eventually(()=>{
    const background=!shell('dumpsys','activity','activities').split('\n').some(l=>/mResumedActivity|topResumedActivity/.test(l)&&l.includes(pkg+'/'));
    const count=countNativePause(nativeLog(),pid);
    evidence.backgroundNativePauseCount=count;
    return background&&count>pauseCount;
  },label+' native onPause and background');
  record(label+' native pause confirmed before relaunch');
  await sleep(settleMs);
  launch();
  assert.equal(shell('pidof',pkg),pid,'unexpected process recreation during '+label);
  const after=await eventually(async()=>{
    // One coherent snapshot per observation. Do not accept a foreground-looking snapshot
    // until the exact new pause and resume callbacks have reached the JS runtime.
    const observed=await cdp.eval('({snapshot:window.H5Publisher?.lifecycleSnapshot(),hidden:document.hidden})');
    const current=observed?.snapshot;
    evidence.after=current??null;
    if(!current||observed.hidden!==false||!lifecycleRoundTripComplete(before,current))return false;
    return current;
  },label+' complete native and publisher pause/resume cycle');
  assert.equal(shell('pidof',pkg),pid,'unexpected process recreation after '+label);
  evidence.after=after;record(label+' lifecycle round trip verified');
  return evidence;
}
async function tap(id){
  await wait(visible(id),'visible '+id);
  const point=await cdp.eval('(()=>{const r=document.getElementById('+JSON.stringify(id)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await sleep(90);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function captureResources(phase){
  const snapshot=await cdp.eval('({url:location.href,resources:performance.getEntriesByType("resource").map(r=>r.name),timeOrigin:performance.timeOrigin})');
  resourceSnapshots.push({phase,...snapshot});
  fs.writeFileSync(path.join(out,'resource-snapshots.json'),JSON.stringify(resourceSnapshots,null,2));
  // A real boot must include the runtime and the game entry, not just a favicon or an empty page.
  auditResources([snapshot],[],c.id);
  record(phase+' resource audit: '+snapshot.resources.length+' entries');
  return snapshot;
}
const states=c.id==='ashen-bell-vow'?{boot:'window.__ABV_BOOTED__===true',ready:'document.body.dataset.gameState==="title"',start:'btn-start',play:'document.body.dataset.gameState==="playing"',pause:'document.body.dataset.gameState==="modal"&&!document.querySelector("#pause-modal").classList.contains("hidden")',resume:'btn-pause-resume'}:c.id==='curio-box'?{boot:'!!window.CB?.game?.map',ready:'window.CB?.game?.titleOpen&&!window.CB.game.introActive',start:'btnTitleStart',play:'window.CB?.game?.run.phase==="playing"&&!window.CB.game.titleOpen&&!window.CB.game.paused',pause:'window.CB?.game?.paused===true',resume:'btnPauseResume'}:null;
try{
  await step('isolated emulator device only',()=>{
    const devices=cmd('adb',['devices']).split(/\r?\n/).slice(1).filter(l=>l.trim());
    assert.equal(devices.length,1,'one dedicated emulator required');
    const match=devices[0].match(/^(emulator-\d+)\s+device\s*$/);assert.ok(match,'refusing physical or unavailable device');serial=match[1];
    assert.equal(shell('getprop','ro.kernel.qemu'),'1');
    // Limit software GPU workload; this is a runtime smoke device, not a performance benchmark.
    shell('wm','size','720x1280');shell('wm','density','240');
    fs.writeFileSync(path.join(out,'webview-provider.txt'),shell('dumpsys','webviewupdate'));
    return {serial,display:shell('wm','size'),density:shell('wm','density')};
  });
  await step('artifact integrity, APK manifest and signature',()=>{
    const apk=findApk(artifactDir,c.id);const {hash,info}=verifyArtifact(apk,c);report.apkSha256=hash;baseInfo=info;
    const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
    const bt=path.join(sdk,'build-tools','36.0.0');
    verifyBadging(cmd(path.join(bt,'aapt'),['dump','badging',apk]),c);
    const signature=cmd(path.join(bt,'apksigner'),['verify','--verbose','--print-certs',apk]);
    fs.writeFileSync(path.join(out,'signature.txt'),signature);
    baseSigner=signature.match(/Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/)?.[1]?.toLowerCase();assert.ok(baseSigner,'missing APK signer digest');
    adb('logcat','-c');startLogcat();assert.match(adb('install',apk),/Success/);installed=true;return hash;
  });
  await step('disable Wi-Fi and cellular before first launch',()=>{
    report.api=shell('getprop','ro.build.version.sdk');
    offline=true;
    shell('cmd','connectivity','airplane-mode','enable');shell('svc','wifi','disable');shell('svc','data','disable');
    assert.equal(shell('settings','get','global','airplane_mode_on'),'1');
    assert.equal(shell('settings','get','global','wifi_on'),'0');
    report.networkState=shell('dumpsys','connectivity');return {api:report.api,airplane:true,wifi:false};
  });
  await step('launch installed APK and native WebView',async()=>{
    record('before first launch');launch();record('activity launched');cdp=await attach();record('WebView CDP attached');
    await wait('window.H5Publisher?.isNative()===true','Capacitor native bridge');record('native bridge ready');
    await wait(states?.boot||'document.readyState==="complete"&&!!document.querySelector("#tap")','game boot',90000);
    await wait('innerWidth>innerHeight&&innerHeight>0','landscape viewport');
    capture('01-launch');
    // Capture the real cold launch, without restarting the Canvas during its opening animation.
    await captureResources('cold-launch');
    record('first game boot and landscape verified');
    return await cdp.eval('({url:location.href,width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  });
  if(states){
    await step('enter first level with touch',async()=>{
      if(c.id==='curio-box'&&await cdp.eval(visible('btnSkipIntro')))await tap('btnSkipIntro');
      await wait(states.ready,'title menu ready',90000);capture('02-title');
      await tap(states.start);await wait(states.play,'first level',90000);capture('03-gameplay');
    });
    await step('Android back opens game pause menu',async()=>{
      shell('input','keyevent','KEYCODE_BACK');await wait(states.pause,'game paused by back');capture('04-back-pause');
      await tap(states.resume);await wait(states.play,'resume by touch');
    });
  }else{
    await step('demo touch increments score',async()=>{
      const before=await cdp.eval('Number(document.querySelector("#score").textContent)');
      await tap('tap');await wait('Number(document.querySelector("#score").textContent)==='+String(before+1),'score increment');
    });
  }
  await step('Home background and foreground without automatic gameplay resume',async()=>{
    await lifecycleRoundTrip('Home',3500);
    if(states){await wait(states.pause,'game remains paused');capture('05-foreground-paused');await tap(states.resume);await wait(states.play,'manual resume');}
    else {await wait('document.querySelector("#state").textContent.includes("Resume")','demo resume prompt');await tap('resume');}
    capture('06-resumed');
  });
  await step('committed local storage survives force-stop and relaunch',async()=>{
    const key='__h5publisher_emulator_probe',value='probe-'+Date.now();
    const read='localStorage.getItem('+JSON.stringify(key)+')';
    const origin=await cdp.eval('location.origin');
    const score=states?null:await cdp.eval('Number(document.querySelector("#score").textContent)');
    await cdp.eval('localStorage.setItem('+JSON.stringify(key)+','+JSON.stringify(value)+')');
    assert.equal(await cdp.eval(read),value,'same-document readback failed');
    // WebView localStorage writes may be asynchronously committed. Exercise normal background
    // before force-stop; abrupt sub-second crash durability is a separate unverified requirement.
    await lifecycleRoundTrip('storage',10000);
    assert.equal(await cdp.eval(read),value,'pre-stop readback failed');
    await captureResources('before-force-stop');
    await detach();shell('am','force-stop',pkg);launch();cdp=await attach();
    await wait('window.H5Publisher?.isNative()===true','relaunch native bridge',90000);
    await wait(states?.boot||'document.readyState==="complete"&&!!document.querySelector("#score")','relaunch boot',90000);
    assert.equal(await cdp.eval('location.origin'),origin,'storage origin changed');
    assert.equal(await cdp.eval(read),value,'committed storage lost after force-stop');
    if(!states)assert.equal(await cdp.eval('Number(document.querySelector("#score").textContent)'),score,'demo score changed after relaunch');
    await captureResources('process-relaunch');
    capture('07-relaunch');
    return {origin,backgroundSettleMs:10000,score};
  });
  if(process.env.H5_UPGRADE_ARTIFACT){
    await step('same-signer higher-version APK upgrade preserves storage',async()=>{
      const u=upgradeConfig(c),apk=findApk(process.env.H5_UPGRADE_ARTIFACT,c.id);
      const {hash,info}=verifyArtifact(apk,u);assertUpgradePair(baseInfo,info,c);
      const bt=path.join(process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT,'build-tools','36.0.0');
      verifyBadging(cmd(path.join(bt,'aapt'),['dump','badging',apk]),u);
      const sig=cmd(path.join(bt,'apksigner'),['verify','--verbose','--print-certs',apk]);
      fs.writeFileSync(path.join(out,'upgrade-signature.txt'),sig);
      const signer=sig.match(/Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/)?.[1]?.toLowerCase();
      assert.equal(signer,baseSigner,'upgrade signer differs');
      const probe='localStorage.getItem("__h5publisher_emulator_probe")';
      const before=await cdp.eval('({origin:location.origin,value:'+probe+',score:document.querySelector("#score")?.textContent??null})');
      assert.ok(before.value?.startsWith('probe-'),'missing committed pre-upgrade probe');
      await detach();shell('am','force-stop',pkg);
      assert.match(adb('install','-r',apk),/Success/);
      const installed=shell('dumpsys','package',pkg);
      assert.match(installed,new RegExp('\\bversionCode='+u.versionCode+'\\b'),'installed version did not advance');
      launch();cdp=await attach();
      await wait('window.H5Publisher?.isNative()===true','upgrade native bridge',90000);
      await wait(states?.boot||'document.readyState==="complete"&&!!document.querySelector("#score")','upgrade boot',90000);
      const after=await cdp.eval('({origin:location.origin,value:'+probe+',score:document.querySelector("#score")?.textContent??null})');
      assert.equal(after.origin,before.origin);assert.equal(after.value,before.value,'upgrade lost stored value');
      if(!states)assert.equal(after.score,before.score,'upgrade lost demo score');
      await captureResources('upgrade-launch');capture('08-upgrade');
      report.upgrade={status:'passed',baseApkSha256:report.apkSha256,upgradeApkSha256:hash,baseVersionCode:c.versionCode,upgradeVersionCode:u.versionCode,signerSha256:signer,storagePreserved:true,demoScorePreserved:states?null:true};
      return report.upgrade;
    });
  }
  if(process.env.H5_RELOAD_STRESS==='true'){
    await step('optional explicit WebView reload stress',async()=>{
      const timeOrigin=await cdp.eval('performance.timeOrigin');
      await cdp.send('Page.reload',{ignoreCache:true});
      await wait('performance.timeOrigin!=='+timeOrigin,'new document after reload',90000);
      await wait(states?.boot||'document.readyState==="complete"&&!!document.querySelector("#tap")','reload boot',90000);
      await captureResources('explicit-reload');
      capture('08-explicit-reload');
    });
  }
  await step('runtime fault and network audit',async()=>{
    const log=adb('logcat','-d','-v','threadtime');fs.writeFileSync(path.join(out,'logcat.txt'),log);
    assert.deepEqual(classifyFaults(log,pkg),[]);
    assert.deepEqual(faults,[]);
    assert.ok(resourceSnapshots.some(x=>x.phase==='cold-launch'),'missing cold launch evidence');
    assert.ok(resourceSnapshots.some(x=>x.phase==='process-relaunch'),'missing process relaunch evidence');
    return auditResources(resourceSnapshots,network,c.id);
  });
  report.status='passed';
}catch(e){report.error=String(e.stack||e);report.failureCategory=e.infrastructure?'emulator-disconnected':'test-failure';console.error(report.error);process.exitCode=1;record(report.error);if(deviceAlive()){try{capture('99-failure');}catch(e){record(e.message);}}}
finally{
  const alive=deviceAlive();report.deviceConnectedAtCleanup=alive;
  if(alive){try{fs.writeFileSync(path.join(out,'logcat.txt'),cmd('adb',['-s',serial,'logcat','-d','-v','threadtime'],{timeout:10000}));}catch(e){record(e.message);}}
  if(alive){for(const [file,args] of [['activity-state.txt',['dumpsys','activity','activities']],['process-exit-info.txt',['dumpsys','activity','exit-info',pkg]]]){try{fs.writeFileSync(path.join(out,file),shell(...args));}catch{}}}
  fs.writeFileSync(path.join(out,'webview-console.json'),JSON.stringify(messages,null,2));
  fs.writeFileSync(path.join(out,'network-requests.json'),JSON.stringify(network,null,2));
  fs.writeFileSync(path.join(out,'webview-errors.json'),JSON.stringify(faults,null,2));
  if(logStream){logStream.kill();}
  if(alive){try{await detach();}catch(e){record(e.message);}}else if(cdp){cdp.close();cdp=null;}
  if(alive&&offline){try{shell('cmd','connectivity','airplane-mode','disable');shell('svc','wifi','enable');shell('svc','data','enable');}catch{}}
  if(alive&&installed){try{shell('am','force-stop',pkg);}catch{}}
  fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(report,null,2));
}
