import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build as bundle} from 'esbuild';
import {writeJsonModule,assertWechatEntryRequires} from '../runtime/json-module-build.mjs';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {snapshot,assertSnapshot,assertDisjoint,digestManifest,gitBlob} from '../../../scripts/source-integrity.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'platforms/wechat/bootstrap/compatibility.json'),'utf8'));
const checkout=fs.realpathSync(process.argv[2]||path.join(root,'upstream'));
const appid='touristappid';
if(!/^(?:touristappid|wx[0-9a-f]{16})$/.test(appid))throw Error('Invalid AppID');

const work=path.join(root,'.work/wechat-canvas-diagnostic-052g');
const project=path.join(work,'project'),raw=path.join(work,'raw');
assertDisjoint(checkout,work);
if(fs.existsSync(work))throw Error('Use a fresh original-entry workspace: '+work);

function git(cwd,...args){
  const r=spawnSync('git',args,{cwd,encoding:'utf8'});
  if(r.status!==0)throw Error('git '+args.join(' ')+' failed: '+r.stderr);
  return r.stdout.trim();
}
function sha256(data){return createHash('sha256').update(data).digest('hex');}
function writeJson(p,v){fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}

const source=path.join(checkout,'docs',spec.game);
if(git(checkout,'rev-parse','HEAD')!==spec.sourceSha)throw Error('Unexpected frozen source SHA');
if(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game))throw Error('Frozen source is dirty');
if(gitBlob(fs.readFileSync(path.join(source,'src/main.js')))!==spec.mainBlob)throw Error('Frozen main blob mismatch');
const sourceBefore=snapshot(source);

