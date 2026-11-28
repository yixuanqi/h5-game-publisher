import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {parseHTML} from 'linkedom/worker';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../runtime/css-plan-runtime.mjs';
import {createLayoutSnapshot} from './dom-layout.mjs';
import {measureWordLines} from './text-wrap.mjs';
const {loadTaffy}=createRequire(import.meta.url)('./taffy-runtime.cjs');
const [wasm,out]=process.argv.slice(2);
const report={stage:'V0.5.4c2',scope:'synthetic definite normal block containing sizes and ASCII word wrap',host:'fail',wx:'not-run',releaseReady:false,visualParity:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const words='one two three four five six seven eight';
 const markup='<div id="root"><div id="nested"><div id="text">'+words+'</div><div id="tail"></div></div></div>';
 const css='#root{display:block;width:calc(100% - 40px);height:300px}#nested{display:block;width:min(50%, 300px);height:calc(100% - 40px);padding-left:10px}#text{display:block;width:calc(100% - 20px);white-space:normal;font-family:monospace;font-size:16px;line-height:24px}#tail{display:block;width:calc(100% - 10px);height:30px}';
 const plan=compileRuntimeCssPlan(css);
 for(const width of [640,844]){
  const env={width,height:390,pointer:'coarse'};
  const page=await browser.newPage({viewport:{width,height:390},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>body{margin:0}'+css+'</style>'+markup);
  // Only text advances enter the adapter, never browser element geometry.
  const advances=await page.evaluate(text=>{
   const ctx=document.createElement('canvas').getContext('2d');ctx.font='16px monospace';
   const w=text.split(' '),out={};
   for(let i=0;i<w.length;i++)for(let j=i+1;j<=w.length;j++){const s=w.slice(i,j).join(' ');out[s]=ctx.measureText(s).width;}
   return out;
  },words);
  const {document}=parseHTML('<html><body>'+markup+'</body></html>');
  const root=document.querySelector('#root'),ids=['root','nested','text','tail'];
  const textKeys=new Set(['font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform','color','white-space']);
  function visit(el,parentStyle={}){
   const r=resolvePlanStyle(plan,el,env,parentStyle);assert.deepEqual(r.unsupportedSelectors,[]);
   const style={},textStyle={};
   for(const [key,value] of Object.entries(r.values))(textKeys.has(key)?textStyle:style)[key]=value;
   return {element:el,style,textStyle,children:[...el.children].map(c=>visit(c,r.values))};
  }
  const lineCounts=[];
  for(const phase of ['initial','changed']){
   if(phase==='changed'){
    document.querySelector('#nested').setAttribute('style','width:120px');
    await page.locator('#nested').evaluate(el=>el.style.width='120px');
   }
   const measurements=[];
   const snap=createLayoutSnapshot(backend,visit(root),env,{measureTextLeaf:({text,maxWidth,style})=>{
    assert.equal(text,words);assert.equal(style['line-height'],'24px');
    const m=measureWordLines(text,{maxWidth,lineHeight:24,measureAdvance:s=>advances[s]});
    measurements.push({maxWidth,lines:m.lines,height:m.height});return m;
   }});
   assert.equal(measurements.length,1);lineCounts.push(measurements[0].lines.length);
   const actual=Object.fromEntries(ids.map(id=>[id,snap.rect(document.querySelector('#'+id))]));
   const expected=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]})),ids);
   const errors=ids.flatMap(id=>Object.keys(expected[id]).map(key=>({id,key,delta:Math.abs(actual[id][key]-expected[id][key])})));
   const maxDeltaPx=Math.max(...errors.map(e=>e.delta));
   report.results.push({viewport:env,phase,measurements,expected,actual,maxDeltaPx,errors:errors.filter(e=>e.delta>0.5)});
   assert.ok(maxDeltaPx<=0.5,'Chromium parity failure '+JSON.stringify(report.results.at(-1)));
  }
  assert.ok(lineCounts[1]>lineCounts[0],'resize must exercise new line breaks');
  await page.close();
 }
 report.host='pass';
}catch(e){report.error=String(e.stack||e);throw e;}
finally{if(browser)await browser.close();fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
