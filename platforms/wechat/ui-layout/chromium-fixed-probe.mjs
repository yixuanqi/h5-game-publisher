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
const report={stage:'V0.5.4c3b1',scope:'viewport fixed boxes without containing block effects',host:'fail',wx:'not-run',releaseReady:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const css='#root{display:flex;width:240px;height:100px;padding-left:20px;padding-top:10px;position:relative}#normal{width:40px;height:20px}#overlay{position:fixed;inset:0;display:block}#panel{position:fixed;left:calc(25% + 2px);top:10%;width:calc(50% - 10px);height:40px;display:block}#child{width:20px;height:10px}#tail{width:30px;height:20px}';
 const html='<div id="root"><div id="normal"></div><div id="overlay"><div id="panel"><div id="child"></div></div></div><div id="tail"></div></div>';
 const plan=compileRuntimeCssPlan(css);
 for(const width of [640,844]){
  const env={width,height:390,pointer:'coarse'};
  const page=await browser.newPage({viewport:{width,height:390},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>body{margin:0}'+css+'</style>'+html);
  const {document}=parseHTML('<html><body>'+html+'</body></html>');
  function visit(el,parentStyle={}){
   const r=resolvePlanStyle(plan,el,env,parentStyle);assert.deepEqual(r.unsupportedSelectors,[]);
   return {element:el,style:r.values,children:[...el.children].map(c=>visit(c,r.values))};
  }
  const ids=['root','normal','overlay','panel','child','tail'];
  const snap=createLayoutSnapshot(backend,visit(document.querySelector('#root')),env);
  const actual=Object.fromEntries(ids.map(id=>[id,snap.rect(document.querySelector('#'+id))]));
  const expected=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]})),ids);
  const comparison=compareRectangles(expected,actual);
  const maxDeltaPx=Math.max(...ids.flatMap(id=>Object.keys(expected[id]).map(k=>Math.abs(expected[id][k]-actual[id][k]))));
  report.results.push({viewport:env,actual,expected,maxDeltaPx,...comparison});
  assert.ok(comparison.pass,JSON.stringify(report.results.at(-1)));
  await page.close();
 }
 report.host='pass';
}catch(e){report.error=String(e.stack||e);throw e;}
finally{if(browser)await browser.close();fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