try{
  fs.mkdirSync(project,{recursive:true});
  const imported=exportGame(spec.game,checkout,raw),rawBefore=snapshot(raw);
  const html=fs.readFileSync(path.join(raw,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(raw,'styles.css'),'utf8');
  const layoutPlan=compileRuntimeCssPlan(css);

  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>({attrs:m[1].trim(),body:m[2]}));
  const inline=scripts.filter(x=>!/\bsrc\s*=/.test(x.attrs));
  const external=scripts.filter(x=>/\bsrc\s*=/.test(x.attrs));
  if(inline.length!==1)throw Error('Frozen HTML inline diagnostic count changed');
  if(external.length!==1||!/type=["']module["']/.test(external[0].attrs)||!/src=["']\.\/src\/main\.js\?v=46\.1\.0["']/.test(external[0].attrs))throw Error('Frozen module entry contract changed');

  fs.cpSync(path.join(raw,'data'),path.join(project,'data'),{recursive:true,errorOnExist:true,force:false});
  fs.writeFileSync(path.join(project,'source-styles.css'),css);
  writeJsonModule(project,'layout-plan.js',layoutPlan);
  fs.writeFileSync(path.join(project,'html.js'),"'use strict';\nmodule.exports="+JSON.stringify(html)+";\n");

  const require=createRequire(import.meta.url),linkedomPkg=require('linkedom/package.json');
  if(linkedomPkg.version!=='0.18.15'||linkedomPkg.license!=='ISC')throw Error('Unexpected linkedom candidate');
  const linkedomRoot=path.dirname(require.resolve('linkedom/package.json'));
  const licensePath=['LICENSE','LICENSE.md','LICENSE.txt'].map(x=>path.join(linkedomRoot,x)).find(fs.existsSync);
  if(!licensePath)throw Error('Linkedom license file missing');
  fs.mkdirSync(path.join(project,'third-party'),{recursive:true});
  fs.copyFileSync(licensePath,path.join(project,'third-party/linkedom-ISC.txt'));

  const hostResult=await bundle({
    entryPoints:[path.join(here,'host.mjs')],
    outfile:path.join(project,'host.js'),
    bundle:true,
    format:'cjs',
    platform:'browser',
    target:'es2018',
    metafile:true,
    minify:true,
    logLevel:'warning'
  });

  const define={
    window:'globalThis.__h5WechatWindow',
    document:'globalThis.__h5WechatDocument',
    navigator:'globalThis.__h5WechatNavigator',
    fetch:'globalThis.__h5WechatFetch',
    performance:'globalThis.__h5WechatPerformance',
    requestAnimationFrame:'globalThis.__h5WechatRequestAnimationFrame',
    cancelAnimationFrame:'globalThis.__h5WechatCancelAnimationFrame',
    localStorage:'globalThis.__h5WechatLocalStorage',
    URLSearchParams:'globalThis.__h5WechatURLSearchParams',
    setTimeout:'globalThis.__h5WechatSetTimeout',
    clearTimeout:'globalThis.__h5WechatClearTimeout'
  };
  const engineResult=await bundle({
    entryPoints:[path.join(raw,'src/main.js')],
    outfile:path.join(project,'engine.js'),
    bundle:true,
    format:'cjs',
    platform:'browser',
    target:'es2018',
    metafile:true,
    minify:false,
    logLevel:'warning',
    define
  });

  writeJson(path.join(project,'game.json'),{deviceOrientation:'landscape'});
  writeJson(path.join(project,'project.config.json'),{
    appid,
    compileType:'game',
    projectname:'ashen-bell-vow-canvas-diagnostic-052g-NOT-RELEASE',
    miniprogramRoot:'./',
    setting:{es6:true,minified:false}
  });
  fs.writeFileSync(path.join(project,'game.js'),[
    "'use strict';",
    "const html=require('./html.js');",
    "const layoutPlan=require('./layout-plan.js');",
    "module.exports=require('./host.js').startCanvasDiagnostic(wx,()=>require('./engine.js'),html,layoutPlan,globalThis);",
    ''
  ].join('\n'));

  const entryRequires=assertWechatEntryRequires(project);
  const browserRefs={};
  for(const item of rawBefore.filter(x=>x.path.startsWith('src/')&&x.path.endsWith('.js'))){
    const text=fs.readFileSync(path.join(raw,item.path),'utf8');
    const hits=['document','window','localStorage','navigator','fetch','performance','requestAnimationFrame','cancelAnimationFrame','URLSearchParams','getComputedStyle','AudioContext','OfflineAudioContext'].filter(k=>new RegExp('\\b'+k+'\\b').test(text));
    if(hits.length)browserRefs[item.path]=hits;
  }

  assertSnapshot(raw,rawBefore,'Raw frozen export');
  assertSnapshot(path.join(project,'data'),snapshot(path.join(raw,'data')),'Packaged world JSON');

  writeJson(path.join(project,'diagnostic-contract.json'),{kind:'wechat-canvas-diagnostic-052g-not-release',sourceSha:spec.sourceSha,releaseReady:false,expectedStateGlobal:'__H5PUBLISHER_CANVAS_PROBE__',successPhase:'CANVAS_PLAYING_OBSERVED',layoutBackend:'intentionally-isolated',domPaint:'not-wired',inputBridge:'native-touch-to-original-dom-diagnostic',startup:'synthetic-DOM-start-only'});
  const manifest=snapshot(project);
  const bytes=manifest.reduce((n,x)=>n+fs.statSync(path.join(project,x.path)).size,0);
  if(bytes>4*1024*1024)throw Error('Original-entry diagnostic exceeds 4 MiB planning budget: '+bytes);

  const engineText=fs.readFileSync(path.join(project,'engine.js'),'utf8');
  const requiredAliasKeys=['window','document','navigator','fetch','performance','requestAnimationFrame','localStorage','URLSearchParams','setTimeout','clearTimeout'];
  for(const key of requiredAliasKeys){const privateName=define[key];if(!engineText.includes(privateName))throw Error('Expected private alias absent from engine bundle: '+privateName);}

  const info={
    schema:1,
    kind:'wechat-canvas-diagnostic-052g-not-release',
    sourceSha:spec.sourceSha,
    sourceVersion:spec.version,
    mainBlob:spec.mainBlob,
    sourceIntegrity:'pass',
    releaseReady:false,
    visualParity:false,
    officialDevTools:'not-run',
    physicalDevice:'not-run',
    domPaint:'not-wired',
    inputBridge:'native-touch-to-original-dom-diagnostic',
    framework:git(root,'rev-parse','HEAD'),
    frameworkDirty:!!git(root,'status','--porcelain','--untracked-files=all'),
    sourceTreeSha256:imported.sourceTreeSha256,
    rawFilesSha256:imported.sourceFilesSha256,
    originalHtml:{sha256:sha256(html),bytes:Buffer.byteLength(html)},
    originalCss:{sha256:sha256(css),bytes:Buffer.byteLength(css),packagedAs:'source-styles.css'},
    layoutPlan:{schema:layoutPlan.schema,rules:layoutPlan.rules.length,maxOrder:layoutPlan.maxOrder,skippedPseudoElements:layoutPlan.skippedPseudoElements.length,sha256:sha256(JSON.stringify(layoutPlan))},
    inlineScripts:[{sha256:sha256(inline[0].body),bytes:Buffer.byteLength(inline[0].body),policy:'browser startup/network diagnostic intentionally not executed in Mini Game host'}],
    moduleEntry:'./src/main.js?v=46.1.0',
    linkedom:{version:linkedomPkg.version,license:linkedomPkg.license,entry:'linkedom/worker'},
    floatPigment:'intentionally-isolated',
    entryRequires,
    privateAliases:Object.keys(define),
    engineInputs:Object.keys(engineResult.metafile.inputs).length,
    hostInputs:Object.keys(hostResult.metafile.inputs).length,
    browserRefs,
    projectFiles:manifest,
    projectFilesSha256:digestManifest(manifest),
    bytes
  };
  writeJson(path.join(work,'build-info.json'),info);

  console.log(JSON.stringify({project,bytes,engineInputs:info.engineInputs,hostInputs:info.hostInputs,releaseReady:false}));
}finally{
  assertSnapshot(source,sourceBefore,'Upstream source');
  if(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game))throw Error('Source became dirty');
}
