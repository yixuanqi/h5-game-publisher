import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build as bundle} from 'esbuild';
import {exportGame} from '../../../scripts/import-blog.mjs';
import {snapshot,assertSnapshot,assertDisjoint,digestManifest,gitBlob} from '../../../scripts/source-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const spec=JSON.parse(fs.readFileSync(path.join(here,'compatibility.json'),'utf8'));
function git(cwd,...args){
  const r=spawnSync('git',args,{cwd,encoding:'utf8'});
  if(r.status!==0)throw Error('git '+args.join(' ')+' failed: '+r.stderr);
  return r.stdout.trim();
}
function writeJson(p,data){fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');}
const checkout=fs.realpathSync(process.argv[2]||path.join(root,'upstream'));
const renderMode=process.argv[4]==='--render';
if(process.argv[4]&&!renderMode)throw Error('Unknown build mode');
const work=path.resolve(root,renderMode?'.work/wechat-render-46.1':'.work/wechat-bootstrap-46.1');
const renderRoot=path.join(here,'../render');
const appid=process.argv[3]||'touristappid';
if(!/^(?:touristappid|wx[0-9a-f]{16})$/.test(appid))throw Error('Invalid AppID');
assertDisjoint(checkout,work);
if(fs.existsSync(work))throw Error('Use a fresh workspace; remove only '+work);
const source=path.join(checkout,'docs',spec.game);
if(git(checkout,'rev-parse','HEAD')!==spec.sourceSha||git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game))throw Error('Unapproved or dirty upstream');
if(gitBlob(fs.readFileSync(path.join(source,'src/main.js')))!==spec.mainBlob)throw Error('Entry blob mismatch');
const before=snapshot(source),project=path.join(work,'project'),raw=path.join(work,'raw');
const framework={commit:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain','--untracked-files=all')};
try{
  fs.mkdirSync(project,{recursive:true});
  const imported=exportGame(spec.game,checkout,raw);
  const rawBefore=snapshot(raw);
  fs.copyFileSync(path.join(renderMode?renderRoot:here,'engine-entry.mjs'),path.join(work,'engine-entry.mjs'));
  fs.cpSync(path.join(raw,'data'),path.join(project,'data'),{recursive:true,errorOnExist:true,force:false});
  fs.copyFileSync(path.join(here,'runtime.cjs'),path.join(project,'runtime.js'));
  fs.copyFileSync(path.join(here,'probe.cjs'),path.join(project,'probe.js'));
  if(renderMode){
    for(const f of ['scene.cjs','host.cjs','clock.cjs'])fs.copyFileSync(path.join(renderRoot,f),path.join(project,f.replace('.cjs','.js')));
  }
  writeJson(path.join(project,'game.json'),{deviceOrientation:'landscape'});
  writeJson(path.join(project,'project.config.json'),{appid,compileType:'game',projectname:renderMode?'ashen-bell-vow-render-not-for-release':'ashen-bell-vow-bootstrap-not-for-release',miniprogramRoot:'./',setting:{es6:true,minified:false}});
  fs.writeFileSync(path.join(project,'game.js'),"'use strict';\nmodule.exports=require('./probe.js').startProbe(wx,()=>require('./engine.js'),globalThis,[25,25,26]);\n");
  if(renderMode)fs.writeFileSync(path.join(project,'game.js'),"'use strict';\nmodule.exports=require('./host.js').startRender(wx,()=>require('./engine.js'));\n");
  // Scoped platform-only source transform: no general fake document, no game behavior changes.
  const approvedCanvasSites=new Map([['src/vfx.js',2],['src/renderParallax.js',2],['src/renderTerrain.js',1],['src/render/backdropCache.js',1]]);
  if(renderMode)for(const [name,count] of [['src/renderer.js',1],['src/render/glyphAtlas.js',3],['src/stampAtlas.js',1]])approvedCanvasSites.set(name,count);
  const transformed=new Set();
  const canvasPlugin={name:'wechat-offscreen-canvas',setup(build){
    build.onLoad({filter:/\.js$/},args=>{
      const rel=path.relative(raw,args.path).split(path.sep).join('/');
      if(!approvedCanvasSites.has(rel))return;
      const src=fs.readFileSync(args.path,'utf8'),anchor="document.createElement('canvas')";
      if(src.split(anchor).length-1!==approvedCanvasSites.get(rel))throw Error('Unreviewed Canvas sites '+rel);
      transformed.add(rel);
      return {contents:src.split(anchor).join('globalThis.__h5WechatCreateOffscreenCanvas()'),loader:'js'};
    });
  }};
  const result=await bundle({entryPoints:[path.join(work,'engine-entry.mjs')],outfile:path.join(project,'engine.js'),bundle:true,format:'cjs',platform:'browser',target:'es2018',metafile:true,logLevel:'warning',minify:false,plugins:[canvasPlugin]});
  if(transformed.size!==approvedCanvasSites.size)throw Error('Expected reviewed Canvas modules');
  if(renderMode){
    // Baseline runs original untransformed renderer on the SAME raster backend and diagnostic state.
    // Stored outside project, never part of distributable.
    await bundle({entryPoints:[path.join(work,'engine-entry.mjs')],outfile:path.join(work,'reference-engine.js'),bundle:true,format:'cjs',platform:'browser',target:'es2018',logLevel:'warning'});
  }
  // Audit the full real main module dependency graph separately. This is not an executed game.
  const full=await bundle({entryPoints:[path.join(raw,'src/main.js')],bundle:true,write:false,format:'cjs',platform:'browser',target:'es2018',metafile:true,logLevel:'warning'});
  const browserRefs={};
  for(const item of rawBefore.filter(x=>x.path.startsWith('src/')&&x.path.endsWith('.js'))){
    const text=fs.readFileSync(path.join(raw,item.path),'utf8');
    const hits=['document','window','localStorage','AudioContext','OfflineAudioContext','navigator','fetch','requestAnimationFrame','getComputedStyle','DOMParser'].filter(k=>new RegExp('\\b'+k+'\\b').test(text));
    if(hits.length)browserRefs[item.path]=hits;
  }
  assertSnapshot(path.join(project,'data'),snapshot(path.join(raw,'data')),'Packaged maps');
  assertSnapshot(raw,rawBefore,'Raw export');
  const manifest=snapshot(project);
  const bytes=manifest.reduce((n,x)=>n+fs.statSync(path.join(project,x.path)).size,0);
  if(bytes>4*1024*1024)throw Error('Bootstrap main package exceeds 4 MiB planning budget: '+bytes);
  writeJson(path.join(work,'build-info.json'),{kind:renderMode?'wechat-render-not-release':'wechat-bootstrap-not-release',...spec,...(renderMode?{adapterVersion:'0.2.0-render'}:{}),framework,sourceTreeSha256:imported.sourceTreeSha256,rawFilesSha256:imported.sourceFilesSha256,projectFiles:manifest,projectFilesSha256:digestManifest(manifest),bytes,offscreenTransformed:[...transformed].sort(),engineInputs:Object.keys(result.metafile.inputs).length,fullMainGraphInputs:Object.keys(full.metafile.inputs).length,browserRefs,deviceEvidence:'not-run',releaseReady:false});
  console.log('Built '+project+' ('+bytes+' bytes); full main graph compiled but not executed.');
}finally{
  assertSnapshot(source,before,'Upstream source');
  if(git(checkout,'status','--porcelain','--untracked-files=all','--','docs/'+spec.game))throw Error('Source became dirty');
}
