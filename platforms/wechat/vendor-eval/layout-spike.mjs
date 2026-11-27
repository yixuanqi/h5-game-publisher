import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob,within} from '../../../scripts/source-integrity.mjs';
import {createHash} from 'node:crypto';
import {mapMenu} from './layout-mapping.mjs';
import {compilePaint,textColumnSource} from '../layout/source-paint.mjs';
import {compileBoxStyles,sourceBox} from '../layout/source-box.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream'),source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-vendor-layout'),raw=path.join(work,'raw'),out=path.join(work,'evidence');
assertDisjoint(checkout,work);assert.ok(!fs.existsSync(work),'Use fresh workspace');
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);
const before=snapshot(source);
fs.mkdirSync(out,{recursive:true});
const report={stage:'0.5.2b-upstream-layout',result:'fail',framework:git(root,'rev-parse','HEAD'),sourceSha:spec.sourceSha,officialDevTools:'not-run',releaseReady:false,scenarios:[],parityReady:false,limitations:['Vendor browser Canvas diagnostic only, not wx runtime','Dynamic DOM supplied by original Chromium, no runtime mutation bridge','Unsupported styles explicitly recorded; not visual parity']};
let rawBefore,server,browser;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
try{
  const imported=exportGame(spec.game,checkout,raw);rawBefore=snapshot(raw);report.rawFilesSha256=imported.sourceFilesSha256;
  const css=fs.readFileSync(path.join(raw,'styles.css'),'utf8'),boxRules=compileBoxStyles(css),paintRules=compilePaint(css);
  const vendor=fs.realpathSync(process.argv[3]||'vendor-layout');
  const expected='60b211edc981c7e471eb064652e4df6af50aba39';
  assert.equal(git(vendor,'rev-parse','HEAD'),expected);
  const pkg=JSON.parse(fs.readFileSync(path.join(vendor,'package.json'),'utf8'));assert.equal(pkg.version,'1.0.28');assert.equal(pkg.license,'MIT');
  assert.match(fs.readFileSync(path.join(vendor,'LICENSE'),'utf8'),/MIT License|Permission is hereby granted/);
  const bundle=fs.readFileSync(path.join(vendor,'dist/index.js'),'utf8');
  report.vendor={sha:expected,version:pkg.version,license:pkg.license,bytes:Buffer.byteLength(bundle),sha256:createHash('sha256').update(bundle).digest('hex')};
  server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1'),p=path.resolve(raw,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!within(raw,p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(p).pipe(res);}catch{res.writeHead(404).end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1},{name:'mobile',viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true}]){
    const {name,...options}=profile,ctx=await browser.newContext({...options,serviceWorkers:'block'});
    const page=await ctx.newPage(),scenario={name,errors:[]};report.scenarios.push(scenario);
    page.on('pageerror',e=>scenario.errors.push(String(e)));
    await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    try{
      await page.goto(origin+'/',{waitUntil:'load',timeout:30000});
      await page.waitForFunction(()=>window.__ABV_BOOTED__===true,{},{timeout:45000});
      await page.locator('#btn-title-settings').waitFor({state:'visible',timeout:45000});
      await page.waitForFunction(()=>{const e=document.querySelector('.title-menu-list');return getComputedStyle(e).opacity==='1'&&new DOMMatrix(getComputedStyle(e).transform).isIdentity;},{},{timeout:20000});
      const selector='.title-menu-list',html=await page.content(),env={...profile.viewport,pointer:name==='mobile'?'coarse':'fine'};
      const width=sourceBox(boxRules,html,selector,env).contentWidth;
      const data=textColumnSource(paintRules,html,selector,env),mapped=mapMenu(data,width,env);
      scenario.omissions=mapped.omissions;
      const ref=await page.locator(selector).evaluate(p=>{const b=p.getBoundingClientRect();return [...p.children].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return {key:e.id,x:r.x-b.x,y:r.y-b.y,width:r.width,height:r.height};});});
      await page.locator(selector).screenshot({path:path.join(out,name+'-original.png')});
      const vendorPage=await ctx.newPage();vendorPage.on('pageerror',e=>scenario.errors.push(String(e)));
      await vendorPage.setContent('<html><body style="margin:0"><canvas id="target"></canvas></body></html>');
      await vendorPage.addScriptTag({content:'var module={exports:{}};'+bundle+';window.VendorLayout=module.exports.default;'});
      const trial=await vendorPage.evaluate(({mapped,width,height})=>{
        const canvas=document.querySelector('#target');canvas.width=Math.ceil(width);canvas.height=height;
        canvas.style.width=width+'px';canvas.style.height=height+'px';
        const L=window.VendorLayout;if(!L||typeof L.init!=='function')throw Error('Vendor export missing');
        L.init(mapped.template,mapped.style);L.updateViewPort({x:0,y:0,width,height});L.layout(canvas.getContext('2d'));
        window.vendorClicks=[];
        const rows=mapped.items.map(i=>{
          const e=L.getElementById(i.vendorId);if(!e)throw Error('Missing vendor element');
          e.on('click',()=>window.vendorClicks.push(i.sourceKey));
          const b=L.getElementViewportRect(e);
          return {key:i.sourceKey,x:b.left??b.x,y:b.top??b.y,width:b.width,height:b.height};
        });
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let nonzeroAlpha=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])nonzeroAlpha++;
        return {rows,nonzeroAlpha,version:L.version};
      },{mapped,width,height:env.height});
      scenario.trial=trial;
      await vendorPage.locator('#target').screenshot({path:path.join(out,name+'-vendor.png')});
      assert.ok(trial.nonzeroAlpha>100,'No actual vendor pixels');
      assert.deepEqual(trial.rows.map(r=>r.key),ref.map(r=>r.key));
      scenario.rows=trial.rows.map((r,i)=>{assert.ok(['x','y','width','height'].every(k=>Number.isFinite(r[k])),'Missing vendor geometry');return {vendor:r,reference:ref[i],delta:Math.max(...['x','y','width','height'].map(k=>Math.abs(r[k]-ref[i][k])))};});
      scenario.maxDelta=Math.max(...scenario.rows.map(x=>x.delta));
      const target=trial.rows.find(r=>r.key==='btn-title-settings');assert.ok(target);
      // Vendor web environment maps touch handlers to mouse events. Never claim wx touch.
      await vendorPage.mouse.click(target.x+target.width/2,target.y+target.height/2);
      scenario.vendorClicks=await vendorPage.evaluate(()=>window.vendorClicks);
      scenario.interactionPass=scenario.vendorClicks.includes(target.key);
      scenario.geometryPass=scenario.maxDelta<=4;
      scenario.parityReady=scenario.geometryPass&&scenario.interactionPass&&!mapped.omissions.length&&!scenario.errors.length;
      scenario.pass=scenario.interactionPass&&!scenario.errors.length;
      await vendorPage.close();
    }catch(e){scenario.error=String(e.stack||e);scenario.pass=false;await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});}
    finally{await ctx.close();}
  }
  assert.ok(report.scenarios.every(s=>s.pass),'Vendor execution or interaction failed');
  report.result='trial-executed'; // Not parity, not release.
  report.parityReady=false;
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  try{assertSnapshot(source,before,'Original source');if(rawBefore)assertSnapshot(raw,rawBefore,'Raw export');report.sourceIntegrity='pass';}
  catch(e){report.sourceIntegrity='fail';report.result='fail';report.error=String(e);process.exitCode=1;}
  fs.writeFileSync(path.join(out,'vendor-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
