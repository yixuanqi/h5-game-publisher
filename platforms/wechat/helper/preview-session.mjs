import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {chromium} from 'playwright';
import pngjs from 'pngjs';
const {PNG}=pngjs,here=path.dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function inspectPng(bytes){
  const p=PNG.sync.read(bytes),colors=new Set();let nonBlack=0;
  for(let i=0;i<p.data.length;i+=4){if(p.data[i+3]&&(p.data[i]+p.data[i+1]+p.data[i+2]>24))nonBlack++;if(i%164===0)colors.add(p.data.readUInt32LE(i));}
  return {width:p.width,height:p.height,colors:colors.size,nonBlack,area:p.width*p.height};
}
export function pixelDelta(a,b){
  const x=PNG.sync.read(a),y=PNG.sync.read(b);if(x.width!==y.width||x.height!==y.height)return null;
  let changed=0;for(let i=0;i<x.data.length;i+=4)if(Math.abs(x.data[i]-y.data[i])+Math.abs(x.data[i+1]-y.data[i+1])+Math.abs(x.data[i+2]-y.data[i+2])>24)changed++;
  return changed/(x.width*x.height);
}
export async function openPreview(project,out){
  const pkg='@weadmin/weixin-minigame-helper-mcp',dir=path.join(here,'node_modules',pkg);
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));assert.equal(meta.version,'0.1.45');
  const executable=typeof meta.bin==='string'?meta.bin:meta.bin['weixin-minigame-helper-mcp'];
  // Explicit environment allowlist; never expose CI token or publishing secrets.
  const env={PATH:process.env.PATH||'',HOME:process.env.HOME||'',CI:'true',MINIGAME_HELPER_DISABLE_AUTO_UPDATE:'1'};
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(dir,executable)],cwd:project,env,stderr:'pipe'});
  transport.stderr?.on('data',d=>fs.appendFileSync(path.join(out,'mcp-stderr.txt'),d));
  const client=new Client({name:'publisher-helper-051b',version:'0.5.1b'},{capabilities:{}});
  let browser;
  try{
    await client.connect(transport);
    const started=await client.callTool({name:'run_game',arguments:{workspacePath:project}},undefined,{timeout:60000});
    fs.writeFileSync(path.join(out,'run-game.json'),JSON.stringify(started,null,2));assert.ok(!started.isError,'run_game failed');
    const match=JSON.stringify(started).match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+(?:\/[^"\\\s<>]*)?/);
    assert.ok(match,'Missing local preview URL');const url=new URL(match[0]);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:1000,height:650},hasTouch:true});
    const page=await context.newPage(),events=[];
    const record=(type,text)=>events.push({time:Date.now(),type,text:String(text)});
    page.on('console',m=>record('console:'+m.type(),m.text()));page.on('pageerror',e=>record('pageerror',e.stack||e));page.on('requestfailed',r=>record('requestfailed',r.method()+' '+r.url()+' '+r.failure()?.errorText));page.on('response',r=>{if(r.status()>=400)record('http-error',r.status()+' '+r.url());});
    // Observation only: record actual painted strings without modifying game source,
    // state, return values, input, wx or DOM rendering behavior.
    await page.addInitScript(()=>{
      const trace=[];Object.defineProperty(globalThis,'__publisherPaintTrace051b',{value:trace});
      const p=globalThis.CanvasRenderingContext2D?.prototype;
      if(!p)return;const original=p.fillText;
      p.fillText=function(...args){const value=Reflect.apply(original,this,args);if(this.canvas?.width>=300&&this.canvas?.height>=150){trace.push({t:Date.now(),s:String(args[0]),x:args[1],y:args[2],w:this.canvas.width,h:this.canvas.height});if(trace.length>2400)trace.splice(0,1200);}return value;};
    });
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});
    async function trace(since=0){let all=[];for(const frame of page.frames()){try{all.push(...await frame.evaluate(s=>(globalThis.__publisherPaintTrace051b||[]).filter(x=>x.t>=s),since));}catch{}}return all;}
    async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await sleep(200);}return null;}
    async function gameCanvas(){
      let candidates=[];for(const frame of page.frames()){const loc=frame.locator('canvas');for(let i=0,n=await loc.count();i<n;i++){const el=loc.nth(i),box=await el.boundingBox();if(box&&box.width>=250&&box.height>=140)candidates.push({el,box});}}
      candidates.sort((a,b)=>b.box.width*b.box.height-a.box.width*a.box.height);return candidates[0]||null;
    }
    async function capture(name){
      const result=await client.callTool({name:'capture_screenshot',arguments:{format:'image/png',output:'data'}},undefined,{timeout:30000});
      const image=result.content?.find(x=>x.type==='image'&&x.mimeType==='image/png');assert.ok(!result.isError&&image,'MCP screenshot missing');
      const bytes=Buffer.from(image.data,'base64'),stats=inspectPng(bytes);fs.writeFileSync(path.join(out,name+'.png'),bytes);
      await page.screenshot({path:path.join(out,name+'-page.png')});return {bytes,stats};
    }
    async function tap(x,y){
      const c=await gameCanvas();assert.ok(c,'No visible game canvas for touch');
      // Convert the diagnostic UI's reference viewport to actual display coordinates.
      const scale=Math.min(c.box.width/844,c.box.height/390);
      const point={x:c.box.x+(c.box.width-844*scale)/2+x*scale,y:c.box.y+(c.box.height-390*scale)/2+y*scale};
      await page.touchscreen.tap(point.x,point.y);return {reference:{x,y},point,canvas:c.box};
    }
    return {page,events,trace,until,capture,tap,gameCanvas,async close(){
      fs.writeFileSync(path.join(out,'browser-events.json'),JSON.stringify(events,null,2));
      try{const result=await client.callTool({name:'get_logs',arguments:{lines:100}},undefined,{timeout:5000});fs.writeFileSync(path.join(out,'mcp-logs.json'),JSON.stringify(result,null,2));}catch(e){fs.writeFileSync(path.join(out,'mcp-log-error.txt'),String(e));}
      await browser.close().catch(()=>{});await client.close().catch(()=>{});await transport.close().catch(()=>{});
    }};
  }catch(e){await browser?.close().catch(()=>{});await client.close().catch(()=>{});await transport.close().catch(()=>{});throw e;}
}
