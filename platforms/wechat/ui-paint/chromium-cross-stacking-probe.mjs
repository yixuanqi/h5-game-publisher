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
const report={stage:'V0.5.4d3b',scope:'cross-ancestor contexts, auto-z wrappers, clipping and nested opacity, host only',host:'fail',wx:'not-run',releaseReady:false,visualParity:false,results:[]};
let browser;
try{
 const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
 browser=await chromium.launch({headless:true});
 const html='<div id="root"><div id="wrapA"><div id="innerWrap"><div id="front"><div id="overlap"></div><div id="nested"></div></div></div><div id="behind"></div></div><div id="wrapB"><div id="clip"><div id="wide"></div></div><div id="tie"></div></div><div id="normal"></div></div>';
 const css='*{box-sizing:border-box;margin:0;padding:0}body{background:#fff}#root{position:relative;z-index:0;display:block;width:320px;height:200px;background:#10243a}#wrapA,#innerWrap{position:relative;width:0;height:0}#wrapB{position:absolute;left:0;top:0;width:190px;height:100px;overflow:hidden}#front{position:absolute;z-index:3;left:40px;top:40px;width:128px;height:80px;background:#e0a53a;opacity:0.5}#overlap{position:absolute;z-index:1;left:40px;top:10px;width:80px;height:50px;background:#bc384f}#nested{position:absolute;z-index:2;left:8px;top:30px;width:64px;height:32px;background:#20b070;opacity:0.5}#normal{width:100px;height:64px;background:#546f94}#behind{position:absolute;z-index:-1;left:20px;top:10px;width:130px;height:76px;background:#483a60}#clip{position:absolute;z-index:2;left:100px;top:30px;width:100px;height:72px;overflow:hidden;background:#2b7c9c;transform:translateX(10px) scale(1.25);transform-origin:0px 0px}#wide{width:144px;height:32px;background:#b9cde2}#tie{position:absolute;z-index:3;left:150px;top:66px;width:60px;height:50px;background:#8766aa}';
 const plan=compileRuntimeCssPlan(css,{paint:true});
 const paintKeys=new Set('background background-color border-radius overflow-x overflow-y opacity z-index transform transform-origin visibility box-shadow border-top-color border-right-color border-bottom-color border-left-color border-top-style border-right-style border-bottom-style border-left-style'.split(' '));
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
    document.querySelector('#clip').setAttribute('style','transform:translateY(20px) scale(1);z-index:4');
    document.querySelector('#front').setAttribute('style','opacity:0.75');
    await page.locator('#clip').evaluate(el=>{el.style.transform='translateY(20px) scale(1)';el.style.zIndex='4';});
    await page.locator('#front').evaluate(el=>el.style.opacity='0.75');
   }
   const tree=visit(document.querySelector('#root'));
   const snap=createLayoutSnapshot(backend,tree,env),list=buildBoxPaintList(tree,snap,{stacking:true,crossAncestor:true});
   const prefix=env.width+'x'+env.height+'-'+phase;
   const expected=await page.screenshot({path:path.join(out,prefix+'-expected.png')});
   const canvas=await browser.newPage({viewport:{width:env.width,height:env.height},deviceScaleFactor:1});
   await canvas.setContent('<!doctype html><style>body{margin:0;background:#fff}canvas{display:block}</style><canvas></canvas>');
   await canvas.evaluate(async({list,module,width,height})=>{
    const c=document.querySelector('canvas');c.width=width;c.height=height;
    const url=URL.createObjectURL(new Blob([module],{type:'text/javascript'}));
    try{const m=await import(url);m.replayBoxPaint(c.getContext('2d'),list,{createSurface:(w,h)=>{const layer=document.createElement('canvas');layer.width=w;layer.height=h;return layer;}});}finally{URL.revokeObjectURL(url);}
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
