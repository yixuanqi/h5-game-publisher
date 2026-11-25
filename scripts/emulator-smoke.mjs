import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {findApk,verifyArtifact,verifyBadging,classifyFaults,visible} from './emulator-lib.mjs';
const [config,artifactDir,reportDir]=process.argv.slice(2);
if(!config||!artifactDir||!reportDir)throw Error('Usage: node scripts/emulator-smoke.mjs <config> <artifact-dir> <report-dir>');
const c=JSON.parse(fs.readFileSync(config,'utf8')), pkg=c.appId;
if(!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pkg))throw Error('Invalid appId');
const out=path.resolve(reportDir);fs.mkdirSync(out,{recursive:true});
const report={game:c.id,appId:pkg,version:c.versionName,run:process.env.GITHUB_RUN_ID||null,status:'failed',tests:[],limitations:['Software GPU; no audio output; no real-device performance verdict','Storage probe is not an actual game-save progression test','Single-touch start/menu interaction; no full combat or multitouch assertion']};
const messages=[], faults=[], network=[];
let cdp,port,offline=false,installed=false,serial=null;
function cmd(exe,args,opts={}){
  const r=spawnSync(exe,args,{encoding:opts.binary?null:'utf8',timeout:60000,maxBuffer:32*1024*1024});
  if(r.error||r.status!==0){if(opts.allowFail)return opts.binary?Buffer.alloc(0):'';throw Error(exe+' '+args.join(' ')+': '+(r.error||r.stderr||r.stdout));}
  return r.stdout;
}
const adb=(...args)=>cmd('adb',serial?['-s',serial,...args]:args);
const shell=(...args)=>adb('shell',...args).trim();
const capture=(name)=>{const b=cmd('adb',['exec-out','screencap','-p'],{binary:true});assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');fs.writeFileSync(path.join(out,name+'.png'),b);};
async function step(name,fn){const start=Date.now();try{const detail=await fn();report.tests.push({name,status:'passed',ms:Date.now()-start,detail:detail??null});console.log('PASS '+name);}catch(e){report.tests.push({name,status:'failed',ms:Date.now()-start,error:String(e.message||e)});throw e;}finally{fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(report,null,2));}}
async function eventually(fn,desc,ms=60000){let last;const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(e){last=e;}await sleep(350);}throw Error('Timeout: '+desc+(last?' ('+last.message+')':''));}
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
  send(method,params={}){const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},10000);this.pending.set(id,{resolve,reject,timer});try{this.ws.send(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
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
const wait=(expr,desc,ms)=>eventually(()=>cdp.eval(expr),desc,ms);
async function tap(id){
  await wait(visible(id),'visible '+id);
  const point=await cdp.eval('(()=>{const r=document.getElementById('+JSON.stringify(id)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await sleep(90);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
const states=c.id==='ashen-bell-vow'?{boot:'window.__ABV_BOOTED__===true',ready:'document.body.dataset.gameState==="title"',start:'btn-start',play:'document.body.dataset.gameState==="playing"',pause:'document.body.dataset.gameState==="modal"&&!document.querySelector("#pause-modal").classList.contains("hidden")',resume:'btn-pause-resume'}:c.id==='curio-box'?{boot:'!!window.CB?.game?.map',ready:'window.CB?.game?.titleOpen&&!window.CB.game.introActive',start:'btnTitleStart',play:'window.CB?.game?.run.phase==="playing"&&!window.CB.game.titleOpen&&!window.CB.game.paused',pause:'window.CB?.game?.paused===true',resume:'btnPauseResume'}:null;
try{
  await step('isolated emulator device only',()=>{
    const devices=cmd('adb',['devices']).split(/\r?\n/).slice(1).filter(l=>l.trim());
    assert.equal(devices.length,1,'one dedicated emulator required');
    const match=devices[0].match(/^(emulator-\d+)\s+device\s*$/);assert.ok(match,'refusing physical or unavailable device');serial=match[1];
    assert.equal(shell('getprop','ro.kernel.qemu'),'1');return serial;
  });
  await step('artifact integrity, APK manifest and signature',()=>{
    const apk=findApk(artifactDir,c.id);const {hash}=verifyArtifact(apk,c);report.apkSha256=hash;
    const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
    const bt=path.join(sdk,'build-tools','36.0.0');
    verifyBadging(cmd(path.join(bt,'aapt'),['dump','badging',apk]),c);
    fs.writeFileSync(path.join(out,'signature.txt'),cmd(path.join(bt,'apksigner'),['verify','--verbose','--print-certs',apk]));
    adb('logcat','-c');assert.match(adb('install',apk),/Success/);installed=true;return hash;
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
    launch();cdp=await attach();
    await wait('window.H5Publisher?.isNative()===true','Capacitor native bridge');
    await wait(states?.boot||'document.readyState==="complete"&&!!document.querySelector("#tap")','game boot',90000);
    await wait('innerWidth>innerHeight&&innerHeight>0','landscape viewport');
    capture('01-launch');
    // Observe a full local resource load with CDP already attached; first launch above is independently checked.
    await cdp.send('Page.reload',{ignoreCache:true});
    await wait(states?.boot||'document.readyState==="complete"&&!!document.querySelector("#tap")','reload boot',90000);
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
    shell('input','keyevent','KEYCODE_HOME');
    await eventually(()=>!shell('dumpsys','activity','activities').split('\n').some(l=>/mResumedActivity|topResumedActivity/.test(l)&&l.includes(pkg+'/')),'app not foreground');
    await sleep(1200);launch();
    await wait('window.H5Publisher?.isPaused()===false&&!document.hidden','native foreground');
    if(states){await wait(states.pause,'game remains paused');capture('05-foreground-paused');await tap(states.resume);await wait(states.play,'manual resume');}
    else {await wait('document.querySelector("#state").textContent.includes("Resume")','demo resume prompt');await tap('resume');}
    capture('06-resumed');
  });
  await step('local storage survives force-stop and relaunch',async()=>{
    const key='__h5publisher_emulator_probe',value='probe-'+Date.now();
    await cdp.eval('localStorage.setItem('+JSON.stringify(key)+','+JSON.stringify(value)+')');
    await sleep(700);await detach();shell('am','force-stop',pkg);launch();cdp=await attach();
    await wait(states?.boot||'document.readyState==="complete"','relaunch boot',90000);
    assert.equal(await cdp.eval('localStorage.getItem('+JSON.stringify(key)+')'),value);
    if(!states)assert.ok(await cdp.eval('Number(document.querySelector("#score").textContent)>0'));
    capture('07-relaunch');
  });
  await step('runtime fault and network audit',async()=>{
    const log=adb('logcat','-d','-v','threadtime');fs.writeFileSync(path.join(out,'logcat.txt'),log);
    assert.deepEqual(classifyFaults(log,pkg),[]);
    assert.deepEqual(faults,[]);
    assert.deepEqual(network.filter(u=>!(/^(https?:\/\/localhost(?:[:/]|$)|data:|blob:|about:)/i.test(u))),[]);
    assert.ok(network.length>0,'expected observed WebView requests');
  });
  report.status='passed';
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;try{capture('99-failure');}catch{}}
finally{
  try{fs.writeFileSync(path.join(out,'logcat.txt'),adb('logcat','-d','-v','threadtime'));}catch{}
  fs.writeFileSync(path.join(out,'webview-console.json'),JSON.stringify(messages,null,2));
  fs.writeFileSync(path.join(out,'network-requests.json'),JSON.stringify(network,null,2));
  fs.writeFileSync(path.join(out,'webview-errors.json'),JSON.stringify(faults,null,2));
  try{await detach();}catch{}
  if(offline){try{shell('cmd','connectivity','airplane-mode','disable');shell('svc','wifi','enable');shell('svc','data','enable');}catch{}}
  if(installed){try{shell('am','force-stop',pkg);}catch{}}
  fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(report,null,2));
}
