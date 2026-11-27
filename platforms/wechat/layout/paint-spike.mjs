import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob,within} from '../../../scripts/source-integrity.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {layoutTextColumn,paintColumn,hitColumn} from './paint-column.mjs';
import {compilePaint,textColumnSource} from './source-paint.mjs';
import {compileBoxStyles,sourceBox} from './source-box.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream'),source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-paint-052b'),raw=path.join(work,'raw'),out=path.join(work,'evidence');
assertDisjoint(checkout,work);assert.ok(!fs.existsSync(work),'Use fresh workspace');
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);
const before=snapshot(source);
fs.mkdirSync(out,{recursive:true});
const report={stage:'0.5.2b-menu-raster',result:'fail',framework:git(root,'rev-parse','HEAD'),sourceSha:spec.sourceSha,officialDevTools:'not-run',releaseReady:false,scenarios:[],limitations:['Independent local menu layout and Skia paint; Chromium supplies dynamic DOM, parent origin and reference only','Transparent menu overlay, not complete screen; font shaping and full CSS parity unverified','Original click uses independent relative x/y plus reference parent origin; no native WeChat event dispatch']};
let rawBefore,server,browser;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
try{
  const imported=exportGame(spec.game,checkout,raw);rawBefore=snapshot(raw);report.rawFilesSha256=imported.sourceFilesSha256;
  const css=fs.readFileSync(path.join(raw,'styles.css'),'utf8'),boxRules=compileBoxStyles(css),paintRules=compilePaint(css);
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
      const data=textColumnSource(paintRules,html,selector,env);
      const measure=createCanvas(1,1).getContext('2d');
      const layout=layoutTextColumn(measure,width,data.parent,data.children,env);
      const canvas=createCanvas(Math.ceil(layout.width),Math.ceil(layout.height)),draw=canvas.getContext('2d');
      paintColumn(draw,layout,env);
      fs.writeFileSync(path.join(out,name+'-independent-menu.png'),canvas.toBuffer('image/png'));
      const pixels=draw.getImageData(0,0,canvas.width,canvas.height).data;
      let nonzeroAlpha=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])nonzeroAlpha++;
      assert.ok(nonzeroAlpha>100,'Independent raster empty');
      const ref=await page.locator(selector).evaluate(p=>{
        const r=p.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,children:[...p.children].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const b=e.getBoundingClientRect();return {key:e.id,text:e.textContent.trim(),x:b.x-r.x,y:b.y-r.y,width:b.width,height:b.height};})};
      });
      await page.locator(selector).screenshot({path:path.join(out,name+'-browser-menu.png')});
      assert.deepEqual(layout.rows.map(r=>r.key),ref.children.map(r=>r.key));
      const rows=layout.rows.map((r,i)=>{const v=ref.children[i];assert.equal(r.text,v.text);return {key:r.key,text:r.text,predicted:{x:r.x,y:r.y,width:r.width,height:r.height},reference:v,metrics:r.metrics,maxDelta:Math.max(...['x','y','width','height'].map(k=>Math.abs(r[k]-v[k])))};});
      const maxDelta=Math.max(Math.abs(layout.height-ref.height),...rows.map(r=>r.maxDelta));
      Object.assign(scenario,{rows,maxDelta,nonzeroAlpha,independentSize:{width:layout.width,height:layout.height},referenceSize:{width:ref.width,height:ref.height}});
      const target=layout.rows.find(r=>r.key==='btn-title-settings');assert.ok(target);
      const x=target.x+target.width/2,y=target.y+target.height/2;
      assert.equal(hitColumn(layout,x,y),target.key);
      if(name==='mobile')await page.touchscreen.tap(ref.x+x,ref.y+y);else await page.mouse.click(ref.x+x,ref.y+y);
      await page.locator('#settings-modal').waitFor({state:'visible',timeout:15000});
      scenario.action='settings opened using independently computed relative x/y';
      scenario.pass=maxDelta<=4&&!scenario.errors.length;
    }catch(e){scenario.error=String(e.stack||e);scenario.pass=false;await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});}
    finally{await ctx.close();}
  }
  assert.ok(report.scenarios.every(s=>s.pass),'One or more original menu raster/geometry checks failed');
  report.result='pass';
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  try{assertSnapshot(source,before,'Original source');if(rawBefore)assertSnapshot(raw,rawBefore,'Raw export');report.sourceIntegrity='pass';}
  catch(e){report.sourceIntegrity='fail';report.result='fail';report.error=String(e);process.exitCode=1;}
  fs.writeFileSync(path.join(out,'paint-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
