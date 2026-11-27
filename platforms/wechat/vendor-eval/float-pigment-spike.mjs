import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {snapshot,assertSnapshot,assertDisjoint,gitBlob} from '../../../scripts/source-integrity.mjs';
import {FLOAT_PIGMENT,classifyFloatPigmentProbe} from './vendor-pins.mjs';
import {buildFloatPigmentWasm} from '../runtime/float-pigment-build.mjs';
import {writeWxWasmFixture} from './wx-wasm-fixture.mjs';
const {instantiatePackagedWasm,createFloatPigmentBackend}=createRequire(import.meta.url)('../runtime/float-pigment-runtime.cjs');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const gameCheckout=fs.realpathSync(process.argv[2]||'upstream');
const vendor=fs.realpathSync(process.argv[3]||'vendor-float-pigment');
const source=path.join(gameCheckout,'docs',spec.game);
const work=path.join(root,'.work/wechat-vendor-layout'),evidence=path.join(work,'evidence');
const buildDir=path.join(work,'float-pigment-build'),wasmPath=path.join(work,'float-pigment-layout.wasm');
fs.mkdirSync(evidence,{recursive:true});assertDisjoint(gameCheckout,work);assertDisjoint(vendor,work);
function git(cwd,...args){const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();}
assert.equal(git(gameCheckout,'rev-parse','HEAD'),spec.sourceSha);assert.equal(git(gameCheckout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game),'');
assert.equal(gitBlob(fs.readFileSync(path.join(source,'src/main.js'))),spec.mainBlob);assert.equal(git(vendor,'rev-parse','HEAD'),FLOAT_PIGMENT.sha);
const sourceBefore=snapshot(source);
const report={stage:'0.5.2d-float-pigment-runtime-backend',result:'fail',framework:git(root,'rev-parse','HEAD'),sourceSha:spec.sourceSha,sourceIntegrity:'unknown',officialDevTools:'not-run',wxWebAssemblyRun:'not-run',releaseReady:false,parityReady:false,candidate:{...FLOAT_PIGMENT},limitations:['Host Node WebAssembly execution is not WeChat WXWebAssembly evidence.','The generated wx-wasm-fixture is importable evidence scaffolding, not a release project.','DOM/BOM mapping, paint/text and full game integration remain separate gates.']};
try{
  const html=fs.readFileSync(path.join(source,'index.html'),'utf8'),css=fs.readFileSync(path.join(source,'styles.css'),'utf8'),saveUi=fs.readFileSync(path.join(source,'src/ui/hudCore.js'),'utf8');
  report.sourceRequiresGrid=/id=["']save-slots-grid[#']/.test(html)&&/\.save-slots-grid\s*\{[\s\S]{0,500}?display\s*:\s*grid\s*;/m.test(css)&&/getElementById\(['"]save-slots-grid['"]\)/.test(saveUi)&&/innerHTML\s*=\s*['"]['"]/.test(saveUi);
  assert.equal(report.sourceRequiresGrid,true,'Frozen V46.1 dynamic save UI Grid contract was not found');
  report.sourceEvidence={dynamicSaveSlots:true,cssGrid:true,sourceFiles:['index.html','styles.css','src/ui/hudCore.js']};
  const built=buildFloatPigmentWasm({vendor,workDir:buildDir,outFile:wasmPath});report.toolchain=built.toolchain;report.wasmBuildPass=true;report.wasmBuildElapsedMs=built.elapsedMs;report.wasm={bytes:built.bytes,sha256:built.sha256};
  const bytes=fs.readFileSync(wasmPath),module=new WebAssembly.Module(bytes);report.wasmImports=WebAssembly.Module.imports(module);report.wasmExports=WebAssembly.Module.exports(module).map(x=>x.name);
  assert.equal(report.wasmImports.length,0,'Layout bridge must stay import-free for deterministic Mini Game loading');
  const loaded=await instantiatePackagedWasm({host:globalThis,bytes,imports:{}});assert.equal(loaded.runtime,'standard');
  const fp=createFloatPigmentBackend(loaded.instance),rootNode=fp.createNode(),children=[fp.createNode(),fp.createNode(),fp.createNode()];
  fp.setDisplay(rootNode,'grid');fp.setWidth(rootNode,300);fp.setGap(rootNode,{column:9});fp.setGridTemplateColumns(rootNode,[{unit:'fr',value:1},{unit:'fr',value:1},{unit:'fr',value:1}]);
  for(const child of children){fp.setHeight(child,20);fp.appendChild(rootNode,child);}fp.calculate(rootNode,{width:300,height:100,maxWidth:300,maxHeight:100});
  const actualX=fp.rect(children[1]).x,expectedX=103,delta=Math.abs(actualX-expectedX);report.wasmGrid={width:300,gap:9,expectedSecondX:expectedX,actualSecondX:actualX,delta};assert.ok(delta<=0.05,`Grid mismatch: expected ${expectedX}, got ${actualX}`);report.wasmGridExecutionPass=true;
  for(const child of children)fp.freeNode(child);fp.freeNode(rootNode);
  report.fixture=writeWxWasmFixture({wasmPath,vendor,outDir:path.join(evidence,'wx-wasm-fixture')});
  report.decision=classifyFloatPigmentProbe(report);assert.equal(report.decision,'host-wasm-proven-wx-pending');report.result='runtime-backend-host-proven';
}catch(e){report.error=String(e.stack||e);report.wasmBuildPass??=false;report.wasmGridExecutionPass??=false;report.decision=classifyFloatPigmentProbe(report);console.error(report.error);process.exitCode=1;}finally{
  try{assertSnapshot(source,sourceBefore,'Original source');report.sourceIntegrity='pass';}catch(e){report.sourceIntegrity='fail';report.result='fail';report.error=String(e.stack||e);process.exitCode=1;}
  fs.writeFileSync(path.join(evidence,'float-pigment-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
