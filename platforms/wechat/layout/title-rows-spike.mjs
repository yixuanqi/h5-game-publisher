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
import {makeDiagnosticFonts} from './diagnostic-fonts.mjs';
import {layoutRow,flattenRow,paintRow} from './paint-row.mjs';
import {compilePaint,textColumnSource} from './source-paint.mjs';
import {compileBoxStyles,sourceBox} from './source-box.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream'),source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-title-rows-052b'),raw=path.join(work,'raw'),out=path.join(work,'evidence');
assertDisjoint(checkout,work);assert.ok(!fs.existsSync(work),'Use fresh workspace');
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);
const before=snapshot(source);
fs.mkdirSync(out,{recursive:true});
const report={stage:'0.5.2b-title-rows',result:'fail',framework:git(root,'rev-parse','HEAD'),sourceSha:spec.sourceSha,officialDevTools:'not-run',releaseReady:false,scenarios:[],limitations:['Independent local title bar layout and Skia paint; Chromium supplies dynamic DOM and reference only','Transparent title bar overlays, not complete screen; font shaping and full CSS parity unverified','No native WeChat event dispatch']};
let rawBefore,server,browser;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
try{
  const imported=exportGame(spec.game,checkout,raw);rawBefore=snapshot(raw);report.rawFilesSha256=imported.sourceFilesSha256;
  const css=fs.readFileSync(path.join(raw,'styles.css'),'utf8'),boxRules=compileBoxStyles(css),paintRules=compilePaint(css);
  const fonts=makeDiagnosticFonts();report.fontChoices=fonts.evidence;report.glyphProbe=fonts.checkHan();
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
      scenario.bars=[];
      const html=await page.content(),env={...profile.viewport,pointer:name==='mobile'?'coarse':'fine'};
      for(const [label,selector] of [['topbar','.title-topbar'],['footer','.title-footer']]){
        const bar={label};scenario.bars.push(bar);
        try{
          const ref=await page.locator(selector).evaluate(p=>{
            const root=p.getBoundingClientRect();
            function visit(e,key){
              if(getComputedStyle(e).display==='none')return [];
              const b=e.getBoundingClientRect();
              const style=getComputedStyle(e);return [{key,x:b.x-root.x,y:b.y-root.y,width:b.width,height:b.height,font:style.fontFamily,fontSize:style.fontSize,letterSpacing:style.letterSpacing,weight:style.fontWeight},...[...e.children].flatMap((c,i)=>visit(c,key+'/'+i))];
            }
            return visit(p,'root');
          });
          const tree=textColumnSource(paintRules,html,selector,env,{tree:true});
          if(tree.style.display==='none'){bar.pass=ref.length===0;bar.hidden=true;continue;}
          const width=sourceBox(boxRules,html,selector,env).borderWidth;
          const layout=layoutRow(createCanvas(1,1).getContext('2d'),tree,width,env,{resolveFamily:fonts.resolveFamily});
          const canvas=createCanvas(Math.ceil(layout.width),Math.ceil(layout.height)),draw=canvas.getContext('2d');paintRow(draw,layout,env);
          fs.writeFileSync(path.join(out,name+'-'+label+'-independent.png'),canvas.toBuffer('image/png'));
          await page.locator(selector).screenshot({path:path.join(out,name+'-'+label+'-browser.png')});
          const cdp=await ctx.newCDPSession(page);
          try{
            await cdp.send('DOM.enable');await cdp.send('CSS.enable');
            const {root:domRoot}=await cdp.send('DOM.getDocument');
            const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:domRoot.nodeId,selector});
            const {node}=await cdp.send('DOM.describeNode',{nodeId,depth:4});
            const fonts=[];
            async function visitNode(n){
              if(n.nodeType===1){
                const {nodeId:id}=await cdp.send('DOM.pushNodesByBackendIdsToFrontend',{backendNodeIds:[n.backendNodeId]}).then(r=>({nodeId:r.nodeIds[0]}));
                if(id){const result=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:id});if(result.fonts.length)fonts.push({tag:n.nodeName,attributes:n.attributes,fonts:result.fonts});}
              }
              for(const c of n.children??[])await visitNode(c);
            }
            await visitNode(node);bar.referenceFonts=fonts;
          }catch(e){bar.fontDiagnosticError=String(e);}finally{await cdp.detach();}
          const a=flattenRow(layout);assert.deepEqual(a.map(x=>x.key),ref.map(x=>x.key));
          bar.rows=a.map((x,i)=>({key:x.key,text:x.text,predicted:x,reference:ref[i],delta:Math.max(...['x','y','width','height'].map(k=>Math.abs(x[k]-ref[i][k])))}));
          bar.maxDelta=Math.max(...bar.rows.map(x=>x.delta));bar.pass=bar.maxDelta<=4;
        }catch(e){bar.pass=false;bar.error=String(e.stack||e);}
      }
      scenario.pass=scenario.bars.every(b=>b.pass)&&!scenario.errors.length;
    }catch(e){scenario.error=String(e.stack||e);scenario.pass=false;await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});}
    finally{await ctx.close();}
  }
  assert.ok(report.scenarios.every(s=>s.pass),'One or more original title row raster/geometry checks failed');
  report.result='pass';
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  try{assertSnapshot(source,before,'Original source');if(rawBefore)assertSnapshot(raw,rawBefore,'Raw export');report.sourceIntegrity='pass';}
  catch(e){report.sourceIntegrity='fail';report.result='fail';report.error=String(e);process.exitCode=1;}
  fs.writeFileSync(path.join(out,'title-rows-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
