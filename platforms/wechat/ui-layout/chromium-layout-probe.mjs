import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {parseHTML} from 'linkedom/worker';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../runtime/css-plan-runtime.mjs';
import {createLayoutSnapshot} from './dom-layout.mjs';
const {loadTaffy}=createRequire(import.meta.url)('./taffy-runtime.cjs');
const [wasm,out]=process.argv.slice(2);
const report={stage:'V0.5.4c1',scope:'bounded synthetic nested boxes and nowrap text',host:'fail',wx:'not-run',releaseReady:false,visualParity:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const markup='<div id="root"><div id="nested"><div id="text">Hello layout</div></div><div id="tail"></div></div>';
 const css='#root{display:flex;width:calc(100% - 40px);height:100px;column-gap:10px;align-items:flex-start}#nested{display:flex;flex-direction:column;width:clamp(100px,30vw,250px);height:80px;align-items:flex-start}#text{display:block;width:max-content;white-space:nowrap;font-family:monospace;font-size:16px;line-height:24px}#tail{width:50px;height:30px}';
 const plan=compileRuntimeCssPlan(css);
 for(const width of [640,844]){
  const env={width,height:390,pointer:'coarse'};
  const page=await browser.newPage({viewport:{width,height:390},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>body{margin:0}'+css+'</style>'+markup);
  // Only glyph advance metrics from Canvas are input. Browser rectangle oracle
  // is acquired separately, never passed into the adapter.
  const metrics=await page.evaluate(()=>{
   const ctx=document.createElement('canvas').getContext('2d');ctx.font='16px monospace';
   return {width:ctx.measureText('Hello layout').width,height:24};
  });
  const {document}=parseHTML('<html><body>'+markup+'</body></html>');
  const root=document.querySelector('#root');
  const textKeys=new Set(['font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform','color','white-space']);
  function visit(el,parentStyle={}){
   const r=resolvePlanStyle(plan,el,env,parentStyle);
   assert.deepEqual(r.unsupportedSelectors,[]);
   const style={},textStyle={};
   for(const [key,value] of Object.entries(r.values))(textKeys.has(key)?textStyle:style)[key]=value;
   return {element:el,style,textStyle,children:[...el.children].map(c=>visit(c,r.values))};
  }
  const tree=visit(root);
  const ids=['root','nested','text','tail'];
  for(const phase of ['initial','changed']){
   if(phase==='changed'){
    const el=document.querySelector('#tail');el.setAttribute('style','width:70px');
    await page.locator('#tail').evaluate(el=>el.style.width='70px');
   }
   const snapshot=createLayoutSnapshot(backend,phase==='initial'?tree:visit(root),env,{measureTextLeaf:({text})=>{assert.equal(text,'Hello layout');return metrics;}});
   const actual=Object.fromEntries(ids.map(id=>[id,snapshot.rect(document.querySelector('#'+id))]));
   const expected=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]})),ids);
   const errors=ids.flatMap(id=>Object.keys(expected[id]).map(key=>({id,key,delta:Math.abs(actual[id][key]-expected[id][key])})));
   const maxDeltaPx=Math.max(...errors.map(e=>e.delta));
   report.results.push({viewport:env,phase,expected,actual,maxDeltaPx,errors:errors.filter(e=>e.delta>0.5)});
   assert.ok(maxDeltaPx<=0.5,'Chromium parity failure '+JSON.stringify(report.results.at(-1)));
  }
  await page.close();
 }
 report.host='pass';
}catch(e){report.error=String(e.stack||e);throw e;}
finally{if(browser)await browser.close();fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
