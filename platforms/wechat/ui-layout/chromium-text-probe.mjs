import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {parseHTML} from 'linkedom/worker';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../runtime/css-plan-runtime.mjs';
import {createLayoutSnapshot} from './dom-layout.mjs';
import {textDescriptor,directTextRun} from './text-metrics.mjs';
import {compareRectangles} from './title-audit-utils.mjs';
const {loadTaffy}=createRequire(import.meta.url)('./taffy-runtime.cjs');
const [wasm,out]=process.argv.slice(2);
const report={stage:'V0.5.4c3b2',scope:'synthetic CJK single-line flex leaves and explicitly styled button box',host:'fail',wx:'not-run',releaseReady:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const css='#root{display:flex;width:500px;height:80px;align-items:center;column-gap:8px}#label,#btn{display:block;font-family:serif;font-size:16px;font-weight:400;line-height:24px;letter-spacing:2px;white-space:nowrap;margin:0;box-sizing:border-box;padding:4px 8px;border:1px solid black}#tail{width:40px;height:20px}';
 const html='<div id="root"><div id="label">灰钟残誓</div><button id="btn">开始游戏</button><div id="tail"></div></div>';
 const plan=compileRuntimeCssPlan(css);
 for(const width of [640,844]){
  const env={width,height:390,pointer:'coarse'};
  const page=await browser.newPage({viewport:{width,height:390},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>body{margin:0}'+css+'</style>'+html);
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  const {document}=parseHTML('<html><body>'+html+'</body></html>');
  const textKeys=new Set('font-family font-size font-weight line-height letter-spacing text-align text-transform color white-space'.split(' '));
  const descriptors=[];
  function visit(el,parentStyle={}){
   const r=resolvePlanStyle(plan,el,env,parentStyle);assert.deepEqual(r.unsupportedSelectors,[]);
   const style={},textStyle={};
   for(const [k,v] of Object.entries(r.values))(textKeys.has(k)?textStyle:style)[k]=v;
   const text=directTextRun(el);
   if(text)descriptors.push({id:el.id,...textDescriptor(text,textStyle,env)});
   return {element:el,style,textStyle,children:[...el.children].map(c=>visit(c,r.values))};
  }
  const tree=visit(document.querySelector('#root'));
  const measured=await page.evaluate(ds=>{const c=document.createElement('canvas').getContext('2d');return ds.map(d=>{c.font=d.font;c.letterSpacing=d.letterSpacing+'px';return {id:d.id,width:c.measureText(d.text).width,height:d.lineHeight};});},descriptors);
  const metrics=new Map(measured.map(m=>[m.id,m]));
  const snap=createLayoutSnapshot(backend,tree,env,{measureSingleLine:({element})=>metrics.get(element.id)});
  const ids=['root','label','btn','tail'];
  const actual=Object.fromEntries(ids.map(id=>[id,snap.rect(document.querySelector('#'+id))]));
  const expected=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}];})),ids);
  const comparison=compareRectangles(expected,actual);
  const maxDeltaPx=Math.max(...ids.flatMap(id=>Object.keys(expected[id]).map(k=>Math.abs(expected[id][k]-actual[id][k]))));
  report.results.push({viewport:env,measured,expected,actual,maxDeltaPx,...comparison});
  assert.ok(comparison.pass,JSON.stringify(report.results.at(-1)));
  await page.close();
 }
 report.host='pass';
}catch(e){report.error=String(e.stack||e);throw e;}
finally{if(browser)await browser.close();fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
