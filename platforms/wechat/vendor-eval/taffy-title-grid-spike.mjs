import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob,within} from '../../../scripts/source-integrity.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream');
const vendor=fs.realpathSync(process.argv[3]||'vendor-taffy');
const source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-taffy-052g');
const evidence=path.join(work,'evidence');
const probe=path.join(work,'probe');
fs.rmSync(work,{recursive:true,force:true});
fs.mkdirSync(path.join(probe,'src'),{recursive:true});
fs.mkdirSync(evidence,{recursive:true});
assertDisjoint(checkout,work);
assertDisjoint(vendor,work);

function exec(cmd,args,cwd,timeout=18*60*1000){
  const r=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout,maxBuffer:64*1024*1024,env:{...process.env,CARGO_TERM_COLOR:'never'}});
  if(r.error)throw r.error;
  assert.equal(r.status,0,['$ '+cmd+' '+args.join(' '),r.stdout||'',r.stderr||''].join('\n'));
  return r.stdout.trim();
}
const git=(cwd,...args)=>exec('git',args,cwd,30000);
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);
assert.equal(git(vendor,'rev-parse','HEAD'),'497de49c200daee81a18ce627bec98d5340ae57a');
const sourceBefore=snapshot(source);

const cargoRoot=fs.readFileSync(path.join(vendor,'Cargo.toml'),'utf8');
assert.match(cargoRoot,/^version\s*=\s*"0\.16\.0"/m);
assert.match(cargoRoot,/^license\s*=\s*"MIT"/m);
const vendorPath=vendor.replaceAll('\\','/').replaceAll('"','\\"');
const cargo=[
  '[package]',
  'name = "h5publisher_taffy_probe"',
  'version = "0.0.0"',
  'edition = "2021"',
  '',
  '[lib]',
  'crate-type = ["cdylib"]',
  '',
  '[dependencies]',
  'taffy = { path = "'+vendorPath+'", default-features = false, features = ["std","taffy_tree","grid","flexbox","block_layout","calc"] }',
  '',
  '[profile.release]',
  'opt-level = "s"',
  'lto = "fat"',
  'codegen-units = 1',
  'panic = "abort"',
  ''
].join('\n');
fs.writeFileSync(path.join(probe,'Cargo.toml'),cargo);
fs.copyFileSync(path.join(root,'platforms/wechat/vendor-eval/taffy-title-grid-probe.rs'),path.join(probe,'src/lib.rs'));

const report={
  stage:'0.5.2g-taffy-mobile-title-grid',
  result:'fail',
  sourceSha:spec.sourceSha,
  candidate:{repo:'DioxusLabs/taffy',sha:'497de49c200daee81a18ce627bec98d5340ae57a',version:'0.16.0',license:'MIT'},
  officialDevTools:'not-run',
  wxWebAssembly:'not-run',
  releaseReady:false,
  geometryGatePx:0.5
};
let server,browser;
try{
  report.toolchain={rustc:exec('rustc',['--version'],probe,30000),cargo:exec('cargo',['--version'],probe,30000)};
  exec('cargo',['build','--release','--target','wasm32-unknown-unknown'],probe);
  const wasmPath=path.join(probe,'target/wasm32-unknown-unknown/release/h5publisher_taffy_probe.wasm');
  const bytes=fs.readFileSync(wasmPath);
  const module=new WebAssembly.Module(bytes);
  report.wasm={
    bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'),
    imports:WebAssembly.Module.imports(module),
    exports:WebAssembly.Module.exports(module).map(x=>x.name)
  };
  assert.equal(report.wasm.imports.length,0,'Taffy probe WASM must be import-free');
  const instantiated=await WebAssembly.instantiate(bytes,{});
  const metric=instantiated.instance.exports.TaffyTitleGridMetric;
  assert.equal(typeof metric,'function','Taffy metric export missing');

  const css=fs.readFileSync(path.join(source,'styles.css'),'utf8');
  assert.match(css,/body\.is-mobile\s+\.title-hero-column\s*\{[\s\S]{0,1400}?grid-template-columns:\s*minmax\(0,\s*1\.04fr\)\s+minmax\(248px,\s*0\.96fr\)/m);

  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  server=http.createServer((req,res)=>{
    try{
      const u=new URL(req.url,'http://127.0.0.1');
      const p=path.resolve(source,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
      if(!within(source,p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});
      fs.createReadStream(p).pipe(res);
    }catch{res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({
    viewport:{width:844,height:390},
    deviceScaleFactor:2,
    isMobile:true,
    hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/158 Mobile Safari/537.36'
  });
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await ctx.newPage();
  await page.goto(origin+'/',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>window.__ABV_BOOTED__===true&&document.body.classList.contains('is-mobile'),{},{timeout:45000});
  await page.waitForFunction(()=>{
    const e=document.querySelector('.title-hero-column');
    return e&&getComputedStyle(e).display==='grid'&&e.getBoundingClientRect().width>300;
  },{},{timeout:10000});
  const ref=await page.locator('.title-hero-column').evaluate(el=>{
    const r=el.getBoundingClientRect();
    const cs=getComputedStyle(el);
    const children=['.title-brand-col','.title-action-col'].map(sel=>{
      const x=el.querySelector(sel).getBoundingClientRect();
      return {selector:sel,x:x.left-r.left,width:x.width};
    });
    return {width:r.width,gap:parseFloat(cs.columnGap),computedTemplate:cs.gridTemplateColumns,children,bodyClass:document.body.className};
  });
  await page.locator('.title-hero-column').screenshot({path:path.join(evidence,'mobile-title-grid-original.png')});
  await ctx.close();

  const actual={
    firstWidth:metric(ref.width,ref.gap,0),
    secondX:metric(ref.width,ref.gap,1),
    secondWidth:metric(ref.width,ref.gap,2),
    rootWidth:metric(ref.width,ref.gap,3)
  };
  const expected={
    firstWidth:ref.children[0].width,
    secondX:ref.children[1].x,
    secondWidth:ref.children[1].width,
    rootWidth:ref.width
  };
  const delta=Object.fromEntries(Object.keys(expected).map(k=>[k,Math.abs(actual[k]-expected[k])]));
  report.reference=ref;
  report.actual=actual;
  report.delta=delta;
  report.maxDelta=Math.max(...Object.values(delta));
  assert.ok(report.maxDelta<=report.geometryGatePx,'Taffy mobile title Grid delta '+report.maxDelta+'px exceeds '+report.geometryGatePx+'px');
  report.result='mobile-title-grid-parity-proven';
}catch(e){
  report.error=String(e.stack||e);
  console.error(report.error);
  process.exitCode=1;
}finally{
  try{assertSnapshot(source,sourceBefore,'Frozen source');report.sourceIntegrity='pass';}
  catch(e){report.sourceIntegrity='fail';report.result='fail';report.error=String(e.stack||e);process.exitCode=1;}
  if(browser)await browser.close().catch(()=>{});
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(evidence,'taffy-title-grid-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
