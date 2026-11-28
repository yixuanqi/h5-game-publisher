import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {parseHTML} from 'linkedom/worker';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../runtime/css-plan-runtime.mjs';
import {createLayoutSnapshot} from './dom-layout.mjs';
import {compareRectangles} from './title-audit-utils.mjs';
const {loadTaffy}=createRequire(import.meta.url)('./taffy-runtime.cjs');
const [wasm,out]=process.argv.slice(2);
const report={stage:'V0.5.4c3b6',scope:'authored SVG geometry, viewBox and HTML flow separation',host:'fail',wx:'not-run',releaseReady:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const markup='<div id="root"><svg id="vector" viewBox="0 0 180 96"><defs id="defs"><radialGradient id="gradient"><stop id="stop" offset="0%"/></radialGradient></defs><ellipse id="ellipse" cx="90" cy="52" rx="74" ry="38"/><path id="arc" d="M 52 50 A 38 38 0 1 1 128 50"/><path id="quadratic" d="M 76 26 Q 72 48 60 72 Q 90 80 120 72 Q 108 48 104 26 Z"/><line id="line" x1="90" y1="4" x2="90" y2="20"/><circle id="circle" cx="90" cy="22" r="4.5"/></svg><div id="tail"></div></div>';
 const css='*{box-sizing:border-box;margin:0;padding:0}#root{display:flex;width:300px;height:100px;align-items:center;padding-left:10px;column-gap:8px}#vector{display:block;width:96px;height:50px}#tail{width:40px;height:20px}';
 const plan=compileRuntimeCssPlan(css),ids=['root','vector','defs','gradient','stop','ellipse','arc','quadratic','line','circle','tail'];
 for(const env of [{width:844,height:390,pointer:'coarse'},{width:640,height:360,pointer:'coarse'}]){
  const page=await browser.newPage({viewport:{width:env.width,height:env.height},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>'+css+'</style>'+markup);
  const {document}=parseHTML('<html><body>'+markup+'</body></html>');
  function visit(el,parentStyle={}){
   const r=resolvePlanStyle(plan,el,env,parentStyle);assert.deepEqual(r.unsupportedSelectors,[]);
   return {element:el,style:r.values,children:[...el.children].map(c=>visit(c,r.values))};
  }
  for(const phase of ['initial','changed']){
   if(phase==='changed'){
    document.querySelector('#vector').setAttribute('style','width:140px;height:80px');
    await page.locator('#vector').evaluate(el=>{el.style.width='140px';el.style.height='80px';});
   }
   const snap=createLayoutSnapshot(backend,visit(document.querySelector('#root')),env);
   assert.equal(snap.nodeCount,ids.length);
   const actual=Object.fromEntries(ids.map(id=>[id,snap.rect(document.querySelector('#'+id))]));
   const expected=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]})),ids);
   const comparison=compareRectangles(expected,actual);
   const maxDeltaPx=Math.max(...ids.flatMap(id=>Object.keys(expected[id]).map(k=>Math.abs(expected[id][k]-actual[id][k]))));
   report.results.push({viewport:env,phase,actual,expected,maxDeltaPx,...comparison});
   assert.ok(comparison.pass,JSON.stringify(report.results.at(-1)));
  }
  await page.close();
 }
 report.host='pass';
}catch(e){report.error=String(e.stack||e);throw e;}
finally{if(browser)await browser.close();fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
