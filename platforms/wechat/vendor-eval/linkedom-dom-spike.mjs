import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';
import {parseHTML,Event,CustomEvent} from 'linkedom/worker';
import {gitBlob} from '../../../scripts/source-integrity.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||'upstream');
const source=path.join(checkout,'docs',spec.game);
const work=path.join(root,'.work/wechat-linkedom-052e'),evidence=path.join(work,'evidence');
fs.rmSync(work,{recursive:true,force:true});
fs.mkdirSync(evidence,{recursive:true});

const git=(cwd,...args)=>{
  const r=spawnSync('git',args,{cwd,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);
  return r.stdout.trim();
};
assert.equal(git(checkout,'rev-parse','HEAD'),spec.sourceSha);
assert.equal(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);

const require=createRequire(import.meta.url);
const pkg=require('linkedom/package.json');
assert.equal(pkg.version,'0.18.15');
assert.equal(pkg.license,'ISC');

const report={
  stage:'0.5.2e-linkedom-dom-semantics',
  result:'fail',
  sourceSha:spec.sourceSha,
  candidate:{package:'linkedom',version:pkg.version,license:pkg.license,entry:'linkedom/worker'},
  releaseReady:false,
  officialDevTools:'not-run',
  scope:'DOM semantics only; no CSS layout, paint or browser geometry'
};

function files(dir){
  const out=[];
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name),s=fs.statSync(p);
    if(s.isDirectory())out.push(...files(p));
    else if(p.endsWith('.js'))out.push(p);
  }
  return out;
}
function count(text,re){return [...text.matchAll(re)].length;}

try{
  const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
  const {window,document}=parseHTML(html);
  for(const name of ['getElementById','querySelector','querySelectorAll','createElement','createElementNS','createTextNode']){
    assert.equal(typeof document[name],'function','missing document.'+name);
  }
  assert.ok(document.body&&document.documentElement);

  const grid=document.getElementById('save-slots-grid');
  assert.ok(grid,'frozen save grid missing');
  grid.innerHTML='';

  const card=document.createElement('button');
  const head=document.createElement('div');
  const meta=document.createElement('div');
  card.type='button';
  card.className='save-slot-card';
  card.dataset.slot='0';
  card.style.setProperty('--probe','1');
  head.className='save-slot-head';
  head.innerHTML='<span>槽位 1</span><span>00:00</span>';
  meta.className='save-slot-meta';
  meta.textContent='empty';
  card.append(head,meta);
  grid.appendChild(card);

  assert.equal(grid.children.length,1);
  assert.equal(grid.querySelectorAll('.save-slot-card').length,1);
  assert.equal(card.dataset.slot,'0');
  assert.equal(card.style.getPropertyValue('--probe'),'1');

  card.classList.add('active');
  card.classList.toggle('active');
  card.classList.toggle('active');
  assert.equal(card.classList.contains('active'),true);

  let clicks=0;
  card.addEventListener('click',()=>clicks++);
  card.dispatchEvent(new Event('click',{bubbles:true}));
  assert.equal(clicks,1);

  const custom=new CustomEvent('probe',{detail:{ok:true}});
  let detail=null;
  document.addEventListener('probe',e=>detail=e.detail);
  document.dispatchEvent(custom);
  assert.deepEqual(detail,{ok:true});

  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('d','M0 0L1 1');
  svg.appendChild(p);
  assert.equal(svg.querySelectorAll('path').length,1);

  document.body.dataset.gameState='intro';
  assert.equal(document.body.dataset.gameState,'intro');

  const before=grid.children.length;
  grid.innerHTML='';
  assert.equal(before,1);
  assert.equal(grid.children.length,0,'fresh children lookup must reflect mutation');

  const sourceFiles=files(path.join(source,'src'));
  let sourceText='';
  for(const pth of sourceFiles)sourceText+='\n'+fs.readFileSync(pth,'utf8');

  const live={
    getElementsByTagName:count(sourceText,/\bgetElementsByTagName\s*\(/g),
    getElementsByClassName:count(sourceText,/\bgetElementsByClassName\s*\(/g),
    documentAll:count(sourceText,/\bdocument\.all\b/g),
    mutationObserver:count(sourceText,/\bMutationObserver\b/g)
  };
  assert.equal(Object.values(live).reduce((a,b)=>a+b,0),0,'Frozen source uses a LinkeDOM live-collection/observer gap');

  report.sourceAudit={
    modules:sourceFiles.length,
    unsupportedLiveCollectionRefs:live,
    childrenRefs:count(sourceText,/\.children\b/g),
    childNodesRefs:count(sourceText,/\.childNodes\b/g),
    getComputedStyleRefs:count(sourceText,/\bgetComputedStyle\s*\(/g)+count(sourceText,/\.getComputedStyle\s*\(/g),
    getBoundingClientRectRefs:count(sourceText,/\.getBoundingClientRect\s*\(/g)
  };
  assert.ok(report.sourceAudit.getComputedStyleRefs>0||report.sourceAudit.getBoundingClientRectRefs>0,'Expected explicit external layout/style boundary');

  report.domContract={
    selectors:true,
    mutation:true,
    classList:true,
    styleDeclaration:true,
    dataset:true,
    events:true,
    svgNamespace:true,
    freshCollectionReads:true
  };

  const entry=path.join(work,'bundle-entry.mjs');
  const outfile=path.join(work,'linkedom-worker.bundle.js');
  fs.writeFileSync(entry,"import {parseHTML,Event,CustomEvent} from 'linkedom/worker';globalThis.__H5PUBLISHER_LINKEDOM__={parseHTML,Event,CustomEvent};\n");
  const built=await build({
    entryPoints:[entry],
    outfile,
    bundle:true,
    platform:'browser',
    format:'iife',
    target:'es2018',
    minify:true,
    metafile:true,
    logLevel:'silent'
  });

  const bytes=fs.readFileSync(outfile);
  const bundleText=bytes.toString('utf8');
  assert.ok(bytes.length<4*1024*1024,'DOM semantics candidate alone exceeds 4 MiB planning budget');
  assert.doesNotMatch(bundleText,/\bnode:(?:fs|path|util|stream|buffer|events|crypto)\b|require\(["'](?:fs|path|util|stream|buffer|events|crypto)["']\)/,'Browser bundle contains Node built-ins');

  const sandbox={console,performance,TextEncoder,TextDecoder};
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleText,sandbox,{timeout:5000});
  const bundled=sandbox.__H5PUBLISHER_LINKEDOM__;
  assert.equal(typeof bundled?.parseHTML,'function');
  const check=bundled.parseHTML('<button id="x">ok</button>');
  assert.equal(check.document.getElementById('x').textContent,'ok');

  report.bundle={
    bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'),
    inputs:Object.keys(built.metafile.inputs).length,
    nodeBuiltinFree:true,
    browserExecution:true
  };
  report.boundaries={
    layout:'external-float-pigment',
    computedStyle:'external-source-cascade',
    paint:'external-canvas-layer',
    geometryFromLinkedom:false
  };
  report.result='dom-semantics-candidate-proven';
}catch(e){
  report.error=String(e.stack||e);
  console.error(report.error);
  process.exitCode=1;
}finally{
  fs.writeFileSync(path.join(evidence,'linkedom-dom-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
