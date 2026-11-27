// Explicit local interactive host only. Never run in hosted CI or a sandbox.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {skillVersion,argsFor,statusGate,unwrapResponse,responseGate,fixtureGate,wxWasmFixtureGate,imageTap,pendingDecision} from './contract.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const opt=process.argv.slice(2);
function option(k){const i=opt.indexOf(k);return i<0?null:opt[i+1];}
const wxWasmInput=option('--wx-wasm-fixture'),wxWasmMode=Boolean(wxWasmInput);
const out=path.join(root,'.work',wxWasmMode?'wechat-skill-cli-0311-wx-wasm-local':'wechat-skill-cli-0311-local');
const project=wxWasmMode?path.resolve(wxWasmInput):path.join(out,'fixture'),journal=path.join(out,'private-journal.json');
const report={stage:'wechat-skill-cli-0311',backend:'wechatide-skill-call',scope:'fixture-only',officialDevTools:'not-verified',game:'not-run',device:'not-run',releaseReady:false,result:'blocked',checks:{}};
let state={step:0},token,cli,PNG;
function save(){const tmp=journal+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,journal);}
function json(s){return JSON.parse(s.trim());}
function call(tool,flags=[]){
  const args=argsFor(tool,flags,token);
  let r;
  if(process.platform==='win32'&&/\.(cmd|bat)$/i.test(cli)){
    // cmd.exe only for vendor batch launcher. Reject expansion/metacharacters.
    for(const a of [cli,...args])if(/["%&|<>^!\r\n]/.test(a))throw Error('Unsafe Windows launcher argument');
    const command='"'+[cli,...args].map(a=>'"'+a+'"').join(' ')+'"';
    r=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{windowsVerbatimArguments:true,windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
  }else r=spawnSync(cli,args,{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0)throw Error(tool+' process failed or timed out; no automatic replay');
  // Do not echo raw authenticated stdout/stderr or tokens to CI/chat.
  return unwrapResponse(json(r.stdout));
}
function checkPng(name,bg){
  const p=PNG.sync.read(fs.readFileSync(path.join(out,name)));let backgroundPixels=0,markerPixels=0;
  for(let i=0;i<p.data.length;i+=4){
    const [r,g,b,a]=p.data.subarray(i,i+4);
    if(a!==255)continue;
    if(r===bg[0]&&g===bg[1]&&b===bg[2])backgroundPixels++;
    if(r===244&&g===201&&b===93)markerPixels++;
  }
  if(backgroundPixels<1000||markerPixels<1000)throw Error('Screenshot lacks real fixture colors');
  return {width:p.width,height:p.height,backgroundPixels,markerPixels};
}
const fn=wxWasmMode?'function(){ return GameGlobal.__H5PUBLISHER_FLOAT_PIGMENT_WX__ }':'function(){ return GameGlobal.__publisherOfficial051c }';
const gate=wxWasmMode?wxWasmFixtureGate:fixtureGate;
const beforeColor=wxWasmMode?[29,95,70]:[22,50,79],afterColor=wxWasmMode?[95,63,29]:[40,107,71];
const steps=[
  {tool:'project_import',flags:()=>[]},
  {tool:'open_project_window',flags:()=>['--window-mode','fullMode']},
  {tool:'simulator_refresh',flags:()=>[]},
  {tool:'automation_runtime_info',flags:()=>['--action','systemInfo'],verify:v=>{report.checks.runtimeInfo=Boolean(v);}},
  {tool:'automation_evaluate',flags:()=>['--fn-source',fn],verify:v=>{const x=v.result??v.data??v;gate(x);state.beforeTaps=x.taps;report.checks.nativeBefore=true;}},
  {tool:'simulator_screenshot',flags:()=>['--path',path.join(out,'before.png'),'--optimize','false','--wait','1'],verify:()=>{state.before=checkPng('before.png',beforeColor);}},
  {tool:'automation_game_action',flags:()=>imageTap(state.before.width,state.before.height)},
  {tool:'automation_evaluate',flags:()=>['--fn-source',fn],verify:v=>{gate(v.result??v.data??v,{after:true,previousTaps:state.beforeTaps});}},
  {tool:'simulator_screenshot',flags:()=>['--path',path.join(out,'after.png'),'--optimize','false','--wait','1'],verify:()=>{state.after=checkPng('after.png',afterColor);}},
  {tool:'get_simulator_console',flags:()=>['--command','grep -n .'],verify:v=>{const log=JSON.stringify(v),touch=wxWasmMode?'PUBLISHER_FLOAT_PIGMENT_WX_TOUCHED_052D':'PUBLISHER_OFFICIAL_TOUCHED_051C';if(!log.includes(touch))throw Error('Fixture touch console marker missing');if(wxWasmMode&&!log.includes('PUBLISHER_FLOAT_PIGMENT_WX_READY_052D'))throw Error('WX WASM ready console marker missing');state.logVerified=true;}}
];
if(opt.includes('--phone-preview'))steps.push({tool:'auto_preview',flags:()=>[],verify:()=>{state.phonePreview=true;report.checks.phonePreview=true;}});
try{
  if(!opt.includes('--interactive-host')||!['win32','darwin'].includes(process.platform)||process.env.CI||process.env.GITHUB_ACTIONS)throw Error('LOCAL_INTERACTIVE_HOST_REQUIRED: do not run wechatide in sandbox/CI');
  const install=option('--installation-report');
  if(!install||!path.isAbsolute(install))throw Error('Run Skill installation diagnostic locally first; provide absolute --installation-report path');
  const ready=json(fs.readFileSync(install,'utf8'));
  if(ready.compatible!==true||ready.mustEnterInstaller===true||typeof ready.command!=='string'||!path.isAbsolute(ready.command)||!fs.existsSync(ready.command))throw Error('INSTALLATION_NOT_READY');
  cli=ready.command;token=process.env.WECHATIDE_CLI_TOKEN||undefined;
  const status=call('check_wechatide_status',['--skill-version',skillVersion]);
  const blocker=statusGate(status,Boolean(token));if(blocker)throw Error(blocker);
  report.checks.versionRelation=status.versionRelation;report.checks.loginReady=true;
  report.checks.cliTokenRequired=!!(status.cliTokenRequired??status.tokenRequired);
  if(!opt.includes('--fixture')&&!wxWasmMode){
    report.result='environment-ready'; // Readiness only, never official execution.
  }else{
    // Reuse existing pinned pngjs dependency, not a new third-party runtime.
    const require=createRequire(path.join(here,'../devtools/package.json'));({PNG}=require('pngjs'));
    fs.mkdirSync(out,{recursive:true});
    if(fs.existsSync(journal)){
      state=json(fs.readFileSync(journal,'utf8'));
      if(!opt.includes('--resume'))throw Error('Existing local journal; use --resume after reviewing pending/failed state');
    }else{
      if(wxWasmMode){
        if(!path.isAbsolute(wxWasmInput)||!fs.existsSync(project))throw Error('WX WASM fixture must be an existing absolute directory');
        for(const name of ['game.js','game.json','project.config.json','layout-runtime.js','float-pigment-layout.wasm','fixture-manifest.json'])if(!fs.existsSync(path.join(project,name)))throw Error('WX WASM fixture missing '+name);
      }else{
        if(fs.existsSync(project))throw Error('Unexpected existing fixture directory');
        fs.cpSync(path.join(here,'../devtools/fixture'),project,{recursive:true,errorOnExist:true,force:false});
      }
      save();
    }
    const config=json(fs.readFileSync(path.join(project,'project.config.json'),'utf8'));
    if(config.compileType!=='game'||config.appid!=='touristappid')throw Error('Only isolated touristappid fixture authorized');
    if(state.inflight&&!state.pendingTask)throw Error('Prior outcome uncertain; inspect local IDE, do not replay');
    if(state.pendingTask){
      const p=state.pendingTask,step=steps[state.step];
      if(p.tool!==step?.tool)throw Error('Journal mismatch');
      const v=call('polling_task_result',['--task-id',p.taskId]);
      const decision=pendingDecision(v);
      if(decision!=='advance')throw Error('Previous task '+decision+'; no replay');
      step.verify?.(v);state.step++;delete state.pendingTask;delete state.inflight;save();
    }
    while(state.step<steps.length){
      const step=steps[state.step];state.inflight=step.tool;save();
      const v=call(step.tool,['--project',project,...step.flags()]);
      const result=responseGate(v);
      if(result.pending){
        state.pendingTask={tool:step.tool,taskId:result.taskId,status:'pending'};save();
        throw Error('USER_CONFIRMATION_REQUIRED: confirm in IDE, then rerun --fixture --resume; never resend pending tool');
      }
      step.verify?.(v);state.step++;delete state.inflight;save();
    }
    if(!state.before||!state.after||!state.logVerified)throw Error('Missing fixture evidence');
    report.checks.fixture={kind:wxWasmMode?'float-pigment-wx-wasm-052d':'official-051c',before:state.before,after:state.after,logVerified:true,phonePreview:!!state.phonePreview};
    report.officialDevTools=wxWasmMode?'wx-wasm-fixture-executed':'fixture-executed';report.result='pass';
  }
}catch(e){report.blocker=String(e.message||e);process.exitCode=1;}
finally{
  // Only local reports: never upload authenticated session artifacts or journal.
  if(opt.includes('--interactive-host')&&['win32','darwin'].includes(process.platform)&&!process.env.CI&&!process.env.GITHUB_ACTIONS){
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'probe-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  console.log(JSON.stringify(report));
}
