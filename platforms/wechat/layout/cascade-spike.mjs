import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob,within} from '../../../scripts/source-integrity.mjs';
import {gridTracks,columnTracks,locateTrack,parseFractionTracks} from './tracks.mjs';
import {compileStyles,sourceStyles} from './source-style.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream'),source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-cascade-052b'),raw=path.join(work,'raw'),out=path.join(work,'evidence');
assertDisjoint(checkout,work);assert.ok(!fs.existsSync(work),'Use fresh workspace');
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);
const before=snapshot(source);
fs.mkdirSync(out,{recursive:true});
const report={stage:'0.5.2b-source-cascade',result:'fail',framework:git(root,'rev-parse','HEAD'),sourceSha:spec.sourceSha,officialDevTools:'not-run',releaseReady:false,scenarios:[],limitations:['Chromium provides dynamic DOM, parent content width/origin and child margins/padding only; selected style declarations and horizontal tracks independently resolved','No full CSS cascade, vertical layout, painting, event dispatch or runtime parity claimed','Interaction uses predicted x with browser reference y and original browser event routing']};
let rawBefore,server,browser;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
async function inspect(page,selector,kind){
  return page.evaluate(({selector,kind})=>{
    const p=document.querySelector(selector);if(!p)throw Error('Missing container '+selector);
    const cs=getComputedStyle(p),pr=p.getBoundingClientRect(),num=v=>parseFloat(v)||0;
    // Browser owns cascade in this diagnostic. Typed OM computed value preserves authored
    // percentages/fractional tracks when available; CSSOM resolved pixel tracks are oracle only.
    function authored(el,prop){
      const value=el.computedStyleMap?.().get(prop)?.toString();
      if(value&&(/fr\b/.test(value)||value==='100%'))return {value,method:'typed-om'};
      const matches=[];let order=0;
      function walk(rules){
        for(const r of rules){
          if(r instanceof CSSMediaRule){if(matchMedia(r.conditionText).matches)walk(r.cssRules);continue;}
          if(typeof CSSSupportsRule!=='undefined'&&r instanceof CSSSupportsRule){if(CSS.supports(r.conditionText))walk(r.cssRules);continue;}
          if(!r.selectorText||!r.style)continue;
          order++;
          const v=r.style.getPropertyValue(prop);if(!v)continue;
          for(const sel of r.selectorText.split(',')){
            try{if(!el.matches(sel))continue;}catch{continue;}
            // Bounded simple selectors only; fail rather than guess complex cascade.
            if(/[:(]/.test(sel))throw Error('Complex matching selector for '+prop+': '+sel);
            const ids=(sel.match(/#[\w-]+/g)||[]).length;
            const classes=(sel.match(/\.[\w-]+|\[[^\]]+\]/g)||[]).length;
            const types=(sel.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g,' ').match(/\b[a-z][\w-]*\b/gi)||[]).length;
            matches.push({value:v,selector:sel,priority:r.style.getPropertyPriority(prop)==='important'?1:0,ids,classes,types,order});
          }
        }
      }
      for(const sheet of document.styleSheets)walk(sheet.cssRules);
      const inline=el.style.getPropertyValue(prop);
      if(inline)matches.push({value:inline,selector:'inline',priority:el.style.getPropertyPriority(prop)==='important'?1:0,ids:100000,classes:0,types:0,order:100000});
      matches.sort((a,b)=>b.priority-a.priority||b.ids-a.ids||b.classes-a.classes||b.types-a.types||b.order-a.order);
      if(!matches.length)throw Error('No authored '+prop+' for '+selector);
      return {value:matches[0].value,method:'bounded-cssom',matches};
    }
    const left=num(cs.borderLeftWidth)+num(cs.paddingLeft),right=num(cs.borderRightWidth)+num(cs.paddingRight);
    const width=p.clientWidth-num(cs.paddingLeft)-num(cs.paddingRight);
    // clientWidth rounds to integer; comparison permits 2 CSS px for rounding.
    const origin=pr.left+left;
    const children=[...p.children].filter(e=>getComputedStyle(e).display!=='none').map((e,i)=>{
      const s=getComputedStyle(e),r=e.getBoundingClientRect();
      return {key:e.id||e.className||String(i),style:kind==='column'?{width:authored(e,'width').value,boxSizing:s.boxSizing,marginLeft:num(s.marginLeft),marginRight:num(s.marginRight),horizontalExtras:num(s.paddingLeft)+num(s.paddingRight)+num(s.borderLeftWidth)+num(s.borderRightWidth)}:null,reference:{x:r.left-origin,width:r.width,y:r.top,height:r.height}};
    });
    const subtree=[p,...p.querySelectorAll('*')].filter(e=>getComputedStyle(e).display!=='none');
    const counts={};const features=['display','position','overflow-y','background-image','filter','backdrop-filter','transform','box-shadow','text-shadow','white-space'];
    for(const e of subtree){const s=getComputedStyle(e);for(const k of features){const v=s.getPropertyValue(k);const key=k+': '+v;counts[key]=(counts[key]||0)+1;}}
    return {selector,kind,display:cs.display,direction:cs.flexDirection,width,origin,gap:num(cs.columnGap),template:kind==='grid'?authored(p,'grid-template-columns'):null,referenceTracks:cs.gridTemplateColumns,children,features:counts,contentHeight:p.clientHeight,scrollHeight:p.scrollHeight};
  },{selector,kind});
}
function compare(s){
  assert.ok(s.width>0&&s.children.length>0,'Empty layout');
  if(s.kind==='grid')assert.equal(s.display,'grid');
  else {assert.equal(s.display,'flex');assert.equal(s.direction,'column');}
  const tracks=s.kind==='grid'?gridTracks(s.width,s.gap,s.template.value):columnTracks(s.width,s.children.map(c=>c.style));
  const rows=s.children.map((c,i)=>{
    const t=tracks[s.kind==='grid'?i%tracks.length:i],r=c.reference;
    return {key:c.key,predicted:t,reference:r,deltaX:Math.abs(t.x-r.x),deltaWidth:Math.abs(t.width-r.width)};
  });
  const maxDelta=Math.max(...rows.flatMap(r=>[r.deltaX,r.deltaWidth]));
  return {...s,tracks,rows,maxDelta,pass:maxDelta<=2};
}
try{
  const imported=exportGame(spec.game,checkout,raw);rawBefore=snapshot(raw);report.rawFilesSha256=imported.sourceFilesSha256;
  const rules=compileStyles(fs.readFileSync(path.join(raw,'styles.css'),'utf8'));report.ruleCount=rules.length;
  server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1'),p=path.resolve(raw,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!within(raw,p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(p).pipe(res);}catch{res.writeHead(404).end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1},{name:'mobile',viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true}]){
    const {name,...options}=profile,ctx=await browser.newContext({...options,serviceWorkers:'block'});
    const page=await ctx.newPage(),scenario={name,layouts:[],errors:[],actions:[]};report.scenarios.push(scenario);
    page.on('pageerror',e=>scenario.errors.push(String(e)));
    await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    try{
      await page.goto(origin+'/',{waitUntil:'load',timeout:30000});
      await page.waitForFunction(()=>window.__ABV_BOOTED__===true,{},{timeout:45000});
      await page.locator('#btn-title-settings').waitFor({state:'visible',timeout:45000});
      // Wait for original CSS transition to settle, no style modifications.
      await page.waitForFunction(()=>{const e=document.querySelector('.title-menu-list');return getComputedStyle(e).opacity==='1'&&new DOMMatrix(getComputedStyle(e).transform).isIdentity;},{},{timeout:20000});
      const capture=async(selector,kind)=>{
        const oracle=await inspect(page,selector,kind);
        const html=await page.content();
        const independent=sourceStyles(rules,html,selector,{...profile.viewport,pointer:name==='mobile'?'coarse':'fine'});
        const p=independent.parent.values;
        const issues=[...independent.parent.unsupported,...independent.children.flatMap(c=>c.style.unsupported)];
        const checks=[];
        const check=(label,actual,expected)=>checks.push({label,actual,expected,pass:JSON.stringify(actual)===JSON.stringify(expected)});
        check('display',p.display,oracle.display);
        check('column-gap',parseFloat(p['column-gap']??'0'),oracle.gap);
        if(kind==='grid')check('fractional tracks',parseFractionTracks(p['grid-template-columns']),parseFractionTracks(oracle.template.value));
        else check('flex-direction',p['flex-direction'],oracle.direction);
        const children=oracle.children.map(c=>{
          if(kind!=='column')return c;
          const d=independent.children.find(x=>x.key===c.key);
          assert.ok(d,'Missing independent child '+c.key);
          check(c.key+' width',d.style.values.width,c.style.width);
          check(c.key+' box-sizing',d.style.values['box-sizing']??'content-box',c.style.boxSizing);
          return {...c,style:{...c.style,width:d.style.values.width,boxSizing:d.style.values['box-sizing']??'content-box'}};
        });
        const v=compare({...oracle,display:p.display,direction:p['flex-direction'],gap:parseFloat(p['column-gap']??'0'),template:kind==='grid'?{value:p['grid-template-columns'],method:'source-cascade'}:null,children});
        v.cascade={checks,issues,winners:independent.parent.winners};
        v.pass=v.pass&&checks.every(x=>x.pass)&&issues.length===0;
        scenario.layouts.push(v);return v;
      };
      const click=async id=>name==='mobile'?page.locator('#'+id).tap():page.locator('#'+id).click();
      const menu=await capture('.title-menu-list','column');
      if(name==='mobile')await capture('.title-hero-column','grid');
      await page.screenshot({path:path.join(out,name+'-title.png')});
      // Real menu input uses predicted horizontal center and observed vertical center only.
      const settings=menu.rows.find(r=>r.key==='btn-title-settings');
      assert.ok(settings);
      const x=menu.origin+settings.predicted.x+settings.predicted.width/2,y=settings.reference.y+settings.reference.height/2;
      if(name==='mobile')await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
      await page.locator('#settings-modal').waitFor({state:'visible',timeout:15000});
      scenario.actions.push({action:'settings via predicted x',passed:true,x,y});
      if(name==='mobile')await capture('#settings-pane-system','grid');
      await page.screenshot({path:path.join(out,name+'-settings.png')});
      await click('btn-close-settings');await click('btn-title-slots');
      await page.locator('#title-slots-drawer').waitFor({state:'visible',timeout:15000});
      const slots=await capture('#save-slots-grid','grid');
      assert.equal(slots.children.length,3,'Expected three actual dynamic save cards');
      await page.screenshot({path:path.join(out,name+'-slots.png')});
      const second=slots.rows[1],tx=slots.origin+second.predicted.x+second.predicted.width/2,ty=second.reference.y+second.reference.height/2;
      assert.equal(locateTrack(slots.tracks,tx-slots.origin),1);
      // Target identification only; click may be clipped on short viewport. No invented state.
      scenario.actions.push({action:'second slot predicted horizontal track',passed:true,x:tx,referenceY:ty});
      await click('btn-close-slots-drawer');
      await page.locator('#title-slots-drawer').waitFor({state:'hidden',timeout:15000});
      scenario.actions.push({action:'original slots drawer close',passed:true});
      scenario.pass=scenario.layouts.every(l=>l.pass)&&!scenario.errors.length;
    }catch(e){scenario.error=String(e.stack||e);scenario.pass=false;await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});}
    finally{await ctx.close();}
  }
  // Negative control: missing layout is not valid (all boxes x=0/width=0).
  report.red={zeroBoxWouldFail:report.scenarios.some(s=>s.layouts.some(l=>l.rows.some(r=>r.reference.width>2)))};
  assert.ok(report.red.zeroBoxWouldFail,'No nonzero reference geometry');
  assert.ok(report.scenarios.every(s=>s.pass),'One or more actual UI geometry checks failed');
  report.result='pass';
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  try{assertSnapshot(source,before,'Original source');if(rawBefore)assertSnapshot(raw,rawBefore,'Raw export');report.sourceIntegrity='pass';}
  catch(e){report.sourceIntegrity='fail';report.result='fail';report.error=String(e);process.exitCode=1;}
  fs.writeFileSync(path.join(out,'layout-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({stage:report.stage,result:report.result,framework:report.framework,sourceIntegrity:report.sourceIntegrity,error:report.error,scenarios:report.scenarios.map(s=>({name:s.name,pass:s.pass,error:s.error,errors:s.errors,layouts:s.layouts.map(l=>({selector:l.selector,template:l.template?.value,width:l.width,children:l.children.length,maxDelta:l.maxDelta,pass:l.pass,cascade:l.cascade})),actions:s.actions}))}));
}
