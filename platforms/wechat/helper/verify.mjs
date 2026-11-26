import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {chromium} from 'playwright';
import pngjs from 'pngjs';
const {PNG}=pngjs;
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..'),out=path.join(root,'.work/wechat-helper-051a');
fs.mkdirSync(out,{recursive:true});
const project=path.join(out,'fixture');fs.cpSync(path.join(here,'fixture'),project,{recursive:true});
const spec=JSON.parse(fs.readFileSync(path.join(here,'package.json'),'utf8'));
const installed=name=>JSON.parse(fs.readFileSync(path.join(here,'node_modules',name,'package.json'),'utf8'));
const report={kind:'helper-compatibility-tooling-not-devtools',stage:'0.5.1a',framework:process.env.GITHUB_SHA||null,versions:{},checks:{},officialDevTools:'not-run',device:'not-run',releaseReady:false};
const write=(name,data)=>fs.writeFileSync(path.join(out,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');
const env={...process.env,MINIGAME_HELPER_DISABLE_AUTO_UPDATE:'1',CI:'true'};
for(const key of Object.keys(env))if(/TOKEN|SECRET|PRIVATE_KEY|WECHAT_APPID|UPLOAD_KEY|PASSWORD/i.test(key))delete env[key];
function executable(name,bin){const p=installed(name),rel=typeof p.bin==='string'?p.bin:p.bin?.[bin];assert.ok(rel,'Missing executable '+bin);return path.join(here,'node_modules',name,rel);}
function cli(args){
  const r=spawnSync(process.execPath,[executable('@weadmin/minigame-helper','minigame-helper'),...args],{cwd:project,env,encoding:'utf8',timeout:30000});
  write('cli-'+args.join('-').replace(/[^a-z0-9-]/gi,'')+'.txt',(r.stdout||'')+'\n'+(r.stderr||''));
  if(r.error)throw r.error;assert.equal(r.status,0,'CLI '+args.join(' ')+' failed');return (r.stdout||'')+'\n'+(r.stderr||'');
}
function localUrl(result){
  const candidates=JSON.stringify(result).match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+(?:\/[^"\\\s<>]*)?/g)||[];
  const url=candidates[0];assert.ok(url,'MCP did not return a loopback preview URL');
  const parsed=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname));return parsed.href;
}
let client,transport,browser;
try{
  for(const [name,version] of Object.entries(spec.dependencies)){assert.equal(installed(name).version,version);report.versions[name]=version;}
  const version=cli(['--version']);assert.match(version,/0\.1\.50/);cli(['--help']);cli(['preview','--help']);report.checks.cli=true;
  transport=new StdioClientTransport({command:process.execPath,args:[executable('@weadmin/weixin-minigame-helper-mcp','weixin-minigame-helper-mcp')],cwd:project,env,stderr:'pipe'});
  transport.stderr?.on('data',d=>fs.appendFileSync(path.join(out,'mcp-stderr.txt'),d));
  client=new Client({name:'h5-game-publisher-preview-verifier',version:'0.5.1a'},{capabilities:{}});
  await client.connect(transport);
  const catalog=[];let cursor;
  do{const res=await client.listTools(cursor?{cursor}:{});catalog.push(...res.tools);cursor=res.nextCursor;}while(cursor);
  write('mcp-tools.json',catalog.map(t=>({name:t.name,inputSchema:t.inputSchema})));
  for(const name of ['run_game','get_logs','capture_screenshot'])assert.ok(catalog.some(t=>t.name===name),'Missing '+name);
  report.checks.mcpHandshakeAndTools=true;
  // No upload, QR generation, publish, or remote project calls.
  const started=await client.callTool({name:'run_game',arguments:{workspacePath:project}},undefined,{timeout:60000});
  write('mcp-run-game.json',started);assert.ok(!started.isError,'run_game failed');
  const url=localUrl(started);report.checks.runGame=true;report.previewUrl=url;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1000,height:650}});
  const observed=[],errors=[];
  page.on('console',m=>observed.push({type:m.type(),text:m.text()}));
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  let logged=false,storage=null;
  // Keep all five genuine observations; neither mock wx nor modify vendor runtime.
  for(let i=0;i<20;i++){
    const result=await client.callTool({name:'get_logs',arguments:{}},undefined,{timeout:10000});
    write('mcp-logs.json',result);
    if(!result.isError&&JSON.stringify(result).includes('PUBLISHER_HELPER_FIXTURE_READY_051A'))logged=true;
    if(observed.some(x=>x.text.includes('PUBLISHER_HELPER_STORAGE_051A ')&&x.text.includes('"attempt":5')))break;
    await new Promise(r=>setTimeout(r,1000));
  }
  write('browser-console.json',{observed,errors});
  await page.screenshot({path:path.join(out,'browser-preview.png')});
  const expected=observed.filter(x=>x.text.includes('PUBLISHER_HELPER_STORAGE_051A ')).map(x=>{try{return JSON.parse(x.text.split('PUBLISHER_HELPER_STORAGE_051A ')[1]);}catch{return null;}}).filter(Boolean);
  storage=expected.at(-1)||null;report.storage=storage;report.storageAttempts=expected;
  assert.deepEqual(expected.map(x=>x.attempt),[1,2,3,4,5],'Missing storage probe observations');
  report.checks.fixtureSyncStorage=expected.every(x=>x.immediate===true&&x.removed===true&&!x.error);report.checks.fixtureBrowserExecution=observed.some(x=>x.text.includes('PUBLISHER_HELPER_FIXTURE_READY_051A'));report.checks.mcpLog=logged;
  console.log('[fixture diagnostics]',JSON.stringify({storage,logged,browserReady:report.checks.fixtureBrowserExecution,errors,tail:observed.slice(-12)}));
  assert.ok(report.checks.fixtureBrowserExecution,'Fixture ready marker missing from browser console');assert.equal(errors.length,0,errors.join('\n'));
  const capture=await client.callTool({name:'capture_screenshot',arguments:{format:'image/png',output:'data'}},undefined,{timeout:30000});
  console.log('[capture receipt]',JSON.stringify({isError:capture.isError,content:capture.content?.map(c=>({type:c.type,mimeType:c.mimeType,text:c.type==='text'?c.text?.slice(0,500):undefined}))}));
  assert.ok(!capture.isError,'capture_screenshot failed');
  const image=capture.content?.find(c=>c.type==='image'&&typeof c.data==='string');
  if(image){
    const buf=Buffer.from(image.data,'base64');assert.equal(image.mimeType,'image/png');
    const decoded=PNG.sync.read(buf);assert.ok(decoded.width>=320&&decoded.height>=180,'Unexpected screenshot size');
    let background=0,marker=0;for(let i=0;i<decoded.data.length;i+=4){const [r,g,b,a]=decoded.data.subarray(i,i+4);if(a!==255)continue;if(r===22&&g===50&&b===79)background++;if(r===244&&g===201&&b===93)marker++;}
    assert.ok(background>10000&&marker>1000,'MCP screenshot does not contain actual fixture pixels');
    report.screenshot={width:decoded.width,height:decoded.height,backgroundPixels:background,markerPixels:marker};
    write('mcp-screenshot-meta.json',{mimeType:image.mimeType,bytes:buf.length,...report.screenshot});fs.writeFileSync(path.join(out,'mcp-screenshot.png'),buf);
  }
  else{
    // Keep the real receipt; never claim a verified MCP image when not returned.
    write('mcp-screenshot-response.json',capture);throw Error('MCP screenshot did not return an image content block');
  }
  report.checks.mcpScreenshot=true;
  // Tooling is usable through MCP for start/capture and through the actual browser for logs.
  // Compatibility remains a distinct fail-closed gate, not an assumed success.
  report.logBackend=logged?'mcp':'playwright-console';
  report.compatibilityBlockers=[];
  if(!logged)report.compatibilityBlockers.push('MCP_LOG_STREAM_MISSING');
  if(!report.checks.fixtureSyncStorage)report.compatibilityBlockers.push('WX_SYNC_STORAGE_MISMATCH');
  report.strictCompatibility=report.compatibilityBlockers.length?'blocked':'pass';
  report.result='pass';
  report.scope='tooling-only';
}catch(e){report.result='fail';report.error=String(e?.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(browser)await browser.close().catch(()=>{});
  if(client)await client.close().catch(()=>{});
  if(transport)await transport.close().catch(()=>{});
  write('report.json',report);console.log(JSON.stringify(report));
}
