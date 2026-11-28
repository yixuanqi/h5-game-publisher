import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {parseHTML} from 'linkedom/worker';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../runtime/css-plan-runtime.mjs';
import {createLayoutSnapshot} from './dom-layout.mjs';
import {directTextRun,textDescriptor} from './text-metrics.mjs';
import {collectElementPaths,compareRectangles,elementIdentity} from './title-audit-utils.mjs';
const {loadTaffy}=createRequire(import.meta.url)('./taffy-runtime.cjs');
const [checkout,wasm,out]=process.argv.slice(2);
const pin='cdb508594cc610733f248ec5d4123a3b9d954981';
const git=(...args)=>{const r=spawnSync('git',args,{cwd:checkout,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const report={stage:'V0.5.4c3b3',scope:'full authored title subtree static mobile state, inventory and attempted host geometry',sourceSha:pin,diagnostic:'fail',fullTitleParity:false,wx:'not-run',releaseReady:false,results:[]};
let browser,server;
try{
 assert.equal(git('rev-parse','HEAD'),pin);
 assert.equal(git('status','--porcelain','--untracked-files=all'),'');
 const source=path.resolve(checkout,'docs/ashen-bell-vow');
 const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
 const css=fs.readFileSync(path.join(source,'styles.css'),'utf8');
 const plan=compileRuntimeCssPlan(css);
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 report.deferredPseudoRules=plan.deferredPseudoRules.map(r=>r.selector);
 // Serve original source bytes. Disable scripts to select the authored static
 // title state; no gameplay execution or claim of runtime menu parity.
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml'};
 server=http.createServer((req,res)=>{
  try{
   const u=new URL(req.url,'http://127.0.0.1');
   const file=path.resolve(source,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
   if(!file.startsWith(source+path.sep)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"script-src 'none'; object-src 'none'",'Cache-Control':'no-store'});
   fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end();}
 });
 await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 const layoutKeys=new Set('display width height min-width min-height max-width max-height column-gap row-gap flex-direction flex-wrap justify-content align-items align-self flex-grow flex-shrink flex-basis grid-template-columns grid-template-rows position top right bottom left padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left border-top-width border-right-width border-bottom-width border-left-width box-sizing aspect-ratio grid-column-start grid-column-end grid-row-start grid-row-end order'.split(' '));
 const textKeys=new Set('font-family font-size font-weight line-height letter-spacing text-align text-transform color white-space'.split(' '));
 for(const env of [{width:844,height:390,pointer:'coarse'},{width:640,height:360,pointer:'coarse'}]){
  const ctx=await browser.newContext({viewport:{width:env.width,height:env.height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await ctx.newPage();
  await page.goto(origin+'/',{waitUntil:'load',timeout:30000});
  // Diagnostic state only, identical class edits in both in-memory DOMs.
  await page.evaluate(()=>{document.body.classList.add('is-mobile');document.querySelector('#title-screen').classList.add('title-revealed');});
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  const oracle=await page.evaluate(()=>{
   const root=document.querySelector('#title-screen'),rows=[];
   function visit(el,path){
    const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    rows.push({path,namespaceURI:el.namespaceURI,tag:el.localName,id:el.id||'',rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:cs.display,visibility:cs.visibility});
    [...el.children].forEach((c,i)=>visit(c,path+'/'+i));
   }
   visit(root,'0');return rows;
  });
  const {document}=parseHTML(html);
  document.body.classList.add('is-mobile');
  const title=document.querySelector('#title-screen');title.classList.add('title-revealed');
  const entries=collectElementPaths(title),byElement=new Map(entries.map(x=>[x.element,x.path]));
  const sourceIdentities=entries.map(({path,element:el})=>({path,namespaceURI:el.namespaceURI,tag:el.localName,id:el.id||''}));
  const sourceKeys=sourceIdentities.map(elementIdentity),oracleKeys=oracle.map(elementIdentity);
  // Save coverage evidence even if the strict comparison fails.
  report.coverage??=[];
  report.coverage.push({viewport:env,sourceCount:sourceKeys.length,oracleCount:oracleKeys.length,
   mismatches:sourceIdentities.flatMap((row,i)=>JSON.stringify(sourceKeys[i])===JSON.stringify(oracleKeys[i])?[]:[{source:row,browser:oracle[i]??null}])});
  assert.deepEqual(sourceKeys,oracleKeys,'Source/browser element coverage mismatch');
  const issues=[],inventory=[];
  const cache=new WeakMap();
  function resolve(el){
   if(cache.has(el))return cache.get(el);
   const parent=el.parentElement;
   const r=resolvePlanStyle(plan,el,env,parent?resolve(parent).values:{});
   cache.set(el,r);return r;
  }
  // Authored transform/filter effects can change fixed containing blocks.
  // Non-none effects are conservatively rejected by the fixed adapter.
  const establishesFixedContainingBlock=v=>['transform','filter','backdrop-filter','perspective','contain','will-change'].some(k=>v[k]&&!['none','normal','auto'].includes(v[k]));
  function visit(el,hidden=false){
   const key=byElement.get(el);let r;
   try{r=resolve(el);}catch(e){issues.push({path:key,kind:'cascade',error:String(e)});r={values:{},unsupportedSelectors:[]};}
   const style={},textStyle={},unmapped={};
   for(const [k,v] of Object.entries(r.values)){
    if(layoutKeys.has(k))style[k]=v;
    else if(textKeys.has(k))textStyle[k]=v;
    else if(!k.startsWith('--'))unmapped[k]=v;
   }
   hidden=hidden||style.display==='none';
   const directText=[...el.childNodes].filter(n=>n.nodeType===3&&String(n.textContent).trim()).map(n=>n.textContent.trim()).join(' ');
   if(!hidden){
    for(const e of r.unsupportedSelectors)issues.push({path:key,kind:'selector',...e});
    if(directText)issues.push({path:key,kind:'text-measurement-required',mixed:el.children.length>0,nonAscii:/[^\x00-\x7f]/.test(directText)});
    if(['svg','button','input','canvas'].includes(el.localName))issues.push({path:key,kind:'native-or-replaced-element',tag:el.localName});
    if(Object.keys(unmapped).length)issues.push({path:key,kind:'unmapped-style',properties:Object.keys(unmapped)});
   }
   inventory.push({path:key,namespaceURI:el.namespaceURI,tag:el.localName,id:el.id||'',hidden,style,textStyle,unmapped});
   let fixedAncestorOutsideTree=false;
   for(let p=title.parentElement;p;p=p.parentElement){
    try{if(establishesFixedContainingBlock(resolve(p).values))fixedAncestorOutsideTree=true;}
    catch{fixedAncestorOutsideTree=true;}
   }
   return {element:el,style,textStyle,establishesFixedContainingBlock:establishesFixedContainingBlock(r.values),fixedAncestorOutsideTree,children:[...el.children].map(c=>visit(c,hidden))};
  }
  const tree=visit(title);
  // Precompute glyph advances from authored descriptors in a Canvas context.
  // Never use computed DOM styles or oracle element bounds as layout inputs.
  const descriptors=[],descriptorErrors=[];
  for(const row of inventory){
   if(row.hidden)continue;
   const el=entries.find(x=>x.path===row.path).element,text=directTextRun(el);
   if(!text)continue;
   try{descriptors.push({path:row.path,...textDescriptor(text,row.textStyle,env)});}
   catch(e){descriptorErrors.push({path:row.path,error:String(e)});}
  }
  const measured=await page.evaluate(ds=>{
   const c=document.createElement('canvas').getContext('2d');
   return ds.map(d=>{
    c.font=d.font;c.letterSpacing=d.letterSpacing+'px';
    const m=c.measureText(d.text);
    return {path:d.path,width:m.width,height:d.lineHeight??(m.fontBoundingBoxAscent+m.fontBoundingBoxDescent)};
   });
  },descriptors);
  const metricsByPath=new Map(measured.map(x=>[x.path,x]));
  const textEvidence={descriptors,descriptorErrors,measured,used:[]};
  const expected=Object.fromEntries(oracle.map(x=>[x.path,x.rect]));
  let attempt;
  try{
   // No projected fake leaves, no oracle dimensions used as layout input.
   const snap=createLayoutSnapshot(backend,tree,env,{safeArea:{top:0,right:0,bottom:0,left:0},measureSingleLine:({element})=>{
     const key=byElement.get(element),m=metricsByPath.get(key);
     if(!m)throw Error('No authored glyph metrics at '+key);
     textEvidence.used.push(key);return m;
   }});
   const actual=Object.fromEntries(entries.map(x=>[x.path,snap.rect(x.element)]));
   attempt={status:'computed',actual,...compareRectangles(expected,actual)};
  }catch(e){attempt={status:'blocked',error:String(e),pass:false};}
  report.results.push({viewport:env,nodeCount:entries.length,oracle,inventory,issues,textEvidence,attempt});
  assert.ok(entries.length>20,'Expected a complete original title subtree');
  assert.ok(oracle.some(x=>x.id==='btn-start'),'Missing original start button');
  await ctx.close();
 }
 // Green diagnostic means evidence collection completed, NOT parity.
 report.fullTitleParity=report.results.every(r=>r.attempt.pass&&r.issues.length===0);
 report.diagnostic='pass';
}catch(e){report.error=String(e.stack||e);throw e;}
finally{
 try{assert.equal(git('status','--porcelain','--untracked-files=all'),'');report.sourceIntegrity='pass';}
 catch(e){report.sourceIntegrity='fail';report.diagnostic='fail';report.sourceError=String(e);throw e;}
 finally{if(browser)await browser.close();if(server)await new Promise(ok=>server.close(ok));fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({stage:report.stage,diagnostic:report.diagnostic,fullTitleParity:report.fullTitleParity,sourceIntegrity:report.sourceIntegrity,results:report.results.map(r=>({viewport:r.viewport,nodeCount:r.nodeCount,issues:r.issues.length,attempt:r.attempt.status,error:r.attempt.error,measuredTextRuns:r.textEvidence.measured.length,usedTextRuns:r.textEvidence.used.length,issueKinds:Object.fromEntries([...new Set(r.issues.map(i=>i.kind))].map(k=>[k,r.issues.filter(i=>i.kind===k).length])),issueProperties:[...new Set(r.issues.flatMap(i=>i.properties??[]))]}))}));}
}
