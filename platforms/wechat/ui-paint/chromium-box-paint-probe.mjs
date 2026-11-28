import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {parseHTML} from 'linkedom/worker';
import {PNG} from 'pngjs';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../runtime/css-plan-runtime.mjs';
import {createLayoutSnapshot} from '../ui-layout/dom-layout.mjs';
import {buildBoxPaintList} from './box-paint.mjs';
const {loadTaffy}=createRequire(import.meta.url)('../ui-layout/taffy-runtime.cjs');
const [wasm,out]=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const report={stage:'V0.5.4d1',scope:'synthetic solid backgrounds and uniform rounded clipping, host only',host:'fail',wx:'not-run',releaseReady:false,visualParity:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const html='<div id="root"><div id="clip"><div id="wide"></div><div id="inner"></div></div><div id="tail"></div></div>';
 const css='*{box-sizing:border-box;margin:0;padding:0}body{background:#fff}#root{display:flex;flex-direction:column;width:320px;height:200px;padding:16px;row-gap:8px;background:#10243a}#clip{width:160px;height:88px;flex-shrink:0;background:#e0a53a;border-radius:12px;overflow:hidden}#wide{width:200px;height:42px;background:#bc384f}#inner{width:80px;height:32px;background:rgba(12, 66, 120, 0.5)}#tail{width:92px;height:32px;background:#e2e8f0;border-radius:8px}';
 const plan=compileRuntimeCssPlan(css);
 const paintKeys=new Set('background background-color border-radius overflow-x overflow-y opacity z-index transform visibility'.split(' '));
 const module=fs.readFileSync(new URL('./box-paint.mjs',import.meta.url),'utf8');
 for(const env of [{width:844,height:390,pointer:'coarse'},{width:640,height:360,pointer:'coarse'}]){
  const page=await browser.newPage({viewport:{width:env.width,height:env.height},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>'+css+'</style>'+html);
  const {document}=parseHTML('<html><body>'+html+'</body></html>');
  function visit(el,parentStyle={}){
   const r=resolvePlanStyle(plan,el,env,parentStyle);assert.deepEqual(r.unsupportedSelectors,[]);
   const style={},paintStyle={};
   for(const [k,v] of Object.entries(r.values))(paintKeys.has(k)?paintStyle:style)[k]=v;
   return {element:el,style,paintStyle,children:[...el.children].map(c=>visit(c,r.values))};
  }
  for(const phase of ['initial','changed']){
   if(phase==='changed'){
    document.querySelector('#clip').setAttribute('style','width:120px;border-radius:16px');
    await page.locator('#clip').evaluate(el=>{el.style.width='120px';el.style.borderRadius='16px';});
   }
   const tree=visit(document.querySelector('#root'));
   const snap=createLayoutSnapshot(backend,tree,env),list=buildBoxPaintList(tree,snap);
   const prefix=env.width+'x'+env.height+'-'+phase;
   const expected=await page.screenshot({path:path.join(out,prefix+'-expected.png')});
   const canvas=await browser.newPage({viewport:{width:env.width,height:env.height},deviceScaleFactor:1});
   await canvas.setContent('<!doctype html><style>body{margin:0;background:#fff}canvas{display:block}</style><canvas></canvas>');
   await canvas.evaluate(async({list,module,width,height})=>{
    const c=document.querySelector('canvas');c.width=width;c.height=height;
    const url=URL.createObjectURL(new Blob([module],{type:'text/javascript'}));
    try{const m=await import(url);m.replayBoxPaint(c.getContext('2d'),list);}finally{URL.revokeObjectURL(url);}
   },{list,module,width:env.width,height:env.height});
   const actual=await canvas.screenshot({path:path.join(out,prefix+'-actual.png')});await canvas.close();
   const a=PNG.sync.read(actual),b=PNG.sync.read(expected);
   assert.equal(a.width,b.width);assert.equal(a.height,b.height);
   let bad=0,max=0,sum=0;
   for(let i=0;i<a.data.length;i+=4){
    const d=Math.max(...[0,1,2,3].map(k=>Math.abs(a.data[i+k]-b.data[i+k])));
    max=Math.max(max,d);sum+=d;if(d>8)bad++;
   }
   // Canvas and browser CSS rounded edge antialiasing may differ. Bound
   // the count and total error over the *painted root*, not the whole screen.
   const paintArea=320*200;
   const result={viewport:env,phase,commands:list.commands.length,badPixels:bad,maxChannelDelta:max,meanMaxChannelDelta:sum/paintArea,badPixelRatio:bad/paintArea};
   report.results.push(result);fs.writeFileSync(path.join(out,prefix+'-commands.json'),JSON.stringify(list,null,2));
   assert.ok(bad/paintArea<=0.01&&sum/paintArea<=0.6,JSON.stringify(result));
  }
  await page.close();
 }
 report.host='pass';
}catch(e){report.error=String(e.stack||e);throw e;}
finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
