import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import pngjs from 'pngjs';
const {PNG}=pngjs;
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=path.join(root,'.work/wechat-devtools-051c');
fs.mkdirSync(out,{recursive:true});
const project=path.join(out,'fixture');fs.cpSync(path.join(here,'fixture'),project,{recursive:true});
const port=9420,cli=process.env.WECHAT_DEVTOOLS_CLI,vendor=path.join(root,'.work/wechat-dev-mcp-vendor');
const report={stage:'0.5.1c',environment:'official-devtools-windows-hosted',scope:'fixture-only',framework:process.env.GITHUB_SHA||null,checks:{},result:'fail',officialDevTools:'not-verified',game:'not-run',device:'not-run',releaseReady:false};
const save=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function textOf(r){return r.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')||'';}
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|OS|SYSTEMDRIVE|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)));
env.WECHAT_PORT=String(port);env.WECHAT_CLI_TIMEOUT='45000';
let client,transport,children=[];
function command(name,args,timeout=30000){
  for(const a of [cli,...args])assert.ok(typeof a==='string'&&!/["%&|<>^!\r\n]/.test(a),'Unsafe CLI argument');
  const cmd='"'+cli+'" '+args.map(a=>'"'+a+'"').join(' ');
  const log=fs.openSync(path.join(out,name+'.log'),'w');
  const c=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','"'+cmd+'"'],{env,windowsVerbatimArguments:true,windowsHide:true,stdio:['ignore',log,log]});
  fs.closeSync(log);children.push(c);
  return new Promise(resolve=>{
    let done=false;const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
    const timer=setTimeout(()=>{c.kill();finish({timeout:true});},timeout);
    c.on('error',e=>finish({error:String(e)}));c.on('exit',(code,signal)=>finish({code,signal}));
  });
}
function listening(){return new Promise(resolve=>{const c=net.createConnection({host:'127.0.0.1',port});const finish=v=>{c.destroy();resolve(v);};c.setTimeout(800);c.once('connect',()=>finish(true));c.once('timeout',()=>finish(false));c.once('error',()=>finish(false));});}
async function call(name,args={},timeout=20000){const r=await client.callTool({name,arguments:args},undefined,{timeout});save('mcp-'+name+'.json',r);if(r.isError)throw Error(name+': '+textOf(r));return textOf(r);}
async function state(){return JSON.parse(await call('evaluate',{script:'return GameGlobal.__publisherOfficial051c || null'}));}
function checkPng(name,color){
  const p=PNG.sync.read(fs.readFileSync(path.join(out,name)));let bg=0,mark=0;
  for(let i=0;i<p.data.length;i+=4){const [r,g,b,a]=p.data.subarray(i,i+4);if(a!==255)continue;if(r===color[0]&&g===color[1]&&b===color[2])bg++;if(r===244&&g===201&&b===93)mark++;}
  assert.ok(bg>1000&&mark>1000,'Screenshot lacks fixture pixels');
  return {width:p.width,height:p.height,backgroundPixels:bg,markerPixels:mark};
}
try{
  assert.equal(process.platform,'win32');assert.ok(cli&&fs.existsSync(cli),'Official CLI missing');
  report.checks.installed=true;
  const ver=JSON.parse(fs.readFileSync(path.join(vendor,'package.json'),'utf8'));assert.equal(ver.version,'2.0.0');
  transport=new StdioClientTransport({command:process.execPath,args:[path.join(vendor,'index.js')],cwd:project,env,stderr:'pipe'});
  transport.stderr?.on('data',d=>fs.appendFileSync(path.join(out,'mcp-stderr.log'),d));
  client=new Client({name:'publisher-official-devtools',version:'0.5.1c'},{capabilities:{}});
  await client.connect(transport);const list=await client.listTools();save('mcp-tools.json',list.tools.map(t=>({name:t.name,inputSchema:t.inputSchema})));
  for(const n of ['connect','evaluate','check_health','get_console_logs'])assert.ok(list.tools.some(t=>t.name===n),'MCP tool missing '+n);
  report.checks.mcpHandshake=true;
  report.cliHelp=await command('cli-help',['--help']);
  assert.equal(report.cliHelp.code,0,'CLI help failed/timed out');
  assert.match(fs.readFileSync(path.join(out,'cli-help.log'),'utf8'),/open|auto|islogin/i);
  report.checks.cliHelp=true;
  assert.equal(await listening(),false,'Unexpected pre-existing automation listener');
  report.open=await command('cli-auto',['auto','--project',project,'--auto-port',String(port)],45000);
  let connected=false;for(let i=0;i<25;i++){if(await listening()){connected=true;break;}await pause(1000);}
  report.checks.automationPort=connected;
  if(!connected){report.blocker='Official CLI did not expose automation port; inspect CLI log for login/service-port/desktop requirements';throw Error(report.blocker);}
  await call('connect',{wsEndpoint:'ws://127.0.0.1:'+port,projectPath:project},45000);
  const health=JSON.parse(await call('check_health'));assert.equal(health.connected,true);assert.equal(health.projectType,'game');report.health=health;
  report.checks.mcpConnected=true;
  let initial;for(let i=0;i<10;i++){initial=await state();if(initial?.marker==='PUBLISHER_OFFICIAL_READY_051C')break;await pause(500);}
  assert.equal(initial?.marker,'PUBLISHER_OFFICIAL_READY_051C','Fixture game.js not executed');
  report.officialDevTools='fixture-executed';report.checks.fixtureExecuted=true;report.nativeProbe=initial;
  assert.equal(initial.storage.immediate,true,'Official storage roundtrip failed');assert.equal(initial.storage.removed,true,'Official storage removal failed');
  assert.equal(initial.files.bin.ok,true,'Official .bin read failed');report.checks.storageAndBin=true;
  await call('game_canvas_screenshot',{path:path.join(out,'before.png')});report.before=checkPng('before.png',[22,50,79]);
  report.touchBackend=await call('game_touch',{x:100,y:100,type:'tap'});
  const after=await state();assert.ok(after.taps>initial.taps,'Touch did not reach fixture');
  await call('game_canvas_screenshot',{path:path.join(out,'after.png')});report.after=checkPng('after.png',[40,107,71]);
  const logs=await call('get_console_logs',{limit:100});assert.match(logs,/PUBLISHER_OFFICIAL_TOUCHED_051C/);
  report.checks.touchScreenshotLogs=true;report.result='pass';
}catch(e){report.error=String(e?.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(client)await client.close().catch(()=>{});if(transport)await transport.close().catch(()=>{});
  for(const c of children)if(c.exitCode===null)c.kill();
  save('probe-report.json',report);console.log(JSON.stringify(report));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Official DevTools V0.5.1c\n- Result: '+report.result+'\n- Runtime: '+report.officialDevTools+'\n- Blocker: '+(report.blocker||report.error||'none')+'\n- Release ready: false\n');
}
