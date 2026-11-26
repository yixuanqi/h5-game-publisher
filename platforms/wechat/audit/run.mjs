import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {parse} from 'acorn';
import {parseHTML} from 'linkedom';
import {chromium} from 'playwright';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob,digestManifest,within} from '../../../scripts/source-integrity.mjs';
import {collect,summarize} from './inventory.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream'),source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-audit-052a'),raw=path.join(work,'raw'),out=path.join(work,'evidence');
assertDisjoint(checkout,work);assert.ok(!fs.existsSync(work),'Use a fresh audit workspace');
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);
const before=snapshot(source);
fs.mkdirSync(out,{recursive:true});
const save=(name,v)=>fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2)+'\n');
const report={stage:'0.5.2a',sourceSha:spec.sourceSha,mainBlob:spec.mainBlob,framework:git(root,'rev-parse','HEAD'),frameworkDirty:!!git(root,'status','--porcelain','--untracked-files=all'),result:'fail',officialDevTools:'not-run',gameplayParity:'not-run',releaseReady:false};
const errors=[];let server,browser,rawBefore;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
function experiment(code,html,mode){
  const sandbox={};
  let capabilities={};
  if(mode==='linkedom'){
    const {window,document}=parseHTML(html);
    const canvas=document.getElementById('gameCanvas');
    const box=document.createElement('div');box.style.width='80px';box.style.height='40px';document.body.appendChild(box);
    const check=fn=>{try{return fn();}catch(e){return {error:String(e)};}};
    capabilities={titleElement:!!document.getElementById('title-screen'),querySelector:!!document.querySelector('#gameCanvas'),layout:check(()=>{const r=box.getBoundingClientRect();return {width:r.width,height:r.height};}),computedStyle:check(()=>typeof window.getComputedStyle),canvas2d:check(()=>!!canvas.getContext('2d')),localStorage:check(()=>!!window.localStorage),audioContext:check(()=>typeof window.AudioContext)};
    // Only actual DOM candidate objects. No fake geometry, canvas, network, timing or game state.
    sandbox.window=window;sandbox.document=document;
  }
  const ctx=vm.createContext(sandbox);
  let result;
  try{vm.runInContext(code,ctx,{timeout:3000,filename:'original-main.bundle.js'});result={status:'returned',note:'Synchronous return alone is not successful boot'};}
  catch(e){result={status:'blocked',error:String(e),stack:String(e.stack).split('\n').slice(0,12)};}
  return {mode,capabilities,...result,officialRuntime:false,bootVerified:false};
}
try{
  const imported=exportGame(spec.game,checkout,raw);rawBefore=snapshot(raw);
  report.sourceTreeSha256=imported.sourceTreeSha256;report.rawFilesSha256=imported.sourceFilesSha256;
  const html=fs.readFileSync(path.join(raw,'index.html'),'utf8');
  const parsed=parseHTML(html).document;
  const bundle=await build({absWorkingDir:raw,entryPoints:['src/main.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2018',metafile:true,logLevel:'silent'});
  const graph=Object.entries(bundle.metafile.inputs).map(([file,v])=>({file,bytes:v.bytes,imports:v.imports.map(i=>({path:i.path,kind:i.kind,external:!!i.external}))}));
  assert.ok(graph.some(x=>x.file==='src/main.js'),'Original main missing from graph');
  const hits=[];
  for(const g of graph.filter(g=>/\.(?:m?js)$/.test(g.file))){
    const p=path.resolve(raw,g.file);assert.ok(within(raw,p),'External source input');
    hits.push(...collect(parse(fs.readFileSync(p,'utf8'),{ecmaVersion:'latest',sourceType:'module',locations:true}),g.file));
  }
  const scripts=[...parsed.querySelectorAll('script')].map((s,i)=>({index:i,src:s.getAttribute('src'),type:s.getAttribute('type')||'classic',inline:!s.hasAttribute('src')}));
  for(const [i,s] of [...parsed.querySelectorAll('script')].entries())if(!s.hasAttribute('src')&&(!s.getAttribute('type')||['module','text/javascript','application/javascript'].includes(s.getAttribute('type'))))hits.push(...collect(parse(s.textContent,{ecmaVersion:'latest',sourceType:s.getAttribute('type')==='module'?'module':'script',locations:true}),'index.html:inline-'+i));
  save('static-audit.json',{graph,scripts,htmlElements:parsed.querySelectorAll('*').length,htmlIds:[...parsed.querySelectorAll('[id]')].map(e=>e.id).sort(),apiCandidates:summarize(hits),limitations:['AST syntactic candidates, not resolved globals; aliases and dynamic calls may be missed','Inline line numbers are relative to the script','CSS coverage recorded separately in real Chromium']});
  report.moduleCount=graph.length;report.apiCandidateCount=summarize(hits).length;
  const code=bundle.outputFiles[0].text;
  const attempts=[experiment(code,html,'bare'),experiment(code,html,'linkedom')];
  assert.equal(attempts[0].status,'blocked','Bare control unexpectedly returned');
  save('entry-experiment.json',{entry:'src/main.js',bundleSha256:(await import('../../../scripts/source-integrity.mjs')).sha256(code),attempts,limitations:['Original main module graph only; inline HTML boot scripts not executed in VM','Node VM is a diagnostic for trusted pinned source, not a security sandbox or WeChat runtime','Missing API does not prove all later APIs unsupported']});
  report.entryExperiment=attempts.map(({mode,status,error,capabilities})=>({mode,status,error,capabilities}));
  // Real H5, no source rewrite, network restricted to the local read-only export.
  server=http.createServer((req,res)=>{
    try{const u=new URL(req.url,'http://127.0.0.1'),p=path.resolve(raw,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
      if(!within(raw,p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(p).pipe(res);
    }catch{res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  const scenarios=[];
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1},{name:'mobile',viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true}]){
    const {name,...options}=profile;
    const ctx=await browser.newContext({...options,serviceWorkers:'block'});
    const page=await ctx.newPage(),logs=[],failed=[],external=[],runtime=[];
    page.on('pageerror',e=>errors.push(name+': '+String(e)));
    page.on('console',m=>{if(logs.length<500)logs.push({type:m.type(),text:m.text().slice(0,2000)});});
    page.on('requestfailed',r=>failed.push({url:r.url().replace(origin,''),error:r.failure()?.errorText}));
    page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url().replace(origin,''),status:r.status()});});
    await ctx.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
    const begin=Date.now();
    try{
      await page.goto(origin+'/',{waitUntil:'load',timeout:30000});
      await page.waitForFunction(()=>window.__ABV_BOOTED__===true,{},{timeout:45000});
      const bootMs=Date.now()-begin;
      await page.locator('#btn-title-settings').waitFor({state:'visible',timeout:45000});
      const snap=async label=>{
        await page.screenshot({path:path.join(out,name+'-'+label+'.png'),timeout:20000});
        runtime.push(await page.evaluate(label=>{
          const shown=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
          const properties=new Map(),rules={count:0,selectors:[]};
          function walk(list){for(const r of list){rules.count++;if(r.selectorText&&rules.selectors.length<200)rules.selectors.push(r.selectorText);if(r.style)for(const p of r.style)properties.set(p,(properties.get(p)||0)+1);if(r.cssRules)walk(r.cssRules);}}
          for(const sheet of document.styleSheets)walk(sheet.cssRules);
          return {label,gameState:document.body.dataset.gameState??null,visibleIds:[...document.querySelectorAll('[id]')].filter(shown).map(e=>e.id),canvas:[...document.querySelectorAll('canvas')].map(c=>({id:c.id,width:c.width,height:c.height})),css:{ruleCount:rules.count,propertyCounts:Object.fromEntries(properties),selectorSamples:rules.selectors},storageKeys:Object.keys(localStorage).sort(),memory:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize}:null};
        },label));
      };
      const click=async id=>{const l=page.locator('#'+id);if(name==='mobile')await l.tap({timeout:15000});else await l.click({timeout:15000});};
      await snap('title');
      await click('btn-title-settings');await page.locator('#settings-modal').waitFor({state:'visible',timeout:15000});await snap('settings');await click('btn-close-settings');
      await click('btn-title-slots');await page.locator('#title-slots-drawer').waitFor({state:'visible',timeout:15000});await snap('slots');await click('btn-close-slots-drawer');
      await click('btn-start');
      // Intro may consume first click; repeat only while the original start button remains visible.
      try{await page.locator('#title-screen').waitFor({state:'hidden',timeout:5000});}catch{if(await page.locator('#btn-start').isVisible())await click('btn-start');}
      await page.locator('#title-screen').waitFor({state:'hidden',timeout:20000});
      await page.locator('#hud').waitFor({state:'visible',timeout:20000});await snap('gameplay');
      const timing=await page.evaluate(()=>new Promise(resolve=>{const d=[];let prev;function f(t){if(prev!==undefined)d.push(t-prev);prev=t;if(d.length<60)requestAnimationFrame(f);else{d.sort((a,b)=>a-b);resolve({count:d.length,medianMs:d[30],p95Ms:d[56]});}}requestAnimationFrame(f);}));
      scenarios.push({name,profile,bootMs,timing,runtime,logs,failed,external,status:'pass'});
    }catch(e){scenarios.push({name,profile,runtime,logs,failed,external,status:'fail',error:String(e)});errors.push(name+': '+String(e));await page.screenshot({path:path.join(out,name+'-failure.png'),timeout:10000}).catch(()=>{});}
    finally{await ctx.close();save('h5-baseline.json',{browserVersion:browser.version(),scenarios,errors,limitations:['Service workers deliberately disabled; this is not PWA/offline-cache testing','Frame intervals measured in headless Chromium, not device FPS','No deterministic gameplay replay yet']});}
  }
  report.baseline=scenarios.map(({name,status,bootMs,timing,failed,external})=>({name,status,bootMs,timing,failed,external}));
  assert.ok(!errors.length,'Baseline errors: '+errors.join('; '));
  assert.ok(scenarios.every(s=>s.status==='pass'&&!s.external.length&&!s.failed.length),'Baseline request or scenario failure');
  report.result='pass';
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  try{assertSnapshot(source,before,'Original source');if(rawBefore)assertSnapshot(raw,rawBefore,'Raw export');report.sourceIntegrity='pass';}
  catch(e){report.sourceIntegrity='fail';report.error=String(e);report.result='fail';process.exitCode=1;}
  save('audit-report.json',report);console.log(JSON.stringify(report));
}
