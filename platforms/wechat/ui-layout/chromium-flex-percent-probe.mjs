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
const report={stage:'V0.5.4c3b4',scope:'absolute inset root, definite column cross-axis stretch and nested mixed percentage expressions',host:'fail',wx:'not-run',releaseReady:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const css='*{box-sizing:border-box;margin:0;padding:0}#root{position:absolute;inset:0;display:flex;flex-direction:column;align-items:stretch}#top{height:30px;flex-shrink:0}#shell{display:flex;flex:1;align-items:center;justify-content:center;padding:4px clamp(14px, 3.2%, 32px);min-width:0}#hero{display:grid;width:min(760px, 94%);height:100px;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);column-gap:20px}#a,#b{height:30px;min-width:0}#footer{height:20px;flex-shrink:0}';
 const markup='<div id="root"><div id="top"></div><div id="shell"><div id="hero"><div id="a"></div><div id="b"></div></div></div><div id="footer"></div></div>';
 const plan=compileRuntimeCssPlan(css),ids=['root','top','shell','hero','a','b','footer'];
 for(const env of [{width:844,height:390,pointer:'coarse'},{width:640,height:360,pointer:'coarse'}]){
  const page=await browser.newPage({viewport:{width:env.width,height:env.height},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>'+css+'</style>'+markup);
  const {document}=parseHTML('<html><body>'+markup+'</body></html>');
  function visit(el,parentStyle={}){
   const r=resolvePlanStyle(plan,el,env,parentStyle);assert.deepEqual(r.unsupportedSelectors,[]);
   return {element:el,style:r.values,children:[...el.children].map(c=>visit(c,r.values))};
  }
  const root=document.querySelector('#root');
  for(const phase of ['initial','changed']){
   if(phase==='changed'){
    document.querySelector('#shell').setAttribute('style','padding-left:40px');
    await page.locator('#shell').evaluate(el=>el.style.paddingLeft='40px');
   }
   const snap=createLayoutSnapshot(backend,visit(root),env);
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
